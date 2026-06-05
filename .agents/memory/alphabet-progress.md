---
name: Alphabet progress persistence
description: How alphabet (ABC) mastery is persisted and surfaced on Home, and the pre-load merge rules that protect it.
---

Alphabet mastery is persisted (it used to be local component state that vanished on unmount). It lives in a module-level reactive store mirroring the `usePreferences` pub/sub + single-flight load pattern. Completed letter indices are keyed by `${language}::${scriptId}` so multi-script languages (e.g. Japanese hiragana/katakana) and same-id scripts across languages never collide. Home aggregates completed/total across all scripts of the current target language.

**Pre-load merge rule (the subtle part — caught in code review):** updates made before the initial AsyncStorage read resolves must NOT overwrite persisted values.
- Completions queue into `pending[key]` and are **unioned** (Set) with persisted indices in `ensureLoaded` — a naive `{...parsed, ...pending}` clobbers existing progress on fast app-start taps.
- Resets queue into a `pendingDeletes` tombstone set; `ensureLoaded` applies deletes BEFORE unioning completions, so the ordering `mark → reset → mark` yields only the post-reset index (no resurrection of persisted indices), and `mark` with no reset preserves persisted indices.
- Clear both queues after load; persist if either had entries.

**Why:** without union+tombstone, a learner with saved progress who taps during the brief load window loses mastery, and "start over" can be undone after load resolves.

**Hide UX:** the mastered card can be hidden, but the flag is **language-scoped** — `preferences.alphabetCardHidden` is `Record<targetLanguage, boolean>`, not a single global boolean. A global flag would hide the card for a freshly-selected unmastered language too. Home shows the card only if `!alphabetCardHidden[targetLanguage]`; Settings toggle reads/writes the current target language's flag. When mastered, the big card auto-collapses to a compact "Alphabet mastered" strip (tap = review, × = hide).
