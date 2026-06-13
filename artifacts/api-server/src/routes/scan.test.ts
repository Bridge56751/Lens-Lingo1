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
// /api/scan. The actual concurrency safety lives in Postgres (a single
// conditional UPDATE that increments only while under the cap), which can't be
// exercised against the mocked db here. What we CAN pin down is the wiring that
// makes the limit authoritative:
//   - the gate reserves a slot via that conditional UPDATE and denies (403)
//     purely on its result — BEFORE any expensive AI call,
//   - Pro callers skip the reservation entirely (stay unlimited),
//   - a failed persist releases the reserved slot so it isn't burned.
//
// The db is mocked (no real Postgres) and OpenAI is stubbed (no network). We
// distinguish which UPDATEs ran by the SET payload's key signature.

const h = vi.hoisted(() => ({
  // Drives customerHasPro: reconcileAndGetPlan returns the STORED row plan, so
  // this is the source of truth for free vs pro in these tests.
  plan: "free" as "free" | "pro",
  // What the reservation's `.returning()` yields: one row = reserved (under the
  // cap), empty = at the cap (deny).
  reserved: [] as { scanDayCount: number }[],
  // When true the persistence transaction throws, exercising the release path.
  txThrows: false,
  // SET key signatures for every update().set(...) call, e.g.
  // "scanDayCount,scanDayKey" (reserve) / "scanDayCount" (release) /
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

// Minimal drizzle stand-in. A thenable that ALSO exposes `.returning()` so the
// same update().set().where() chain serves both the awaited writes (reconcile,
// lifetime counters, release) and the reservation (which reads `.returning()`).
vi.mock("@workspace/db", () => {
  const whereResult = () => {
    const base = Promise.resolve(undefined);
    return {
      returning: () => Promise.resolve(h.reserved),
      then: base.then.bind(base),
      catch: base.catch.bind(base),
      finally: base.finally.bind(base),
    };
  };
  const update = () => ({
    set: (payload: Record<string, unknown>) => {
      h.setKeys.push(Object.keys(payload).sort().join(","));
      return { where: () => whereResult() };
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
      }),
    }),
  });
  const db = {
    update,
    insert,
    select,
    transaction: async (cb: (tx: unknown) => unknown) => {
      if (h.txThrows) throw new Error("tx failed");
      return cb({ insert, update });
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
      scanDayKey: "scanDayKey",
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

beforeEach(() => {
  h.plan = "free";
  h.reserved = [];
  h.txThrows = false;
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
    h.reserved = [{ scanDayCount: 3 }];
    const { status, body } = await postScan();

    expect(status).toBe(201);
    expect(body.itemName).toBe("perro");
    expect(body.scanLimit).toBe(10);
    expect(body.scansUsedToday).toBe(3);
    expect(body.scansRemaining).toBe(7);
    // The conditional reservation UPDATE ran (sets count + day key together).
    expect(h.setKeys).toContain("scanDayCount,scanDayKey");
    // AI work happened (vision + initial message).
    expect(h.openaiCreate).toHaveBeenCalled();
  });

  it("denies with 403 BEFORE any AI work when the reservation returns no row", async () => {
    h.reserved = []; // at the cap → conditional UPDATE matches nothing
    const { status, body } = await postScan();

    expect(status).toBe(403);
    expect(body.error).toBe("scan_limit_reached");
    expect(body.scansRemaining).toBe(0);
    expect(body.scanLimit).toBe(10);
    // The whole point of reserving first: no expensive AI call on a denial.
    expect(h.openaiCreate).not.toHaveBeenCalled();
  });

  it("never reserves or limits a Pro user (unlimited)", async () => {
    h.plan = "pro";
    const { status, body } = await postScan();

    expect(status).toBe(201);
    expect(body.scansRemaining).toBeNull();
    // No reservation write for Pro.
    expect(h.setKeys).not.toContain("scanDayCount,scanDayKey");
    expect(h.openaiCreate).toHaveBeenCalled();
  });

  it("releases the reserved slot when persistence fails", async () => {
    h.reserved = [{ scanDayCount: 5 }];
    h.txThrows = true;
    const { status } = await postScan();

    expect(status).toBe(500);
    // Reserve happened, then the release (single scanDayCount SET) compensated.
    expect(h.setKeys).toContain("scanDayCount,scanDayKey");
    expect(h.setKeys).toContain("scanDayCount");
  });
});
