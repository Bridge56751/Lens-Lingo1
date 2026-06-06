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
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import type { TKey } from "@/constants/translations";

const { width } = Dimensions.get("window");

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  glyph: string;
  color: string;
  soft: string;
  titleKey: TKey;
  descKey: TKey;
};

const SLIDES: Slide[] = [
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

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { update } = usePreferences();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  const finish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    update("onboardingSeen", true);
    // When opened manually (e.g. "Take tour" from home) onboarding is pushed
    // on top of the existing tabs, so pop back to avoid stacking a new tabs
    // screen each time. On first launch it's reached via Redirect (no back
    // stack), so fall back to replacing into the tabs.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    Haptics.selectionAsync();
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const active = SLIDES[index];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
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
        {SLIDES.map((s) => (
          <View key={s.titleKey} style={[styles.slide, { width }]}>
            <View style={[styles.iconWrap, { backgroundColor: s.soft }]}>
              <Text style={[styles.glyph, { color: s.color }]}>{s.glyph}</Text>
              <View style={[styles.iconBadge, { backgroundColor: s.color }]}>
                <Ionicons name={s.icon} size={26} color="#FFFFFF" />
              </View>
            </View>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t(s.titleKey)}
            </Text>
            <Text style={[styles.desc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t(s.descKey)}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View
              key={s.titleKey}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? active.color : colors.border,
                  width: i === index ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: active.color }]}
          onPress={goNext}
          activeOpacity={0.85}
        >
          <Text style={[styles.ctaText, { fontFamily: "Inter_700Bold" }]}>
            {isLast ? t("onboarding.getStarted") : t("onboarding.next")}
          </Text>
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
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  skip: { fontSize: 15 },
  slide: {
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
  footer: { paddingHorizontal: 24, gap: 24 },
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
