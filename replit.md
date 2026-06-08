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
- Auth (optional sign-in) env — Replit-managed Clerk: server uses `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_PROXY_URL`; mobile dev/build inject `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CLERK_PROXY_URL`

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
- Practice-activity log: `artifacts/mobile/lib/activity.ts` + `hooks/useActivity.ts`

## Architecture decisions

- OpenAI vision (gpt-4o) identifies the scanned item from a base64 image, then generates a language-specific system prompt and initial tutor message. Vision-generated item labels are sanitized (whitespace collapsed, length capped) before being interpolated into the system prompt
- The tutor always replies in the language being learned, even when the user types/speaks in their native language. Enforced by (1) a strong system prompt at scan time and (2) a high-recency `system` reminder pushed after the latest user message on every streamed reply. **A conversation's language is intrinsic**: it is fixed at creation (scan / free chat), the whole message history + original system prompt are written in it, and the server anchors every turn (and grading) to the conversation's OWN language — `conversations.target_language` / `native_language` columns first, then a title-segment parse, then the request value only as a last-resort fallback for legacy rows. The server never overwrites the stored language from the request; mixing two languages in one chat is the bug that caused (re-anchoring "reply in X" while the stored prompt + history were in Y). All language values are validated against a `SUPPORTED_LANGUAGES` allowlist before reaching a prompt. The client still sends `targetLanguage` on each message POST and derives Whisper language + header from `prefs.targetLanguage`, but the server ignores it for anchoring. Changing the language in Settings (or via the History "switch to X" popup) updates the global learning indicator + future scans only; it does NOT retroactively flip an existing conversation. Opening a past chat from History switches only the global `targetLanguage` (so the home indicator follows what you chose to practice) — it must NEVER change `nativeLanguage` (that drives the app UI locale; swapping it flipped the whole app to another language)
- Speaking practice: tapping the mic records, and on stop the audio is transcribed (Whisper) and the message is auto-sent so it's a natural back-and-forth. Audio→base64 is platform-aware (web reads the `blob:` URL via fetch+FileReader; native uses the expo-file-system File API). Mic is unreliable in the web preview iframe — test on a device via Expo Go
- Conversations are stored in PostgreSQL; system messages are persisted for AI context but filtered out on the client
- Streaming SSE for chat responses using `expo/fetch` (supports streaming on all Expo platforms)
- Express JSON body limit raised to 10mb to handle base64 image payloads
- `setBaseUrl` is called at app root in `_layout.tsx` so all generated hooks work from Expo Go
- Streaks and daily progress count ANY practice, not just new conversations. A local practice-activity log (`lib/activity.ts`, AsyncStorage, serialized writes) records an event for chat sends, flashcard checks, alphabet letters, and sentence taps; `markVoiceChat()` also stamps a "last voice chat" time. Progress + Settings merge the server conversation `createdAt`s with this log for streak / active-days / week-chart / daily-goal. Conversation *creation* is NOT logged (the server list already covers it) and voice flows only stamp the timestamp (the auto-send records the single event) to avoid double counting.
- Per-customer data is scoped by a stable device id (no auth yet). The mobile app generates/persists a UUID in AsyncStorage (`lib/device.ts`), sets it via `setDeviceId` at app root, and sends it as an `x-device-id` header on every request (generated hooks auto-inject it; direct `expoFetch` calls add it manually). Server middleware upserts a `customers` row from the header and sets `req.customerId`; conversations and vocabulary are filtered/ownership-checked by that id. Requests with no device id see an empty list.
- Per-customer tracking lives on the `customers` table: `plan` ('free'/'pro') + `pro_since` for tiering, and `scan_count` (pictures taken), `chat_count` (chats started), `message_count` (messages sent) usage counters incremented in the scan, create-conversation, and message-send routes. View these directly in the Supabase Table Editor.
- **Optional auth (Replit-managed Clerk)**: Sign-in is optional — the anonymous device flow stays the default and the app is never gated behind login. Email sign-up (with email-code verification) and Sign in with Apple are supported. The server mounts the Clerk proxy + `clerkMiddleware`; identity resolution in `customer.ts` is token-aware — a Clerk session resolves/creates the `customers` row by `auth_user_id` and keeps the Clerk-**verified** primary email in sync (overwrites only on a non-null change, so a stale value is never kept and errors/no-primary never clobber); otherwise it falls back to the `x-device-id` device row. On first sign-in the mobile `auth.tsx` screen calls `POST /api/account/link` (auth-gated, idempotent — locks the device row `FOR UPDATE` so concurrent/retried calls can't double-count) which merges the anonymous device row's conversations + vocab selections + usage counters into the account row and re-syncs the verified email. `customers` has nullable `auth_user_id` (unique) + `email`; `device_id` is nullable. The mobile app renders immediately (Clerk hydrates in the background, not gated by `<ClerkLoaded>`); the auth modal waits for a session token before linking and shows a retry on failure so device data is never silently dropped.

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
