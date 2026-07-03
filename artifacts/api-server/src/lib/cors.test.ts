import { describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { corsOptions, rejectDisallowedOrigin } from "./cors";

function checkOrigin(origin: string | undefined): Promise<boolean> {
  const options = corsOptions();
  return new Promise((resolve, reject) => {
    const fn = options.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;
    fn(origin, (err, allow) => {
      if (err) reject(err);
      else resolve(Boolean(allow));
    });
  });
}

describe("corsOptions", () => {
  it("allows configured production origins and native/no-origin requests", async () => {
    await expect(checkOrigin("https://lenslingo.ai")).resolves.toBe(true);
    await expect(checkOrigin(undefined)).resolves.toBe(true);
  });

  it("does not allow arbitrary browser origins", async () => {
    await expect(checkOrigin("https://example.com")).resolves.toBe(false);
  });

  it("rejects disallowed browser origins before route work", () => {
    const req = {
      headers: { origin: "https://example.com" },
    } as Request;
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    } as Response & { statusCode: number; body: unknown };
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    rejectDisallowedOrigin(req, res, next);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "origin_not_allowed" });
  });
});
