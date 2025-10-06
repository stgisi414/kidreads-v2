import { useState, useRef, useCallback, useEffect } from 'react';
import RecordRTC from 'recordrtc';

// Define the state of the recorder
type RecorderStatus = 'inactive' | 'recording' | 'stopped';

interface RecorderState {
    status: RecorderStatus;
}

interface AudioRecorderHook {
  recorderState: RecorderState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
  permissionError: boolean;
}

export const useAudioRecorder = (): AudioRecorderHook => {
  const [recorderState, setRecorderState] = useState<RecorderState>({
      status: 'inactive',
  });
  const [permissionError, setPermissionError] = useState<boolean>(false);
  const recorderRef = useRef<RecordRTC | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (recorderState.status === 'recording') return;
    
    setPermissionError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const browserIsSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      
      const options: RecordRTC.Options = {
          disableLogs: true,
          type: "audio",
          bufferSize: 16384,
          sampleRate: 44100,
          numberOfAudioChannels: 1, // Mono is generally better for voice
      };

      if (browserIsSafari) {
          options.recorderType = RecordRTC.StereoAudioRecorder;
      }

      const recorder = new RecordRTC(stream, options);
      recorderRef.current = recorder;

      recorder.startRecording();
      setRecorderState({ status: 'recording' });
    } catch (err) {
      console.error("Error starting recording:", err);
      setPermissionError(true);
    }
  }, [recorderState.status]);

  const stopRecording = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
        if (recorderRef.current && recorderState.status === 'recording') {
            recorderRef.current.stopRecording(() => {
                const audioBlob = recorderRef.current!.getBlob();
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = reader.result?.toString().split(',')[1] || null;
                    resolve(base64String);
                };
                reader.readAsDataURL(audioBlob);

                // Clean up
                recorderRef.current!.destroy();
                recorderRef.current = null;
                streamRef.current?.getTracks().forEach((track) => track.stop());
                setRecorderState({ status: 'stopped' });
            });
        } else {
            resolve(null);
        }
    });
  }, [recorderState.status]);
  
  const cancelRecording = useCallback(() => {
    if (recorderRef.current && recorderState.status === 'recording') {
        recorderRef.current.stopRecording(() => {
            recorderRef.current!.destroy();
            recorderRef.current = null;
            streamRef.current?.getTracks().forEach((track) => track.stop());
            setRecorderState({ status: 'inactive' });
        });
    }
  }, [recorderState.status]);

  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.destroy();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return { recorderState, startRecording, stopRecording, cancelRecording, permissionError };
};