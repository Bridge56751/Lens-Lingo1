---
name: Firebase (RNFirebase) on Expo
description: iOS-only Analytics+Crashlytics via @react-native-firebase; platform-split keeps web/Expo Go alive; pnpm temp-dir Metro crash.
---

# Firebase Analytics + Crashlytics on Expo (iOS only)

## Native-only module pattern
RNFirebase native modules don't exist in Expo Go or web. To keep the dev env alive:
- `lib/analytics.ts` = no-op (used on web + as the TS source of truth).
- `lib/analytics.native.ts` = real impl; Metro auto-resolves it on iOS/Android.
- The native impl lazy-`require`s `@react-native-firebase/*` ONLY when `Constants.executionEnvironment !== "storeClient"` (i.e. not Expo Go), and wraps every call in try/catch.

**Why:** importing RNFirebase at module top-level throws in Expo Go and pulls the heavy firebase JS SDK into the web bundle. Platform split + lazy require + Expo-Go guard makes analytics a safe no-op everywhere except real builds.
**How to apply:** any native-only RN module (IAP, push, etc.) that must coexist with the Expo Go + web dev workflow should use the same `.ts` no-op / `.native.ts` lazy-require pattern.

## Metro crash from firebase JS SDK temp dirs
`@react-native-firebase/app@24` depends on the full `firebase` JS SDK → all `@firebase/*` packages. pnpm can leave dangling `*_tmp_*` dirs (e.g. `@firebase/storage_tmp_NNNN`) that make Metro's FallbackWatcher crash on startup: `ENOENT ... watch .../@firebase/storage_tmp_NNNN/...`.

**Fix:** `rm -rf node_modules/.pnpm/@firebase+*/node_modules/@firebase/*_tmp_*` then restart the mobile workflow.
**Gotcha:** these dirs sit ~4 levels under `node_modules/.pnpm`, so `find -maxdepth 3` misses them; a full-tree `find node_modules` is too slow (times out) — target the `.pnpm/@firebase+*` glob directly.

## iOS build config
- `app.json`: `ios.googleServicesFile: "./GoogleService-Info.plist"`, RNFirebase config plugins (`app`/`analytics`/`crashlytics`, each ships `app.plugin.js` → `./plugin/build`), and `expo-build-properties` with `ios.useFrameworks: "static"` (required by RNFirebase iOS).
- Deps + plugin files live under `artifacts/mobile/node_modules`, NOT root (pnpm monorepo) — check there, not `node_modules/@react-native-firebase`.

## Reporting caveats
- Analytics won't appear until Google Analytics is enabled for the Firebase project and the plist re-downloaded (a plist with `IS_ANALYTICS_ENABLED=false` means GA isn't linked). Runtime `setAnalyticsCollectionEnabled(true)` only flips the collection default. Crashlytics works regardless.
- Verify ONLY via `eas build` (dev/prod) — never Expo Go / web preview.
- The Firebase iOS API key in the plist is a client identifier, safe to commit.
