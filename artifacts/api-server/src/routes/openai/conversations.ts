import { Router } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { conversations, customers, messages } from "@workspace/db";
import { openai, toFile } from "@workspace/integrations-openai-ai-server";

const router = Router();

// Languages the app supports. Used to validate the client-supplied target
// language before it is interpolated into a high-priority system reminder
// (an allowlist prevents prompt-injection via an arbitrary language string).
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

// POST /openai/transcribe - transcribe spoken audio to text (Whisper)
router.post("/openai/transcribe", async (req, res) => {
  const { audioBase64, mimeType, language } = req.body as {
    audioBase64?: string;
    mimeType?: string;
    language?: string;
  };

  if (!audioBase64) {
    res.status(400).json({ error: "audioBase64 is required" });
    return;
  }

  if (audioBase64.length > 7_000_000) {
    res.status(413).json({ error: "Audio is too long" });
    return;
  }

  const extByMime: Record<string, string> = {
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
  };
  const ext = extByMime[mimeType ?? ""] ?? "m4a";

  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const file = await toFile(buffer, `audio.${ext}`, {
      type: mimeType ?? "audio/m4a",
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      ...(language ? { language } : {}),
    });

    res.json({ text: transcription.text });
  } catch (err) {
    req.log.error({ err }, "Transcription failed");
    res.status(502).json({ error: "Transcription failed" });
  }
});

// GET /openai/conversations - list conversations for the current customer
router.get("/openai/conversations", async (req, res) => {
  if (req.customerId == null) {
    res.json([]);
    return;
  }
  const all = await db
    .select()
    .from(conversations)
    .where(eq(conversations.customerId, req.customerId))
    .orderBy(desc(conversations.createdAt));
  res.json(all);
});

// POST /openai/conversations - create a new conversation
router.post("/openai/conversations", async (req, res) => {
  const { title } = req.body as { title?: string };
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (req.customerId == null) {
    res.status(400).json({ error: "Missing or unresolved x-device-id" });
    return;
  }
  const customerId = req.customerId;
  const conv = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conversations)
      .values({ title, customerId })
      .returning();

    // Track usage: one chat started.
    await tx
      .update(customers)
      .set({ chatCount: sql`${customers.chatCount} + 1` })
      .where(eq(customers.id, customerId));

    return created;
  });

  res.status(201).json(conv);
});

// POST /openai/conversations/chat - start a free speak-or-type tutor chat (no scan)
router.post("/openai/conversations/chat", async (req, res) => {
  const { targetLanguage: rawTarget, nativeLanguage: rawNative } = req.body as {
    targetLanguage?: string;
    nativeLanguage?: string;
  };

  const targetLanguage = (rawTarget ?? "").trim();
  const nativeLanguage = (rawNative ?? "").trim();

  // Both languages get interpolated into a high-priority system prompt, so
  // validate them against the supported allowlist (prevents prompt-injection).
  if (!SUPPORTED_LANGUAGES.has(targetLanguage) || !SUPPORTED_LANGUAGES.has(nativeLanguage)) {
    res.status(400).json({ error: "Unsupported targetLanguage or nativeLanguage" });
    return;
  }

  if (req.customerId == null) {
    res.status(400).json({ error: "Missing or unresolved x-device-id" });
    return;
  }
  const customerId = req.customerId;

  const systemPrompt = `You are an enthusiastic, patient language tutor helping a native ${nativeLanguage} speaker learn ${targetLanguage} through free conversation. There is no specific topic — chat naturally about everyday life and let the learner steer.

CRITICAL LANGUAGE RULES (these override everything else):
- ALWAYS write your replies in ${targetLanguage}. Never reply primarily in ${nativeLanguage}, even if the user writes or speaks to you in ${nativeLanguage}.
- After any ${targetLanguage} sentence that uses a new or difficult word, add a short ${nativeLanguage} translation in parentheses so a beginner can follow.
- If the user writes in ${nativeLanguage}, warmly encourage them to try in ${targetLanguage}, and still model the answer in ${targetLanguage}.
- If the user makes a mistake in ${targetLanguage}, gently correct it in one short phrase, then continue the conversation.

Teaching style:
- Keep replies SHORT (2-4 sentences max).
- Talk about everyday topics and useful vocabulary the learner can use right away.
- End every reply with one simple question in ${targetLanguage} to keep the conversation going.
- Be warm and encouraging. Do not use emojis.`;

  const triggerMessage = `Let's have a free conversation in ${targetLanguage} to practice. Please start.`;

  // Generate the opening tutor message (kept outside the DB transaction below).
  let initialContent = `Let's practice ${targetLanguage} together!`;
  try {
    const initialResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: triggerMessage },
      ],
    });
    initialContent = initialResponse.choices[0]?.message?.content ?? initialContent;
  } catch (err) {
    req.log.error({ err }, "Free-chat initial message generation failed");
  }

  // Seed the conversation with a system message + opening assistant turn so the
  // message-send route (which 404s on an empty conversation) works immediately.
  const conversation = await db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversations)
      .values({
        title: `Free Chat • ${targetLanguage}`,
        targetLanguage,
        nativeLanguage,
        customerId,
      })
      .returning();

    await tx.insert(messages).values([
      { conversationId: conv.id, role: "system", content: systemPrompt },
      { conversationId: conv.id, role: "assistant", content: initialContent },
    ]);

    // Track usage: one chat started.
    await tx
      .update(customers)
      .set({ chatCount: sql`${customers.chatCount} + 1` })
      .where(eq(customers.id, customerId));

    return conv;
  });

  res.status(201).json({
    conversationId: conversation.id,
    initialMessage: initialContent,
  });
});

// GET /openai/conversations/:id - get conversation with messages (excluding system messages)
router.get("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  if (req.customerId == null) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.customerId, req.customerId),
      ),
    );

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  // Filter out system messages for the client
  const visibleMessages = msgs.filter((m) => m.role !== "system");

  res.json({ ...conv, messages: visibleMessages });
});

// DELETE /openai/conversations/:id
router.delete("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  if (req.customerId == null) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [deleted] = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.customerId, req.customerId),
      ),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.status(204).send();
});

// GET /openai/conversations/:id/messages - list messages (excluding system)
router.get("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  if (req.customerId == null) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.customerId, req.customerId),
      ),
    );

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  const visibleMessages = msgs.filter((m) => m.role !== "system");
  res.json(visibleMessages);
});

// POST /openai/conversations/:id/messages - send message, stream response
router.post("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const { content, targetLanguage: requestedLanguage } = req.body as {
    content?: string;
    targetLanguage?: string;
  };
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  if (req.customerId == null) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [owned] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.customerId, req.customerId),
      ),
    );

  if (!owned) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Load full conversation history (including system messages for AI context)
  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  if (allMessages.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Save the user message and bump the usage counter together so the persisted
  // message and the count stay consistent on partial failure.
  const customerId = req.customerId;
  await db.transaction(async (tx) => {
    await tx.insert(messages).values({
      conversationId: id,
      role: "user",
      content,
    });

    // Track usage: one message sent by the customer.
    await tx
      .update(customers)
      .set({ messageCount: sql`${customers.messageCount} + 1` })
      .where(eq(customers.id, customerId));
  });

  // Build chat messages for OpenAI (include system + history + new user message)
  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    ...allMessages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content },
  ];

  // Re-anchor the target language on every turn. The learning language is driven
  // by the user's current app settings, sent on each request. We validate it
  // against the supported allowlist (it gets interpolated into a system message)
  // and, when it differs from what's stored, persist it so transcription and
  // future turns stay consistent. Fall back to the stored column, then the title.
  const settingsLanguage =
    typeof requestedLanguage === "string" && SUPPORTED_LANGUAGES.has(requestedLanguage.trim())
      ? requestedLanguage.trim()
      : undefined;
  if (settingsLanguage && settingsLanguage !== owned.targetLanguage) {
    // Best-effort: persisting the language must never abort the reply turn.
    try {
      await db
        .update(conversations)
        .set({ targetLanguage: settingsLanguage })
        .where(eq(conversations.id, id));
    } catch (err) {
      req.log.error({ err }, "failed to persist conversation target language");
    }
  }
  const targetLanguage =
    settingsLanguage ||
    owned.targetLanguage?.trim() ||
    (owned.title ?? "").split(" • ")[1]?.trim();
  if (targetLanguage) {
    chatMessages.push({
      role: "system",
      content: `Reminder: reply in ${targetLanguage}, not English (unless the learner's language is English). Keep it short (2-4 sentences), add a brief parenthetical translation for any new word, gently correct mistakes, and end with one simple question in ${targetLanguage}.`,
    });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }
  } catch (err) {
    req.log.error({ err }, "Streaming chat failed");
    res.write(`data: ${JSON.stringify({ error: "Streaming failed" })}\n\n`);
  }

  // Save assistant response to DB
  if (fullResponse) {
    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
