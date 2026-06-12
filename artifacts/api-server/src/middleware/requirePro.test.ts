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

// Coverage for the server-side Pro guard (`requirePro`). It mirrors the app's
// client-side Pro boundary so a paid route can't be driven by calling the API
// directly. The guard resolves entitlement via `customerHasPro`, which pulls
// from RevenueCat (mocked here) and reconciles onto the `customers` row (the db
// is mocked too, so no network/database is touched). We assert it fails closed:
// any missing customer / not-Pro / resolution error yields a 403.

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
  // The single customer row the resolver reads/writes per request.
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

// Minimal in-memory drizzle stand-in mirroring the one in revenuecat.test.ts.
// The resolver only does update(...).set(...).where(...) and
// select({...}).from(customers).where(...).limit(1) against the single row.
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

import { requirePro } from "./customer";

const PROJECT_ID = "proj_test";

let server: Server;
let baseUrl: string;
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
  app.get("/protected", requirePro, (_req, res) => {
    res.json({ ok: true });
  });
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

async function callProtected(): Promise<{
  status: number;
  body: { ok?: boolean; error?: string } | null;
}> {
  const res = await fetch(`${baseUrl}/protected`);
  let body: { ok?: boolean; error?: string } | null = null;
  try {
    body = (await res.json()) as { ok?: boolean; error?: string };
  } catch {
    body = null;
  }
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

// A RevenueCat customer holding the active Pro entitlement (by its object id).
function rcActive() {
  return {
    data: { items: [{ entitlement_id: PRO_ENT_ID, expires_at: null }] },
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

describe("requirePro — server-side Pro enforcement", () => {
  it("rejects with 403 when no customer is attached and never calls RevenueCat", async () => {
    // No ctx.customerId -> req.customerId is undefined.
    const { status, body } = await callProtected();
    expect(status).toBe(403);
    expect(body).toEqual({ error: "pro_required" });
    expect(h.activeEntitlementsMock).not.toHaveBeenCalled();
  });

  it("rejects with 403 a free customer (RevenueCat 404, never purchased)", async () => {
    ctx = { customerId: 1, deviceId: "dev-1" };
    h.row = { id: 1, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rc404());

    const { status, body } = await callProtected();

    expect(status).toBe(403);
    expect(body).toEqual({ error: "pro_required" });
  });

  it("rejects with 403 a customer with no active entitlement", async () => {
    ctx = { customerId: 2, deviceId: "dev-2" };
    h.row = { id: 2, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rcEmpty());

    const { status, body } = await callProtected();

    expect(status).toBe(403);
    expect(body).toEqual({ error: "pro_required" });
  });

  it("allows access and refreshes a stale free row to Pro when RevenueCat reports an active entitlement", async () => {
    ctx = { customerId: 3, deviceId: "dev-3" };
    // Stored plan is stale (free) but the entitlement is now active.
    h.row = { id: 3, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rcActive());

    const { status, body } = await callProtected();

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    // The reconcile must have flipped the stored row to Pro.
    expect(h.row?.plan).toBe("pro");
    expect(h.row?.proSince).toBeInstanceOf(Date);
  });

  it("serves stored Pro (allows access) when RevenueCat is unreachable", async () => {
    ctx = { customerId: 4, deviceId: "dev-4" };
    h.row = { id: 4, plan: "pro", proSince: new Date("2025-01-01") };
    h.activeEntitlementsMock.mockRejectedValue(new Error("network down"));

    const { status, body } = await callProtected();

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
    // A failed refresh must not downgrade the stored plan.
    expect(h.row).toMatchObject({ plan: "pro" });
  });

  it("rejects with 403 a stored-free customer when RevenueCat is unreachable", async () => {
    ctx = { customerId: 5, deviceId: "dev-5" };
    h.row = { id: 5, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockRejectedValue(new Error("network down"));

    const { status, body } = await callProtected();

    expect(status).toBe(403);
    expect(body).toEqual({ error: "pro_required" });
  });

  it("looks up RevenueCat by the Clerk auth user id when signed in", async () => {
    ctx = { customerId: 6, authUserId: "user-6", deviceId: "dev-6" };
    h.row = { id: 6, plan: "free", proSince: null };
    h.activeEntitlementsMock.mockResolvedValue(rcActive());

    const { status } = await callProtected();

    expect(status).toBe(200);
    expect(h.activeEntitlementsMock.mock.calls[0]?.[0]?.path).toEqual({
      project_id: PROJECT_ID,
      customer_id: "user-6",
    });
  });
});
