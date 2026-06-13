import { describe, expect, it } from "vitest";
import {
  FREE_DAILY_SCAN_LIMIT,
  MIN_PERIOD_HOURS,
  buildScanUsage,
  nextLocalMidnight,
  nextResetBoundary,
  parseTimezoneOffset,
  readScanUsage,
  reserveScan,
} from "./scanLimit";

// Pure helpers behind the free-tier daily scan limit. The reset logic is
// timezone-sensitive: the client sends its UTC offset (Date#getTimezoneOffset
// minutes — positive when behind UTC) and the allowance refills at the caller's
// LOCAL midnight. CRUCIALLY the offset is client-controlled, so the period is
// keyed on an ABSOLUTE reset instant that only advances when real time passes
// it — a rotating offset can shift the NEXT boundary but can't expire the
// current one early or chain short windows to beat the cap (see anti-tamper
// tests below).

describe("parseTimezoneOffset", () => {
  it("parses a numeric offset string", () => {
    expect(parseTimezoneOffset("420")).toBe(420);
    expect(parseTimezoneOffset("-330")).toBe(-330);
    expect(parseTimezoneOffset("0")).toBe(0);
  });

  it("uses the first value when given an array (duplicate header)", () => {
    expect(parseTimezoneOffset(["120", "999"])).toBe(120);
  });

  it("falls back to 0 (UTC) for missing or non-numeric input", () => {
    expect(parseTimezoneOffset(undefined)).toBe(0);
    expect(parseTimezoneOffset(null)).toBe(0);
    expect(parseTimezoneOffset("")).toBe(0);
    expect(parseTimezoneOffset("not-a-number")).toBe(0);
  });

  it("clamps to the real-world ±14h range", () => {
    expect(parseTimezoneOffset("100000")).toBe(840);
    expect(parseTimezoneOffset("-100000")).toBe(-840);
  });
});

describe("nextLocalMidnight", () => {
  it("returns 00:00:00 UTC of the following day when offset is 0", () => {
    expect(nextLocalMidnight(new Date("2026-06-13T09:30:00.000Z"))).toBe(
      "2026-06-14T00:00:00.000Z",
    );
  });

  it("returns the next local midnight as a UTC instant west of UTC (UTC-7)", () => {
    // 02:00Z on the 14th is 19:00 local on the 13th; local midnight (00:00 on
    // the 14th, UTC-7) is 07:00Z on the 14th.
    expect(nextLocalMidnight(new Date("2026-06-14T02:00:00.000Z"), 420)).toBe(
      "2026-06-14T07:00:00.000Z",
    );
  });

  it("returns the next local midnight as a UTC instant east of UTC (UTC+9)", () => {
    // 16:00Z on the 13th is 01:00 local on the 14th; next local midnight (00:00
    // on the 15th, UTC+9) is 15:00Z on the 14th.
    expect(nextLocalMidnight(new Date("2026-06-13T16:00:00.000Z"), -540)).toBe(
      "2026-06-14T15:00:00.000Z",
    );
  });
});

describe("nextResetBoundary", () => {
  it("uses the next local midnight when there is no previous boundary", () => {
    expect(
      nextResetBoundary(new Date("2026-06-13T09:30:00.000Z"), 0, null),
    ).toBe("2026-06-14T00:00:00.000Z");
  });

  it("leaves an honest, stable-offset boundary at local midnight (floor never binds)", () => {
    // Previous reset was yesterday's local midnight; today's is a full 24h later
    // — well past the MIN_PERIOD_HOURS floor, so it is used unchanged.
    const prev = "2026-06-13T00:00:00.000Z";
    expect(
      nextResetBoundary(new Date("2026-06-13T08:00:00.000Z"), 0, prev),
    ).toBe("2026-06-14T00:00:00.000Z");
  });

  it("floors a suspiciously-soon next boundary to prev + MIN_PERIOD_HOURS", () => {
    // A tampered offset claims it is one minute before local midnight, so the
    // naive next midnight is ~1 min away — far under the floor. We clamp it.
    const prev = "2026-06-13T00:00:00.000Z";
    const now = new Date("2026-06-13T00:01:00.000Z");
    // offset +2 puts "now" at 23:59 local → next midnight ~1 min out (00:02Z),
    // which is well under prev + 23h, so the floor binds.
    const out = nextResetBoundary(now, 2, prev);
    expect(out).toBe(
      new Date(Date.parse(prev) + MIN_PERIOD_HOURS * 3_600_000).toISOString(),
    );
  });
});

describe("reserveScan", () => {
  const future = "2026-06-13T12:00:00.000Z";
  const now = new Date("2026-06-13T06:00:00.000Z"); // before `future`

  it("starts a fresh period at 1 for a brand-new row", () => {
    const r = reserveScan({ count: null, resetsAt: null }, now, 0);
    expect(r).toEqual({
      count: 1,
      resetsAt: nextLocalMidnight(now, 0),
      allowed: true,
    });
  });

  it("increments within an active period and keeps the stored boundary", () => {
    const r = reserveScan({ count: 3, resetsAt: future }, now, 0);
    expect(r).toEqual({ count: 4, resetsAt: future, allowed: true });
  });

  it("denies (allowed=false) once the active period is at the cap", () => {
    const r = reserveScan(
      { count: FREE_DAILY_SCAN_LIMIT, resetsAt: future },
      now,
      0,
    );
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(FREE_DAILY_SCAN_LIMIT);
    expect(r.resetsAt).toBe(future);
  });

  it("starts a fresh period when the stored boundary has already passed", () => {
    const past = "2026-06-12T00:00:00.000Z";
    const r = reserveScan({ count: FREE_DAILY_SCAN_LIMIT, resetsAt: past }, now, 0);
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });

  it("ANTI-TAMPER: a rotating offset cannot expire an active period early", () => {
    // At the cap, in an active period. The attacker flips the offset wildly on
    // each request; because the period is judged on real time vs. the stored
    // boundary (offset-independent), every attempt is still denied.
    const stored = { count: FREE_DAILY_SCAN_LIMIT, resetsAt: future };
    for (const offset of [840, -840, 0, 420, -540, 720, -720]) {
      expect(reserveScan(stored, now, offset).allowed).toBe(false);
    }
  });

  it("ANTI-TAMPER: cannot chain short windows — a new period is floored to ≥ MIN_PERIOD_HOURS", () => {
    // Simulate the attack: exhaust a period, let it just barely expire, then
    // immediately try to start another tiny period by claiming it's ~23:59
    // local. The new boundary must be floored ~23h out, not seconds out, so the
    // attacker is locked for the rest of the period instead of resetting freely.
    const start = new Date("2026-06-13T00:00:00.000Z");
    const first = reserveScan({ count: 0, resetsAt: null }, start, 0);
    expect(first.resetsAt).toBe("2026-06-14T00:00:00.000Z");

    // Period expires at the boundary; attacker scans 1 ms later with a tampered
    // offset claiming it's a minute before local midnight again.
    const justAfter = new Date(Date.parse(first.resetsAt) + 1);
    const second = reserveScan(
      { count: FREE_DAILY_SCAN_LIMIT, resetsAt: first.resetsAt },
      justAfter,
      -1439,
    );
    expect(second.count).toBe(1); // a reset did happen, but…
    // …the next boundary is floored to prev + MIN_PERIOD_HOURS, NOT ~1 min out.
    const floor = Date.parse(first.resetsAt) + MIN_PERIOD_HOURS * 3_600_000;
    expect(Date.parse(second.resetsAt)).toBeGreaterThanOrEqual(floor);
  });

  it("FIRST-PERIOD EXCEPTION: a null row's first window is NOT floored (accepted, one-time)", () => {
    // No previous boundary to floor against, so a tampered offset claiming it is
    // ~1 min before local midnight yields a SHORT first window. Accepted (see
    // file header): bounded + one-time, because the NEXT period IS floored.
    const now = new Date("2026-06-13T12:00:00.000Z");
    const tamperedOffset = -719; // claims local time is 23:59 → next midnight ~1 min out
    const first = reserveScan({ count: null, resetsAt: null }, now, tamperedOffset);
    expect(first.allowed).toBe(true);
    expect(first.count).toBe(1);
    // The first window is shorter than the floor — the exception in action.
    const firstWindowMs = Date.parse(first.resetsAt) - now.getTime();
    expect(firstWindowMs).toBeLessThan(MIN_PERIOD_HOURS * 3_600_000);

    // …but the SECOND period is floored to ≥ prev + MIN_PERIOD_HOURS — no chaining.
    const justAfter = new Date(Date.parse(first.resetsAt) + 1);
    const second = reserveScan(
      { count: FREE_DAILY_SCAN_LIMIT, resetsAt: first.resetsAt },
      justAfter,
      tamperedOffset,
    );
    expect(second.count).toBe(1);
    expect(Date.parse(second.resetsAt)).toBeGreaterThanOrEqual(
      Date.parse(first.resetsAt) + MIN_PERIOD_HOURS * 3_600_000,
    );
  });

  it("LEGACY: a YYYY-MM-DD key stays capped until the END of that UTC day (no early refill)", () => {
    // Pre-deploy rows stored a UTC day key. A user who spent their allowance on
    // 2026-06-13 must remain capped until 2026-06-14T00:00Z, then convert to an
    // ISO instant — NOT get an early refill mid-day.
    const midDay = new Date("2026-06-13T15:00:00.000Z");
    const r = reserveScan(
      { count: FREE_DAILY_SCAN_LIMIT, resetsAt: "2026-06-13" },
      midDay,
      0,
    );
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(FREE_DAILY_SCAN_LIMIT);
    // Boundary is normalized to the END of that UTC day.
    expect(r.resetsAt).toBe("2026-06-14T00:00:00.000Z");
  });

  it("LEGACY: a YYYY-MM-DD key past its UTC day starts a fresh period", () => {
    const nextDay = new Date("2026-06-14T01:00:00.000Z");
    const r = reserveScan(
      { count: FREE_DAILY_SCAN_LIMIT, resetsAt: "2026-06-13" },
      nextDay,
      0,
    );
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });
});

describe("buildScanUsage", () => {
  const resetsAt = "2026-06-14T00:00:00.000Z";

  it("reports remaining = limit - used for free users", () => {
    expect(buildScanUsage(3, false, resetsAt)).toEqual({
      scanLimit: FREE_DAILY_SCAN_LIMIT,
      scansUsedToday: 3,
      scansRemaining: FREE_DAILY_SCAN_LIMIT - 3,
      scanResetsAt: resetsAt,
    });
  });

  it("clamps remaining at 0 (never negative) when over the limit", () => {
    expect(buildScanUsage(FREE_DAILY_SCAN_LIMIT + 5, false, resetsAt).scansRemaining).toBe(0);
  });

  it("reports unlimited (null remaining) for Pro users", () => {
    expect(buildScanUsage(99, true, resetsAt).scansRemaining).toBeNull();
  });
});

describe("readScanUsage", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");

  it("reports the stored count + boundary while the period is active", () => {
    const future = "2026-06-13T20:00:00.000Z";
    expect(readScanUsage({ count: 4, resetsAt: future }, false, now, 0)).toEqual({
      scanLimit: FREE_DAILY_SCAN_LIMIT,
      scansUsedToday: 4,
      scansRemaining: FREE_DAILY_SCAN_LIMIT - 4,
      scanResetsAt: future,
    });
  });

  it("reports 0 used + the upcoming local midnight once the period has expired", () => {
    const past = "2026-06-12T00:00:00.000Z";
    const usage = readScanUsage({ count: 10, resetsAt: past }, false, now, 0);
    expect(usage.scansUsedToday).toBe(0);
    expect(usage.scansRemaining).toBe(FREE_DAILY_SCAN_LIMIT);
    expect(usage.scanResetsAt).toBe("2026-06-14T00:00:00.000Z");
  });

  it("uses the caller's local midnight for the refill time when expired (UTC-7)", () => {
    const lateUtc = new Date("2026-06-14T02:00:00.000Z");
    const usage = readScanUsage({ count: 0, resetsAt: null }, false, lateUtc, 420);
    expect(usage.scanResetsAt).toBe("2026-06-14T07:00:00.000Z");
  });

  it("reports unlimited for Pro users regardless of stored usage", () => {
    const future = "2026-06-13T20:00:00.000Z";
    expect(
      readScanUsage({ count: 5, resetsAt: future }, true, now, 0).scansRemaining,
    ).toBeNull();
  });

  it("expired-path reset time matches the reservation (floored), not the bare next midnight", () => {
    // An expired period whose anti-tamper floor would bind: /me/plan must report
    // the SAME boundary the next scan will persist, so the UI countdown agrees
    // with reality. offset +2 → next local midnight is ~2 min out, but the floor
    // (prev + 23h) is far later and wins.
    const prev = "2026-06-13T23:30:00.000Z";
    const justAfter = new Date("2026-06-14T00:00:00.001Z");
    const usage = readScanUsage({ count: 10, resetsAt: prev }, false, justAfter, 2);
    expect(usage.scansUsedToday).toBe(0);
    expect(usage.scanResetsAt).toBe(
      nextResetBoundary(justAfter, 2, prev),
    );
    // …and NOT the un-floored next local midnight.
    expect(usage.scanResetsAt).not.toBe(nextLocalMidnight(justAfter, 2));
  });
});
