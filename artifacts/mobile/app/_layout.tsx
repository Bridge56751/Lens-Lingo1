import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getOrCreateDeviceId } from "@/lib/device";
import { setBaseUrl, setDeviceId } from "@workspace/api-client-react";

// Configure API base URL for Expo (runs outside the web proxy)
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

SplashScreen.preventAutoHideAsync();

// A long gcTime keeps fetched learning content (sentence bank, vocab bank,
// selections) in cache long enough to be persisted to disk, so it's available
// on a cold start with no network. staleTime stays at the default so the app
// still refetches fresh data whenever it is online.
const OFFLINE_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 days

const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: OFFLINE_MAX_AGE } },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "@linguascan/rq-cache/v1",
  throttleTime: 1000,
});

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
      <Stack.Screen name="vocabulary" options={{ presentation: "card" }} />
      <Stack.Screen name="sentences" options={{ presentation: "card" }} />
      <Stack.Screen name="practice" options={{ presentation: "card" }} />
      <Stack.Screen name="progress" options={{ presentation: "card" }} />
      <Stack.Screen name="challenges" options={{ presentation: "card" }} />
      <Stack.Screen name="conversation/[id]" options={{ presentation: "card" }} />
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

  useEffect(() => {
    getOrCreateDeviceId()
      .then((id) => setDeviceId(id))
      .catch(() => {})
      .finally(() => setDeviceReady(true));
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && deviceReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, deviceReady]);

  if ((!fontsLoaded && !fontError) || !deviceReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister, maxAge: OFFLINE_MAX_AGE }}
        >
          <GestureHandlerRootView>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
