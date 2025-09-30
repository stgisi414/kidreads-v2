import React, { useState, useEffect, useCallback } from 'react';
import Spinner from './Spinner';
import Icon from './Icon';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { transcribeAudio, generateStoryIdeas, generateLocationStoryIdeas } from '../services/geminiService';
import SavedStoriesModal from './SavedStoriesModal';
import type { Story } from '../types';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { getSavedStories, deleteStory } from '../services/firestoreService';
import type { User } from 'firebase/auth';
import { loginWithGoogle, logout } from '../services/authService';
import * as Tone from 'tone';
import ErrorBoundary from './ErrorBoundary';

type HomeScreenProps = {
  onCreateStory: (topic: string, storyLength: number) => void;
  onLoadStory: (story: Story) => void;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  voice: string;
  onVoiceChange: (voice: 'Leda' | 'Orus') => void;
  speakingRate: number;
  onSpeakingRateChange: (rate: number) => void;
  storyLength: number;
  onStoryLengthChange: (length: number) => void;
  user: User | null;
  setError: (error: string | null) => void;
};

const ideaColors = ['text-amber-600', 'text-emerald-600', 'text-sky-600', 'text-rose-600'];
const lengthLabels = ["Short", "Medium", "Long", "Epic"];

const HomeScreen: React.FC<HomeScreenProps> = ({ user, onCreateStory, onLoadStory, isLoading, loadingMessage, error, voice, onVoiceChange, speakingRate, onSpeakingRateChange, storyLength, onStoryLengthChange, setError }) => {
  const { recorderState, startRecording, stopRecording, permissionError } = useAudioRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isStoriesModalVisible, setStoriesModalVisible] = useState(false);
  const [savedStories, setSavedStories] = useState<Story[]>([]);
  const { speak, isSpeaking } = useTextToSpeech();
  const [instructionAudio, setInstructionAudio] = useState<HTMLAudioElement | null>(null);
  const [showBrowserError, setShowBrowserError] = useState(false);
  const [isVoicePreviewing, setIsVoicePreviewing] = useState(false);
  const [storyIdeas, setStoryIdeas] = useState<string[]>([]);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(false);
  const [userLocation, setUserLocation] = useState<GeolocationCoordinates | null>(null);
  const [locationStoryIdeas, setLocationStoryIdeas] = useState<string[]>([]);
  const [isLoadingLocationIdeas, setIsLoadingLocationIdeas] = useState(false);
  const [locationInput, setLocationInput] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);

  const isDisallowedUserAgent = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = userAgent.includes('iphone') || userAgent.includes('ipad');
    const isAndroid = userAgent.includes('android');

    if (isIos) {
        const isNaverIOS = userAgent.includes('naver(inapp;');
        const isGenericIOSWebView = !userAgent.includes('safari') && !userAgent.includes('crios');
        return isNaverIOS || isGenericIOSWebView;
    }
    if (isAndroid) {
        const isNaverAndroid = userAgent.includes('naver');
        const isGenericAndroidWebView = userAgent.includes('wv');
        return isNaverAndroid || isGenericAndroidWebView;
    }
    return false;
  };

  const signIn = async () => {
    if (isDisallowedUserAgent()) {
      setShowBrowserError(true);
      return;
    }
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error("Error during sign in:", error);
      setShowBrowserError(true);
    }
  };

  const instructionsHtml = `Press the <span class="font-semibold text-blue-600">button</span> and say something like <br />
    <span class="font-semibold text-amber-600">"a happy little dog"</span> or <span class="font-semibold text-emerald-600">"a cat flying to the moon"</span>. <br />
    Press the <span class="font-semibold text-red-600">checkmark</span> when you're done!`;
    
  const instructionsText = "Press the button and say something like 'a happy little dog' or 'a cat flying to the moon'. Press the checkmark when you're done!";

  useEffect(() => {
    if (user) {
      getSavedStories(user.uid).then(setSavedStories);
    } else {
      setSavedStories([]);
    }
  }, [user]);

  const handleVoiceSelection = (newVoice: 'Leda' | 'Orus') => {
    if (newVoice === voice || isSpeaking) {
      return;
    }
    onVoiceChange(newVoice);
    setIsVoicePreviewing(true);
    speak(
      "What story should we read today?",
      () => {
        setIsVoicePreviewing(false);
      },
      newVoice,
      false,
      true,
      speakingRate
    );
  };

  const handleSpeedSelection = (newRate: number) => {
    if (newRate === speakingRate || isSpeaking) {
      return;
    }
    onSpeakingRateChange(newRate);
    setIsVoicePreviewing(true);
    speak(
      "What story should we read today?",
      () => {
        setIsVoicePreviewing(false);
      },
      voice,
      false,
      true,
      newRate
    );
  };
  
  const handleReadInstructions = useCallback(async () => {
    if (instructionAudio) {
      instructionAudio.play();
    } else {
      const audio = await speak(instructionsText, undefined, voice, false, true, speakingRate);
      if (audio && audio.audioContent) {
        const audioBlob = new Blob([base64ToArrayBuffer(audio.audioContent)], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setInstructionAudio(new Audio(audioUrl));
      }
    }
  }, [instructionAudio, instructionsText, speak, voice, speakingRate]);


  const handleDeleteStory = (storyId: number) => {
    if (!user) return;
    deleteStory(user.uid, storyId).then(() => {
      setSavedStories(prev => prev.filter(story => story.id !== storyId));
    });
  };
  
  const handleMicClick = async () => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }

    if (recorderState.status === 'recording') {
        setIsTranscribing(true);
        const audioBase64 = await stopRecording();
        if (audioBase64) {
            try {
                const { transcription } = await transcribeAudio(audioBase64);
                if (transcription && transcription.trim()) {
                    onCreateStory(transcription, storyLength);
                } else {
                    setError("I couldn't quite catch that. Please try again.");
                }
            } catch (e: any) {
                console.error("Transcription failed", e);
                if (e.message === "Transcription timed out") {
                    setError("The request took too long. Please check your internet connection and try again.");
                } else if (e.code === 'unavailable' || e.code === 'internal') {
                    setError("There seems to be a network issue. Please check your connection and try again.");
                } else {
                    setError("Sorry, I couldn't understand that. Please try again.");
                }
            } finally {
                setIsTranscribing(false);
            }
        } else {
            setIsTranscribing(false);
        }
    } else {
        await startRecording();
    }
  };

  const handleGenerateIdeas = async () => {
    setIsLoadingIdeas(true);
    try {
        const { ideas } = await generateStoryIdeas();
        setStoryIdeas(ideas);
    } catch (e) {
        console.error("Failed to generate story ideas", e);
        setError("I couldn't think of any ideas right now. Please try again.");
    } finally {
        setIsLoadingIdeas(false);
    }
  };

  const base64ToArrayBuffer = (base64: string) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const anythingLoading = isLoading || isTranscribing || isVoicePreviewing || isLoadingIdeas || isLoadingLocationIdeas;

  if (isLoading || isTranscribing) {
    return <Spinner message={isTranscribing ? "Thinking about your topic..." : (loadingMessage || "Loading...")} />;
  }

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation(position.coords);
          setLocationError(null);
          handleGenerateLocationIdeas(position.coords);
        },
        (error) => {
          console.error("Error getting user location:", error.message);
          setLocationError("Could not get your location. Please ensure location services are enabled.");
        }
      );
    } else {
      setLocationError("Geolocation is not supported by this browser.");
    }
  };
  
  const handleGenerateLocationIdeas = async (coords?: GeolocationCoordinates) => {
      const coordinates = coords || userLocation;
      if (!coordinates) {
        if (locationInput) {
           // User has typed a location manually
           setIsLoadingLocationIdeas(true);
           setLocationStoryIdeas([]);
           setError(null);
           try {
               const { ideas, location } = await generateLocationStoryIdeas(0, 0); // Coords are not used, locationInput is
               setLocationStoryIdeas(ideas);
               setLocationInput(location);
           } catch (e) {
                console.error("Failed to generate location story ideas from input", e);
                setError("I couldn't think of any ideas for that location. Please try another one.");
           } finally {
                setIsLoadingLocationIdeas(false);
           }
           return;
        }
          setError("Could not get your location. Please try again.");
          return;
      }
      setIsLoadingLocationIdeas(true);
      setLocationStoryIdeas([]);
      setError(null);
      try {
          const { ideas, location } = await generateLocationStoryIdeas(coordinates.latitude, coordinates.longitude);
          setLocationStoryIdeas(ideas);
          setLocationInput(location);
      } catch (e) {
          console.error("Failed to generate location story ideas", e);
          setError("I couldn't think of any ideas for that location. Please try another one.");
      } finally {
          setIsLoadingLocationIdeas(false);
      }
  };
  
  const isListening = recorderState.status === 'recording';

  return (
    <>
      <div className="flex flex-col items-center justify-center text-center p-6 rounded-3xl bg-white shadow-lg animate-fade-in">
        {isStoriesModalVisible && (
          <ErrorBoundary>
            <SavedStoriesModal
              savedStories={savedStories}
              onLoadStory={onLoadStory}
              onDeleteStory={handleDeleteStory}
              onClose={() => setStoriesModalVisible(false)}
              voice={voice}
              speakingRate={speakingRate}
              user={user}
            />
          </ErrorBoundary>
        )}
        <h1 className="text-5xl md:text-6xl font-black text-blue-600 mb-2 flex items-center justify-center">
          <video autoPlay loop muted playsInline className="w-16 h-16 md:w-20 md:h-20 mr-2 md:mr-4">
            <source src="/kidreads.mp4" type="video/mp4" />
          </video>
          KidReads
        </h1>
        <p className="text-2xl text-slate-600 mb-6">Your AI Reading Buddy!</p>
        
        <div className="mb-6">
          <h3 className="text-xl font-bold text-slate-700 mb-2">Choose a Voice</h3>
          <div className="flex justify-center gap-4">
              <button 
                  onClick={() => handleVoiceSelection('Leda')}
                  disabled={anythingLoading}
                  className={`text-5xl p-3 rounded-full transition-all ${voice === 'Leda' ? 'bg-blue-200 ring-4 ring-blue-400' : 'hover:bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label="Select female voice"
              >
                  <span>👩🏻</span>
              </button>
              <button
                  onClick={() => handleVoiceSelection('Orus')}
                  disabled={anythingLoading}
                  className={`text-5xl p-3 rounded-full transition-all ${voice === 'Orus' ? 'bg-blue-200 ring-4 ring-blue-400' : 'hover:bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label="Select male voice"
              >
                  <span>👨🏽‍🦱</span>
              </button>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-slate-700 mb-2">Choose a Speed</h3>
          <div className="flex justify-center gap-4">
              <button 
                  onClick={() => handleSpeedSelection(0.55)}
                  disabled={anythingLoading}
                  className={`text-5xl p-3 rounded-full transition-all ${speakingRate === 0.55 ? 'bg-blue-200 ring-4 ring-blue-400' : 'hover:bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label="Select slow speed"
              >
                  <span>🐢</span>
              </button>
              <button
                  onClick={() => handleSpeedSelection(1.0)}
                  disabled={anythingLoading}
                  className={`text-5xl p-3 rounded-full transition-all ${speakingRate === 1.0 ? 'bg-blue-200 ring-4 ring-blue-400' : 'hover:bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label="Select normal speed"
              >
                  <span>🐇</span>
              </button>
          </div>
        </div>
        
        <div className="w-full max-w-sm mb-6">
          <h3 className="text-xl font-bold text-slate-700 mb-2">Story Length: <span className="text-blue-600">{lengthLabels[storyLength]}</span></h3>
          <input
            type="range"
            min="0"
            max="3"
            value={storyLength}
            onChange={(e) => onStoryLengthChange(parseInt(e.target.value))}
            disabled={anythingLoading}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="mb-10 space-y-4">
          <h2 className="text-3xl font-bold text-slate-800">What story should we read today?</h2>
          <div className="flex items-center justify-center gap-2">
            <p
              className="text-lg text-slate-500"
              dangerouslySetInnerHTML={{ __html: isListening ? 'Now press the <span class="font-semibold text-red-600">checkmark</span> when you\'re done speaking!' : instructionsHtml }}
            />
            {!isListening && (
              <button onClick={handleReadInstructions} disabled={anythingLoading} className="p-2 rounded-full hover:bg-slate-200 transition disabled:opacity-50 disabled:cursor-not-allowed">
                <Icon name="speaker" className="w-6 h-6 text-blue-500" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleMicClick}
              disabled={permissionError || anythingLoading}
              className={`flex items-center justify-center w-40 h-40 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300
                          ${isListening
                            ? 'bg-red-500 text-white animate-pulse-strong shadow-2xl'
                            : 'bg-blue-500 hover:bg-blue-600 text-white shadow-xl'}
                            disabled:bg-slate-400 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none`}
            >
              <Icon name={isListening ? "check" : "microphone"} className="w-20 h-20" />
            </button>
            <button onClick={handleGenerateIdeas} disabled={anythingLoading || isLoadingIdeas} className="flex items-center justify-center w-20 h-20 bg-yellow-400 text-white rounded-full hover:bg-yellow-500 transition-transform hover:scale-110 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                <Icon name="idea" className="w-12 h-12" />
            </button>
            {userLocation && (
              <button onClick={handleGenerateLocationIdeas} disabled={anythingLoading || isLoadingLocationIdeas} className="flex items-center justify-center w-16 h-16 bg-teal-400 text-white rounded-full hover:bg-teal-500 transition-transform hover:scale-110 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                  <Icon name="location" className="w-10 h-10" />
              </button>
            )}
        </div>
        {!userLocation && (
          <div className="mt-4">
            <button onClick={handleGetLocation} className="text-blue-600 hover:underline">
              Share your location for local story ideas!
            </button>
          </div>
        )}

        {locationError && (
          <p className="mt-4 text-sm font-semibold text-red-500 bg-red-100 p-2 rounded-lg">{locationError}</p>
        )}
        {isLoadingIdeas && <Spinner message="Thinking of some fun ideas..." />}
        {storyIdeas.length > 0 && (
            <div className="mt-8 w-full max-w-lg">
                <ul className="list-none p-0 m-0">
                    {storyIdeas.map((idea, index) => (
                        <li key={index} className="flex items-center justify-between gap-2 py-2 border-b border-slate-200">
                            <span className={`font-semibold text-lg ${ideaColors[index % ideaColors.length]}`}>{idea}</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => speak(idea, undefined, voice, false, true, speakingRate)} disabled={anythingLoading} className="p-2 rounded-full hover:bg-slate-200 transition disabled:opacity-50">
                                    <Icon name="speaker" className="w-6 h-6 text-blue-500" />
                                </button>
                                <button onClick={() => onCreateStory(idea, storyLength)} disabled={anythingLoading} className="px-4 py-2 bg-blue-500 text-white rounded-full font-bold text-sm hover:bg-blue-600 transition">
                                    Select
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        )}

        {isLoadingLocationIdeas && <Spinner message={`Thinking of stories about ${locationInput}...`} />}
        {locationStoryIdeas.length > 0 && (
            <div className="mt-8 w-full max-w-lg p-4 bg-teal-50 rounded-2xl shadow-inner">
                <h3 className="text-xl font-bold text-teal-700 mb-2">Story ideas about your location!</h3>
                <ul className="list-none p-0 m-0">
                    {locationStoryIdeas.map((idea, index) => (
                        <li key={index} className="flex items-center justify-between gap-2 py-2 border-b border-teal-200">
                            <span className={`font-semibold text-lg ${ideaColors[index % ideaColors.length]}`}>{idea}</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => speak(idea, undefined, voice, false, true, speakingRate)} disabled={anythingLoading} className="p-2 rounded-full hover:bg-teal-100 transition disabled:opacity-50">
                                    <Icon name="speaker" className="w-6 h-6 text-teal-500" />
                                </button>
                                <button onClick={() => onCreateStory(idea, storyLength)} disabled={anythingLoading} className="px-4 py-2 bg-teal-500 text-white rounded-full font-bold text-sm hover:bg-teal-600 transition">
                                    Select
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="mt-4">
                    <input 
                        type="text"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        placeholder="Enter a location"
                        className="w-full p-2 border-2 border-teal-200 rounded-lg"
                    />
                </div>
            </div>
        )}
        
        <div className="mt-8 flex gap-4">
          {!user ? (
            <button onClick={signIn} disabled={anythingLoading} className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-full font-bold text-lg hover:bg-blue-600 transition-transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
              <Icon name="login" className="w-6 h-6" />
              <span>Login with Google</span>
            </button>
          ) : (
            <>
              <button onClick={() => setStoriesModalVisible(true)} disabled={anythingLoading} className="flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-full font-bold text-lg hover:bg-purple-600 transition-transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                <Icon name="stories" className="w-6 h-6" />
                <span>My Stories</span>
              </button>
              <button onClick={logout} disabled={anythingLoading} className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-full font-bold text-lg hover:bg-slate-300 transition-transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                <Icon name="logout" className="w-6 h-6" />
                <span>Logout</span>
              </button>
            </>
          )}
        </div>

        {error && (
          <p className="mt-8 text-lg font-semibold text-red-500 bg-red-100 p-4 rounded-lg">{error}</p>
        )}
         {permissionError && (
          <p className="mt-8 text-lg font-semibold text-red-500 bg-red-100 p-4 rounded-lg">
              Microphone access is needed to hear your story idea. Please allow access.
          </p>
        )}
      </div>

       {showBrowserError && <BrowserErrorModal onClose={() => setShowBrowserError(false)} />}
    </>
  );
};

export default HomeScreen;