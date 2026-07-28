---
name: OpenAI AI-Integrations proxy model support
description: Which OpenAI models/endpoints the Replit AI Integrations proxy accepts for this app
---
The server's OpenAI client goes through the Replit AI Integrations proxy (AI_INTEGRATIONS_OPENAI_BASE_URL).

**Rule:** the proxy rejects `whisper-1` ("Model 'whisper-1' is not supported", 400). Use `gpt-4o-mini-transcribe` (or `gpt-4o-transcribe`) for all speech-to-text. Chat models and `gpt-4o-mini-tts` via the app's live `/api/openai/tts` route work.

**Why:** discovered 2026-07-28 when the user asked to verify provider linkage — both the chat voice-input transcribe route and the new vocab pronounce route were silently broken on whisper-1.

**How to apply:** any new speech-to-text call must use the gpt-4o transcribe models; smoke-test provider changes with a direct client call (chat + transcribe + live tts curl), not just typecheck.
