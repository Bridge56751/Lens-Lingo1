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

## EAS iOS build fails with non-modular-header error (the static-frameworks tax)
`useFrameworks: "static"` is necessary for RNFirebase but NOT sufficient: the EAS cloud build still fails fastlane/Xcode with `include of non-modular header inside framework module 'RNFBApp...' [-Werror,-Wnon-modular-include-in-framework-module]` (RNFB pods include React-Core headers that Xcode treats as non-modular, and the warning is promoted to an error).
**Fix:** a local Expo config plugin (`artifacts/mobile/plugins/withNonModularHeaders.js`, registered last in `app.json` plugins) that `withDangerousMod(["ios"])`-patches the generated Podfile's `post_install do |installer|` block to set `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = 'YES'` on every Pods target. Idempotent (skips if the setting already present); fails loudly if the marker is missing.
**Why:** `expo-build-properties` has no knob for this Xcode build setting, so the Podfile must be patched directly; the patch only runs during cloud prebuild (no checked-in `ios/`).
**How to apply:** if a future SDK/RNFirebase bump regresses with the same error, confirm the setting actually lands on the RNFBApp target in the Xcode logs — if not, move the injection to AFTER `react_native_post_install` in the post_install block.

## EAS slug must match the EAS project, not a guess
EAS build aborts pre-upload with `Slug for project identified by "extra.eas.projectId" (<X>) does not match the "slug" field (<Y>)`. The slug is tied to the EAS project that `extra.eas.projectId` resolves to. For this app the EAS/Firebase project is `lens-lingo` (hyphen), so `app.json` `slug` must be `lens-lingo` (NOT `lenslingo`). The URL `scheme` (`lenslingo`) and `ios.bundleIdentifier` (`com.lenslingo.mobile`) are independent — don't touch them to fix a slug mismatch.

## Reporting caveats
- The real prerequisite for Analytics data is enabling **Google Analytics on the Firebase project** (creates the GA property + data stream) — NOT any plist flag.
- **`IS_ANALYTICS_ENABLED` (and the other `IS_*_ENABLED` keys) in the iOS `GoogleService-Info.plist` are LEGACY and ignored by the modern Firebase iOS SDK.** Verified empirically: after enabling GA on the project, re-downloading the plist left `IS_ANALYTICS_ENABLED=false` and the file byte-identical. Do NOT chase flipping that flag or keep re-downloading the plist — it never changes and doesn't gate anything on iOS.
  **Why:** these flags came from the old Google-Services config format; current SDK enables Analytics by SDK default + Info.plist `FIREBASE_ANALYTICS_COLLECTION_ENABLED` / runtime `setAnalyticsCollectionEnabled(true)`.
  **How to apply:** if iOS analytics isn't reporting, check (1) GA enabled on the project, (2) Analytics SDK linked, (3) runtime collection enabled, (4) you're on a real `eas build` — never the plist's `IS_*_ENABLED` keys.
- Verify ONLY via `eas build` (dev/prod) — never Expo Go / web preview.
- The Firebase iOS API key in the plist is a client identifier, safe to commit.
