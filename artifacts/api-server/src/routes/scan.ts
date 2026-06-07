import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { conversations, customers, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  DEFAULT_DIFFICULTY,
  normalizeDifficulty,
} from "../lib/difficulty";
import { SUPPORTED_LANGUAGES } from "../lib/languages";
import { scanTutorSystemPrompt } from "../lib/prompts";

const router = Router();

// Item labels come from the vision model (untrusted) and get interpolated into a
// high-priority system prompt. Collapse whitespace/newlines and cap length so a
// malicious or odd image caption can't smuggle instruction-like text into it.
function sanitizeLabel(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
}

router.post("/scan", async (req, res) => {
  const { imageBase64, targetLanguage, nativeLanguage, difficulty: rawDifficulty } = req.body as {
    imageBase64?: string;
    targetLanguage?: string;
    nativeLanguage?: string;
    difficulty?: string;
  };

  if (!imageBase64 || !targetLanguage || !nativeLanguage) {
    res.status(400).json({ error: "imageBase64, targetLanguage, and nativeLanguage are required" });
    return;
  }

  // Languages get interpolated into high-priority prompts here and are persisted
  // on the conversation (later reused as a grading fallback), so validate them
  // against the allowlist at the entry point to keep stored values prompt-safe.
  if (!SUPPORTED_LANGUAGES.has(targetLanguage.trim()) || !SUPPORTED_LANGUAGES.has(nativeLanguage.trim())) {
    res.status(400).json({ error: "Unsupported targetLanguage or nativeLanguage" });
    return;
  }

  // Difficulty is interpolated into a system prompt, so validate against the
  // allowlist and fall back to the default if missing/invalid.
  const difficulty = normalizeDifficulty(rawDifficulty) ?? DEFAULT_DIFFICULTY;

  if (req.customerId == null) {
    res.status(400).json({ error: "Missing or unresolved x-device-id" });
    return;
  }
  const customerId = req.customerId;

  // Use GPT vision to identify the item
  let itemName = "Unknown Item";
  let itemNameTranslated = "Unknown";
  let pronunciation = "";

  try {
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
            {
              type: "text",
              text: `Identify the main object in this image. Respond with only valid JSON in this exact format: {"itemName": "name of the item in ${nativeLanguage}", "itemNameTranslated": "name of the item in ${targetLanguage}", "pronunciation": "phonetic pronunciation of the ${targetLanguage} name using English letters"}`,
            },
          ],
        },
      ],
    });

    const content = visionResponse.choices[0]?.message?.content ?? "{}";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        itemName?: string;
        itemNameTranslated?: string;
        pronunciation?: string;
      };
      itemName = sanitizeLabel(parsed.itemName) || itemName;
      itemNameTranslated = sanitizeLabel(parsed.itemNameTranslated) || itemNameTranslated;
      pronunciation = sanitizeLabel(parsed.pronunciation);
    }
  } catch (err) {
    req.log.error({ err }, "Vision identification failed, using defaults");
  }

  // Build system prompt for language learning
  const pronounceNote = pronunciation ? `, pronounced "${pronunciation}"` : "";
  const systemPrompt = scanTutorSystemPrompt({
    nativeLanguage,
    targetLanguage,
    itemName,
    itemNameTranslated,
    pronounceNote,
    difficulty,
  });

  const triggerMessage = `I just scanned a ${itemName}. Help me learn the word for it in ${targetLanguage}!`;

  // Generate initial AI greeting (kept outside the DB transaction below)
  let initialContent = `Let's learn about "${itemName}" in ${targetLanguage}!`;
  try {
    const initialResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: triggerMessage },
      ],
    });
    initialContent =
      initialResponse.choices[0]?.message?.content ?? initialContent;
  } catch (err) {
    req.log.error({ err }, "Initial message generation failed");
  }

  // Persist conversation, its seed messages, and the usage counters together so
  // the chat artifacts and the counts can never drift apart on partial failure.
  const conversation = await db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversations)
      .values({
        title: `${itemName} • ${targetLanguage}`,
        targetLanguage,
        nativeLanguage,
        difficulty,
        customerId,
      })
      .returning();

    await tx.insert(messages).values([
      { conversationId: conv.id, role: "system", content: systemPrompt },
      { conversationId: conv.id, role: "user", content: triggerMessage },
      { conversationId: conv.id, role: "assistant", content: initialContent },
    ]);

    // Track usage: one picture taken and one chat started.
    await tx
      .update(customers)
      .set({
        scanCount: sql`${customers.scanCount} + 1`,
        chatCount: sql`${customers.chatCount} + 1`,
      })
      .where(eq(customers.id, customerId));

    return conv;
  });

  res.status(201).json({
    conversationId: conversation.id,
    itemName,
    itemNameTranslated,
    initialMessage: initialContent,
  });
});

export default router;
