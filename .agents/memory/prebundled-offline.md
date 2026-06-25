---
name: Pre-bundled offline content & audio
description: How all 12 languages' learning content + TTS audio are generated and shipped in-app for first-launch offline use, and the pitfalls of generating them.
---

# Pre-bundled offline assets

All 12 target languages ship their full learning content (sentence banks 6×6,
vocab banks 4×12) and all correct TTS audio (gpt-4o-mini-tts, voice `nova`)
**pre-bundled in the app** — usable fully offline on first launch with **zero
"Download" taps**. The in-app "download" is now only a saved-word top-up.

- Generator: `scripts/src/generate-offline.ts` → emits `artifacts/mobile/assets/offline/{content/<Lang>.json, audio/<fileKey>.mp3}` + the manifest `artifacts/mobile/lib/offlineAssets.generated.ts` (`BUNDLED_CONTENT`, `BUNDLED_AUDIO`). Runtime resolver: `artifacts/mobile/lib/offlineAssets.ts`; consumed by `speech.ts` (bundled short-circuit) and seeded into screens via React Query `initialData`.
- The clip key (`<language>\u0001<text>`) and `fileKey` hashing **must stay byte-identical** between the generator and `speech.ts`/`offlineAssets.ts`, or bundled audio silently won't resolve.

## Generating must be FOREGROUND, chunked, and crash-safe
**Why:** the Replit environment SIGKILLs detached background processes (even with
`setsid`+`disown`); a long full-run reliably dies partway with no error in the log.
A killed process also looks exactly like a "stall" — and `pgrep -f generate-offline.ts`
gives a FALSE "alive" because it matches its own shell command line. Check liveness
with `pgrep -af tsx | grep -v pgrep` instead.
**How to apply:** run one language per invocation in the foreground inside the tool
timeout, e.g. `timeout 115 pnpm --filter @workspace/scripts run gen-offline -- --lang Spanish`,
looping over all 12 (the script is idempotent/resumable — skips existing files).
Writes are atomic (temp file + rename) so a mid-write kill never leaves a truncated
mp3/JSON that would be mistaken for "done". A hard `Promise.race` deadline +
AbortController + `maxRetries:0` wraps each OpenAI call so a hung request/body-read
can't block the worker pool; per-clip try/catch keeps one bad clip from aborting a
whole language. Rebuild the manifest at the end with `-- --manifest`.

## Enforce exact bank cardinality
**Why:** the content model over-produces (commonly 7 phrases in `basics` → 37
sentences instead of 36), making banks inconsistent across languages.
**How to apply:** the generator caps parsed entries to `SENTENCES_PER_CATEGORY` (6)
and `WORDS_PER_LEVEL` (12). Every bundled `content/<Lang>.json` must be exactly 36
sentences / 48 words. Re-truncating content then rebuilding the manifest drops the
now-orphaned extra mp3s from the bundle automatically.

## Non-Latin reading aids are bundled too
Each non-Latin `content/<Lang>.json` also carries a `romanizations` map (keyed by
exact phrase/word text) so the Latin reading aid works offline; the generator's
romanization pass is idempotent (tops up only missing entries) and Latin
languages get none. See `romanization-aid.md`. Regenerate the same way (foreground,
per-language); a normal re-run only adds missing romanizations (use `--force` to
redo content+audio+romanizations).

## Screens must render bundled data even when refetch fails
**Why:** React Query keeps `data` (from `initialData`) while a background refetch
errors; gating the error UI on `isError` alone hides bundled content offline.
**How to apply:** always gate error screens on `isError && !data` (see `sentences.tsx`
and `components/VocabBank.tsx`), never `isError` alone.
