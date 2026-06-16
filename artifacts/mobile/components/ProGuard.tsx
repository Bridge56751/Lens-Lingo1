import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { useSubscription } from "@/lib/revenuecat";
import { goToPaywall } from "@/lib/proRequired";

// Defense-in-depth mount guard for Pro-only screens. Entry points already route
// free users to the paywall; this ensures the screen content itself never
// renders without Pro (e.g. a subscription that lapses mid-session) and offers a
// clear way to upgrade or back out without a navigation loop.
export function ProGuard({ children }: { children: React.ReactNode }) {
  const { isSubscribed, isLoading } = useSubscription();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();

  if (isSubscribed) return <>{children}</>;

  // Avoid flashing the upgrade wall while the first customer-info fetch is in
  // flight — show a neutral spinner instead.
  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const topPadding = Platform.OS === "web" ? 24 : insets.top + 16;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 16;

  return (
    <View
      style={[
        styles.center,
        { backgroundColor: colors.background, paddingTop: topPadding, paddingBottom: bottomPadding },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="lock-closed" size={34} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("pro.guardTitle")}
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t("pro.guardBody")}
      </Text>
      <TouchableOpacity
        style={[styles.cta, { backgroundColor: colors.primary }]}
        onPress={() => {
          Haptics.selectionAsync();
          goToPaywall();
        }}
        activeOpacity={0.9}
      >
        <Ionicons name="sparkles" size={18} color="#FFFFFF" />
        <Text style={[styles.ctaText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
          {t("pro.upgradeCta")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.back}
        onPress={() => {
          Haptics.selectionAsync();
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)");
        }}
        activeOpacity={0.7}
      >
        <Text style={[styles.backText, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
          {t("pro.maybeLater")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: { fontSize: 22, textAlign: "center", letterSpacing: -0.4 },
  body: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 6,
  },
  ctaText: { fontSize: 15 },
  back: { paddingVertical: 8 },
  backText: { fontSize: 14 },
});
