// stgisi414/kidreads-v2/kidreads-v2-5096bbab39cec5b36bff0af2170f45b4a523b759/services/geminiService.ts
// services/geminiService.ts

const getFunctionUrl = (name: string) => {
  // Replace with your actual project details
  const projectId = "kidreads-v2";
  const region = "us-central1";
  return `https://${region}-${projectId}.cloudfunctions.net/${name}`;
};

async function callFirebaseFunction(functionName: string, bodyData: any) {
  const url = getFunctionUrl(functionName);
  let lastError: any = null;

  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error from ${functionName} (status ${response.status}):`, errorText);
        const error: any = new Error(`Failed to call function ${functionName}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${functionName}:`, error);
      lastError = error;
    }
  }
  
  console.error(`All retry attempts failed for ${functionName}.`);
  throw lastError;
}

export const generateStoryAndIllustration = (topic: string) => {
  return callFirebaseFunction("generateStoryAndIllustration", { topic });
};

export const getPhonemesForWord = (word: string) => {
  return callFirebaseFunction("getPhonemesForWord", { word });
};

export const getTextToSpeechAudio = async (text: string, slow: boolean = false, voice: string, isWord: boolean = false): Promise<{ audioContent: string }> => {
  try {
    // First, try the Gemini TTS function
    return await callFirebaseFunction("geminiTTS", { text, slow, voice, isWord });
  } catch (error: any) {
    // If it's a rate limit error (429), use the Google Cloud TTS fallback
    if (error.status === 429) {
      console.warn("Gemini TTS rate limit reached. Using Google Cloud TTS fallback.");
      return callFirebaseFunction("googleCloudTTS", { text, slow, voice, isWord });
    }
    // For any other kind of error, re-throw it
    throw error;
  }
};

export const transcribeAudio = (audio: string): Promise<{ transcription?: string }> => {
    return callFirebaseFunction("transcribeAudio", { audio });
};

export const getTimedTranscript = (audio: string, text: string): Promise<{ transcript?: any[] }> => {
  return callFirebaseFunction("getTimedTranscript", { audio, text });
};

export const checkWordMatch = (transcribedWord: string, expectedWord: string): Promise<{ isMatch: boolean }> => {
    return callFirebaseFunction("checkWordMatch", { transcribedWord, expectedWord });
};