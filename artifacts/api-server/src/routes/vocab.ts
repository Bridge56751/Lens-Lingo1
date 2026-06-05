import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { vocabBank, vocabSelections } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { accuracyRules } from "../lib/languages";

const router = Router();

// Allowlist for languages interpolated into AI prompts (prevents injection of
// instruction-like text via an arbitrary language string).
const SUPPORTED_LANGUAGES = new Set([
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

const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
type Level = (typeof LEVELS)[number];

function validLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return SUPPORTED_LANGUAGES.has(trimmed) ? trimmed : undefined;
}

// Free-text from the AI / client gets cleaned before it is stored or shown.
function sanitize(value: unknown, max = 120): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

type GeneratedWord = { word: string; translation: string };

// Ask the model for a curated word list across the three difficulty levels.
async function generateBank(
  targetLanguage: string,
  nativeLanguage: string,
): Promise<Record<Level, GeneratedWord[]>> {
  const prompt = `Create a vocabulary study list for a native ${nativeLanguage} speaker learning ${targetLanguage}.
Provide common, genuinely useful single words or short phrases at four difficulty levels:
- beginner: 12 of the most essential everyday words
- intermediate: 12 useful words a learner meets after the basics
- advanced: 12 richer, less common words
- expert: 12 sophisticated, nuanced words a near-fluent speaker would learn

${accuracyRules(targetLanguage, nativeLanguage)}

For each entry give the word written in ${targetLanguage} and its accurate translation in ${nativeLanguage}.
Respond with ONLY valid JSON in exactly this shape:
{"beginner":[{"word":"...","translation":"..."}],"intermediate":[{"word":"...","translation":"..."}],"advanced":[{"word":"...","translation":"..."}],"expert":[{"word":"...","translation":"..."}]}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};

  const result: Record<Level, GeneratedWord[]> = {
    beginner: [],
    intermediate: [],
    advanced: [],
    expert: [],
  };
  for (const level of LEVELS) {
    const raw = Array.isArray(parsed[level]) ? (parsed[level] as unknown[]) : [];
    for (const item of raw) {
      const obj = item as { word?: unknown; translation?: unknown };
      const word = sanitize(obj.word, 60);
      const translation = sanitize(obj.translation, 80);
      if (word && translation) result[level].push({ word, translation });
    }
  }
  return result;
}

// GET /vocab/bank?targetLanguage=&nativeLanguage= - curated words by difficulty
router.get("/vocab/bank", async (req, res) => {
  const targetLanguage = validLanguage(req.query.targetLanguage);
  const nativeLanguage = validLanguage(req.query.nativeLanguage);
  if (!targetLanguage || !nativeLanguage) {
    res
      .status(400)
      .json({ error: "Valid targetLanguage and nativeLanguage are required" });
    return;
  }

  // Serve from the cached bank when we already generated it for this pair.
  let rows = await db
    .select()
    .from(vocabBank)
    .where(
      and(
        eq(vocabBank.targetLanguage, targetLanguage),
        eq(vocabBank.nativeLanguage, nativeLanguage),
      ),
    )
    .orderBy(asc(vocabBank.id));

  // Regenerate when nothing is cached, or when a newly-added level is missing
  // from a previously-cached pair (onConflictDoNothing tops up only new rows).
  const presentLevels = new Set(rows.map((r) => r.level));
  const missingLevel = LEVELS.some((level) => !presentLevels.has(level));

  if (rows.length === 0 || missingLevel) {
    try {
      const generated = await generateBank(targetLanguage, nativeLanguage);
      // Only insert levels that aren't already cached so topping up a new level
      // doesn't bloat existing levels with extra words on every regeneration.
      const values = LEVELS.filter((level) => !presentLevels.has(level)).flatMap(
        (level) =>
          generated[level].map((w) => ({
            targetLanguage,
            nativeLanguage,
            level,
            word: w.word,
            translation: w.translation,
          })),
      );
      if (values.length > 0) {
        await db.insert(vocabBank).values(values).onConflictDoNothing();
      }
      rows = await db
        .select()
        .from(vocabBank)
        .where(
          and(
            eq(vocabBank.targetLanguage, targetLanguage),
            eq(vocabBank.nativeLanguage, nativeLanguage),
          ),
        )
        .orderBy(asc(vocabBank.id));
    } catch (err) {
      req.log.error({ err }, "Vocab bank generation failed");
      res.status(502).json({ error: "Could not build the word bank" });
      return;
    }
  }

  const words = rows.map((r) => ({
    word: r.word,
    translation: r.translation,
    level: r.level,
  }));
  res.json({ words });
});

// GET /vocab/selections?targetLanguage= - words this customer picked
router.get("/vocab/selections", async (req, res) => {
  const targetLanguage = validLanguage(req.query.targetLanguage);
  if (!targetLanguage) {
    res.status(400).json({ error: "Valid targetLanguage is required" });
    return;
  }
  if (req.customerId == null) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(vocabSelections)
    .where(
      and(
        eq(vocabSelections.customerId, req.customerId),
        eq(vocabSelections.targetLanguage, targetLanguage),
      ),
    )
    .orderBy(asc(vocabSelections.id));
  res.json(rows);
});

// POST /vocab/selections - pick a word to learn
router.post("/vocab/selections", async (req, res) => {
  const { targetLanguage: rawTarget, level: rawLevel, word: rawWord, translation: rawTranslation } =
    req.body as {
      targetLanguage?: string;
      level?: string;
      word?: string;
      translation?: string;
    };

  const targetLanguage = validLanguage(rawTarget);
  const level = typeof rawLevel === "string" && (LEVELS as readonly string[]).includes(rawLevel.trim())
    ? (rawLevel.trim() as Level)
    : undefined;
  const word = sanitize(rawWord, 60);
  const translation = sanitize(rawTranslation, 80);

  if (!targetLanguage || !level || !word || !translation) {
    res.status(400).json({ error: "targetLanguage, level, word and translation are required" });
    return;
  }
  if (req.customerId == null) {
    res.status(400).json({ error: "Missing or unresolved x-device-id" });
    return;
  }

  const [created] = await db
    .insert(vocabSelections)
    .values({
      customerId: req.customerId,
      targetLanguage,
      level,
      word,
      translation,
    })
    .onConflictDoUpdate({
      target: [
        vocabSelections.customerId,
        vocabSelections.targetLanguage,
        vocabSelections.word,
      ],
      set: { translation, level },
    })
    .returning();

  res.status(201).json(created);
});

// DELETE /vocab/selections/:id - remove a picked word
router.delete("/vocab/selections/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid selection id" });
    return;
  }
  if (req.customerId == null) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [deleted] = await db
    .delete(vocabSelections)
    .where(
      and(
        eq(vocabSelections.id, id),
        eq(vocabSelections.customerId, req.customerId),
      ),
    )
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

// POST /vocab/example - generate an example sentence using a word
router.post("/vocab/example", async (req, res) => {
  const { word: rawWord, targetLanguage: rawTarget, nativeLanguage: rawNative } =
    req.body as { word?: string; targetLanguage?: string; nativeLanguage?: string };

  const targetLanguage = validLanguage(rawTarget);
  const nativeLanguage = validLanguage(rawNative);
  const word = sanitize(rawWord, 60);
  if (!word || !targetLanguage || !nativeLanguage) {
    res.status(400).json({ error: "word, targetLanguage and nativeLanguage are required" });
    return;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Write one short, natural example sentence in ${targetLanguage} that uses the word "${word}". Keep it simple enough for a learner. The sentence must be correct, idiomatic, natively-written ${targetLanguage} in ${targetLanguage}'s own correct script — do NOT substitute words, characters, or readings from another language even where scripts overlap (e.g. never read or write it as Chinese for Japanese). Respond with ONLY valid JSON: {"sentence":"the sentence in ${targetLanguage}","translation":"its accurate translation in ${nativeLanguage}"}`,
        },
      ],
    });
    const content = response.choices[0]?.message?.content ?? "{}";
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { sentence?: unknown; translation?: unknown }) : {};
    const sentence = sanitize(parsed.sentence, 240);
    const translation = sanitize(parsed.translation, 240);
    if (!sentence) {
      res.status(502).json({ error: "Could not generate an example" });
      return;
    }
    res.json({ sentence, translation });
  } catch (err) {
    req.log.error({ err }, "Vocab example generation failed");
    res.status(502).json({ error: "Could not generate an example" });
  }
});

// POST /vocab/check - give feedback on the learner's own sentence
router.post("/vocab/check", async (req, res) => {
  const {
    word: rawWord,
    sentence: rawSentence,
    targetLanguage: rawTarget,
    nativeLanguage: rawNative,
  } = req.body as {
    word?: string;
    sentence?: string;
    targetLanguage?: string;
    nativeLanguage?: string;
  };

  const targetLanguage = validLanguage(rawTarget);
  const nativeLanguage = validLanguage(rawNative);
  const word = sanitize(rawWord, 60);
  const sentence = sanitize(rawSentence, 400);
  if (!word || !sentence || !targetLanguage || !nativeLanguage) {
    res.status(400).json({ error: "word, sentence, targetLanguage and nativeLanguage are required" });
    return;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are a strict, demanding ${targetLanguage} examiner for a native ${nativeLanguage} speaker. The learner is practicing the word "${word}". Hold them to a high standard: set "correct" to true ONLY if the sentence is fully grammatical, genuinely natural-sounding ${targetLanguage}, and uses "${word}" correctly and meaningfully. Penalize every grammar, spelling, word-order, gender/agreement, conjugation, punctuation, or word-choice mistake, as well as any awkward or unnatural phrasing — do not let small errors slide. Be blunt and honest about each problem (no false praise or sugar-coating), while staying professional and never insulting. Write the feedback in ${nativeLanguage} and name specifically what is wrong and why. IMPORTANT — judge the language of effort, not individual words: your goal is to reward genuine attempts at ${targetLanguage}. Many words legitimately overlap or are spelled the same across languages (cognates, loanwords, brand/place names like "hotel", "taxi", "internet", "pizza"), so do NOT treat a sentence as ${nativeLanguage} just because it contains words that also exist in ${nativeLanguage} — if the overall sentence is a real attempt at ${targetLanguage} (its grammar, structure, and most content words are ${targetLanguage}), grade it normally as ${targetLanguage}. ONLY when the learner is clearly and deliberately writing in ${nativeLanguage} (or some other non-${targetLanguage} language) — i.e. the sentence as a whole is plainly ${nativeLanguage} and not a ${targetLanguage} attempt at all — set "correct" to false and make the feedback a short, light-hearted, funny call-out (in ${nativeLanguage}) teasing them for not even trying in ${targetLanguage} — keep it playful and good-natured, never mean — then put what they likely meant, written properly in ${targetLanguage}, into "correction". Always provide the best fully-correct, natural version of their sentence in ${targetLanguage} (if it is already flawless, repeat it unchanged). Respond with ONLY valid JSON: {"correct": true or false, "feedback":"direct feedback in ${nativeLanguage}","correction":"the corrected sentence in ${targetLanguage}"}`,
        },
        {
          role: "user",
          content: sentence,
        },
      ],
    });
    const content = response.choices[0]?.message?.content ?? "{}";
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = match
      ? (JSON.parse(match[0]) as { correct?: unknown; feedback?: unknown; correction?: unknown })
      : {};
    res.json({
      correct: parsed.correct === true,
      feedback: sanitize(parsed.feedback, 300) || "Nice try!",
      correction: sanitize(parsed.correction, 300),
    });
  } catch (err) {
    req.log.error({ err }, "Vocab sentence check failed");
    res.status(502).json({ error: "Could not check the sentence" });
  }
});

export default router;
