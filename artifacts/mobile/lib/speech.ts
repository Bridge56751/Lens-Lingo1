import * as Speech from "expo-speech";
import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { getDeviceIdSync } from "@/lib/device";
import type { Language } from "@/hooks/usePreferences";

/** BCP-47 voice locales used for the on-device fallback voice, keyed by language. */
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

function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
}

// --- playback state (so stopSpeaking can interrupt) -------------------------
// A token guards against races: rapid taps should only play the latest request.
let playToken = 0;
let nativePlayer: AudioPlayer | null = null;
let nativeFile: File | null = null;
let webAudio: HTMLAudioElement | null = null;
let audioModeReady = false;

function deleteFile(file: File | null): void {
  if (!file) return;
  try {
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
}

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady || Platform.OS === "web") return;
  try {
    // Play through the iOS silent switch — otherwise muted phones hear nothing.
    await setAudioModeAsync({ playsInSilentMode: true });
    audioModeReady = true;
  } catch {
    // best-effort
  }
}

function teardownPlayback(): void {
  if (webAudio) {
    try {
      webAudio.pause();
      if (webAudio.src.startsWith("blob:")) URL.revokeObjectURL(webAudio.src);
    } catch {
      // ignore
    }
    webAudio = null;
  }
  if (nativePlayer) {
    try {
      nativePlayer.remove();
    } catch {
      // ignore
    }
    nativePlayer = null;
  }
  if (nativeFile) {
    deleteFile(nativeFile);
    nativeFile = null;
  }
}

// --- on-device fallback voice (used when the network TTS is unavailable) -----
function speakWebSynth(text: string, locale: string): void {
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
    utter.rate = 0.95;
    utter.pitch = 1.05;
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
    const handler = () => {
      synth.removeEventListener("voiceschanged", handler);
      speak();
    };
    synth.addEventListener("voiceschanged", handler);
    setTimeout(speak, 300);
  }
}

function speakDevice(text: string, language: Language): void {
  const locale = SPEECH_LOCALES[language] ?? "en-US";
  try {
    if (Platform.OS === "web") {
      speakWebSynth(text, locale);
      return;
    }
    Speech.stop();
    Speech.speak(text, { language: locale, rate: 0.95 });
  } catch {
    // ignore
  }
}

async function playRemote(text: string, token: number): Promise<boolean> {
  const url = `${apiBaseUrl()}/api/openai/tts`;
  const deviceId = getDeviceIdSync();
  const res = await expoFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(deviceId ? { "x-device-id": deviceId } : {}),
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) return false;
  // A newer request started while we were fetching — discard this audio.
  if (token !== playToken) return true;

  if (Platform.OS === "web") {
    const blob = await res.blob();
    if (token !== playToken) return true;
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    webAudio = audio;
    audio.onended = () => {
      if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
      if (webAudio === audio) webAudio = null;
    };
    try {
      await audio.play();
    } catch {
      // Autoplay/user-gesture policy can reject — clean up and let the caller
      // fall back to the on-device voice.
      URL.revokeObjectURL(objectUrl);
      if (webAudio === audio) webAudio = null;
      return false;
    }
    return true;
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (token !== playToken) return true;
  const file = new File(Paths.cache, `tts-${token}.mp3`);
  try {
    file.write(bytes);
  } catch {
    // overwrite path: ensure it exists then write
    try {
      file.create();
      file.write(bytes);
    } catch {
      deleteFile(file);
      return false;
    }
  }
  await ensureAudioMode();
  if (token !== playToken) {
    deleteFile(file);
    return true;
  }
  const player = createAudioPlayer({ uri: file.uri });
  nativePlayer = player;
  nativeFile = file;
  // Free the player and temp file once playback finishes, unless a newer
  // utterance has already taken over (teardownPlayback handles that case).
  player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish && nativePlayer === player) {
      teardownPlayback();
    }
  });
  player.play();
  return true;
}

/**
 * Speak a word/phrase aloud in the given language. Uses OpenAI's natural,
 * smooth voices via the API server; if that fails (offline, server error) it
 * falls back to the on-device system voice so playback still happens.
 */
export function speakWord(word: string, language: Language): void {
  const text = word?.trim();
  if (!text) return;

  const token = ++playToken;
  // Interrupt anything currently playing before starting the new utterance.
  teardownPlayback();
  try {
    if (Platform.OS === "web") {
      (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis?.cancel();
    } else {
      Speech.stop();
    }
  } catch {
    // ignore
  }

  void playRemote(text, token)
    .then((ok) => {
      if (!ok && token === playToken) speakDevice(text, language);
    })
    .catch(() => {
      if (token === playToken) speakDevice(text, language);
    });
}

/** Stop any in-progress speech (remote audio + on-device synth). */
export function stopSpeaking(): void {
  playToken++;
  teardownPlayback();
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
