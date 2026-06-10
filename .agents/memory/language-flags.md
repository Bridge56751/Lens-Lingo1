---
name: Language flags in pickers
description: How per-language flags are rendered in the language selectors and the cross-platform caveat.
---

Each learnable language shows a small country flag in the three language selectors
(home learning-language modal, settings learning-language modal, onboarding language
grid). Flags come from a single shared `LANGUAGE_FLAGS: Record<Language, string>` map
that lives next to `LANGUAGES` in `hooks/usePreferences.ts`, so all selectors stay in
sync — add new languages' flags there, not per-screen.

**Why emoji, not images:** zero assets/deps, and the selectors already share the
`LANGUAGES` import. Trade-off below.

**Cross-platform caveat:** flag emojis render on iOS and on web (Linux Chrome uses
Noto Color Emoji, which supports them), but **do NOT render on Android's system
font** — Android shows the two-letter region code (e.g. "ES", "FR") instead of a
flag. If proper flags on Android become a requirement, switch `LANGUAGE_FLAGS` to
bundled flag images / an SVG flag set; the render sites already read from the one map
so only the map + the `<Text>`→`<Image>` swap change.
