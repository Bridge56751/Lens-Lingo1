import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, customers, conversations, vocabSelections } from "@workspace/db";
import { requireAuth, getVerifiedEmail } from "../middleware/customer";

const router = Router();

/**
 * Carries an anonymous device customer's data over into the signed-in account.
 *
 * Runs after `resolveCustomer`, so `req.customerId` is the account row (created
 * from the Clerk user id) and `req.authUserId` is the Clerk user id. The body's
 * `deviceId` names the anonymous row to absorb.
 *
 * Merge strategy (always-merge, idempotent):
 *   - Reassign the device's conversations to the account.
 *   - Reassign vocab selections that don't collide with the account's unique
 *     (customerId, targetLanguage, word) constraint; colliding leftovers are
 *     cascade-deleted with the device row.
 *   - Sum the usage counters into the account.
 *   - Delete the device row (cascades messages via conversations already moved,
 *     and any leftover duplicate vocab selections).
 *   - Ensure the account's verified primary email is stored.
 *
 * A missing device row (already linked, or never existed) is a clean no-op.
 */
router.post("/account/link", requireAuth, async (req, res) => {
  const accountId = req.customerId;
  const authUserId = req.authUserId;
  if (accountId == null || authUserId == null) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const deviceId =
    typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
  if (!deviceId) {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // FOR UPDATE locks the device row so concurrent/retried link calls
      // serialize: the second transaction blocks until the first commits, then
      // re-evaluates the predicate and finds the row already deleted -> clean
      // no-op. Without the lock, two callers could both read the same counters
      // and double-count them into the account.
      const [device] = await tx
        .select()
        .from(customers)
        .where(eq(customers.deviceId, deviceId))
        .limit(1)
        .for("update");

      // Unknown device, or the account itself: nothing to carry over.
      if (!device || device.id === accountId) {
        return {
          linked: false,
          conversationsMoved: 0,
          vocabSelectionsMoved: 0,
        };
      }

      const movedConversations = await tx
        .update(conversations)
        .set({ customerId: accountId })
        .where(eq(conversations.customerId, device.id))
        .returning({ id: conversations.id });

      // Move only selections that won't violate the account's unique index;
      // duplicates stay on the device row and are removed by the cascade below.
      const movedVocab = await tx
        .update(vocabSelections)
        .set({ customerId: accountId })
        .where(
          sql`${vocabSelections.customerId} = ${device.id} AND NOT EXISTS (
            SELECT 1 FROM ${vocabSelections} existing
            WHERE existing.customer_id = ${accountId}
              AND existing.target_language = ${vocabSelections.targetLanguage}
              AND existing.word = ${vocabSelections.word}
          )`,
        )
        .returning({ id: vocabSelections.id });

      await tx
        .update(customers)
        .set({
          scanCount: sql`${customers.scanCount} + ${device.scanCount}`,
          chatCount: sql`${customers.chatCount} + ${device.chatCount}`,
          messageCount: sql`${customers.messageCount} + ${device.messageCount}`,
          lastSeenAt: new Date(),
        })
        .where(eq(customers.id, accountId));

      // Cascades remaining (duplicate) vocab selections; conversations already
      // moved off this row.
      await tx.delete(customers).where(eq(customers.id, device.id));

      return {
        linked: true,
        conversationsMoved: movedConversations.length,
        vocabSelectionsMoved: movedVocab.length,
      };
    });

    // Make the link response authoritative for the verified primary email and
    // keep it in sync: overwrite when Clerk returns a non-null verified email
    // that differs from what's stored (keep prior on error / no verified primary).
    const [account] = await db
      .select({ email: customers.email })
      .from(customers)
      .where(eq(customers.id, accountId))
      .limit(1);

    let email = account?.email ?? null;
    const verified = await getVerifiedEmail(authUserId);
    if (verified && verified !== email) {
      await db
        .update(customers)
        .set({ email: verified })
        .where(eq(customers.id, accountId));
      email = verified;
    }

    res.json({ ...result, email });
  } catch (err) {
    req.log.error({ err }, "Failed to link account");
    res.status(500).json({ error: "Failed to link account" });
  }
});

/**
 * Permanently deletes the caller's customer row and, via FK cascades, all of
 * their conversations, messages, and vocabulary selections (Apple guideline
 * 5.1.1(v) in-app account deletion).
 *
 * Runs after `resolveCustomer`, so `req.customerId` is the signed-in account row
 * (keyed by Clerk user id) or the anonymous device row. Deleting the Clerk user
 * itself and wiping local AsyncStorage are handled client-side. Idempotent: with
 * no resolved customer row there is nothing to delete.
 */
router.delete("/account", async (req, res) => {
  const customerId = req.customerId;
  if (customerId == null) {
    res.json({ deleted: false });
    return;
  }

  try {
    const removed = await db
      .delete(customers)
      .where(eq(customers.id, customerId))
      .returning({ id: customers.id });
    res.json({ deleted: removed.length > 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to delete account");
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
