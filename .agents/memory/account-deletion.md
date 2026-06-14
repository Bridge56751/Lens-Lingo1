---
name: Account deletion ordering
description: Correct order of operations for in-app account + local-data deletion (Apple 5.1.1(v)) in this token-aware Clerk + device-id app.
---

# In-app account deletion ordering

The server resolves the customer row two ways (token-aware): a signed-in Clerk
session resolves the **account** row by `authUserId`; otherwise it falls back to
the anonymous **device** row by `x-device-id`. The delete endpoint removes
whatever row `resolveCustomer` resolved (cascades conversations/messages/vocab),
and is intentionally NOT auth-gated so anonymous users can wipe their data too.

**Rule — for a signed-in user, delete the server account row BEFORE deleting the
Clerk user.**
**Why:** `user.delete()` revokes the session token. After that the server can no
longer resolve the account row and would fall back to the (different) device
row — so the account row would be orphaned/never deleted. Do the authenticated
`DELETE /account` first while the token is still valid, then `user.delete()`.

**Rule — treat `user.delete()` failure as fatal; do not show success.**
**Why:** Apple 5.1.1(v) expects the account to actually be gone. Swallowing the
error and redirecting makes the user think it worked while the Clerk account
still exists. Let it throw to the catch and surface a retry.

**Rule — after `resetDeviceId()` you MUST also call `setDeviceId()` on the API
client.** The device id lives in two places: `lib/device.ts` (cache + storage)
and a module-level header in `@workspace/api-client-react`. Resetting only the
former leaves generated hooks sending the old id for the rest of the session.

## Deleting must NOT drop Pro (anonymous-only mode)

**Rule — while sign-in is hidden, account deletion KEEPS the device id.** Wipe
all `@linguascan/*` AsyncStorage keys EXCEPT `DEVICE_ID_STORAGE_KEY`, and do NOT
reset the API-client device id.
**Why:** every user is anonymous, so the server pulls Pro from RevenueCat keyed
by the device id. Keep it and the next request re-creates an empty `free`
customers row from `x-device-id`, then `/me/plan` reconciles it back to Pro from
the still-active subscription. Reset it and the paying user is stranded as Free.
Personal data is still fully deleted (server row + cascades; all other local
keys). **How to apply:** revisit before re-enabling sign-in — a signed-in delete
keyed to the Clerk id is unreliable without `restorePurchases()`.

**Rule — invalidate the per-appUserId plan freshness cache on delete.** The
delete route `.returning({id,deviceId,authUserId})` and calls
`invalidatePlanFreshness()` for BOTH the device id and auth user id.
**Why:** `lib/plan.ts` caches a 45s "fresh" window per appUserId; a stale entry
left from before the delete makes `/me/plan` + `requirePro` skip RevenueCat and
serve the re-created default `free` row as Free/403 for up to the TTL. Any
module-level plan/entitlement cache keyed by an id that survives deletion must be
invalidated in lockstep. (Cache is process-local — revisit for multi-instance.)
