---
name: CORS prod domain mismatch
description: The live production domain isn't in the coded CORS allowlist; enabling CORS can 403 the web app's browser POSTs.
---

- Production is served at `https://lenslingo.app` (custom domain, always-on VM deployment). This domain is NOT in `cors.ts` `PROD_ORIGINS`, which lists only `lenslingo.ai`, `www.lenslingo.ai`, `lenslingo.replit.app`.
- The prod deployment serves BOTH the web build (`GET /` → HTML, title "Lens Lingo") AND the API (`/api`) on that same domain.

**Consequence:** with CORS enforcement enabled, browser POSTs (scan, send message) from the web app carry `Origin: https://lenslingo.app`, which fails the allowlist → `403 origin_not_allowed`. Same-origin POSTs still send an `Origin` header, so sharing the domain does NOT save you.

**Native iOS app is unaffected** — it sends no `Origin` header, and `isAllowedOrigin()` returns true when origin is falsy.

**How to apply:** if the web version breaks after a security/CORS deploy, set `ALLOWED_ORIGINS` (production scope) to a superset that includes `https://lenslingo.app,https://www.lenslingo.app` plus the existing `.ai`/`.replit.app` defaults. The env var *replaces* the whole default set, so you must list every origin you want allowed.

**Why:** as of 2026-07-04 the user chose to skip this (treating the app as iOS-only), so prod may still be running on the default allowlist that omits `lenslingo.app`.
