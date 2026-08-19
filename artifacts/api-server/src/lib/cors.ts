import type { NextFunction, Request, Response } from "express";
import type { CorsOptions } from "cors";

const PROD_ORIGINS = [
  "https://lenslingo.ai",
  "https://www.lenslingo.ai",
  "https://lenslingo.app",
  "https://www.lenslingo.app",
  "https://lenslingo.replit.app",
];

const DEV_ORIGINS = [
  "http://localhost:19006",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

function allowedOrigins(): Set<string> {
  const fromEnv = process.env.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (fromEnv?.length) return new Set(fromEnv);
  return new Set(process.env.NODE_ENV === "production" ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS]);
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || allowedOrigins().has(origin)) return true;
  // In development, the app is previewed from the workspace's *.replit.dev
  // domain (which changes per workspace), so allow those origins there.
  if (process.env.NODE_ENV !== "production") {
    try {
      const { protocol, hostname } = new URL(origin);
      if (protocol === "https:" && hostname.endsWith(".replit.dev")) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function corsOptions(): CorsOptions {
  return {
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    methods: ["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "authorization",
      "content-type",
      "x-device-id",
      "x-tz-offset",
    ],
  };
}

export function rejectDisallowedOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: "origin_not_allowed" });
    return;
  }
  next();
}
