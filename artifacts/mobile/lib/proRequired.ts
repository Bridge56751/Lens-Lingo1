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

let lastPaywallNav = 0;

/**
 * Navigate to the paywall, debounced so several simultaneous 403s (e.g. parallel
 * queries firing on a Pro screen) don't stack multiple paywall modals.
 */
export function goToPaywallForProRequired(): void {
  const now = Date.now();
  if (now - lastPaywallNav < 1500) return;
  lastPaywallNav = now;
  router.push("/paywall");
}

/**
 * React Query global `onError` handler: route to the paywall when a query or
 * mutation failed because the server requires Pro. All other errors are ignored
 * so existing per-call error handling is unaffected.
 */
export function handleProRequiredError(err: unknown): void {
  if (isProRequiredApiError(err)) goToPaywallForProRequired();
}
