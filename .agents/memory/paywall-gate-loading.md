---
name: Paywall gate loading window
description: Converting a free/Pro tap-gate to a "locked" flag that excludes the loading state opens a cold-start bypass; add a separate loading no-op.
---

# Paywall tap-gate fail-open during plan loading

When a control is Pro-gated, the visual "locked" flag and the tap-time gate are
NOT the same condition and must not be collapsed into one.

A common pattern: to avoid flashing lock icons at a genuinely-Pro user during the
RevenueCat customer-info fetch, the visual flag is computed as
`locked = !isPro && !isLoading && <other conditions>`. The `!isLoading` term is
correct for the *visual* (don't show a lock until tier is known).

**The trap:** if the tap handler is then written as `if (locked) { ...paywall... }`,
during the loading window `locked` is false for every row, so a free user can tap
a paid option and it falls straight through to the action — a fail-open paywall
bypass on cold start. The old `if (!isPro)` gate failed *closed*; the refactor
silently inverts that.

**Rule:** keep `!isLoading` in the visual `locked` calc, but add a separate
loading no-op in the tap handler BEFORE the locked check:
`if (active) return; if (planLoading) return; if (locked) { paywall; return; } apply();`
This matches the repo convention in `usePro.ts` `requirePro` (no-op while loading
so a Pro user isn't bounced and a free user can't slip through).

**How to apply:** any time you turn a `!isPro`/`!isSubscribed` tap-gate into a
derived `locked`/`isUnlocked` flag that consults `isLoading`/`planLoading`, audit
the tap handler for the fail-open window. Applies to the Home + Settings language
pickers (both consult `isLoading` from `useSubscription`).
