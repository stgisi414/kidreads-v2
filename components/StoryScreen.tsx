import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Story } from '../types';
import { ReadingMode } from '../types';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import Icon from './Icon';
import { getPhonemesForWord, transcribeAudio } from '../services/geminiService';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

type StoryScreenProps = {
  story: Story;
  onGoHome: () => void;
};

type Feedback = 'correct' | 'incorrect' | null;
type FlowState = 'IDLE' | 'SPEAKING' | 'LISTENING' | 'TRANSCRIBING' | 'EVALUATING';

const normalizeText = (text: string) => {
    return text.trim().toLowerCase().replace(/[.,!?;:"']/g, '');
};

const levenshteinDistance = (a: string, b: string): number => {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i; }
  for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j; }
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator,
      );
    }
  }
  return matrix[b.length][a.length];
};

const calculateSimilarity = (str1: string, str2: string) => {
    const distance = levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 100;
    const similarity = (1 - distance / maxLength) * 100;
    return similarity;
};

const StoryScreen: React.FC<StoryScreenProps> = ({ story, onGoHome }) => {
  const [readingMode, setReadingMode] = useState<ReadingMode>(ReadingMode.SENTENCE);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [phonemeData, setPhonemeData] = useState<{word: string, phonemes: string[]}|null>(null);
  const [isLoadingPhonemes, setIsLoadingPhonemes] = useState(false);
  
  // **FIX**: Replaced multiple booleans with a single state machine
  const [flowState, setFlowState] = useState<FlowState>('IDLE');

  const { speak, cancel, isSpeaking } = useTextToSpeech();
  const { recorderState, startRecording, stopRecording, permissionError } = useAudioRecorder();

  const readAloud = useCallback(() => {
    if (flowState !== 'IDLE' && flowState !== 'EVALUATING') return;

    let textToRead = '';
    if (readingMode === ReadingMode.WORD) {
      textToRead = story.words[currentWordIndex];
    } else if (readingMode === ReadingMode.SENTENCE) {
      textToRead = story.sentences[currentSentenceIndex];
    }
    
    setFlowState('SPEAKING');
    speak(textToRead, () => {
        startRecording();
        setFlowState('LISTENING');
    });

  }, [readingMode, currentSentenceIndex, currentWordIndex, story, speak, startRecording, flowState]);

  const handleUserSpeechEnd = useCallback(async () => {
    if (recorderState.status !== 'recording') return;
    
    setFlowState('TRANSCRIBING');
    const audioBase64 = await stopRecording();
    
    if (audioBase64) {
      try {
        const { transcription } = await transcribeAudio(audioBase64);
        let expectedText = '';
        if (readingMode === ReadingMode.WORD) {
            expectedText = story.words[currentWordIndex];
        } else if (readingMode === ReadingMode.SENTENCE) {
            expectedText = story.sentences[currentSentenceIndex];
        }
        
        // **FIX**: Lowered similarity threshold to be more forgiving
        const similarity = calculateSimilarity(normalizeText(transcription || ""), normalizeText(expectedText));
        
        setFlowState('EVALUATING');
        if (similarity >= 65) {
            setFeedback('correct');
            setTimeout(() => {
                setFeedback(null);
                if(readingMode === ReadingMode.WORD) {
                    if(currentWordIndex < story.words.length - 1) {
                        setCurrentWordIndex(prev => prev + 1);
                    } else {
                        setFlowState('IDLE');
                    }
                } else {
                     if(currentSentenceIndex < story.sentences.length - 1) {
                        setCurrentSentenceIndex(prev => prev + 1);
                    } else {
                        setFlowState('IDLE');
                    }
                }
            }, 1500);
        } else {
            setFeedback('incorrect');
            setTimeout(() => {
              setFeedback(null);
              setFlowState('IDLE'); // This will re-trigger the readAloud effect
            }, 2000);
        }
      } catch (e) {
        console.error("Transcription failed", e);
        setFlowState('EVALUATING');
        setFeedback('incorrect');
         setTimeout(() => {
              setFeedback(null);
              setFlowState('IDLE');
            }, 2000);
      }
    } else {
       setFlowState('IDLE'); // No audio recorded, try again
    }
  }, [recorderState, stopRecording, readingMode, currentSentenceIndex, currentWordIndex, story]);

  // Main effect to drive the read-aloud loop
  useEffect(() => {
    if (flowState === 'IDLE' && readingMode !== 'Phoneme') {
        readAloud();
    }
  }, [flowState, readingMode, readAloud]);


  const handleStartReading = () => {
    setCurrentSentenceIndex(0);
    setCurrentWordIndex(0);
    setFlowState('IDLE'); // This kicks off the useEffect above
  };
  
  const handleModeChange = (mode: ReadingMode) => {
    cancel();
    setFlowState('IDLE');
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

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in">
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
                    Microphone access is needed. Please allow it in your browser settings.
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
              {flowState === 'IDLE' && readingMode !== ReadingMode.PHONEME && (
                  <button 
                      onClick={handleStartReading} 
                      disabled={permissionError}
                      className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-full font-bold text-xl hover:bg-green-600 transition-transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none">
                      <Icon name="play" className="w-6 h-6" />
                      <span>Start Reading</span>
                  </button>
              )}
               {flowState === 'LISTENING' && (
                 <button 
                      onClick={handleUserSpeechEnd} 
                      className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-xl transition-transform hover:scale-105 shadow-lg bg-red-500 text-white">
                      <Icon name="check" className="w-6 h-6" />
                      <span>I'm Done Reading</span>
                  </button>
              )}
          </div>
          
          { flowState !== 'IDLE' &&
              <div className="mt-6 p-4 rounded-2xl bg-amber-100 text-center transition-opacity duration-300">
                  {flowState === 'LISTENING' && <p className="text-xl font-semibold text-amber-800 animate-pulse">Your turn! Read the text and press "I'm Done".</p>}
                  {flowState === 'SPEAKING' && <p className="text-xl font-semibold text-amber-800">Listen carefully...</p>}
                  {flowState === 'TRANSCRIBING' && <p className="text-xl font-semibold text-amber-800">Checking your reading...</p>}
                  
                  {feedback === 'correct' && <div className="flex justify-center items-center gap-2 text-green-600 text-2xl font-bold"><Icon name="check" className="w-8 h-8"/> Great Job!</div>}
                  {feedback === 'incorrect' && <div className="flex justify-center items-center gap-2 text-red-600 text-2xl font-bold"><Icon name="retry" className="w-8 h-8"/>Let's try again!</div>}
              </div>
          }
      </div>
    </div>
  );
};

export default StoryScreen;