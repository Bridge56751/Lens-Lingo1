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
      const [device] = await tx
        .select()
        .from(customers)
        .where(eq(customers.deviceId, deviceId))
        .limit(1);

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

    // Ensure the verified primary email is on the account (middleware backfills
    // it lazily, but make the link response authoritative).
    const [account] = await db
      .select({ email: customers.email })
      .from(customers)
      .where(eq(customers.id, accountId))
      .limit(1);

    let email = account?.email ?? null;
    if (!email) {
      const verified = await getVerifiedEmail(authUserId);
      if (verified) {
        await db
          .update(customers)
          .set({ email: verified })
          .where(eq(customers.id, accountId));
        email = verified;
      }
    }

    res.json({ ...result, email });
  } catch (err) {
    req.log.error({ err }, "Failed to link account");
    res.status(500).json({ error: "Failed to link account" });
  }
});

export default router;
