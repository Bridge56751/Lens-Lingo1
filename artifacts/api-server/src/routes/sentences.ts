import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { sentenceBank } from "@workspace/db";
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

// Everyday situations a traveller/beginner needs first. Stable order so the
// client can group/tab on them predictably.
const CATEGORIES = [
  "greetings",
  "basics",
  "directions",
  "dining",
  "shopping",
  "emergency",
] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_BRIEF: Record<Category, string> = {
  greetings: "greetings and farewells (good morning, hello, goodbye, good night)",
  basics: "core politeness and essentials (please, thank you, excuse me, sorry, yes, no, I don't understand)",
  directions: "getting around and asking where things are (where is the bathroom, how do I get to the station, is it far, turn left)",
  dining: "eating out (a table for two, the menu please, water please, the check please)",
  shopping: "shopping and money (how much is this, too expensive, I'll take it, do you accept cards)",
  emergency: "emergencies and help (I need help, call a doctor, I'm lost, where is the hospital)",
};

function validLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return SUPPORTED_LANGUAGES.has(trimmed) ? trimmed : undefined;
}

// Free-text from the AI / client gets cleaned before it is stored or shown.
function sanitize(value: unknown, max = 160): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

type GeneratedPhrase = { phrase: string; translation: string };

// Ask the model for a set of simple, genuinely useful everyday phrases across
// the survival categories.
async function generateBank(
  targetLanguage: string,
  nativeLanguage: string,
): Promise<Record<Category, GeneratedPhrase[]>> {
  const categoryLines = CATEGORIES.map(
    (c) => `- ${c}: 6 phrases for ${CATEGORY_BRIEF[c]}`,
  ).join("\n");

  const prompt = `Create a list of simple, everyday "survival" phrases for a native ${nativeLanguage} speaker learning ${targetLanguage}.
These are short, practical full sentences a beginner traveller would actually say. Keep them natural and easy.
Provide phrases in these categories:
${categoryLines}

${accuracyRules(targetLanguage, nativeLanguage)}

For each entry give the phrase written in ${targetLanguage} and its accurate translation in ${nativeLanguage}.
Respond with ONLY valid JSON in exactly this shape (one key per category):
{"greetings":[{"phrase":"...","translation":"..."}],"basics":[...],"directions":[...],"dining":[...],"shopping":[...],"emergency":[...]}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};

  const result = {
    greetings: [],
    basics: [],
    directions: [],
    dining: [],
    shopping: [],
    emergency: [],
  } as Record<Category, GeneratedPhrase[]>;

  for (const category of CATEGORIES) {
    const raw = Array.isArray(parsed[category])
      ? (parsed[category] as unknown[])
      : [];
    for (const item of raw) {
      const obj = item as { phrase?: unknown; translation?: unknown };
      const phrase = sanitize(obj.phrase, 160);
      const translation = sanitize(obj.translation, 200);
      if (phrase && translation) result[category].push({ phrase, translation });
    }
  }
  return result;
}

// GET /sentences/bank?targetLanguage=&nativeLanguage= - survival phrases by situation
router.get("/sentences/bank", async (req, res) => {
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
    .from(sentenceBank)
    .where(
      and(
        eq(sentenceBank.targetLanguage, targetLanguage),
        eq(sentenceBank.nativeLanguage, nativeLanguage),
      ),
    )
    .orderBy(asc(sentenceBank.id));

  // Regenerate when nothing is cached, or when a newly-added category is missing
  // from a previously-cached pair (onConflictDoNothing tops up only new rows).
  const presentCategories = new Set(rows.map((r) => r.category));
  const missingCategory = CATEGORIES.some((c) => !presentCategories.has(c));

  if (rows.length === 0 || missingCategory) {
    try {
      const generated = await generateBank(targetLanguage, nativeLanguage);
      const values = CATEGORIES.filter(
        (c) => !presentCategories.has(c),
      ).flatMap((category) =>
        generated[category].map((p) => ({
          targetLanguage,
          nativeLanguage,
          category,
          phrase: p.phrase,
          translation: p.translation,
        })),
      );
      if (values.length > 0) {
        await db.insert(sentenceBank).values(values).onConflictDoNothing();
      }
      rows = await db
        .select()
        .from(sentenceBank)
        .where(
          and(
            eq(sentenceBank.targetLanguage, targetLanguage),
            eq(sentenceBank.nativeLanguage, nativeLanguage),
          ),
        )
        .orderBy(asc(sentenceBank.id));
    } catch (err) {
      req.log.error({ err }, "Sentence bank generation failed");
      res.status(502).json({ error: "Could not build the phrase book" });
      return;
    }
  }

  const sentences = rows.map((r) => ({
    category: r.category,
    phrase: r.phrase,
    translation: r.translation,
  }));
  res.json({ sentences });
});

export default router;
