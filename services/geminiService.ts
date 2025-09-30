import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase"; // Import the functions instance

// Create a helper function for retries with delays
const callWithRetry = async <T>(fn: () => Promise<T>, retries = 2, delay = 500): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await new Promise(res => setTimeout(res, delay));
      return callWithRetry(fn, retries - 1, delay * 2); // Exponential backoff
    }
    throw error;
  }
};

// Create a helper for timeouts
const withTimeout = <T>(promise: Promise<T>, ms = 10000): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, ms);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
};

// Create callable function references
const generateStoryAndIllustrationCallable = httpsCallable(functions, 'generateStoryAndIllustration');
const getPhonemesForWordCallable = httpsCallable(functions, 'getPhonemesForWord');
const googleCloudTTSCallable = httpsCallable(functions, 'googleCloudTTS');
const transcribeAudioCallable = httpsCallable(functions, 'transcribeAudio');
const getTimedTranscriptCallable = httpsCallable(functions, 'getTimedTranscript');
const checkWordMatchCallable = httpsCallable(functions, 'checkWordMatch');
const generateStoryIdeasCallable = httpsCallable(functions, 'generateStoryIdeas');
const generateLocationStoryIdeasCallable = httpsCallable(functions, 'generateLocationStoryIdeas');

// Define types for the function return data
type StoryResponse = { title: string; text: string; illustration: string; quiz: any[]; };
type TTSResponse = { audioContent: string; };
type TranscriptionResponse = { transcription?: string; };
type TimedTranscriptResponse = { transcript?: any[]; };
type WordMatchResponse = { isMatch: boolean; };
type PhonemeResponse = { phonemes: string[]; definition: string | null; };
type StoryIdeasResponse = { ideas: string[] };
type LocationStoryIdeasResponse = { ideas: string[] };

// Export new functions that use the callable references
export const generateStoryAndIllustration = async (topic: string, storyLength: number): Promise<StoryResponse> => {
  try {
    const result = await generateStoryAndIllustrationCallable({ topic, storyLength });
    return result.data as StoryResponse;
  } catch (error) {
    console.error("Error generating story and illustration:", error);
    throw new Error("Failed to generate story. Please try again.");
  }
};

export const getPhonemesForWord = async (word: string): Promise<PhonemeResponse> => {
  const result = await getPhonemesForWordCallable({ word });
  return result.data as PhonemeResponse;
};

export const getTextToSpeechAudio = async (text: string, voice: string, isWord: boolean = false, speakingRate: number = 1.0): Promise<TTSResponse> => {
    const call = () => withTimeout(googleCloudTTSCallable({ text, voice, isWord, speakingRate }));
    const result = await callWithRetry(call);
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

export const getTimedTranscript = async (audio: string, text: string, speakingRate: number, duration: number): Promise<TimedTranscriptResponse> => {
  const result = await getTimedTranscriptCallable({ audio, text, speakingRate, duration });
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

export const generateLocationStoryIdeas = async (params: { latitude?: number; longitude?: number; location?: string }): Promise<LocationStoryIdeasResponse> => {
    const result = await generateLocationStoryIdeasCallable(params);
    return result.data as LocationStoryIdeasResponse;
};

const getPlaceAutocompleteCallable = httpsCallable(functions, 'getPlaceAutocomplete');

type PlaceAutocompleteResponse = { predictions: any[], status: string };

export const getPlaceAutocomplete = async (input: string): Promise<PlaceAutocompleteResponse> => {
    const result = await getPlaceAutocompleteCallable({ input });
    return result.data as PlaceAutocompleteResponse;
};