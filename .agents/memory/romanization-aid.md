---
name: Romanization reading aid
description: How the optional non-Latin romanization (romaji/pinyin/etc.) aid is wired, and the toggle-off cache pitfall.
---

# Romanization reading aid

Optional Latin-alphabet reading aid (romaji, pinyin, romaja, etc.) for non-Latin
target languages. OFF by default (`prefs.showRomanization`), on-demand only — NO
DB schema (the sentence_bank constraint blocks drizzle push).

- Server: `POST /openai/romanize` mirrors `/openai/translate` — single `{text}`
  or batch `{texts}` (JSON mode, aligned to input length), Latin languages pass
  through unchanged, per-language scheme map (Hepburn/Pinyin+tones/Revised
  Romanization/BGN-PCGN/Arabic translit/IAST). `isNonLatin()` in `lib/languages.ts`.
- Client mirrors the chat Translate pattern (raw `expoFetch`, NOT codegen):
  `lib/romanize.ts` + `hooks/useRomanizations.ts` (batched, React-Query cached).
- Chat is the priority surface (per-message button next to Translate); also inline
  on vocab bank/search/study, sentences, scan.

**Why / pitfall:** a *disabled* React Query (`enabled:false`) still EXPOSES cached
data for the same key. After ON→fetch→OFF, `query.data` is still populated, so a
naive `get()` leaks romanizations back into the UI even though the toggle is off.
**How to apply:** gate the read on the `enabled/active` flag (return `undefined`
when inactive), not just on `query.data`; and gate the render on the live
preference too — never on "we have a value" alone.
