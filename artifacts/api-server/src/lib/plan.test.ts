import { beforeEach, describe, expect, it, vi } from "vitest";
import { SQL } from "drizzle-orm";

// Coverage for the plan freshness cache invalidation used by account deletion.
//
// When a user deletes their account the `customers` row is destroyed and
// re-created empty (plan `free`) on the next request for the same RevenueCat app
// user id. Because sign-in is hidden, that id is the retained device id, so a
// still-paying subscriber must immediately re-pull Pro from RevenueCat. The
// module-level `planFreshUntil` cache (45s TTL) would otherwise let `/me/plan`
// and `requirePro` skip RevenueCat and serve the default `free` row — stranding
// the paying user as Free/403. `invalidatePlanFreshness()` (called by the delete
// route) drops that entry so the next read re-pulls. These tests exercise that
// directly through `reconcileAndGetPlan`, mocking RevenueCat and `@workspace/db`.

const h = vi.hoisted(() => ({
  activeEntitlementsMock:
    vi.fn<
      (opts: {
        path: { project_id: string; customer_id: string };
      }) => Promise<{
        data?: { items?: unknown[] };
        error?: unknown;
        response?: { status: number };
      }>
    >(),
  listEntitlementsMock:
    vi.fn<
      (opts: { path: { project_id: string } }) => Promise<{
        data?: { items?: { id: string; lookup_key: string }[] };
        error?: unknown;
        response?: { status: number };
      }>
    >(),
  row: null as
    | null
    | { id: number; plan: "free" | "pro"; proSince: Date | null },
}));

vi.mock("@replit/revenuecat-sdk", () => ({
  listCustomerActiveEntitlements: h.activeEntitlementsMock,
  listEntitlements: h.listEntitlementsMock,
}));

vi.mock("./revenueCatClient", () => ({
  getUncachableRevenueCatClient: vi.fn(async () => ({})),
}));

// Minimal in-memory drizzle stand-in mirroring revenuecat.test.ts: the plan
// resolver only ever performs an update(...).set(...).where(...) and a
// select(...).from(...).where(...).limit(1) over a single customer row.
vi.mock("@workspace/db", () => {
  const customers = {
    id: "customers.id",
    plan: "customers.plan",
    proSince: "customers.proSince",
  };
  const db = {
    update() {
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              if (h.row) {
                if (typeof values.plan === "string") {
                  h.row.plan = values.plan as "free" | "pro";
                }
                if ("proSince" in values) {
                  const v = values.proSince;
                  if (v instanceof SQL) {
                    // Mirrors COALESCE(proSince, now()).
                    h.row.proSince = h.row.proSince ?? new Date();
                  } else {
                    h.row.proSince = (v as Date | null) ?? null;
                  }
                }
              }
              return Promise.resolve();
            },
          };
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit() {
                  return Promise.resolve(
                    h.row
                      ? [{ plan: h.row.plan, proSince: h.row.proSince }]
                      : [],
                  );
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, customers };
});

import { reconcileAndGetPlan, invalidatePlanFreshness } from "./plan";

const PROJECT_ID = "proj_test";
const PRO_ENT_ID = "entle_pro";

// The project's entitlements, mapping the `pro_access` lookup key to its id.
function rcEntitlements() {
  return {
    data: { items: [{ id: PRO_ENT_ID, lookup_key: "pro_access" }] },
    response: { status: 200 },
  };
}

// A RevenueCat customer holding the (non-expiring) Pro entitlement.
function rcActive(entitlementId = PRO_ENT_ID, expiresAt: number | null = null) {
  return {
    data: { items: [{ entitlement_id: entitlementId, expires_at: expiresAt }] },
    response: { status: 200 },
  };
}

beforeEach(() => {
  process.env.REVENUECAT_PROJECT_ID = PROJECT_ID;
  h.activeEntitlementsMock.mockReset();
  h.listEntitlementsMock.mockReset();
  h.listEntitlementsMock.mockResolvedValue(rcEntitlements());
  h.row = null;
});

describe("invalidatePlanFreshness — re-pull after account deletion", () => {
  it("serves the fresh-cached plan without re-pulling within the TTL window", async () => {
    const appUserId = "dev-fresh-window";
    h.row = { id: 1, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rcActive());

    // First read pulls from RevenueCat and marks the id fresh.
    const first = await reconcileAndGetPlan({ customerId: 1, appUserId });
    expect(first.plan).toBe("pro");
    expect(h.activeEntitlementsMock).toHaveBeenCalledTimes(1);

    // Second read within the TTL serves the stored plan without a re-pull.
    await reconcileAndGetPlan({ customerId: 1, appUserId });
    expect(h.activeEntitlementsMock).toHaveBeenCalledTimes(1);
  });

  it("without invalidation, a stale-fresh window serves a re-created free row as free", async () => {
    const appUserId = "dev-stale-bug";
    h.row = { id: 2, plan: "pro", proSince: new Date("2025-01-01") };
    h.activeEntitlementsMock.mockResolvedValue(rcActive());

    // Pull once -> Pro, marked fresh.
    expect((await reconcileAndGetPlan({ customerId: 2, appUserId })).plan).toBe(
      "pro",
    );
    expect(h.activeEntitlementsMock).toHaveBeenCalledTimes(1);

    // Account deleted; row re-created empty (free) — but the cache is still fresh.
    h.row = { id: 2, plan: "free", proSince: null };

    // No invalidation -> skips RevenueCat -> serves the default free row.
    const stale = await reconcileAndGetPlan({ customerId: 2, appUserId });
    expect(stale.plan).toBe("free");
    expect(h.activeEntitlementsMock).toHaveBeenCalledTimes(1);
  });

  it("forces an immediate re-pull so a still-paying user re-attaches Pro", async () => {
    const appUserId = "dev-keep-on-delete";
    h.row = { id: 3, plan: "pro", proSince: new Date("2025-01-01") };
    h.activeEntitlementsMock.mockResolvedValue(rcActive());

    // Pull once -> Pro, marked fresh.
    expect((await reconcileAndGetPlan({ customerId: 3, appUserId })).plan).toBe(
      "pro",
    );
    expect(h.activeEntitlementsMock).toHaveBeenCalledTimes(1);

    // Account deleted: row re-created empty AND freshness invalidated (the fix).
    h.row = { id: 3, plan: "free", proSince: null };
    invalidatePlanFreshness(appUserId);

    // Next read re-pulls from RevenueCat, which still reports the active sub, so
    // the re-created row is restored to Pro instead of stranded as Free.
    const restored = await reconcileAndGetPlan({ customerId: 3, appUserId });
    expect(restored.plan).toBe("pro");
    expect(h.activeEntitlementsMock).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for a null/undefined app user id", () => {
    expect(() => invalidatePlanFreshness(null)).not.toThrow();
    expect(() => invalidatePlanFreshness(undefined)).not.toThrow();
  });
});
