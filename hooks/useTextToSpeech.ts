import { useState, useCallback, useRef, useEffect } from 'react';
import { getTextToSpeechAudio } from '../services/geminiService';

// Helper function to decode base64 string to an ArrayBuffer
const base64ToArrayBuffer = (base64: string) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

interface TextToSpeechHook {
  speak: (text: string, onEnd?: () => void, voice?: string, isWord?: boolean) => Promise<void>;
  cancel: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
}

export const useTextToSpeech = (): TextToSpeechHook => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cancel = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(async (
    text: string,
    onEnd?: () => void,
    voice: string = 'Leda',
    isWord: boolean = false,
    autoPlay: boolean = true // Add autoPlay parameter
  ): Promise<{duration: number, audioContent: string | null, play: () => void}> => {
    if (isSpeaking || isLoading) {
      return { duration: 0, audioContent: null, play: () => {} };
    }
    setIsLoading(true);
    cancel();

    try {
      const { audioContent } = await getTextToSpeechAudio(text, voice, isWord);
      if (!audioContent) throw new Error("No audio content received.");

      const audioBuffer = base64ToArrayBuffer(audioContent);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      return new Promise((resolve) => {
          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          const play = () => {
            audio.play().catch(e => console.error("Error playing audio:", e));
          };
          
          audio.onloadedmetadata = () => {
              setIsLoading(false);
              if (autoPlay) {
                  play();
              }
              resolve({ duration: audio.duration, audioContent, play });
          };

          audio.onplay = () => {
            setIsSpeaking(true);
          }

          audio.onended = () => {
              setIsSpeaking(false);
              if (onEnd) onEnd();
              URL.revokeObjectURL(audioUrl);
          };

          audio.onerror = (e) => {
              console.error("Audio playback error:", e);
              setIsLoading(false);
              setIsSpeaking(false);
              URL.revokeObjectURL(audioUrl);
              resolve({ duration: 0, audioContent: null, play: () => {} });
          };
      });

    } catch (error) {
      console.error("Error in speak function:", error);
      setIsLoading(false);
      setIsSpeaking(false);
      return { duration: 0, audioContent: null, play: () => {} };
    }
  }, [isSpeaking, isLoading, cancel]);

  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  return { speak, cancel, isSpeaking, isLoading };
};