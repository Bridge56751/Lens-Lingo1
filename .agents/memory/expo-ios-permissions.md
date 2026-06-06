---
name: Expo iOS permission declarations
description: How to declare/audit iOS (and Android) permission usage strings for App Store compliance in this Expo app
---

# Expo permission declarations (App Store compliance)

The app uses exactly three native capabilities: **camera** (expo-camera scan),
**microphone** (expo-audio recording in conversation + flashcards), and **photo
library read** (expo-image-picker `launchImageLibraryAsync` in scan). No location,
notifications, contacts, or library-write.

## Rules / gotchas

- **Never pass `cameraPermission: false` / `microphonePermission: false` to the
  `expo-image-picker` plugin to "dedupe" strings.** Its plugin treats `false` as a
  hard *block*: on iOS it strips `NSCameraUsageDescription`/`NSMicrophoneUsageDescription`
  from Info.plist, and on Android it adds them to `blockedPermissions` — overriding
  expo-camera/expo-audio AND an explicit `ios.infoPlist`. Result: camera/mic prompts
  silently missing → runtime denial + App Review rejection. Just set `photosPermission`
  and leave the rest unset.
  **Why:** the image-picker config plugin calls `withBlockedPermissions` for any
  capability set to `false`.

- **Declare iOS usage strings explicitly in `ios.infoPlist`** (not only via plugin
  options). expo-camera/expo-audio register strings through `createPermissionsPlugin`,
  which does **not** show up in `expo config --type introspect` output — only the
  explicit `ios.infoPlist` and expo-image-picker's `photosPermission` surface there.
  Explicit infoPlist is the reliable, reviewable source of truth.

- **Verify with** `npx expo config --type introspect --json` and inspect
  `ios.infoPlist` (UsageDescription keys), `android.permissions`, and
  `android.blockedPermissions`. Expect exactly the 3 NS*UsageDescription keys, no
  location, no blocked permissions.

- **Don't ship Expo packages you don't import.** `expo-location` was a leftover
  devDependency (never imported); its config plugin auto-injected 3 location
  `NS*UsageDescription` strings (incl. "Always") → App Review rejection risk. Removing
  the package removed the strings. Audit unused expo-* deps with config plugins.

- Android modern photo picker needs no storage read permission; image-picker still
  adds READ/WRITE_EXTERNAL_STORAGE for older OS compat — that's expected, not a bug.
