import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { ALPHABETS, RTL_LANGUAGES } from "@/constants/alphabets";

const NON_LATIN_LANGS = new Set(["Japanese", "Chinese", "Korean", "Arabic", "Russian", "Hindi"]);

const SPEECH_LOCALES: Record<string, string> = {
  English: "en-US",
  Spanish: "es-ES",
  French: "fr-FR",
  German: "de-DE",
  Italian: "it-IT",
  Portuguese: "pt-PT",
  Japanese: "ja-JP",
  Chinese: "zh-CN",
  Korean: "ko-KR",
  Arabic: "ar-SA",
  Russian: "ru-RU",
  Hindi: "hi-IN",
  Dutch: "nl-NL",
};

export default function AlphabetScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();
  const scripts = useMemo(() => ALPHABETS[prefs.targetLanguage] ?? [], [prefs.targetLanguage]);
  const isRTL = RTL_LANGUAGES.includes(prefs.targetLanguage);
  const [scriptIndex, setScriptIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<Record<string, Set<number>>>({});
  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const exampleScale = useRef(new Animated.Value(1)).current;

  const script = scripts[scriptIndex];
  const letters = script?.letters ?? [];
  const scriptKey = script?.id ?? "";
  const scriptCompleted = completed[scriptKey] ?? new Set<number>();

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;
  const current = letters[index];
  const isLast = index === letters.length - 1;
  const isDone = scriptCompleted.size === letters.length && letters.length > 0;

  const markCompleted = (idx: number) => {
    setCompleted((prev) => {
      const next = { ...prev };
      const set = new Set(next[scriptKey] ?? []);
      set.add(idx);
      next[scriptKey] = set;
      return next;
    });
  };

  const speak = (text: string, which: "letter" | "example" = "letter") => {
    Haptics.selectionAsync();
    const target = which === "example" ? exampleScale : scale;
    Animated.sequence([
      Animated.timing(target, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(target, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    const locale = SPEECH_LOCALES[prefs.targetLanguage] ?? "en-US";
    if (Platform.OS === "web") {
      try {
        const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
        const SU = (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance })
          .SpeechSynthesisUtterance;
        if (!synth || !SU) {
          console.warn("[speak] SpeechSynthesis not available in this browser");
          return;
        }
        synth.cancel();
        const utter = new SU(text);
        utter.lang = locale;
        utter.rate = 0.85;
        const voices = synth.getVoices();
        const langPrefix = locale.split("-")[0];
        const match =
          voices.find((v) => v.lang === locale) ||
          voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
          voices[0];
        if (match) utter.voice = match;
        utter.onerror = (e) => console.warn("[speak] error", e);
        synth.speak(utter);
      } catch (err) {
        console.warn("[speak] failed", err);
      }
      return;
    }
    try {
      Speech.stop();
      Speech.speak(text, { language: locale, rate: 0.85 });
    } catch {
      // ignore — Speech is unavailable on some web browsers
    }
  };

  const animateTo = (nextIndex: number) => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setIndex(nextIndex);
      Animated.timing(fade, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  };

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markCompleted(index);
    if (!isLast) animateTo(index + 1);
  };

  const goPrev = () => {
    if (index === 0) return;
    Haptics.selectionAsync();
    animateTo(index - 1);
  };

  const restart = () => {
    setCompleted((prev) => {
      const next = { ...prev };
      delete next[scriptKey];
      return next;
    });
    setIndex(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const switchScript = (idx: number) => {
    if (idx === scriptIndex) return;
    Haptics.selectionAsync();
    setScriptIndex(idx);
    setIndex(0);
  };

  const progress = letters.length > 0 ? (scriptCompleted.size / letters.length) : 0;

  if (scripts.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPadding + 8 }]}>
        <Header colors={colors} title={t("alphabet.title", { lang: prefs.targetLanguage })} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: topPadding + 8 }}>
        <Header colors={colors} title={t("alphabet.title", { lang: prefs.targetLanguage })} />

        {/* Script selector */}
        {scripts.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scriptTabsContent}
            style={styles.scriptTabs}
          >
            {scripts.map((s, i) => {
              const active = i === scriptIndex;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => switchScript(i)}
                  style={[
                    styles.scriptTab,
                    {
                      backgroundColor: active ? colors.primary : colors.muted,
                    },
                  ]}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.scriptTabText,
                      {
                        color: active ? "#FFFFFF" : colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                      },
                    ]}
                  >
                    {s.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {script?.description && (
          <Text style={[styles.scriptDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {script.description}
          </Text>
        )}

        {/* Progress bar */}
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: `${progress * 100}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {t("alphabet.progress", { current: index + 1, total: letters.length })}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {isDone ? (
          <View style={[styles.doneCard, { backgroundColor: colors.primarySoft }]}>
            <View style={[styles.doneBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="trophy" size={36} color="#FFFFFF" />
            </View>
            <Text style={[styles.doneTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t("alphabet.complete")}
            </Text>
            <Text style={[styles.doneBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("alphabet.completeBody", { lang: script?.name ?? prefs.targetLanguage })}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={restart}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                {t("alphabet.startOver")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View style={{ opacity: fade }}>
            <Animated.View style={{ transform: [{ scale }] }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (!current) return;
                  const useChar = NON_LATIN_LANGS.has(prefs.targetLanguage);
                  const text = useChar
                    ? current.char.split(/\s+/)[0]
                    : (current.name ?? current.char).replace(/\s*\(.*\)\s*/g, "").trim();
                  speak(text);
                }}
                style={[styles.letterCard, { backgroundColor: colors.card, borderColor: colors.primarySoft }]}
              >
              <View style={[styles.speakerPill, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="volume-medium" size={14} color={colors.primary} />
                <Text style={[styles.speakerText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  {t("alphabet.tapToHear")}
                </Text>
              </View>
              <Text
                style={[
                  styles.letterChar,
                  {
                    color: colors.foreground,
                    fontFamily: "Inter_700Bold",
                    writingDirection: isRTL ? "rtl" : "ltr",
                  },
                ]}
              >
                {current?.char}
              </Text>
              <Text style={[styles.letterName, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                {current?.name}
              </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Example */}
            <Animated.View
              style={[styles.exampleCard, { backgroundColor: colors.card, transform: [{ scale: exampleScale }] }]}
            >
              <Text style={[styles.exampleLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                {t("alphabet.example")}
              </Text>
              <TouchableOpacity
                style={styles.exampleRow}
                activeOpacity={0.7}
                onPress={() => current && speak(current.example.replace(/\s*\(.*\)/, ""), "example")}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.exampleWord,
                      {
                        color: colors.foreground,
                        fontFamily: "Inter_700Bold",
                        writingDirection: isRTL ? "rtl" : "ltr",
                      },
                    ]}
                  >
                    {current?.example}
                  </Text>
                  <Text
                    style={[styles.exampleMeaning, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                  >
                    {current?.exampleMeaning}
                  </Text>
                </View>
                <View style={[styles.speakerIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="volume-medium" size={18} color={colors.primary} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        )}
      </ScrollView>

      {!isDone && (
        <View
          style={[
            styles.footer,
            { paddingBottom: bottomPadding, backgroundColor: colors.background, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              { backgroundColor: colors.muted, opacity: index === 0 ? 0.5 : 1 },
            ]}
            onPress={goPrev}
            disabled={index === 0}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {t("alphabet.previous")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1 }]}
            onPress={goNext}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {isLast ? t("alphabet.complete") : t("alphabet.next")}
            </Text>
            <Ionicons name={isLast ? "checkmark" : "chevron-forward"} size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function Header({ colors, title }: { colors: ReturnType<typeof useColors>; title: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={26} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {title}
      </Text>
      <View style={styles.iconBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, textAlign: "center" },
  scriptTabs: { maxHeight: 44 },
  scriptTabsContent: { paddingHorizontal: 18, gap: 8, paddingVertical: 4 },
  scriptTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  scriptTabText: { fontSize: 13 },
  scriptDesc: { fontSize: 12, paddingHorizontal: 18, paddingTop: 6, textAlign: "center" },
  progressWrap: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, gap: 6 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  progressText: { fontSize: 11, textAlign: "right" },
  scroll: { paddingHorizontal: 18, paddingTop: 8, gap: 14 },
  letterCard: {
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 12,
    borderWidth: 2,
  },
  speakerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  speakerText: { fontSize: 11 },
  letterChar: { fontSize: 110, lineHeight: 130, textAlign: "center" },
  letterName: { fontSize: 16 },
  exampleCard: { marginTop: 14, borderRadius: 18, padding: 16, gap: 8 },
  exampleLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  exampleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  exampleWord: { fontSize: 22 },
  exampleMeaning: { fontSize: 13, marginTop: 2 },
  speakerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  secondaryBtnText: { fontSize: 14 },
  doneCard: { borderRadius: 24, padding: 24, alignItems: "center", gap: 12 },
  doneBadge: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  doneTitle: { fontSize: 22 },
  doneBody: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
