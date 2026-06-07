---
name: Drizzle push is all-or-nothing
description: Why a single column add can fail to apply, and the surgical workaround
---

# `drizzle-kit push` applies the WHOLE diff or nothing

- `pnpm --filter @workspace/db run push` diffs the entire schema against the DB and tries to apply **every** pending change in one shot. If any one change triggers an interactive confirmation (e.g. adding a UNIQUE constraint to a table with existing rows → "do you want to truncate?"), push aborts in this non-TTY environment with `Interactive prompts require a TTY terminal` — and **none** of your changes (not even an unrelated safe nullable column) get applied.
  - **Why:** there can be pre-existing schema drift unrelated to your change (the `sentence_bank` unique-constraint prompt is a known one here) that blocks all pushes. `push --force` (the `push-force` script) would auto-accept that prompt and **truncate** the table — do not use it to land an unrelated column.
- **Workaround for a single additive change:** apply just your statement with a direct `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` against the real Supabase DB. Build the connection string with the same logic as `lib/db/src/connection.ts` (substitute `SUPABASE_DB_PASSWORD`, URL-encoded, into the `[YOUR-PASSWORD]` placeholder of `SUPABASE_DATABASE_URL`) and run it via `pg` from inside `lib/db` (so `pg` resolves). Keep the Drizzle schema TS in sync so types match.
- **Deploy caveat:** a manual ALTER only touches the env you ran it against. The same statement must be run on the **production** DB before/at deploy, or the live app will error with `column ... does not exist`. (See the `database` skill for running against production.)
