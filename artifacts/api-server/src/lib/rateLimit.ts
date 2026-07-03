import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { pool } from "@workspace/db";

type IdentityKind = "customerOrIp" | "ip";

type RateRule = {
  scope: string;
  identity: IdentityKind;
  max: number;
  windowSeconds: number;
};

const MINUTE = 60;
const DAY = 86_400;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function apiPath(req: Request): string {
  const path = req.originalUrl.split("?")[0] ?? "";
  return path.startsWith("/api") ? path.slice(4) || "/" : path;
}

function routeMatches(path: string, method: string, pattern: RegExp, methods?: string[]): boolean {
  return pattern.test(path) && (methods == null || methods.includes(method));
}

function isHealth(req: Request): boolean {
  return apiPath(req) === "/healthz";
}

function publicAiRules(req: Request): RateRule[] {
  const path = apiPath(req);
  const method = req.method.toUpperCase();
  const rules: RateRule[] = [];
  const publicAi =
    routeMatches(path, method, /^\/openai\/tts$/, ["POST"]) ||
    routeMatches(path, method, /^\/openai\/romanize$/, ["POST"]) ||
    routeMatches(path, method, /^\/sentences\/bank$/, ["GET"]);
  if (publicAi) {
    rules.push(
      {
        scope: "public_ai_minute",
        identity: "ip",
        max: envInt("RATE_LIMIT_PUBLIC_AI_PER_MINUTE", 20),
        windowSeconds: MINUTE,
      },
      {
        scope: "public_ai_day",
        identity: "ip",
        max: envInt("RATE_LIMIT_PUBLIC_AI_PER_DAY", 200),
        windowSeconds: DAY,
      },
    );
  }
  if (routeMatches(path, method, /^\/scan$/, ["POST"])) {
    rules.push(
      {
        scope: "scan_minute",
        identity: "ip",
        max: envInt("RATE_LIMIT_SCAN_PER_MINUTE", 5),
        windowSeconds: MINUTE,
      },
      {
        scope: "scan_day",
        identity: "ip",
        max: envInt("RATE_LIMIT_SCAN_PER_DAY", 50),
        windowSeconds: DAY,
      },
    );
  }
  return rules;
}

function proAiRules(req: Request): RateRule[] {
  const path = apiPath(req);
  const method = req.method.toUpperCase();
  const isProAi =
    routeMatches(path, method, /^\/openai\/transcribe$/, ["POST"]) ||
    routeMatches(path, method, /^\/openai\/translate$/, ["POST"]) ||
    routeMatches(path, method, /^\/openai\/conversations\/chat$/, ["POST"]) ||
    routeMatches(path, method, /^\/openai\/conversations\/\d+\/messages$/, ["POST"]) ||
    routeMatches(path, method, /^\/openai\/conversations\/\d+\/grade$/, ["POST"]) ||
    routeMatches(path, method, /^\/vocab\/bank$/, ["GET"]) ||
    routeMatches(path, method, /^\/vocab\/search$/, ["POST"]) ||
    routeMatches(path, method, /^\/vocab\/example$/, ["POST"]) ||
    routeMatches(path, method, /^\/vocab\/check$/, ["POST"]);
  if (!isProAi) return [];
  return [
    {
      scope: "pro_ai_minute",
      identity: "customerOrIp",
      max: envInt("RATE_LIMIT_PRO_AI_PER_MINUTE", 60),
      windowSeconds: MINUTE,
    },
    {
      scope: "pro_ai_day",
      identity: "customerOrIp",
      max: envInt("RATE_LIMIT_PRO_AI_PER_DAY", 1000),
      windowSeconds: DAY,
    },
  ];
}

function globalRules(): RateRule[] {
  return [
    {
      scope: "global_api_minute",
      identity: "ip",
      max: envInt("RATE_LIMIT_GLOBAL_PER_MINUTE", 120),
      windowSeconds: MINUTE,
    },
    {
      scope: "global_api_day",
      identity: "ip",
      max: envInt("RATE_LIMIT_GLOBAL_PER_DAY", 2000),
      windowSeconds: DAY,
    },
  ];
}

function rawIdentity(req: Request, identity: IdentityKind): string {
  if (identity === "customerOrIp" && req.customerId != null) {
    return `customer:${req.customerId}`;
  }
  return `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
}

export function hashedRateLimitKey(req: Request, identity: IdentityKind): string {
  const salt = process.env.RATE_LIMIT_HASH_SALT || "lens-lingo-rate-limit-v1";
  return crypto
    .createHash("sha256")
    .update(salt)
    .update(":")
    .update(rawIdentity(req, identity))
    .digest("hex");
}

function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

async function checkRule(req: Request, rule: RateRule): Promise<number | null> {
  const now = new Date();
  const start = windowStart(now, rule.windowSeconds);
  const key = hashedRateLimitKey(req, rule.identity);
  const { rows } = await pool.query<{ count: number }>(
    `
      INSERT INTO api_rate_limits
        (key, scope, window_start, window_seconds, count, updated_at)
      VALUES ($1, $2, $3, $4, 1, now())
      ON CONFLICT (key, scope, window_start, window_seconds)
      DO UPDATE SET count = api_rate_limits.count + 1, updated_at = now()
      RETURNING count
    `,
    [key, rule.scope, start, rule.windowSeconds],
  );
  const count = Number(rows[0]?.count ?? 0);
  if (count <= rule.max) return null;
  const resetMs = start.getTime() + rule.windowSeconds * 1000;
  return Math.max(1, Math.ceil((resetMs - now.getTime()) / 1000));
}

async function applyRules(req: Request, res: Response, rules: RateRule[]): Promise<boolean> {
  for (const rule of rules) {
    const retryAfterSeconds = await checkRule(req, rule);
    if (retryAfterSeconds != null) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "rate_limit_exceeded",
        retryAfterSeconds,
      });
      return false;
    }
  }
  return true;
}

export function apiRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method === "OPTIONS" || isHealth(req)) {
    next();
    return;
  }
  void (async () => {
    const rules = [...globalRules(), ...publicAiRules(req)];
    if (await applyRules(req, res, rules)) next();
  })().catch((err) => {
    req.log.error({ err }, "rate limiter failed");
    next(err);
  });
}

export function proAiRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method === "OPTIONS" || isHealth(req)) {
    next();
    return;
  }
  void (async () => {
    const rules = proAiRules(req);
    if (await applyRules(req, res, rules)) next();
  })().catch((err) => {
    req.log.error({ err }, "pro ai rate limiter failed");
    next(err);
  });
}
