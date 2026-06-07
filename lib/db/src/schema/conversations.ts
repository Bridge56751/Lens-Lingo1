import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { customers } from "./customers";

// Structured grade critique persisted alongside the numeric score.
export type GradeFeedback = {
  summary: string;
  strengths: string[];
  mistakes: { error: string; correction: string }[];
  suggestions: string[];
};

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  targetLanguage: text("target_language"),
  nativeLanguage: text("native_language"),
  // Difficulty tier chosen at scan time: "Beginner" | "Intermediate" | "Advanced".
  difficulty: text("difficulty"),
  // End-of-conversation grade (0-100) and structured critique.
  gradeScore: integer("grade_score"),
  gradeFeedback: jsonb("grade_feedback").$type<GradeFeedback>(),
  gradedAt: timestamp("graded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Last time the conversation detail was opened. Null for chats never reopened
  // since this column was added; list ordering coalesces it to createdAt.
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
