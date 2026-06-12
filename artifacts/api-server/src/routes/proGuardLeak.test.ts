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

// Regression test for a cross-router middleware leak.
//
// The vocab + vocabulary routers gate themselves with requirePro. They are
// mounted WITHOUT a path prefix in routes/index.ts (`router.use(vocabRouter)`),
// so an unpathed `router.use(requirePro)` inside them runs for EVERY /api
// request that flows through — 403ing sibling routers' FREE routes (the
// conversations list, /me/plan) that happen to be mounted after them. Scoping
// the guard to each router's own path ("/vocab" / "/vocabulary") confines it.
//
// This test mounts the REAL routers the same way index.ts does and asserts a
// free sibling route mounted AFTER them is reachable by a non-Pro caller, while
// the vocab/vocabulary routes themselves still return 403. It fails if the
// guard is ever reverted to an unpathed `router.use(requirePro)`.

const h = vi.hoisted(() => ({
  getCustomerMock:
    vi.fn<
      () => Promise<{
        data?: { active_entitlements?: { items?: unknown[] } };
        error?: unknown;
        response?: { status: number };
      }>
    >(),
  row: { id: 1, plan: "free" as "free" | "pro", proSince: null as Date | null },
}));

vi.mock("@replit/revenuecat-sdk", () => ({
  getCustomer: h.getCustomerMock,
}));

vi.mock("../lib/revenueCatClient", () => ({
  getUncachableRevenueCatClient: vi.fn(async () => ({})),
}));

// vocab.ts pulls the OpenAI client at import time; stub it (handlers never run
// for a non-Pro caller — requirePro short-circuits first).
vi.mock("@workspace/integrations-openai-ai-server", () => ({ openai: {} }));

// Minimal drizzle stand-in. Only plan.ts touches it for a non-Pro caller
// (update().set().where() + select().from().where().limit()); the route
// handlers never run. The extra table exports just satisfy module-load imports.
vi.mock("@workspace/db", () => {
  const db = {
    update() {
      return { set() {
        return { where() { return Promise.resolve(); } };
      } };
    },
    select() {
      return { from() {
        return { where() {
          return { limit() {
            return Promise.resolve([{ plan: h.row.plan, proSince: h.row.proSince }]);
          } };
        } };
      } };
    },
  };
  return {
    db,
    customers: { id: "customers.id", plan: "customers.plan", proSince: "customers.proSince" },
    vocabBank: {},
    vocabSelections: {},
    conversations: {},
    messages: {},
  };
});

const vocabRouter = (await import("./vocab")).default;
const vocabularyRouter = (await import("./vocabulary")).default;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.REVENUECAT_PROJECT_ID = "proj_test";
  const app = express();
  // A non-Pro customer is attached to every request.
  app.use((req, _res, next) => {
    req.customerId = 1;
    req.deviceId = "dev-1";
    (req as unknown as { log: unknown }).log = {
      warn() {},
      error() {},
      info() {},
    };
    next();
  });

  // Mirror routes/index.ts: the guarded routers are mounted with NO path
  // prefix, BEFORE a free sibling route.
  const api = express.Router();
  api.use(vocabRouter);
  api.use(vocabularyRouter);
  api.get("/openai/conversations", (_req, res) => res.json({ free: true }));
  app.use("/api", api);

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
  h.row = { id: 1, plan: "free", proSince: null };
  h.getCustomerMock.mockReset();
  // RevenueCat has never seen this customer -> not Pro.
  h.getCustomerMock.mockResolvedValue({
    error: { message: "not found" },
    response: { status: 404 },
  });
});

async function get(path: string): Promise<number> {
  const res = await fetch(`${baseUrl}${path}`);
  // Drain the body so the socket is freed.
  await res.text().catch(() => undefined);
  return res.status;
}

describe("requirePro must not leak onto sibling routers", () => {
  it("does not gate a FREE sibling route mounted after the vocab routers", async () => {
    // This is the regression: with an unpathed router.use(requirePro) this
    // returned 403 (the guard fired before the request reached this route).
    expect(await get("/api/openai/conversations")).toBe(200);
  });

  it("still gates the vocabulary route for a non-Pro caller", async () => {
    expect(await get("/api/vocabulary")).toBe(403);
  });

  it("still gates the vocab routes for a non-Pro caller", async () => {
    expect(await get("/api/vocab/bank?targetLanguage=Spanish&nativeLanguage=English")).toBe(403);
  });
});
