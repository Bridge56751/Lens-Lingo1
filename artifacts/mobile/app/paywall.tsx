import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { PurchasesPackage } from "react-native-purchases";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { useSubscription, REVENUECAT_ENTITLEMENT_IDENTIFIER } from "@/lib/revenuecat";

type ResultKind = "success" | "restored" | "nothing" | "error" | null;

const FEATURE_KEYS = [
  { icon: "chatbubbles" as const, key: "paywall.feature.chat" as const },
  { icon: "mic" as const, key: "paywall.feature.voice" as const },
  { icon: "book" as const, key: "paywall.feature.vocab" as const },
  { icon: "volume-high" as const, key: "paywall.feature.audio" as const },
  { icon: "globe" as const, key: "paywall.feature.languages" as const },
];

// Maps a RevenueCat package's billing period to a friendly name + price suffix.
// Prices themselves always come from product.priceString (never hardcoded).
function packageMeta(
  pkg: PurchasesPackage,
  t: ReturnType<typeof useT>,
): { name: string; suffix: string } {
  switch (pkg.packageType) {
    case "WEEKLY":
      return { name: t("paywall.weekly"), suffix: t("paywall.perWeek") };
    case "MONTHLY":
      return { name: t("paywall.monthly"), suffix: t("paywall.perMonth") };
    case "ANNUAL":
      return { name: t("paywall.annual"), suffix: t("paywall.perYear") };
    default:
      return { name: pkg.product.title || pkg.identifier, suffix: "" };
  }
}

export default function PaywallScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    offerings,
    isSubscribed,
    isLoading,
    purchase,
    restore,
    isPurchasing,
    isRestoring,
  } = useSubscription();

  const packages = useMemo<PurchasesPackage[]>(
    () => offerings?.current?.availablePackages ?? [],
    [offerings],
  );

  // Default-select the annual plan (best value) when present, else the first.
  const defaultId = useMemo(() => {
    const annual = packages.find((p) => p.packageType === "ANNUAL");
    return annual?.identifier ?? packages[0]?.identifier ?? null;
  }, [packages]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? defaultId;
  const selectedPackage = packages.find((p) => p.identifier === activeId) ?? null;

  const [result, setResult] = useState<ResultKind>(null);

  const topPadding = Platform.OS === "web" ? 16 : insets.top + 8;
  const bottomPadding = Platform.OS === "web" ? 28 : insets.bottom + 20;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const onSubscribe = async () => {
    if (!selectedPackage || isPurchasing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await purchase(selectedPackage);
      setResult("success");
    } catch (e) {
      // RevenueCat sets `userCancelled` when the user dismisses the native
      // sheet — that's not an error, so stay silent.
      if (e && typeof e === "object" && (e as { userCancelled?: boolean }).userCancelled) {
        return;
      }
      setResult("error");
    }
  };

  const onRestore = async () => {
    if (isRestoring) return;
    Haptics.selectionAsync();
    try {
      const info = await restore();
      const active =
        info?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
      setResult(active ? "restored" : "nothing");
    } catch {
      setResult("error");
    }
  };

  const dismissResult = () => {
    const wasUnlock = result === "success" || result === "restored";
    setResult(null);
    if (wasUnlock) close();
  };

  // A Pro user reaching the paywall (e.g. opened from settings) sees a simple
  // confirmation rather than purchase options.
  if (isSubscribed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPadding }]}>
        <CloseButton onPress={close} color={colors.foreground} />
        <View style={styles.activeWrap}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="checkmark-circle" size={44} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("paywall.activeTitle")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("paywall.activeBody")}
          </Text>
          <TouchableOpacity
            style={[styles.subscribeBtn, { backgroundColor: colors.primary }]}
            onPress={close}
            activeOpacity={0.9}
          >
            <Text style={[styles.subscribeText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
              {t("paywall.done")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <CloseButton onPress={close} color={colors.foreground} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="sparkles" size={40} color={colors.primary} />
        </View>
        <View style={[styles.proPill, { backgroundColor: colors.primary }]}>
          <Text style={[styles.proPillText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
            {t("pro.badge")}
          </Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("paywall.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {t("paywall.subtitle")}
        </Text>

        {/* Feature list */}
        <View style={[styles.features, { backgroundColor: colors.card }]}>
          {FEATURE_KEYS.map((f) => (
            <View key={f.key} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name={f.icon} size={16} color={colors.primary} />
              </View>
              <Text
                style={[styles.featureText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}
              >
                {t(f.key)}
              </Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
            </View>
          ))}
        </View>

        {/* Plans */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("paywall.loading")}
            </Text>
          </View>
        ) : packages.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.mutedForeground} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("paywall.unavailable")}
            </Text>
          </View>
        ) : (
          <View style={styles.plans}>
            {packages.map((pkg) => {
              const selected = pkg.identifier === activeId;
              const meta = packageMeta(pkg, t);
              const isAnnual = pkg.packageType === "ANNUAL";
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[
                    styles.planCard,
                    { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedId(pkg.identifier);
                  }}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? colors.primary : colors.border },
                    ]}
                  >
                    {selected && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.planNameRow}>
                      <Text
                        style={[styles.planName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
                      >
                        {meta.name}
                      </Text>
                      {isAnnual && (
                        <View style={[styles.bestValue, { backgroundColor: colors.primarySoft }]}>
                          <Text
                            style={[styles.bestValueText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}
                          >
                            {t("paywall.bestValue")}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.planPrice, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
                    >
                      {pkg.product.priceString}
                      {meta.suffix}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.subscribeBtn,
            { backgroundColor: colors.primary, opacity: !selectedPackage || isPurchasing ? 0.6 : 1 },
          ]}
          onPress={onSubscribe}
          disabled={!selectedPackage || isPurchasing}
          activeOpacity={0.9}
        >
          {isPurchasing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.subscribeText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
              {t("paywall.subscribe")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={onRestore}
          disabled={isRestoring}
          activeOpacity={0.7}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Text style={[styles.restoreText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {t("paywall.restore")}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.terms, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {t("paywall.terms")}
        </Text>
      </ScrollView>

      {/* Custom result modal (no Alert.alert) */}
      <Modal visible={result !== null} transparent animationType="fade" onRequestClose={dismissResult}>
        <Pressable style={styles.modalBackdrop} onPress={dismissResult}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.modalIcon,
                {
                  backgroundColor:
                    result === "error" ? "#FEE2E2" : colors.primarySoft,
                },
              ]}
            >
              <Ionicons
                name={
                  result === "success" || result === "restored"
                    ? "checkmark-circle"
                    : result === "error"
                      ? "alert-circle"
                      : "information-circle"
                }
                size={34}
                color={result === "error" ? "#DC2626" : colors.primary}
              />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {result === "success"
                ? t("paywall.successTitle")
                : result === "restored"
                  ? t("paywall.restoredTitle")
                  : result === "nothing"
                    ? t("paywall.nothingTitle")
                    : t("paywall.errorTitle")}
            </Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {result === "success"
                ? t("paywall.successBody")
                : result === "restored"
                  ? t("paywall.restoredBody")
                  : result === "nothing"
                    ? t("paywall.nothingBody")
                    : t("paywall.errorBody")}
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              onPress={dismissResult}
              activeOpacity={0.9}
            >
              <Text style={[styles.modalBtnText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
                {t("paywall.gotIt")}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function CloseButton({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <TouchableOpacity style={styles.closeBtn} onPress={onPress} activeOpacity={0.7} hitSlop={10}>
      <Ionicons name="close" size={26} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: { alignSelf: "flex-end", padding: 16 },
  scroll: { paddingHorizontal: 24, alignItems: "center", gap: 12 },
  heroIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  proPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  proPillText: { fontSize: 12, letterSpacing: 1 },
  title: { fontSize: 24, textAlign: "center", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },
  features: {
    alignSelf: "stretch",
    borderRadius: 18,
    padding: 16,
    gap: 14,
    marginTop: 6,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { flex: 1, fontSize: 14 },
  loadingWrap: { alignSelf: "stretch", alignItems: "center", gap: 10, paddingVertical: 28 },
  loadingText: { fontSize: 13, textAlign: "center" },
  plans: { alignSelf: "stretch", gap: 10, marginTop: 4 },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  planNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  planName: { fontSize: 16 },
  bestValue: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  bestValueText: { fontSize: 9, letterSpacing: 0.4 },
  planPrice: { fontSize: 13, marginTop: 3 },
  subscribeBtn: {
    alignSelf: "stretch",
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  subscribeText: { fontSize: 16 },
  restoreBtn: { paddingVertical: 12, minHeight: 20, justifyContent: "center" },
  restoreText: { fontSize: 14 },
  terms: { fontSize: 11, textAlign: "center", lineHeight: 16, paddingHorizontal: 12 },
  activeWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32, paddingBottom: 60 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  modalCard: {
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    gap: 10,
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  modalTitle: { fontSize: 18, textAlign: "center" },
  modalBody: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalBtn: {
    alignSelf: "stretch",
    height: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  modalBtnText: { fontSize: 15 },
});
