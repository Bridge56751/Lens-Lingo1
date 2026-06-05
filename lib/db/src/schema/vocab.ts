import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { customers } from "./customers";

// Curated/AI-generated vocabulary words, organized by difficulty level. Shared
// across all customers and cached per (target language, native language) so the
// list is stable and fast after the first generation.
export const vocabBank = pgTable(
  "vocab_bank",
  {
    id: serial("id").primaryKey(),
    targetLanguage: text("target_language").notNull(),
    nativeLanguage: text("native_language").notNull(),
    level: text("level").notNull(), // 'beginner' | 'intermediate' | 'advanced'
    word: text("word").notNull(),
    translation: text("translation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqWord: unique().on(
      t.targetLanguage,
      t.nativeLanguage,
      t.level,
      t.word,
    ),
  }),
);

// Words a customer has picked to learn. Self-contained (stores the word +
// translation) so it never breaks if the shared bank is regenerated.
export const vocabSelections = pgTable(
  "vocab_selections",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),
    targetLanguage: text("target_language").notNull(),
    level: text("level").notNull(),
    word: text("word").notNull(),
    translation: text("translation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqPick: unique().on(t.customerId, t.targetLanguage, t.word),
  }),
);

export const insertVocabSelectionSchema = createInsertSchema(
  vocabSelections,
).omit({
  id: true,
  customerId: true,
  createdAt: true,
});

export type VocabBankRow = typeof vocabBank.$inferSelect;
export type VocabSelection = typeof vocabSelections.$inferSelect;
export type InsertVocabSelection = z.infer<typeof insertVocabSelectionSchema>;
