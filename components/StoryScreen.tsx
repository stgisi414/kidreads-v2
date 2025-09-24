import React, { useState, useEffect, useCallback } from 'react';
import type { Story } from '../types';
import { ReadingMode } from '../types';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import Icon from './Icon';
import { getPhonemesForWord, transcribeAudio } from '../services/geminiService';

type StoryScreenProps = {
  story: Story;
  onGoHome: () => void;
};

type Feedback = 'correct' | 'incorrect' | null;

const normalizeText = (text: string) => {
    return text.trim().toLowerCase().replace(/[.,!?;:"']/g, '');
};

const StoryScreen: React.FC<StoryScreenProps> = ({ story, onGoHome }) => {
  const [readingMode, setReadingMode] = useState<ReadingMode>(ReadingMode.SENTENCE);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isReading, setIsReading] = useState(false);
  const [phonemeData, setPhonemeData] = useState<{word: string, phonemes: string[]}|null>(null);
  const [isLoadingPhonemes, setIsLoadingPhonemes] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const { speak, cancel, isSpeaking, isLoading: isTTSLoading } = useTextToSpeech();
  const { recorderState, startRecording, stopRecording, permissionError } = useAudioRecorder();

  const readAloud = useCallback(() => {
    let textToRead = '';
    if (readingMode === ReadingMode.WORD) {
      textToRead = story.words[currentWordIndex];
    } else if (readingMode === ReadingMode.SENTENCE) {
      textToRead = story.sentences[currentSentenceIndex];
    }
    
    speak(textToRead, () => {
        startRecording();
    });

  }, [readingMode, currentWordIndex, currentSentenceIndex, story, speak, startRecording]);

  const handleTranscriptionResult = useCallback((transcript: string) => {
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
                if(currentWordIndex < story.words.length - 1) {
                    setCurrentWordIndex(prev => prev + 1);
                } else {
                    setIsReading(false);
                }
            } else {
                 if(currentSentenceIndex < story.sentences.length - 1) {
                    setCurrentSentenceIndex(prev => prev + 1);
                } else {
                    setIsReading(false);
                }
            }
        }, 1500);
    } else {
        setFeedback('incorrect');
        setTimeout(() => {
          setFeedback(null);
          if (isReading) readAloud();
        }, 2000);
    }
  }, [readingMode, currentWordIndex, currentSentenceIndex, story.words, story.sentences, isReading, readAloud]);

  const handleUserSpeechEnd = async () => {
      if (recorderState === 'recording') {
          setIsTranscribing(true);
          const audioBase64 = await stopRecording();
          try {
              if (audioBase64) {
                const { transcription } = await transcribeAudio(audioBase64);
                handleTranscriptionResult(transcription || "");
              } else {
                handleTranscriptionResult(""); // Handle empty audio
              }
          } catch (e) {
              console.error("Transcription failed", e);
              setFeedback('incorrect');
              setTimeout(() => {
                  setFeedback(null);
                  if (isReading) readAloud();
              }, 2000);
          } finally {
              setIsTranscribing(false);
          }
      }
  };

  useEffect(() => {
    if (isReading) {
      readAloud();
    } else {
      cancel();
    }
  }, [isReading, currentWordIndex, currentSentenceIndex, readingMode]);

  const handleStartReading = () => {
    setCurrentSentenceIndex(0);
    setCurrentWordIndex(0);
    setIsReading(true);
  };
  
  const handleModeChange = (mode: ReadingMode) => {
    cancel();
    setIsReading(false);
    setReadingMode(mode);
    setCurrentSentenceIndex(0);
    setCurrentWordIndex(0);
    setPhonemeData(null);
  };

  const handleWordClickForPhonemes = async (word: string) => {
    if (readingMode !== ReadingMode.PHONEME || isSpeaking || isLoadingPhonemes) return;
    setIsLoadingPhonemes(true);
    setPhonemeData({word, phonemes: ['...']});
    try {
      const phonemes = await getPhonemesForWord(word);
      setPhonemeData({word, phonemes});
      
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
        const isCurrentWord = readingMode === ReadingMode.WORD && (globalWordIndex + localIndex === currentWordIndex);
        
        return (
            <span key={wordKey} 
                  onClick={() => handleWordClickForPhonemes(word)}
                  className={`transition-all duration-200 p-1 rounded-md
                    ${isCurrentWord ? 'bg-yellow-300' : ''}
                    ${readingMode === ReadingMode.PHONEME ? 'hover:bg-blue-200 cursor-pointer' : ''}
                  `}>
                {word}{' '}
            </span>
        );
    });
  };

  const isListening = recorderState === 'recording';

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
                  I can't hear you! Please allow microphone access in your browser settings.
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
              {readingMode !== ReadingMode.PHONEME && !isReading && (
                  <button 
                      onClick={handleStartReading} 
                      disabled={permissionError}
                      className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-full font-bold text-xl hover:bg-green-600 transition-transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none">
                      <Icon name="play" className="w-6 h-6" />
                      <span>Start Reading</span>
                  </button>
              )}
              {isReading && (
                 <button 
                      onClick={handleUserSpeechEnd} 
                      disabled={!isListening || isTranscribing}
                      className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-xl transition-transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none bg-red-500 text-white">
                      <Icon name="check" className="w-6 h-6" />
                      <span>I'm Done Reading</span>
                  </button>
              )}
          </div>
          
          { (isReading || isTranscribing) &&
              <div className="mt-6 p-4 rounded-2xl bg-amber-100 text-center transition-opacity duration-300">
                  {isListening && <p className="text-xl font-semibold text-amber-800 animate-pulse">Your turn! Read the text and press "I'm Done".</p>}
                  {(isSpeaking || isTTSLoading) && <p className="text-xl font-semibold text-amber-800">Listen carefully...</p>}
                  {isTranscribing && <p className="text-xl font-semibold text-amber-800">Checking your reading...</p>}
                  
                  {feedback === 'correct' && <div className="flex justify-center items-center gap-2 text-green-600 text-2xl font-bold"><Icon name="check" className="w-8 h-8"/> Great Job!</div>}
                  {feedback === 'incorrect' && <div className="flex justify-center items-center gap-2 text-red-600 text-2xl font-bold"><Icon name="retry" className="w-8 h-8"/>Let's try again!</div>}
              </div>
          }
      </div>
    </div>
  );
};

export default StoryScreen;