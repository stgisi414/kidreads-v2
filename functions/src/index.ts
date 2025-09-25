// functions/src/index.ts

import { onRequest, Request as FunctionsRequest } from "firebase-functions/v2/https";
import { Response as ExpressResponse } from "express";
import * as logger from "firebase-functions/logger";
import cors from "cors";
import { SpeechClient } from "@google-cloud/speech";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { GoogleAuth } from "google-auth-library";

// Define the list of allowed websites
const allowedOrigins = [
  /kidreads-v2\.web\.app$/,
  /localhost:\d+$/,
  /kidreads\.app$/,
];

const corsHandler = cors({ origin: allowedOrigins });
const speechClient = new SpeechClient();
const textToSpeechClient = new TextToSpeechClient();

const STORY_AND_PROMPT_SYSTEM_INSTRUCTION = `You are a creative storyteller and an expert in writing prompts for image generation models.
Based on the user's topic, you will generate four things in a single JSON object:
1.  A creative and short title for the story.
2.  A short, simple, and positive story (2-4 sentences) for a young child that is directly about the user's topic.
    - FORBIDDEN THEMES: violence, death, scary monsters, sadness, complex topics.
    - Focus on friendship, animals, nature, and joy.
    - Do not use complex words or sentence structures.
3.  A very descriptive and detailed prompt for a colorful, simple, and friendly cartoon illustration that visually represents the story.
    - The style should be like a children's book illustration, with soft edges and a happy mood.
    - Crucially, the prompt must include the main characters, the setting, and the key objects or actions mentioned in the story text.
    - Do not include any of the original text from the story in your prompt. Focus only on describing the visual scene.
4.  A short quiz with 3 multiple-choice questions based on the story, suitable for K-3 students and grounded in Bloom's Taxonomy. Each question should have a "question" text, an array of "options", and the "answer".

Your response MUST be a valid JSON object with the following structure:
{
  "title": "...",
  "story": "...",
  "imagePrompt": "...",
  "quiz": [
    { "question": "...", "options": ["...", "...", "..."], "answer": "..." },
    { "question": "...", "options": ["...", "...", "..."], "answer": "..." },
    { "question": "...", "options": ["...", "...", "..."], "answer": "..." }
  ]
}`;

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
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
        const apiRequest = {
          contents: [{ parts: [{ text: `Topic: ${topic}` }] }],
          system_instruction: { parts: [{ text: STORY_AND_PROMPT_SYSTEM_INSTRUCTION }] },
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
           },
        };

        const apiResponse = await fetch(modelUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiRequest),
        });

        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          logger.error("Error from Gemini API:", errorText);
          throw new Error(`Gemini API failed with status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();

        if (
          !data.candidates ||
          data.candidates.length === 0
        ) {
          logger.warn("Story and prompt generation was blocked for safety reasons.", { topic });
          response.status(400).send({ error: "That topic is not allowed. Please choose a friendlier topic for a children's story." });
          return;
        }
        
        const responseJson = JSON.parse(data.candidates[0].content.parts[0].text)
        const title = responseJson.title;
        const storyText = responseJson.story;
        const imagePrompt = responseJson.imagePrompt;
        const quiz = responseJson.quiz;


        if (!title || !storyText || !imagePrompt || !quiz) {
          logger.error("Missing title, story, image prompt, or quiz in Gemini response", data);
          throw new Error("Failed to generate complete story data from AI.");
        }


        const imageModelUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/kidreads-v2/locations/us-central1/publishers/google/models/imagen-4.0-fast-generate-001:predict`;
        const accessToken = (await (await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } })).json()).access_token;
        const imageApiRequest = {
          instances: [{
            prompt: imagePrompt,
            negativePrompt: "text, words, letters, writing, captions, headlines, titles, signs, numbers, fonts",
          }],
          parameters: { sampleCount: 1, aspectRatio: "16:9", mimeType: "image/jpeg" },
        };

        const imageApiResponse = await fetch(imageModelUrl, {
          method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
            },
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
        // **FIX**: Send quiz data to the frontend
        response.status(200).send({ title, text: storyText, illustration, quiz });
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
      const { text, slow, voice, isWord } = request.body;
      if (!text) {
        return response.status(400).send("Bad Request: Missing text");
      }
      const GEMINI_API_KEY = process.env.API_KEY;
      if (!GEMINI_API_KEY) {
        return response.status(500).send("Internal Server Error: API key not configured.");
      }
      try {
        const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`;
        
        let speechText = `<speak>${text}</speak>`;
        if (slow) {
          speechText = `<speak><prosody rate="slow">${text}</prosody></speak>`;
        } else if (isWord) {
          speechText = `<speak><break time="250ms"/>${text}</speak>`;
        }

        const payload = {
          "model": "gemini-2.5-flash-preview-tts",
          "contents": [{ "parts": [{ "text": speechText }] }],
          "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
              "voiceConfig": {
                "prebuiltVoiceConfig": { "voiceName": voice || "Leda" },
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

export const googleCloudTTS = onRequest(
  { region: "us-central1" },
  (request: FunctionsRequest, response: ExpressResponse) => {
    corsHandler(request, response, async () => {
      if (request.method !== "POST") {
        return response.status(405).send("Method Not Allowed");
      }

      const { text, voice, isWord } = request.body;
      if (!text) {
        return response.status(400).send("Bad Request: Missing text");
      }

      // Map app voice names to Google Cloud voice names
      const googleVoice = voice === 'Leda'
        ? { languageCode: 'en-US', name: 'en-US-Studio-O' } // Female Studio Voice
        : { languageCode: 'en-US', name: 'en-US-Studio-M' }; // Male Studio Voice

      const ssml = isWord
        ? `<speak><break time="250ms"/>${text}</speak>`
        : `<speak>${text}</speak>`;

      try {
        const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
          input: { ssml },
          voice: googleVoice,
          audioConfig: { audioEncoding: 'MP3' },
        });

        if (ttsResponse.audioContent) {
          const audioContent = Buffer.from(ttsResponse.audioContent).toString('base64');
          return response.status(200).send({ audioContent });
        } else {
          throw new Error("No audio data received from Google Cloud TTS API.");
        }
      } catch (error: any) {
        logger.error(`Error generating Google Cloud TTS for text "${text}":`, error.message);
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
          encoding: "WEBM_OPUS" as const,
          sampleRateHertz: 48000,
          languageCode: "en-US",
          model: "latest_long",
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
  },
);  

export const getTimedTranscript = onRequest(
  { secrets: ["API_KEY"], maxInstances: 10, region: "us-central1" },
  async (request, response) => {
    corsHandler(request, response, async () => {
      const { audio } = request.body;
      if (!audio) {
        response.status(400).send({ error: "Audio data is required." });
        return;
      }

      const GEMINI_API_KEY = process.env.API_KEY;
      if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        response.status(500).send({ error: "Internal Server Error: API key not found." });
        return;
      }

      try {
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

        const apiRequest = {
          contents: [{
            parts: [
              { inline_data: { mime_type: 'audio/wav', data: audio } },
              { text: "Generate a timed transcript of the speech. The output should be in the format `[start_time] --> [end_time] word` for each word, with each word on a new line. For example: `00:00:00.260 --> 00:00:00.510 once`" }
            ]
          }]
        };

        const apiResponse = await fetch(modelUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiRequest),
        });


        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          logger.error("Error from Gemini API:", errorText);
          throw new Error(`Gemini API failed with status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!transcript) {
          throw new Error("Could not get transcript for the audio.");
        }

        response.status(200).send({ transcript });
      } catch (error) {
        logger.error("Error in getTimedTranscript:", error);
        response.status(500).send({ error: "Could not get transcript for the audio." });
      }
    });
  }
);