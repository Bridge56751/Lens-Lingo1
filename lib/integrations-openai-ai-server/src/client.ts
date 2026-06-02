import OpenAI from "openai";

// Prefer the user's own OpenAI API key (direct OpenAI API) when available.
// Fall back to Replit AI Integrations proxy env vars otherwise.
const hasUserKey = !!process.env.OPENAI_API_KEY;

if (!hasUserKey) {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    throw new Error(
      "OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }

  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }
}

export const openai = hasUserKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
