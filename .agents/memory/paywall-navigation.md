---
name: Paywall navigation
description: How/when the app may navigate to the paywall, to avoid spontaneous pops and stacked paywalls.
---

# Paywall navigation

All paywall navigation goes through ONE guarded entry point (`goToPaywall(feature?)`
in `lib/proRequired.ts`). It (a) no-ops while the paywall is the focused route
(a module flag the paywall sets via `useFocusEffect`) and (b) debounces bursts.
`requirePro()`, the global Pro-error handler, ProGuard's upgrade CTA, and the
manual voice/transcribe path all route through it.

**Rule: only USER-INITIATED triggers may open the paywall — never a background
query refetch.** The global React Query Pro-403 handler is wired to the
MUTATION cache ONLY, not the query cache.

**Why:** A global `QueryCache.onError → router.push("/paywall")` made the paywall
"pop up for no reason." Every Pro-gated GET is used exclusively inside a
`ProGuard`-wrapped screen, so a free user never fires one through normal
navigation; a query 403 that still reaches the client is a transient
client/server plan mismatch or a background refetch (focus / reconnect /
staleness). Routing those navigated unprompted. Separately, no "already on the
paywall" guard meant a second 403 (or a tap) while the paywall was open pushed a
second paywall modal on top — the "pulls up even when already on a paywall" bug.

**How to apply:** Never re-add paywall routing to the query cache. Keep every new
paywall trigger going through `goToPaywall`. Pro-only screens get their gating
from `ProGuard` (mount guard) + an entry-point `requirePro()` check, not from a
GET 403. If a Pro screen needs to react to its own GET 403 (e.g. mid-session
lapse), handle it locally/inline — do not reach for global navigation.
