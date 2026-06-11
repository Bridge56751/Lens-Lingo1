import { Router } from "express";
import { reconcileAndGetPlan } from "../lib/plan";

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
  if (customerId == null) {
    res.json({ plan: "free", proSince: null });
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
    res.json(plan);
  } catch (err) {
    req.log.error({ err }, "Failed to read plan");
    res.status(500).json({ error: "Failed to read plan" });
  }
});

export default router;
