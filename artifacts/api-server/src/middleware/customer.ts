import type { Request, Response, NextFunction } from "express";
import { db, customers } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Numeric id of the customer resolved from the x-device-id header. */
      customerId?: number;
      /** Raw device id from the x-device-id header, if present. */
      deviceId?: string;
    }
  }
}

/**
 * Resolves (and lazily creates) a customer from the `x-device-id` request
 * header. Until real authentication exists, the device id is how we scope a
 * customer's records, progress, and chats. Requests without the header proceed
 * with no customer attached.
 */
export async function resolveCustomer(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header("x-device-id");
  const deviceId = header?.trim();

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
    req.deviceId = deviceId;
  } catch (err) {
    req.log.error({ err }, "Failed to resolve customer from device id");
  }

  next();
}
