---
name: RevenueCat web price fields
description: RevenueCat web Browser Mode returns unreliable numeric product price fields; only *String fields are trustworthy there.
---

# RevenueCat web Browser Mode price fields

In the Expo **web preview** the RevenueCat JS SDK runs in "Browser Mode" with the RC **Test store**. In that mode the numeric product fields (`product.price`, `pricePerYear`, `pricePerMonth`, `pricePerWeek`) are unreliable / inconsistent with the formatted strings — e.g. an annual product reported a near-zero `price` while `pricePerYearString` was a normal value, producing a bogus computed "Save 100%".

The formatted string fields (`priceString`, `pricePerYearString`, etc.) are fine in web mode.

**Why:** any paywall math that divides/compares the numeric fields (discount %, "save X%", strikethrough) can render nonsense in the web preview even though it is correct on a real device.

**How to apply:**
- Never hardcode prices — always display `product.priceString` (also App Store compliance).
- When computing a discount %, clamp to a sane range (we hide the savings pill + strikethrough unless `0 < percent < 90`) so incomplete data degrades to "show nothing" instead of a wrong number.
- Verify real price numbers (and any savings %) on a device via Expo Go, not the web preview.
- Actual displayed prices ($/period) come from the RevenueCat product config / App Store Connect, NOT the app code — tell the user to set them there.
