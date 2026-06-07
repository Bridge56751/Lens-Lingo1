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
