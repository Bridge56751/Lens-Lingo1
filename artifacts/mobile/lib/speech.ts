import * as Speech from "expo-speech";
import { Platform } from "react-native";
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

/**
 * Web speech via the SpeechSynthesis API directly. `Speech.speak` (expo-speech)
 * is unreliable on web: it often stays silent when no voice matches the locale,
 * or when voices haven't finished loading yet (they load asynchronously and the
 * first `getVoices()` can return an empty list). We pick the best matching voice
 * and, if none are loaded yet, wait for `voiceschanged` (with a timed fallback).
 */
function speakWeb(text: string, locale: string): void {
  const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const SU = (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance })
    .SpeechSynthesisUtterance;
  if (!synth || !SU) return;

  synth.cancel();

  let spoken = false;
  const speak = () => {
    if (spoken) return;
    spoken = true;
    const utter = new SU(text);
    utter.lang = locale;
    utter.rate = 0.9;
    const prefix = (locale.split("-")[0] ?? "").toLowerCase();
    const voices = synth.getVoices();
    const match =
      voices.find((v) => v.lang === locale) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
      voices[0];
    if (match) utter.voice = match;
    synth.speak(utter);
  };

  if (synth.getVoices().length > 0) {
    speak();
  } else {
    // Voices not ready yet — speak once they load, or after a short fallback.
    const handler = () => {
      synth.removeEventListener("voiceschanged", handler);
      speak();
    };
    synth.addEventListener("voiceschanged", handler);
    setTimeout(speak, 300);
  }
}

/** Speak a word/phrase aloud in the given language, cancelling anything in progress. */
export function speakWord(word: string, language: Language): void {
  const locale = SPEECH_LOCALES[language] ?? "en-US";
  // TTS support varies by platform/runtime; never let a speech failure crash
  // the caller — it's a non-critical enhancement.
  try {
    if (Platform.OS === "web") {
      speakWeb(word, locale);
      return;
    }
    Speech.stop();
    Speech.speak(word, { language: locale, rate: 0.9 });
  } catch {
    // ignore
  }
}

/** Stop any in-progress speech (web-aware: expo-speech can't cancel web synth). */
export function stopSpeaking(): void {
  try {
    if (Platform.OS === "web") {
      (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis?.cancel();
      return;
    }
    Speech.stop();
  } catch {
    // ignore
  }
}
