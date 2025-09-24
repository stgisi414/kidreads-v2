// services/geminiService.ts

const getFunctionUrl = (name: string) => {
  // Replace with your actual project details
  const projectId = "kidreads-v2";
  const region = "us-central1";
  return `https://${region}-${projectId}.cloudfunctions.net/${name}`;
};

async function callFirebaseFunction(functionName: string, bodyData: any) {
  const url = getFunctionUrl(functionName);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error from ${functionName}:`, errorText);
    throw new Error(`Failed to call function ${functionName}`);
  }

  return response.json();
}

export const generateStoryAndIllustration = (topic: string) => {
  return callFirebaseFunction("generateStoryAndIllustration", { topic });
};

export const getPhonemesForWord = (word: string) => {
  return callFirebaseFunction("getPhonemesForWord", { word });
};

// Add new functions
export const getTextToSpeechAudio = (text: string): Promise<{ audioContent: string }> => {
    return callFirebaseFunction("geminiTTS", { text });
};

export const transcribeAudio = (audio: string): Promise<{ transcription?: string }> => {
    return callFirebaseFunction("transcribeAudio", { audio });
};
