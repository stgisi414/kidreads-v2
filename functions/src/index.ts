// functions/src/index.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { SpeechClient } from "@google-cloud/speech";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from 'uuid';

// Initialize the Admin SDK
initializeApp();
const bucket = getStorage().bucket();

const speechClient = new SpeechClient();
const textToSpeechClient = new TextToSpeechClient();

const STORY_LENGTH_MAP = [
    "2-4 sentences",    // Short
    "6-8 sentences",    // Medium
    "12-16 sentences",  // Long
    "24-32 sentences"   // Epic
];

const getStoryAndPromptSystemInstruction = (storyLength: number): string => {
    const sentenceCount = STORY_LENGTH_MAP[storyLength] || STORY_LENGTH_MAP[0];

    return `You are a creative storyteller and an expert in writing prompts for image generation models.
      Based on the user's topic, you will generate four things in a single JSON object:
      1.  A creative and short title for the story.
      2.  A simple, and positive story of about ${sentenceCount} for a young child that is directly about the user's topic.
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
};

const getLocationStoryIdeasSystemInstruction = (): string => {
  return `You are a creative storyteller for children.
      Based on the user's location, you will generate 3-4 creative and simple story ideas for a 5-year-old child.
      The ideas should be inspired by the location's landmarks, culture, or nature.
      The ideas should be no more than 10 words each.
      Your response MUST be a valid JSON object with a single key "ideas" which is an array of strings.
      
      Example for "Paris, France":
      {
          "ideas": [
              "A pigeon's adventure on the Eiffel Tower",
              "The mouse who lived in the Louvre",
              "A magical boat ride on the Seine river"
          ]
      }`;
};

export const generateStoryAndIllustration = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { topic, storyLength } = request.data;
    if (!topic) {
        throw new HttpsError("invalid-argument", "Topic is required.");
    }

    const systemInstruction = getStoryAndPromptSystemInstruction(storyLength);

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
      const apiRequest = {
        contents: [{ parts: [{ text: `Topic: ${topic}` }] }],
        system_instruction: { parts: [{ text: systemInstruction }] },
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
        throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
      }

      const data = await apiResponse.json();

      if (
        !data.candidates ||
        data.candidates.length === 0
      ) {
        logger.warn("Story and prompt generation was blocked for safety reasons.", { topic });
        throw new HttpsError("invalid-argument", "That topic is not allowed. Please choose a friendlier topic for a children's story.");
      }

      const responseJson = JSON.parse(data.candidates[0].content.parts[0].text)
      const title = responseJson.title;
      const storyText = responseJson.story;
      const imagePrompt = responseJson.imagePrompt;
      const quiz = responseJson.quiz;


      if (!title || !storyText || !imagePrompt || !quiz) {
        logger.error("Missing title, story, image prompt, or quiz in Gemini response", data);
        throw new HttpsError("internal", "Failed to generate complete story data from AI.");
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
        throw new HttpsError("internal", `Imagen API failed with status ${imageApiResponse.status}`);
      }

      const imageData = await imageApiResponse.json();
      const base64ImageBytes = imageData.predictions?.[0]?.bytesBase64Encoded;
      if (!base64ImageBytes) {
        logger.error("No image data found in Imagen response", imageData);
        throw new HttpsError("internal", "Failed to generate illustration.");
      }

      const imageBuffer = Buffer.from(base64ImageBytes, 'base64');
      const fileName = `illustrations/${uuidv4()}.jpeg`;
      const file = bucket.file(fileName);

      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/jpeg',
        },
      });

      await file.makePublic();
      const illustrationUrl = file.publicUrl();

      return { title, text: storyText, illustration: illustrationUrl, quiz };

    } catch (error) {
      logger.error("Error in generateStoryAndIllustration:", error);
      throw new HttpsError("internal", "Could not generate story and illustration.");
    }
  },
);

export const getPhonemesForWord = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { word } = request.data;
    if (!word) {
      throw new HttpsError("invalid-argument", "Word is required.");
    }

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
      logger.error("API_KEY not configured in environment.");
      throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
      const cleanWord = word.replace(/[.,!?]/g, "");
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

      const prompt = `
        Analyze the word: "${cleanWord}".
        Your response MUST be a valid JSON object.
        1.  Break the word down into its individual phonemes. If the word is a common abbreviation (e.g., "Dr."), use the full word ("Doctor") for the phonemes. The result should be an array of strings in a "phonemes" field.
        2.  Determine if this is a "tricky word" for a 5-year-old. A tricky word is anything that is NOT a very common sight word (e.g., 'a', 'an', 'the', 'is', 'in', 'it', 'on').
        3.  If it is a tricky word, provide a simple, one-sentence definition suitable for a 5-year-old in a "definition" field.
        4.  If it is NOT a tricky word, the "definition" field should be null.
        Example for "happy":
        { "phonemes": ["h", "a", "ppy"], "definition": "Happy is when you feel very good and are smiling." }
        Example for "the":
        { "phonemes": ["the"], "definition": null }
      `;

      const apiRequest = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
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
        logger.error("Error from Gemini phoneme API:", errorText);
        throw new HttpsError("internal", `Gemini phoneme API failed with status ${apiResponse.status}`);
      }

      const data = await apiResponse.json();
      const responseJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseJsonText) {
        throw new HttpsError("internal", "Could not get phonemes for the word.");
      }

      const responseObject = JSON.parse(responseJsonText);
      return responseObject;

    } catch (error) {
      logger.error("Error in getPhonemesForWord:", error);
      throw new HttpsError("internal", "Could not get phonemes for the word.");
    }
  },
);

export const googleCloudTTS = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    const { text, voice, isWord, speakingRate } = request.data;
    if (!text) {
      throw new HttpsError("invalid-argument", "Bad Request: Missing text");
    }

    const googleVoice = voice === 'Leda'
      ? { languageCode: 'en-US', name: 'en-US-Studio-O' }
      : { languageCode: 'en-US', name: 'en-US-Studio-M' };

    const content = isWord ? `<break time="250ms"/>${text}` : text;
    const ssml = `<speak><prosody rate="${speakingRate || 1.0}">${content}</prosody></speak>`;

    try {
      const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
        input: { ssml },
        voice: googleVoice,
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: 24000,
        },
      });

      if (ttsResponse.audioContent) {
        const audioContent = Buffer.from(ttsResponse.audioContent).toString('base64');
        return { audioContent };
      } else {
        throw new Error("No audio data received from Google Cloud TTS API.");
      }
    } catch (error: any) {
      logger.error(`Error generating Google Cloud TTS for text "${text}":`, error.message);
      throw new HttpsError("internal", "Failed to generate audio.");
    }
  },
);

export const transcribeAudio = onCall(
  {
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    try {
      const audioBytes = request.data.audio;
      if (!audioBytes) {
        throw new HttpsError("invalid-argument", "No audio data found in request.");
      }

      const audio = { content: audioBytes };
      const config = {
        encoding: "WEBM_OPUS" as const,
        sampleRateHertz: 48000,
        languageCode: "en-US",
        model: "latest_long",
      };
      const requestPayload = { audio, config };

      const [speechResponse] = await speechClient.recognize(requestPayload);
      const transcription = speechResponse.results
        ?.map((result: any) => result.alternatives?.[0].transcript)
        .join("\n");

      return { transcription };
    } catch (error) {
      logger.error("Error in transcribeAudio:", error);
      throw new HttpsError("internal", "Error transcribing audio.");
    }
  },
);

const cleanAndParseJson = (text: string) => {
  const cleanedText = text.replace(/^```json\s*/, "").replace(/```$/, "");
  return JSON.parse(cleanedText);
};

export const getTimedTranscript = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
    memory: "512MiB",
  },
  async (request) => {
    const { audio, text, speakingRate, duration } = request.data;
    if (!audio || !text) {
      throw new HttpsError("invalid-argument", "Audio data and story text are required.");
    }

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
      logger.error("API_KEY not configured in environment.");
      throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

      const prompt = `Given the following story text and audio that was generated with a speaking rate of ${speakingRate} and has a duration of ${duration} seconds, generate a timed transcript of the speech audio.
The output MUST be a valid JSON array where each object contains "word", "startTime", and "endTime".
The "startTime" and "endTime" should be in seconds with milliseconds (e.g., "0.260").
The words in the transcript must exactly match the words in the provided story text.

Story Text: "${text}"

Example JSON output:
[
{"word": "Barnaby", "startTime": "0.100", "endTime": "0.500"},
{"word": "the", "startTime": "0.500", "endTime": "0.750"},
{"word": "Bumblebee", "startTime": "0.750", "endTime": "1.420"}
]`;

      const apiRequest = {
        contents: [{
          parts: [
            { inline_data: { mime_type: 'audio/l16; rate=24000;', data: audio } },
            { text: prompt }
          ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
        }
      };

      const apiResponse = await fetch(modelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiRequest),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        logger.error("Error from Gemini API:", errorText);
        throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
      }

       const data = await apiResponse.json();
      const transcriptText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!transcriptText) {
        throw new HttpsError("internal", "Could not get transcript for the audio.");
      }

      const transcript = cleanAndParseJson(transcriptText);
      return { transcript };
    } catch (error) {
      logger.error("Error in getTimedTranscript:", error);
      throw new HttpsError("internal", "Could not get transcript for the audio.");
    }
  }
);

export const checkWordMatch = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { transcribedWord, expectedWord } = request.data;
    if (!transcribedWord || !expectedWord) {
        throw new HttpsError("invalid-argument", "Transcribed word and expected word are required.");
    }

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
        const prompt = `Is the transcribed text "${transcribedWord}" a close phonetic match for the expected word "${expectedWord}"? The user is a child learning to read, so be lenient with pronunciation. Consider common transcription errors, like numbers for words (e.g., "2" for "to" or "8" for "ate"). Respond with only "true" or "false".`;

        const apiRequest = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        const apiResponse = await fetch(modelUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiRequest),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            logger.error("Error from Gemini API:", errorText);
            throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        const matchText = data.candidates?.[0]?.content?.parts?.[0]?.text.trim().toLowerCase();

        return { isMatch: matchText === 'true' };

    } catch (error) {
        logger.error("Error in checkWordMatch:", error);
        throw new HttpsError("internal", "Could not check word match.");
    }
  }
);

export const deleteStoryImage = onDocumentDeleted("users/{userId}/stories/{storyId}", async (event) => {
    const deletedData = event.data?.data();
    if (!deletedData) {
        logger.info("No data associated with the deleted document.");
        return;
    }

    const imageUrl = deletedData.illustration;
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('https://storage.googleapis.com')) {
        logger.info("No valid illustration URL found in the deleted document.");
        return;
    }

    try {
        const url = new URL(imageUrl);
        const filePath = decodeURIComponent(url.pathname.split('/o/')[1]);

        if (filePath) {
            await bucket.file(filePath).delete();
            logger.info(`Successfully deleted image: ${filePath}`);
        }
    } catch (error) {
        logger.error(`Failed to delete image for story ${event.params.storyId}:`, error);
    }
});

export const generateStoryIdeas = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
        const prompt = `Generate 3-4 creative and simple story ideas for a 5-year-old child. The ideas should be about friendship, animals, and nature, and should be no more than 5-7 words each. Your response MUST be a valid JSON object with a single key "ideas" which is an array of strings.
        Example:
        {
            "ideas": [
                "A squirrel who lost his acorn",
                "The rainbow-colored butterfly",
                "A bear who loves to dance"
            ]
        }`;

        const apiRequest = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
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
            throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        const ideas = JSON.parse(data.candidates[0].content.parts[0].text);

        return ideas;
    } catch (error) {
        logger.error("Error in generateStoryIdeas:", error);
        throw new HttpsError("internal", "Could not generate story ideas.");
    }
  }
);

export const generateLocationStoryIdeas = onCall(
    {
        secrets: ["API_KEY"],
        maxInstances: 10,
        region: "us-central1",
    },
    async (request) => {
        const { latitude, longitude, location: locationInput } = request.data;
        const GEMINI_API_KEY = process.env.API_KEY;

        if ((latitude == null || longitude == null) && !locationInput) {
            throw new HttpsError("invalid-argument", "Either lat/lng or a location string is required.");
        }

        let locationToUse = locationInput;

        try {
            if (!locationToUse) {
                const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GEMINI_API_KEY}`;
                const geocodeResponse = await fetch(geocodeUrl);
                if (!geocodeResponse.ok) {
                    throw new HttpsError("internal", 'Failed to fetch location from Google Geocoding API.');
                }
                const geocodeData = await geocodeResponse.json();

                if (!geocodeData.results || geocodeData.results.length === 0) {
                    throw new HttpsError("not-found", 'No location found for the given coordinates.');
                }

                const addressComponents = geocodeData.results[0].address_components;
                const locality = addressComponents.find((c: any) => c.types.includes('locality'))?.long_name;
                const adminArea = addressComponents.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name;
                const country = addressComponents.find((c: any) => c.types.includes('country'))?.long_name;

                locationToUse = [locality, adminArea, country].filter(Boolean).join(', ');
            }

            const systemInstruction = getLocationStoryIdeasSystemInstruction();
            const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
            const prompt = `Location: ${locationToUse}`;

            const apiRequest = {
                contents: [{ parts: [{ text: prompt }] }],
                system_instruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
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
                logger.error("Error from Gemini API for location ideas:", errorText);
                throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
            }

            const data = await apiResponse.json();
            const ideas = JSON.parse(data.candidates[0].content.parts[0].text);

            return { ...ideas, location: locationToUse };
        } catch (error) {
            logger.error("Error in generateLocationStoryIdeas:", error);
            throw new HttpsError("internal", "Could not generate location-based story ideas.");
        }
    }
);

export const getPlaceAutocomplete = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { input } = request.data;
    if (!input) {
      throw new HttpsError("invalid-argument", "Input is required.");
    }

    const PLACES_API_KEY = process.env.API_KEY;
    if (!PLACES_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
        const autocompleteUrl = 'https://places.googleapis.com/v1/places:autocomplete';
        const apiRequest = {
          input: input,
          includedPrimaryTypes: ["locality", "administrative_area_level_3", "country"],
        };

        const autocompleteResponse = await fetch(autocompleteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': PLACES_API_KEY,
          },
          body: JSON.stringify(apiRequest),
        });


        if (!autocompleteResponse.ok) {
            const errorText = await autocompleteResponse.text();
            logger.error("Error from Google Places API:", errorText);
            throw new HttpsError("internal", `Google Places API failed with status ${autocompleteResponse.status}`);
        }

        const autocompleteData = await autocompleteResponse.json();
        return autocompleteData;

    } catch (error) {
        logger.error("Error in getPlaceAutocomplete:", error);
        throw new HttpsError("internal", "Could not get place autocomplete suggestions.");
    }
  }
);