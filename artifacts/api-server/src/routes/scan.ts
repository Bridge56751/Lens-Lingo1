import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { conversations, customers, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  DEFAULT_DIFFICULTY,
  normalizeDifficulty,
} from "../lib/difficulty";
import { SUPPORTED_LANGUAGES } from "../lib/languages";
import { scanTutorSystemPrompt } from "../lib/prompts";
import { customerHasPro } from "../lib/plan";
import {
  FREE_DAILY_SCAN_LIMIT,
  buildScanUsage,
  utcDayKey,
} from "../lib/scanLimit";

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

  // Resolve entitlement first: Pro users are unlimited; free users get
  // FREE_DAILY_SCAN_LIMIT scans per UTC day. This server-side limit is
  // authoritative — the client counter is advisory only.
  const appUserId = req.authUserId ?? req.deviceId;
  const isPro = await customerHasPro({ customerId, appUserId, log: req.log });
  const now = new Date();
  const todayKey = utcDayKey(now);

  // For free users, atomically RESERVE a scan slot before any (expensive) AI
  // work. This conditional UPDATE bumps the per-day counter only while under the
  // cap (or resets it to 1 when the stored day key is stale → lazy UTC-midnight
  // refill). If it updates no row the user is already at the limit, so we deny
  // up front. A single conditional write — rather than a read-then-write — is
  // what keeps the limit correct under concurrency: N simultaneous scans can't
  // all pass a stale "used < limit" read and overshoot.
  let reservedScanCount = 0;
  if (!isPro) {
    const [reserved] = await db
      .update(customers)
      .set({
        scanDayCount: sql`CASE WHEN ${customers.scanDayKey} = ${todayKey} THEN ${customers.scanDayCount} + 1 ELSE 1 END`,
        scanDayKey: todayKey,
      })
      .where(
        and(
          eq(customers.id, customerId),
          sql`(${customers.scanDayKey} IS DISTINCT FROM ${todayKey} OR ${customers.scanDayCount} < ${FREE_DAILY_SCAN_LIMIT})`,
        ),
      )
      .returning({ scanDayCount: customers.scanDayCount });

    if (!reserved) {
      res.status(403).json({
        error: "scan_limit_reached",
        ...buildScanUsage(FREE_DAILY_SCAN_LIMIT, false, now),
      });
      return;
    }
    reservedScanCount = reserved.scanDayCount;
  }

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

  // Persist the conversation, its seed messages, and the lifetime usage counters
  // together so the chat artifacts and counts can't drift on partial failure.
  // The per-day scan counter was already reserved above; if this transaction
  // fails we release that reservation so a failed scan doesn't burn the user's
  // daily quota.
  const conv = await db
    .transaction(async (tx) => {
      const [created] = await tx
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
        { conversationId: created.id, role: "system", content: systemPrompt },
        { conversationId: created.id, role: "user", content: triggerMessage },
        { conversationId: created.id, role: "assistant", content: initialContent },
      ]);

      // Lifetime counters: one picture taken and one chat started.
      await tx
        .update(customers)
        .set({
          scanCount: sql`${customers.scanCount} + 1`,
          chatCount: sql`${customers.chatCount} + 1`,
        })
        .where(eq(customers.id, customerId));

      return created;
    })
    .catch(async (err) => {
      if (!isPro) {
        // Best-effort release of the reserved daily slot (same UTC day only).
        await db
          .update(customers)
          .set({
            scanDayCount: sql`CASE WHEN ${customers.scanDayKey} = ${todayKey} THEN GREATEST(${customers.scanDayCount} - 1, 0) ELSE ${customers.scanDayCount} END`,
          })
          .where(eq(customers.id, customerId))
          .catch(() => {});
      }
      throw err;
    });

  res.status(201).json({
    conversationId: conv.id,
    itemName,
    itemNameTranslated,
    initialMessage: initialContent,
    ...buildScanUsage(reservedScanCount, isPro, now),
  });
});

export default router;
