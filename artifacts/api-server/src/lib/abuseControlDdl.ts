import { pool } from "@workspace/db";
import { logger } from "./logger";

// NOTE: keep this DDL in sync with the Drizzle definitions in
// lib/db/src/schema/abuseControls.ts. Startup DDL (rather than a drizzle
// migration) is used because `drizzle push` is blocked by an interactive
// prompt (see .agents/memory/drizzle-push-blocked.md); `IF NOT EXISTS`
// keeps it idempotent across restarts and instances.
export async function ensureAbuseControlTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_rate_limits (
      key text NOT NULL,
      scope text NOT NULL,
      window_start timestamptz NOT NULL,
      window_seconds integer NOT NULL,
      count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (key, scope, window_start, window_seconds)
    );

    CREATE INDEX IF NOT EXISTS api_rate_limits_updated_at_idx
      ON api_rate_limits (updated_at);

    CREATE TABLE IF NOT EXISTS provider_budget_months (
      provider text NOT NULL,
      year_month text NOT NULL,
      estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
      call_count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, year_month)
    );

    CREATE TABLE IF NOT EXISTS provider_usage (
      id serial PRIMARY KEY,
      provider text NOT NULL,
      year_month text NOT NULL,
      model text NOT NULL,
      call_kind text NOT NULL,
      estimated_cost_usd numeric(12, 6) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS provider_usage_provider_month_idx
      ON provider_usage (provider, year_month, created_at);
  `);
}

// Rate-limit rows are dead weight once their window has passed (the longest
// window is 1 day), but nothing else deletes them — without pruning the table
// grows unboundedly, and a request flood bloats it fast. 2 days of retention
// comfortably outlives every window while keeping a short debugging tail.
const RATE_LIMIT_RETENTION = "2 days";
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export async function purgeExpiredRateLimitRows(): Promise<void> {
  const { rowCount } = await pool.query(
    `DELETE FROM api_rate_limits WHERE updated_at < now() - interval '${RATE_LIMIT_RETENTION}'`,
  );
  if (rowCount) {
    logger.info({ rowCount }, "purged expired rate-limit rows");
  }
}

// Purge on startup, then on a timer. Best-effort — a failed purge must never
// affect request serving; the next cycle (or restart) retries. The timer is
// unref'd so it can't hold the process open on shutdown.
export function startRateLimitPurge(): void {
  void purgeExpiredRateLimitRows().catch((err) => {
    logger.error({ err }, "rate-limit purge failed");
  });
  const timer = setInterval(() => {
    void purgeExpiredRateLimitRows().catch((err) => {
      logger.error({ err }, "rate-limit purge failed");
    });
  }, PURGE_INTERVAL_MS);
  timer.unref();
}
