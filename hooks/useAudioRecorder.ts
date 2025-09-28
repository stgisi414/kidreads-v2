import { useState, useRef, useCallback, useEffect } from 'react';

// Define the state of the recorder
type RecorderStatus = 'inactive' | 'recording' | 'stopped';

interface RecorderState {
    status: RecorderStatus;
}

interface AudioRecorderHook {
  recorderState: RecorderState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void; // Add this line
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
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
            setTimeout(() => {
                mediaRecorderRef.current.addEventListener('stop', () => {
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
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
            }, 750); // Add a 750ms delay
        } else {
            resolve(null);
        }
    });
  }, [recorderState.status]);
  
  // Add this new cancel function
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    setRecorderState({ status: 'inactive' });
    audioChunksRef.current = [];
  }, []);

  // Add a cleanup effect
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return { recorderState, startRecording, stopRecording, cancelRecording, permissionError };
};