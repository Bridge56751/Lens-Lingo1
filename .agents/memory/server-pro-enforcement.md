---
name: Server-side Pro enforcement
description: How the API mirrors the client free/Pro boundary, and the rule for gating a new route.
---

# Server-side Pro enforcement (requirePro)

Paid features are enforced on the API server with a `requirePro` middleware
(returns 403 `{error:"pro_required"}`), in addition to the client-side ProGuard.
Entitlement is resolved via `customerHasPro` which reconciles from RevenueCat.

## The rule for deciding whether a route is Pro
Gate a route **iff its only client callers are behind `ProGuard`** (or behind a
`requirePro()` client gate). Mirror the EXISTING boundary exactly — do NOT invent
new restrictions or numeric caps. Decide by cross-referencing the client surfaces,
not by guessing from the route name.

**Why:** A route name is misleading. `/openai/translate` sounds generic but is
only reachable from the Pro-guarded conversation screen, so it must be gated.
Meanwhile `/openai/romanize` and `/openai/tts` ARE used by free screens
(scan result, alphabet, sentences) so they must stay open even though they look
"premium". Getting this wrong either locks out free users or leaks a paid feature
to direct-API callers.

**How to apply:** When adding/gating a route, grep the mobile app for its callers
and check whether every caller is inside `<ProGuard>` / a `requirePro()`-gated
navigation. Free as of this writing: list, DELETE /:id, romanize, tts, scan,
/me/plan, health, account, sentences bank. Pro: transcribe, create, chat,
GET /:id, messages get+post, grade, translate, all of vocab + vocabulary.

## Fail-closed vs fail-open
`requirePro` fails **closed**: `customerHasPro` resolves to `false` on any error
(including a hard DB read error) so a gate never leaks access. BUT a RevenueCat
outage does NOT lock out paying users — the reconcile is best-effort, so a stored
Pro plan is still served when RC is unreachable; only a hard DB failure denies.
This is intentionally asymmetric with `/me/plan`, which is informational and
surfaces a 500 instead of denying.

## Client handling
A 403 `pro_required` routes the user to `/paywall`. Generated-hook calls are
handled globally (QueryCache + MutationCache `onError` in `_layout.tsx` via
`lib/proRequired.ts` duck-typing `status===403 && data.error==="pro_required"`).
Manual `expoFetch` calls (chat stream, voice transcribe, translate) must check
`response.status === 403` themselves and call `goToPaywallForProRequired()`.
