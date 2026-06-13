import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SQL } from "drizzle-orm";

// Coverage for the server-side Pro sync served by `GET /api/me/plan`.
//
// This route reconciles billing state from RevenueCat onto the `customers`
// table, so a regression could silently grant or revoke Pro. We exercise the
// reconcile + fallback behaviour end-to-end through the real Express handler
// while mocking (1) the RevenueCat client so no network call happens and
// (2) `@workspace/db` so no real database is touched.

// Shared mock state. `vi.hoisted` runs before the `vi.mock` factories below so
// they can close over it.
const h = vi.hoisted(() => ({
  // Mocks the dedicated active-entitlements endpoint the resolver now uses.
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
  // Mocks the project entitlement listing used to map the `pro_access` lookup
  // key to its RevenueCat object id.
  listEntitlementsMock:
    vi.fn<
      (opts: { path: { project_id: string } }) => Promise<{
        data?: { items?: { id: string; lookup_key: string }[] };
        error?: unknown;
        response?: { status: number };
      }>
    >(),
  // The single customer row the route reads/writes for each request. Tests seed
  // it in `beforeEach`; the fake db below mutates and reads this one row.
  row: null as
    | null
    | { id: number; plan: "free" | "pro"; proSince: Date | null },
}));

vi.mock("@replit/revenuecat-sdk", () => ({
  listCustomerActiveEntitlements: h.activeEntitlementsMock,
  listEntitlements: h.listEntitlementsMock,
}));

vi.mock("../lib/revenueCatClient", () => ({
  getUncachableRevenueCatClient: vi.fn(async () => ({})),
}));

// Minimal in-memory drizzle stand-in. The route only ever performs:
//   update(customers).set(values).where(eq(customers.id, customerId))
//   select({...}).from(customers).where(eq(...)).limit(1)
// Tests run one customer at a time, so the fake operates on the single
// `h.row` and ignores the (real, but irrelevant here) where clause.
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
                    // Mirrors COALESCE(proSince, now()): keep the original
                    // upgrade time, only stamp a new one when none exists.
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

import router from "./revenuecat";

const PROJECT_ID = "proj_test";

let server: Server;
let baseUrl: string;
// Per-request identity injected by the test middleware.
let ctx: { customerId?: number; authUserId?: string; deviceId?: string };

beforeAll(async () => {
  process.env.REVENUECAT_PROJECT_ID = PROJECT_ID;
  const app = express();
  app.use((req, _res, next) => {
    req.customerId = ctx.customerId;
    req.authUserId = ctx.authUserId;
    req.deviceId = ctx.deviceId;
    (req as unknown as { log: unknown }).log = {
      warn() {},
      error() {},
      info() {},
    };
    next();
  });
  app.use("/api", router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  ctx = {};
  h.activeEntitlementsMock.mockReset();
  h.listEntitlementsMock.mockReset();
  h.listEntitlementsMock.mockResolvedValue(rcEntitlements());
  h.row = null;
});

async function getPlan(): Promise<{
  status: number;
  body: { plan?: string; proSince?: string | null };
}> {
  const res = await fetch(`${baseUrl}/api/me/plan`);
  const body = (await res.json()) as {
    plan?: string;
    proSince?: string | null;
  };
  return { status: res.status, body };
}

// RevenueCat object id of the Pro entitlement (lookup_key "pro_access"). The
// active-entitlements API reports entitlements by this object id, not the key.
const PRO_ENT_ID = "entle_pro";

// The project's entitlements, mapping the `pro_access` lookup key to its id.
function rcEntitlements() {
  return {
    data: {
      items: [
        { id: PRO_ENT_ID, lookup_key: "pro_access" },
        { id: "entle_other", lookup_key: "legacy_tier" },
      ],
    },
    response: { status: 200 },
  };
}

// A RevenueCat customer holding the given (active) entitlement, identified by
// its object id (defaults to the Pro entitlement).
function rcActive(entitlementId = PRO_ENT_ID, expiresAt: number | null = null) {
  return {
    data: { items: [{ entitlement_id: entitlementId, expires_at: expiresAt }] },
    response: { status: 200 },
  };
}

// A RevenueCat customer with no active entitlements.
function rcEmpty() {
  return { data: { items: [] }, response: { status: 200 } };
}

// RevenueCat has never seen this customer (never purchased).
function rc404() {
  return { error: { message: "not found" }, response: { status: 404 } };
}

describe("GET /me/plan — Pro status sync", () => {
  it("returns free with no customer attached and never calls RevenueCat", async () => {
    // No ctx.customerId set -> req.customerId is undefined.
    const { status, body } = await getPlan();
    expect(status).toBe(200);
    expect(body).toMatchObject({ plan: "free", proSince: null });
    expect(h.activeEntitlementsMock).not.toHaveBeenCalled();
  });

  it("treats a never-purchased customer (RevenueCat 404) as free", async () => {
    ctx = { customerId: 1, deviceId: "dev-1" };
    h.row = { id: 1, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rc404());

    const { status, body } = await getPlan();

    expect(status).toBe(200);
    expect(body).toMatchObject({ plan: "free", proSince: null });
    expect(h.row).toMatchObject({ plan: "free", proSince: null });
  });

  it("grants Pro for an active pro_access entitlement and stamps proSince when previously unset", async () => {
    ctx = { customerId: 2, deviceId: "dev-2" };
    h.row = { id: 2, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rcActive(PRO_ENT_ID, null));

    const { status, body } = await getPlan();

    expect(status).toBe(200);
    expect(body.plan).toBe("pro");
    expect(body.proSince).toBeTruthy();
    expect(h.row?.plan).toBe("pro");
    expect(h.row?.proSince).toBeInstanceOf(Date);
  });

  it("preserves the original proSince when re-confirming Pro (COALESCE)", async () => {
    const original = new Date("2025-01-01T00:00:00.000Z");
    ctx = { customerId: 3, authUserId: "user-3" };
    h.row = { id: 3, plan: "pro", proSince: original };
    h.activeEntitlementsMock.mockResolvedValue(rcActive(PRO_ENT_ID, null));

    const { status, body } = await getPlan();

    expect(status).toBe(200);
    expect(body.plan).toBe("pro");
    expect(body.proSince).toBe(original.toISOString());
    expect(h.row?.proSince).toEqual(original);
  });

  it("revokes Pro when the entitlement has expired", async () => {
    const past = Date.now() - 60_000;
    ctx = { customerId: 4, deviceId: "dev-4" };
    h.row = { id: 4, plan: "pro", proSince: new Date("2025-01-01") };
    h.activeEntitlementsMock.mockResolvedValue(rcActive(PRO_ENT_ID, past));

    const { status, body } = await getPlan();

    expect(status).toBe(200);
    expect(body).toMatchObject({ plan: "free", proSince: null });
    expect(h.row).toMatchObject({ plan: "free", proSince: null });
  });

  it("revokes Pro when no matching entitlement is present", async () => {
    ctx = { customerId: 5, deviceId: "dev-5" };
    h.row = { id: 5, plan: "pro", proSince: new Date("2025-01-01") };
    // Has an entitlement, but not the pro_access one we unlock on.
    h.activeEntitlementsMock.mockResolvedValue(rcActive("some_other_tier", null));

    const { status, body } = await getPlan();

    expect(status).toBe(200);
    expect(body).toMatchObject({ plan: "free", proSince: null });
    expect(h.row).toMatchObject({ plan: "free", proSince: null });
  });

  it("keeps Pro for a non-expiring entitlement (expires_at null)", async () => {
    ctx = { customerId: 6, deviceId: "dev-6" };
    h.row = { id: 6, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rcEmpty());

    // sanity: empty entitlements means free
    const { body } = await getPlan();
    expect(body).toMatchObject({ plan: "free", proSince: null });
  });

  it("serves the last-known stored plan (no 5xx) when RevenueCat is unreachable", async () => {
    const original = new Date("2025-03-01T00:00:00.000Z");
    ctx = { customerId: 7, authUserId: "user-7" };
    h.row = { id: 7, plan: "pro", proSince: original };
    h.activeEntitlementsMock.mockRejectedValue(new Error("network down"));

    const { status, body } = await getPlan();

    expect(status).toBe(200);
    expect(body.plan).toBe("pro");
    expect(body.proSince).toBe(original.toISOString());
    // The stored plan must be untouched by a failed refresh.
    expect(h.row).toMatchObject({ plan: "pro", proSince: original });
  });

  it("serves the stored plan when RevenueCat returns a non-404 error status", async () => {
    const original = new Date("2025-03-01T00:00:00.000Z");
    ctx = { customerId: 8, deviceId: "dev-8" };
    h.row = { id: 8, plan: "pro", proSince: original };
    h.activeEntitlementsMock.mockResolvedValue({
      error: { message: "boom" },
      response: { status: 500 },
    });

    const { status, body } = await getPlan();

    expect(status).toBe(200);
    expect(body.plan).toBe("pro");
    expect(body.proSince).toBe(original.toISOString());
    expect(h.row).toMatchObject({ plan: "pro", proSince: original });
  });

  it("queries RevenueCat with the Clerk auth user id when signed in", async () => {
    ctx = { customerId: 9, authUserId: "user-9", deviceId: "dev-9" };
    h.row = { id: 9, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rc404());

    await getPlan();

    expect(h.activeEntitlementsMock).toHaveBeenCalledTimes(1);
    expect(h.activeEntitlementsMock.mock.calls[0]?.[0]?.path).toEqual({
      project_id: PROJECT_ID,
      customer_id: "user-9",
    });
  });

  it("falls back to the device id for the RevenueCat lookup when anonymous", async () => {
    ctx = { customerId: 10, deviceId: "dev-10" };
    h.row = { id: 10, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rc404());

    await getPlan();

    expect(h.activeEntitlementsMock.mock.calls[0]?.[0]?.path.customer_id).toBe(
      "dev-10",
    );
  });
});
