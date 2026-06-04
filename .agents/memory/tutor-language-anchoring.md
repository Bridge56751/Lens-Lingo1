---
name: AI tutor language anchoring
description: How LinguaScan keeps the tutor replying in the language being learned
---

# Keeping the tutor in the target language

- The tutor must always reply in the **target language** (the one being learned), even when the learner types/speaks in their native language. This is enforced two ways and both are needed:
  1. A strong system prompt at scan time with explicit "CRITICAL LANGUAGE RULES".
  2. A **high-recency `system` reminder pushed AFTER the latest user message** on every turn in the streaming message route. Without this, long chats drift back to English once the learner replies in their native language.
- **The learning language is driven by the user's current app settings** (`usePreferences` → `targetLanguage`, persisted in AsyncStorage), not locked to scan time. The conversation screen derives Whisper language + header from `prefs.targetLanguage` and sends `targetLanguage` in each message POST. The server validates it against a `SUPPORTED_LANGUAGES` allowlist (it's interpolated into a system message — injection surface) and persists it onto the conversation when changed. Persisting must be best-effort (try/catch) so it never aborts the reply turn. Changing settings mid-conversation intentionally flips subsequent turns.
- **Target/native language are also persisted as columns on `conversations`** (`target_language`, `native_language`), set at scan time and used as fallback. Do NOT re-derive the language by parsing the title (`itemName • targetLanguage`) — item names can contain the separator and break it. Title parse is only a last-resort fallback for legacy rows.
- **History is grouped by language and gated by the current learning language.** Conversations are grouped into `SectionList` sections by their language (parsed from the title and resolved case-insensitively to a known `LANGUAGES` member). A chat whose language differs from `prefs.targetLanguage` is shown locked (dimmed + lock icon) and tapping it prompts to switch the learning language (switch-and-open) instead of opening. Unknown/unparseable title languages are treated as "open directly, never locked". The lock UI and the open-gate MUST use the same resolver so they never contradict.
- **Vision-model item labels are untrusted** and get interpolated into the high-priority system prompt; sanitize them (collapse whitespace, cap length) before interpolation to avoid prompt-injection via odd image captions.
  - **Why:** an architect review flagged both the brittle title parse and the injection surface.
