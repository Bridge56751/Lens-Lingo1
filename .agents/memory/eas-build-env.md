---
name: EAS build env vars
description: EXPO_PUBLIC_* vars the app needs at build time must be in eas.json (or EAS env vars); EAS cloud builds can't see the Replit workspace env.
---

# EAS build env vars

EAS builds run on Expo's cloud and do NOT inherit this Replit workspace's env
vars. Any `EXPO_PUBLIC_*` value the app reads via `process.env` at build/bundle
time must be declared per build profile in `artifacts/mobile/eas.json` `env`
(or set as EAS environment variables). Dev (Expo Go) and the Replit web build
work without this because the Metro dev server / build script read the values
straight from the workspace `process.env`, which masks the gap until an EAS build.

**Why:** RevenueCat's three `EXPO_PUBLIC_REVENUECAT_*` public SDK keys existed only
as workspace env vars, so a TestFlight build got them as undefined; the SDK never
configured and the paywall was silently empty. (Same class of bug previously hit
the Clerk publishable key.)

**How to apply:**
- When adding any `EXPO_PUBLIC_*` the app requires in production, add it to eas.json
  env for development/preview/production (not just the dev script).
- RevenueCat public keys (prefixes `test_`/`appl_`/`goog_`) ship in the app binary
  by design -> safe to commit in eas.json. Secret keys (`sk_`) are NOT.
- Prefer requiring only the current-platform key at runtime so one missing
  off-platform key can't disable the whole integration.
