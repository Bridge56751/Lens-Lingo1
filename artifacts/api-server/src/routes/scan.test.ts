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

// Route-level coverage for the free-tier DAILY scan limit enforced by POST
// /api/scan. The actual concurrency safety lives in Postgres (the reservation
// runs in a transaction that locks the customer row with SELECT … FOR UPDATE,
// recomputes the period, and writes the new count), which can't be fully
// exercised against the mocked db here. What we CAN pin down is the wiring that
// makes the limit authoritative:
//   - the gate reserves a slot inside a row-locked txn and denies (403) purely
//     on the recomputed reservation — BEFORE any expensive AI call,
//   - Pro callers skip the reservation entirely (stay unlimited),
//   - a failed persist releases the reserved slot so it isn't burned.
//
// The db is mocked (no real Postgres) and OpenAI is stubbed (no network). We
// distinguish which UPDATEs ran by the SET payload's key signature, and we
// drive the stored period via `h.storedScan`.

const h = vi.hoisted(() => ({
  // Drives customerHasPro: reconcileAndGetPlan returns the STORED row plan, so
  // this is the source of truth for free vs pro in these tests.
  plan: "free" as "free" | "pro",
  // The stored scan period the FOR UPDATE select returns. `resetsAt` far in the
  // future = an ACTIVE period; `count` at the cap (10) = deny.
  storedScan: { count: 0, resetsAt: null as string | null },
  // When true the PERSISTENCE transaction (the 2nd txn) throws, exercising the
  // release path. The reservation txn (1st) always succeeds.
  txThrows: false,
  // Counts db.transaction calls so txThrows targets only the persist (2nd) txn.
  txCalls: 0,
  // SET key signatures for every update().set(...) call, e.g.
  // "scanDayCount,scanResetsAt" (reserve) / "scanDayCount" (release) /
  // "chatCount,scanCount" (lifetime). Lets us assert which writes happened.
  setKeys: [] as string[],
  openaiCreate: vi.fn(),
  activeEntitlementsMock: vi.fn<
    () => Promise<{ data?: { items?: unknown[] }; error?: unknown; response?: { status: number } }>
  >(),
  listEntitlementsMock: vi.fn<
    () => Promise<{ data?: { items?: { id: string; lookup_key: string }[] }; error?: unknown; response?: { status: number } }>
  >(),
}));

vi.mock("@replit/revenuecat-sdk", () => ({
  listCustomerActiveEntitlements: h.activeEntitlementsMock,
  listEntitlements: h.listEntitlementsMock,
}));

vi.mock("../lib/revenueCatClient", () => ({
  getUncachableRevenueCatClient: vi.fn(async () => ({})),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: h.openaiCreate } } },
}));

// Minimal drizzle stand-in. `update().set().where()` is a thenable used by the
// reconcile / lifetime / release writes. `select()` supports BOTH shapes: the
// plan read (`.where().limit()`) and the reservation read
// (`.where().for("update").limit()` → the stored period).
vi.mock("@workspace/db", () => {
  const update = () => ({
    set: (payload: Record<string, unknown>) => {
      h.setKeys.push(Object.keys(payload).sort().join(","));
      return { where: () => Promise.resolve(undefined) };
    },
  });
  const insert = () => ({
    values: () =>
      Object.assign(Promise.resolve(undefined), {
        returning: () => Promise.resolve([{ id: 123 }]),
      }),
  });
  const select = () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ plan: h.plan, proSince: null }]),
        for: () => ({
          limit: () =>
            Promise.resolve([
              { count: h.storedScan.count, resetsAt: h.storedScan.resetsAt },
            ]),
        }),
      }),
    }),
  });
  const db = {
    update,
    insert,
    select,
    transaction: async (cb: (tx: unknown) => unknown) => {
      h.txCalls += 1;
      // 1st txn = reservation (must succeed); 2nd txn = persistence.
      if (h.txThrows && h.txCalls >= 2) throw new Error("tx failed");
      return cb({ select, insert, update });
    },
  };
  return {
    db,
    customers: {
      id: "id",
      plan: "plan",
      proSince: "proSince",
      lastSeenAt: "lastSeenAt",
      scanCount: "scanCount",
      chatCount: "chatCount",
      scanDayCount: "scanDayCount",
      scanResetsAt: "scanResetsAt",
    },
    conversations: {},
    messages: {},
  };
});

const scanRouter = (await import("./scan")).default;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.REVENUECAT_PROJECT_ID = "proj_test";
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use((req, _res, next) => {
    req.customerId = 1;
    req.deviceId = "dev-1";
    (req as unknown as { log: unknown }).log = { warn() {}, error() {}, info() {} };
    next();
  });
  app.use("/api", scanRouter);
  // Deterministic 500 for the release-on-failure case.
  app.use(
    (
      _err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: "server_error" });
    },
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
});

// Far enough out that the stored period is ALWAYS active regardless of the real
// wall-clock the test runs at.
const FUTURE = "2099-01-01T00:00:00.000Z";

beforeEach(() => {
  h.plan = "free";
  h.storedScan = { count: 0, resetsAt: null };
  h.txThrows = false;
  h.txCalls = 0;
  h.setKeys = [];
  h.openaiCreate.mockReset();
  h.openaiCreate.mockResolvedValue({
    choices: [
      {
        message: {
          content:
            '{"itemName":"perro","itemNameTranslated":"dog","pronunciation":"peh-rro"}',
        },
      },
    ],
  });
  h.activeEntitlementsMock.mockReset();
  h.listEntitlementsMock.mockReset();
  h.listEntitlementsMock.mockResolvedValue({
    data: { items: [{ id: "entle_pro", lookup_key: "pro_access" }] },
    response: { status: 200 },
  });
  // RevenueCat doesn't change the result here — the stored-row plan (h.plan)
  // does — so a 404 (never purchased) keeps reconcile a no-op.
  h.activeEntitlementsMock.mockResolvedValue({
    error: { message: "not found" },
    response: { status: 404 },
  });
});

async function postScan(): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageBase64: "dGVzdA==",
      targetLanguage: "Spanish",
      nativeLanguage: "English",
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe("POST /api/scan free-tier daily limit", () => {
  it("reserves a slot and succeeds when a free user is under the cap", async () => {
    h.storedScan = { count: 2, resetsAt: FUTURE }; // active period, under cap
    const { status, body } = await postScan();

    expect(status).toBe(201);
    expect(body.itemName).toBe("perro");
    expect(body.scanLimit).toBe(10);
    expect(body.scansUsedToday).toBe(3);
    expect(body.scansRemaining).toBe(7);
    // The reservation UPDATE ran (sets count + reset boundary together).
    expect(h.setKeys).toContain("scanDayCount,scanResetsAt");
    // AI work happened (vision + initial message).
    expect(h.openaiCreate).toHaveBeenCalled();
  });

  it("denies with 403 BEFORE any AI work when the active period is at the cap", async () => {
    h.storedScan = { count: 10, resetsAt: FUTURE }; // active period, AT cap
    const { status, body } = await postScan();

    expect(status).toBe(403);
    expect(body.error).toBe("scan_limit_reached");
    expect(body.scansRemaining).toBe(0);
    expect(body.scanLimit).toBe(10);
    // Denied without writing a reservation…
    expect(h.setKeys).not.toContain("scanDayCount,scanResetsAt");
    // …and the whole point of reserving first: no expensive AI call on a denial.
    expect(h.openaiCreate).not.toHaveBeenCalled();
  });

  it("never reserves or limits a Pro user (unlimited)", async () => {
    h.plan = "pro";
    const { status, body } = await postScan();

    expect(status).toBe(201);
    expect(body.scansRemaining).toBeNull();
    // No reservation write for Pro.
    expect(h.setKeys).not.toContain("scanDayCount,scanResetsAt");
    expect(h.openaiCreate).toHaveBeenCalled();
  });

  it("releases the reserved slot when persistence fails", async () => {
    h.storedScan = { count: 4, resetsAt: FUTURE };
    h.txThrows = true; // the persist (2nd) txn throws
    const { status } = await postScan();

    expect(status).toBe(500);
    // Reserve happened, then the release (single scanDayCount SET) compensated.
    expect(h.setKeys).toContain("scanDayCount,scanResetsAt");
    expect(h.setKeys).toContain("scanDayCount");
  });
});
