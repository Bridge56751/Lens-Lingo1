import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, customers } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Numeric id of the resolved customer (account row, else device row). */
      customerId?: number;
      /** Raw device id from the x-device-id header, if present. */
      deviceId?: string;
      /** Clerk user id of the signed-in user, if authenticated. */
      authUserId?: string;
    }
  }
}

/**
 * Returns the Clerk-verified primary email for a user, or null when there is no
 * verified primary address. Only verified addresses are ever returned so we
 * never persist an unverified (spoofable) email onto a customer row.
 */
export async function getVerifiedEmail(
  userId: string,
): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryId = user.primaryEmailAddressId;
    const primary = user.emailAddresses.find((e) => e.id === primaryId);
    if (
      primary &&
      primary.verification?.status === "verified" &&
      primary.emailAddress
    ) {
      return primary.emailAddress;
    }
  } catch {
    // Network/Clerk errors are non-fatal — email backfill is best-effort.
  }
  return null;
}

/**
 * Resolves (and lazily creates) a customer for the request.
 *
 * Two identity modes coexist:
 *   - Signed-in (Clerk): the account row keyed by `authUserId` is authoritative.
 *     We upsert it, lazily backfill the verified primary email, and still record
 *     the device id header for a later carry-over/link.
 *   - Anonymous: scoped by the `x-device-id` header, exactly as before.
 *
 * Requests with neither an auth session nor a device id proceed with no
 * customer attached.
 */
export async function resolveCustomer(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header("x-device-id");
  const deviceId = header?.trim() || undefined;
  if (deviceId) req.deviceId = deviceId;

  const { userId } = getAuth(req);

  if (userId) {
    req.authUserId = userId;
    try {
      const [account] = await db
        .insert(customers)
        .values({ authUserId: userId })
        .onConflictDoUpdate({
          target: customers.authUserId,
          set: { lastSeenAt: new Date() },
        })
        .returning();

      req.customerId = account?.id;

      // Keep the account's stored email in sync with the Clerk-verified primary
      // address (handles the user changing their primary email in Clerk). Only
      // overwrite when we successfully read a non-null verified email that
      // differs — getVerifiedEmail returns null both on error and when there is
      // no verified primary, and we keep the prior value in those cases rather
      // than clobbering it.
      if (account) {
        const email = await getVerifiedEmail(userId);
        if (email && email !== account.email) {
          await db
            .update(customers)
            .set({ email })
            .where(eq(customers.id, account.id));
        }
      }
    } catch (err) {
      req.log.error({ err }, "Failed to resolve customer from auth user id");
    }
    next();
    return;
  }

  if (!deviceId) {
    next();
    return;
  }

  try {
    const [customer] = await db
      .insert(customers)
      .values({ deviceId })
      .onConflictDoUpdate({
        target: customers.deviceId,
        set: { lastSeenAt: new Date() },
      })
      .returning();

    req.customerId = customer?.id;
  } catch (err) {
    req.log.error({ err }, "Failed to resolve customer from device id");
  }

  next();
}

/**
 * Route guard that requires an authenticated Clerk user. Must run after
 * `resolveCustomer` so `req.authUserId` / `req.customerId` are populated.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.authUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
