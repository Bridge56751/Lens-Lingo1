import React, { createContext, useContext, useEffect } from "react";
import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useAuth } from "@clerk/expo";
import { getMyPlan } from "@workspace/api-client-react";
import { getDeviceIdSync } from "@/lib/device";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

// The entitlement that unlocks LinguaScan Pro. Configured in RevenueCat and
// checked via customerInfo.entitlements.active[...].
export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro_access";

function getRevenueCatApiKey() {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat Public API Keys not found");
  }

  if (!REVENUECAT_ENTITLEMENT_IDENTIFIER) {
    throw new Error("RevenueCat Entitlement Identifier not provided");
  }

  if (__DEV__ || Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
    return REVENUECAT_TEST_API_KEY;
  }

  if (Platform.OS === "ios") {
    return REVENUECAT_IOS_API_KEY;
  }

  if (Platform.OS === "android") {
    return REVENUECAT_ANDROID_API_KEY;
  }

  return REVENUECAT_TEST_API_KEY;
}

export function initializeRevenueCat() {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) throw new Error("RevenueCat Public API Key not found");

  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });

  console.log("Configured RevenueCat");
}

/**
 * Forces the server to pull the latest entitlement from RevenueCat's REST API
 * and reconcile `customers.plan`, bypassing the server's short plan cache via
 * `?refresh=true`. Best-effort: failures are swallowed so a flaky network
 * never surfaces an error after an otherwise-successful purchase/restore.
 */
function refreshServerPlan() {
  getMyPlan({ refresh: true }).catch((e) => {
    console.warn("Server plan refresh failed", e);
  });
}

function useSubscriptionContext() {
  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: async () => {
      const info = await Purchases.getCustomerInfo();
      return info;
    },
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      const offerings = await Purchases.getOfferings();
      return offerings;
    },
    staleTime: 300 * 1000,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => {
      customerInfoQuery.refetch();
      // Force the server to reconcile its authoritative plan from RevenueCat
      // immediately (bypassing its short cache) so Pro unlocks across every
      // server-backed surface without waiting for the cache TTL.
      refreshServerPlan();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      return Purchases.restorePurchases();
    },
    onSuccess: () => {
      customerInfoQuery.refetch();
      refreshServerPlan();
    },
  });

  const isSubscribed =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

/**
 * Associates the RevenueCat app user id with our customer identity so the
 * server's RevenueCat webhook can resolve the right `customers` row. We log in
 * with the signed-in Clerk user id when available, otherwise the anonymous
 * device id — the same keys the server matches on (`auth_user_id` / `device_id`).
 * Calling logIn when signed out (no Clerk session) falls back to the device id
 * so an anonymous purchaser is still keyed to a row the server can find.
 */
function RevenueCatIdentitySync() {
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    // Wait for Clerk to resolve so we don't briefly log in as the device id and
    // then immediately switch to the user id on a signed-in cold start.
    if (!isLoaded) return;
    const appUserId = userId ?? getDeviceIdSync();
    if (!appUserId) return;
    Purchases.logIn(appUserId).catch((e) => {
      console.warn("RevenueCat logIn failed", e);
    });
  }, [isLoaded, userId]);

  return null;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return (
    <Context.Provider value={value}>
      <RevenueCatIdentitySync />
      {children}
    </Context.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
