# LinguaScan

A language learning mobile app that lets users scan real-world objects with their camera and jump into an AI-powered conversation to learn vocabulary and practice in any language.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/mobile run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
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

- DB schema: `lib/db/src/schema/` (conversations.ts, messages.ts)
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated React Query hooks: `lib/api-client-react/src/generated/`
- Generated Zod schemas: `lib/api-zod/src/generated/`
- API routes: `artifacts/api-server/src/routes/` (scan.ts, openai/conversations.ts)
- Mobile app: `artifacts/mobile/app/` (tabs: index + history, conversation/[id])
- Design tokens: `artifacts/mobile/constants/colors.ts`

## Architecture decisions

- OpenAI vision (gpt-5.4) identifies the scanned item from a base64 image, then generates a language-specific system prompt and initial tutor message
- Conversations are stored in PostgreSQL; system messages are persisted for AI context but filtered out on the client
- Streaming SSE for chat responses using `expo/fetch` (supports streaming on all Expo platforms)
- Express JSON body limit raised to 10mb to handle base64 image payloads
- `setBaseUrl` is called at app root in `_layout.tsx` so all generated hooks work from Expo Go

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
