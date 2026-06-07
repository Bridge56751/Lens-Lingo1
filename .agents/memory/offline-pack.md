---
name: Offline learning pack
description: How LinguaScan makes Sentences/Alphabet/Vocab usable with no network, and the invariants that keep it working.
---

# Offline learning pack

Users tap **Download** in Settings (per language pair) to make Sentences, Alphabet,
and Vocab flashcards (saved words) fully usable offline. Orchestrated by
`lib/offlinePack.ts` (`downloadOfflinePack`); pack metadata persisted per
`target\u0001native` key (`getPackState`).

**Two halves must both survive a cold start:**
1. **Text** — React Query cache is persisted to AsyncStorage via
   `PersistQueryClientProvider` in `_layout.tsx` (long `gcTime`/maxAge ~30d).
   The pack pre-fills it with `queryClient.fetchQuery` for sentence bank, vocab
   bank, and vocab selections.
2. **Audio** — `speech.ts > cacheAudioClips` prefetches every clip (sentence
   phrases, vocab words, alphabet letters+examples, saved words + generated
   example sentences) to the on-disk audio cache. Generated example sentences are
   also stored in `lib/offlineExamples.ts` (AsyncStorage, keyed
   target::native::word) so vocab-study can hydrate them offline.

**Invariants (don't regress):**
- **Content screens must be data-first.** Gate any error view on
  `isError && !data`, never `isError` alone. Offline, a background refetch fails
  while the persisted cache still holds valid data — gating on `isError` alone
  hides cached content and breaks the whole point. (Fixed in `sentences.tsx`.)
- **Settings download is run-token guarded.** `startDownload` captures a
  `runIdRef` id; its `onProgress`/success/`finally` only mutate shared UI state
  when still the current run. `cancelDownload` bumps the id + aborts. Without
  this, a cancel-then-restart lets the old run's `finally` clobber the new run.
- **Abort is cooperative.** `cacheAudioClips` checks `signal.aborted` only
  between items; in-flight fetches aren't cancelled. Acceptable (best-effort).
- Adding a new offline content type → add its clips in `downloadOfflinePack`
  AND ensure its display screen is data-first.
