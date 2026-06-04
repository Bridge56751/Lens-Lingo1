---
name: AI tutor language anchoring
description: How LinguaScan keeps the tutor replying in the language being learned
---

# Keeping the tutor in the target language

- The tutor must always reply in the **target language** (the one being learned), even when the learner types/speaks in their native language. This is enforced two ways and both are needed:
  1. A strong system prompt at scan time with explicit "CRITICAL LANGUAGE RULES".
  2. A **high-recency `system` reminder pushed AFTER the latest user message** on every turn in the streaming message route. Without this, long chats drift back to English once the learner replies in their native language.
- **Target/native language are persisted as structured columns on `conversations`** (`target_language`, `native_language`), set at scan time. Do NOT re-derive the language by parsing the title (`itemName • targetLanguage`) — item names can contain the separator and break it. Title parse is only a fallback for legacy rows.
- **Vision-model item labels are untrusted** and get interpolated into the high-priority system prompt; sanitize them (collapse whitespace, cap length) before interpolation to avoid prompt-injection via odd image captions.
  - **Why:** an architect review flagged both the brittle title parse and the injection surface.
