// Holds the latest Clerk session-token getter so non-generated fetch paths
// (audio upload, TTS, SSE streaming) can attach an Authorization header.
//
// The generated React Query hooks get their token via
// `setAuthTokenGetter` from `@workspace/api-client-react`; this module mirrors
// that for the handful of manual `expoFetch` calls in the app. Both are wired
// from a single Clerk `getToken` source in `app/_layout.tsx`.

type TokenGetter = () => Promise<string | null>;

let _getter: TokenGetter | null = null;

export function setMobileAuthTokenGetter(getter: TokenGetter | null): void {
  _getter = getter;
}

/**
 * Resolve the current bearer auth header, or an empty object when there is no
 * signed-in session. Never throws — auth is optional, so failures degrade to
 * the anonymous device flow.
 */
export async function authHeader(): Promise<Record<string, string>> {
  if (!_getter) return {};
  try {
    const token = await _getter();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
