import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Story, QuizResult } from '../types';
import { ReadingMode } from '../types';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import Icon from './Icon';
import { getPhonemesForWord, transcribeAudio, getTimedTranscript, checkWordMatch } from '../services/geminiService';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import QuizModal from './QuizModal';
import { saveStory, updateStory } from '../services/firestoreService';
import type { User } from 'firebase/auth';

type StoryScreenProps = {
  user: User | null;
  story: Story;
  onGoHome: () => void;
  voice: string;
  isInitiallySaved: boolean;
};

type Feedback = 'correct' | 'incorrect' | null;
type FlowState = 'INITIAL' | 'IDLE' | 'SPEAKING' | 'LISTENING' | 'TRANSCRIBING' | 'EVALUATING' | 'FINISHED';

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

const StoryScreen: React.FC<StoryScreenProps> = ({ story, user, onGoHome, voice, isInitiallySaved }) => {
  const [readingMode, setReadingMode] = useState<ReadingMode>(ReadingMode.SENTENCE);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [phonemeData, setPhonemeData] = useState<{word: string, phonemes: string[]}|null>(null);
  const [isLoadingPhonemes, setIsLoadingPhonemes] = useState(false);
  const [isQuizVisible, setIsQuizVisible] = useState(false);
  const [isStorySaved, setIsStorySaved] = useState(isInitiallySaved);
  const [flowState, setFlowState] = useState<FlowState>('INITIAL');
  const [currentStory, setCurrentStory] = useState<Story>(story);
  const [incorrectAttempts, setIncorrectAttempts] = useState(0);

  const [isReadingFullStory, setIsReadingFullStory] = useState(false);
  const [fullStoryHighlightIndex, setFullStoryHighlightIndex] = useState(-1);
  const [preReadState, setPreReadState] = useState<any>(null);
  const fullStoryTimeoutRef = useRef<NodeJS.Timeout[]>([]);

  const { speak, cancel, isSpeaking } = useTextToSpeech();
  const { recorderState, startRecording, stopRecording, permissionError } = useAudioRecorder();

  const wordToSentenceMap = useMemo(() => {
    const map: number[] = [];
    story.sentences.forEach((sentence, sentenceIndex) => {
        const words = sentence.split(/\s+/).filter(Boolean);
        words.forEach(() => map.push(sentenceIndex));
    });
    return map;
  }, [story.sentences]);

  const handleSaveStory = () => {
    if (isStorySaved || !user) return;
    saveStory(user.uid, story).then(() => {
      setIsStorySaved(true);
    });
  };

  useEffect(() => {
    if (flowState === 'FINISHED') {
      speak("You finished the story! Great job!", () => {
        setFlowState('INITIAL');
        setCurrentSentenceIndex(0);
        setCurrentWordIndex(0);
      }, false, voice);
    }
  }, [flowState, speak, voice]);

  const readAloud = useCallback(() => {
    let textToRead = '';
    let isWord = false;
    if (readingMode === ReadingMode.WORD) {
      textToRead = story.words[currentWordIndex];
      isWord = true;
    } else if (readingMode === ReadingMode.SENTENCE) {
      textToRead = story.sentences[currentSentenceIndex];
    }
    
    console.log(textToRead);
    setFlowState('SPEAKING');
    try {
      speak(textToRead, () => {
          startRecording();
          setFlowState('LISTENING');
      }, false, voice);
    } catch (error) {
      console.error("TTS failed, attempting to continue:", error);
      setFlowState('IDLE');
    }

  }, [readingMode, currentSentenceIndex, currentWordIndex, story, speak, startRecording, voice]);

  const handleUserSpeechEnd = useCallback(async () => {
    if (recorderState.status !== 'recording') return;
    
    setFlowState('TRANSCRIBING');
    const audioBase64 = await stopRecording();
    
    if (audioBase64) {
      try {
        let isMatch = false;

        // Use local similarity check for sentences
        if (readingMode === ReadingMode.SENTENCE) {
            const { transcription } = await transcribeAudio(audioBase64);
            const expectedText = story.sentences[currentSentenceIndex];
            const similarity = calculateSimilarity(normalizeText(transcription || ""), normalizeText(expectedText));
            isMatch = similarity >= 65;
        } else { // Use cloud function for smarter, phonetic word check
            const { transcription } = await transcribeAudio(audioBase64);
            if (!transcription) {
              throw new Error("Transcription resulted in empty text.");
            }
            const expectedWord = story.words[currentWordIndex];
            const { isMatch: wordIsMatch } = await checkWordMatch(transcription, expectedWord);
            isMatch = wordIsMatch;
        }
        
        setFlowState('EVALUATING');
        if (isMatch) {
            setFeedback('correct');
            setIncorrectAttempts(0); // Reset on correct answer
            try {
              speak("Great Job!", () => {
                  setFeedback(null);
                  if (readingMode === ReadingMode.WORD) {
                      if (currentWordIndex < story.words.length - 1) {
                          setCurrentWordIndex(prev => prev + 1);
                          setFlowState('IDLE');
                      } else {
                          setFlowState('FINISHED');
                      }
                  } else { // SENTENCE mode
                       if (currentSentenceIndex < story.sentences.length - 1) {
                           setCurrentSentenceIndex(prev => prev + 1);
                           setFlowState('IDLE');
                       } else {
                           setFlowState('FINISHED');
                       }
                  }
              }, false, voice);
            } catch (error) {
              console.error("TTS failed, attempting to continue:", error);
              setFlowState('IDLE');
            }
        } else {
            const newAttemptCount = incorrectAttempts + 1;
            setIncorrectAttempts(newAttemptCount);
            setFeedback('incorrect');

            if (newAttemptCount >= 3 && readingMode === ReadingMode.WORD) { // Only skip for word mode
                speak("That was a tricky one, let's move to the next word.", () => {
                    setFeedback(null);
                    setIncorrectAttempts(0); // Reset for the next word
                    if (currentWordIndex < story.words.length - 1) {
                        setCurrentWordIndex(prev => prev + 1);
                    } else {
                        setFlowState('FINISHED');
                    }
                    setFlowState('IDLE');
                }, false, voice);
            } else {
                speak("Let's try again!", () => {
                  setFeedback(null);
                  setFlowState('IDLE');
                }, false, voice);
            }
        }
      } catch (e) {
        console.error("Word/Sentence matching failed", e);
        setFlowState('EVALUATING');
        setFeedback('incorrect');
        speak("Let's try again!", () => {
            setFeedback(null);
            setFlowState('IDLE');
        }, false, voice);
      }
    } else {
       setFlowState('IDLE');
    }
  }, [recorderState, stopRecording, readingMode, currentSentenceIndex, currentWordIndex, story, voice, speak, incorrectAttempts]);

  useEffect(() => {
    if (flowState === 'IDLE' && (readingMode === ReadingMode.WORD || readingMode === ReadingMode.SENTENCE)) {
        readAloud();
    }
  }, [flowState, readingMode, currentWordIndex, currentSentenceIndex, readAloud]);

  const handleStartReading = () => {
    setCurrentSentenceIndex(0);
    setCurrentWordIndex(0);
    setFlowState('IDLE');
  };
  
  const handleModeChange = (mode: ReadingMode) => {
    cancel();
    if (mode === ReadingMode.QUIZ) {
        setIsQuizVisible(true);
    } else {
        setIsQuizVisible(false);
    }
    setFlowState('INITIAL');
    setReadingMode(mode);
    setCurrentSentenceIndex(0);
    setCurrentWordIndex(0);
    setPhonemeData(null);
  };

  const handleReadFullStory = useCallback(async () => {
    fullStoryTimeoutRef.current.forEach(clearTimeout);
    fullStoryTimeoutRef.current = [];
    cancel();

    setPreReadState({ flowState, currentSentenceIndex, currentWordIndex });
    setFlowState('SPEAKING');
    setIsReadingFullStory(true);
    setFullStoryHighlightIndex(0);

    const onEnd = () => {
        setIsReadingFullStory(false);
        setFullStoryHighlightIndex(-1);
        setFlowState('INITIAL'); 
    };

    const { duration, audioContent, play } = await speak(story.text, onEnd, voice, false, false);

    const fallbackToEstimation = () => {
        if (play) play(); // Start playback for fallback
        if (readingMode === ReadingMode.SENTENCE) {
            const sentences = story.sentences;
            let cumulativeDelay = 0;
            for (let i = 0; i < sentences.length; i++) {
                const sentenceDuration = (sentences[i].length / story.text.length) * duration * 1000;
                const timeout = setTimeout(() => setFullStoryHighlightIndex(i), cumulativeDelay);
                fullStoryTimeoutRef.current.push(timeout);
                cumulativeDelay += sentenceDuration;
            }
        } else {
            const words = story.words;
            const timePerWord = (duration * 1000) / words.length;
            for (let i = 0; i < words.length; i++) {
                const timeout = setTimeout(() => setFullStoryHighlightIndex(i), i * timePerWord);
                fullStoryTimeoutRef.current.push(timeout);
            }
        }
    };

    if (duration > 0 && audioContent) {
        try {
            const { transcript } = await getTimedTranscript(audioContent, story.text);
            if (play) play(); // Start playback

            if (transcript && Array.isArray(transcript)) {
                let searchFromIndex = 0;
                transcript.forEach(item => {
                    const { word, startTime } = item;
                    const startTimeMs = parseFloat(startTime) * 1000;
                    const wordIndex = story.words.findIndex(
                        (storyWord, index) => index >= searchFromIndex && normalizeText(storyWord) === normalizeText(word)
                    );
                    if (wordIndex !== -1) {
                        const timeout = setTimeout(() => {
                            if (readingMode === ReadingMode.SENTENCE) {
                                setFullStoryHighlightIndex(wordToSentenceMap[wordIndex]);
                            } else {
                                setFullStoryHighlightIndex(wordIndex);
                            }
                        }, startTimeMs);
                        fullStoryTimeoutRef.current.push(timeout);
                        searchFromIndex = wordIndex + 1;
                    }
                });
            } else {
                fallbackToEstimation();
            }
        } catch (error) {
            console.error("Error getting timed transcript, falling back to estimation:", error);
            fallbackToEstimation();
        }
    }
}, [story, readingMode, voice, cancel, flowState, currentSentenceIndex, currentWordIndex, speak, wordToSentenceMap]);
  
  const getWordSpans = (sentence: string, sentenceIndex: number) => {
    let globalWordIndexOffset = 0;
    for(let i=0; i<sentenceIndex; i++) {
        globalWordIndexOffset += story.sentences[i].split(/\s+/).filter(w => w).length;
    }
    
    return sentence.split(/\s+/).map((word, localIndex) => {
        const globalWordIndex = globalWordIndexOffset + localIndex;
        const isCurrentWord = readingMode === ReadingMode.WORD && !isReadingFullStory && (globalWordIndex === currentWordIndex);
        const isHighlightedForFullStory = isReadingFullStory && (readingMode === ReadingMode.WORD || readingMode === ReadingMode.PHONEME) && globalWordIndex === fullStoryHighlightIndex;

        return (
            <span key={`${sentenceIndex}-${localIndex}`} 
                  onClick={() => handleWordClickForPhonemes(word)}
                  className={`transition-all duration-200 p-1 rounded-md
                    ${isCurrentWord || isHighlightedForFullStory ? 'bg-yellow-300' : ''}
                    ${readingMode === ReadingMode.PHONEME ? 'hover:bg-blue-200 cursor-pointer' : ''}
                  `}>
                {word}{' '}
            </span>
        );
    });
  };

  const handleWordClickForPhonemes = async (word: string) => {
      if (readingMode !== ReadingMode.PHONEME || isSpeaking || isLoadingPhonemes) return;

      cancel();
      setIsLoadingPhonemes(true);
      setPhonemeData({ word, phonemes: ['...'] }); // Show loading state

      try {
          const phonemes = await getPhonemesForWord(word);
          setPhonemeData({ word, phonemes });

          // Just speak the word at normal speed.
          speak(word, undefined, voice, true);

      } catch (e) {
          console.error("Error in handleWordClickForPhonemes:", e);
          setPhonemeData({ word, phonemes: ['Error'] });
      } finally {
          setIsLoadingPhonemes(false);
      }
  };


  const handleQuizComplete = useCallback((results: Omit<QuizResult, 'date'>) => {
    if(!user) return;
    const newQuizResults: QuizResult = {
      ...results,
      date: new Date().toISOString(),
    };
    
    const updatedStory = { ...story, quizResults: newQuizResults };
    updateStory(user.uid, updatedStory);
  }, [story, user]);

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in">
        {isQuizVisible && <QuizModal questions={story.quiz} onClose={() => setIsQuizVisible(false)} onQuizComplete={handleQuizComplete} voice={voice} isSpeaking={isSpeaking} />}
        <div className="bg-white p-6 rounded-3xl shadow-xl">
            <h2 
              className={`text-4xl font-black text-center text-blue-600 mb-4 ${isSpeaking ? 'cursor-not-allowed' : 'cursor-pointer'}`} 
              onClick={() => !isSpeaking && speak(story.title, undefined, false, voice)}
            >
              {story.title}
            </h2>
            <img src={story.illustration} alt="Story illustration" className="w-full h-auto max-h-96 object-contain rounded-2xl mb-6"/>
            
            <div className="text-3xl leading-relaxed text-slate-700 space-y-4 mb-8">
                {story.sentences.map((sentence, index) => (
                  <p key={index} className={`p-1 rounded-md transition-all duration-200 ${(currentSentenceIndex === index && readingMode === ReadingMode.SENTENCE && !isReadingFullStory) || (isReadingFullStory && readingMode === ReadingMode.SENTENCE && fullStoryHighlightIndex === index) ? 'font-bold bg-yellow-200' : ''}`}>
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
              <div className="flex flex-wrap justify-center gap-2">
                  {Object.values(ReadingMode).map(mode => (
                      <button key={mode} onClick={() => handleModeChange(mode)}
                              className={`px-4 py-2 rounded-full font-semibold transition-all ${readingMode === mode ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'}`}>
                        {mode}
                    </button>
                ))}

                {readingMode !== ReadingMode.PHONEME && (
                  <button onClick={handleReadFullStory}
                          disabled={isSpeaking}
                          className="px-4 py-2 rounded-full font-semibold transition-all bg-purple-500 text-white hover:bg-purple-600 disabled:bg-gray-400">
                    Read Full Story
                  </button>
                )}
            </div>

              <button onClick={handleSaveStory} disabled={isStorySaved || !user} className="px-6 py-3 bg-green-500 text-white rounded-full font-bold text-lg hover:bg-green-600 transition-transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed">
                  {isStorySaved ? 'Saved!' : (user ? 'Save Story' : 'Login to Save')}
              </button>

              {(flowState === 'INITIAL' || flowState === 'FINISHED') && readingMode !== ReadingMode.PHONEME && readingMode !== ReadingMode.QUIZ && (
                  <button 
                      onClick={handleStartReading} 
                      disabled={permissionError}
                      className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-full font-bold text-xl hover:bg-green-600 transition-transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none">
                      <Icon name="play" className="w-6 h-6" />
                      <span>{flowState === 'FINISHED' ? 'Read Again' : 'Start Reading'}</span>
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
          
          {flowState === 'FINISHED' && (
            <div className="mt-6 p-4 rounded-2xl bg-green-100 text-center transition-opacity duration-300">
                <div className="flex justify-center items-center gap-2 text-green-700 text-2xl font-bold"><Icon name="star" className="w-8 h-8"/> You finished the story! Great job!</div>
            </div>
          )}

          { (flowState !== 'IDLE' && flowState !== 'INITIAL' && flowState !== 'FINISHED') &&
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