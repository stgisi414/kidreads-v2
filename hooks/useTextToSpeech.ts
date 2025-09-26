// stgisi414/kidreads-v2/kidreads-v2-3ab51bf9c8d14a05a5826f217f7900f2afa690ce/hooks/useTextToSpeech.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { getTextToSpeechAudio } from '../services/geminiService';
import * as Tone from 'tone';

const base64ToArrayBuffer = (base64: string) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const pcmToWav = (pcmData: Int16Array, sampleRate: number = 24000) => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);
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
  const tonePlayerRef = useRef<Tone.Player | null>(null);

  const cancel = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (tonePlayerRef.current) {
      tonePlayerRef.current.stop();
      tonePlayerRef.current.dispose();
      tonePlayerRef.current = null;
    }
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
  ): Promise<{duration: number, audioContent: string | null}> => {
    if (isSpeaking || isLoading) {
      return { duration: 0, audioContent: null };
    }
    setIsLoading(true);
    cancel();

    try {
      // ** THE FIX IS HERE: No more Tone.start() calls inside the hook **
      const { audioContent } = await getTextToSpeechAudio(text, slow, voice, isWord);
      if (!audioContent) throw new Error("No audio content received.");

      const pcmData = base64ToArrayBuffer(audioContent);
      const pcm16 = new Int16Array(pcmData);
      const wavBlob = pcmToWav(pcm16, 24000);
      const audioUrl = URL.createObjectURL(wavBlob);

      if (playbackRate !== 1.0) {
        // --- TONE.JS PATH FOR PITCH-CORRECTED SLOW PLAYBACK ---
        const pitchShift = new Tone.PitchShift().toDestination();
        
        const player = await new Promise<Tone.Player>((resolve, reject) => {
          const p = new Tone.Player({
            url: audioUrl,
            onload: () => resolve(p),
            onerror: (err) => reject(err),
            onstop: () => {
              if (tonePlayerRef.current?.state === 'stopped') {
                setIsSpeaking(false);
                if (onEnd) onEnd();
                p.dispose();
                pitchShift.dispose();
                URL.revokeObjectURL(audioUrl);
              }
            }
          }).connect(pitchShift);
          tonePlayerRef.current = p;
        });

        player.playbackRate = playbackRate;
        const pitchCorrection = -12 * Math.log2(playbackRate);
        pitchShift.pitch = pitchCorrection;
        const duration = player.buffer.duration / playbackRate;
        
        if (autoPlay) {
            player.start();
            setIsSpeaking(true);
            if (onPlay) onPlay(duration);
        }
        return { duration, audioContent };

      } else {
        // --- STANDARD HTML AUDIO PATH FOR NORMAL PLAYBACK ---
        return new Promise((resolve) => {
            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            
            audio.onloadedmetadata = () => {
                const duration = audio.duration;
                if (autoPlay) {
                    audio.play();
                }
                resolve({ duration, audioContent });
            };

            audio.onplay = () => {
              setIsSpeaking(true);
              if(onPlay) onPlay(audio.duration);
            }

            audio.onended = () => {
                setIsSpeaking(false);
                if (onEnd) onEnd();
                URL.revokeObjectURL(audioUrl);
            };

            audio.onerror = (e) => {
                console.error("Audio playback error:", e);
                setIsSpeaking(false);
                resolve({ duration: 0, audioContent: null });
            };
        });
      }
    } catch (error) {
      console.error("Error in speak function:", error);
      setIsLoading(false);
      setIsSpeaking(false);
      return { duration: 0, audioContent: null };
    } finally {
      setIsLoading(false);
    }
  }, [isSpeaking, isLoading, cancel]);

  useEffect(() => {
    return () => {
      cancel();
      if (Tone.context.state !== 'closed') {
        Tone.context.close();
      }
    };
  }, [cancel]);

  return { speak, cancel, isSpeaking, isLoading };
};