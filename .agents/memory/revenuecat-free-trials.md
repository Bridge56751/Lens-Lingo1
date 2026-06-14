---
name: RevenueCat free trials / intro offers
description: How free trials work with RevenueCat in the Expo app — store-configured, surfaced via introPrice, iOS eligibility gating.
---

# RevenueCat free trials & introductory offers

A "free trial" (e.g. "every plan free for 3 days") is NOT something the app can
grant. It is an **introductory offer** configured per-product in **App Store
Connect** and **Google Play**, and RevenueCat surfaces it on the product. The app
can only *display* it.

**How to detect:** `pkg.product.introPrice` (`PurchasesIntroPrice`) — a true free
trial is `introPrice.price <= 0`. Fields: `price`, `priceString`, `cycles`,
`period` (ISO 8601), `periodUnit` ("DAY"/"WEEK"/"MONTH"/"YEAR"),
`periodNumberOfUnits`. A discounted-but-not-free intro ("pay as you go"/"pay up
front") has `price > 0` — exclude it so you don't mislabel it as free.

**iOS eligibility gating (important):** `introPrice` is present on the product
regardless of whether the *current* user is still eligible. A repeat user who
already consumed the trial would otherwise see "Start Free Trial" and be charged
immediately — misleading and an App Review risk.
- Gate with `Purchases.checkTrialOrIntroductoryPriceEligibility(productIds)` →
  map of `productId -> IntroEligibility{status}`. Hide trial copy when
  `status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE`.
- **iOS only.** Android always returns `UNKNOWN`; web (Browser Mode) has no
  native check — so only run the check on iOS and let the store's purchase sheet
  be the source of truth elsewhere.
- **The eligibility signal must be THREE-STATE, fail-CLOSED on iOS.** Model
  `ineligibleTrialProductIds` as: `string[]` = check resolved (these ids are NOT
  redeemable), `undefined` = iOS not-yet-known (loading / errored / no offering),
  `null` = non-iOS (no native gate — show store-reported offers). The shared
  `freeTrial()` helper returns null on `undefined`, so EVERY trial surface
  (header mention, per-plan chip, CTA, "then $X" note) suppresses together until
  eligibility lands. **Why:** conflating `undefined` (loading) with `null`/empty
  (resolved-eligible) flashes "free trial" to an ineligible iOS user during the
  brief eligibility-load window — the exact App Review risk the gate exists to
  prevent. (Earlier code fail-OPEN'd here; that was the bug.)
- `INTRO_ELIGIBILITY_STATUS` **does export by name** from `react-native-purchases`
  — import and compare the named member; don't use the magic numeric value.

**Why:** showing a trial the store won't honor causes unexpected-charge
perception and App Review rejection.

**How to apply:** any paywall trial UI (badge/CTA/"then $X" note) must derive from
`introPrice` (never hardcode the trial length or price) AND be suppressed for iOS
product ids returned as INELIGIBLE.

**Testing:** the web test store typically has no intro offer, so the trial UI is
hidden in the web preview — that's expected, not a bug. Real eligibility behavior
can only be validated in a TestFlight/sandbox iOS build.
