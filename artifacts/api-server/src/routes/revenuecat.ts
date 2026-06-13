import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, customers } from "@workspace/db";
import { reconcileAndGetPlan } from "../lib/plan";
import {
  parseTimezoneOffset,
  readScanUsage,
} from "../lib/scanLimit";

const router = Router();

/**
 * Returns the server's authoritative view of the caller's subscription plan.
 *
 * Pro status is kept in sync by pulling from RevenueCat's REST API on each
 * read (no webhook required) inside `reconcileAndGetPlan`: it looks up the
 * caller's RevenueCat customer and reconciles `customers.plan` /
 * `customers.pro_since` before responding. The refresh is best-effort — if
 * RevenueCat is unreachable the last-known stored plan is served rather than
 * failing the request. Resolves to a clean 'free' when no customer row is
 * attached.
 */
router.get("/me/plan", async (req, res) => {
  const customerId = req.customerId;
  const now = new Date();
  // Client sends its UTC offset so the daily counter resets at the user's own
  // local midnight; missing/invalid falls back to UTC (offset 0).
  const tzOffset = parseTimezoneOffset(req.headers["x-tz-offset"]);
  if (customerId == null) {
    // No customer attached (no device id / not signed in) — a clean free row
    // that hasn't used any of today's allowance.
    res.json({
      plan: "free",
      proSince: null,
      ...readScanUsage({ count: 0, resetsAt: null }, false, now, tzOffset),
    });
    return;
  }

  // The RevenueCat app user id is the same id the mobile client logged in with.
  const appUserId = req.authUserId ?? req.deviceId;
  // Clients append `?refresh=1` right after a purchase/restore to bypass the
  // cache and reflect the new entitlement immediately.
  const forceRefresh =
    req.query.refresh === "1" || req.query.refresh === "true";

  try {
    const plan = await reconcileAndGetPlan({
      customerId,
      appUserId,
      forceRefresh,
      log: req.log,
    });
    // Surface today's scan usage so the home screen can render a live counter.
    const [usageRow] = await db
      .select({
        count: customers.scanDayCount,
        resetsAt: customers.scanResetsAt,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    res.json({
      ...plan,
      ...readScanUsage(
        { count: usageRow?.count, resetsAt: usageRow?.resetsAt },
        plan.plan === "pro",
        now,
        tzOffset,
      ),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to read plan");
    res.status(500).json({ error: "Failed to read plan" });
  }
});

export default router;
