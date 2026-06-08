import React, { useRef, useState } from "react";
import {
  View,
  Text,
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
  DIFFICULTIES,
  type Language,
  type Difficulty,
} from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { LOCALE_NATIVE_NAMES, type Locale, type TKey } from "@/constants/translations";

const { width } = Dimensions.get("window");
const GRID_GAP = 12;
const GRID_PADDING = 24;
const CHIP_WIDTH = (width - GRID_PADDING * 2 - GRID_GAP) / 2;

type FeatureSlide = {
  icon: keyof typeof Ionicons.glyphMap;
  glyph: string;
  color: string;
  soft: string;
  titleKey: TKey;
  descKey: TKey;
};

const FEATURES: FeatureSlide[] = [
  {
    icon: "scan",
    glyph: "📷",
    color: "#7C5CFF",
    soft: "#EFE9FF",
    titleKey: "onboarding.scanTitle",
    descKey: "onboarding.scanDesc",
  },
  {
    icon: "chatbubbles",
    glyph: "AI",
    color: "#EA580C",
    soft: "#FFEDD5",
    titleKey: "onboarding.chatTitle",
    descKey: "onboarding.chatDesc",
  },
  {
    icon: "text",
    glyph: "Aa",
    color: "#F59E0B",
    soft: "#FEF3C7",
    titleKey: "onboarding.abcTitle",
    descKey: "onboarding.abcDesc",
  },
  {
    icon: "chatbox-ellipses",
    glyph: "Hi",
    color: "#2563EB",
    soft: "#DBEAFE",
    titleKey: "onboarding.sentencesTitle",
    descKey: "onboarding.sentencesDesc",
  },
];

type Page =
  | { kind: "welcome" }
  | { kind: "language" }
  | { kind: "level" }
  | { kind: "feature"; slide: FeatureSlide };

const PAGES: Page[] = [
  { kind: "welcome" },
  { kind: "language" },
  { kind: "level" },
  ...FEATURES.map((slide) => ({ kind: "feature", slide }) as Page),
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { prefs, update } = usePreferences();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === PAGES.length - 1;
  const page = PAGES[index];
  const accent = page.kind === "feature" ? page.slide.color : colors.primary;

  const langOptions = LANGUAGES.filter((l) => l !== prefs.nativeLanguage);

  const finish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    update("onboardingSeen", true);
    // When opened manually (e.g. "Take tour" from home) onboarding is pushed on
    // top of the existing tabs, so pop back to avoid stacking a new tabs screen
    // each time. On first launch it's reached via Redirect (no back stack), so
    // fall back to replacing into the tabs.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
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
    if (lang !== prefs.targetLanguage) {
      Haptics.selectionAsync();
      update("targetLanguage", lang);
    }
  };

  const pickLevel = (level: Difficulty) => {
    if (level !== prefs.difficulty) {
      Haptics.selectionAsync();
      update("difficulty", level);
    }
  };

  const ctaLabel = isLast
    ? t("onboarding.getStarted")
    : page.kind === "feature"
      ? t("onboarding.next")
      : t("onboarding.continue");

  const renderWelcome = () => (
    <View style={styles.centerSlide}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="language" size={76} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("onboarding.welcomeTitle")}
      </Text>
      <Text style={[styles.desc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t("onboarding.welcomeDesc")}
      </Text>
    </View>
  );

  const renderFeature = (slide: FeatureSlide) => (
    <View style={styles.centerSlide}>
      <View style={[styles.iconWrap, { backgroundColor: slide.soft }]}>
        <Text style={[styles.glyph, { color: slide.color }]}>{slide.glyph}</Text>
        <View style={[styles.iconBadge, { backgroundColor: slide.color }]}>
          <Ionicons name={slide.icon} size={26} color="#FFFFFF" />
        </View>
      </View>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t(slide.titleKey)}
      </Text>
      <Text style={[styles.desc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t(slide.descKey)}
      </Text>
    </View>
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
      case "feature":
        return renderFeature(p.slide);
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
  iconWrap: {
    width: 168,
    height: 168,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 44,
  },
  glyph: { fontSize: 64, fontWeight: "800" },
  iconBadge: {
    position: "absolute",
    bottom: -14,
    right: -14,
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 28, letterSpacing: -0.5, textAlign: "center", marginBottom: 14 },
  desc: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  formSlide: { flex: 1 },
  formContent: { paddingHorizontal: GRID_PADDING, paddingTop: 12, paddingBottom: 24 },
  formTitle: { fontSize: 26, letterSpacing: -0.5, marginBottom: 8 },
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
  chipNative: { fontSize: 19, letterSpacing: -0.3 },
  chipName: { fontSize: 13, marginTop: 2 },
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
