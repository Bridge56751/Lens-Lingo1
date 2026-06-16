import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useClerk,
  useUser,
} from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const CLERK_PROXY_URL = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

// True only when a real Clerk publishable key is configured. EAS / production
// builds that don't inject the key (it's only supplied by the Expo Go dev
// script and the Replit web build) fall back to the anonymous device flow
// instead of crashing — ClerkProvider throws synchronously on an empty key, and
// it mounts outside the ErrorBoundary, so an empty key is an instant launch
// crash. Auth is optional, so a missing key simply means "no sign-in".
export const CLERK_ENABLED = !!CLERK_PUBLISHABLE_KEY;

// The auth surface the app consumes outside the dedicated sign-in screen. When
// Clerk is disabled these are signed-out defaults so no consumer ever throws.
type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  accountEmail: string | null;
  signOut: () => Promise<void>;
  deleteUser: () => Promise<void>;
};

const SIGNED_OUT: AuthState = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  getToken: async () => null,
  accountEmail: null,
  signOut: async () => {},
  deleteUser: async () => {},
};

const AuthContext = createContext<AuthState>(SIGNED_OUT);

// Bridges Clerk's real auth state into our context so every consumer reads it
// through one hook whether or not Clerk is configured. Only ever rendered under
// a real ClerkProvider, so the Clerk hooks here are always valid.
function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useClerkAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  // Keep the latest Clerk functions in refs so the exposed callbacks have a
  // stable identity. AuthTokenSync registers getToken in an effect keyed on its
  // identity — a fresh function every render would re-register on every tick.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const userRef = useRef(user);
  userRef.current = user;

  const stableGetToken = useCallback(() => getTokenRef.current(), []);
  const stableSignOut = useCallback(async () => {
    await signOutRef.current();
  }, []);
  const stableDeleteUser = useCallback(async () => {
    if (userRef.current) await userRef.current.delete();
  }, []);

  const accountEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  const value = useMemo<AuthState>(
    () => ({
      isLoaded,
      isSignedIn: !!isSignedIn,
      userId: userId ?? null,
      getToken: stableGetToken,
      accountEmail,
      signOut: stableSignOut,
      deleteUser: stableDeleteUser,
    }),
    [isLoaded, isSignedIn, userId, accountEmail, stableGetToken, stableSignOut, stableDeleteUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Wraps the app's auth. With a Clerk key it mounts ClerkProvider exactly as
// before (sign-in behaves identically); without one it serves signed-out
// defaults so the anonymous device flow takes over and nothing crashes.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!CLERK_ENABLED) {
    return <AuthContext.Provider value={SIGNED_OUT}>{children}</AuthContext.Provider>;
  }
  return (
    // Auth is optional: render the app immediately and let Clerk hydrate in the
    // background. We intentionally do NOT gate the tree behind <ClerkLoaded> so
    // the anonymous device flow is never blocked by Clerk loading/availability.
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
      {...(CLERK_PROXY_URL ? { proxyUrl: CLERK_PROXY_URL } : {})}
    >
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

export function useOptionalAuth(): AuthState {
  return useContext(AuthContext);
}
