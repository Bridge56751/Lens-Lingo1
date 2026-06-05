// Difficulty tiers for tutor conversations. The selected level shapes the
// tutor's vocabulary, sentence complexity, and how strictly it corrects the
// learner. The level string is interpolated into a high-priority system prompt,
// so it MUST be validated against this allowlist before use (prevents injection).

export const DIFFICULTY_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type Difficulty = (typeof DIFFICULTY_LEVELS)[number];

const DIFFICULTY_SET = new Set<string>(DIFFICULTY_LEVELS);

export const DEFAULT_DIFFICULTY: Difficulty = "Beginner";

// Returns the validated difficulty, or undefined when the value is not one of
// the allowed levels.
export function normalizeDifficulty(value: unknown): Difficulty | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return DIFFICULTY_SET.has(trimmed) ? (trimmed as Difficulty) : undefined;
}

// Multi-line instructions injected into the scan-time system prompt so the
// tutor calibrates its dialogue and corrections to the chosen level.
export function difficultyInstructions(
  level: Difficulty,
  targetLanguage: string,
  nativeLanguage: string,
): string {
  switch (level) {
    case "Beginner":
      return `Difficulty level: BEGINNER.
- Use very simple, high-frequency words and short, basic sentences in ${targetLanguage}.
- After almost every ${targetLanguage} sentence, add a ${nativeLanguage} translation in parentheses.
- Speak slowly in tone: one idea per sentence. Avoid idioms and complex grammar.
- Correct mistakes gently and explicitly: show the corrected ${targetLanguage} phrase, then a one-line ${nativeLanguage} note on what changed.`;
    case "Intermediate":
      return `Difficulty level: INTERMEDIATE.
- Use everyday ${targetLanguage} vocabulary and natural sentence structure, with occasional new words.
- Only add ${nativeLanguage} translations in parentheses for genuinely new or tricky words.
- Encourage longer answers from the learner.
- When the learner makes a mistake, correct it clearly: give the corrected ${targetLanguage} version and a short reason; do not let errors slide.`;
    case "Advanced":
      return `Difficulty level: ADVANCED.
- Use rich, natural, native-level ${targetLanguage} including idioms and varied tenses.
- Avoid ${nativeLanguage} translations unless the learner asks; explain new words in ${targetLanguage}.
- Push the learner with follow-up questions that require detailed answers.
- Be a rigorous corrector: catch grammar, word choice, and nuance mistakes, show the precise corrected ${targetLanguage}, and briefly explain the nuance.`;
  }
}

// A compact reminder appended to the per-turn system message so an existing
// conversation keeps respecting the level even if the scan-time prompt drifts.
export function difficultyReminder(level: Difficulty, targetLanguage: string): string {
  switch (level) {
    case "Beginner":
      return `Keep it at a BEGINNER level: very simple ${targetLanguage} with parenthetical translations, and correct every mistake gently but explicitly.`;
    case "Intermediate":
      return `Keep it at an INTERMEDIATE level: natural everyday ${targetLanguage}, translate only tricky words, and clearly correct mistakes with a short reason.`;
    case "Advanced":
      return `Keep it at an ADVANCED level: rich native-level ${targetLanguage} with few or no translations, and rigorously correct grammar, word choice, and nuance.`;
  }
}
