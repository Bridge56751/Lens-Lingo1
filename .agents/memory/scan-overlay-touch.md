---
name: Scan screen overlay touch + full-bleed
description: Why floating controls over the camera lost taps, and the full-bleed frame layout that replaced the dim banding.
---

# Scan screen camera overlay

## Floating control taps get stolen by a sibling overlay
A floating control (e.g. the "Just chat" pill) placed in its OWN absolutely-positioned
container will lose its `onPress` taps if a LATER full-width sibling overlay (e.g. a
bottom control bar with default `pointerEvents`) renders on top and its bounds reach the
control — even a ~12px visual gap is not safe, because device insets / font scaling grow
the bar upward at runtime and it then covers the pill. The later sibling paints on top and
intercepts the touch.

**Fix / rule:** put related floating controls in ONE container with
`pointerEvents: "box-none"` (so empty space passes through to the camera) and lay them out
as normal children (pill stacked above the button row). Don't stack two independent
absolute overlays that can drift into each other.

**Why:** this was the actual cause of "the Just chat button does nothing" — the tap never
reached the server (no request in api-server logs), confirming a client-side touch block,
not an API failure.

## Full-bleed beats dim-banding for the viewfinder
The recurring "weird grey section at the top" came from the dim-overlay stack
(top/middle/side bands) plus the web camera placeholder (`#1A1B2E`) showing through —
the bands read as distinct grey sections, especially on web where there's no live camera.
Prefer full-bleed: camera/placeholder fills the screen uniformly, with only a centered
corner-bracket frame on top (no dim bands). On web the placeholder is then one uniform
shade with no banding.

## Native camera bleeds through on top of pushed screens
On native, expo-camera's `CameraView` preview renders ABOVE overlying React Native
views, including a new screen pushed on top via `router.push`. Symptom: tapping
"Just chat" navigates to the conversation, but the camera still shows on top so the
chat is unreachable ("opens the chat behind the camera"). The scan screen stays
mounted underneath in the stack, so its camera keeps painting over everything.

**Fix / rule:** gate the `CameraView` render on a focus flag so the camera UNMOUNTS
when the screen loses focus. Drive a `screenFocused` state from `useFocusEffect`
(true on focus, false in the cleanup) and render the camera only when focused. This
covers every navigation path (just-chat AND scan→conversation), not just one button.

## pointerEvents
Use `style={{ pointerEvents: ... }}`, not the `pointerEvents` PROP (deprecated on RN Web).
A residual "props.pointerEvents is deprecated" warning can still come from libraries
(e.g. expo-camera), not your screen.

## Camera bleeds through onto pushed screens
The native `CameraView` preview renders ABOVE all RN views, so if the scan screen
(presented as a `modal`) stays mounted under a `router.push`ed route, the live camera
shows on top of the new screen (e.g. the conversation). Gating the CameraView on a
`screenFocused` flag is not enough on its own for the post-scan handoff.

**Fix / rule:** when navigating from scan into the conversation, use `router.replace`
(not `push`) so the scan modal + its camera are torn down entirely, and set
`screenFocused=false` right before navigating. `replace` also matches the desired UX:
"close the camera and go directly to the conversation" — back from the chat returns to
home, not a stale scan result.
