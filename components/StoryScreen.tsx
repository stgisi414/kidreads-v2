import React, { useState, useEffect, useCallback } from 'react';
import type { Story } from '../types';
import { ReadingMode } from '../types';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import Icon from './Icon';
import { getPhonemesForWord } from '../services/geminiService';

type StoryScreenProps = {
  story: Story;
  onGoHome: () => void;
};

type Feedback = 'correct' | 'incorrect' | null;

// Helper to normalize text for comparison
const normalizeText = (text: string) => {
    return text.trim().toLowerCase().replace(/[.,!?;:"']/g, '');
};

const StoryScreen: React.FC<StoryScreenProps> = ({ story, onGoHome }) => {
  const [readingMode, setReadingMode] = useState<ReadingMode>(ReadingMode.SENTENCE);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState(-1);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isReading, setIsReading] = useState(false);
  const [phonemeData, setPhonemeData] = useState<{word: string, phonemes: string[]}|null>(null);
  const [isLoadingPhonemes, setIsLoadingPhonemes] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const { speak, cancel, isSpeaking } = useTextToSpeech();
  
  const handleSpeechResult = useCallback((transcript: string) => {
    let expectedText = '';
    if (readingMode === ReadingMode.WORD) {
        expectedText = story.words[currentWordIndex];
    } else if (readingMode === ReadingMode.SENTENCE) {
        expectedText = story.sentences[currentSentenceIndex];
    }

    if (normalizeText(transcript) === normalizeText(expectedText)) {
        setFeedback('correct');
        setTimeout(() => {
            setFeedback(null);
            if(readingMode === ReadingMode.WORD) {
                if(currentWordIndex < story.words.length -1) {
                    setCurrentWordIndex(prev => prev + 1);
                } else {
                    setIsReading(false); // Story finished
                }
            } else {
                 if(currentSentenceIndex < story.sentences.length -1) {
                    setCurrentSentenceIndex(prev => prev + 1);
                } else {
                    setIsReading(false); // Story finished
                }
            }
        }, 1500);
    } else {
        setFeedback('incorrect');
        setTimeout(() => setFeedback(null), 2000);
    }
  }, [readingMode, currentWordIndex, currentSentenceIndex, story.words, story.sentences]);

  const { isListening, startListening, hasRecognitionSupport, error: speechError } = useSpeechRecognition(handleSpeechResult);

  const readAloud = useCallback(() => {
    setHighlightedWordIndex(-1);
    
    if (readingMode === ReadingMode.WORD) {
      const word = story.words[currentWordIndex];
      speak(word, () => hasRecognitionSupport && startListening());
    } else if (readingMode === ReadingMode.SENTENCE) {
      const sentence = story.sentences[currentSentenceIndex];
      
      const onBoundary = (e: SpeechSynthesisEvent) => {
          if (e.name === 'word') {
            // Find the word index based on character index
            const wordsInSentence = sentence.split(/\s+/);
            let charCount = 0;
            for(let i = 0; i < wordsInSentence.length; i++) {
                charCount += wordsInSentence[i].length + 1; // +1 for space
                if (e.charIndex < charCount) {
                    setHighlightedWordIndex(i);
                    return;
                }
            }
          }
      };
      speak(sentence, () => {
        setHighlightedWordIndex(-1);
        hasRecognitionSupport && startListening();
      }, onBoundary);
    }
  }, [readingMode, currentWordIndex, currentSentenceIndex, story, speak, startListening, hasRecognitionSupport]);

  useEffect(() => {
    if (isReading) {
      readAloud();
    } else {
      cancel();
    }
  }, [isReading, currentWordIndex, currentSentenceIndex, readingMode, readAloud, cancel]);

  useEffect(() => {
    if (!speechError) return;

    if (speechError === 'no-speech') {
      setFeedback('incorrect'); // Show "Let's try again!"
      setTimeout(() => {
        setFeedback(null);
        // if (isReading) {
        //    readAloud(); // <--- DELETE OR COMMENT OUT THIS LINE
        // }
      }, 2000);
    } else if (speechError === 'not-allowed') {
      setPermissionError("I can't hear you! Please allow microphone access in your browser settings to continue.");
      setIsReading(false);
    } else {
      setFeedback('incorrect');
      setTimeout(() => setFeedback(null), 2000);
    }
  }, [speechError, isReading, readAloud]);

  const handleStartReading = () => {
    setCurrentSentenceIndex(0);
    setCurrentWordIndex(0);
    setHighlightedWordIndex(-1);
    setPermissionError(null);
    setIsReading(true);
  };
  
  const handleModeChange = (mode: ReadingMode) => {
    cancel();
    setIsReading(false);
    setReadingMode(mode);
    setCurrentSentenceIndex(0);
    setCurrentWordIndex(0);
    setHighlightedWordIndex(-1);
    setPhonemeData(null);
  };

  const handleWordClickForPhonemes = async (word: string) => {
    if (readingMode !== ReadingMode.PHONEME || isSpeaking || isLoadingPhonemes) return;
    setIsLoadingPhonemes(true);
    setPhonemeData({word, phonemes: ['...']});
    try {
      const phonemes = await getPhonemesForWord(word);
      setPhonemeData({word, phonemes});
      
      // Speak phonemes sequentially
      let i = 0;
      const speakNextPhoneme = () => {
        if (i < phonemes.length) {
          speak(phonemes[i], () => {
            i++;
            speakNextPhoneme();
          });
        }
      };
      speakNextPhoneme();

    } catch (e) {
      console.error(e);
      setPhonemeData({word, phonemes: ['Error']});
    } finally {
        setIsLoadingPhonemes(false);
    }
  };
  
  const getWordSpans = (sentence: string, sentenceIndex: number) => {
    let globalWordIndex = 0;
    for(let i=0; i<sentenceIndex; i++) {
        globalWordIndex += story.sentences[i].split(/\s+/).filter(w => w).length;
    }

    return sentence.split(/\s+/).map((word, localIndex) => {
        const wordKey = `${sentenceIndex}-${localIndex}`;
        const isCurrentWordInSentenceMode = readingMode === ReadingMode.SENTENCE && sentenceIndex === currentSentenceIndex && localIndex === highlightedWordIndex;
        const isCurrentWordInWordMode = readingMode === ReadingMode.WORD && globalWordIndex + localIndex === currentWordIndex;

        const isHighlighted = isCurrentWordInSentenceMode || isCurrentWordInWordMode;
        
        return (
            <span key={wordKey} 
                  onClick={() => handleWordClickForPhonemes(word)}
                  className={`transition-all duration-200 p-1 rounded-md
                    ${isHighlighted ? 'bg-yellow-300' : 'bg-transparent'}
                    ${readingMode === ReadingMode.PHONEME ? 'hover:bg-blue-200 cursor-pointer' : ''}
                  `}>
                {word}{' '}
            </span>
        );
    });
  };

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in">
        <header className="flex justify-between items-center">
            <h1 className="text-3xl font-black text-blue-600">Here's Your Story!</h1>
            <button onClick={onGoHome} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-transform hover:scale-105 shadow-lg">
                <Icon name="home" className="w-6 h-6" />
                <span>New Story</span>
            </button>
        </header>

        <div className="bg-white p-6 rounded-3xl shadow-xl">
            <img src={story.illustration} alt="Story illustration" className="w-full h-auto max-h-96 object-contain rounded-2xl mb-6"/>
            
            <div className="text-3xl leading-relaxed text-slate-700 space-y-4 mb-8">
              {story.sentences.map((sentence, index) => (
                <p key={index} className={currentSentenceIndex === index && readingMode === ReadingMode.SENTENCE ? 'font-bold' : ''}>
                  {getWordSpans(sentence, index)}
                </p>
              ))}
            </div>

            {permissionError && (
                <div className="my-4 p-4 bg-red-100 rounded-lg text-center text-red-700 font-semibold">
                    {permissionError}
                </div>
            )}
            
            {phonemeData && readingMode === ReadingMode.PHONEME && (
                <div className="my-4 p-4 bg-blue-100 rounded-lg text-center">
                    <p className="text-xl font-bold">{phonemeData.word}</p>
                    <p className="text-3xl font-bold tracking-widest text-blue-700">
                        {phonemeData.phonemes.join(' - ')}
                    </p>
                </div>
            )}
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl">
                <div className="flex gap-2">
                    {Object.values(ReadingMode).map(mode => (
                        <button key={mode} onClick={() => handleModeChange(mode)}
                                className={`px-4 py-2 rounded-full font-semibold transition-all ${readingMode === mode ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'}`}>
                            {mode}
                        </button>
                    ))}
                </div>
                {!isReading && readingMode !== ReadingMode.PHONEME && (
                    <button 
                        onClick={handleStartReading} 
                        disabled={!!permissionError}
                        className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-full font-bold text-xl hover:bg-green-600 transition-transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none">
                        <Icon name="play" className="w-6 h-6" />
                        <span>Start Reading</span>
                    </button>
                )}
            </div>
            
            { isReading &&
                <div className="mt-6 p-4 rounded-2xl bg-amber-100 text-center transition-opacity duration-300">
                    {isListening && <p className="text-xl font-semibold text-amber-800 animate-pulse">Your turn! Try to read it.</p>}
                    {isSpeaking && <p className="text-xl font-semibold text-amber-800">Listen carefully...</p>}
                    
                    {feedback === 'correct' && <div className="flex justify-center items-center gap-2 text-green-600 text-2xl font-bold"><Icon name="check" className="w-8 h-8"/> Great Job!</div>}
                    {feedback === 'incorrect' && <div className="flex justify-center items-center gap-2 text-red-600 text-2xl font-bold"><Icon name="retry" className="w-8 h-8"/>Let's try again!</div>}
                </div>
            }
        </div>
    </div>
  );
};

export default StoryScreen;