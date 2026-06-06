import { Router } from "express";
import { and, eq, desc, like, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { conversations, customers, messages } from "@workspace/db";
import { openai, toFile } from "@workspace/integrations-openai-ai-server";
import type { GradeFeedback } from "@workspace/db";
import {
  DEFAULT_DIFFICULTY,
  difficultyReminder,
  normalizeDifficulty,
} from "../../lib/difficulty";
import {
  SUPPORTED_LANGUAGES,
  safeLanguage,
  speakingStyleRules,
} from "../../lib/languages";

const router = Router();

// Default title prefix used for free (non-scan) chats at creation time. Once a
// few turns exist we replace it with a topic derived from the conversation.
const FREE_CHAT_TITLE_PREFIX = "Free Chat";

// Generate a short topic title for a free chat from its messages and persist it,
// keeping the `Topic • Language` format so the language can still be parsed from
// the title as a fallback. Best-effort: failures must never affect the reply.
async function autoTitleFreeChat(opts: {
  conversationId: number;
  currentTitle: string;
  nativeLanguage: string;
  targetLanguage: string;
  transcript: { role: string; content: string }[];
  log: { error: (obj: unknown, msg: string) => void };
}): Promise<void> {
  // Only the default placeholder ("Free Chat • <language>") is eligible. Anchor
  // on the separator so a real topic that merely begins with these words is not
  // re-titled on a later turn.
  if (!opts.currentTitle.startsWith(`${FREE_CHAT_TITLE_PREFIX} • `)) return;
  if (!opts.targetLanguage) return;
  try {
    const convo = opts.transcript
      .filter((m) => m.role !== "system")
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`)
      .join("\n");
    if (!convo.trim()) return;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 20,
      messages: [
        {
          role: "system",
          content: `You name language-learning chat sessions. Given the conversation, reply with a SHORT topic title of 2-4 words in ${opts.nativeLanguage}, Title Case, describing what they are talking about. No quotes, no punctuation, no language names, no extra words.`,
        },
        { role: "user", content: convo },
      ],
    });

    let topic = (resp.choices[0]?.message?.content ?? "")
      .replace(/["'.]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!topic) return;
    if (topic.length > 40) topic = topic.slice(0, 40).trim();
    // Never regenerate the placeholder itself, which would keep it eligible.
    if (topic.toLowerCase() === FREE_CHAT_TITLE_PREFIX.toLowerCase()) return;

    // Atomic + idempotent: only overwrite while the title is still a default
    // placeholder, so concurrent turns can't double-title.
    await db
      .update(conversations)
      .set({ title: `${topic} • ${opts.targetLanguage}` })
      .where(
        and(
          eq(conversations.id, opts.conversationId),
          like(conversations.title, `${FREE_CHAT_TITLE_PREFIX} • %`),
        ),
      );
  } catch (err) {
    opts.log.error({ err }, "auto-title generation failed");
  }
}

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

// POST /openai/translate - translate a tutor message into the user's language
router.post("/openai/translate", async (req, res) => {
  const { text, to } = req.body as { text?: string; to?: string };

  const input = typeof text === "string" ? text.trim() : "";
  if (!input) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (input.length > 2000) {
    res.status(413).json({ error: "Text is too long" });
    return;
  }

  const targetLanguage = safeLanguage(to) ?? "English";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            `You are a translation engine. Translate the user's text into ${targetLanguage}. ` +
            `Respond with ONLY the translation — no quotes, no notes, no transliteration, ` +
            `no explanations. Preserve meaning and tone faithfully.`,
        },
        { role: "user", content: input },
      ],
    });

    const translation = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!translation) {
      res.status(502).json({ error: "Translation failed" });
      return;
    }
    res.json({ translation });
  } catch (err) {
    req.log.error({ err }, "Translation failed");
    res.status(502).json({ error: "Translation failed" });
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

Have a REAL conversation (most important):
- You are a friendly conversation partner first, a corrector second. Always respond to what the user actually said — react to the meaning, share a thought, and ask a natural follow-up so the chat keeps flowing.
- Only correct a CLEAR, meaningful mistake, and only after you have responded to the meaning. Keep it to a quick, natural rephrase in one short phrase — never a grammar lecture, and never the main point of your reply.
- If the user's message is already fine, do NOT invent a correction. Never label their words "correct" and then restate them — just keep the conversation going.

Teaching style:
- Keep replies SHORT (2-4 sentences max).
- Talk about everyday topics and useful vocabulary the learner can use right away.
- End every reply with one simple question in ${targetLanguage} to keep the conversation going.
- Be warm and encouraging. Do not use emojis.

${speakingStyleRules(targetLanguage)}`;

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

  // Surface the saved grade (if any) as a single nested object so the client
  // can render it on reopen.
  const grade =
    conv.gradeScore != null && conv.gradeFeedback
      ? {
          score: conv.gradeScore,
          summary: conv.gradeFeedback.summary,
          strengths: conv.gradeFeedback.strengths,
          mistakes: conv.gradeFeedback.mistakes,
          suggestions: conv.gradeFeedback.suggestions,
          gradedAt: conv.gradedAt,
        }
      : null;

  res.json({
    ...conv,
    difficulty: conv.difficulty ?? DEFAULT_DIFFICULTY,
    grade,
    messages: visibleMessages,
  });
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

  const { content, targetLanguage: requestedLanguage, difficulty: rawDifficulty } = req.body as {
    content?: string;
    targetLanguage?: string;
    difficulty?: string;
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

  // Re-anchor the difficulty level on every turn the same way as the language:
  // prefer the request value (current app setting), fall back to the stored
  // column, then the default. Persist it when it changes so it stays in sync.
  const requestedDifficulty = normalizeDifficulty(rawDifficulty);
  if (requestedDifficulty && requestedDifficulty !== owned.difficulty) {
    try {
      await db
        .update(conversations)
        .set({ difficulty: requestedDifficulty })
        .where(eq(conversations.id, id));
    } catch (err) {
      req.log.error({ err }, "failed to persist conversation difficulty");
    }
  }
  const difficulty =
    requestedDifficulty ?? normalizeDifficulty(owned.difficulty) ?? DEFAULT_DIFFICULTY;

  const targetLanguage =
    settingsLanguage ||
    safeLanguage(owned.targetLanguage) ||
    safeLanguage((owned.title ?? "").split(" • ")[1]);
  if (targetLanguage) {
    chatMessages.push({
      role: "system",
      content: `Reminder: reply in ${targetLanguage}, not English (unless the learner's language is English). This is a SPOKEN conversation — FIRST respond to what the learner just said like a real person talking out loud, in short, natural ${targetLanguage} (1-2 sentences) that's easy to hear and say back. No lists, headings, or long parentheses; keep any translation hint to a few words. Only fix a clear, meaningful mistake — briefly and naturally, after you've reacted to their meaning; never label correct words as wrong and never turn the reply into a grammar lesson. End with one short, easy question in ${targetLanguage} so the learner can answer aloud. ${difficultyReminder(difficulty, targetLanguage)}`,
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

  // Give free chats a real topic name once there's something to summarize.
  // Fire-and-forget so it never delays the reply; it no-ops unless the title
  // is still the default "Free Chat" placeholder.
  if (fullResponse) {
    void autoTitleFreeChat({
      conversationId: id,
      currentTitle: owned.title,
      nativeLanguage: safeLanguage(owned.nativeLanguage) || "English",
      targetLanguage: targetLanguage || safeLanguage(owned.targetLanguage) || "",
      transcript: [
        ...allMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content },
        { role: "assistant", content: fullResponse },
      ],
      log: req.log,
    });
  }
});

// Minimum learner turns required before a conversation can be graded.
const MIN_USER_MESSAGES_TO_GRADE = 1;

// POST /openai/conversations/:id/grade - grade the learner's performance.
// Returns a 0-100 score plus structured strengths/mistakes/suggestions and
// persists the result so it can be shown again on reopen.
router.post("/openai/conversations/:id/grade", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  if (req.customerId == null) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const { targetLanguage: rawTarget, nativeLanguage: rawNative, difficulty: rawDifficulty } =
    req.body as {
      targetLanguage?: string;
      nativeLanguage?: string;
      difficulty?: string;
    };

  const [owned] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.customerId, req.customerId)));

  if (!owned) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  const userMessages = allMessages.filter((m) => m.role === "user");
  if (userMessages.length < MIN_USER_MESSAGES_TO_GRADE) {
    res.status(422).json({
      error: "Chat a bit more before grading — you need at least a couple of messages.",
    });
    return;
  }

  // Resolve languages/difficulty from the request, falling back to the stored
  // columns, then the title/default. All are interpolated into a prompt, so the
  // language values are validated against the allowlist.
  const requestedTarget =
    typeof rawTarget === "string" && SUPPORTED_LANGUAGES.has(rawTarget.trim())
      ? rawTarget.trim()
      : undefined;
  const requestedNative =
    typeof rawNative === "string" && SUPPORTED_LANGUAGES.has(rawNative.trim())
      ? rawNative.trim()
      : undefined;
  const targetLanguage =
    requestedTarget ||
    safeLanguage(owned.targetLanguage) ||
    safeLanguage((owned.title ?? "").split(" • ")[1]) ||
    "the target language";
  const nativeLanguage = requestedNative || safeLanguage(owned.nativeLanguage) || "English";
  const difficulty =
    normalizeDifficulty(rawDifficulty) ?? normalizeDifficulty(owned.difficulty) ?? DEFAULT_DIFFICULTY;

  // Only the learner's own turns are evaluated; tutor/system turns are context.
  const transcript = allMessages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`)
    .join("\n");

  const gradingPrompt = `You are a strict but encouraging ${targetLanguage} language examiner. A ${nativeLanguage}-speaking learner at the ${difficulty} level just finished a conversation with an AI tutor. Evaluate ONLY the learner's own messages (the lines starting with "Learner:") for their ${targetLanguage} ability: grammar, vocabulary, spelling, and how much they actually attempted in ${targetLanguage} (versus falling back to ${nativeLanguage}). Grade relative to what is expected at the ${difficulty} level.

Respond with ONLY valid JSON in exactly this shape, with all text written in ${nativeLanguage}:
{
  "score": <integer 0-100>,
  "summary": "<one or two sentence overall assessment>",
  "strengths": ["<short strength>", ...],
  "mistakes": [{"error": "<what the learner wrote that was wrong>", "correction": "<the corrected ${targetLanguage}>"}, ...],
  "suggestions": ["<actionable tip to improve>", ...]
}
Rules: score is an integer 0-100. Include 1-4 strengths, 0-5 mistakes (empty array if none), and 1-4 suggestions. Keep each item concise. Do not include any text outside the JSON.

Conversation transcript:
${transcript}`;

  let feedback: GradeFeedback | null = null;
  let score = 0;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 900,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: gradingPrompt }],
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as {
      score?: number;
      summary?: string;
      strengths?: unknown;
      mistakes?: unknown;
      suggestions?: unknown;
    };

    const toStringArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const toMistakes = (v: unknown): GradeFeedback["mistakes"] =>
      Array.isArray(v)
        ? v
            .map((m) => {
              const obj = m as { error?: unknown; correction?: unknown };
              return {
                error: typeof obj.error === "string" ? obj.error : "",
                correction: typeof obj.correction === "string" ? obj.correction : "",
              };
            })
            .filter((m) => m.error || m.correction)
        : [];

    score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    feedback = {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      strengths: toStringArray(parsed.strengths),
      mistakes: toMistakes(parsed.mistakes),
      suggestions: toStringArray(parsed.suggestions),
    };
  } catch (err) {
    req.log.error({ err }, "Conversation grading failed");
    res.status(502).json({ error: "Grading failed. Please try again." });
    return;
  }

  const gradedAt = new Date();
  try {
    await db
      .update(conversations)
      .set({ gradeScore: score, gradeFeedback: feedback, gradedAt })
      .where(eq(conversations.id, id));
  } catch (err) {
    req.log.error({ err }, "failed to persist conversation grade");
  }

  res.json({
    score,
    summary: feedback.summary,
    strengths: feedback.strengths,
    mistakes: feedback.mistakes,
    suggestions: feedback.suggestions,
    gradedAt: gradedAt.toISOString(),
  });
});

export default router;
