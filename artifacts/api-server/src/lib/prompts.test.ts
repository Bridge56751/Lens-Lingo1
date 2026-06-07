import { describe, expect, it } from "vitest";
import { DIFFICULTY_LEVELS } from "./difficulty";
import {
  freeChatTutorSystemPrompt,
  scanTutorSystemPrompt,
  tutorTurnReminder,
} from "./prompts";

// Regression guard for: "the tutor never translates its own replies again."
//
// The conversational tutor prompts must never instruct the AI to add a
// native-language inline / parenthetical translation or gloss of its OWN reply.
// The learner taps a Translate button for that. This test fails if a future
// prompt edit reintroduces such a directive.
//
// SCOPE: only the conversational tutor prompts below are checked — the scan-time
// system prompt, the free-chat system prompt, and the per-turn reminder. The
// Word Bank generator (routes/vocab.ts), the Sentence Bank generator
// (routes/sentences.ts), and the grading prompt are DELIBERATELY EXCLUDED: they
// legitimately produce a separate `translation` field and are out of scope.

// Words that signal a clause is talking about translating / glossing a reply.
const TRANSLATION_KEYWORDS = /(translat|gloss|parenthe)/i;

// Tokens that make a clause prohibitive ("do NOT add a translation", etc.).
const NEGATION = /\b(no|not|never|without)\b|n['’]t/i;

// Legitimate references to the in-app Translate button. These are an affordance
// the learner can use, NOT a directive for the tutor to translate its reply, so
// they are stripped before the negation check (they contain "Translate" but no
// surrounding negation of their own).
const ALLOWED_UI_REFERENCES = [
  /tap a Translate button to see it in [^.\n—]*/gi,
  /tap Translate to see the meaning/gi,
  /tap Translate when they want the meaning/gi,
  /tap Translate for the meaning/gi,
];

function stripAllowedReferences(prompt: string): string {
  let out = prompt;
  for (const re of ALLOWED_UI_REFERENCES) out = out.replace(re, "");
  return out;
}

// Split a prompt into clauses on sentence boundaries and newlines so we can
// check each translation-mentioning clause in isolation.
function clauses(prompt: string): string[] {
  return stripAllowedReferences(prompt)
    .split(/[.!?\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

// Asserts that every clause mentioning translation is phrased as a prohibition,
// i.e. there is no affirmative directive to add a translation/gloss.
function expectNoTranslationDirective(label: string, prompt: string): void {
  for (const clause of clauses(prompt)) {
    if (TRANSLATION_KEYWORDS.test(clause)) {
      expect(
        NEGATION.test(clause),
        `${label}: clause mentions translation without a prohibition — possible regression:\n"${clause}"`,
      ).toBe(true);
    }
  }
}

// Every conversational prompt must KEEP an explicit no-translation rule, so the
// guard fails if someone silently deletes the protection too.
function expectHasNoTranslationRule(label: string, prompt: string): void {
  const hasRule =
    /do not (add|translate)/i.test(prompt) ||
    /never add/i.test(prompt) ||
    /no translations/i.test(prompt);
  expect(hasRule, `${label}: missing an explicit no-translation directive`).toBe(
    true,
  );
}

// A representative spread of language pairs, including non-English natives, so an
// interpolated language name can never sneak an affirmative directive through.
const LANGUAGE_PAIRS: Array<{ nativeLanguage: string; targetLanguage: string }> = [
  { nativeLanguage: "English", targetLanguage: "Spanish" },
  { nativeLanguage: "English", targetLanguage: "Japanese" },
  { nativeLanguage: "Spanish", targetLanguage: "French" },
  { nativeLanguage: "Japanese", targetLanguage: "English" },
];

describe("scan-time tutor system prompt", () => {
  for (const pair of LANGUAGE_PAIRS) {
    for (const difficulty of DIFFICULTY_LEVELS) {
      const label = `scan (${pair.nativeLanguage}→${pair.targetLanguage}, ${difficulty})`;
      const prompt = scanTutorSystemPrompt({
        ...pair,
        itemName: "manzana",
        itemNameTranslated: "apple",
        pronounceNote: `, pronounced " man-sa-na"`,
        difficulty,
      });

      it(`${label}: never directs adding a translation`, () => {
        expectNoTranslationDirective(label, prompt);
      });

      it(`${label}: keeps an explicit no-translation rule`, () => {
        expectHasNoTranslationRule(label, prompt);
      });
    }
  }
});

describe("free-chat tutor system prompt", () => {
  for (const pair of LANGUAGE_PAIRS) {
    const label = `free-chat (${pair.nativeLanguage}→${pair.targetLanguage})`;
    const prompt = freeChatTutorSystemPrompt(pair);

    it(`${label}: never directs adding a translation`, () => {
      expectNoTranslationDirective(label, prompt);
    });

    it(`${label}: keeps an explicit no-translation rule`, () => {
      expectHasNoTranslationRule(label, prompt);
    });
  }
});

describe("per-turn tutor reminder", () => {
  for (const pair of LANGUAGE_PAIRS) {
    for (const difficulty of DIFFICULTY_LEVELS) {
      const label = `reminder (${pair.targetLanguage}, ${difficulty})`;
      const prompt = tutorTurnReminder({
        targetLanguage: pair.targetLanguage,
        difficulty,
      });

      it(`${label}: never directs adding a translation`, () => {
        expectNoTranslationDirective(label, prompt);
      });

      it(`${label}: keeps an explicit no-translation rule`, () => {
        expectHasNoTranslationRule(label, prompt);
      });
    }
  }
});
