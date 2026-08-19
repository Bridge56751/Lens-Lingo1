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

// Route-level coverage for the AI-backed vocab endpoints:
//   POST /api/vocab/search  — word search + translation
//   POST /api/vocab/example — example sentence generation
//   POST /api/vocab/check   — feedback on the learner's own sentence
//
// Pins down the paths that could silently regress:
//   - input validation (missing/invalid fields → 400) BEFORE any budget
//     reservation or AI work,
//   - malformed model JSON → safe behaviour (502 for search/example, since
//     nothing useful can be returned; check falls back on partial data),
//   - OpenAI budget exceeded → 503,
//   - search result dedupe, level fallback, cap at 8, and entry filtering.
//
// OpenAI is stubbed — no network. The db and the Pro guard are mocked out:
// Pro enforcement and db-backed routes have their own suites.

const h = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  budgetExceeded: false,
  reserveCalls: [] as string[],
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    audio: { transcriptions: { create: vi.fn() } },
    chat: { completions: { create: h.chatCreate } },
  },
  toFile: vi.fn(),
}));

vi.mock("../lib/openaiBudget", () => ({
  reserveOpenAiBudget: vi.fn(async (kind: string) => {
    h.reserveCalls.push(kind);
    if (h.budgetExceeded) {
      const err = new Error("budget exceeded") as Error & { code: string };
      err.code = "openai_budget_exceeded";
      throw err;
    }
  }),
  isOpenAiBudgetExceeded: vi.fn(
    (err: unknown) =>
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "openai_budget_exceeded",
  ),
  sendOpenAiBudgetExceeded: vi.fn((res: express.Response) => {
    res.status(503).json({ error: "openai_budget_exceeded" });
  }),
}));

// These routes never touch the db, but the vocab router module imports it —
// keep the mock inert.
vi.mock("@workspace/db", () => ({
  db: {},
  vocabBank: {},
  vocabSelections: {},
}));

// Pro enforcement is covered by its own suites — pass through here.
vi.mock("../middleware/customer", () => ({
  requirePro: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

const vocabRouter = (await import("./vocab")).default;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.customerId = 1;
    req.deviceId = "dev-1";
    (req as unknown as { log: unknown }).log = { warn() {}, error() {}, info() {} };
    next();
  });
  app.use("/api", vocabRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
});

async function post(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function modelReply(content: string) {
  h.chatCreate.mockResolvedValue({ choices: [{ message: { content } }] });
}

beforeEach(() => {
  h.budgetExceeded = false;
  h.reserveCalls = [];
  h.chatCreate.mockReset();
});

// ---------------------------------------------------------------------------
// POST /vocab/search
// ---------------------------------------------------------------------------

const SEARCH_BODY = {
  query: "dog",
  targetLanguage: "Spanish",
  nativeLanguage: "English",
};

describe("POST /api/vocab/search input validation", () => {
  it.each([
    ["missing query", { ...SEARCH_BODY, query: undefined }],
    ["blank query", { ...SEARCH_BODY, query: "   " }],
    ["missing targetLanguage", { ...SEARCH_BODY, targetLanguage: undefined }],
    ["unsupported targetLanguage", { ...SEARCH_BODY, targetLanguage: "Klingon" }],
    ["non-string targetLanguage", { ...SEARCH_BODY, targetLanguage: 42 }],
    ["missing nativeLanguage", { ...SEARCH_BODY, nativeLanguage: undefined }],
    ["unsupported nativeLanguage", { ...SEARCH_BODY, nativeLanguage: "Elvish" }],
  ])("rejects %s with 400 before any AI work", async (_label, body) => {
    const { status, body: json } = await post("/vocab/search", body);

    expect(status).toBe(400);
    expect(json.error).toContain("required");
    expect(h.reserveCalls).toHaveLength(0);
    expect(h.chatCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/vocab/search result shaping", () => {
  it("returns the model's results and reserves the search budget", async () => {
    modelReply(
      '{"results":[{"word":"perro","translation":"dog","level":"beginner"},{"word":"cachorro","translation":"puppy","level":"intermediate"}]}',
    );
    const { status, body } = await post("/vocab/search", SEARCH_BODY);

    expect(status).toBe(200);
    expect(body.results).toEqual([
      { word: "perro", translation: "dog", level: "beginner" },
      { word: "cachorro", translation: "puppy", level: "intermediate" },
    ]);
    expect(h.reserveCalls).toEqual(["vocab_search"]);
  });

  it("dedupes case-insensitive duplicate words, keeping the first", async () => {
    modelReply(
      '{"results":[{"word":"Perro","translation":"dog","level":"beginner"},{"word":"perro","translation":"dog (dup)","level":"advanced"},{"word":"gato","translation":"cat","level":"beginner"}]}',
    );
    const { body } = await post("/vocab/search", SEARCH_BODY);

    expect(body.results).toEqual([
      { word: "Perro", translation: "dog", level: "beginner" },
      { word: "gato", translation: "cat", level: "beginner" },
    ]);
  });

  it("falls back to beginner for unknown/missing levels and normalizes case", async () => {
    modelReply(
      '{"results":[{"word":"a","translation":"x","level":"legendary"},{"word":"b","translation":"y"},{"word":"c","translation":"z","level":"EXPERT"}]}',
    );
    const { body } = await post("/vocab/search", SEARCH_BODY);

    expect(body.results.map((r: any) => r.level)).toEqual([
      "beginner",
      "beginner",
      "expert",
    ]);
  });

  it("drops entries missing a word or translation", async () => {
    modelReply(
      '{"results":[{"word":"","translation":"dog","level":"beginner"},{"word":"perro","translation":"","level":"beginner"},{"translation":"dog"},{"word":"gato","translation":"cat","level":"beginner"}]}',
    );
    const { body } = await post("/vocab/search", SEARCH_BODY);

    expect(body.results).toEqual([
      { word: "gato", translation: "cat", level: "beginner" },
    ]);
  });

  it("caps the result list at 8 entries", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      word: `word${i}`,
      translation: `t${i}`,
      level: "beginner",
    }));
    modelReply(JSON.stringify({ results: many }));
    const { body } = await post("/vocab/search", SEARCH_BODY);

    expect(body.results).toHaveLength(8);
    expect(body.results[0].word).toBe("word0");
  });

  it("returns empty results when the model JSON has no results array", async () => {
    modelReply('{"unexpected":"shape"}');
    const { status, body } = await post("/vocab/search", SEARCH_BODY);

    expect(status).toBe(200);
    expect(body.results).toEqual([]);
  });

  it("returns empty results when the model returns no JSON at all", async () => {
    modelReply("Sorry, I cannot help with that.");
    const { status, body } = await post("/vocab/search", SEARCH_BODY);

    expect(status).toBe(200);
    expect(body.results).toEqual([]);
  });
});

describe("POST /api/vocab/search failure handling", () => {
  it("returns 502 when the model returns syntactically broken JSON", async () => {
    modelReply('{"results": [},');
    const { status, body } = await post("/vocab/search", SEARCH_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not search words");
  });

  it("returns 502 when the OpenAI call itself fails", async () => {
    h.chatCreate.mockRejectedValue(new Error("model down"));
    const { status, body } = await post("/vocab/search", SEARCH_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not search words");
  });

  it("returns 503 when the OpenAI budget cap is reached, before any AI call", async () => {
    h.budgetExceeded = true;
    const { status, body } = await post("/vocab/search", SEARCH_BODY);

    expect(status).toBe(503);
    expect(body.error).toBe("openai_budget_exceeded");
    expect(h.chatCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /vocab/example
// ---------------------------------------------------------------------------

const EXAMPLE_BODY = {
  word: "perro",
  targetLanguage: "Spanish",
  nativeLanguage: "English",
};

describe("POST /api/vocab/example input validation", () => {
  it.each([
    ["missing word", { ...EXAMPLE_BODY, word: undefined }],
    ["blank word", { ...EXAMPLE_BODY, word: "   " }],
    ["missing targetLanguage", { ...EXAMPLE_BODY, targetLanguage: undefined }],
    ["unsupported targetLanguage", { ...EXAMPLE_BODY, targetLanguage: "Klingon" }],
    ["missing nativeLanguage", { ...EXAMPLE_BODY, nativeLanguage: undefined }],
    ["unsupported nativeLanguage", { ...EXAMPLE_BODY, nativeLanguage: "Elvish" }],
  ])("rejects %s with 400 before any AI work", async (_label, body) => {
    const { status, body: json } = await post("/vocab/example", body);

    expect(status).toBe(400);
    expect(json.error).toContain("required");
    expect(h.reserveCalls).toHaveLength(0);
    expect(h.chatCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/vocab/example generation paths", () => {
  it("returns the generated sentence and translation", async () => {
    modelReply(
      '{"sentence":"El perro corre en el parque.","translation":"The dog runs in the park."}',
    );
    const { status, body } = await post("/vocab/example", EXAMPLE_BODY);

    expect(status).toBe(200);
    expect(body).toEqual({
      sentence: "El perro corre en el parque.",
      translation: "The dog runs in the park.",
    });
    expect(h.reserveCalls).toEqual(["vocab_example"]);
  });

  it("returns 502 when the model reply has no usable sentence", async () => {
    modelReply('{"translation":"only a translation"}');
    const { status, body } = await post("/vocab/example", EXAMPLE_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not generate an example");
  });

  it("returns 502 when the model returns no JSON at all", async () => {
    modelReply("Here is a sentence: El perro corre.");
    const { status, body } = await post("/vocab/example", EXAMPLE_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not generate an example");
  });

  it("returns 502 when the model returns syntactically broken JSON", async () => {
    modelReply('{"sentence":"El perro');
    const { status, body } = await post("/vocab/example", EXAMPLE_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not generate an example");
  });

  it("returns 502 when the OpenAI call itself fails", async () => {
    h.chatCreate.mockRejectedValue(new Error("model down"));
    const { status, body } = await post("/vocab/example", EXAMPLE_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not generate an example");
  });

  it("returns 503 when the OpenAI budget cap is reached, before any AI call", async () => {
    h.budgetExceeded = true;
    const { status, body } = await post("/vocab/example", EXAMPLE_BODY);

    expect(status).toBe(503);
    expect(body.error).toBe("openai_budget_exceeded");
    expect(h.chatCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /vocab/check
// ---------------------------------------------------------------------------

const CHECK_BODY = {
  word: "perro",
  sentence: "El perro corre en el parque.",
  targetLanguage: "Spanish",
  nativeLanguage: "English",
};

describe("POST /api/vocab/check input validation", () => {
  it.each([
    ["missing word", { ...CHECK_BODY, word: undefined }],
    ["blank word", { ...CHECK_BODY, word: "   " }],
    ["missing sentence", { ...CHECK_BODY, sentence: undefined }],
    ["blank sentence", { ...CHECK_BODY, sentence: "   " }],
    ["missing targetLanguage", { ...CHECK_BODY, targetLanguage: undefined }],
    ["unsupported targetLanguage", { ...CHECK_BODY, targetLanguage: "Klingon" }],
    ["missing nativeLanguage", { ...CHECK_BODY, nativeLanguage: undefined }],
    ["unsupported nativeLanguage", { ...CHECK_BODY, nativeLanguage: "Elvish" }],
  ])("rejects %s with 400 before any AI work", async (_label, body) => {
    const { status, body: json } = await post("/vocab/check", body);

    expect(status).toBe(400);
    expect(json.error).toContain("required");
    expect(h.reserveCalls).toHaveLength(0);
    expect(h.chatCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/vocab/check feedback paths", () => {
  it("passes through a correct verdict with feedback and correction", async () => {
    modelReply(
      '{"correct": true, "feedback": "Well done!", "correction": "El perro corre en el parque."}',
    );
    const { status, body } = await post("/vocab/check", CHECK_BODY);

    expect(status).toBe(200);
    expect(body).toEqual({
      correct: true,
      feedback: "Well done!",
      correction: "El perro corre en el parque.",
    });
    expect(h.reserveCalls).toEqual(["vocab_check"]);
  });

  it("treats a non-boolean 'correct' as false", async () => {
    modelReply('{"correct": "yes", "feedback": "hmm", "correction": "x"}');
    const { body } = await post("/vocab/check", CHECK_BODY);

    expect(body.correct).toBe(false);
  });

  it("falls back to a default feedback string when the model omits it", async () => {
    modelReply('{"correct": true, "correction": "El perro corre."}');
    const { status, body } = await post("/vocab/check", CHECK_BODY);

    expect(status).toBe(200);
    expect(body).toEqual({
      correct: true,
      feedback: "Nice try!",
      correction: "El perro corre.",
    });
  });

  it("returns safe defaults when the model returns no JSON at all", async () => {
    modelReply("I cannot grade that sentence.");
    const { status, body } = await post("/vocab/check", CHECK_BODY);

    expect(status).toBe(200);
    expect(body).toEqual({ correct: false, feedback: "Nice try!", correction: "" });
  });

  it("returns 502 when the model returns syntactically broken JSON", async () => {
    modelReply('{"correct": true,}');
    const { status, body } = await post("/vocab/check", CHECK_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not check the sentence");
  });

  it("returns 502 when the OpenAI call itself fails", async () => {
    h.chatCreate.mockRejectedValue(new Error("model down"));
    const { status, body } = await post("/vocab/check", CHECK_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not check the sentence");
  });

  it("returns 503 when the OpenAI budget cap is reached, before any AI call", async () => {
    h.budgetExceeded = true;
    const { status, body } = await post("/vocab/check", CHECK_BODY);

    expect(status).toBe(503);
    expect(body.error).toBe("openai_budget_exceeded");
    expect(h.chatCreate).not.toHaveBeenCalled();
  });
});
