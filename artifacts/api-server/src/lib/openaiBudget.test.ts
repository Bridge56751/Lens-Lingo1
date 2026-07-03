import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  currentUsd: 0,
  queries: [] as string[],
  params: [] as unknown[][],
  released: false,
}));

vi.mock("@workspace/db", () => ({
  pool: {
    connect: vi.fn(async () => ({
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        h.queries.push(sql);
        h.params.push(params ?? []);
        if (sql.includes("SELECT estimated_cost_usd")) {
          return { rows: [{ estimated_cost_usd: String(h.currentUsd) }] };
        }
        if (sql.includes("UPDATE provider_budget_months")) {
          h.currentUsd += Number(params?.[1] ?? 0);
        }
        return { rows: [] };
      }),
      release: vi.fn(() => {
        h.released = true;
      }),
    })),
  },
}));

const { OpenAiBudgetExceededError, reserveOpenAiBudget } = await import("./openaiBudget");

describe("reserveOpenAiBudget", () => {
  beforeEach(() => {
    h.currentUsd = 0;
    h.queries = [];
    h.params = [];
    h.released = false;
    delete process.env.OPENAI_MONTHLY_BUDGET_USD;
  });

  it("records usage while under the monthly cap", async () => {
    process.env.OPENAI_MONTHLY_BUDGET_USD = "0.05";
    const yearMonth = new Date().toISOString().slice(0, 7);

    await reserveOpenAiBudget("tts");

    expect(h.currentUsd).toBeCloseTo(0.02);
    expect(h.queries.some((sql) => sql.includes("INSERT INTO provider_usage"))).toBe(true);
    expect(h.params).toContainEqual([yearMonth, "gpt-4o-mini-tts", "tts", 0.02]);
    expect(h.queries.some((sql) => sql.includes("COMMIT"))).toBe(true);
    expect(h.released).toBe(true);
  });

  it("blocks before recording usage when the cap would be exceeded", async () => {
    process.env.OPENAI_MONTHLY_BUDGET_USD = "0.01";

    await expect(reserveOpenAiBudget("tts")).rejects.toBeInstanceOf(
      OpenAiBudgetExceededError,
    );

    expect(h.currentUsd).toBe(0);
    expect(h.queries.some((sql) => sql.includes("INSERT INTO provider_usage"))).toBe(false);
    expect(h.queries.some((sql) => sql.includes("ROLLBACK"))).toBe(true);
  });
});
