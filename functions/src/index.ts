import {setGlobalOptions} from "firebase-functions/v2";
import {onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {GoogleGenAI} from "@google/genai";

// Initialize the Gemini AI client
const ai = new GoogleGenAI({apiKey: process.env.API_KEY || ""});

// Set global options for Firebase Functions
setGlobalOptions({maxInstances: 10});

const STORY_SYSTEM_INSTRUCTION = `You are a creative storyteller for children.
- Create a short, simple, and positive story (2-4 sentences).
- The story must be easy for a young child to read and understand.
- FORBIDDEN THEMES: violence, death, scary monsters, sadness, complex topics.
- Focus on friendship, animals, nature, and joy.
- Do not use complex words or sentence structures.
- Respond only with the story text.`;

export const generateStoryAndIllustration = onCall(async (request) => {
  const {topic} = request.data;
  if (!topic) {
    throw new Error("Topic is required.");
  }

  try {
    const storyResponse = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `A story about: ${topic}`,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      config: {
        systemInstruction: STORY_SYSTEM_INSTRUCTION,
        temperature: 0.8,
        maxOutputTokens: 300,
      },
    });

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const storyText = storyResponse.text?.trim();

    if (!storyText) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const finishReason = storyResponse.candidates?.[0]?.finishReason;
      logger.error("Gemini story generation response was empty or blocked.", {
        finishReason,
        response: storyResponse,
      });

      let errorMessage = "Failed to generate story text.";
      if (finishReason === "SAFETY") {
        errorMessage += " The topic may have been inappropriate.";
      } else if (finishReason) {
        errorMessage += ` Generation stopped for reason: ${finishReason}. 
        Please try again.`;
      } else {
        errorMessage += ` The AI did not return a story. 
        Please try a different topic.`;
      }
      throw new Error(errorMessage);
    }

    const imageResponse = await ai.models.generateImages({
      model: "imagen-1.0-generate-001",
      prompt: `A colorful, simple, and friendly cartoon illustration for a
       child's story. The style should be like a children's book illustration, 
       with soft edges and a happy mood. The illustration should depict: 
       ${storyText}`,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "16:9",
      },
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const base64ImageBytes = imageResponse.generatedImages[0]?.image.imageBytes;
    if (!base64ImageBytes) {
      throw new Error("Failed to generate illustration.");
    }

    const illustration = `data:image/jpeg;base64,${base64ImageBytes}`;

    return {text: storyText, illustration};
  } catch (error) {
    logger.error("Error in Gemini service:", error);
    if (error instanceof Error) {
      throw error; // Re-throw the original error to preserve its message
    }
    throw new Error("Could not generate story and illustration from AI.");
  }
});

export const getPhonemesForWord = onCall(async (request) => {
  const {word} = request.data;
  if (!word) {
    throw new Error("Word is required.");
  }

  try {
    const cleanWord = word.replace(/[.,!?]/g, "");
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Break down the word "${cleanWord}" into its individual
       phonemes, separated by hyphens. For example, for "cat", respond 
       with "c-a-t". For "happy", respond "h-a-ppy". Provide only the 
       hyphen-separated phonemes and nothing else.`,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      config: {
        temperature: 0,
        maxOutputTokens: 50,
      },
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const phonemeText = response.text?.trim();
    if (!phonemeText) {
      throw new Error("Could not get phonemes for the word.");
    }
    return phonemeText.split("-").filter((p: string) => p);
  } catch (error) {
    logger.error("Error getting phonemes:", error);
    throw new Error("Could not get phonemes for the word.");
  }
});