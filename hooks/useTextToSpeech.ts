
import { useState, useCallback, useEffect } from 'react';

interface TextToSpeechHook {
  speak: (text: string, onEnd?: () => void, onBoundary?: (e: SpeechSynthesisEvent) => void) => void;
  cancel: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

export const useTextToSpeech = (): TextToSpeechHook => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const isSupported = !!synthRef;

  const speak = useCallback((text: string, onEnd?: () => void, onBoundary?: (e: SpeechSynthesisEvent) => void) => {
    if (!isSupported || isSpeaking) return;

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synthRef!.getVoices();
    // Prefer a child-friendly or clear voice if available
    const femaleVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'));
    utterance.voice = femaleVoice || voices.find(v => v.lang.startsWith('en')) || voices[0];
    utterance.pitch = 1.2;
    utterance.rate = 0.9;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEnd) onEnd();
    };
    if (onBoundary) {
      utterance.onboundary = onBoundary;
    }
    
    utterance.onerror = (event) => {
      console.error("SpeechSynthesis Error", event);
      setIsSpeaking(false);
    }

    synthRef!.speak(utterance);
  }, [isSupported, isSpeaking, synthRef]);

  const cancel = useCallback(() => {
    if (!isSupported) return;
    synthRef!.cancel();
    setIsSpeaking(false);
  }, [isSupported, synthRef]);
  
  useEffect(() => {
    return () => {
      // Cleanup: cancel any ongoing speech when the component unmounts
      if(isSupported) {
        synthRef!.cancel();
      }
    };
  }, [isSupported, synthRef]);

  return { speak, cancel, isSpeaking, isSupported };
};
