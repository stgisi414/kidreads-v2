import { onRequest, Request as FunctionsRequest } from "firebase-functions/v2/https";
import { Response as ExpressResponse } from "express";
import * as logger from "firebase-functions/logger";
import cors from "cors";
import { SpeechClient } from "@google-cloud/speech";

// Define the list of allowed websites
const allowedOrigins = [
  /kidreads-v2\.web\.app$/,
  /localhost:\d+$/,
  /kidreads\.app$/,
];

const corsHandler = cors({ origin: allowedOrigins });
const speechClient = new SpeechClient();

const STORY_SYSTEM_INSTRUCTION = `You are a creative storyteller for children. Create a short, simple, and positive story (2-4 sentences). The story must be easy for a young child to read and understand. FORBIDDEN THEMES: violence, death, scary monsters, sadness, complex topics. Focus on friendship, animals, nature, and joy. Do not use complex words or sentence structures. Respond only with the story text.`;

export const generateStoryAndIllustration = onRequest(
  { secrets: ["API_KEY"], maxInstances: 10, region: "us-central1" },
  (request, response: ExpressResponse) => {
    corsHandler(request, response, async () => {
      const { topic } = request.body;
      if (!topic) {
        response.status(400).send({ error: "Topic is required." });
        return;
      }

      const GEMINI_API_KEY = process.env.API_KEY;
      if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        response.status(500).send({ error: "Internal Server Error: API key not found." });
        return;
      }

      try {
        const storyModelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
        const storyApiRequest = {
          contents: [{ parts: [{ text: `A story about: ${topic}` }] }],
          system_instruction: { parts: [{ text: STORY_SYSTEM_INSTRUCTION }] },
          generationConfig: { temperature: 0.8, maxOutputTokens: 1024 },
        };

        const storyApiResponse = await fetch(storyModelUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storyApiRequest),
        });

        if (!storyApiResponse.ok) {
          const errorText = await storyApiResponse.text();
          logger.error("Error from Gemini story API:", errorText);
          throw new Error(`Gemini story API failed with status ${storyApiResponse.status}`);
        }

        const storyData = await storyApiResponse.json();

        if (storyData.candidates?.[0]?.finishReason === "SAFETY") {
          logger.warn("Story generation was blocked for safety reasons.", { topic });
          response.status(400).send({ error: "That topic is not allowed. Please choose a friendlier topic for a children's story." });
          return;
        }

        const storyText = storyData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!storyText) {
          logger.error("No story text found in Gemini response", storyData);
          throw new Error("Failed to generate story text from AI.");
        }

        const imageModelUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/kidreads-v2/locations/us-central1/publishers/google/models/imagen-4.0-fast-generate-001:predict`;
        const accessToken = (await (await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } })).json()).access_token;
        const imageApiRequest = {
          instances: [{
            prompt: `A colorful, simple, and friendly cartoon illustration for a child's story. The style should be like a children's book illustration, with soft edges and a happy mood. The illustration should be textless and not contain any words. The illustration should depict: ${storyText}`,
          }],
          parameters: { sampleCount: 1, aspectRatio: "16:9", mimeType: "image/jpeg" },
        };

        const imageApiResponse = await fetch(imageModelUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
          body: JSON.stringify(imageApiRequest),
        });

        if (!imageApiResponse.ok) {
          const errorText = await imageApiResponse.text();
          logger.error("Error from Imagen API:", { status: imageApiResponse.status, text: errorText });
          throw new Error(`Imagen API failed with status ${imageApiResponse.status}`);
        }

        const imageData = await imageApiResponse.json();
        const base64ImageBytes = imageData.predictions?.[0]?.bytesBase64Encoded;
        if (!base64ImageBytes) {
          logger.error("No image data found in Imagen response", imageData);
          throw new Error("Failed to generate illustration.");
        }
        const illustration = `data:image/jpeg;base64,${base64ImageBytes}`;
        response.status(200).send({ text: storyText, illustration });
      } catch (error) {
        logger.error("Error in generateStoryAndIllustration:", error);
        response.status(500).send({ error: "Could not generate story and illustration." });
      }
    });
  },
);

export const getPhonemesForWord = onRequest(
  { secrets: ["API_KEY"], maxInstances: 10, region: "us-central1" },
  (request, response: ExpressResponse) => {
    corsHandler(request, response, async () => {
      const { word } = request.body;
      if (!word) {
        response.status(400).send({ error: "Word is required." });
        return;
      }

      const GEMINI_API_KEY = process.env.API_KEY;
      if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        response.status(500).send({ error: "Internal Server Error: API key not found." });
        return;
      }

      try {
        const cleanWord = word.replace(/[.,!?]/g, "");
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
        const apiRequest = {
          contents: [{ parts: [{ text: `Break down the word "${cleanWord}" into its individual phonemes, separated by hyphens. For example, for "cat", respond with "c-a-t". For "happy", respond "h-a-ppy". Provide only the hyphen-separated phonemes and nothing else.` }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
        };

        const apiResponse = await fetch(modelUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiRequest),
        });

        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          logger.error("Error from Gemini phoneme API:", errorText);
          throw new Error(`Gemini phoneme API failed with status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        const phonemeText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!phonemeText) {
          throw new Error("Could not get phonemes for the word.");
        }
        const phonemes = phonemeText.split("-").filter((p: string) => p);
        response.status(200).send(phonemes);
      } catch (error) {
        logger.error("Error in getPhonemesForWord:", error);
        response.status(500).send({ error: "Could not get phonemes for the word." });
      }
    });
  },
);

export const geminiTTS = onRequest(
  { secrets: ["API_KEY"], region: "us-central1" },
  (request: FunctionsRequest, response: ExpressResponse) => {
    corsHandler(request, response, async () => {
      if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed");
      }
      const { text } = request.body;
      if (!text) {
        return response.status(400).send("Bad Request: Missing text");
      }
      const GEMINI_API_KEY = process.env.API_KEY;
      if (!GEMINI_API_KEY) {
        return response.status(500).send("Internal Server Error: API key not configured.");
      }
      try {
        const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
          "model": "gemini-2.5-flash-preview-tts",
          "contents": [{ "parts": [{ "text": text }] }],
          "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
              "voiceConfig": {
                "prebuiltVoiceConfig": { "voiceName": "Leda" }, // A youthful, friendly voice
              },
            },
          },
        };
        const ttsResponse = await fetch(ttsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!ttsResponse.ok) {
          const errorText = await ttsResponse.text();
          logger.error("Error from Gemini TTS API:", errorText);
          return response.status(ttsResponse.status).send(errorText);
        }
        const result = await ttsResponse.json();
        const audioPart = result?.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData);
        if (audioPart?.inlineData) {
          return response.status(200).send({ audioContent: audioPart.inlineData.data });
        } else {
          throw new Error("No audio data received from TTS API.");
        }
      } catch (error: any) {
        logger.error(`Error generating TTS for text "${text}":`, error.message);
        return response.status(500).send("Failed to generate audio.");
      }
    });
  },
);

export const transcribeAudio = onRequest(
  { maxInstances: 10, region: "us-central1" },
  async (request, response) => {
    corsHandler(request, response, async () => {
      try {
        const audioBytes = request.body.audio;
        if (!audioBytes) {
          response.status(400).send("No audio data found in request.");
          return;
        }

        const audio = {
          content: audioBytes,
        };
        const config = {
          encoding: "WEBM_OPUS" as const, // We will send audio in this format from the frontend
          sampleRateHertz: 48000,
          languageCode: "en-US",
          model: "long",
        };
        const requestPayload = {
          audio: audio,
          config: config,
        };

        const [speechResponse] = await speechClient.recognize(requestPayload);
        const transcription = speechResponse.results
          ?.map((result) => result.alternatives?.[0].transcript)
          .join("\n");
        
        response.status(200).send({ transcription });
      } catch (error) {
        logger.error("Error in transcribeAudio:", error);
        response.status(500).send("Error transcribing audio.");
      }
    });
  });