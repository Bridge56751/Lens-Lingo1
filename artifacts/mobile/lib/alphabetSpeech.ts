import type { Language } from "@/hooks/usePreferences";
import type { Letter } from "@/constants/alphabets";

// Languages whose letters are taught (and spoken) by their character rather than
// a romanized name.
export const NON_LATIN_LANGS = new Set<Language>([
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
]);

/**
 * The exact text spoken/synthesized for a letter card. Non-Latin scripts read
 * the character itself; Latin scripts read the letter's name with any
 * parenthetical hint stripped. Shared by the Alphabet screen and the offline
 * download so cached audio matches exactly what a tap plays.
 */
export function letterSpoken(letter: Letter, language: Language): string {
  if (NON_LATIN_LANGS.has(language)) {
    return letter.char.split(/\s+/)[0] ?? letter.char;
  }
  return (letter.name ?? letter.char).replace(/\s*\(.*\)\s*/g, "").trim();
}

/** The example word spoken on the example card, with romanization stripped. */
export function exampleSpoken(letter: Letter): string {
  return letter.example.replace(/\s*\(.*\)/, "");
}
