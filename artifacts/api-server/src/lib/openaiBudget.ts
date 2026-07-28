import type { Response } from "express";
import { pool } from "@workspace/db";

export type OpenAiCallKind =
  | "auto_title"
  | "chat_message"
  | "chat_start"
  | "grade"
  | "romanize"
  | "scan"
  | "sentence_bank"
  | "transcribe"
  | "translate"
  | "tts"
  | "vocab_bank"
  | "vocab_check"
  | "vocab_pronounce"
  | "vocab_pronounce_grade"
  | "vocab_example"
  | "vocab_search";

type BudgetEstimate = {
  model: string;
  estimatedCostUsd: number;
};

const ESTIMATES: Record<OpenAiCallKind, BudgetEstimate> = {
  auto_title: { model: "gpt-4o-mini", estimatedCostUsd: 0.002 },
  chat_message: { model: "gpt-4o", estimatedCostUsd: 0.03 },
  chat_start: { model: "gpt-4o", estimatedCostUsd: 0.02 },
  grade: { model: "gpt-4o", estimatedCostUsd: 0.03 },
  romanize: { model: "gpt-4o-mini", estimatedCostUsd: 0.02 },
  scan: { model: "gpt-4o", estimatedCostUsd: 0.03 },
  sentence_bank: { model: "gpt-4o", estimatedCostUsd: 0.03 },
  transcribe: { model: "gpt-4o-mini-transcribe", estimatedCostUsd: 0.01 },
  translate: { model: "gpt-4o-mini", estimatedCostUsd: 0.005 },
  tts: { model: "gpt-4o-mini-tts", estimatedCostUsd: 0.02 },
  vocab_bank: { model: "gpt-4o", estimatedCostUsd: 0.03 },
  vocab_check: { model: "gpt-4o", estimatedCostUsd: 0.02 },
  vocab_pronounce: { model: "gpt-4o-mini-transcribe", estimatedCostUsd: 0.01 },
  vocab_pronounce_grade: { model: "gpt-4o-mini", estimatedCostUsd: 0.001 },
  vocab_example: { model: "gpt-4o", estimatedCostUsd: 0.01 },
  vocab_search: { model: "gpt-4o", estimatedCostUsd: 0.02 },
};

export class OpenAiBudgetExceededError extends Error {
  readonly code = "openai_budget_exceeded";

  constructor(
    public readonly capUsd: number,
    public readonly currentUsd: number,
    public readonly requestedUsd: number,
  ) {
    super("OpenAI monthly budget exceeded");
  }
}

function monthlyCapUsd(): number {
  const raw = process.env.OPENAI_MONTHLY_BUDGET_USD;
  if (raw == null || raw.trim() === "") return 100;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 100;
}

function currentYearMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function isOpenAiBudgetExceeded(
  err: unknown,
): err is OpenAiBudgetExceededError {
  return err instanceof OpenAiBudgetExceededError;
}

export function sendOpenAiBudgetExceeded(res: Response): void {
  res.status(503).json({ error: "openai_budget_exceeded" });
}

export async function reserveOpenAiBudget(
  callKind: OpenAiCallKind,
): Promise<void> {
  const estimate = ESTIMATES[callKind];
  const capUsd = monthlyCapUsd();
  const yearMonth = currentYearMonth();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO provider_budget_months
          (provider, year_month, estimated_cost_usd, call_count, updated_at)
        VALUES ('openai', $1, 0, 0, now())
        ON CONFLICT (provider, year_month) DO NOTHING
      `,
      [yearMonth],
    );

    const { rows } = await client.query<{ estimated_cost_usd: string }>(
      `
        SELECT estimated_cost_usd::text
        FROM provider_budget_months
        WHERE provider = 'openai' AND year_month = $1
        FOR UPDATE
      `,
      [yearMonth],
    );
    const currentUsd = Number(rows[0]?.estimated_cost_usd ?? 0);
    if (currentUsd + estimate.estimatedCostUsd > capUsd) {
      throw new OpenAiBudgetExceededError(
        capUsd,
        currentUsd,
        estimate.estimatedCostUsd,
      );
    }

    await client.query(
      `
        UPDATE provider_budget_months
        SET
          estimated_cost_usd = estimated_cost_usd + $2::numeric,
          call_count = call_count + 1,
          updated_at = now()
        WHERE provider = 'openai' AND year_month = $1
      `,
      [yearMonth, estimate.estimatedCostUsd],
    );
    await client.query(
      `
        INSERT INTO provider_usage
          (provider, year_month, model, call_kind, estimated_cost_usd)
        VALUES ('openai', $1, $2, $3, $4::numeric)
      `,
      [yearMonth, estimate.model, callKind, estimate.estimatedCostUsd],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
