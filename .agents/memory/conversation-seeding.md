---
name: Conversation seeding rule
description: Any path that creates a tutor conversation must seed messages and language columns, or downstream chat breaks.
---

Any new way to create a conversation (scan, free chat, future entry points) MUST:
1. Seed at least one message (a `system` prompt; ideally `system` + opening `assistant`).
2. Persist `targetLanguage` and `nativeLanguage` columns on the conversation row.

**Why:**
- The send-message route guards with `allMessages.length === 0` → returns 404. A conversation row with zero messages is unusable (you can't send the first turn).
- Per-turn language re-anchoring reads `conversations.targetLanguage` (then falls back to title `" • "` split). Missing columns means the tutor can drift off the learning language.

**How to apply:**
- Mirror the scan route's transaction pattern: insert conversation + seed messages + bump usage counters atomically.
- Validate any client-supplied language against the `SUPPORTED_LANGUAGES` allowlist before interpolating into prompts (prompt-injection guard) — shared across scan, free-chat, and message routes.
- Title format `"<name> • <Language>"` keeps Home/History/Conversation title parsing working.

## Free-chat auto-titling
Free (non-scan) chats are created with placeholder title `Free Chat • <lang>`. After the streamed reply completes in the messages route, `autoTitleFreeChat` fire-and-forgets a gpt-4o-mini call to derive a 2-4 word topic and persists `${topic} • ${targetLanguage}`. Idempotency is enforced at the DB level: the UPDATE has `WHERE title LIKE 'Free Chat • %'`, plus a startsWith guard and a guard that refuses to regenerate the placeholder. Always keep the ` • ` separator in any title — history.tsx parses language via `title.split(" • ")[1]`.
