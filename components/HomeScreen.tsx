import React, { useState, useEffect, useCallback } from 'react';
import Spinner from './Spinner';
import Icon from './Icon';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { transcribeAudio } from '../services/geminiService';
import SavedStoriesModal from './SavedStoriesModal';
import type { Story } from '../types';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { getSavedStories, deleteStory } from '../services/firestoreService';
import type { User } from 'firebase/auth';
import { loginWithGoogle, logout } from '../services/authService';
import * as Tone from 'tone';

type HomeScreenProps = {
  onCreateStory: (topic: string) => void;
  onLoadStory: (story: Story) => void;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  voice: string;
  onVoiceChange: (voice: 'Leda' | 'Orus') => void;
  user: User | null;
};

const HomeScreen: React.FC<HomeScreenProps> = ({ user, onCreateStory, onLoadStory, isLoading, loadingMessage, error, voice, onVoiceChange }) => {
  const { recorderState, startRecording, stopRecording, permissionError } = useAudioRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isStoriesModalVisible, setStoriesModalVisible] = useState(false);
  const [savedStories, setSavedStories] = useState<Story[]>([]);
  const { speak, isLoading: isSpeakingLoading } = useTextToSpeech();
  const [instructionAudio, setInstructionAudio] = useState<HTMLAudioElement | null>(null);

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

  const handleReadInstructions = useCallback(async () => {
    if (instructionAudio) {
      instructionAudio.play();
    } else {
      const audio = await speak(instructionsText, undefined, voice, false, true);
      if (audio && audio.audioContent) {
        const audioBlob = new Blob([base64ToArrayBuffer(audio.audioContent)], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setInstructionAudio(new Audio(audioUrl));
      }
    }
  }, [instructionAudio, instructionsText, speak, voice]);

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
                    onCreateStory(transcription);
                }
            } catch (e) {
                console.error("Transcription failed", e);
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

  const base64ToArrayBuffer = (base64: string) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  if (isLoading || isTranscribing) {
    return <Spinner message={isTranscribing ? "Thinking about your topic..." : (loadingMessage || "Loading...")} />;
  }
  
  const isListening = recorderState.status === 'recording';

  return (
    <div className="flex flex-col items-center justify-center text-center p-6 rounded-3xl bg-white shadow-lg animate-fade-in">
      {isStoriesModalVisible && (
        <SavedStoriesModal
          savedStories={savedStories}
          onLoadStory={onLoadStory}
          onDeleteStory={handleDeleteStory}
          onClose={() => setStoriesModalVisible(false)}
          voice={voice}
        />
      )}
      {/* Restored the title for the home screen */}
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
                onClick={() => onVoiceChange('Leda')}
                className={`text-5xl p-3 rounded-full transition-all ${voice === 'Leda' ? 'bg-blue-200 ring-4 ring-blue-400' : 'hover:bg-slate-200'}`}
                aria-label="Select female voice"
            >
                <span>👩🏻</span>
            </button>
            <button
                onClick={() => onVoiceChange('Orus')}
                className={`text-5xl p-3 rounded-full transition-all ${voice === 'Orus' ? 'bg-blue-200 ring-4 ring-blue-400' : 'hover:bg-slate-200'}`}
                aria-label="Select male voice"
            >
                <span>👨🏽‍🦱</span>
            </button>
        </div>
      </div>

      <div className="mb-10 space-y-4">
        <h2 className="text-3xl font-bold text-slate-800">What story should we read today?</h2>
        <div className="flex items-center justify-center gap-2">
          <p
            className="text-lg text-slate-500"
            dangerouslySetInnerHTML={{ __html: isListening ? 'Now press the <span class="font-semibold text-red-600">checkmark</span> when you\'re done speaking!' : instructionsHtml }}
          />
          {!isListening && (
            <button onClick={handleReadInstructions} disabled={isSpeakingLoading} className="p-2 rounded-full hover:bg-slate-200 transition">
              <Icon name="microphone" className="w-6 h-6 text-blue-500" />
            </button>
          )}
        </div>
      </div>

      <button
        onClick={handleMicClick}
        disabled={permissionError}
        className={`flex items-center justify-center w-40 h-40 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300
                    ${isListening 
                      ? 'bg-red-500 text-white animate-pulse-strong shadow-2xl' 
                      : 'bg-blue-500 hover:bg-blue-600 text-white shadow-xl'}`}
      >
        <Icon name={isListening ? "check" : "microphone"} className="w-20 h-20" />
      </button>
      
      {/* Correct Login/Logout button section for HomeScreen */}
      <div className="mt-8 flex gap-4">
        {!user ? (
          <button onClick={loginWithGoogle} className="px-6 py-3 bg-blue-500 text-white rounded-full font-bold text-lg hover:bg-blue-600 transition-transform hover:scale-105 shadow-lg">
            Login with Google
          </button>
        ) : (
          <>
            <button onClick={() => setStoriesModalVisible(true)} className="px-6 py-3 bg-purple-500 text-white rounded-full font-bold text-lg hover:bg-purple-600 transition-transform hover:scale-105 shadow-lg">
              My Stories
            </button>
            <button onClick={logout} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-full font-bold text-lg hover:bg-slate-300 transition-transform hover:scale-105 shadow-lg">
              Logout
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
  );
};

export default HomeScreen;