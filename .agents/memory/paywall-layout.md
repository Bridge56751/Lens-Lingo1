---
name: Paywall layout
description: How LinguaScan's paywall is laid out for contextual (feature-tapped) vs generic entry points.
---

The paywall (`artifacts/mobile/app/paywall.tsx`) has two layouts, keyed on whether a `feature` param is present (`featureTheme`):

- **Contextual** (tapped a specific locked feature: chat/vocab/langs): lead with the large themed "spotlight" card for that feature (icon badge + title + checkmark bullets; orange=chat, green=vocab, blue=langs), THEN "Choose Your Plan" + plan cards + CTA, THEN the "Everything else in Pro" grid of the remaining features. The spotlight is the value showcase, so plans/price sit right under it and the first price is visible without scrolling.
- **Generic** (no feature param — opened from Settings upgrade, post-scan "continue chat" via `scan.tsx` requirePro(), and end of onboarding): there is NO spotlight, so the "Premium Features" grid (wide "Unlimited Scans" hero + 2x2 of the rest) is rendered ABOVE "Choose Your Plan" + prices, so the user sees what Pro unlocks before the price. Nothing feature-grid sits below the CTA here.

**Why:** The user likes the themed spotlight style for contextual taps AND wants the first plan price visible without scrolling on contextual paywalls; separately, for the plain generic paywall (which has no spotlight) the user explicitly asked to move the feature showcase ABOVE the prices. A prior "make it compact" refactor had hidden the spotlight (gated behind `?intro=1`) and used a flat bullet strip — that was reverted.

**How to apply:** Keep the spotlight gated only on `featureTheme` (never an intro/first-run flag). Don't move the contextual "Everything else in Pro" grid above the plans. Don't move the generic "Premium Features" grid below the plans. Prices always come from RevenueCat `product.priceString` — never hardcode.
