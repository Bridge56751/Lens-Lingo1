import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export const LANGUAGES = [
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
};

const DEFAULTS: Preferences = {
  targetLanguage: "Spanish",
  nativeLanguage: "English",
  displayName: "Friend",
  hapticsEnabled: true,
  notificationsEnabled: true,
};

const STORAGE_KEY = "@linguascan/preferences/v1";

type Listener = (p: Preferences) => void;
let cached: Preferences = { ...DEFAULTS };
let loaded = false;
const listeners = new Set<Listener>();

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Preferences>;
      cached = { ...DEFAULTS, ...parsed };
    }
  } catch {
    // ignore
  }
  loaded = true;
  listeners.forEach((l) => l(cached));
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
    void writeCached();
  }, []);

  return { prefs, update };
}
