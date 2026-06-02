import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull().unique(),
  displayName: text("display_name"),
  /** Subscription tier. 'free' until upgraded; set to 'pro' for paying users. */
  plan: text("plan").notNull().default("free"),
  /** When the customer became a pro user (null while on the free plan). */
  proSince: timestamp("pro_since", { withTimezone: true }),
  /** Number of pictures scanned. */
  scanCount: integer("scan_count").notNull().default(0),
  /** Number of chats (conversations) started. */
  chatCount: integer("chat_count").notNull().default(0),
  /** Number of messages the customer has sent to the tutor. */
  messageCount: integer("message_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
