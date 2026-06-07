import AsyncStorage from "@react-native-async-storage/async-storage";
import type { VocabExample } from "@workspace/api-client-react";

// Vocab examples are produced by a mutation (not a cached query), so React Query
// persistence doesn't cover them. We persist them ourselves, keyed by language
// pair + word, so downloaded examples are available for offline study.
const PREFIX = "@linguascan/offlineExample/v1";

function storageKey(target: string, native: string, word: string): string {
  return `${PREFIX}::${target}\u0001${native}\u0001${word}`;
}

/** Read a previously downloaded example sentence so vocab study works offline. */
export async function getOfflineExample(
  target: string,
  native: string,
  word: string,
): Promise<VocabExample | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(target, native, word));
    return raw ? (JSON.parse(raw) as VocabExample) : null;
  } catch {
    return null;
  }
}

/** Persist a generated example so it's available with no network later. */
export async function setOfflineExample(
  target: string,
  native: string,
  word: string,
  example: VocabExample,
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(target, native, word), JSON.stringify(example));
  } catch {
    // best-effort
  }
}
