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
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import type { PurchasesPackage } from "react-native-purchases";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import type { TKey } from "@/constants/translations";
import { useSubscription, REVENUECAT_ENTITLEMENT_IDENTIFIER } from "@/lib/revenuecat";

type ResultKind = "success" | "restored" | "nothing" | "error" | null;

// TODO: point these at your own hosted Terms / Privacy pages.
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://www.apple.com/legal/privacy/";

// The four highlighted premium features (2x2 grid). Icons + accent colors are
// fixed per feature; titles/descriptions come from translations.
const FEATURES: {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  titleKey: TKey;
  descKey: TKey;
}[] = [
  { icon: "infinite", bg: "#7C5CFF", titleKey: "paywall.fScansTitle", descKey: "paywall.fScansDesc" },
  { icon: "sparkles", bg: "#F97316", titleKey: "paywall.fTutorTitle", descKey: "paywall.fTutorDesc" },
  { icon: "chatbubbles", bg: "#3B82F6", titleKey: "paywall.fChatTitle", descKey: "paywall.fChatDesc" },
  { icon: "book", bg: "#10B981", titleKey: "paywall.fVocabTitle", descKey: "paywall.fVocabDesc" },
  { icon: "globe", bg: "#0EA5E9", titleKey: "paywall.fLangsTitle", descKey: "paywall.fLangsDesc" },
];

// When the user taps a specific locked feature on Home we route here with a
// `feature` param. The paywall then themes itself to that feature: the hero
// accent + lock take the feature's color and a full-width "spotlight" card
// goes deep on it, while the grid still lists everything else in Pro. Accent
// colors match the corresponding Home cards (orange chat, green vocabulary).
type PaywallFeature = "chat" | "vocab";

const FEATURE_THEMES: Record<
  PaywallFeature,
  {
    accent: string;
    // Spotlight-panel background. Can be a touch darker than `accent` so white
    // body text stays legible (WCAG AA) on the large colored card.
    spotBg: string;
    icon: keyof typeof Ionicons.glyphMap;
    titleKey: TKey;
    descKey: TKey;
    bulletKeys: [TKey, TKey, TKey];
    gridTitleKey: TKey;
  }
> = {
  chat: {
    accent: "#EA580C",
    spotBg: "#C2410C",
    icon: "chatbubbles",
    titleKey: "paywall.spotChatTitle",
    descKey: "paywall.spotChatDesc",
    bulletKeys: ["paywall.spotChatB1", "paywall.spotChatB2", "paywall.spotChatB3"],
    gridTitleKey: "paywall.fChatTitle",
  },
  vocab: {
    accent: "#047857",
    spotBg: "#047857",
    icon: "book",
    titleKey: "paywall.spotVocabTitle",
    descKey: "paywall.spotVocabDesc",
    bulletKeys: ["paywall.spotVocabB1", "paywall.spotVocabB2", "paywall.spotVocabB3"],
    gridTitleKey: "paywall.fVocabTitle",
  },
};

// Maps a RevenueCat package's billing period to a friendly name + price suffix +
// subtitle. Prices themselves always come from product.priceString (never hardcoded).
function packageMeta(
  pkg: PurchasesPackage,
  t: ReturnType<typeof useT>,
): { name: string; suffix: string; sub: string } {
  switch (pkg.packageType) {
    case "WEEKLY":
      return { name: t("paywall.weekly"), suffix: t("paywall.perWeek"), sub: t("paywall.weeklySub") };
    case "MONTHLY":
      return { name: t("paywall.monthly"), suffix: t("paywall.perMonth"), sub: t("paywall.monthlySub") };
    case "ANNUAL":
      return { name: t("paywall.annual"), suffix: t("paywall.perYear"), sub: t("paywall.annualSub") };
    default:
      return { name: pkg.product.title || pkg.identifier, suffix: "", sub: t("paywall.planSub") };
  }
}

// Reads a free-trial introductory offer off a package, if any. A free trial is an
// intro price of 0 — it is configured per product in App Store Connect / Google
// Play and surfaced by RevenueCat (the app never grants it). Returns the trial
// length so the UI can advertise it.
function freeTrial(
  pkg: PurchasesPackage,
  ineligibleIds: string[] | null,
): { count: number; unit: string } | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price > 0 || intro.periodNumberOfUnits <= 0) return null;
  // Suppress the trial for users who already redeemed it (iOS eligibility).
  if (ineligibleIds?.includes(pkg.product.identifier)) return null;
  return { count: intro.periodNumberOfUnits, unit: intro.periodUnit };
}

// Localized lowercase unit word for a RevenueCat periodUnit (DAY/WEEK/MONTH/YEAR).
function unitWord(t: ReturnType<typeof useT>, unit: string): string {
  switch (unit) {
    case "DAY":
      return t("paywall.unitDay");
    case "WEEK":
      return t("paywall.unitWeek");
    case "MONTH":
      return t("paywall.unitMonth");
    case "YEAR":
      return t("paywall.unitYear");
    default:
      return unit.toLowerCase();
  }
}

function trialLabel(t: ReturnType<typeof useT>, info: { count: number; unit: string }): string {
  return t("paywall.freeTrial", { n: info.count, unit: unitWord(t, info.unit) });
}

export default function PaywallScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  const featureTheme =
    feature === "chat" || feature === "vocab" ? FEATURE_THEMES[feature] : null;
  const accent = featureTheme?.accent ?? colors.primary;
  const accentSoft = featureTheme ? `${featureTheme.accent}1F` : colors.primarySoft;
  // When a feature is spotlighted, the grid below lists the *other* Pro perks.
  const gridFeatures = featureTheme
    ? FEATURES.filter((f) => f.titleKey !== featureTheme.gridTitleKey)
    : FEATURES;
  const {
    offerings,
    ineligibleTrialProductIds,
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

  // Compute annual savings vs. paying monthly for a year, using RevenueCat's own
  // annualized number for the monthly product. Only shown when both plans exist
  // and the annual price is genuinely cheaper.
  const monthlyPkg = useMemo(
    () => packages.find((p) => p.packageType === "MONTHLY"),
    [packages],
  );
  const annualSavings = (annualPkg: PurchasesPackage): { percent: number; strike: string } | null => {
    const annual = annualPkg.product.price;
    const perYear = monthlyPkg?.product.pricePerYear ?? null;
    const perYearStr = monthlyPkg?.product.pricePerYearString ?? null;
    if (!perYear || !perYearStr || annual <= 0 || perYear <= annual) return null;
    const percent = Math.round((1 - annual / perYear) * 100);
    // Guard against implausible values from incomplete price data (e.g. the
    // RevenueCat web test store leaves some numeric fields unreliable). A real
    // annual-vs-monthly discount comfortably falls below 90%.
    if (percent <= 0 || percent >= 90) return null;
    return { percent, strike: perYearStr };
  };

  const [result, setResult] = useState<ResultKind>(null);

  const topPadding = Platform.OS === "web" ? 12 : insets.top + 6;
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

  const openLink = (url: string) => {
    Haptics.selectionAsync();
    Linking.openURL(url).catch(() => {});
  };

  const dismissResult = () => {
    const wasUnlock = result === "success" || result === "restored";
    setResult(null);
    if (wasUnlock) close();
  };

  const selectedTrial = selectedPackage ? freeTrial(selectedPackage, ineligibleTrialProductIds) : null;

  const ctaLabel = selectedTrial
    ? t("paywall.startTrial")
    : selectedPackage
      ? t("paywall.continueWith", { plan: packageMeta(selectedPackage, t).name })
      : t("paywall.continueGeneric");

  // Reassures the user what they'll be charged after a free trial ends.
  const trialNote =
    selectedTrial && selectedPackage
      ? t("paywall.trialNote", {
          n: selectedTrial.count,
          unit: unitWord(t, selectedTrial.unit),
          price: `${selectedPackage.product.priceString}${packageMeta(selectedPackage, t).suffix}`,
        })
      : null;

  // A Pro user reaching the paywall (e.g. opened from settings) sees a simple
  // confirmation rather than purchase options.
  if (isSubscribed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPadding }]}>
        <View style={styles.header}>
          <CloseButton onPress={close} color={colors.foreground} />
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("paywall.header")}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.activeWrap}>
          <View style={[styles.heroLock, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark" size={36} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold", textAlign: "center" }]}>
            {t("paywall.activeTitle")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }]}>
            {t("paywall.activeBody")}
          </Text>
          <TouchableOpacity
            style={[styles.solidBtn, { backgroundColor: colors.primary }]}
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
      <View style={styles.header}>
        <CloseButton onPress={close} color={colors.foreground} />
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("paywall.header")}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t("paywall.title")}
            </Text>
            <Text style={[styles.titleAccent, { color: accent, fontFamily: "Inter_700Bold" }]}>
              {t("paywall.titleAccent")}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("paywall.subtitle")}
            </Text>
          </View>
          <View style={styles.heroGraphic}>
            <Ionicons
              name="sparkles"
              size={15}
              color={accent}
              style={{ position: "absolute", top: 0, right: 4 }}
            />
            <Ionicons
              name="sparkles"
              size={10}
              color={accent}
              style={{ position: "absolute", bottom: 8, left: 2, opacity: 0.7 }}
            />
            <View style={[styles.heroCube, { backgroundColor: accentSoft }]} />
            <View style={[styles.heroLock, { backgroundColor: accent, shadowColor: accent }]}>
              <Ionicons name="lock-closed" size={32} color="#FFFFFF" />
            </View>
          </View>
        </View>

        {/* Feature spotlight — a deep-dive on the feature the user tapped. */}
        {featureTheme && (
          <View style={[styles.spotlight, { backgroundColor: featureTheme.spotBg }]}>
            <View style={styles.spotlightWatermark} pointerEvents="none">
              <Ionicons name={featureTheme.icon} size={120} color="#FFFFFF" />
            </View>
            <View style={styles.spotlightBadge}>
              <Ionicons name={featureTheme.icon} size={24} color="#FFFFFF" />
            </View>
            <Text style={[styles.spotlightTitle, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
              {t(featureTheme.titleKey)}
            </Text>
            <Text style={[styles.spotlightDesc, { color: "#FFFFFF", fontFamily: "Inter_500Medium" }]}>
              {t(featureTheme.descKey)}
            </Text>
            <View style={styles.spotlightBullets}>
              {featureTheme.bulletKeys.map((bk) => (
                <View key={bk} style={styles.spotlightBulletRow}>
                  <View style={styles.spotlightCheck}>
                    <Ionicons name="checkmark" size={13} color={featureTheme.spotBg} />
                  </View>
                  <Text
                    style={[styles.spotlightBulletText, { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }]}
                  >
                    {t(bk)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Premium features */}
        <View style={[styles.featuresCard, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.featuresTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t(featureTheme ? "paywall.spotEverything" : "paywall.featuresTitle")}
          </Text>
          <View style={styles.featuresGrid}>
            {gridFeatures.map((f) => (
              <View key={f.titleKey} style={[styles.featureItem, { backgroundColor: colors.card }]}>
                <View style={[styles.featureIcon, { backgroundColor: f.bg }]}>
                  <Ionicons name={f.icon} size={18} color="#FFFFFF" />
                </View>
                <Text
                  style={[styles.featureTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                  numberOfLines={1}
                >
                  {t(f.titleKey)}
                </Text>
                <Text
                  style={[styles.featureDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                >
                  {t(f.descKey)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Choose your plan */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("paywall.choosePlan")}
        </Text>

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
              const savings = isAnnual ? annualSavings(pkg) : null;
              const trial = freeTrial(pkg, ineligibleTrialProductIds);
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedId(pkg.identifier);
                  }}
                  activeOpacity={0.85}
                >
                  {isAnnual && (
                    <View style={styles.planTopRow}>
                      <View style={[styles.bestValue, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.bestValueText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
                          {t("paywall.bestValue")}
                        </Text>
                      </View>
                      {savings && (
                        <View style={[styles.savePill, { backgroundColor: "#DCFCE7" }]}>
                          <Text style={[styles.savePillText, { color: "#15803D", fontFamily: "Inter_700Bold" }]}>
                            {t("paywall.save", { n: savings.percent })}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                  <View style={styles.planMainRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                        {meta.name}
                      </Text>
                      <Text style={[styles.planSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {meta.sub}
                      </Text>
                      {trial && (
                        <View style={[styles.trialChip, { backgroundColor: colors.primarySoft }]}>
                          <Ionicons name="gift" size={11} color={colors.primary} />
                          <Text style={[styles.trialChipText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                            {trialLabel(t, trial)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={[styles.bigPrice, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                        {pkg.product.priceString}
                      </Text>
                      {savings ? (
                        <Text style={[styles.strikePrice, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          {savings.strike}
                          {meta.suffix}
                        </Text>
                      ) : (
                        <Text style={[styles.smallPrice, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          {pkg.product.priceString}
                          {meta.suffix}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.radio,
                        { borderColor: selected ? colors.primary : colors.border },
                      ]}
                    >
                      {selected && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          onPress={onSubscribe}
          disabled={!selectedPackage || isPurchasing}
          activeOpacity={0.9}
          style={[styles.ctaWrap, { opacity: !selectedPackage || isPurchasing ? 0.6 : 1 }]}
        >
          <LinearGradient
            colors={["#8A6BFF", "#5B3FD9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.subscribeBtn}
          >
            {isPurchasing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.ctaInner}>
                <MaterialCommunityIcons name="crown" size={19} color="#FFFFFF" />
                <Text style={[styles.subscribeText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
                  {ctaLabel}
                </Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {trialNote && (
          <Text style={[styles.trialNote, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {trialNote}
          </Text>
        )}

        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark" size={14} color={colors.mutedForeground} />
          <Text style={[styles.secureText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("paywall.securePayment")}
          </Text>
        </View>

        {/* Footer links */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={onRestore} disabled={isRestoring} activeOpacity={0.7} hitSlop={8}>
            {isRestoring ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Text style={[styles.footerLink, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {t("paywall.restoreShort")}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={[styles.footerDot, { color: colors.mutedForeground }]}>·</Text>
          <TouchableOpacity onPress={() => openLink(TERMS_URL)} activeOpacity={0.7} hitSlop={8}>
            <Text style={[styles.footerLink, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {t("paywall.tos")}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.footerDot, { color: colors.mutedForeground }]}>·</Text>
          <TouchableOpacity onPress={() => openLink(PRIVACY_URL)} activeOpacity={0.7} hitSlop={8}>
            <Text style={[styles.footerLink, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {t("paywall.privacy")}
            </Text>
          </TouchableOpacity>
        </View>

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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  closeBtn: { padding: 8, width: 42 },
  headerTitle: { fontSize: 17, textAlign: "center" },
  headerSpacer: { width: 42 },
  scroll: { paddingHorizontal: 20, paddingTop: 6 },

  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroText: { flex: 1 },
  title: { fontSize: 26, letterSpacing: -0.5, lineHeight: 31 },
  titleAccent: { fontSize: 26, letterSpacing: -0.5, lineHeight: 31 },
  subtitle: { fontSize: 13.5, lineHeight: 19, marginTop: 8 },
  heroGraphic: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCube: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 60,
    height: 60,
    borderRadius: 16,
    transform: [{ rotate: "12deg" }],
  },
  heroLock: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
    shadowColor: "#7C5CFF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },

  featuresCard: {
    borderRadius: 20,
    padding: 16,
    marginTop: 20,
  },
  featuresTitle: { fontSize: 16, marginBottom: 12 },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  featureItem: {
    width: "48%",
    borderRadius: 16,
    padding: 12,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  featureTitle: { fontSize: 13.5 },
  featureDesc: { fontSize: 11, lineHeight: 15, marginTop: 2 },

  spotlight: {
    borderRadius: 20,
    padding: 18,
    marginTop: 20,
    overflow: "hidden",
    gap: 10,
  },
  spotlightWatermark: { position: "absolute", right: -14, bottom: -18, opacity: 0.16 },
  spotlightBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  spotlightTitle: { fontSize: 20, letterSpacing: -0.3 },
  spotlightDesc: { fontSize: 13.5, lineHeight: 19, opacity: 0.95 },
  spotlightBullets: { gap: 9, marginTop: 4 },
  spotlightBulletRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  spotlightCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  spotlightBulletText: { flex: 1, fontSize: 13, lineHeight: 17 },

  sectionTitle: { fontSize: 17, marginTop: 22, marginBottom: 12 },

  loadingWrap: { alignItems: "center", gap: 10, paddingVertical: 28 },
  loadingText: { fontSize: 13, textAlign: "center" },

  plans: { gap: 12 },
  planCard: {
    borderRadius: 18,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  planTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  bestValue: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  bestValueText: { fontSize: 10, letterSpacing: 0.5 },
  savePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  savePillText: { fontSize: 10, letterSpacing: 0.3 },
  planMainRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  planName: { fontSize: 17 },
  planSub: { fontSize: 12.5, marginTop: 2 },
  priceCol: { alignItems: "flex-end" },
  bigPrice: { fontSize: 20 },
  smallPrice: { fontSize: 12, marginTop: 2 },
  strikePrice: { fontSize: 12, marginTop: 2, textDecorationLine: "line-through" },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 12, height: 12, borderRadius: 6 },

  trialChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  trialChipText: { fontSize: 10.5, letterSpacing: 0.2 },
  trialNote: { fontSize: 13, textAlign: "center", marginTop: 12, lineHeight: 18 },

  ctaWrap: { marginTop: 20 },
  subscribeBtn: {
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  subscribeText: { fontSize: 16 },
  solidBtn: {
    alignSelf: "stretch",
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },

  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
  },
  secureText: { fontSize: 12.5 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  footerLink: { fontSize: 13 },
  footerDot: { fontSize: 13 },

  terms: { fontSize: 11, textAlign: "center", lineHeight: 16, paddingHorizontal: 12, marginTop: 14 },

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
