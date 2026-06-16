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

## EAS iOS build: the static-frameworks tax — the REAL fix is `forceStaticLinking` (SDK 54 / RN 0.81 / RNFB 24)
`useFrameworks: "static"` is required for RNFirebase but the EAS build then fails fastlane/Xcode with non-modular-header errors. The errors come in layers and it's easy to chase the wrong fix:

1. **First symptom — non-modular header:** `include of non-modular header inside framework module 'RNFBApp...' [-Werror,-Wnon-modular-include-in-framework-module]`.
2. **Second symptom (surfaces only after you suppress #1) — module import:** `declaration of 'RCTBridgeModule' must be imported from module 'RNFBApp.RNFBAppModule' before it is required`, then a cascade of `implicit int` / `expected ')'` / "parameter 'crash'/'deleteUnsentReports' was not declared" parse errors.

**Both symptoms have ONE root cause:** the RNFB pods are compiled as *framework modules* (because of `use_frameworks!`), and a framework module that includes React's headers is exactly what breaks.

**The real fix — build the RNFB pods as plain static LIBRARIES (no framework module):** add to `app.json` `expo-build-properties` → `ios.forceStaticLinking: ["RNFBApp", "RNFBAnalytics", "RNFBCrashlytics"]` (list the RNFB pods you actually use; pod names = the `.podspec` basenames under `node_modules/@react-native-firebase/*`). `forceStaticLinking` is a verified option in `expo-build-properties` (~1.0.10) — it overrides linkage to static_library so there's no module wrapper and nothing to mis-import. This resolves BOTH symptoms at the root.

**Dead end — do NOT use `$RNFirebaseAsStaticFramework = true`:** it only sets `s.static_framework = true` in the RNFB podspec, which keeps the pod a *static FRAMEWORK* = still a framework module = re-triggers the exact "must be imported from module" error. Verified by reading `RNFBApp.podspec`. It is the opposite of what's needed; it does not fix symptom #2.

**Plus a harmless safety net:** the local plugin `artifacts/mobile/plugins/withNonModularHeaders.js` (`withDangerousMod(["ios"])`, registered last) still injects `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = 'YES'` into the Podfile `post_install` for every target, in case some OTHER framework pod includes a non-modular React header. Idempotent; throws if the marker is missing.

**Verified end-to-end (don't re-doubt it):** `forceStaticLinking` is genuinely consumed at build time — `expo-modules-autolinking` (3.0.25, SDK 54) `autolinking_manager.rb` reads `ios.forceStaticLinking` from `Podfile.properties.json` and `expo_add_modules_to_patch`-concats those pods onto `framework_modules_to_patch`, whose targets get "Disabling USE_FRAMEWORKS" in `cocoapods/installer.rb` → built as plain static libraries, not framework modules. Pod target name must equal the podspec basename. NOTE on searching this: the real package store is the WORKSPACE-ROOT `node_modules/.pnpm` (NOT per-artifact `artifacts/mobile/node_modules/.pnpm`, which doesn't exist); `grep -r` won't follow the pnpm symlinks and `rg` ignores `node_modules` by default — search the root `.pnpm` with `rg --no-ignore`.

**Why a config plugin at all:** there's no `expo-build-properties` knob for the CLANG Xcode setting, so that one must patch the Podfile directly; `forceStaticLinking` IS a build-properties knob so it stays in app.json.
**How to apply / debug-order:** trust `forceStaticLinking` as the primary fix; don't waste an EAS cycle on `$RNFirebaseAsStaticFramework`. These static-framework builds reveal errors in layers — if a *different* error appears after this (e.g. prebuilt React-Core / `buildReactNativeFromSource`), handle that as the next layer rather than assuming this fix failed.

## EAS slug must match the EAS project, not a guess
EAS build aborts pre-upload with `Slug for project identified by "extra.eas.projectId" (<X>) does not match the "slug" field (<Y>)`. The slug is tied to the EAS project that `extra.eas.projectId` resolves to. For this app the EAS/Firebase project is `lens-lingo` (hyphen), so `app.json` `slug` must be `lens-lingo` (NOT `lenslingo`). The URL `scheme` (`lenslingo`) and `ios.bundleIdentifier` (`com.lenslingo.mobile`) are independent — don't touch them to fix a slug mismatch.

## Reporting caveats
- The real prerequisite for Analytics data is enabling **Google Analytics on the Firebase project** (creates the GA property + data stream) — NOT any plist flag.
- **`IS_ANALYTICS_ENABLED` (and the other `IS_*_ENABLED` keys) in the iOS `GoogleService-Info.plist` are LEGACY and ignored by the modern Firebase iOS SDK.** Verified empirically: after enabling GA on the project, re-downloading the plist left `IS_ANALYTICS_ENABLED=false` and the file byte-identical. Do NOT chase flipping that flag or keep re-downloading the plist — it never changes and doesn't gate anything on iOS.
  **Why:** these flags came from the old Google-Services config format; current SDK enables Analytics by SDK default + Info.plist `FIREBASE_ANALYTICS_COLLECTION_ENABLED` / runtime `setAnalyticsCollectionEnabled(true)`.
  **How to apply:** if iOS analytics isn't reporting, check (1) GA enabled on the project, (2) Analytics SDK linked, (3) runtime collection enabled, (4) you're on a real `eas build` — never the plist's `IS_*_ENABLED` keys.
- Verify ONLY via `eas build` (dev/prod) — never Expo Go / web preview.
- The Firebase iOS API key in the plist is a client identifier, safe to commit.
