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
type Priority = "tap" | "prefetch";
interface Pending {
  promise: Promise<CacheValue | null>;
  controller: AbortController;
  priority: Priority;
}
const audioCache = new Map<string, CacheValue>();
const inflight = new Map<string, Pending>();

/**
 * Abort any in-flight prefetch requests (optionally keeping one for `keep`).
 * A real tap calls this so its own request isn't stuck behind a queue of
 * lower-priority prefetches saturating the server.
 */
function cancelPrefetches(keep?: string): void {
  for (const [text, p] of inflight) {
    if (p.priority === "prefetch" && text !== keep) {
      try {
        p.controller.abort();
      } catch {
        // ignore
      }
      inflight.delete(text);
    }
  }
}

/** Abort superseded in-flight tap requests so they stop burning server capacity. */
function cancelTaps(keep?: string): void {
  for (const [text, p] of inflight) {
    if (p.priority === "tap" && text !== keep) {
      try {
        p.controller.abort();
      } catch {
        // ignore
      }
      inflight.delete(text);
    }
  }
}

// Number of taps currently fetching/starting playback. While > 0 the prefetch
// queue is paused so a tap always has a clear lane to the server.
let activeTaps = 0;

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

/**
 * Cache/queue key for a clip. Language is part of the key because the same text
 * (e.g. kanji shared between Japanese and Chinese) must not reuse a clip
 * rendered with another language's accent.
 */
function clipKey(text: string, language?: Language): string {
  return language ? `${language}\u0001${text}` : text;
}

/** Fetch (or reuse cached) synthesized audio for `text`. Never throws. */
async function fetchAudio(
  text: string,
  priority: Priority,
  language?: Language,
): Promise<CacheValue | null> {
  const key = clipKey(text, language);
  const cached = audioCache.get(key);
  if (cached !== undefined) {
    if (typeof cached === "string") {
      // Native: make sure the cached temp file still exists.
      try {
        if (new File(cached).exists) {
          touch(key, cached);
          return cached;
        }
      } catch {
        // fall through to re-fetch
      }
      audioCache.delete(key);
    } else {
      touch(key, cached);
      return cached;
    }
  }

  // A real tap should never queue behind prefetch traffic or stale taps.
  if (priority === "tap") {
    cancelPrefetches(key);
    cancelTaps(key);
  }

  const pending = inflight.get(key);
  if (pending) {
    if (priority === "tap") pending.priority = "tap";
    return pending.promise;
  }

  const controller = new AbortController();
  const job = (async (): Promise<CacheValue | null> => {
    try {
      const deviceId = getDeviceIdSync();
      const res = await expoFetch(`${apiBaseUrl()}/api/openai/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(deviceId ? { "x-device-id": deviceId } : {}),
        },
        body: JSON.stringify(language ? { text, language } : { text }),
        signal: controller.signal,
      });
      if (!res.ok) return null;

      if (Platform.OS === "web") {
        const blob = await res.blob();
        store(key, blob);
        return blob;
      }

      const bytes = new Uint8Array(await res.arrayBuffer());
      const file = new File(Paths.cache, `tts-${hashKey(key)}.mp3`);
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
      store(key, file.uri);
      return file.uri;
    } catch {
      // Includes AbortError when a tap cancels a prefetch.
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, { promise: job, controller, priority });
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
  activeTaps++;
  teardownPlayback();
  cancelSynth();

  void (async () => {
    try {
      const audio = await fetchAudio(text, "tap", language);
      if (token !== playToken) return; // superseded by a newer tap
      if (!audio) {
        speakDevice(text, language);
        return;
      }
      await ensureAudioMode();
      if (token !== playToken) return;
      const ok = await playCached(audio, token);
      if (!ok && token === playToken) speakDevice(text, language);
    } catch {
      if (token === playToken) speakDevice(text, language);
    } finally {
      activeTaps = Math.max(0, activeTaps - 1);
      // Resume any prefetch work that was paused while this tap ran.
      if (activeTaps === 0 && prefetchQueue.length > 0) scheduleDrain();
    }
  })();
}

// --- prefetch queue --------------------------------------------------------
// Prefetch is best-effort and must never flood the server: requests are
// debounced (so rapid letter/page switches collapse) and run one at a time, so
// a real tap always has a clear lane.
const PREFETCH_DEBOUNCE_MS = 350;
type PrefetchItem = { text: string; language?: Language };
let prefetchQueue: PrefetchItem[] = [];
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
let prefetchRunning = false;

async function drainPrefetchQueue(): Promise<void> {
  if (prefetchRunning) return;
  prefetchRunning = true;
  try {
    // Pause while a tap is running so prefetch never contends for the server.
    while (prefetchQueue.length > 0 && activeTaps === 0) {
      const item = prefetchQueue.shift();
      if (!item || audioCache.has(clipKey(item.text, item.language))) continue;
      await fetchAudio(item.text, "prefetch", item.language);
    }
  } finally {
    prefetchRunning = false;
  }
}

function scheduleDrain(): void {
  if (prefetchTimer) clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    prefetchTimer = null;
    void drainPrefetchQueue();
  }, PREFETCH_DEBOUNCE_MS);
}

/**
 * Warm the cache for `text` without playing it, so a later tap is instant.
 * Debounced and serialized so rapid navigation never floods the server.
 */
export function prefetchSpeech(word: string, language?: Language): void {
  const text = word?.trim();
  if (!text || audioCache.has(clipKey(text, language))) return;
  if (!prefetchQueue.some((i) => i.text === text && i.language === language)) {
    prefetchQueue.push({ text, language });
  }
  scheduleDrain();
}

/** Stop any in-progress speech (remote audio + on-device synth) and prefetch. */
export function stopSpeaking(): void {
  playToken++;
  activeTaps = 0;
  prefetchQueue = [];
  if (prefetchTimer) {
    clearTimeout(prefetchTimer);
    prefetchTimer = null;
  }
  cancelPrefetches();
  cancelTaps();
  teardownPlayback();
  cancelSynth();
}
