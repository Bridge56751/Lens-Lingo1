import { eq, sql } from "drizzle-orm";
import { db, customers } from "@workspace/db";
import {
  listEntitlements,
  listCustomerActiveEntitlements,
} from "@replit/revenuecat-sdk";
import { getUncachableRevenueCatClient } from "./revenueCatClient";

/**
 * RevenueCat entitlement *lookup key* that unlocks Pro. This matches the
 * identifier the mobile client checks (`pro_access`) and the entitlement
 * provisioned in RevenueCat.
 *
 * IMPORTANT: RevenueCat's REST API reports a customer's active entitlements by
 * the entitlement's *object id* (e.g. `entle49b...`), NOT by this lookup key, so
 * we first resolve the lookup key to its object id (see
 * `resolveProEntitlementId`) and match on that.
 */
const PRO_ENTITLEMENT_LOOKUP_KEY = "pro_access";

/** RevenueCat REST client type (resolved lazily per request). */
type RevenueCatClient = Awaited<
  ReturnType<typeof getUncachableRevenueCatClient>
>;

/**
 * Cached RevenueCat object id of the Pro entitlement, resolved from its lookup
 * key. Entitlement ids are stable for the life of the entitlement, so the first
 * successful resolution is reused for the rest of the process. Only a non-null
 * result is cached, so a transient lookup miss is retried on the next call.
 */
let proEntitlementIdCache: string | null = null;

/**
 * Resolves the Pro entitlement's RevenueCat object id from its lookup key by
 * listing the project's entitlements. Throws if the lookup fails or the
 * entitlement is missing, so the best-effort caller falls back to the stored
 * plan rather than silently treating every customer as free.
 */
async function resolveProEntitlementId(
  client: RevenueCatClient,
  projectId: string,
): Promise<string> {
  if (proEntitlementIdCache) return proEntitlementIdCache;
  const { data, error, response } = await listEntitlements({
    client,
    path: { project_id: projectId },
  });
  if (error) {
    throw new Error(
      `RevenueCat listEntitlements failed with status ${response?.status}`,
    );
  }
  const match = (data?.items ?? []).find(
    (e) => e.lookup_key === PRO_ENTITLEMENT_LOOKUP_KEY,
  );
  if (!match) {
    throw new Error(
      `RevenueCat entitlement with lookup_key "${PRO_ENTITLEMENT_LOOKUP_KEY}" not found`,
    );
  }
  proEntitlementIdCache = match.id;
  return match.id;
}

/**
 * How long a successful RevenueCat pull stays "fresh". Within this window the
 * already-reconciled stored plan is served without hitting RevenueCat's REST
 * API (~1–2s round-trip), making repeat reads near-instant and cutting outbound
 * calls / rate-limit pressure. The freshness map is module-level so it is shared
 * by every consumer of this module (the `/me/plan` route and the `requirePro`
 * middleware), meaning a refresh triggered by one benefits the others.
 */
const PLAN_CACHE_TTL_MS = 45_000;

/**
 * Per-RevenueCat-customer freshness map: appUserId → epoch ms of the last
 * successful RevenueCat reconcile. Module-level so it survives across requests
 * (single-process server). Entries are pruned lazily once expired.
 */
const planFreshUntil = new Map<string, number>();

function isPlanFresh(appUserId: string): boolean {
  const until = planFreshUntil.get(appUserId);
  if (until == null) return false;
  if (until <= Date.now()) {
    planFreshUntil.delete(appUserId);
    return false;
  }
  return true;
}

function markPlanFresh(appUserId: string): void {
  // Opportunistically drop expired entries so the map can't grow unbounded.
  if (planFreshUntil.size > 1000) {
    const now = Date.now();
    for (const [key, until] of planFreshUntil) {
      if (until <= now) planFreshUntil.delete(key);
    }
  }
  planFreshUntil.set(appUserId, Date.now() + PLAN_CACHE_TTL_MS);
}

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
  const proEntitlementId = await resolveProEntitlementId(client, projectId);

  // `getCustomer` does NOT return active entitlements (its only expandable
  // field is `attributes`); the dedicated active-entitlements endpoint must be
  // used. Each returned item identifies its entitlement by the entitlement's
  // *object id*, so we match on the resolved id (and also accept the lookup key
  // defensively, in case the API ever reports it that way).
  const { data, error, response } = await listCustomerActiveEntitlements({
    client,
    path: { project_id: projectId, customer_id: appUserId },
  });

  if (error) {
    // RevenueCat has no such customer yet (never purchased) — not an error.
    if (response?.status === 404) return false;
    throw new Error(
      `RevenueCat listCustomerActiveEntitlements failed with status ${response?.status}`,
    );
  }

  const items = data?.items ?? [];
  const now = Date.now();
  return items.some(
    (e) =>
      (e.entitlement_id === proEntitlementId ||
        e.entitlement_id === PRO_ENTITLEMENT_LOOKUP_KEY) &&
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

export type ResolvedPlan = {
  plan: "free" | "pro";
  proSince: string | null;
};

/** Minimal logger surface so callers can pass `req.log` (pino) optionally. */
type PlanLogger = { warn: (...args: unknown[]) => void };

export type ReconcilePlanOptions = {
  /** Numeric id of the customer row whose plan is being reconciled. */
  customerId: number;
  /**
   * RevenueCat app user id — the same id the mobile client logged in with
   * (Clerk user id when signed in, else the anonymous device id). When null the
   * RevenueCat refresh is skipped and the stored plan is returned as-is.
   */
  appUserId: string | null | undefined;
  /** Bypass the freshness cache (e.g. right after a purchase/restore). */
  forceRefresh?: boolean;
  /** Optional logger for best-effort refresh failures. */
  log?: PlanLogger;
};

/**
 * Reconciles the customer's plan from RevenueCat (best-effort) and returns the
 * server's authoritative view of it.
 *
 * Pro status is kept in sync by pulling from RevenueCat's REST API on read (no
 * webhook required): we look up the caller's RevenueCat customer and reconcile
 * `customers.plan` / `customers.pro_since` before reading the stored row. The
 * RevenueCat refresh is best-effort — if it is unreachable we fall back to the
 * last-known stored plan rather than failing. The final stored-row read is NOT
 * caught here, so a hard database failure propagates to the caller (the
 * `/me/plan` route surfaces it as a 500; the `requirePro` guard treats it as
 * "not Pro").
 */
export async function reconcileAndGetPlan(
  opts: ReconcilePlanOptions,
): Promise<ResolvedPlan> {
  const { customerId, appUserId, forceRefresh = false, log } = opts;

  if (appUserId && (forceRefresh || !isPlanFresh(appUserId))) {
    try {
      const pro = await fetchProFromRevenueCat(appUserId);
      await syncPlan(customerId, pro);
      markPlanFresh(appUserId);
    } catch (err) {
      // RevenueCat unavailable — serve the last-known stored plan instead of 5xx.
      log?.warn({ err }, "RevenueCat plan refresh failed; serving stored plan");
    }
  }

  const [row] = await db
    .select({ plan: customers.plan, proSince: customers.proSince })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  return {
    plan: (row?.plan ?? "free") as "free" | "pro",
    proSince: row?.proSince ? row.proSince.toISOString() : null,
  };
}

/**
 * Convenience wrapper for entitlement gating: returns whether the customer
 * currently holds Pro, reconciling from RevenueCat first. Never throws — any
 * failure (including a database read error) resolves to `false` so the guard
 * fails closed (denies access) rather than leaking a paid feature.
 */
export async function customerHasPro(
  opts: ReconcilePlanOptions,
): Promise<boolean> {
  try {
    const { plan } = await reconcileAndGetPlan(opts);
    return plan === "pro";
  } catch {
    return false;
  }
}
