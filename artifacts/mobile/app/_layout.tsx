import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getOrCreateDeviceId } from "@/lib/device";
import { setMobileAuthTokenGetter } from "@/lib/authToken";
import { setAuthTokenGetter, setBaseUrl, setDeviceId } from "@workspace/api-client-react";
import { initializeRevenueCat, SubscriptionProvider } from "@/lib/revenuecat";
import { handleProRequiredError } from "@/lib/proRequired";

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const CLERK_PROXY_URL = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

// Configure API base URL for Expo (runs outside the web proxy)
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

// Configure RevenueCat once at startup. Wrapped in try/catch so a missing key or
// unsupported environment never crashes the app — entitlement checks then simply
// resolve to "not subscribed".
try {
  initializeRevenueCat();
} catch (e) {
  console.warn("RevenueCat init failed", e);
}

SplashScreen.preventAutoHideAsync();

// A long gcTime keeps fetched learning content (sentence bank, vocab bank,
// selections) in cache long enough to be persisted to disk, so it's available
// on a cold start with no network. staleTime stays at the default so the app
// still refetches fresh data whenever it is online.
const OFFLINE_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 days

// A global error hook routes any 403 `pro_required` (the server-side Pro guard)
// to the paywall, so calling a paid route as a free user lands on the upgrade
// screen instead of a silent failure. Non-Pro errors pass through untouched.
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleProRequiredError }),
  mutationCache: new MutationCache({ onError: handleProRequiredError }),
  defaultOptions: { queries: { gcTime: OFFLINE_MAX_AGE } },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "@linguascan/rq-cache/v1",
  throttleTime: 1000,
});

// Bridges Clerk's session token into the API client and the manual fetch
// paths. Auth is optional — when signed out getToken returns null and requests
// fall back to the anonymous device flow.
function AuthTokenSync() {
  const { getToken } = useAuth();
  useEffect(() => {
    // getToken always reads the current session, so registering once is enough;
    // it returns null when signed out (anonymous device flow takes over).
    const getter = () => getToken();
    setAuthTokenGetter(getter);
    setMobileAuthTokenGetter(getter);
    return () => {
      setAuthTokenGetter(null);
      setMobileAuthTokenGetter(null);
    };
  }, [getToken]);
  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="onboarding"
        options={{
          presentation: "fullScreenModal",
          animation: "fade",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="scan"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen name="settings" options={{ presentation: "card" }} />
      <Stack.Screen
        name="auth"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="vocabulary" options={{ presentation: "card" }} />
      <Stack.Screen name="sentences" options={{ presentation: "card" }} />
      <Stack.Screen name="practice" options={{ presentation: "card" }} />
      <Stack.Screen name="progress" options={{ presentation: "card" }} />
      <Stack.Screen name="conversation/[id]" options={{ presentation: "card" }} />
      <Stack.Screen
        name="paywall"
        options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [deviceReady, setDeviceReady] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);

  useEffect(() => {
    getOrCreateDeviceId()
      .then((id) => setDeviceId(id))
      .catch(() => {})
      .finally(() => setDeviceReady(true));
  }, []);

  // Preload + cache the onboarding logo during the splash phase so it renders
  // instantly instead of popping in a moment after onboarding mounts.
  // `.finally` guarantees startup proceeds even if the preload fails.
  useEffect(() => {
    Asset.loadAsync(require("../assets/images/logo.png"))
      .catch(() => {})
      .finally(() => setAssetsReady(true));
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && deviceReady && assetsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, deviceReady, assetsReady]);

  if ((!fontsLoaded && !fontError) || !deviceReady || !assetsReady) return null;

  return (
    // Auth is optional: render the app immediately and let Clerk hydrate in the
    // background. We intentionally do NOT gate the tree behind <ClerkLoaded> so
    // the anonymous device flow is never blocked by Clerk loading/availability.
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY ?? ""}
      tokenCache={tokenCache}
      {...(CLERK_PROXY_URL ? { proxyUrl: CLERK_PROXY_URL } : {})}
    >
      <AuthTokenSync />
      <SafeAreaProvider>
        <ErrorBoundary>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister: asyncStoragePersister, maxAge: OFFLINE_MAX_AGE }}
          >
            <SubscriptionProvider>
              <GestureHandlerRootView>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </SubscriptionProvider>
          </PersistQueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
