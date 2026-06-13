import { describe, expect, it } from "vitest";
import {
  FREE_DAILY_SCAN_LIMIT,
  buildScanUsage,
  nextUtcMidnight,
  scansUsedToday,
  utcDayKey,
} from "./scanLimit";

// Pure helpers behind the free-tier daily scan limit. The day key + reset logic
// is timezone-sensitive, so it's pinned to UTC and worth locking down here.

describe("utcDayKey", () => {
  it("formats the UTC calendar day as YYYY-MM-DD", () => {
    expect(utcDayKey(new Date("2026-06-13T09:30:00.000Z"))).toBe("2026-06-13");
  });

  it("uses the UTC day even just before midnight (no local-tz drift)", () => {
    expect(utcDayKey(new Date("2026-06-13T23:59:59.999Z"))).toBe("2026-06-13");
    expect(utcDayKey(new Date("2026-06-14T00:00:00.000Z"))).toBe("2026-06-14");
  });
});

describe("nextUtcMidnight", () => {
  it("returns 00:00:00 UTC of the following day", () => {
    expect(nextUtcMidnight(new Date("2026-06-13T09:30:00.000Z"))).toBe(
      "2026-06-14T00:00:00.000Z",
    );
  });
});

describe("scansUsedToday", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");

  it("counts the stored count when the stored day key is today", () => {
    expect(scansUsedToday("2026-06-13", 4, now)).toBe(4);
  });

  it("treats a stale (past) day key as 0 — the allowance has refilled", () => {
    expect(scansUsedToday("2026-06-12", 10, now)).toBe(0);
  });

  it("treats a null/undefined day key as 0", () => {
    expect(scansUsedToday(null, 7, now)).toBe(0);
    expect(scansUsedToday(undefined, undefined, now)).toBe(0);
  });
});

describe("buildScanUsage", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");

  it("reports remaining = limit - used for free users", () => {
    expect(buildScanUsage(3, false, now)).toEqual({
      scanLimit: FREE_DAILY_SCAN_LIMIT,
      scansUsedToday: 3,
      scansRemaining: FREE_DAILY_SCAN_LIMIT - 3,
      scanResetsAt: "2026-06-14T00:00:00.000Z",
    });
  });

  it("clamps remaining at 0 (never negative) when over the limit", () => {
    expect(buildScanUsage(FREE_DAILY_SCAN_LIMIT + 5, false, now).scansRemaining).toBe(0);
  });

  it("reports unlimited (null remaining) for Pro users", () => {
    expect(buildScanUsage(99, true, now).scansRemaining).toBeNull();
  });
});
