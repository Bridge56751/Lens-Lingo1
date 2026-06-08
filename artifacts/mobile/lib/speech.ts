import * as Speech from "expo-speech";
import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths, Directory } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { getDeviceIdSync } from "@/lib/device";
import { authHeader } from "@/lib/authToken";
import type { Language } from "@/hooks/usePreferences";
import { resolveBundledAudio, hasBundledAudio } from "@/lib/offlineAssets";

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
// On web we keep clips in memory only (blobs can't be cheaply persisted across
// reloads, and the web preview isn't the real target). On native we persist
// rendered MP3s to the Caches directory and remember them across app restarts via
// a small manifest, so each phrase is synthesized once and then plays instantly
// (and offline) forever after. Caches (not Documents) is used because the audio
// is always re-downloadable: the OS may reclaim it under storage pressure, and
// Apple guidelines keep re-downloadable data out of iCloud backups.
const MAX_CACHE = Platform.OS === "web" ? 60 : 600;
const CACHE_DIR_NAME = "tts-cache";
const MANIFEST_NAME = "manifest.json";
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

/** Low-collision filename stem for a clip key (two independent rolling hashes). */
function fileKey(s: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = ((h2 << 5) + h2 + c) | 0;
  }
  // `_` separates the two halves so the mapping is injective (base36 never
  // contains `_`); without it variable-length halves could collide and two clip
  // keys would share one MP3 path (wrong audio + unsafe eviction).
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

// --- persistent cache (native only) ----------------------------------------
// Rendered clips survive app restarts: MP3s live in a Caches subdirectory and a
// manifest of clip keys lets the in-memory index rehydrate on launch, so a
// phrase fetched in a previous session plays instantly (and offline).
let cacheDir: Directory | null = null;
let cacheDirResolved = false;
function getCacheDir(): Directory | null {
  if (Platform.OS === "web") return null;
  if (cacheDirResolved) return cacheDir;
  cacheDirResolved = true;
  try {
    const dir = new Directory(Paths.cache, CACHE_DIR_NAME);
    if (!dir.exists) dir.create({ intermediates: true });
    cacheDir = dir;
  } catch {
    cacheDir = null;
  }
  return cacheDir;
}

let cacheLoaded = false;
let cacheLoadPromise: Promise<void> | null = null;
/** Rehydrate the in-memory index from the on-disk manifest (native, once). */
function ensureCacheLoaded(): Promise<void> {
  if (Platform.OS === "web" || cacheLoaded) return Promise.resolve();
  if (cacheLoadPromise) return cacheLoadPromise;
  cacheLoadPromise = (async () => {
    try {
      const dir = getCacheDir();
      if (!dir) return;
      const manifest = new File(dir, MANIFEST_NAME);
      if (!manifest.exists) return;
      const data = JSON.parse(manifest.textSync()) as { items?: string[] };
      const keys = Array.isArray(data.items) ? data.items : [];
      for (const key of keys) {
        if (audioCache.has(key)) continue;
        try {
          const f = new File(dir, `${fileKey(key)}.mp3`);
          if (f.exists) audioCache.set(key, f.uri);
        } catch {
          // skip an unreadable entry
        }
      }
    } catch {
      // ignore a missing/corrupt manifest
    } finally {
      cacheLoaded = true;
    }
  })();
  return cacheLoadPromise;
}

let manifestTimer: ReturnType<typeof setTimeout> | null = null;
function persistManifest(): void {
  manifestTimer = null;
  if (Platform.OS === "web") return;
  try {
    const dir = getCacheDir();
    if (!dir) return;
    const keys: string[] = [];
    for (const [k, v] of audioCache) if (typeof v === "string") keys.push(k);
    const manifest = new File(dir, MANIFEST_NAME);
    const body = JSON.stringify({ v: 1, items: keys });
    try {
      manifest.write(body);
    } catch {
      try {
        manifest.create();
        manifest.write(body);
      } catch {
        // ignore write failure
      }
    }
  } catch {
    // ignore
  }
}
/** Debounced manifest write so rapid caching doesn't thrash the disk. */
function schedulePersistManifest(): void {
  if (Platform.OS === "web") return;
  if (manifestTimer) clearTimeout(manifestTimer);
  manifestTimer = setTimeout(persistManifest, 800);
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
  schedulePersistManifest();
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
  await ensureCacheLoaded();
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

  // Pre-bundled audio ships with the app: resolve it to a local file URI and
  // play it directly (offline, instant, correct). It is intentionally NOT put
  // through store()/the LRU cache so eviction can never delete the packaged file.
  const bundled = await resolveBundledAudio(text, language);
  if (bundled) return bundled;

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
          ...(await authHeader()),
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
      const dir = getCacheDir();
      const file = dir
        ? new File(dir, `${fileKey(key)}.mp3`)
        : new File(Paths.cache, `tts-${fileKey(key)}.mp3`);
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
// The clip (text+language key) currently loading or audibly playing, plus the
// in-flight promise for it. speakWord ignores a repeat tap for this same clip so
// mashing a speaker button can't stack the same voice over itself ("again and
// again while loading"). A different word still supersedes the current one.
let activeSpeakKey: string | null = null;
let activeSpeakPromise: Promise<void> | null = null;

/**
 * Release the per-clip re-entrancy lock for the request identified by `token`,
 * but only if a newer tap hasn't already taken ownership. Every place that
 * learns a clip has reached a terminal state — natural finish, error, or an
 * interruption/unload that never emits a "finished" event — calls this so the
 * lock can never get permanently stuck on one word.
 */
function releaseSpeakLock(token: number): void {
  if (token === playToken) {
    activeSpeakKey = null;
    activeSpeakPromise = null;
  }
}

let nativePlayer: AudioPlayer | null = null;
// Every native player we create is tracked here until torn down. Spam-tapping
// can create a player and supersede it before its clip finishes loading; on
// native, remove() on a still-loading player doesn't always halt the deferred
// playback, so a superseded clip can still start and overlap ("stacked
// voices"). Stopping every tracked player on teardown — not just the latest —
// guarantees no orphan keeps playing.
const nativePlayers = new Set<AudioPlayer>();
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
  if (nativePlayers.size > 0) {
    for (const p of nativePlayers) {
      // Pause first: on a still-loading player remove() alone can let the
      // deferred play() fire anyway, so an explicit pause guarantees silence.
      try {
        p.pause();
      } catch {
        // ignore
      }
      try {
        p.remove();
      } catch {
        // ignore
      }
    }
    nativePlayers.clear();
  }
  nativePlayer = null;
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
    // Tear down this element and release the lock once it reaches any terminal
    // state. `ended` is the natural finish; `error` covers decode/playback
    // failures; `pause` covers an external interruption (another media session,
    // an OS audio focus change) that stops the clip without ever firing `ended`.
    // A natural end does NOT emit `pause`, so these never double-fire, and our
    // own teardown only pauses after bumping playToken — so releaseSpeakLock
    // (token-guarded) won't release a clip a newer tap already owns.
    const finalize = () => {
      if (el.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
      if (webAudio === el) webAudio = null;
      releaseSpeakLock(token);
    };
    el.onended = finalize;
    el.onerror = finalize;
    el.onpause = finalize;
    try {
      await el.play();
    } catch {
      // Autoplay/user-gesture or decode failure — clean up and report failure
      // so the caller can fall back to the on-device voice.
      URL.revokeObjectURL(objectUrl);
      if (webAudio === el) webAudio = null;
      return false;
    }
    // A newer tap may have landed while play() was resolving — stop this clip
    // so two voices don't overlap.
    if (token !== playToken) {
      try {
        el.pause();
      } catch {
        // ignore
      }
      if (el.src.startsWith("blob:")) URL.revokeObjectURL(el.src);
      if (webAudio === el) webAudio = null;
    }
    return true;
  }

  const player = createAudioPlayer({ uri: audio as string });
  nativePlayer = player;
  nativePlayers.add(player);
  // Track whether this clip ever actually started so we can tell a real
  // interruption (it was playing, then stopped) from the normal not-yet-playing
  // states emitted while it loads.
  let started = false;
  player.addListener("playbackStatusUpdate", (status) => {
    if (nativePlayer !== player) return;
    if (status.playing) started = true;
    // Terminal: natural finish.
    const finished = status.didJustFinish;
    // Terminal without a "finished" event: an interruption (phone call, audio
    // focus loss) or engine anomaly stops/unloads the clip after it began. We
    // require `started` so the ordinary loading -> not-playing transitions don't
    // count, and exclude buffering (a transient stall, not a stop).
    const interrupted =
      !finished && started && !status.playing && !status.isBuffering;
    // `started` also guards this: before playback the player legitimately
    // reports isLoaded:false while loading, which is not a terminal state.
    const unloaded = !finished && started && !status.isLoaded;
    if (finished || interrupted || unloaded) {
      teardownPlayback();
      // Release the re-entrancy lock so a fresh tap on the same word plays again
      // (unless a newer tap already took over).
      releaseSpeakLock(token);
    }
  });
  // A newer tap may have superseded this request while the clip was loading;
  // don't even start playback in that case.
  if (token !== playToken) {
    teardownPlayback();
    return true;
  }
  player.play();
  // Guard once more against a request that won the race a moment ago.
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
export function speakWord(word: string, language: Language): Promise<void> {
  const text = word?.trim();
  if (!text) return Promise.resolve();

  // Re-entrancy guard: if this exact clip is already loading or audibly playing,
  // ignore the repeat tap. The slow part is the network fetch, so without this a
  // user mashing the speaker "while loading" kicks off several plays that overlap
  // into stacked, doubled voices. Living in speakWord means every voice line in
  // the app (vocab, study, sentences, alphabet, scan, conversation) is covered.
  const key = clipKey(text, language);
  if (key === activeSpeakKey) {
    return activeSpeakPromise ?? Promise.resolve();
  }

  const token = ++playToken;
  activeTaps++;
  activeSpeakKey = key;
  teardownPlayback();
  cancelSynth();

  let playbackStarted = false;
  const promise = (async () => {
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
      if (token === playToken) {
        if (ok) playbackStarted = true;
        else speakDevice(text, language);
      }
    } catch {
      if (token === playToken) speakDevice(text, language);
    } finally {
      activeTaps = Math.max(0, activeTaps - 1);
      // Resume any prefetch work that was paused while this tap ran.
      if (activeTaps === 0 && prefetchQueue.length > 0) scheduleDrain();
      // Release the lock here only when real audio did NOT start playing (no
      // clip, failure, or device-voice fallback) — when it did, the playback
      // "finished" handler releases it. Never release if a newer tap already
      // took ownership of the lock (token !== playToken).
      if (token === playToken && !playbackStarted) {
        activeSpeakKey = null;
        activeSpeakPromise = null;
      }
    }
  })();
  activeSpeakPromise = promise;
  return promise;
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
      if (!item) continue;
      // Bundled clips need no warming — they're already on-device.
      if (hasBundledAudio(item.text, item.language)) continue;
      if (audioCache.has(clipKey(item.text, item.language))) continue;
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
  if (!text) return;
  // Bundled clips are already on-device — nothing to warm.
  if (hasBundledAudio(text, language)) return;
  if (audioCache.has(clipKey(text, language))) return;
  if (!prefetchQueue.some((i) => i.text === text && i.language === language)) {
    prefetchQueue.push({ text, language });
  }
  scheduleDrain();
}

/** Stop any in-progress speech (remote audio + on-device synth) and prefetch. */
export function stopSpeaking(): void {
  playToken++;
  activeTaps = 0;
  activeSpeakKey = null;
  activeSpeakPromise = null;
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

/**
 * Awaitable bulk warm of the audio cache for an explicit "download for offline"
 * action. Unlike prefetchSpeech (debounced, single-lane, best-effort) this runs
 * a small worker pool and reports progress so the UI can show a bar. Clips
 * already on disk count as done immediately; individual failures are skipped.
 * Stops scheduling new work when `signal` aborts (in-flight requests finish).
 */
export async function cacheAudioClips(
  items: { text: string; language?: Language }[],
  opts?: {
    onProgress?: (completed: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  await ensureCacheLoaded();

  // Dedupe by clip key, dropping blanks, so a shared phrase is fetched once.
  const seen = new Set<string>();
  const queue: { text: string; language?: Language }[] = [];
  for (const it of items) {
    const text = it.text?.trim();
    if (!text) continue;
    // Bundled clips already ship offline — exclude them so they don't inflate
    // the progress total or trigger a needless network fetch.
    if (hasBundledAudio(text, it.language)) continue;
    const key = clipKey(text, it.language);
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push({ text, language: it.language });
  }

  const total = queue.length;
  let completed = 0;
  opts?.onProgress?.(0, total);
  if (total === 0) return;

  const CONCURRENCY = 4;
  let cursor = 0;
  const worker = async () => {
    while (true) {
      if (opts?.signal?.aborted) return;
      const i = cursor++;
      if (i >= queue.length) return;
      const item = queue[i];
      if (item && !audioCache.has(clipKey(item.text, item.language))) {
        try {
          await fetchAudio(item.text, "prefetch", item.language);
        } catch {
          // best-effort
        }
      }
      completed++;
      opts?.onProgress?.(completed, total);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()),
  );
}
