import { Platform } from "react-native";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { getDeviceIdSync } from "@/lib/device";
import { authHeader } from "@/lib/authToken";

const MAX_AUDIO_BASE64_LEN = 7_000_000;

export const WHISPER_LANG: Record<string, string> = {
  English: "en",
  Spanish: "es",
  French: "fr",
  German: "de",
  Italian: "it",
  Portuguese: "pt",
  Japanese: "ja",
  Chinese: "zh",
  Korean: "ko",
  Arabic: "ar",
  Russian: "ru",
  Hindi: "hi",
  Dutch: "nl",
};

/** Thrown when a recording exceeds the size the transcription endpoint accepts. */
export class AudioTooLongError extends Error {}
/** Thrown when transcription returns no speech. */
export class EmptyTranscriptError extends Error {}

// Reads a recorded audio file into base64. On web, expo-file-system's File API
// can't read the blob: URLs that expo-audio produces, so fetch the blob and
// convert it with FileReader instead. Native uses the File API directly.
export async function readAudio(uri: string): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === "web") {
    const blob = await fetch(uri).then((r) => r.blob());
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read audio"));
      reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.includes(",")
      ? dataUrl.slice(dataUrl.indexOf(",") + 1)
      : "";
    const mimeType = (blob.type || "audio/webm").split(";")[0] ?? "audio/webm";
    return { base64, mimeType };
  }
  const base64 = await new File(uri).base64();
  return { base64, mimeType: "audio/m4a" };
}

/**
 * Reads a recorded audio file and transcribes it via the Whisper endpoint.
 * Throws AudioTooLongError / EmptyTranscriptError for the cases callers usually
 * want to surface distinctly; any other failure throws a generic Error.
 */
export async function transcribeAudio(uri: string, language: string): Promise<string> {
  const { base64, mimeType } = await readAudio(uri);
  if (!base64) throw new Error("Empty recording");
  if (base64.length > MAX_AUDIO_BASE64_LEN) throw new AudioTooLongError();

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";

  const response = await expoFetch(`${baseUrl}/api/openai/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getDeviceIdSync() ? { "x-device-id": getDeviceIdSync()! } : {}),
      ...(await authHeader()),
    },
    body: JSON.stringify({ audioBase64: base64, mimeType, language: WHISPER_LANG[language] }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = (await response.json()) as { text?: string };
  const transcript = data.text?.trim();
  if (!transcript) throw new EmptyTranscriptError();
  return transcript;
}
