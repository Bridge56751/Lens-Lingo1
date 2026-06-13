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
type PaywallFeature = "chat" | "vocab" | "langs";

const FEATURE_THEMES: Record<
  PaywallFeature,
  {
    accent: string;
    // Spotlight-panel background. Can be a touch darker than `accent` so white
    // body text stays legible (WCAG AA) on the large colored card.
    spotBg: string;
    // [light, dark] pair for the main CTA button gradient.
    gradient: readonly [string, string];
    icon: keyof typeof Ionicons.glyphMap;
    titleKey: TKey;
    bulletKeys: readonly TKey[];
    gridTitleKey: TKey;
  }
> = {
  chat: {
    accent: "#EA580C",
    spotBg: "#C2410C",
    gradient: ["#F97316", "#EA580C"],
    icon: "chatbubbles",
    titleKey: "paywall.spotChatTitle",
    bulletKeys: [
      "paywall.spotChatB1",
      "paywall.spotChatB2",
      "paywall.spotChatB3",
      "paywall.spotChatB4",
    ],
    gridTitleKey: "paywall.fChatTitle",
  },
  vocab: {
    accent: "#047857",
    spotBg: "#047857",
    gradient: ["#10B981", "#047857"],
    icon: "book",
    titleKey: "paywall.spotVocabTitle",
    bulletKeys: ["paywall.spotVocabB1", "paywall.spotVocabB2", "paywall.spotVocabB3"],
    gridTitleKey: "paywall.fVocabTitle",
  },
  langs: {
    accent: "#0EA5E9",
    spotBg: "#0369A1",
    gradient: ["#38BDF8", "#0EA5E9"],
    icon: "globe",
    titleKey: "paywall.spotLangsTitle",
    bulletKeys: ["paywall.spotLangsB1", "paywall.spotLangsB2", "paywall.spotLangsB3"],
    gridTitleKey: "paywall.fLangsTitle",
  },
};

// Sort weight so plan cards always render shortest → longest cadence.
const PACKAGE_ORDER: Record<string, number> = { WEEKLY: 0, MONTHLY: 1, ANNUAL: 2 };

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
    feature === "chat" || feature === "vocab" || feature === "langs"
      ? FEATURE_THEMES[feature]
      : null;
  const accent = featureTheme?.accent ?? colors.primary;
  const accentSoft = featureTheme ? `${featureTheme.accent}1F` : colors.primarySoft;
  // Every purchase-flow accent (CTA, plan selection, price, badges) follows the
  // tapped feature's color; with no feature it falls back to the brand purple.
  const ctaGradient: readonly [string, string] = featureTheme
    ? featureTheme.gradient
    : ["#8A6BFF", "#5B3FD9"];
  // When a feature is spotlighted, the grid below lists the *other* Pro perks.
  const gridFeatures = featureTheme
    ? FEATURES.filter((f) => f.titleKey !== featureTheme.gridTitleKey)
    : FEATURES;
  // On the generic (no-spotlight) paywall, surface Unlimited Scans as a
  // full-width hero card with the remaining four laid out in a 2x2 grid.
  const wideFeature = featureTheme ? null : gridFeatures[0];
  const gridItems = wideFeature ? gridFeatures.slice(1) : gridFeatures;
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

  // Always list plans shortest → longest (Weekly, Monthly, Annual), regardless
  // of the order the offering happens to return them in.
  const packages = useMemo<PurchasesPackage[]>(() => {
    const list = offerings?.current?.availablePackages ?? [];
    return [...list].sort(
      (a, b) => (PACKAGE_ORDER[a.packageType] ?? 99) - (PACKAGE_ORDER[b.packageType] ?? 99),
    );
  }, [offerings]);

  // Default-select the annual plan (best value) when present, else the first.
  const defaultId = useMemo(() => {
    const annual = packages.find((p) => p.packageType === "ANNUAL");
    return annual?.identifier ?? packages[0]?.identifier ?? null;
  }, [packages]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? defaultId;
  const selectedPackage = packages.find((p) => p.identifier === activeId) ?? null;

  // Reference packages used to compute each plan's discount vs. the next-shorter
  // cadence (Annual vs 12× monthly, Monthly vs ~4.3× weekly).
  const weeklyPkg = useMemo(
    () => packages.find((p) => p.packageType === "WEEKLY"),
    [packages],
  );
  const monthlyPkg = useMemo(
    () => packages.find((p) => p.packageType === "MONTHLY"),
    [packages],
  );
  // Each plan's percentage saving vs. the next-shorter cadence, compared on an
  // annualized basis from each package's real `price` (Annual vs 12× monthly,
  // Monthly vs 52× weekly). We use the raw price ratio rather than the SDK's
  // normalized pricePerYear/pricePerMonth numbers — those are frequently
  // unpopulated in RevenueCat Browser Mode (Expo Go / web), which is why no
  // percentage was showing. `strike` is the formatted "before" price (a reliable
  // *String field) to render struck through, or null when unavailable. Returns
  // null when data is missing or implausible so nothing bogus renders.
  const planSavings = (
    pkg: PurchasesPackage,
  ): { percent: number; strike: string | null } | null => {
    let priceAnnualized: number | null = null;
    let baselineAnnualized: number | null = null;
    let strike: string | null = null;
    if (pkg.packageType === "ANNUAL" && monthlyPkg) {
      priceAnnualized = pkg.product.price;
      baselineAnnualized = monthlyPkg.product.price * 12;
      strike = monthlyPkg.product.pricePerYearString ?? null;
    } else if (pkg.packageType === "MONTHLY" && weeklyPkg) {
      priceAnnualized = pkg.product.price * 12;
      baselineAnnualized = weeklyPkg.product.price * 52;
      strike = weeklyPkg.product.pricePerMonthString ?? null;
    }
    if (
      priceAnnualized == null ||
      baselineAnnualized == null ||
      !Number.isFinite(priceAnnualized) ||
      !Number.isFinite(baselineAnnualized) ||
      priceAnnualized <= 0 ||
      baselineAnnualized <= priceAnnualized
    ) {
      return null;
    }
    const percent = Math.round((1 - priceAnnualized / baselineAnnualized) * 100);
    if (percent <= 0 || percent >= 95) return null;
    return { percent, strike };
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
    if (wasUnlock) {
      // Keep the success modal on screen while we navigate away. Clearing the
      // result first would briefly reveal the "You're already Pro" branch (now
      // that isSubscribed is true) — a redundant second confirmation. Leaving
      // it set means the paywall just unmounts on close with no flash.
      close();
      return;
    }
    setResult(null);
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

  // The feature grid. On a contextual paywall (spotlight present) this is the
  // "Everything else in Pro" recap that sits BELOW the plans; on the generic
  // paywall (no spotlight) it becomes the value showcase rendered ABOVE the
  // plans so the user sees what Pro unlocks before the price.
  const featuresCard = (
    <View style={[styles.featuresCard, { backgroundColor: accentSoft }]}>
      <Text style={[styles.featuresTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t(featureTheme ? "paywall.spotEverything" : "paywall.featuresTitle")}
      </Text>
      {wideFeature && (
        <View style={[styles.featureWide, { backgroundColor: colors.card }]}>
          <View style={[styles.featureIcon, { backgroundColor: wideFeature.bg, marginBottom: 0 }]}>
            <Ionicons name={wideFeature.icon} size={18} color="#FFFFFF" />
          </View>
          <View style={styles.featureWideText}>
            <Text
              style={[styles.featureTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
              numberOfLines={1}
            >
              {t(wideFeature.titleKey)}
            </Text>
            <Text
              style={[styles.featureDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
            >
              {t(wideFeature.descKey)}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.featuresGrid}>
        {gridItems.map((f) => (
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
  );

  // A Pro user reaching the paywall (e.g. opened from settings) sees a simple
  // confirmation rather than purchase options. Guard on `result === null` so a
  // just-completed purchase keeps showing its own success modal instead of
  // immediately flipping to this branch — otherwise the user gets two
  // back-to-back "thank you" screens.
  if (isSubscribed && result === null) {
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

        {/* Feature spotlight — a deep-dive panel themed to the tapped feature
            (orange chat, green vocabulary, blue languages). Shown whenever the
            paywall is opened for a specific locked feature so that feature's value
            prop leads the page, mirroring the home cards. */}
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

        {/* Generic paywall (no spotlight): show the feature value showcase ABOVE
            the plans so the user sees what Pro unlocks before the price. */}
        {!featureTheme && featuresCard}

        {/* Choose your plan */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("paywall.choosePlan")}
        </Text>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={accent} />
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
              const isMonthly = pkg.packageType === "MONTHLY";
              const savings = planSavings(pkg);
              const badgeLabel = isAnnual
                ? t("paywall.bestValue")
                : isMonthly
                  ? t("paywall.mostPopular")
                  : null;
              const trial = freeTrial(pkg, ineligibleTrialProductIds);
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: selected ? accent : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedId(pkg.identifier);
                  }}
                  activeOpacity={0.85}
                >
                  {(badgeLabel || savings) && (
                    <View style={styles.planTopRow}>
                      {badgeLabel && (
                        <View style={[styles.bestValue, { backgroundColor: accent }]}>
                          <Text style={[styles.bestValueText, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
                            {badgeLabel}
                          </Text>
                        </View>
                      )}
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
                        <View style={[styles.trialChip, { backgroundColor: accentSoft }]}>
                          <Ionicons name="gift" size={11} color={accent} />
                          <Text style={[styles.trialChipText, { color: accent, fontFamily: "Inter_700Bold" }]}>
                            {trialLabel(t, trial)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={[styles.bigPrice, { color: accent, fontFamily: "Inter_700Bold" }]}>
                        {pkg.product.priceString}
                      </Text>
                      {savings?.strike ? (
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
                        { borderColor: selected ? accent : colors.border },
                      ]}
                    >
                      {selected && <View style={[styles.radioDot, { backgroundColor: accent }]} />}
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
            colors={ctaGradient}
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

        {/* Contextual paywall (spotlight present): the tapped feature leads at the
            top, so this "Everything else in Pro" recap sits below the plans + CTA
            and the first price stays reachable without scrolling. */}
        {featureTheme && featuresCard}

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
              <Text style={[styles.footerLink, { color: accent, fontFamily: "Inter_600SemiBold" }]}>
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
                    result === "error" ? "#FEE2E2" : accentSoft,
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
                color={result === "error" ? "#DC2626" : accent}
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
              style={[styles.modalBtn, { backgroundColor: accent }]}
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
  featureWide: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 12,
    gap: 12,
    marginBottom: 12,
  },
  featureWideText: { flex: 1 },

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
