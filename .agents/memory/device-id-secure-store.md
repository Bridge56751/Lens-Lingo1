---
name: Device-id secure-store migration
description: Safety rule for persisting the anonymous device-id identity token and migrating it between stores.
---

# Device-id persistence & migration safety

The mobile `x-device-id` is the SOLE identity token for anonymous users — it
scopes every server-side row. Losing or replacing it orphans the user's data.

## Rules
- Persist it in `expo-secure-store` on native (encrypted), AsyncStorage on web
  (`Platform.OS === "web"` — SecureStore is unavailable on web and throws).
- SecureStore keys allow only `[A-Za-z0-9._-]`. The public key
  `@linguascan/device-id/v1` is invalid there, so the encrypted store uses a
  separate sanitized key while the exported constant stays the AsyncStorage key
  (migration source + the settings bulk-clear exclusion).
- When migrating an identity token between two stores, **a read FAILURE is not
  the same as a successful empty read.** On a store read failure you must NOT
  generate-and-persist a new id: an id may exist but be momentarily unreadable,
  and persisting a new one clobbers it. Only persist a freshly generated id when
  the read succeeded-but-empty; otherwise return a session-only id and let a
  later successful launch read/persist.
- Migration order: write the new store first, delete the old copy only after the
  write resolves (idempotent + retryable on partial failure).

**Why:** code review caught that a single broad try/catch around the SecureStore
read fell through to generate+persist on ANY failure, which would orphan
server-side data for existing users.

**How to apply:** reuse this distinction for any future identity/token storage
or store migration (auth tokens, key rotation), not just device.ts.
