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
