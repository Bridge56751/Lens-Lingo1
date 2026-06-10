import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, customers } from "@workspace/db";
import { getCustomer } from "@replit/revenuecat-sdk";
import { getUncachableRevenueCatClient } from "../lib/revenueCatClient";

const router = Router();

/**
 * RevenueCat entitlement lookup key that unlocks Pro. Must match the entitlement
 * the mobile client checks (`pro_access`) and the one provisioned in RevenueCat.
 */
const PRO_ENTITLEMENT_ID = "pro_access";

/**
 * Asks RevenueCat (its REST API, the authoritative source) whether the given
 * app user id currently holds the Pro entitlement.
 *
 * The mobile app calls `Purchases.logIn()` with our Clerk user id when signed
 * in (else the anonymous device id), so the RevenueCat customer id is exactly
 * the value we pass here. RevenueCat aliases anonymous → identified ids on
 * login, so querying by the current id reflects entitlements earned before
 * sign-in too.
 *
 * Returns true/false for a definitive answer. A customer RevenueCat has never
 * seen (404) has simply never purchased → false.
 */
async function fetchProFromRevenueCat(appUserId: string): Promise<boolean> {
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!projectId) {
    throw new Error("REVENUECAT_PROJECT_ID is not set");
  }

  const client = await getUncachableRevenueCatClient();
  const { data, error, response } = await getCustomer({
    client,
    path: { project_id: projectId, customer_id: appUserId },
  });

  if (error) {
    // RevenueCat has no such customer yet (never purchased) — not an error.
    if (response?.status === 404) return false;
    throw new Error(
      `RevenueCat getCustomer failed with status ${response?.status}`,
    );
  }

  const items = data?.active_entitlements?.items ?? [];
  const now = Date.now();
  return items.some(
    (e) =>
      e.entitlement_id === PRO_ENTITLEMENT_ID &&
      (e.expires_at == null || e.expires_at > now),
  );
}

/**
 * Persists the plan implied by RevenueCat onto the customer row. Granting uses
 * COALESCE so an existing `proSince` (the original upgrade time) is preserved;
 * revoking clears it to match the schema's "null while on the free plan"
 * contract.
 */
async function syncPlan(customerId: number, pro: boolean): Promise<void> {
  if (pro) {
    await db
      .update(customers)
      .set({
        plan: "pro",
        proSince: sql`COALESCE(${customers.proSince}, ${new Date()})`,
        lastSeenAt: new Date(),
      })
      .where(eq(customers.id, customerId));
    return;
  }
  await db
    .update(customers)
    .set({ plan: "free", proSince: null, lastSeenAt: new Date() })
    .where(eq(customers.id, customerId));
}

/**
 * Returns the server's authoritative view of the caller's subscription plan.
 *
 * Pro status is kept in sync by pulling from RevenueCat's REST API on each
 * read (no webhook required): we look up the caller's RevenueCat customer and
 * reconcile `customers.plan` / `customers.pro_since` before responding. The
 * refresh is best-effort — if RevenueCat is unreachable we fall back to the
 * last-known stored plan rather than failing the request. Resolves to a clean
 * 'free' when no customer row is attached.
 */
router.get("/me/plan", async (req, res) => {
  const customerId = req.customerId;
  if (customerId == null) {
    res.json({ plan: "free", proSince: null });
    return;
  }

  // The RevenueCat app user id is the same id the mobile client logged in with.
  const appUserId = req.authUserId ?? req.deviceId;
  if (appUserId) {
    try {
      const pro = await fetchProFromRevenueCat(appUserId);
      await syncPlan(customerId, pro);
    } catch (err) {
      // RevenueCat unavailable — serve the last-known stored plan instead of 5xx.
      req.log.warn(
        { err },
        "RevenueCat plan refresh failed; serving stored plan",
      );
    }
  }

  try {
    const [row] = await db
      .select({ plan: customers.plan, proSince: customers.proSince })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    res.json({
      plan: row?.plan ?? "free",
      proSince: row?.proSince ? row.proSince.toISOString() : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to read plan");
    res.status(500).json({ error: "Failed to read plan" });
  }
});

export default router;
