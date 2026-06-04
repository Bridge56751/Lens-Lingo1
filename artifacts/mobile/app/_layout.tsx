import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="scan"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen name="vocabulary" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="practice" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="progress" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="challenges" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen
        name="conversation/[id]"
        options={{
          headerShown: false,
          presentation: "card",
        }}
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
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
