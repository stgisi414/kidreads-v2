// services/geminiService.ts

const getFunctionUrl = (name: string) => {
  // Replace with your actual project details
  const projectId = "kidreads-v2";
  const region = "us-central1";
  return `https://${region}-${projectId}.cloudfunctions.net/${name}`;
};

async function callFirebaseFunction(functionName: string, data: any) {
  const url = getFunctionUrl(functionName);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data), // We send the data directly
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to call function");
  }

  return response.json(); // The response is the data itself
}

export const generateStoryAndIllustration = (topic: string) => {
  return callFirebaseFunction("generateStoryAndIllustration", { topic });
};

export const getPhonemesForWord = (word: string) => {
  return callFirebaseFunction("getPhonemesForWord", { word });
};