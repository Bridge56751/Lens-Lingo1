---
name: Server-side Pro enforcement
description: The rule for deciding whether an API route is Pro-gated, and the fail-closed semantics.
---

# Server-side Pro enforcement (requirePro)

Paid features are enforced on the API with a `requirePro` middleware (403
`{error:"pro_required"}`), in addition to the client-side ProGuard. Entitlement
is resolved via `customerHasPro`, which reconciles from RevenueCat.

## The rule for deciding whether a route is Pro
Gate a route **iff its only client callers are behind `ProGuard`** (or a
`requirePro()` client navigation gate). Mirror the EXISTING boundary exactly — do
NOT invent new restrictions or numeric caps. Decide by grepping the mobile app
for the route's callers and checking each is on a Pro surface, NOT by guessing
from the route name.

**Why:** Route names mislead. `/openai/translate` sounds generic but is only
reachable from the Pro conversation screen, so it must be gated; `/openai/romanize`
and `/openai/tts` sound premium but are used by FREE screens (scan result,
alphabet, sentences), so they must stay open. Guessing from the name either locks
out free users or leaks a paid feature to direct-API callers.

**Trap — conversation DELETE is FREE, not Pro.** It is tempting (and a planning
matrix once said) to gate `DELETE /openai/conversations/:id`. Don't. The free
flow is: scan (free) creates a conversation server-side → it shows in History
(the list route is free) → the History delete button calls the delete mutation
with NO `requirePro()` client gate. Only *opening/continuing* a past chat is Pro
(History `handleOpen` gates). Gating delete would stop free users from removing
their own scanned history — a NEW restriction, which this feature must never add.

## Fail-closed vs fail-open
`requirePro` fails **closed**: `customerHasPro` resolves to `false` on any error
(incl. a hard DB read error) so a gate never leaks access. BUT a RevenueCat outage
does NOT lock out paying users — the reconcile is best-effort, so a stored Pro
plan is still served when RC is unreachable; only a hard DB failure denies. This
is intentionally asymmetric with `/me/plan`, which is informational and surfaces a
500 instead of denying.

## Client 403 handling — the easy-to-miss part
A 403 `pro_required` must route to `/paywall`. Generated React-Query hooks are
covered globally (QueryCache + MutationCache `onError` in `_layout.tsx` via
`lib/proRequired.ts`, duck-typing `status===403 && data.error==="pro_required"`).
**Every manual `expoFetch` path to a Pro route must handle 403 itself** — these
bypass React Query. They are scattered across screens AND shared lib helpers
(e.g. the shared audio/transcribe helper feeds multiple Pro screens), so when
gating a route, grep for ALL fetch callers, not just the obvious screen.
