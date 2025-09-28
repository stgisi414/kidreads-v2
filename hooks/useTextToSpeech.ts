// stgisi414/kidreads-v2/kidreads-v2-5a75318aefcd07c9007480bfe0f89caabf4d23fb/hooks/useTextToSpeech.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { getTextToSpeechAudio } from '../services/geminiService';

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
  speak: (text: string, onEnd?: () => void, voice?: string, isWord?: boolean, autoPlay?: boolean, speakingRate?: number) => Promise<{duration: number, audioContent: string | null, play: () => void}>;
  cancel: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
}

export const useTextToSpeech = (): TextToSpeechHook => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const playerRef = useRef<Tone.Player | null>(null);

  const cancel = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.dispose();
      playerRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(async (
    text: string,
    onEnd?: () => void,
    voice: string = 'Leda',
    isWord: boolean = false,
    autoPlay: boolean = true,
    speakingRate: number = 1.0 // Add speakingRate here
  ): Promise<{duration: number, audioContent: string | null, play: () => void}> => {
    console.log("speaking rate: " + speakingRate);
    
    if (isSpeaking || isLoading) {
      return { duration: 0, audioContent: null, play: () => {} };
    }
    setIsLoading(true);
    cancel();

    try {
      const { audioContent } = await getTextToSpeechAudio(text, voice, isWord, speakingRate);
      if (!audioContent) throw new Error("No audio content received.");

      const audioBuffer = await Tone.context.decodeAudioData(base64ToArrayBuffer(audioContent));

      return new Promise((resolve) => {
          const player = new Tone.Player(audioBuffer).toDestination();
          playerRef.current = player;
          
          const play = () => {
            player.start();
            setIsSpeaking(true);
          };

          player.onstop = () => {
            setIsSpeaking(false);
            if (onEnd) onEnd();
            player.dispose();
          };
          
          setIsLoading(false);
          if (autoPlay) {
              play();
          }
          resolve({ duration: audioBuffer.duration, audioContent, play });
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