import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import {
  getGetSentenceBankQueryOptions,
  getGetVocabBankQueryOptions,
  getListVocabSelectionsQueryOptions,
  getVocabExample,
  type VocabSelection,
} from "@workspace/api-client-react";
import type { Language } from "@/hooks/usePreferences";
import { ALPHABETS } from "@/constants/alphabets";
import { letterSpoken, exampleSpoken } from "@/lib/alphabetSpeech";
import { cacheAudioClips } from "@/lib/speech";
import { getOfflineExample, setOfflineExample } from "@/lib/offlineExamples";

export type OfflinePhase = "content" | "examples" | "audio" | "done";
export type OfflineProgress = { phase: OfflinePhase; completed: number; total: number };

export type PackState = {
  downloadedAt: number;
  clips: number;
  sentences: number;
  words: number;
  letters: number;
};

const PACK_PREFIX = "@linguascan/offlinePack/v1";
const packKey = (target: string, native: string) =>
  `${PACK_PREFIX}::${target}\u0001${native}`;

/** Read the saved offline-pack metadata for a language pair (null if never downloaded). */
export async function getPackState(
  target: string,
  native: string,
): Promise<PackState | null> {
  try {
    const raw = await AsyncStorage.getItem(packKey(target, native));
    return raw ? (JSON.parse(raw) as PackState) : null;
  } catch {
    return null;
  }
}

async function setPackState(
  target: string,
  native: string,
  state: PackState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(packKey(target, native), JSON.stringify(state));
  } catch {
    // best-effort
  }
}

type Clip = { text: string; language?: Language };

/**
 * Download everything needed to use Sentences, Alphabet and Vocab flashcards
 * fully offline for one language pair: the query text (persisted by React
 * Query), every audio clip, and pre-generated example sentences for the
 * learner's saved words. Best-effort and resumable — re-running tops up
 * anything missing. Aborts cooperatively via `signal`.
 */
export async function downloadOfflinePack(opts: {
  queryClient: QueryClient;
  target: Language;
  native: string;
  onProgress?: (p: OfflineProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { queryClient, target, native, onProgress, signal } = opts;
  const aborted = () => signal?.aborted === true;

  // --- Phase 1: text content (cached + persisted by React Query) -------------
  onProgress?.({ phase: "content", completed: 0, total: 1 });
  const [bank, vocab, selections] = await Promise.all([
    queryClient.fetchQuery(
      getGetSentenceBankQueryOptions({ targetLanguage: target, nativeLanguage: native }),
    ),
    queryClient.fetchQuery(
      getGetVocabBankQueryOptions({ targetLanguage: target, nativeLanguage: native }),
    ),
    queryClient.fetchQuery(
      getListVocabSelectionsQueryOptions({ targetLanguage: target }),
    ),
  ]);
  onProgress?.({ phase: "content", completed: 1, total: 1 });
  if (aborted()) return;

  const clips: Clip[] = [];
  for (const s of bank.sentences ?? []) clips.push({ text: s.phrase, language: target });
  for (const w of vocab.words ?? []) clips.push({ text: w.word, language: target });

  const scripts = ALPHABETS[target] ?? [];
  let letterCount = 0;
  for (const script of scripts) {
    for (const letter of script.letters) {
      clips.push({ text: letterSpoken(letter, target), language: target });
      clips.push({ text: exampleSpoken(letter), language: target });
      letterCount++;
    }
  }

  const saved = (selections ?? []) as VocabSelection[];
  for (const sel of saved) clips.push({ text: sel.word, language: target });

  // --- Phase 2: example sentences for saved words ----------------------------
  onProgress?.({ phase: "examples", completed: 0, total: saved.length });
  let exDone = 0;
  for (const sel of saved) {
    if (aborted()) return;
    try {
      let example = await getOfflineExample(target, native, sel.word);
      if (!example) {
        example = await getVocabExample({
          word: sel.word,
          targetLanguage: target,
          nativeLanguage: native,
        });
        await setOfflineExample(target, native, sel.word, example);
      }
      if (example?.sentence) clips.push({ text: example.sentence, language: target });
    } catch {
      // best-effort: a missing example just won't be available offline
    }
    exDone++;
    onProgress?.({ phase: "examples", completed: exDone, total: saved.length });
  }
  if (aborted()) return;

  // --- Phase 3: audio --------------------------------------------------------
  await cacheAudioClips(clips, {
    signal,
    onProgress: (completed, total) =>
      onProgress?.({ phase: "audio", completed, total }),
  });
  if (aborted()) return;

  await setPackState(target, native, {
    downloadedAt: Date.now(),
    clips: clips.length,
    sentences: (bank.sentences ?? []).length,
    words: (vocab.words ?? []).length,
    letters: letterCount,
  });
  onProgress?.({ phase: "done", completed: 1, total: 1 });
}
