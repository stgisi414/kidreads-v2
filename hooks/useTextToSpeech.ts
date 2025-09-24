import { useState, useCallback, useRef } from 'react';
import { getTextToSpeechAudio } from '../services/geminiService';

// Helper to decode base64 and create an AudioBuffer
const base64ToAudioBuffer = async (base64: string, audioContext: AudioContext): Promise<AudioBuffer> => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return audioContext.decodeAudioData(bytes.buffer);
};

interface TextToSpeechHook {
  speak: (text: string, onEnd?: () => void) => Promise<void>;
  cancel: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
}

export const useTextToSpeech = (): TextToSpeechHook => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize AudioContext on first use
  const getAudioContext = () => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const cancel = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    if (isSpeaking || isLoading) return;

    setIsLoading(true);
    try {
      const { audioContent } = await getTextToSpeechAudio(text);
      const audioContext = getAudioContext();
      // Ensure context is not in a suspended state (common in modern browsers)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      const audioBuffer = await base64ToAudioBuffer(audioContent, audioContext);
      
      if (sourceRef.current) {
        sourceRef.current.stop();
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        setIsSpeaking(false);
        sourceRef.current = null;
        if (onEnd) {
          onEnd();
        }
      };
      
      source.start();
      sourceRef.current = source;
      setIsSpeaking(true);

    } catch (error) {
      console.error("Error fetching or playing TTS audio:", error);
      setIsSpeaking(false); // Ensure state is reset on error
    } finally {
      setIsLoading(false);
    }
  }, [isSpeaking, isLoading]);

  return { speak, cancel, isSpeaking, isLoading };
};
