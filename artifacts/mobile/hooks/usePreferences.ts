import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
  "Dutch",
] as const;

export type Language = (typeof LANGUAGES)[number];

export type Preferences = {
  targetLanguage: Language;
  nativeLanguage: string;
  displayName: string;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  // Per-language flag for hiding the Home alphabet card (keyed by target
  // language). A language is absent/false until the user hides it.
  alphabetCardHidden: Record<string, boolean>;
};

const DEFAULTS: Preferences = {
  targetLanguage: "Spanish",
  nativeLanguage: "English",
  displayName: "Friend",
  hapticsEnabled: true,
  notificationsEnabled: true,
  alphabetCardHidden: {},
};

const STORAGE_KEY = "@linguascan/preferences/v1";

type Listener = (p: Preferences) => void;
let cached: Preferences = { ...DEFAULTS };
let loaded = false;
// Updates made before the initial storage read resolves. They must win over
// (and be merged into) the persisted values so a fast tap isn't clobbered.
const pending: Partial<Preferences> = {};
const listeners = new Set<Listener>();
// Single-flight guard: many components mount usePreferences at once; without
// this they'd each read storage concurrently and a late resolver could
// overwrite newer in-memory updates.
let loadPromise: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Preferences>;
        cached = { ...DEFAULTS, ...parsed, ...pending };
      }
    } catch {
      // ignore
    }
    loaded = true;
    // Persist now if there were updates queued before load completed; writing
    // earlier could have clobbered other persisted keys we hadn't read yet.
    const hadPending = Object.keys(pending).length > 0;
    for (const k of Object.keys(pending)) delete pending[k as keyof Preferences];
    if (hadPending) void writeCached();
    listeners.forEach((l) => l(cached));
  })();
  return loadPromise;
}

async function writeCached() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // ignore
  }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(cached);

  useEffect(() => {
    const listener: Listener = (next) => setPrefs(next);
    listeners.add(listener);
    ensureLoaded();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const update = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    cached = { ...cached, [key]: value };
    listeners.forEach((l) => l(cached));
    if (loaded) {
      void writeCached();
    } else {
      // Queue until the initial read resolves; ensureLoaded merges + persists.
      pending[key] = value;
    }
  }, []);

  return { prefs, update };
}
