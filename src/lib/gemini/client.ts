import { GoogleGenAI } from "@google/genai";

let instance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (instance) return instance;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  instance = new GoogleGenAI({ apiKey });
  return instance;
}
