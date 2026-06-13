import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  // Anonymous device identity. Nullable because an account row (claimed by a
  // signed-in user) has no device id; null device ids never collide on the
  // unique index (Postgres allows multiple NULLs).
  deviceId: text("device_id").unique(),
  /** Stable Clerk user id — the canonical account key once a user signs in. */
  authUserId: text("auth_user_id").unique(),
  /** Clerk-verified primary email. Only ever set from a verified address. */
  email: text("email"),
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
  /**
   * Scans used in the current free-tier period — the counter behind the daily
   * scan limit. Reset to 1 when a new period starts (see `scanResetsAt`).
   * Distinct from the lifetime `scanCount` above.
   */
  scanDayCount: integer("scan_day_count").notNull().default(0),
  /**
   * Absolute instant (ISO-8601 UTC) the current scan allowance refills — the
   * caller's next LOCAL midnight, floored so a tampered `x-tz-offset` can't
   * shrink the window. The period is "active" only while real server time is
   * before this, so the allowance refills without a cron and the cap can't be
   * bypassed by rotating the offset header. NOTE: the DB column is still named
   * `scan_day_key` (legacy — it once held a YYYY-MM-DD day key).
   */
  scanResetsAt: text("scan_day_key"),
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
