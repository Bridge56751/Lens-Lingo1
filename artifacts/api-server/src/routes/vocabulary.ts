import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";

const router = Router();

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "and", "or", "but", "if", "then", "than", "of", "in", "on", "at", "to",
  "for", "with", "by", "as", "this", "that", "these", "those", "it", "its",
  "i", "you", "he", "she", "we", "they", "me", "my", "your", "our", "their",
  "do", "does", "did", "have", "has", "had", "will", "would", "can", "could",
  "should", "may", "might", "what", "when", "where", "why", "how", "who",
  "not", "no", "yes", "so", "very", "just", "also", "from", "into", "about",
  "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "pero",
  "de", "del", "en", "con", "por", "para", "que", "es", "son", "soy",
  "le", "les", "des", "et", "ou", "mais", "je", "tu", "il",
  "der", "die", "das", "und", "oder", "aber", "ich", "du", "er", "sie",
  "lo", "gli", "ma", "io", "lui",
]);

// GET /vocabulary - aggregate unique words from assistant messages, oldest first
router.get("/vocabulary", async (req, res) => {
  // Single SQL pass: join assistant messages to their conversations, sorted by message createdAt ascending
  const rows = await db
    .select({
      content: messages.content,
      messageCreatedAt: messages.createdAt,
      conversationId: conversations.id,
      conversationTitle: conversations.title,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(messages.role, "assistant"))
    .orderBy(asc(messages.createdAt));

  type Acc = {
    word: string;
    language: string;
    count: number;
    firstSeenAt: Date;
    conversationId: number;
    conversationTitle: string;
  };
  const wordMap = new Map<string, Acc>();

  for (const row of rows) {
    const parts = (row.conversationTitle ?? "").split(" • ");
    const language = parts[1] ?? "Unknown";
    const ts = new Date(row.messageCreatedAt);

    const tokens = row.content
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\s'-]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

    for (const word of tokens) {
      const key = `${language}::${word}`;
      const existing = wordMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        // Because rows are ascending by createdAt, the first time we see a word
        // is genuinely the first occurrence — record that conversation as the source.
        wordMap.set(key, {
          word,
          language,
          count: 1,
          firstSeenAt: ts,
          conversationId: row.conversationId,
          conversationTitle: row.conversationTitle,
        });
      }
    }
  }

  const result = Array.from(wordMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 500)
    .map((w) => ({
      ...w,
      firstSeenAt: w.firstSeenAt.toISOString(),
    }));

  res.json(result);
});

export default router;
