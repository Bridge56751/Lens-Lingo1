---
name: Vocab bank shared cache
description: Why adding a new difficulty level needs a top-up path, and how the bank is cached.
---

# Curated vocab "Word Bank" cache

The Word Bank (curated words, NOT scanned words) is a **shared** cache keyed by
`(targetLanguage, nativeLanguage)` in the `vocabBank` table — generated once via
gpt-4o per language pair, reused by every customer. Per-customer state lives only
in `vocabSelections` (the words a user picked to study).

## Gotcha: a new difficulty level won't appear for already-cached language pairs
**Rule:** When you add a new `LEVELS` value (e.g. `expert`), the bank GET must
detect *missing levels* on an existing cached pair and top up, not just generate
when zero rows exist.
**Why:** The original GET only generated when `rows.length === 0`. Any pair a user
had already opened would silently never show the new level.
**How to apply:** Compute `presentLevels` from cached rows; regenerate when
`rows.length === 0 || someLevelMissing`. On insert, **filter to only the missing
levels** before inserting (`onConflictDoNothing`) — otherwise regenerating the full
bank re-inserts fresh, non-duplicate words into existing levels too and bloats them
on every top-up. `level` is a plain text column (no DB enum), so adding a level
needs no migration — only the route `LEVELS` array + prompt, the mobile `LEVELS`
arrays/colors, and a `vocab.<level>` translation key.
