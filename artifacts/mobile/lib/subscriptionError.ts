import { Alert } from "react-native";

export const SUBSCRIPTION_RETRY_MESSAGE =
  "We couldn't verify your subscription. Please try again shortly. You do not need to purchase again.";

export function isSubscriptionVerificationError(error: unknown): boolean {
  const e = error as { status?: number; data?: { error?: string } } | null;
  return e?.status === 503 && e.data?.error === "subscription_verification_unavailable";
}

export function showSubscriptionVerificationError(error: unknown): boolean {
  if (!isSubscriptionVerificationError(error)) return false;
  Alert.alert("Subscription temporarily unavailable", SUBSCRIPTION_RETRY_MESSAGE);
  return true;
}
