import { Platform } from "react-native";
import { Asset } from "expo-asset";
import type { Language } from "@/hooks/usePreferences";
import type { SentenceBank, VocabBank } from "@workspace/api-client-react";
import { BUNDLED_AUDIO, BUNDLED_CONTENT } from "@/lib/offlineAssets.generated";

/**
 * Pre-bundled offline content + audio.
 *
 * The app ships with the full sentence bank, the full vocab bank, and every
 * correct TTS clip (phrases, words, alphabet letters/examples) for all target
 * languages, so it works completely offline on first launch with no download.
 *
 * Bundled audio is resolved to a local file URI on demand via expo-asset and
 * memoized in its OWN map — never the speech.ts LRU cache — so it can never be
 * evicted (which would delete the underlying packaged file).
 */

// Must match speech.ts clipKey EXACTLY so lookups line up with what a tap plays.
function clipKey(text: string, language?: Language): string {
  return language ? `${language}\u0001${text}` : text;
}

/** True when a clip for this text+language ships pre-bundled with the app. */
export function hasBundledAudio(text: string, language?: Language): boolean {
  return clipKey(text, language) in BUNDLED_AUDIO;
}

// localUri cache for already-downloaded bundled assets (own map, not the LRU).
const resolvedAudio = new Map<string, string>();

/**
 * Resolve a pre-bundled clip to a playable local file URI (native only).
 * Returns null on web or when the clip isn't bundled. Never throws.
 */
export async function resolveBundledAudio(
  text: string,
  language?: Language,
): Promise<string | null> {
  // Bundled mp3 modules can't be played from a packaged URI on web; the web
  // build falls back to network TTS / on-device synth.
  if (Platform.OS === "web") return null;
  const key = clipKey(text, language);
  const cached = resolvedAudio.get(key);
  if (cached) return cached;
  const moduleId = BUNDLED_AUDIO[key];
  if (moduleId === undefined) return null;
  try {
    const asset = Asset.fromModule(moduleId);
    if (!asset.localUri) await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) return null;
    resolvedAudio.set(key, uri);
    return uri;
  } catch {
    return null;
  }
}

/**
 * The pre-bundled sentence bank for a target language, or undefined when none
 * ships (banks are generated for English-native learners only).
 */
export function getBundledSentenceBank(
  target: string,
  native: string,
): SentenceBank | undefined {
  if (native !== "English") return undefined;
  const content = BUNDLED_CONTENT[target];
  if (!content) return undefined;
  return { sentences: content.sentences };
}

/**
 * The pre-bundled vocab bank for a target language, or undefined when none
 * ships (banks are generated for English-native learners only).
 */
export function getBundledVocabBank(
  target: string,
  native: string,
): VocabBank | undefined {
  if (native !== "English") return undefined;
  const content = BUNDLED_CONTENT[target];
  if (!content) return undefined;
  return { words: content.words };
}
