---
name: Free-tier usage limit enforcement
description: How a server-enforced per-day (or per-period) usage cap must be implemented so concurrent requests — and a tampered client — can't bypass it.
---

# Free-tier usage limit enforcement (atomic reserve-or-deny, anti-tamper boundary)

A server-side usage cap (e.g. free users get N scans per LOCAL day) must (1) be an
atomic reserve-or-deny, and (2) NEVER let a client-controlled value drive the
reset decision.

**Why (concurrency):** A "read used count → if under limit, do work → increment"
gate is racy: N concurrent requests all read `used = limit-1`, pass the check, do
the expensive work, and the serialized increments overshoot the cap. Architect
flagged this exact bypass on the first implementation.

**Why (tamper):** The "local day" reset is driven by the client's `x-tz-offset`
header. The first local-midnight fix keyed the period on a client-derived
`YYYY-MM-DD` *local day key* and reset the count whenever the stored key != the
request's key. Because the key came from the request, a client that ROTATES its
offset produces a different key every call → every request looks like a new day →
the counter resets → UNLIMITED scans. Architect FAILed this. **Rule: a value the
client controls can shape WHERE the next boundary lands, but must never by itself
expire the current period or reset the count.**

**How to apply (the model that passed):**
- Store an ABSOLUTE reset instant per customer (ISO-8601 UTC), not a day key. The
  period is "active" purely while real server time < that instant — a function of
  the server clock only, independent of the client offset.
- Reserve inside a transaction that locks the row: `SELECT … FOR UPDATE`, recompute
  the reservation in pure code, then `UPDATE` only if allowed. Serializing on the
  row makes at most LIMIT reservations succeed per period (replaces the single
  conditional UPDATE once the boundary depends on per-request input you can't put
  in one SQL statement safely).
- New period: start count at 1 and set the next boundary = caller's next local
  midnight, FLOORED to ≥ MIN_PERIOD_HOURS (23h) after the *previous* boundary.
  The floor is the anti-tamper guard for ESTABLISHED periods: honest clients have a
  stable offset so consecutive local midnights are ~24h apart and the floor never
  binds; a client rotating its offset to claim "always 1 min before midnight" is
  capped to ~1 allowance per 23h instead of unlimited.
- **Scoped exception — the FIRST period (a null/no-boundary row) is NOT floored**:
  there is no previous boundary to floor against, so it ends at the caller's next
  local midnight even if a tampered offset makes that minutes away. This yields a
  bounded ONE-TIME extra allowance on a fresh row (the *next* period IS floored, so
  it can't chain). Accepted deliberately because (a) it equals what an honest user
  who first scans just before local midnight gets anyway, and (b) it is strictly
  dominated by the device-id-reset bypass below. Flooring it instead would delay
  every honest first-day user's reset ~23h past their real midnight — worse.
  **Why:** architect first FAILed on the missing floor, then PASSed accepting this
  as a scoped tradeoff. Don't "fix" it by flooring null rows.
- 23h (not 24h) so DST spring-forward (a genuine 23h local day) doesn't wrongly
  penalize honest users.
- Pro/unlimited callers skip the reservation entirely.
- Release on later failure: best-effort `GREATEST(count-1,0)` scoped to the SAME
  stored boundary (so you never decrement a fresh period). A crash between reserve
  and persist can still burn one slot — accepted edge.
- The read-only usage endpoint must use the same active test AND the same
  `nextResetBoundary` math as the reservation: active → report stored count +
  (normalized) boundary; expired → report 0 used + `nextResetBoundary(now, offset,
  prev)` (NOT a bare next-midnight, or it disagrees with the next scan when the
  floor binds). Keep it pure/non-mutating.
- The client counter is advisory; the server value is authoritative.
- Reuse-the-column trick: kept the legacy `scan_day_key` TEXT column but now store
  the ISO instant in it (TS prop renamed `scanResetsAt`) — no migration needed.
- **Legacy migration:** the column previously held a UTC `YYYY-MM-DD` day key. A
  date-only value MUST be read as the END of that UTC day (key + 24h) — the old
  refill instant — or you grant an early one-time refill on deploy. Both reserve
  and read normalize to an ISO instant, so legacy keys convert on the next scan.
- This cap is NOT abuse-proof against a client rotating the anonymous device id —
  inherent to the no-auth device-scoped model, out of scope.
- The mocked route test proves WIRING (deny-before-AI, Pro bypass, release); the
  anti-tamper math (rotating offset can't expire an active period; new boundary
  floored to ≥23h) is covered by pure unit tests on the reserve helper.
