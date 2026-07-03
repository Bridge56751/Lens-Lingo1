import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  counts: [] as number[],
  params: [] as unknown[][],
}));

vi.mock("@workspace/db", () => ({
  pool: {
    query: vi.fn(async (_sql: string, params?: unknown[]) => {
      h.params.push(params ?? []);
      return { rows: [{ count: h.counts.shift() ?? 1 }] };
    }),
  },
}));

const { apiRateLimiter, hashedRateLimitKey } = await import("./rateLimit");

function makeReq(path: string): Request {
  return {
    method: "POST",
    originalUrl: path,
    ip: "203.0.113.10",
    socket: { remoteAddress: "203.0.113.10" },
    log: { error: vi.fn() },
  } as unknown as Request;
}

function makeRes(done: () => void): Response & { body?: unknown; statusCode?: number } {
  const res: any = { setHeader: vi.fn() };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    done();
    return res;
  };
  return res as unknown as Response & { body?: unknown; statusCode?: number };
}

describe("apiRateLimiter", () => {
  beforeEach(() => {
    h.counts = [];
    h.params = [];
    process.env.RATE_LIMIT_GLOBAL_PER_MINUTE = "1";
    process.env.RATE_LIMIT_PUBLIC_AI_PER_MINUTE = "1";
  });

  it("lets requests through while under all matching limits", async () => {
    h.counts = [1, 1, 1, 1];

    await new Promise<void>((resolve) => {
      const req = makeReq("/api/openai/tts");
      const res = makeRes(resolve);
      const next: NextFunction = () => resolve();
      apiRateLimiter(req, res, next);
    });

    expect(h.counts).toHaveLength(0);
  });

  it("returns 429 when the first matching window is over limit", async () => {
    h.counts = [2];
    let res!: Response & { body?: unknown; statusCode?: number };

    await new Promise<void>((resolve) => {
      const req = makeReq("/api/openai/tts");
      res = makeRes(resolve);
      apiRateLimiter(req, res, vi.fn());
    });

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ error: "rate_limit_exceeded" });
  });

  it("uses a new window after the reset boundary passes", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-03T10:00:00.000Z"));
      h.counts = [1, 1, 1, 1];
      await new Promise<void>((resolve) => {
        const req = makeReq("/api/openai/tts");
        const res = makeRes(resolve);
        apiRateLimiter(req, res, () => resolve());
      });

      vi.setSystemTime(new Date("2026-07-03T10:01:01.000Z"));
      h.counts = [1, 1, 1, 1];
      await new Promise<void>((resolve) => {
        const req = makeReq("/api/openai/tts");
        const res = makeRes(resolve);
        apiRateLimiter(req, res, () => resolve());
      });

      const firstMinuteWindow = h.params[0]?.[2] as Date;
      const secondMinuteWindow = h.params[4]?.[2] as Date;
      expect(firstMinuteWindow.toISOString()).toBe("2026-07-03T10:00:00.000Z");
      expect(secondMinuteWindow.toISOString()).toBe("2026-07-03T10:01:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("hashes identifiers instead of returning raw IPs", () => {
    const key = hashedRateLimitKey(makeReq("/api/openai/tts"), "ip");

    expect(key).toHaveLength(64);
    expect(key).not.toContain("203.0.113.10");
  });
});
