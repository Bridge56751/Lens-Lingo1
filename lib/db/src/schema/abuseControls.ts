import {
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.key, t.scope, t.windowStart, t.windowSeconds],
    }),
  }),
);

export const providerBudgetMonths = pgTable(
  "provider_budget_months",
  {
    provider: text("provider").notNull(),
    yearMonth: text("year_month").notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 12,
      scale: 6,
    })
      .notNull()
      .default("0"),
    callCount: integer("call_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.yearMonth] }),
  }),
);

export const providerUsage = pgTable("provider_usage", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  yearMonth: text("year_month").notNull(),
  model: text("model").notNull(),
  callKind: text("call_kind").notNull(),
  estimatedCostUsd: numeric("estimated_cost_usd", {
    precision: 12,
    scale: 6,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ApiRateLimit = typeof apiRateLimits.$inferSelect;
export type ProviderBudgetMonth = typeof providerBudgetMonths.$inferSelect;
export type ProviderUsage = typeof providerUsage.$inferSelect;
