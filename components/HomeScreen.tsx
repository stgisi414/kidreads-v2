import React, { useState, useEffect } from 'react'; // **FIX**: Added useEffect import
import Spinner from './Spinner';
import Icon from './Icon';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { transcribeAudio } from '../services/geminiService';

type HomeScreenProps = {
  onCreateStory: (topic: string) => void;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
};

const HomeScreen: React.FC<HomeScreenProps> = ({ onCreateStory, isLoading, loadingMessage, error }) => {
  const { recorderState, startRecording, stopRecording, permissionError } = useAudioRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const handleMicClick = async () => {
    // **FIX**: The logic is now direct. If recording, stop and transcribe. If not, start.
    if (recorderState.status === 'recording') {
        setIsTranscribing(true);
        const audioBase64 = await stopRecording();
        if (audioBase64) {
            try {
                const { transcription } = await transcribeAudio(audioBase64);
                if (transcription) {
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

  if (isLoading || isTranscribing) {
    return <Spinner message={isTranscribing ? "Thinking about your topic..." : (loadingMessage || "Loading...")} />;
  }
  
  const isListening = recorderState.status === 'recording';

  return (
    <div className="flex flex-col items-center justify-center text-center p-6 rounded-3xl bg-white shadow-lg animate-fade-in">
      <h1 className="text-6xl font-black text-blue-600 mb-2 flex items-center justify-center">
        <video autoPlay loop muted playsInline className="w-20 h-20 mr-4">
          <source src="/kidreads.mp4" type="video/mp4" />
        </video>
        KidReads
      </h1>
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
        disabled={permissionError}
        className={`relative flex items-center justify-center w-40 h-40 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-300
                    ${isListening 
                      ? 'bg-red-500 text-white animate-pulse-strong shadow-2xl' 
                      : 'bg-blue-500 hover:bg-blue-600 text-white shadow-xl'}`}
      >
        <Icon name={isListening ? "check" : "microphone"} className="w-20 h-20" />
        {isListening && (
            <span className="absolute top-full mt-4 text-lg font-semibold text-red-600 w-max">Click the checkmark when you're done!</span>
        )}
      </button>

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