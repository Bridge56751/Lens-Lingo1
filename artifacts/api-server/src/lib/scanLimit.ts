// Free-tier daily scan allowance. Free users get this many scans per *local*
// calendar day; Pro users are unlimited. The limit is enforced server-side in
// the scan route so it cannot be bypassed by a tampered client, and surfaced
// read-only via the plan-status response so the app can show a live counter.
//
// "Day" is the caller's LOCAL day, not UTC: the client sends its UTC offset
// (Date#getTimezoneOffset() minutes — positive when behind UTC, e.g. UTC-7 →
// 420) in the `x-tz-offset` header, and the allowance refills at the user's own
// midnight. A missing/invalid offset falls back to 0 (UTC).
//
// ANTI-TAMPER MODEL: `x-tz-offset` is client-controlled, so we must never let
// it drive the *reset decision* directly. Instead each period stores an ABSOLUTE
// reset instant; a period is "active" purely while real server time is before
// that instant. The offset only chooses where the NEXT boundary lands, and that
// boundary is floored to at least MIN_PERIOD_HOURS after the previous one — so a
// client that rotates its offset (claiming to always be a minute before
// midnight) still can't make an ESTABLISHED window expire early or chain short
// windows to exceed the cap.
//
// SCOPED EXCEPTION — the very first period (a brand-new row with no stored
// boundary) is NOT floored: it ends at the caller's next local midnight even if
// a tampered offset makes that minutes away. This yields a bounded, ONE-TIME
// burst of up to one extra allowance on a fresh row (the *next* period is
// floored, because the row now has a real boundary to floor against — so it
// can't chain). We accept this deliberately: (a) it is exactly what an honest
// user who first scans just before their local midnight gets anyway, and (b) it
// is strictly dominated by the already-accepted bypass of this device-scoped,
// no-auth limit — rotating the anonymous device id gives UNLIMITED scans. The
// alternative (flooring the first period to ~23h) would delay every honest
// first-day user's reset well past their real midnight, a worse tradeoff.
//
// LEGACY MIGRATION: the column previously held a UTC "YYYY-MM-DD" day key. Such
// values are read as the END of that UTC day (key + 24h) so a user who used
// their legacy allowance stays capped until the next UTC midnight (the old
// refill instant) instead of getting an early refill on deploy; they convert to
// a proper ISO instant on their next period rollover.
export const FREE_DAILY_SCAN_LIMIT = 10;

/**
 * Minimum length of a scan period, in hours. Honest clients have a stable
 * offset, so consecutive local midnights are ~24h apart (even DST spring-forward
 * leaves them exactly 23h apart) and this floor never binds for them. It only
 * bites a client that mutates its offset to try to shrink the window, capping
 * abuse to ~one allowance per 23h instead of unlimited.
 */
export const MIN_PERIOD_HOURS = 23;

/** Largest real-world UTC offset magnitude, in minutes (UTC+14 / UTC-12 → ±14h). */
const MAX_TZ_OFFSET_MINUTES = 14 * 60;

/**
 * Parse the `x-tz-offset` header into `Date#getTimezoneOffset()` minutes.
 * Returns 0 (UTC) when missing or not a finite number, and clamps to the real
 * inhabited range (±14h) so a bogus value can't shove the day boundary wildly.
 */
export function parseTimezoneOffset(
  raw: string | string[] | undefined | null,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return 0;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_TZ_OFFSET_MINUTES, Math.min(MAX_TZ_OFFSET_MINUTES, n));
}

/** Shift a UTC instant into the caller's local wall-clock (represented as UTC). */
function toLocal(now: Date, offsetMinutes: number): Date {
  return new Date(now.getTime() - offsetMinutes * 60000);
}

/**
 * ISO timestamp of the next LOCAL midnight after `now` — when the daily
 * allowance refills — expressed as an absolute UTC instant so the client can
 * render a correct countdown. (`setUTCHours(24, …)` on the local-shifted
 * instant rolls over to 00:00 of the following local day; shifting back by the
 * offset converts that wall-clock midnight to the real UTC instant.)
 */
export function nextLocalMidnight(now: Date = new Date(), offsetMinutes = 0): string {
  const local = toLocal(now, offsetMinutes);
  local.setUTCHours(24, 0, 0, 0);
  return new Date(local.getTime() + offsetMinutes * 60000).toISOString();
}

/** Milliseconds in a day — used to read a legacy UTC day key as its END instant. */
const DAY_MS = 24 * 3_600_000;
/** Matches a legacy UTC day key ("YYYY-MM-DD") written by the previous design. */
const LEGACY_DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the value stored in `scan_day_key` into an absolute reset instant
 * (epoch ms), or null when there is no usable boundary. Three cases:
 *  - null/empty → null (brand-new row, no boundary yet).
 *  - a LEGACY "YYYY-MM-DD" key (previous UTC-day-key design) → the END of that
 *    UTC day (key + 24h): the instant the old code would have refilled. Keeps a
 *    user who spent their legacy allowance capped until the next UTC midnight
 *    instead of getting an early refill on deploy.
 *  - a full ISO-8601 instant (current format) → that instant.
 * Anything unparseable → null (treated as no boundary).
 */
function parseStoredResetInstant(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (LEGACY_DAY_KEY.test(value)) {
    const dayMs = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(dayMs) ? dayMs + DAY_MS : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * If the stored period is still active at `now`, its reset instant (epoch ms);
 * otherwise null. Deliberately OFFSET-INDEPENDENT — activity is judged purely on
 * real server time vs. the stored absolute boundary, which is what keeps the cap
 * authoritative under a rotating `x-tz-offset`.
 */
function activeResetMs(stored: StoredScanPeriod, now: Date): number | null {
  const resetMs = parseStoredResetInstant(stored.resetsAt);
  return resetMs != null && now.getTime() < resetMs ? resetMs : null;
}

/**
 * The absolute instant a NEW scan period should end: the caller's next local
 * midnight, but never sooner than MIN_PERIOD_HOURS after the previous boundary.
 * The floor is the anti-tamper guard (see file header). When there is no usable
 * previous boundary (brand-new or unparseable) there is nothing to floor against
 * so the next local midnight is used as-is (the accepted one-time first-period
 * exception documented in the file header).
 */
export function nextResetBoundary(
  now: Date,
  offsetMinutes: number,
  prevResetsAt: string | null,
): string {
  const candidate = nextLocalMidnight(now, offsetMinutes);
  const prevMs = parseStoredResetInstant(prevResetsAt);
  if (prevMs == null) return candidate;
  const floorMs = prevMs + MIN_PERIOD_HOURS * 3_600_000;
  return Date.parse(candidate) >= floorMs
    ? candidate
    : new Date(floorMs).toISOString();
}

/** The stored per-customer scan period (DB columns scan_day_count + scan_day_key). */
export type StoredScanPeriod = {
  count: number | null | undefined;
  /** Absolute reset instant, ISO-8601 UTC, or null before the first scan. */
  resetsAt: string | null | undefined;
};

export type ScanReservation = {
  /** Scans used in the active period AFTER applying this reservation. */
  count: number;
  /** Absolute instant the active period ends / allowance refills, ISO-8601 UTC. */
  resetsAt: string;
  /** Whether the scan being reserved is permitted (false → already at the cap). */
  allowed: boolean;
};

/**
 * Decide the next reservation state from the stored period, the real server
 * `now`, and the caller's UTC offset. Pure + deterministic so the anti-tamper
 * behaviour is unit-testable. Whether the current period is active depends ONLY
 * on real time vs. the stored boundary — never on the client-supplied offset —
 * which is what keeps the daily cap authoritative under a rotating `x-tz-offset`.
 * The returned `resetsAt` is always normalized to an ISO instant (so a legacy
 * "YYYY-MM-DD" key is rewritten to a proper instant on the next scan).
 */
export function reserveScan(
  stored: StoredScanPeriod,
  now: Date,
  offsetMinutes: number,
): ScanReservation {
  const resetMs = activeResetMs(stored, now);
  if (resetMs != null) {
    const resetsAt = new Date(resetMs).toISOString();
    const count = stored.count ?? 0;
    if (count >= FREE_DAILY_SCAN_LIMIT) {
      return { count, resetsAt, allowed: false };
    }
    return { count: count + 1, resetsAt, allowed: true };
  }
  // Expired or brand-new: start a fresh period at 1.
  return {
    count: 1,
    resetsAt: nextResetBoundary(now, offsetMinutes, stored.resetsAt ?? null),
    allowed: true,
  };
}

export type ScanUsage = {
  scanLimit: number;
  scansUsedToday: number;
  /** Remaining scans today; null means unlimited (Pro). */
  scansRemaining: number | null;
  /** When the daily allowance refills (next local midnight), ISO-8601. */
  scanResetsAt: string;
};

/** Build the read-only usage payload shared by the scan + plan responses. */
export function buildScanUsage(
  usedToday: number,
  isPro: boolean,
  resetsAt: string,
): ScanUsage {
  return {
    scanLimit: FREE_DAILY_SCAN_LIMIT,
    scansUsedToday: usedToday,
    scansRemaining: isPro
      ? null
      : Math.max(0, FREE_DAILY_SCAN_LIMIT - usedToday),
    scanResetsAt: resetsAt,
  };
}

/**
 * Read-only usage view for the plan-status endpoint — never mutates. If the
 * stored period is still active it reports its count + (normalized) boundary;
 * otherwise the allowance has refilled, so it reports 0 used and the boundary
 * the NEXT scan will actually persist — computed with the same `nextResetBoundary`
 * the reservation uses (so `/me/plan` and the scan route never disagree on the
 * reset time, including when the anti-tamper floor binds).
 */
export function readScanUsage(
  stored: StoredScanPeriod,
  isPro: boolean,
  now: Date = new Date(),
  offsetMinutes = 0,
): ScanUsage {
  const resetMs = activeResetMs(stored, now);
  if (resetMs != null) {
    return buildScanUsage(stored.count ?? 0, isPro, new Date(resetMs).toISOString());
  }
  return buildScanUsage(
    0,
    isPro,
    nextResetBoundary(now, offsetMinutes, stored.resetsAt ?? null),
  );
}
