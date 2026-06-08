import { fetch as expoFetch } from "expo/fetch";
import { getDeviceIdSync } from "@/lib/device";
import { authHeader } from "@/lib/authToken";

// Target languages written in a non-Latin script, where a Latin-alphabet
// romanization is a useful reading aid. Mirrors the server's NON_LATIN_LANGUAGES.
const NON_LATIN = new Set([
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
]);

export function isNonLatinLanguage(language: string | undefined | null): boolean {
  return NON_LATIN.has((language ?? "").trim());
}

function baseUrl(): string {
  return process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
}

async function buildHeaders(): Promise<Record<string, string>> {
  const deviceId = getDeviceIdSync();
  return {
    "Content-Type": "application/json",
    ...(deviceId ? { "x-device-id": deviceId } : {}),
    ...(await authHeader()),
  };
}

// On-demand romanization of a single string (e.g. one chat message). Mirrors the
// chat Translate flow: not persisted, fetched only when the user opts in.
export async function romanizeText(text: string, language: string): Promise<string> {
  const response = await expoFetch(`${baseUrl()}/api/openai/romanize`, {
    method: "POST",
    headers: await buildHeaders(),
    body: JSON.stringify({ text, language }),
  });
  if (!response.ok) throw new Error("romanize failed");
  const data = (await response.json()) as { romanization?: string };
  if (!data.romanization) throw new Error("empty romanization");
  return data.romanization;
}

// Batch romanization for a whole word/sentence list in one call. Falls back to
// the original strings if the server can't align the response.
export async function romanizeBatch(texts: string[], language: string): Promise<string[]> {
  const response = await expoFetch(`${baseUrl()}/api/openai/romanize`, {
    method: "POST",
    headers: await buildHeaders(),
    body: JSON.stringify({ texts, language }),
  });
  if (!response.ok) throw new Error("romanize failed");
  const data = (await response.json()) as { romanizations?: string[] };
  return Array.isArray(data.romanizations) ? data.romanizations : texts;
}
