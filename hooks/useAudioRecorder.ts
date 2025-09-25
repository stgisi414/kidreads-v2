import { useState, useRef, useCallback } from 'react';

// Define the state of the recorder
type RecorderStatus = 'inactive' | 'recording' | 'stopped';

interface RecorderState {
    status: RecorderStatus;
}

interface AudioRecorderHook {
  recorderState: RecorderState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>; // **FIX**: Now returns a promise with the audio
  permissionError: boolean;
}

export const useAudioRecorder = (): AudioRecorderHook => {
  const [recorderState, setRecorderState] = useState<RecorderState>({
      status: 'inactive',
  });
  const [permissionError, setPermissionError] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (recorderState.status === 'recording') return;
    
    setPermissionError(false);
    try {
      // **FIX**: Request microphone access only when start is called.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.addEventListener('dataavailable', (event) => {
        audioChunksRef.current.push(event.data);
      });

      mediaRecorder.start();
      setRecorderState({ status: 'recording' });
    } catch (err) {
      console.error("Error starting recording:", err);
      setPermissionError(true);
    }
  }, [recorderState.status]);

  const stopRecording = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
        if (mediaRecorderRef.current && recorderState.status === 'recording') {
            mediaRecorderRef.current.addEventListener('stop', () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = reader.result?.toString().split(',')[1] || null;
                    setRecorderState({ status: 'stopped' });
                    audioChunksRef.current = [];
                    resolve(base64String);
                };
                reader.readAsDataURL(audioBlob);
                streamRef.current?.getTracks().forEach(track => track.stop());
            });

            mediaRecorderRef.current.stop();
        } else {
            resolve(null);
        }
    });
  }, [recorderState.status]);

  return { recorderState, startRecording, stopRecording, permissionError };
};