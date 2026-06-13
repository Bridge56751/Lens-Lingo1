import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, customers } from "@workspace/db";
import { reconcileAndGetPlan } from "../lib/plan";
import { buildScanUsage, scansUsedToday } from "../lib/scanLimit";

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
  if (customerId == null) {
    // No customer attached (no device id / not signed in) — a clean free row
    // that hasn't used any of today's allowance.
    res.json({ plan: "free", proSince: null, ...buildScanUsage(0, false, now) });
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
        scanDayCount: customers.scanDayCount,
        scanDayKey: customers.scanDayKey,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    const usedToday = scansUsedToday(
      usageRow?.scanDayKey,
      usageRow?.scanDayCount,
      now,
    );
    res.json({
      ...plan,
      ...buildScanUsage(usedToday, plan.plan === "pro", now),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to read plan");
    res.status(500).json({ error: "Failed to read plan" });
  }
});

export default router;
