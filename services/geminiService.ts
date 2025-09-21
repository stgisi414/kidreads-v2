import { GoogleGenAI, Type } from "@google/genai";

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const STORY_SYSTEM_INSTRUCTION = `You are a creative storyteller for children aged 3-5.
- Create a very short, simple, and positive story with 2 to 4 sentences.
- The story must be easy to read and understand for a young child.
- STRICTLY FORBIDDEN THEMES: violence, death, scary monsters, sadness, arguments, complex topics, hate speech, sexual content, or any inappropriate themes for toddlers.
- Focus on themes of friendship, animals, nature, and joy.
- Do not use complex words or sentence structures.
- Do not add any titles or headings. Respond only with the story text.`;

export const generateStoryAndIllustration = async (topic: string): Promise<{ text: string, illustration: string }> => {
    try {
        const storyResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `A story about: ${topic}`,
            config: {
                systemInstruction: STORY_SYSTEM_INSTRUCTION,
                temperature: 0.8,
                maxOutputTokens: 300,
                thinkingConfig: { thinkingBudget: 100 },
            }
        });

        const storyText = storyResponse.text?.trim();

        if (!storyText) {
            const finishReason = storyResponse.candidates?.[0]?.finishReason;
            console.error("Gemini story generation response was empty or blocked.", { finishReason, response: storyResponse });
            
            let errorMessage = "Failed to generate story text.";
            if (finishReason === 'SAFETY') {
                errorMessage += " The topic may have been inappropriate.";
            } else if (finishReason) {
                 errorMessage += ` Generation stopped for reason: ${finishReason}. Please try again.`;
            } else {
                errorMessage += " The AI did not return a story. Please try a different topic.";
            }
            throw new Error(errorMessage);
        }
        
        const imageResponse = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `A colorful, simple, and friendly cartoon illustration for a child's story. The style should be like a children's book illustration, with soft edges and a happy mood. The illustration should depict: ${storyText}`,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9',
            },
        });

        const base64ImageBytes = imageResponse.generatedImages[0]?.image.imageBytes;
        if (!base64ImageBytes) {
            throw new Error("Failed to generate illustration.");
        }
        
        const illustration = `data:image/jpeg;base64,${base64ImageBytes}`;
        
        return { text: storyText, illustration };

    } catch (error) {
        console.error("Error in Gemini service:", error);
        if (error instanceof Error) {
            throw error; // Re-throw the original error to preserve its message
        }
        throw new Error("Could not generate story and illustration from AI.");
    }
};

export const getPhonemesForWord = async (word: string): Promise<string[]> => {
    try {
        const cleanWord = word.replace(/[.,!?]/g, '');
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Break down the word "${cleanWord}" into its individual phonemes, separated by hyphens. For example, for "cat", respond with "c-a-t". For "happy", respond "h-a-ppy". Provide only the hyphen-separated phonemes and nothing else.`,
            config: {
                temperature: 0,
                maxOutputTokens: 50,
            }
        });

        const phonemeText = response.text?.trim();
        if (!phonemeText) {
            throw new Error("Could not get phonemes for the word.");
        }
        return phonemeText.split('-').filter(p => p);
    } catch (error) {
        console.error("Error getting phonemes:", error);
        throw new Error("Could not get phonemes for the word.");
    }
};