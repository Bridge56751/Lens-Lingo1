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
