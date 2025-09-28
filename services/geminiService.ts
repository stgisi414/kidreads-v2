import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase"; // Import the functions instance

// Create callable function references
const generateStoryAndIllustrationCallable = httpsCallable(functions, 'generateStoryAndIllustration');
const getPhonemesForWordCallable = httpsCallable(functions, 'getPhonemesForWord');
const googleCloudTTSCallable = httpsCallable(functions, 'googleCloudTTS');
const transcribeAudioCallable = httpsCallable(functions, 'transcribeAudio');
const getTimedTranscriptCallable = httpsCallable(functions, 'getTimedTranscript');
const checkWordMatchCallable = httpsCallable(functions, 'checkWordMatch');
const generateStoryIdeasCallable = httpsCallable(functions, 'generateStoryIdeas');

// Define types for the function return data
type StoryResponse = { title: string; text: string; illustration: string; quiz: any[]; };
type TTSResponse = { audioContent: string; };
type TranscriptionResponse = { transcription?: string; };
type TimedTranscriptResponse = { transcript?: any[]; };
type WordMatchResponse = { isMatch: boolean; };
type PhonemeResponse = { phonemes: string[]; definition: string | null; };
type StoryIdeasResponse = { ideas: string[] };

// Export new functions that use the callable references
export const generateStoryAndIllustration = async (topic: string): Promise<StoryResponse> => {
  const result = await generateStoryAndIllustrationCallable({ topic });
  return result.data as StoryResponse;
};

export const getPhonemesForWord = async (word: string): Promise<PhonemeResponse> => {
  const result = await getPhonemesForWordCallable({ word });
  return result.data as PhonemeResponse;
};

export const getTextToSpeechAudio = async (text: string, voice: string, isWord: boolean = false, speakingRate: number = 1.0): Promise<TTSResponse> => {
  const result = await googleCloudTTSCallable({ text, voice, isWord, speakingRate });
  return result.data as TTSResponse;
};

export const transcribeAudio = async (audio: string): Promise<TranscriptionResponse> => {
    const timeoutPromise = new Promise<TranscriptionResponse>((_, reject) =>
        setTimeout(() => reject(new Error("Transcription timed out")), 15000) // 15 second timeout
    );

    const transcriptionPromise = transcribeAudioCallable({ audio });

    const result = await Promise.race([transcriptionPromise, timeoutPromise]);

    // This is now correct because the cloud function returns { data: { transcription: '...' } }
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

export const generateStoryIdeas = async (): Promise<StoryIdeasResponse> => {
    const result = await generateStoryIdeasCallable();
    return result.data as StoryIdeasResponse;
};