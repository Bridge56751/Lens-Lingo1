---
name: Server-side Pro plan sync
description: How the server keeps customers.plan in sync with RevenueCat (REST pull, not webhooks) and why.
---

# Server-side Pro plan sync

`GET /api/me/plan` is the server's authoritative view of a customer's subscription. It keeps `customers.plan` / `customers.pro_since` in sync by **pulling from RevenueCat's REST API on each read** (`getCustomer` from `@replit/revenuecat-sdk`, via the Replit RevenueCat connector token in `artifacts/api-server/src/lib/revenueCatClient.ts`). It does NOT use a webhook receiver.

**Why REST-pull instead of a webhook:** the user explicitly preferred connecting "with just api and not webhooks." The Replit RevenueCat connector already provides an OAuth token + `REVENUECAT_PROJECT_ID`, so REST pull needs zero extra config — no dashboard webhook setup and no shared secret. The tradeoff: server state only refreshes when something reads `/me/plan` (not real-time/push), and each read costs a RevenueCat round-trip (~1–2s) subject to rate limits. That was acceptable for this app because the mobile client gates Pro via the RevenueCat SDK directly; the server copy is for reliability/analytics.

**How to apply / gotchas:**
- The RevenueCat customer id MUST equal our `auth_user_id` (signed in) or `device_id` (anonymous). The mobile app enforces this by calling `Purchases.logIn(clerkUserId ?? deviceId)` in `lib/revenuecat.tsx`. If that logIn is removed, `getCustomer` can't resolve the row and everyone looks free.
- A `getCustomer` 404 = RevenueCat has never seen this id (never purchased) → treat as free, not an error.
- Pro entitlement gate is the `pro_access` lookup key (matches mobile `REVENUECAT_ENTITLEMENT_IDENTIFIER` and the seeded entitlement). Check `active_entitlements.items` for it with `expires_at == null || expires_at > now`.
- Grant preserves the original `pro_since` via `COALESCE(proSince, now)`; revoke sets `plan='free', proSince=null` (schema contract: proSince null while free).
- Refresh is best-effort: on any RevenueCat error, log a warning and serve the last-known stored plan rather than 5xx.
- If you ever DO want real-time server state (e.g. acting on expirations while the app is closed), add a webhook receiver in addition — but then you also need a `REVENUECAT_WEBHOOK_AUTH_HEADER` secret + dashboard config.
