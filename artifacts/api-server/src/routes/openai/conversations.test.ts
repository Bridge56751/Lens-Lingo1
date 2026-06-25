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

// Route-level coverage for POST /api/openai/conversations/chat (start a free
// "just chat" tutor conversation). The behaviour we pin down here is the
// abandoned-tap cancellation: when the caller disconnects while the (slow)
// opening message is still being generated, the route must abort the OpenAI
// call and persist NOTHING — no conversation, no messages, no usage increment.
// A normal request still creates the chat and bumps the chat counter.
//
// The db is mocked (no real Postgres) and OpenAI is stubbed (no network). We
// track conversation/message inserts and the SET key signatures of every
// update so we can assert exactly which writes happened.

const h = vi.hoisted(() => ({
  // db.transaction invocations — the chat is created inside one transaction.
  txCalls: 0,
  // insert(conversations).values(...) / insert(messages).values(...) counts.
  convInserts: 0,
  msgInserts: 0,
  // SET key signatures for every update().set(...) — e.g. "chatCount".
  setKeys: [] as string[],
  openaiCreate: vi.fn(),
  // Resolved by the abort test's OpenAI stub once the request has reached the
  // server and is awaiting the model, so the client can disconnect at the exact
  // in-flight moment (no arbitrary sleeps to race the request in).
  openaiEntered: undefined as undefined | (() => void),
}));

// Pro gate: the chat route is Pro-only. Short-circuit the entitlement check so
// the route is reachable (and we don't pull in RevenueCat).
vi.mock("../../lib/plan", () => ({
  customerHasPro: vi.fn(async () => true),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: h.openaiCreate } } },
  toFile: vi.fn(),
}));

// Minimal drizzle stand-in. We tag the conversations/messages tables with
// sentinel objects so insert() can tell them apart and count each.
vi.mock("@workspace/db", () => {
  const CONVERSATIONS = { __table: "conversations" };
  const MESSAGES = { __table: "messages" };
  const insert = (table: unknown) => ({
    values: (_vals: unknown) => {
      if (table === CONVERSATIONS) h.convInserts += 1;
      if (table === MESSAGES) h.msgInserts += 1;
      return Object.assign(Promise.resolve(undefined), {
        returning: () => Promise.resolve([{ id: 777 }]),
      });
    },
  });
  const update = (_table: unknown) => ({
    set: (payload: Record<string, unknown>) => {
      h.setKeys.push(Object.keys(payload).sort().join(","));
      return { where: () => Promise.resolve(undefined) };
    },
  });
  const db = {
    insert,
    update,
    transaction: async (cb: (tx: unknown) => unknown) => {
      h.txCalls += 1;
      return cb({ insert, update });
    },
  };
  return {
    db,
    conversations: CONVERSATIONS,
    messages: MESSAGES,
    customers: { id: "id", chatCount: "chatCount" },
  };
});

const conversationsRouter = (await import("./conversations")).default;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use((req, _res, next) => {
    req.customerId = 1;
    req.deviceId = "dev-1";
    (req as unknown as { log: unknown }).log = { warn() {}, error() {}, info() {} };
    next();
  });
  app.use("/api", conversationsRouter);

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
  h.txCalls = 0;
  h.convInserts = 0;
  h.msgInserts = 0;
  h.setKeys = [];
  h.openaiEntered = undefined;
  h.openaiCreate.mockReset();
});

function makeAbortError(): Error {
  const err = new Error("Request was aborted.");
  err.name = "AbortError";
  return err;
}

describe("POST /openai/conversations/chat", () => {
  it("creates a conversation and increments chat usage on a normal request", async () => {
    h.openaiCreate.mockResolvedValue({
      choices: [{ message: { content: "¡Hola! Vamos a practicar." } }],
    });

    const res = await fetch(`${baseUrl}/api/openai/conversations/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage: "Spanish", nativeLanguage: "English" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { conversationId: number };
    expect(body.conversationId).toBe(777);
    expect(h.txCalls).toBe(1);
    expect(h.convInserts).toBe(1);
    expect(h.msgInserts).toBe(1);
    expect(h.setKeys).toContain("chatCount");
  });

  it("persists nothing when the caller disconnects before the opening message is ready", async () => {
    // The model "hangs" until the request is aborted, mirroring a slow opening
    // message the user tabs away from. The stub rejects with an AbortError the
    // moment the route's AbortSignal fires.
    const entered = new Promise<void>((resolve) => {
      h.openaiEntered = resolve;
    });
    h.openaiCreate.mockImplementation((_body: unknown, opts?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const signal = opts?.signal;
        const fail = () => reject(makeAbortError());
        if (signal?.aborted) {
          fail();
          return;
        }
        signal?.addEventListener("abort", fail);
        h.openaiEntered?.();
      });
    });

    const controller = new AbortController();
    const outcome = fetch(`${baseUrl}/api/openai/conversations/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage: "Spanish", nativeLanguage: "English" }),
      signal: controller.signal,
    })
      .then(() => "resolved")
      .catch((e: { name?: string }) => (e?.name === "AbortError" ? "aborted" : "error"));

    // Wait until the request is in-flight inside openai.create, then disconnect.
    await entered;
    controller.abort();
    await outcome;

    // Let the server observe the socket close → abort the model call → hit the
    // catch's early return before any DB write.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(h.txCalls).toBe(0);
    expect(h.convInserts).toBe(0);
    expect(h.msgInserts).toBe(0);
    expect(h.setKeys).not.toContain("chatCount");
  });
});
