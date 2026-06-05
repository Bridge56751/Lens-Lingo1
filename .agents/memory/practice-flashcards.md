---
name: Practice flashcard mode
description: Session-state pitfall when building card decks from a React Query list, and where shared TTS lives.
---

# Practice / flashcard sessions

A flashcard "Practice" screen builds a shuffled deck from the `useListVocabulary`
query, filtered to the user's current `prefs.targetLanguage`, capped at a fixed size.
Words have no stored translation, so the flow is listen (TTS) → reveal word →
self-rate (Got it / Practice again, which re-queues the card).

## Pitfall: don't rebuild the deck on every query refetch
**Rule:** Build/shuffle the deck only on explicit restart, language change, or the
first load — NOT on every change of the query data array identity.
**Why:** React Query refetches (focus/foreground/staleness) return a new array
reference. If the deck-building effect depends on that array, a mid-session refetch
silently resets `pos`/known-count and the user loses progress.
**How to apply:** Key the build effect on a stable signal (e.g. `targetLanguage` +
a `round` counter) and guard with a ref so it only fires once per key; ignore raw
data-array identity changes once a deck exists.

## Pitfall: guard async results against card changes
**Rule:** In any card/flashcard flow where a per-card async call (AI example,
sentence check, etc.) can resolve after the user advances, capture the card's
identity at call time and drop the result if the visible card has since changed.
**Why:** `mutateAsync` results applied unconditionally after `await` leak the
previous card's example/feedback onto the new card if the user taps Next first.
**How to apply:** Keep a `currentWordRef` updated in the card-change effect;
after `await`, `if (currentWordRef.current !== wordAtRequest) return;` before any
`setState`. Also clamp `pos` when the deck shrinks (language switch / unpick) so
it can't point past the end and falsely show a "done" state.

## Shared TTS
BCP-47 voice locales (per learning `Language`) and a `speakWord(word, language)`
helper live in `artifacts/mobile/lib/speech.ts` — reuse it (scan speaker + practice
auto-play) instead of redefining the locale map. Always `Speech.stop()` before
speaking and on screen blur/unmount (`useFocusEffect`).
