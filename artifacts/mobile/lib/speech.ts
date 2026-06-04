import * as Speech from "expo-speech";
import type { Language } from "@/hooks/usePreferences";

/** BCP-47 voice locales used for text-to-speech, keyed by learning language. */
export const SPEECH_LOCALES: Record<Language, string> = {
  English: "en-US",
  Spanish: "es-ES",
  French: "fr-FR",
  German: "de-DE",
  Italian: "it-IT",
  Portuguese: "pt-PT",
  Japanese: "ja-JP",
  Chinese: "zh-CN",
  Korean: "ko-KR",
  Arabic: "ar-SA",
  Russian: "ru-RU",
  Hindi: "hi-IN",
  Dutch: "nl-NL",
};

/** Speak a word aloud in the given language, cancelling anything in progress. */
export function speakWord(word: string, language: Language): void {
  // TTS support varies by platform/runtime (notably web); never let a speech
  // failure crash the caller.
  try {
    Speech.stop();
    Speech.speak(word, {
      language: SPEECH_LOCALES[language] ?? "en-US",
      rate: 0.9,
    });
  } catch {
    // ignore — speech is a non-critical enhancement
  }
}
