import { router } from "expo-router";

/**
 * Server-side Pro enforcement mirror.
 *
 * Routes that are Pro-only in the app are also guarded on the API (`requirePro`),
 * which answers `403 { error: "pro_required" }` for a non-Pro caller. This module
 * detects that response and routes the user to the paywall instead of surfacing a
 * generic error.
 *
 * Two error shapes reach the client:
 *  - generated React Query hooks throw an `ApiError` with `.status` / `.data`
 *  - the manual streaming / voice fetch paths expose the raw `Response`
 */

/** True when a thrown error is the server's `403 pro_required` (ApiError shape). */
export function isProRequiredApiError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ((err as { status?: unknown }).status !== 403) return false;
  const data = (err as { data?: unknown }).data;
  return (
    !!data &&
    typeof data === "object" &&
    (data as { error?: unknown }).error === "pro_required"
  );
}

// True while the paywall screen is the focused route. The paywall registers this
// (useFocusEffect in paywall.tsx) so we never push a SECOND paywall on top of an
// open one — the user reported the paywall "pulling up even when already on a
// paywall", which was an unguarded re-navigation while it was already showing.
let paywallVisible = false;

export function setPaywallVisible(visible: boolean): void {
  paywallVisible = visible;
}

let lastPaywallNav = 0;

/**
 * The single entry point for opening the paywall. It is:
 *  - re-entrancy guarded: no-op while the paywall is already the focused route
 *    (prevents stacking a second modal on top of the first), and
 *  - debounced: several near-simultaneous triggers (e.g. parallel Pro mutations
 *    failing at once) collapse into one navigation.
 *
 * `feature` themes the paywall around the locked feature that was tapped.
 */
export function goToPaywall(feature?: string): void {
  if (paywallVisible) return;
  const now = Date.now();
  if (now - lastPaywallNav < 1500) return;
  lastPaywallNav = now;
  if (feature) {
    router.push({ pathname: "/paywall", params: { feature } });
  } else {
    router.push("/paywall");
  }
}

/**
 * Back-compat entry for the manual (non-React-Query) fetch paths — voice
 * transcribe / streaming chat — which detect a raw `403 pro_required` Response.
 */
export function goToPaywallForProRequired(): void {
  goToPaywall();
}

/**
 * Global React Query `onError` handler for the MUTATION cache only: route a
 * free user to the paywall when a Pro-only mutation (start conversation, send
 * message, transcribe, translate, grade) is rejected with `403 pro_required`.
 *
 * This is intentionally NOT wired to the query cache. Every Pro-gated GET runs
 * exclusively inside a `ProGuard`-protected screen, so it never fires for a free
 * user through normal navigation. A query 403 that still reaches the client is
 * therefore a transient client/server plan mismatch or a background refetch
 * (focus / reconnect / staleness) — routing those to the paywall is what made it
 * pop up "for no reason". Mutations, by contrast, are always user-initiated.
 */
export function handleProRequiredError(err: unknown): void {
  if (isProRequiredApiError(err)) goToPaywall();
}
