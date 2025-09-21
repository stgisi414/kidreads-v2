
import React, { useCallback, useState } from 'react';
import Spinner from './Spinner';
import Icon from './Icon';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

type HomeScreenProps = {
  onCreateStory: (topic: string) => void;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
};

const HomeScreen: React.FC<HomeScreenProps> = ({ onCreateStory, isLoading, loadingMessage, error }) => {
  const [userPrompt, setUserPrompt] = useState('');

  const handleSpeechResult = useCallback((transcript: string) => {
    if (transcript) {
      setUserPrompt(transcript);
      onCreateStory(transcript);
    }
  }, [onCreateStory]);

  const { isListening, startListening, hasRecognitionSupport } = useSpeechRecognition(handleSpeechResult);

  const handleMicClick = () => {
    if (hasRecognitionSupport) {
      startListening();
    } else {
      alert("Sorry, your browser doesn't support speech recognition.");
    }
  };

  if (isLoading) {
    return <Spinner message={loadingMessage || "Loading..."} />;
  }

  return (
    <div className="flex flex-col items-center justify-center text-center p-6 rounded-3xl bg-white shadow-lg animate-fade-in">
      <h1 className="text-6xl font-black text-blue-600 mb-2">KidReads</h1>
      <p className="text-2xl text-slate-600 mb-10">Your AI Reading Buddy!</p>
      
      <div className="mb-10 space-y-4">
        <h2 className="text-3xl font-bold text-slate-800">What story should we read today?</h2>
        <p className="text-lg text-slate-500">
          Press the button and say something like <br />
          <span className="font-semibold text-amber-600">"a happy little dog"</span> or <span className="font-semibold text-emerald-600">"a cat flying to the moon"</span>.
        </p>
      </div>

      <button
        onClick={handleMicClick}
        disabled={isListening}
        className={`relative flex items-center justify-center w-40 h-40 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300
                    ${isListening 
                      ? 'bg-red-500 text-white animate-pulse-strong shadow-2xl' 
                      : 'bg-blue-500 hover:bg-blue-600 text-white shadow-xl'}`}
      >
        <Icon name="microphone" className="w-20 h-20" />
        {isListening && (
            <span className="absolute -bottom-8 text-lg font-semibold text-red-600">Listening...</span>
        )}
      </button>

      {error && (
        <p className="mt-8 text-lg font-semibold text-red-500 bg-red-100 p-4 rounded-lg">{error}</p>
      )}
    </div>
  );
};

export default HomeScreen;
