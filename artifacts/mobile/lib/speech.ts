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

// --- audio cache ------------------------------------------------------------
// Synthesis + network round-trip is the slow part (a few seconds over the dev
// tunnel), so we cache each rendered clip and reuse it on repeat taps. Callers
// can also prefetch (e.g. as soon as a scan result or alphabet letter shows) so
// the audio is ready before the user taps. On web we cache the Blob; on native
// we cache the path of the written MP3.
const MAX_CACHE = 60;
type CacheValue = Blob | string;
const audioCache = new Map<string, CacheValue>();
const inflight = new Map<string, Promise<CacheValue | null>>();

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function touch(key: string, val: CacheValue): void {
  // Re-insert to mark as most-recently-used (Map preserves insertion order).
  audioCache.delete(key);
  audioCache.set(key, val);
}

function store(key: string, val: CacheValue): void {
  audioCache.set(key, val);
  while (audioCache.size > MAX_CACHE) {
    const oldest = audioCache.keys().next().value;
    if (oldest === undefined) break;
    const evicted = audioCache.get(oldest);
    audioCache.delete(oldest);
    if (typeof evicted === "string") {
      try {
        const f = new File(evicted);
        if (f.exists) f.delete();
      } catch {
        // ignore
      }
    }
  }
}

/** Fetch (or reuse cached) synthesized audio for `text`. Never throws. */
async function fetchAudio(text: string): Promise<CacheValue | null> {
  const cached = audioCache.get(text);
  if (cached !== undefined) {
    if (typeof cached === "string") {
      // Native: make sure the cached temp file still exists.
      try {
        if (new File(cached).exists) {
          touch(text, cached);
          return cached;
        }
      } catch {
        // fall through to re-fetch
      }
      audioCache.delete(text);
    } else {
      touch(text, cached);
      return cached;
    }
  }

  const pending = inflight.get(text);
  if (pending) return pending;

  const job = (async (): Promise<CacheValue | null> => {
    try {
      const deviceId = getDeviceIdSync();
      const res = await expoFetch(`${apiBaseUrl()}/api/openai/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(deviceId ? { "x-device-id": deviceId } : {}),
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;

      if (Platform.OS === "web") {
        const blob = await res.blob();
        store(text, blob);
        return blob;
      }

      const bytes = new Uint8Array(await res.arrayBuffer());
      const file = new File(Paths.cache, `tts-${hashKey(text)}.mp3`);
      try {
        file.write(bytes);
      } catch {
        try {
          file.create();
          file.write(bytes);
        } catch {
          return null;
        }
      }
      store(text, file.uri);
      return file.uri;
    } catch {
      return null;
    } finally {
      inflight.delete(text);
    }
  })();

  inflight.set(text, job);
  return job;
}

// --- playback state (so stopSpeaking can interrupt) -------------------------
// A token guards against races: rapid taps should only play the latest request.
let playToken = 0;
let nativePlayer: AudioPlayer | null = null;
let webAudio: HTMLAudioElement | null = null;
let audioModeReady = false;

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
  // Note: cached files/blobs are intentionally NOT removed here — they're owned
  // by the cache and reused across plays.
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
}

function cancelSynth(): void {
  try {
    if (Platform.OS === "web") {
      (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis?.cancel();
    } else {
      Speech.stop();
    }
  } catch {
    // ignore
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

async function playCached(audio: CacheValue, token: number): Promise<boolean> {
  if (Platform.OS === "web") {
    const objectUrl = URL.createObjectURL(audio as Blob);
    const el = new Audio(objectUrl);
    webAudio = el;
    el.onended = () => {
      if (el.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
      if (webAudio === el) webAudio = null;
    };
    try {
      await el.play();
    } catch {
      // Autoplay/user-gesture or decode failure — clean up and report failure
      // so the caller can fall back to the on-device voice.
      URL.revokeObjectURL(objectUrl);
      if (webAudio === el) webAudio = null;
      return false;
    }
    return true;
  }

  const player = createAudioPlayer({ uri: audio as string });
  nativePlayer = player;
  player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish && nativePlayer === player) teardownPlayback();
  });
  player.play();
  // Guard against a newer request that started while the player was loading.
  if (token !== playToken) {
    teardownPlayback();
  }
  return true;
}

/**
 * Speak a word/phrase aloud in the given language. Uses OpenAI's natural,
 * smooth voices via the API server (cached for instant repeats); if that fails
 * (offline, server error) it falls back to the on-device voice.
 */
export function speakWord(word: string, language: Language): void {
  const text = word?.trim();
  if (!text) return;

  const token = ++playToken;
  teardownPlayback();
  cancelSynth();

  void (async () => {
    const audio = await fetchAudio(text);
    if (token !== playToken) return; // superseded by a newer tap
    if (!audio) {
      speakDevice(text, language);
      return;
    }
    await ensureAudioMode();
    if (token !== playToken) return;
    try {
      const ok = await playCached(audio, token);
      if (!ok && token === playToken) speakDevice(text, language);
    } catch {
      if (token === playToken) speakDevice(text, language);
    }
  })();
}

/**
 * Warm the cache for `text` without playing it, so a later tap is instant.
 * Safe to call repeatedly; concurrent calls for the same text are de-duped.
 */
export function prefetchSpeech(word: string, _language?: Language): void {
  const text = word?.trim();
  if (!text) return;
  void fetchAudio(text).catch(() => {});
}

/** Stop any in-progress speech (remote audio + on-device synth). */
export function stopSpeaking(): void {
  playToken++;
  teardownPlayback();
  cancelSynth();
}
