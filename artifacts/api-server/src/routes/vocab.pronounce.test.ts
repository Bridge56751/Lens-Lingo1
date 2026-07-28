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

// Route-level coverage for POST /api/vocab/pronounce (transcribe + AI grade).
// Pins down the paths that could silently regress:
//   - input validation (missing/invalid fields → 400),
//   - audio payload validation (invalid → 400, oversized → 413) BEFORE any
//     budget reservation or AI work,
//   - the empty-transcript short-circuit ({correct:false, score:0, heard:""}
//     without a grading call),
//   - malformed model JSON → safe defaults (correct:false, score:0),
//   - score clamping to [0, 100],
//   - OpenAI budget exceeded → 503.
//
// OpenAI (transcription + chat) is stubbed — no network. The db and the Pro
// guard are mocked out: Pro enforcement has its own suites; this one is about
// the pronounce handler itself.

const h = vi.hoisted(() => ({
  transcriptionsCreate: vi.fn(),
  chatCreate: vi.fn(),
  budgetExceeded: false,
  reserveCalls: [] as string[],
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    audio: { transcriptions: { create: h.transcriptionsCreate } },
    chat: { completions: { create: h.chatCreate } },
  },
  toFile: vi.fn(async (buffer: Buffer, name: string) => ({ buffer, name })),
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

// The pronounce route never touches the db, but the vocab router module does
// import it — keep the mock inert.
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
  app.use(express.json({ limit: "25mb" }));
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

// Minimal valid WAV payload: "RIFF" + size + "WAVE".
function wavBase64(extraBytes = 0): string {
  const buf = Buffer.alloc(12 + extraBytes);
  buf.write("RIFF", 0, "ascii");
  buf.write("WAVE", 8, "ascii");
  return buf.toString("base64");
}

const GOOD_BODY = {
  audioBase64: wavBase64(),
  word: "perro",
  targetLanguage: "Spanish",
  nativeLanguage: "English",
};

async function postPronounce(
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/vocab/pronounce`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

beforeEach(() => {
  h.budgetExceeded = false;
  h.reserveCalls = [];
  h.transcriptionsCreate.mockReset();
  h.chatCreate.mockReset();
  h.transcriptionsCreate.mockResolvedValue({ text: "perro" });
  h.chatCreate.mockResolvedValue({
    choices: [
      {
        message: {
          content: '{"correct": true, "score": 92, "feedback": "Great job!"}',
        },
      },
    ],
  });
});

describe("POST /api/vocab/pronounce input validation", () => {
  it.each([
    ["missing audioBase64", { ...GOOD_BODY, audioBase64: undefined }],
    ["missing word", { ...GOOD_BODY, word: undefined }],
    ["blank word", { ...GOOD_BODY, word: "   " }],
    ["missing targetLanguage", { ...GOOD_BODY, targetLanguage: undefined }],
    ["unsupported targetLanguage", { ...GOOD_BODY, targetLanguage: "Klingon" }],
    ["non-string targetLanguage", { ...GOOD_BODY, targetLanguage: 42 }],
    ["missing nativeLanguage", { ...GOOD_BODY, nativeLanguage: undefined }],
    ["unsupported nativeLanguage", { ...GOOD_BODY, nativeLanguage: "Elvish" }],
  ])("rejects %s with 400 before any AI work", async (_label, body) => {
    const { status, body: json } = await postPronounce(body);

    expect(status).toBe(400);
    expect(json.error).toContain("required");
    expect(h.reserveCalls).toHaveLength(0);
    expect(h.transcriptionsCreate).not.toHaveBeenCalled();
    expect(h.chatCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/vocab/pronounce audio validation", () => {
  it("rejects non-base64 audio with 400 invalid_media before AI work", async () => {
    const { status, body } = await postPronounce({
      ...GOOD_BODY,
      audioBase64: "not base64!!!",
    });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_media");
    expect(h.reserveCalls).toHaveLength(0);
    expect(h.transcriptionsCreate).not.toHaveBeenCalled();
  });

  it("rejects valid base64 that is not a supported audio format with 400", async () => {
    const { status, body } = await postPronounce({
      ...GOOD_BODY,
      audioBase64: Buffer.from("just some plain text").toString("base64"),
    });

    expect(status).toBe(400);
    expect(body.error).toBe("invalid_media");
    expect(h.transcriptionsCreate).not.toHaveBeenCalled();
  });

  it("rejects oversized audio with 413 payload_too_large before AI work", async () => {
    // One byte over the 5,250,000-byte cap.
    const { status, body } = await postPronounce({
      ...GOOD_BODY,
      audioBase64: wavBase64(5_250_000 - 12 + 1),
    });

    expect(status).toBe(413);
    expect(body.error).toBe("payload_too_large");
    expect(h.reserveCalls).toHaveLength(0);
    expect(h.transcriptionsCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/vocab/pronounce grading paths", () => {
  it("grades a recognized attempt and passes the transcript through", async () => {
    const { status, body } = await postPronounce(GOOD_BODY);

    expect(status).toBe(200);
    expect(body).toEqual({
      correct: true,
      score: 92,
      heard: "perro",
      feedback: "Great job!",
    });
    expect(h.reserveCalls).toEqual(["vocab_pronounce", "vocab_pronounce_grade"]);
  });

  it("short-circuits an empty transcript without a grading call", async () => {
    h.transcriptionsCreate.mockResolvedValue({ text: "   " });
    const { status, body } = await postPronounce(GOOD_BODY);

    expect(status).toBe(200);
    expect(body).toEqual({ correct: false, score: 0, heard: "", feedback: "" });
    expect(h.chatCreate).not.toHaveBeenCalled();
    expect(h.reserveCalls).toEqual(["vocab_pronounce"]);
  });

  it("falls back to safe defaults when the model returns no JSON at all", async () => {
    h.chatCreate.mockResolvedValue({
      choices: [{ message: { content: "Sorry, I cannot grade that." } }],
    });
    const { status, body } = await postPronounce(GOOD_BODY);

    expect(status).toBe(200);
    expect(body).toEqual({ correct: false, score: 0, heard: "perro", feedback: "" });
  });

  it("falls back to safe defaults when the model returns syntactically broken JSON", async () => {
    h.chatCreate.mockResolvedValue({
      choices: [
        { message: { content: '{"correct": true, "score": 92, "feedback": "unterminated' } },
      ],
    });
    const { status, body } = await postPronounce(GOOD_BODY);

    expect(status).toBe(200);
    expect(body).toEqual({ correct: false, score: 0, heard: "perro", feedback: "" });
  });

  it("falls back to safe defaults when the model JSON has wrong types", async () => {
    h.chatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"correct": "yes", "score": "ninety", "feedback": 7}',
          },
        },
      ],
    });
    const { status, body } = await postPronounce(GOOD_BODY);

    expect(status).toBe(200);
    expect(body.correct).toBe(false);
    expect(body.score).toBe(0);
    expect(body.heard).toBe("perro");
    expect(typeof body.feedback).toBe("string");
  });

  it("clamps an out-of-range high score to 100", async () => {
    h.chatCreate.mockResolvedValue({
      choices: [
        { message: { content: '{"correct": true, "score": 250, "feedback": "!"}' } },
      ],
    });
    const { body } = await postPronounce(GOOD_BODY);
    expect(body.score).toBe(100);
  });

  it("clamps a negative score to 0", async () => {
    h.chatCreate.mockResolvedValue({
      choices: [
        { message: { content: '{"correct": false, "score": -20, "feedback": "!"}' } },
      ],
    });
    const { body } = await postPronounce(GOOD_BODY);
    expect(body.score).toBe(0);
  });
});

describe("POST /api/vocab/pronounce failure handling", () => {
  it("returns 503 when the OpenAI budget cap is reached, before transcription", async () => {
    h.budgetExceeded = true;
    const { status, body } = await postPronounce(GOOD_BODY);

    expect(status).toBe(503);
    expect(body.error).toBe("openai_budget_exceeded");
    expect(h.transcriptionsCreate).not.toHaveBeenCalled();
    expect(h.chatCreate).not.toHaveBeenCalled();
  });

  it("returns 503 when the budget cap trips on the grading reservation, after transcription", async () => {
    const reserve = (await import("../lib/openaiBudget")).reserveOpenAiBudget as ReturnType<
      typeof vi.fn
    >;
    reserve.mockImplementationOnce(async (kind: string) => {
      h.reserveCalls.push(kind);
    });
    reserve.mockImplementationOnce(async (kind: string) => {
      h.reserveCalls.push(kind);
      const err = new Error("budget exceeded") as Error & { code: string };
      err.code = "openai_budget_exceeded";
      throw err;
    });
    const { status, body } = await postPronounce(GOOD_BODY);

    expect(status).toBe(503);
    expect(body.error).toBe("openai_budget_exceeded");
    expect(h.reserveCalls).toEqual(["vocab_pronounce", "vocab_pronounce_grade"]);
    expect(h.transcriptionsCreate).toHaveBeenCalled();
    expect(h.chatCreate).not.toHaveBeenCalled();
  });

  it("returns 502 when transcription itself fails", async () => {
    h.transcriptionsCreate.mockRejectedValue(new Error("whisper down"));
    const { status, body } = await postPronounce(GOOD_BODY);

    expect(status).toBe(502);
    expect(body.error).toBe("Could not grade the pronunciation");
  });
});
