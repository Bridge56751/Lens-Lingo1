import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

// AI-generated everyday survival phrases ("Good morning", "Where is...?",
// "Excuse me"), organized by situation/category. Shared across all customers and
// cached per (target language, native language) so the list is stable and fast
// after the first generation.
export const sentenceBank = pgTable(
  "sentence_bank",
  {
    id: serial("id").primaryKey(),
    targetLanguage: text("target_language").notNull(),
    nativeLanguage: text("native_language").notNull(),
    category: text("category").notNull(), // 'greetings' | 'basics' | ...
    phrase: text("phrase").notNull(),
    translation: text("translation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    uniqPhrase: unique().on(
      t.targetLanguage,
      t.nativeLanguage,
      t.category,
      t.phrase,
    ),
  }),
);

export type SentenceBankRow = typeof sentenceBank.$inferSelect;
