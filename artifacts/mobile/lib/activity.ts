import AsyncStorage from "@react-native-async-storage/async-storage";

// Local practice-activity log. Streaks and daily progress are derived from this
// (merged with conversation history) so ANY practice — chats, flashcards,
// alphabet, sentences, voice — counts, not just newly created conversations.
const EVENTS_KEY = "@linguascan/activity/events/v1";
const VOICE_KEY = "@linguascan/activity/lastVoiceChat/v1";
// Cap the stored event list so it can't grow without bound. A year of heavy
// daily use stays well under this.
const MAX_EVENTS = 2000;

let events: string[] = [];
let lastVoiceChat: string | null = null;
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [rawEvents, rawVoice] = await Promise.all([
        AsyncStorage.getItem(EVENTS_KEY),
        AsyncStorage.getItem(VOICE_KEY),
      ]);
      if (rawEvents) {
        const parsed = JSON.parse(rawEvents);
        if (Array.isArray(parsed)) events = parsed.filter((x) => typeof x === "string");
      }
      lastVoiceChat = rawVoice ?? null;
    } catch {
      // ignore — start empty
    }
    loaded = true;
    emit();
  })();
  return loadPromise;
}

// Serialize writes so two rapid practice actions can't fire overlapping
// setItem calls that finish out of order and clobber the newer event list.
// Each link writes the then-current `events`, so the last write always wins.
let writeChain: Promise<void> = Promise.resolve();

function persistEvents(): Promise<void> {
  writeChain = writeChain.then(async () => {
    try {
      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    } catch {
      // ignore
    }
  });
  return writeChain;
}

/** Record a single practice action (chat message, flashcard, letter, phrase). */
export async function recordPractice(): Promise<void> {
  await ensureLoaded();
  events = [...events, new Date().toISOString()].slice(-MAX_EVENTS);
  emit();
  void persistEvents();
}

/**
 * Stamp the most recent voice-chat usage. Voice flows auto-send afterward, so
 * the practice event itself is recorded by that send — this only tracks "last
 * practiced" so we never double-count one spoken turn.
 */
export async function markVoiceChat(): Promise<void> {
  await ensureLoaded();
  lastVoiceChat = new Date().toISOString();
  emit();
  try {
    await AsyncStorage.setItem(VOICE_KEY, lastVoiceChat);
  } catch {
    // ignore
  }
}

export function subscribeActivity(cb: () => void): () => void {
  listeners.add(cb);
  void ensureLoaded();
  return () => {
    listeners.delete(cb);
  };
}

export function getActivitySnapshot(): {
  events: string[];
  lastVoiceChat: string | null;
  loaded: boolean;
} {
  return { events, lastVoiceChat, loaded };
}
