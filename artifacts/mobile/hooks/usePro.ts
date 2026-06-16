import { useCallback } from "react";
import { useSubscription } from "@/lib/revenuecat";
import { goToPaywall } from "@/lib/proRequired";

// Central helper for the free/Pro boundary. `requirePro(action)` runs the action
// when the user has Pro and otherwise routes them to the paywall, returning a
// boolean so callers can short-circuit when needed.
export function usePro() {
  const { isSubscribed, isLoading } = useSubscription();

  const requirePro = useCallback(
    // `feature` lets the caller tell the paywall which locked feature was tapped
    // so it can theme itself (accent color + a deep-dive on that feature).
    (action?: () => void, feature?: string): boolean => {
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
      // Centralized navigation — guards against stacking a paywall on top of an
      // already-open one and debounces simultaneous triggers.
      goToPaywall(feature);
      return false;
    },
    [isSubscribed, isLoading],
  );

  return { isPro: isSubscribed, isLoading, requirePro };
}
