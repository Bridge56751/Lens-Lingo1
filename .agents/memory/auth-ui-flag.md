---
name: Hide sign-in UI flag
description: Why email sign-in is hidden behind a flag while the Clerk architecture stays mounted, and the constraints when toggling it.
---

# Hiding the email sign-in UI

The mobile app can ship with email sign-in hidden so App Store users only use the
anonymous device-id flow, while ALL Clerk/account architecture stays mounted and
dormant. A single flag `AUTH_UI_ENABLED` (in `artifacts/mobile/constants/features.ts`,
default `false`) gates the Settings sign-in entry points.

**Why:** Product decision — ship anonymous-only first; re-enable email sign-in later
with a one-line flag flip, no re-architecting. Apple-safe: a shipped UI that offers
no account *creation* doesn't trigger Sign-in-with-Apple (4.8) or account-deletion
(5.1.1(v)) obligations. Offering NO login is fine; only offering a social login
*without* Sign in with Apple is the violation.

**How to apply:**
- Gate only the sign-in CTA + "sign in to sync" sub-text behind the flag. Keep the
  signed-in branch (email + **sign-out**) rendering UNCONDITIONALLY, or a pre-existing
  Clerk session gets trapped with no way out.
- The Settings profile card also holds the learning-language pill — never hide the
  whole card to kill sign-in; gate just the auth controls.
- Leave the `auth` route registered in `_layout.tsx` and `ClerkProvider` mounted; the
  screen just becomes unreachable from the UI. Don't delete the route.
- Anonymous account deletion already works: deletion branches on `isSignedIn && user`
  before calling Clerk `user.delete()`, so anonymous users only hit the server delete.
- Server already falls back to device id when there's no auth identity — no server,
  schema, or RevenueCat change is needed to hide sign-in.
