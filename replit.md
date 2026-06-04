# LinguaScan

A language learning mobile app that lets users scan real-world objects with their camera and jump into an AI-powered conversation to learn vocabulary and practice in any language.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/mobile run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- DB connection: `SUPABASE_DATABASE_URL` (preferred) falls back to `DATABASE_URL`
  - Must be the Supabase **Session pooler** URI (`...pooler.supabase.com:5432`, user `postgres.<ref>`). The Direct connection (`db.<ref>.supabase.co`) is IPv6-only and unreachable here.
  - Paste the pooler URI with the literal `[YOUR-PASSWORD]` placeholder left in place; provide the password separately as `SUPABASE_DB_PASSWORD`. `lib/db/src/connection.ts` URL-encodes and substitutes it for both the runtime pool and drizzle migrations.
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-provisioned by Replit AI Integrations

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo (React Native) with Expo Router
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: OpenAI GPT (vision + chat) via Replit AI Integrations
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/` (customers.ts, conversations.ts, messages.ts)
- DB connection resolver: `lib/db/src/connection.ts` (Session-pooler + split-password substitution)
- Customer middleware: `artifacts/api-server/src/middleware/customer.ts`
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated React Query hooks: `lib/api-client-react/src/generated/`
- Generated Zod schemas: `lib/api-zod/src/generated/`
- API routes: `artifacts/api-server/src/routes/` (scan.ts, openai/conversations.ts)
- Mobile app: `artifacts/mobile/app/` (tabs: index + history, conversation/[id])
- Design tokens: `artifacts/mobile/constants/colors.ts`

## Architecture decisions

- OpenAI vision (gpt-4o) identifies the scanned item from a base64 image, then generates a language-specific system prompt and initial tutor message. Vision-generated item labels are sanitized (whitespace collapsed, length capped) before being interpolated into the system prompt
- The tutor always replies in the language being learned, even when the user types/speaks in their native language. Enforced by (1) a strong system prompt at scan time and (2) a high-recency `system` reminder pushed after the latest user message on every streamed reply. The learning language is driven by the user's current app settings (`usePreferences` → `targetLanguage`): the conversation screen derives the Whisper transcription language + header from it and sends `targetLanguage` on every message POST. The server validates it against a `SUPPORTED_LANGUAGES` allowlist (it's interpolated into a system message) and persists it onto the conversation (best-effort try/catch so it never aborts the reply). `conversations.target_language` / `native_language` columns store the scan-time value and act as fallback; title parsing is a last-resort legacy fallback. Changing the language in Settings flips subsequent turns of an existing conversation
- Speaking practice: tapping the mic records, and on stop the audio is transcribed (Whisper) and the message is auto-sent so it's a natural back-and-forth. Audio→base64 is platform-aware (web reads the `blob:` URL via fetch+FileReader; native uses the expo-file-system File API). Mic is unreliable in the web preview iframe — test on a device via Expo Go
- Conversations are stored in PostgreSQL; system messages are persisted for AI context but filtered out on the client
- Streaming SSE for chat responses using `expo/fetch` (supports streaming on all Expo platforms)
- Express JSON body limit raised to 10mb to handle base64 image payloads
- `setBaseUrl` is called at app root in `_layout.tsx` so all generated hooks work from Expo Go
- Per-customer data is scoped by a stable device id (no auth yet). The mobile app generates/persists a UUID in AsyncStorage (`lib/device.ts`), sets it via `setDeviceId` at app root, and sends it as an `x-device-id` header on every request (generated hooks auto-inject it; direct `expoFetch` calls add it manually). Server middleware upserts a `customers` row from the header and sets `req.customerId`; conversations and vocabulary are filtered/ownership-checked by that id. Requests with no device id see an empty list.
- Per-customer tracking lives on the `customers` table: `plan` ('free'/'pro') + `pro_since` for tiering, and `scan_count` (pictures taken), `chat_count` (chats started), `message_count` (messages sent) usage counters incremented in the scan, create-conversation, and message-send routes. View these directly in the Supabase Table Editor.

## Product

- **Scan**: Take a photo or pick from gallery — the AI identifies the object and translates it into your chosen language
- **Conversation**: Chat with an AI language tutor about the scanned item; responses stream in real time
- **History**: Browse all past scan sessions; tap to continue any conversation; long-press to delete
- Supports 12 languages: Spanish, French, German, Italian, Portuguese, Japanese, Chinese, Korean, Arabic, Russian, Hindi, Dutch

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`
- Run `pnpm --filter @workspace/db run push` after adding new schema files and exporting from `lib/db/src/schema/index.ts`
- The `integrations-openai-ai-react` lib is excluded from root `tsconfig.json` references (not needed for Expo)
- Web preview safe-area insets differ from native — always test on device via Expo Go QR code
