---
name: Paywall contextual layout
description: How LinguaScan's paywall must be laid out — themed per-feature spotlight + first plan price above the fold.
---

Rule: When the paywall is opened for a specific locked feature (param `feature` = chat/vocab/langs), it MUST lead with the large themed "spotlight" card for that feature (icon badge + title + checkmark bullets; colored orange=chat, green=vocab, blue=langs), then the plan/price cards, and only then the "Everything else in Pro" grid of the remaining features. The generic (no-feature) paywall shows no spotlight; its feature grid leads with a wide "Unlimited Scans" card.

**Why:** The user explicitly likes this spotlight + "Everything else in Pro" style and wants at least the first plan price visible WITHOUT scrolling. A prior "make it compact" refactor had hidden the spotlight (gated behind `?intro=1`), replaced contextual paywalls with a flat bullet strip, and placed the tall feature section ABOVE the plans — which pushed prices below the fold. All of that was reverted.

**How to apply:** Keep render order: hero → spotlight (only when a `featureTheme` exists) → "Choose Your Plan" + plans → CTA → "Everything else in Pro" grid → footer. Do NOT move the feature grid above the plans, and do NOT gate the spotlight behind an intro/first-run flag. Prices always come from RevenueCat `product.priceString` — never hardcode.
