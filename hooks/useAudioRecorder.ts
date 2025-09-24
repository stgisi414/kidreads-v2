import { useState, useRef, useCallback } from 'react';

// Define the state of the recorder
type RecorderState = 'inactive' | 'recording' | 'paused';

interface AudioRecorderHook {
  recorderState: RecorderState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>; // Returns base64 string
  permissionError: boolean;
}

export const useAudioRecorder = (): AudioRecorderHook => {
  const [recorderState, setRecorderState] = useState<RecorderState>('inactive');
  const [permissionError, setPermissionError] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Function to convert a Blob to a Base64 string
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          // The result includes the data URL prefix, so we remove it.
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error('Failed to read blob as Base64 string.'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const startRecording = useCallback(async () => {
    try {
      // Request microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionError(false);
      
      // Create a new MediaRecorder instance
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Event listener for when data is available
      mediaRecorder.addEventListener('dataavailable', (event) => {
        audioChunksRef.current.push(event.data);
      });

      // Start recording
      mediaRecorder.start();
      setRecorderState('recording');
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setPermissionError(true);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve) => {
      if (mediaRecorderRef.current && recorderState === 'recording') {
        mediaRecorderRef.current.addEventListener('stop', async () => {
          // Combine all recorded chunks into a single blob
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
          
          // Convert the blob to a base64 string
          const base64String = await blobToBase64(audioBlob);
          
          // Clean up
          audioChunksRef.current = [];
          // Stop all tracks on the stream to turn off the microphone indicator
          mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
          mediaRecorderRef.current = null;
          setRecorderState('inactive');
          resolve(base64String);
        });

        mediaRecorderRef.current.stop();
      }
    });
  }, [recorderState]);

  return { recorderState, startRecording, stopRecording, permissionError };
};
