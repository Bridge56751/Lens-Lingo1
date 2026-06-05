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

## pointerEvents
Use `style={{ pointerEvents: ... }}`, not the `pointerEvents` PROP (deprecated on RN Web).
A residual "props.pointerEvents is deprecated" warning can still come from libraries
(e.g. expo-camera), not your screen.
