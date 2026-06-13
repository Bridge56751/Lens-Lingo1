---
name: Free-tier usage limit enforcement
description: How a server-enforced per-day (or per-period) usage cap must be implemented so concurrent requests can't bypass it.
---

# Free-tier usage limit enforcement (atomic reserve-or-deny)

A server-side usage cap (e.g. free users get N scans per UTC day) must be a
SINGLE atomic conditional write, NOT a read-then-write gate.

**Why:** A "read used count → if under limit, do work → increment" gate is racy:
N concurrent requests all read `used = limit-1`, all pass the check, all do the
expensive work, and the serialized increments overshoot the cap. Architect
flagged this exact bypass FAIL on the first scan-limit implementation.

**How to apply:**
- Reserve the slot up front, before any expensive work (AI calls, etc.), with a
  conditional UPDATE that only succeeds while under the cap:
  `UPDATE customers SET count = CASE WHEN day_key = today THEN count+1 ELSE 1 END,
   day_key = today WHERE id = :id AND (day_key IS DISTINCT FROM today OR count < LIMIT)
   RETURNING count`. No row returned ⇒ at the cap ⇒ deny (403) before doing work.
- Postgres row locking + READ COMMITTED rechecks the WHERE against the latest
  committed row per update, so at most LIMIT reservations succeed per period.
- Period rollover is lazy (the CASE resets to 1 when the stored day key is
  stale) — no cron needed. Use a UTC `YYYY-MM-DD` day key.
- Pro/unlimited callers skip the reservation entirely.
- If later persistence fails, RELEASE the reserved slot (best-effort
  `GREATEST(count-1, 0)` scoped to the same day key) so a failed action doesn't
  burn quota; a process crash between reserve and persist can still burn one
  slot — accepted edge.
- The client counter is advisory only; the server value is authoritative.
- This cap is NOT abuse-proof against a tampered client rotating the anonymous
  device id — that's inherent to the no-auth device-scoped model, out of scope.
- The mocked route test suite can only prove the WIRING (deny-before-AI, Pro
  bypass, release-on-failure); true concurrency needs a real-Postgres test.
