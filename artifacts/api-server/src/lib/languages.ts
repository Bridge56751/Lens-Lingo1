// Languages the app supports. Used to validate client-supplied target/native
// languages before they are interpolated into high-priority system prompts.
// An allowlist prevents prompt-injection via an arbitrary language string,
// including via values persisted on the conversation and used later as a
// fallback (e.g. when grading).
export const SUPPORTED_LANGUAGES = new Set([
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
  "Dutch",
]);

// Returns the trimmed language if it is supported, otherwise undefined. Use this
// when resolving a fallback from a stored/persisted value so an unvalidated
// string can never reach a prompt.
export function safeLanguage(value: string | undefined | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return SUPPORTED_LANGUAGES.has(trimmed) ? trimmed : undefined;
}

// Supported languages written in a non-Latin script, where a Latin-alphabet
// romanization (romaji, pinyin, romaja, etc.) is a useful reading aid. The
// remaining supported languages already use the Latin alphabet and need none.
export const NON_LATIN_LANGUAGES = new Set([
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
]);

// Whether a romanization reading aid makes sense for the given language.
export function isNonLatin(value: string | undefined | null): boolean {
  return NON_LATIN_LANGUAGES.has((value ?? "").trim());
}

// Shared "speaking-first" guidance interpolated into the tutor system prompts
// and per-turn reminder. The app is built around spoken practice (mic →
// transcribe → auto-send → spoken reply), so the tutor should behave like a
// real conversation partner the learner can talk WITH out loud, not a textbook
// that writes long passages to be read. Keep replies short, plain, and easy to
// say and shadow aloud; avoid written-only formatting that breaks when spoken.
export function speakingStyleRules(targetLanguage: string): string {
  return `Speaking-first style (this is a spoken conversation, not a writing exercise):
- Talk like a real person speaking out loud: short, natural, casual ${targetLanguage} the learner can hear, repeat, and say back. Prefer 1-2 short spoken sentences.
- Use everyday spoken phrasing and contractions a native speaker would actually say in conversation, not formal written prose.
- Never use written-only formatting: no bullet points, numbered lists, headings, bold, or parentheses. Reply in ${targetLanguage} only — do NOT add a translation or gloss of what you said (the learner can tap Translate when they want the meaning).
- Keep the back-and-forth going: always finish with one short, easy spoken question so the learner is invited to answer aloud.
- Now and then, warmly nudge the learner to say their answer out loud (e.g. encourage them to speak rather than type).`;
}

// Shared correctness guardrails interpolated into vocabulary/phrase generation
// prompts. Models drift toward the wrong word when languages share a script —
// e.g. emitting a Chinese-only term (or a Chinese reading) for Japanese because
// both use Han characters. These rules force the natural, native form of the
// *target* language and an accurate translation.
export function accuracyRules(targetLanguage: string, nativeLanguage: string): string {
  return `Accuracy is critical — this is study material, so every entry must be correct:
- Use the exact word a native ${targetLanguage} speaker genuinely uses in everyday life, spelled and written correctly in standard modern ${targetLanguage}.
- Write each word in ${targetLanguage}'s own correct script and orthography (including any required diacritics, accents, or characters). Do NOT substitute a word, character, spelling, or reading from another language — even when ${targetLanguage} shares a script or characters with that language. The entry must be ${targetLanguage}, never a look-alike from a different language.
- Give the genuine, idiomatic ${targetLanguage} word for the meaning, not a literal character-by-character borrowing from ${nativeLanguage} or any other language.
- Make the ${nativeLanguage} translation precise and unambiguous for the intended meaning.
- If you are unsure a word is correct natural ${targetLanguage}, replace it with a common word you are certain about. Never guess or invent words.`;
}
