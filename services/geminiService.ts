import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase"; // Import the functions instance

// Create callable function references
const generateStoryAndIllustrationCallable = httpsCallable(functions, 'generateStoryAndIllustration');
const getPhonemesForWordCallable = httpsCallable(functions, 'getPhonemesForWord');
const googleCloudTTSCallable = httpsCallable(functions, 'googleCloudTTS');
const transcribeAudioCallable = httpsCallable(functions, 'transcribeAudio');
const getTimedTranscriptCallable = httpsCallable(functions, 'getTimedTranscript');
const checkWordMatchCallable = httpsCallable(functions, 'checkWordMatch');

// Define types for the function return data
type StoryResponse = { title: string; text: string; illustration: string; quiz: any[]; };
type TTSResponse = { audioContent: string; };
type TranscriptionResponse = { transcription?: string; };
type TimedTranscriptResponse = { transcript?: any[]; };
type WordMatchResponse = { isMatch: boolean; };

// Export new functions that use the callable references
export const generateStoryAndIllustration = async (topic: string): Promise<StoryResponse> => {
  const result = await generateStoryAndIllustrationCallable({ topic });
  return result.data as StoryResponse;
};

export const getPhonemesForWord = async (word: string): Promise<string[]> => {
  const result = await getPhonemesForWordCallable({ word });
  return result.data as string[];
};

export const getTextToSpeechAudio = async (text: string, voice: string, isWord: boolean = false): Promise<TTSResponse> => {
  const result = await googleCloudTTSCallable({ text, speakingRate: 1.0, voice, isWord });
  return result.data as TTSResponse;
};

export const transcribeAudio = async (audio: string): Promise<TranscriptionResponse> => {
    const timeoutPromise = new Promise<TranscriptionResponse>((_, reject) =>
        setTimeout(() => reject(new Error("Transcription timed out")), 15000) // 15 second timeout
    );

    const transcriptionPromise = transcribeAudioCallable({ audio });

    const result = await Promise.race([transcriptionPromise, timeoutPromise]);
    return result.data as TranscriptionResponse;
};

export const getTimedTranscript = async (audio: string, text: string): Promise<TimedTranscriptResponse> => {
  const result = await getTimedTranscriptCallable({ audio, text });
  return result.data as TimedTranscriptResponse;
};

export const checkWordMatch = async (transcribedWord: string, expectedWord: string): Promise<WordMatchResponse> => {
    const result = await checkWordMatchCallable({ transcribedWord, expectedWord });
    return result.data as WordMatchResponse;
};