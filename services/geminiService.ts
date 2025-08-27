/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });


// --- Helper Functions ---

/**
 * Creates a fallback prompt to use when the primary one is blocked.
 * @param character The PUBG outfit string (e.g., "Blood Raven X-Suit").
 * @returns The fallback prompt string.
 */
function getFallbackPrompt(character: string): string {
    return `Create a photorealistic image of the person in this photo wearing the PUBG outfit "${character}". CRITICAL: The character's face must be clearly visible and UNCOVERED by any helmets or masks. Their face must keep the original facial features from the photo. The image should show them in a dynamic action pose within a battle royale setting. Ensure the final image is a clear photograph that looks authentic.`;
}

/**
 * Extracts the outfit name (e.g., "Blood Raven X-Suit") from a prompt string.
 * @param prompt The original prompt.
 * @returns The outfit name string or null if not found.
 */
function extractCharacter(prompt: string): string | null {
    const match = prompt.match(/wearing the iconic PUBG outfit: "(.*?)"/);
    return match ? match[1] : null;
}

/**
 * Processes the Gemini API response, extracting the image or throwing an error if none is found.
 * @param response The response from the generateContent call.
 * @returns A data URL string for the generated image.
 */
function processGeminiResponse(response: GenerateContentResponse): string {
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        return `data:${mimeType};base64,${data}`;
    }

    const textResponse = response.text;
    console.error("API did not return an image. Response:", textResponse);
    throw new Error(`The AI model responded with text instead of an image: "${textResponse || 'No text response received.'}"`);
}


/**
 * A generic retry wrapper for Gemini API calls. Implements exponential backoff with jitter.
 * @param apiCall A function that returns the promise from the API call.
 * @returns The result of the API call.
 */
async function withRetry<T>(apiCall: () => Promise<T>): Promise<T> {
    const maxRetries = 3;
    const initialDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiCall();
        } catch (error: any) {
            console.error(`Error calling Gemini API (Attempt ${attempt}/${maxRetries}):`, error);

            // Dig into the error object to find a status code.
            const status = error?.error?.code || error?.status;
            const message = error?.error?.message || error?.message || '';

            // Retriable codes: 500 (Internal), 503 (Service Unavailable).
            const isRetriable = [500, 503].includes(status) || message.toLowerCase().includes('internal');

            if (isRetriable && attempt < maxRetries) {
                // Exponential backoff with jitter
                const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
                console.log(`Retriable error detected (status: ${status || 'N/A'}). Retrying in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // For non-retriable errors or if retries are exhausted, re-throw a consistent error.
            if (error instanceof Error) {
                throw error;
            } else {
                throw new Error(`Gemini API call failed: ${message || JSON.stringify(error)}`);
            }
        }
    }
    // This should be unreachable due to the loop and throw logic above.
    throw new Error("Gemini API call failed after all retries.");
}


/**
 * Generates a character-styled image from a source image and a prompt.
 * It includes a fallback mechanism for prompts that might be blocked.
 * @param imageDataUrl A data URL string of the source image (e.g., 'data:image/png;base64,...').
 * @param prompt The prompt to guide the image generation.
 * @returns A promise that resolves to a base64-encoded image data URL of the generated image.
 */
export async function generateCharacterImage(imageDataUrl: string, prompt: string): Promise<string> {
  const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!match) {
    throw new Error("Invalid image data URL format. Expected 'data:image/...;base64,...'");
  }
  const [, mimeType, base64Data] = match;

    const imagePart = {
        inlineData: { mimeType, data: base64Data },
    };

    // --- First attempt with the original prompt ---
    try {
        console.log("Attempting generation with original prompt...");
        const textPart = { text: prompt };
        const response = await withRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        }));
        return processGeminiResponse(response);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        const isNoImageError = errorMessage.includes("The AI model responded with text instead of an image");

        if (isNoImageError) {
            console.warn("Original prompt was likely blocked. Trying a fallback prompt.");
            const character = extractCharacter(prompt);
            if (!character) {
                console.error("Could not extract character from prompt, cannot use fallback.");
                throw error; // Re-throw the original "no image" error.
            }

            // --- Second attempt with the fallback prompt ---
            try {
                const fallbackPrompt = getFallbackPrompt(character);
                console.log(`Attempting generation with fallback prompt for ${character}...`);
                const fallbackTextPart = { text: fallbackPrompt };
                const fallbackResponse = await withRetry(() => ai.models.generateContent({
                    model: 'gemini-2.5-flash-image-preview',
                    contents: { parts: [imagePart, fallbackTextPart] },
                    config: {
                        responseModalities: [Modality.IMAGE, Modality.TEXT],
                    },
                }));
                return processGeminiResponse(fallbackResponse);
            } catch (fallbackError) {
                console.error("Fallback prompt also failed.", fallbackError);
                const finalErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                throw new Error(`The AI model failed with both original and fallback prompts. Last error: ${finalErrorMessage}`);
            }
        } else {
            // This is for other errors, like a final internal server error after retries.
            console.error("An unrecoverable error occurred during image generation.", error);
            throw new Error(`The AI model failed to generate an image. Details: ${errorMessage}`);
        }
    }
}

/**
 * Analyzes an image to determine the subject's gender.
 * @param imageDataUrl A data URL string of the source image.
 * @returns A promise that resolves to 'Male', 'Female', or 'Unknown'.
 */
export async function detectGender(imageDataUrl: string): Promise<'Male' | 'Female' | 'Unknown'> {
    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!match) {
        throw new Error("Invalid image data URL format for gender detection.");
    }
    const [, mimeType, base64Data] = match;

    const imagePart = {
        inlineData: { mimeType, data: base64Data },
    };
    const textPart = {
        text: "Analyze the person in this image and determine their most likely gender. Respond with only one word: 'Male', 'Female', or 'Unknown'."
    };

    try {
        const response = await withRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        }));

        const resultText = response.text.trim().toLowerCase();
        
        if (resultText.includes('male')) {
            return 'Male';
        } else if (resultText.includes('female')) {
            return 'Female';
        } else {
            console.warn(`Gender detection returned an unexpected value: "${resultText}". Defaulting to 'Unknown'.`);
            return 'Unknown';
        }
    } catch (error) {
        console.error("Error during gender detection after retries:", error);
        // In case of API error, default to 'Unknown' to allow the app to proceed
        return 'Unknown';
    }
}