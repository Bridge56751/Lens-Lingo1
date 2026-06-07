---
name: Optional Clerk auth (LinguaScan)
description: How optional sign-in (Replit-managed Clerk) coexists with the anonymous device flow without gating the app.
---

# Optional Clerk auth + anonymous device flow

Sign-in is **optional**. The anonymous `x-device-id` flow is the default and must
never be gated behind login.

**Rule:** never wrap the mobile app tree in `<ClerkLoaded>` (or any auth-load gate).
- **Why:** `<ClerkLoaded>` withholds children until Clerk finishes loading; if Clerk
  is slow/unavailable the whole anonymous app goes blank — that is effectively
  gating. Render immediately and let Clerk hydrate in the background.
- **How to apply:** `_layout.tsx` keeps `<ClerkProvider>` (so hooks have context)
  but renders `<RootLayoutNav/>` directly, no load gate. `AuthTokenSync` registers
  the token getter once (`getToken` reads the live session; returns null when signed
  out so requests fall back to the device flow).

**Rule:** the first-sign-in carry-over (`POST /api/account/link`) must wait for a
session token and only finish on success.
- **Why:** the Clerk session token can lag the `isSignedIn` flip; firing the
  auth-gated link endpoint too early 401s and, if you close the modal on settle,
  silently drops the device's conversations/vocab/counters. The merge is the only
  chance to carry anonymous data into the account.
- **How to apply:** `auth.tsx` `runLink()` polls `getToken()` (~6×300ms) for a
  non-null token before `linkAccount.mutateAsync`; closes the modal only on success;
  on failure shows a retry UI. `startedRef` triggers it once per mount; the server
  endpoint is idempotent so retries/double-fires are safe.

Identity resolution lives in `customer.ts`: a Clerk session resolves/creates the
`customers` row by `auth_user_id` and stores the Clerk-**verified** email;
otherwise falls back to the device row. `customers.auth_user_id` (unique) + `email`
are nullable and `device_id` is nullable.

**Rule:** sync the verified email on every authenticated resolution + at link
time, not just when the stored value is null.
- **Why:** a user can change their primary verified email in Clerk; a
  backfill-only-when-null policy leaves Supabase stale forever.
- **How to apply:** call `getVerifiedEmail()` and overwrite only when it returns a
  non-null value that differs from the stored one. `getVerifiedEmail` returns null
  on both error and no-verified-primary, so the non-null guard keeps the prior
  value instead of clobbering it (never null out an existing email on a transient
  Clerk failure).

**Rule:** `/account/link` must lock the device row `FOR UPDATE` inside the merge
transaction.
- **Why:** sequential idempotency isn't enough — two concurrent/retried link calls
  can both read the same device counters before either delete wins, double-counting
  scan/chat/message usage into the account.
- **How to apply:** `tx.select()...for("update")` on the device row; the second tx
  blocks, then re-evaluates and finds the row deleted -> clean no-op.
