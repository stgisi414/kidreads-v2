import { useState, useCallback, useRef, useEffect } from 'react';
import { getTextToSpeechAudio } from '../services/geminiService';

// Helper function to decode base64 string to ArrayBuffer
const base64ToArrayBuffer = (base64: string) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Helper function to convert raw PCM audio data to a playable WAV Blob
// The Gemini TTS model returns signed 16-bit PCM audio data at a 24000 Hz sample rate.
const pcmToWav = (pcmData: Int16Array, sampleRate: number = 24000) => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt sub-chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Sub-chunk size
  view.setUint16(20, 1, true); // Audio format (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  // Write PCM data
  const pcm16 = new Int16Array(buffer, 44);
  pcm16.set(pcmData);

  return new Blob([view], { type: 'audio/wav' });
};


interface TextToSpeechHook {
  speak: (text: string, onEnd?: () => void, slow?: boolean, voice?: string, isWord?: boolean, autoPlay?: boolean, playbackRate?: number, onPlay?: (duration: number) => void) => Promise<{duration: number, audioContent: string | null}>;
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
    window.speechSynthesis.cancel(); // Also cancel browser speech
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(async (
    text: string,
    onEnd?: () => void,
    slow: boolean = false,
    voice: string = 'Leda',
    isWord: boolean = false,
    autoPlay: boolean = true,
    playbackRate: number = 1.0,
    onPlay?: (duration: number) => void
  ): Promise<{duration: number, audioContent: string | null, audioUrl?: string, play?: () => void}> => {
    if (isSpeaking || isLoading) {
      return { duration: 0, audioContent: null };
    }

    setIsLoading(true);
    cancel();

    try {
      const { audioContent } = await getTextToSpeechAudio(text, slow, voice, isWord);
      if (!audioContent) {
          throw new Error("No audio content received.");
      }
      const pcmData = base64ToArrayBuffer(audioContent);
      const pcm16 = new Int16Array(pcmData);
      const wavBlob = pcmToWav(pcm16, 24000);
      
      const reader = new FileReader();
      reader.readAsDataURL(wavBlob);
      const wavBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          resolve(reader.result!.toString().split(',')[1]);
        };
      });

      const audioUrl = URL.createObjectURL(wavBlob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      return new Promise((resolve) => {
        const play = () => {
            audio.playbackRate = playbackRate;
            audio.play();
        }
        audio.onloadedmetadata = () => {
            if (autoPlay) {
                play();
            }
            resolve({ duration: audio.duration / playbackRate, audioContent: wavBase64, audioUrl, play });
        };
        audio.onplay = () => { 
          setIsSpeaking(true);
          if (onPlay) onPlay(audio.duration / playbackRate); 
        };
        audio.onended = () => {
          setIsSpeaking(false);
          if (onEnd) onEnd();
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          window.speechSynthesis.cancel();
        };
        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          setIsSpeaking(false);
          setIsLoading(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          window.speechSynthesis.cancel();
          resolve({ duration: 0, audioContent: null });
        };
      });

    } catch (error) {
      console.error("Error fetching or playing TTS audio:", error);
      setIsSpeaking(false);
      return { duration: 0, audioContent: null };
    } finally {
      setIsLoading(false);
    }
  }, [isSpeaking, isLoading, cancel]);

  useEffect(() => {
    return () => cancel();
  }, [cancel]);

  return { speak, cancel, isSpeaking, isLoading };
};