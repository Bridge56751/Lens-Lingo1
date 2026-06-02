import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { openai, toFile } from "@workspace/integrations-openai-ai-server";

const router = Router();

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

// GET /openai/conversations - list all conversations
router.get("/openai/conversations", async (req, res) => {
  const all = await db
    .select()
    .from(conversations)
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
  const [conv] = await db.insert(conversations).values({ title }).returning();
  res.status(201).json(conv);
});

// GET /openai/conversations/:id - get conversation with messages (excluding system messages)
router.get("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

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

  const [deleted] = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
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

  const { content } = req.body as { content?: string };
  if (!content) {
    res.status(400).json({ error: "content is required" });
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

  // Save user message first
  await db.insert(messages).values({
    conversationId: id,
    role: "user",
    content,
  });

  // Build chat messages for OpenAI (include system + history + new user message)
  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    ...allMessages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content },
  ];

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
