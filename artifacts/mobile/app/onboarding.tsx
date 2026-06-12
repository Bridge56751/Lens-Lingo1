import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import {
  usePreferences,
  LANGUAGES,
  LANGUAGE_FLAGS,
  DIFFICULTIES,
  type Language,
  type Difficulty,
} from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { usePro } from "@/hooks/usePro";
import { LOCALE_NATIVE_NAMES, type Locale, type TKey } from "@/constants/translations";

const { width } = Dimensions.get("window");
const GRID_GAP = 12;
const GRID_PADDING = 24;
const CHIP_WIDTH = (width - GRID_PADDING * 2 - GRID_GAP) / 2;

type FeatureSlide = {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  fg: string;
  titleKey: TKey;
  descKey: TKey;
};

const FEATURES: FeatureSlide[] = [
  {
    icon: "scan",
    bg: "#7C5CFF",
    fg: "#FFFFFF",
    titleKey: "onboarding.scanTitle",
    descKey: "onboarding.scanDesc",
  },
  {
    icon: "chatbubbles",
    bg: "#EA580C",
    fg: "#FFFFFF",
    titleKey: "onboarding.chatTitle",
    descKey: "onboarding.chatDesc",
  },
  {
    icon: "text",
    bg: "#FBBF24",
    fg: "#422006",
    titleKey: "onboarding.abcTitle",
    descKey: "onboarding.abcDesc",
  },
  {
    icon: "chatbox-ellipses",
    bg: "#2563EB",
    fg: "#FFFFFF",
    titleKey: "onboarding.sentencesTitle",
    descKey: "onboarding.sentencesDesc",
  },
  {
    icon: "book",
    bg: "#047857",
    fg: "#FFFFFF",
    titleKey: "onboarding.vocabTitle",
    descKey: "onboarding.vocabDesc",
  },
];

type Page =
  | { kind: "welcome" }
  | { kind: "language" }
  | { kind: "level" }
  | { kind: "features" };

const PAGES: Page[] = [
  { kind: "welcome" },
  { kind: "language" },
  { kind: "level" },
  { kind: "features" },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { prefs, update } = usePreferences();
  const { requirePro } = usePro();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === PAGES.length - 1;
  const accent = colors.primary;

  const langOptions = LANGUAGES.filter((l) => l !== prefs.nativeLanguage);

  const finish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    update("onboardingSeen", true);
    // "Take tour" replay: onboarding was pushed over the tabs (back stack
    // exists), so just pop back — a returning user shouldn't see the paywall
    // again.
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // First launch (reached via Redirect, no back stack): replace onboarding (a
    // fullScreenModal) with the paywall; its close() falls back to the tabs.
    router.replace("/paywall");
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(PAGES.length - 1, next));
    Haptics.selectionAsync();
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setIndex(clamped);
  };

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    goTo(index + 1);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const pickLanguage = (lang: Language) => {
    if (lang === prefs.targetLanguage) return;
    const apply = () => {
      Haptics.selectionAsync();
      update("targetLanguage", lang);
    };
    // First-run onboarding: the user picks their starting language for free.
    // On a replay ("Take tour", which keeps onboardingSeen=true), switching the
    // locked language is a Pro feature — otherwise re-entering onboarding is a
    // paywall bypass. requirePro also no-ops while plan status is still loading
    // so a genuine Pro user isn't bounced on a cold start.
    if (!prefs.onboardingSeen) {
      apply();
      return;
    }
    // English stays free everywhere (matches the Home + Settings language
    // pickers), so a replay-tour switch to English is never Pro-gated.
    if (lang === "English") {
      apply();
      return;
    }
    requirePro(apply, "langs");
  };

  const pickLevel = (level: Difficulty) => {
    if (level !== prefs.difficulty) {
      Haptics.selectionAsync();
      update("difficulty", level);
    }
  };

  const ctaLabel = isLast ? t("onboarding.getStarted") : t("onboarding.continue");

  const renderWelcome = () => (
    <View style={styles.centerSlide}>
      <Image
        source={require("../assets/images/logo.png")}
        style={styles.logo}
        resizeMode="contain"
        fadeDuration={0}
      />
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("onboarding.welcomeTitle")}
      </Text>
      <Text style={[styles.desc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t("onboarding.welcomeDesc")}
      </Text>
    </View>
  );

  const renderFeatures = () => (
    <ScrollView
      style={styles.formSlide}
      contentContainerStyle={styles.formContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.formTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("onboarding.howTitle")}
      </Text>
      <Text style={[styles.formDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t("onboarding.howDesc")}
      </Text>
      <View style={styles.featureList} pointerEvents="none">
        {FEATURES.map((slide) => (
          <View key={slide.titleKey} style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: slide.bg }]}>
              <Ionicons name={slide.icon} size={24} color={slide.fg} />
            </View>
            <View style={styles.featureRowText}>
              <Text
                style={[styles.featureRowTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
              >
                {t(slide.titleKey)}
              </Text>
              <Text
                style={[styles.featureRowDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
              >
                {t(slide.descKey)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderLanguage = () => (
    <ScrollView
      style={styles.formSlide}
      contentContainerStyle={styles.formContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.formTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("onboarding.langTitle")}
      </Text>
      <Text style={[styles.formDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t("onboarding.langDesc")}
      </Text>
      <View style={styles.grid}>
        {langOptions.map((lang) => {
          const active = lang === prefs.targetLanguage;
          const nativeName = LOCALE_NATIVE_NAMES[lang as Locale] ?? lang;
          return (
            <TouchableOpacity
              key={lang}
              activeOpacity={0.8}
              onPress={() => pickLanguage(lang)}
              style={[
                styles.langChip,
                {
                  backgroundColor: active ? colors.primarySoft : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              {active ? (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.primary}
                  style={styles.chipCheck}
                />
              ) : null}
              <Text style={styles.chipFlag}>{LANGUAGE_FLAGS[lang]}</Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.chipNative,
                  { color: active ? colors.primary : colors.foreground, fontFamily: "Inter_700Bold" },
                ]}
              >
                {nativeName}
              </Text>
              {nativeName !== lang ? (
                <Text
                  numberOfLines={1}
                  style={[styles.chipName, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
                >
                  {lang}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.lockNote, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="lock-closed" size={16} color={colors.primary} />
        <Text style={[styles.lockNoteText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
          {t("onboarding.langLockNote")}
        </Text>
      </View>
    </ScrollView>
  );

  const renderLevel = () => (
    <ScrollView
      style={styles.formSlide}
      contentContainerStyle={styles.formContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.formTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("onboarding.levelTitle")}
      </Text>
      <Text style={[styles.formDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t("onboarding.levelDesc")}
      </Text>
      <View style={styles.levelList}>
        {DIFFICULTIES.map((level) => {
          const active = level === prefs.difficulty;
          return (
            <TouchableOpacity
              key={level}
              activeOpacity={0.8}
              onPress={() => pickLevel(level)}
              style={[
                styles.levelCard,
                {
                  backgroundColor: active ? colors.primarySoft : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.levelHeader}>
                <Text
                  style={[
                    styles.levelTitle,
                    { color: active ? colors.primary : colors.foreground, fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {t(`difficulty.${level}` as TKey)}
                </Text>
                <Ionicons
                  name={active ? "checkmark-circle" : "ellipse-outline"}
                  size={22}
                  color={active ? colors.primary : colors.border}
                />
              </View>
              <Text style={[styles.levelDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {t(`difficulty.${level}Desc` as TKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderPage = (p: Page) => {
    switch (p.kind) {
      case "welcome":
        return renderWelcome();
      case "language":
        return renderLanguage();
      case "level":
        return renderLevel();
      case "features":
        return renderFeatures();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        {index > 0 ? (
          <TouchableOpacity onPress={() => goTo(index - 1)} hitSlop={12} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <TouchableOpacity onPress={finish} hitSlop={12} activeOpacity={0.7}>
          <Text style={[styles.skip, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {t("onboarding.skip")}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
      >
        {PAGES.map((p, i) => (
          <View key={i} style={[styles.page, { width }]}>
            {renderPage(p)}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? accent : colors.border,
                  width: i === index ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: accent }]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          <Text style={[styles.ctaText, { fontFamily: "Inter_700Bold" }]}>{ctaLabel}</Text>
          <Ionicons name={isLast ? "checkmark" : "arrow-forward"} size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  backSpacer: { width: 26 },
  skip: { fontSize: 15 },
  page: { flex: 1 },
  centerSlide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  logo: { width: 156, height: 156, borderRadius: 36, marginBottom: 40 },
  title: { fontSize: 28, letterSpacing: -0.5, textAlign: "center", marginBottom: 14 },
  desc: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  formSlide: { flex: 1 },
  formContent: { paddingHorizontal: GRID_PADDING, paddingTop: 12, paddingBottom: 24 },
  formTitle: { fontSize: 26, lineHeight: 33, letterSpacing: -0.5, marginBottom: 8 },
  formDesc: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  langChip: {
    width: CHIP_WIDTH,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  chipCheck: { position: "absolute", top: 10, right: 10 },
  chipFlag: { fontSize: 30, marginBottom: 8, textAlign: "left", writingDirection: "ltr" },
  chipNative: { fontSize: 19, letterSpacing: -0.3, textAlign: "left", writingDirection: "ltr" },
  chipName: { fontSize: 13, marginTop: 2, textAlign: "left", writingDirection: "ltr" },
  lockNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  lockNoteText: { flex: 1, fontSize: 13, lineHeight: 18 },
  levelList: { gap: 12 },
  levelCard: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  levelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  levelTitle: { fontSize: 19, letterSpacing: -0.3 },
  levelDesc: { fontSize: 14, lineHeight: 20 },
  featureList: { gap: 18, marginTop: 2 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 15 },
  featureIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  featureRowText: { flex: 1 },
  featureRowTitle: { fontSize: 17, letterSpacing: -0.2, marginBottom: 3 },
  featureRowDesc: { fontSize: 14, lineHeight: 19 },
  footer: { paddingHorizontal: 24, gap: 24, paddingTop: 8 },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 },
  dot: { height: 8, borderRadius: 4 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 17,
    borderRadius: 18,
  },
  ctaText: { fontSize: 17, color: "#FFFFFF" },
});
