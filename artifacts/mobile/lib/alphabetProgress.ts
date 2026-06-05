import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { ALPHABETS } from "@/constants/alphabets";
import type { Language } from "@/hooks/usePreferences";

// Persisted, reactive record of which alphabet letters the user has mastered,
// so progress survives leaving the screen and is visible on the Home screen.
// Mirrors the lightweight pub/sub + single-flight load pattern in usePreferences.

const STORAGE_KEY = "@linguascan/alphabet-progress/v1";

/** Completed letter indices, keyed by `${language}::${scriptId}`. */
type ProgressMap = Record<string, number[]>;

function compositeKey(language: Language, scriptId: string): string {
  return `${language}::${scriptId}`;
}

type Listener = (m: ProgressMap) => void;
let cached: ProgressMap = {};
let loaded = false;
// Completions made before the initial storage read resolves. They must be
// UNIONED into (never overwrite) the persisted indices for the same script.
const pending: ProgressMap = {};
// Resets made before the initial read. They act as tombstones so a "start over"
// wins over whatever was persisted for that script.
const pendingDeletes = new Set<string>();
const listeners = new Set<Listener>();
let loadPromise: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let parsed: ProgressMap = {};
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw) as ProgressMap;
    } catch {
      // ignore
    }
    const merged: ProgressMap = { ...parsed };
    // Resets queued before load forget the persisted value for that key.
    for (const k of pendingDeletes) delete merged[k];
    // Completions queued before load are unioned in so nothing is lost.
    for (const k of Object.keys(pending)) {
      const base = merged[k] ?? [];
      merged[k] = Array.from(new Set([...base, ...pending[k]]));
    }
    cached = merged;
    loaded = true;
    const hadQueued = Object.keys(pending).length > 0 || pendingDeletes.size > 0;
    for (const k of Object.keys(pending)) delete pending[k];
    pendingDeletes.clear();
    if (hadQueued) void writeCached();
    listeners.forEach((l) => l(cached));
  })();
  return loadPromise;
}

async function writeCached(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // ignore
  }
}

function commit(next: ProgressMap): void {
  cached = next;
  listeners.forEach((l) => l(cached));
  if (loaded) void writeCached();
}

/** Total number of letters across every script of a language. */
export function totalLetters(language: Language): number {
  return (ALPHABETS[language] ?? []).reduce((sum, s) => sum + s.letters.length, 0);
}

export interface LanguageProgress {
  completed: number;
  total: number;
  ratio: number;
  mastered: boolean;
}

/** Aggregate mastery for a language across all of its scripts. */
export function computeLanguageProgress(language: Language, map: ProgressMap): LanguageProgress {
  const scripts = ALPHABETS[language] ?? [];
  let completed = 0;
  for (const s of scripts) {
    const done = map[compositeKey(language, s.id)] ?? [];
    // Guard against indices that no longer exist (e.g. data changed).
    completed += done.filter((i) => i >= 0 && i < s.letters.length).length;
  }
  const total = totalLetters(language);
  const ratio = total > 0 ? completed / total : 0;
  return { completed, total, ratio, mastered: total > 0 && completed >= total };
}

export function useAlphabetProgress() {
  const [map, setMap] = useState<ProgressMap>(cached);

  useEffect(() => {
    const listener: Listener = (next) => setMap({ ...next });
    listeners.add(listener);
    ensureLoaded();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const completedSet = useCallback(
    (language: Language, scriptId: string): Set<number> =>
      new Set(map[compositeKey(language, scriptId)] ?? []),
    [map],
  );

  const markComplete = useCallback((language: Language, scriptId: string, index: number) => {
    const key = compositeKey(language, scriptId);
    if (loaded) {
      const current = cached[key] ?? [];
      if (current.includes(index)) return;
      commit({ ...cached, [key]: [...current, index] });
    } else {
      // Union into the queue; ensureLoaded merges this with persisted indices.
      const current = pending[key] ?? [];
      if (current.includes(index)) return;
      pending[key] = [...current, index];
    }
  }, []);

  const resetScript = useCallback((language: Language, scriptId: string) => {
    const key = compositeKey(language, scriptId);
    if (loaded) {
      const next = { ...cached };
      delete next[key];
      commit(next);
    } else {
      // Tombstone the key so the reset wins over persisted storage after load.
      pendingDeletes.add(key);
      delete pending[key];
    }
  }, []);

  const languageProgress = useCallback(
    (language: Language): LanguageProgress => computeLanguageProgress(language, map),
    [map],
  );

  return { map, completedSet, markComplete, resetScript, languageProgress };
}
