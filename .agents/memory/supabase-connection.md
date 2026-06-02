---
name: Supabase connection from Replit
description: Why Supabase Postgres must use the Session pooler here, and the split-password env pattern that avoids hand-edited-URI breakage.
---

# Connecting to Supabase Postgres from this environment

## Rule
Use the **Session pooler** connection string, never the **Direct connection**.

- Direct host `db.<ref>.supabase.co` resolves to **IPv6 only**. This environment is
  IPv4-only, so connecting yields `ENETUNREACH`/`ETIMEDOUT` and every query hangs.
- Session pooler host is `aws-<n>-<region>.pooler.supabase.com:5432`, username
  `postgres.<project-ref>` (note the dot). It is IPv4-proxied and works.
- Transaction pooler (port 6543) is IPv4 too but is poor for `drizzle-kit push`
  (DDL / prepared statements). Prefer **Session pooler (5432)** for both runtime and migrations.

**Why:** Supabase moved direct connections to IPv6-only; Replit containers have no IPv6 route.
**How to apply:** When a user pastes a Supabase URI, verify it contains `pooler.supabase.com`
and username `postgres.<ref>` before trusting it. The "Connect" quick dropdown only shows the
Direct string — the pooler strings live behind the **"Get Connected"** button.

## Split-password env pattern
Non-technical users repeatedly mangle a hand-edited URI (drop the `@`, or paste an
unescaped special-char password that breaks URL parsing). Avoid this entirely:

- Have them paste the pooler URI **verbatim with the literal `[YOUR-PASSWORD]` placeholder**.
- Collect the password as a **separate** secret `SUPABASE_DB_PASSWORD`.
- A resolver substitutes `encodeURIComponent(SUPABASE_DB_PASSWORD)` into the placeholder.

In this repo the resolver lives in `lib/db` and is shared by both the runtime pool and the
drizzle migration config, so `SUPABASE_DATABASE_URL` (with placeholder) + `SUPABASE_DB_PASSWORD`
together produce the real connection string.

## Verifying safely
Never echo the connection string (Node's `new URL()` error prints the raw input, leaking the
password — if that happens, tell the user to reset the DB password). Test connectivity by
printing only booleans / the pg error `code`, e.g. attempt a `pg.Client` connect with a short
`connectionTimeoutMillis` and log `e.code` only. `pg` is hoisted under
`node_modules/.pnpm/pg@<ver>/node_modules/pg` and isn't require-able from the repo root or a
package that doesn't directly depend on it — resolve it by explicit `.pnpm` path for ad-hoc tests.
