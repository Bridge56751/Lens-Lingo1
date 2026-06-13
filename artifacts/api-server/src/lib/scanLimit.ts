// Free-tier daily scan allowance. Free users get this many scans per UTC day;
// Pro users are unlimited. The limit is enforced server-side in the scan route
// so it cannot be bypassed by a tampered client, and surfaced read-only via the
// plan-status response so the app can show a live counter.
export const FREE_DAILY_SCAN_LIMIT = 10;

/** UTC calendar-day key ("YYYY-MM-DD") for the given instant (defaults to now). */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * ISO timestamp of the next UTC midnight after `now` — when the daily allowance
 * refills. (`setUTCHours(24, …)` rolls over to 00:00 of the following day.)
 */
export function nextUtcMidnight(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/**
 * Scans already used *today* given the stored per-day counter. A stored day key
 * that isn't today's means the counter is stale (the allowance has since
 * refilled), so it counts as 0.
 */
export function scansUsedToday(
  storedDayKey: string | null | undefined,
  storedCount: number | null | undefined,
  now: Date = new Date(),
): number {
  return storedDayKey === utcDayKey(now) ? (storedCount ?? 0) : 0;
}

export type ScanUsage = {
  scanLimit: number;
  scansUsedToday: number;
  /** Remaining scans today; null means unlimited (Pro). */
  scansRemaining: number | null;
  /** When the daily allowance refills (next UTC midnight), ISO-8601. */
  scanResetsAt: string;
};

/** Build the read-only usage payload shared by the scan + plan responses. */
export function buildScanUsage(
  usedToday: number,
  isPro: boolean,
  now: Date = new Date(),
): ScanUsage {
  return {
    scanLimit: FREE_DAILY_SCAN_LIMIT,
    scansUsedToday: usedToday,
    scansRemaining: isPro
      ? null
      : Math.max(0, FREE_DAILY_SCAN_LIMIT - usedToday),
    scanResetsAt: nextUtcMidnight(now),
  };
}
