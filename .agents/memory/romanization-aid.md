---
name: Romanization reading aid
description: Design decisions for the optional non-Latin romanization aid and its toggle-state pitfall.
---

# Romanization reading aid

Optional Latin-alphabet reading aid (romaji, pinyin, romaja, etc.) for non-Latin
target languages. On-demand only — NO DB schema (a sentence_bank constraint
blocks drizzle push, so this stays request-time only).

**Decision: per-section toggle, no global preference.** Each learning surface owns
a local show/hide toggle rather than one app-wide Settings switch; chat keeps a
per-message button.
**Why:** users wanted the aid available contextually where words appear, not
buried in Settings, and a global flag forced an all-or-nothing experience.
**How to apply:** any new word/sentence surface should add its own local toggle
(reuse the shared toggle component, which self-hides for Latin-script languages),
not a new preference.

**Pitfall: a disabled React Query still exposes its cached data.** After
ON→fetch→OFF, `query.data` is still populated, so a naive lookup leaks
romanizations back even when the toggle is off.
**How to apply:** gate the read on the active/enabled flag (return `undefined`
when inactive), and gate the render on the live toggle — never on "we have a
value" alone.

## Romanization also ships offline (bundled, not on-demand-only)
The 6 non-Latin languages' phrase/word romanizations are pre-generated into each
`assets/offline/content/<Lang>.json` as a `romanizations` map keyed by the EXACT
target text (native-independent), via the same scheme/contract as the server.
`useRomanizations(texts, lang, enabled, extra?)` resolves `extra` then the
bundled map FIRST (no network) and only fetches the still-missing texts (query
`enabled` only when `missing.length > 0`) — so bundled Sentences/Word Bank work
fully offline and the on-demand path is unchanged for dynamic text. Dynamic
example sentences aren't bundled, so the Download flow persists each saved word's
example romanization (`OfflineExample.romanization` in `offlineExamples.ts`) and
`vocab-study` passes it as `extra`.
**Why:** offline the non-Latin scripts had no reading aid at all.

**Quality bottleneck is the shared prompt, not the offline cache.** The romanize
model occasionally TRANSLATES a cognate instead of transliterating it (e.g. RU
`перцепция` → "perception" instead of "pertseptsiya"; Hindi IAST diacritics are
inconsistent). This is identical online and offline because both use the server's
`romanizeSystemPrompt` (`conversations.ts`). Fix it at the prompt (forbid
translation, transliterate sound-by-sound) + regenerate the bundled JSON — never
hand-curate one bundled entry, which silently diverges offline from the live API.
