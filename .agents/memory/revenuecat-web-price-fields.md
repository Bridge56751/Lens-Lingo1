---
name: RevenueCat web price fields
description: In RevenueCat web Browser Mode the SDK's normalized per-period numbers are the unreliable part; raw product.price backs priceString and is usable, with guards.
---

# RevenueCat web Browser Mode price fields

In the Expo **web preview** / Expo Go the RevenueCat JS SDK runs in "Browser Mode" with the RC **Test store** (`purchases-js`). Two distinct gotchas, do not conflate them:

1. **Normalized per-period NUMERIC fields are frequently unpopulated** — `pricePerYear`, `pricePerMonth`, `pricePerWeek` come back `undefined`/`0` in Browser Mode. Any savings/discount math that relies on them silently computes nothing, so the "Save X%" pill never renders. This was the actual cause of "I don't see the percentage saving".
2. **Raw `product.price` is the value that backs `priceString`** and was reliable enough here to compute correct discounts (verified: Monthly "Save 40%", Annual "Save 36%" matched hand math). Prefer it for percentage math. Caveat: it has historically been seen near-zero in some Test-store/SDK combos (producing a bogus "Save 100%"), so never trust it blindly.

The formatted string fields (`priceString`, `pricePerYearString`, `pricePerMonthString`, …) are always fine in web mode — use them for any displayed/strikethrough price.

**Why:** paywall savings math must survive an environment where the SDK's convenience numbers are missing AND where a raw number can occasionally be junk.

**How to apply:**
- Compute discount % from raw `product.price`, annualized with explicit multipliers — NOT from `pricePerYear`/`pricePerMonth`. Baseline both the longer plans (Annual + Monthly) against the **weekly plan annualized** (`weekly.price * 52`) — the most expensive cadence — so they show their full savings. Keep it App-Store-safe by showing the struck-through "before" price as that same real weekly-annualized baseline (`weekly.pricePerYearString` / `pricePerMonthString`); the comparison must be against an actually-offered plan. The badge math uses `price * 52` while the strike string uses RC's ~52.18 weeks/yr, so the % reads a hair *under* the strike-implied number — keep it conservative (never overstate), and fall back to no badge if the weekly package is absent.
- Guard hard: require both values `Number.isFinite`, `price > 0`, `baseline > price`, and clamp the result to `0 < percent < 95`, so missing/garbage data degrades to "show nothing" instead of a wrong number.
- Render the struck-through "before" price from the reliable `*String` fields, and treat that string as optional (it can be null) — gate the strikethrough on it independently of the percentage.
- Never hardcode prices — display `product.priceString` (also App Store compliance). Actual $/period live in RevenueCat product config / App Store Connect, not app code.
- Verify the real numbers on a device via Expo Go, not just the web preview.
