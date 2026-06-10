import { useCallback } from "react";
import { router } from "expo-router";
import { useSubscription } from "@/lib/revenuecat";

// Central helper for the free/Pro boundary. `requirePro(action)` runs the action
// when the user has Pro and otherwise routes them to the paywall, returning a
// boolean so callers can short-circuit when needed.
export function usePro() {
  const { isSubscribed, isLoading } = useSubscription();

  const requirePro = useCallback(
    (action?: () => void): boolean => {
      if (isSubscribed) {
        action?.();
        return true;
      }
      // While the first customer-info fetch is still in flight we don't yet know
      // the user's tier. Don't bounce a genuinely-Pro user to the paywall on a
      // cold-start tap — no-op and let them retry once status resolves.
      if (isLoading) {
        return false;
      }
      router.push("/paywall");
      return false;
    },
    [isSubscribed, isLoading],
  );

  return { isPro: isSubscribed, isLoading, requirePro };
}
