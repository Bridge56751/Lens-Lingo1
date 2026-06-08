import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useListOpenaiConversations,
  useStartOpenaiChat,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences, LANGUAGES, type Language } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { LOCALE_NATIVE_NAMES, type Locale } from "@/constants/translations";
import { useAlphabetProgress } from "@/lib/alphabetProgress";

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
};

const HELLOS: Record<Language, string> = {
  English: "hello",
  Spanish: "hola",
  French: "bonjour",
  German: "hallo",
  Italian: "ciao",
  Portuguese: "olá",
  Japanese: "こんにちは",
  Chinese: "你好",
  Korean: "안녕",
  Arabic: "مرحبا",
  Russian: "привет",
  Hindi: "नमस्ते",
  Dutch: "hallo",
};

function CornerBrackets({ color, size = 22 }: { color: string; size?: number }) {
  const b = { borderColor: color, width: size, height: size, position: "absolute" as const };
  return (
    <>
      <View style={[b, { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 6 }]} />
      <View style={[b, { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 6 }]} />
      <View style={[b, { bottom: 0, left: 0, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderBottomLeftRadius: 6 }]} />
      <View style={[b, { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 6 }]} />
    </>
  );
}

function StatTile({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  progress,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  progress?: number;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.tile, { backgroundColor: colors.card }]}
      onPress={() => {
        if (!onPress) return;
        Haptics.selectionAsync();
        onPress();
      }}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.tileRow}>
        <View style={[styles.tileIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tileTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {title}
          </Text>
          <Text style={[styles.tileSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {subtitle}
          </Text>
        </View>
        {onPress && (
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        )}
      </View>
      {progress !== undefined && (
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(100, progress * 100)}%`, backgroundColor: "#22C55E" },
            ]}
          />
        </View>
      )}
    </TouchableOpacity>
  );
}

function GridCard({
  tag,
  title,
  subtitle,
  ctaLabel,
  bg,
  fg,
  tagBg,
  tagFg,
  ctaBg,
  ctaFg,
  watermark,
  watermarkIcon,
  icon = "arrow-forward",
  progress,
  onPress,
  loading,
}: {
  tag: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  bg: string;
  fg: string;
  tagBg: string;
  tagFg: string;
  ctaBg: string;
  ctaFg: string;
  watermark?: string;
  watermarkIcon?: keyof typeof Ionicons.glyphMap;
  icon?: keyof typeof Ionicons.glyphMap;
  progress?: number;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.gridCard, { backgroundColor: bg, opacity: loading ? 0.7 : 1 }]}
      onPress={() => {
        if (loading) return;
        Haptics.selectionAsync();
        onPress();
      }}
      activeOpacity={0.9}
      disabled={loading}
    >
      <View style={styles.gridWatermark} pointerEvents="none">
        {watermarkIcon ? (
          <Ionicons name={watermarkIcon} size={90} color={fg} />
        ) : (
          <Text style={[styles.gridWatermarkText, { color: fg }]} numberOfLines={1}>
            {watermark}
          </Text>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <View style={[styles.pathTag, { backgroundColor: tagBg, marginBottom: 0 }]}>
          <Text style={[styles.pathTagText, { color: tagFg, fontFamily: "Inter_700Bold" }]}>
            {tag}
          </Text>
        </View>
        <Text
          style={[styles.gridTitle, { color: fg, fontFamily: "Inter_700Bold" }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.gridSub, { color: fg, fontFamily: "Inter_700Bold" }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        {progress !== undefined && (
          <View style={[styles.pathProgressTrack, { backgroundColor: "rgba(0,0,0,0.14)" }]}>
            <View
              style={[
                styles.pathProgressFill,
                { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: fg },
              ]}
            />
          </View>
        )}
        {ctaLabel ? (
          <View style={[styles.gridCtaWide, { backgroundColor: ctaBg }]}>
            {loading ? (
              <ActivityIndicator size="small" color={ctaFg} />
            ) : (
              <>
                <Text
                  style={[styles.gridCtaLabel, { color: ctaFg, fontFamily: "Inter_700Bold" }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                >
                  {ctaLabel}
                </Text>
                <Ionicons name={icon} size={14} color={ctaFg} />
              </>
            )}
          </View>
        ) : (
          <View style={[styles.gridCta, { backgroundColor: ctaBg }]}>
            {loading ? (
              <ActivityIndicator size="small" color={ctaFg} />
            ) : (
              <Ionicons name={icon} size={18} color={ctaFg} />
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs, update } = usePreferences();
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const { languageProgress } = useAlphabetProgress();
  const alphabet = languageProgress(prefs.targetLanguage);
  const { data: conversations, refetch } = useListOpenaiConversations();

  // Tab screens stay mounted in Expo Router, so refetch on focus to keep the
  // chat count fresh after a new conversation is started elsewhere.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const list = (conversations ?? []) as Conversation[];

  const stats = useMemo(() => {
    return {
      totalConvos: list.length,
    };
  }, [list]);

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 90;

  const goScan = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/scan");
  };

  const startChat = useStartOpenaiChat();
  const goFreeChat = () => {
    if (startChat.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    startChat.mutate(
      {
        data: {
          targetLanguage: prefs.targetLanguage,
          nativeLanguage: prefs.nativeLanguage,
        },
      },
      {
        onSuccess: (res) => {
          router.push(`/conversation/${res.conversationId}`);
        },
        onError: () => {
          Alert.alert(t("home.chatErrorTitle"), t("home.chatErrorBody"));
        },
      },
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPadding + 12, paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting row */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text
                numberOfLines={1}
                style={[styles.greeting, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
              >
                {t("home.greeting", { name: prefs.displayName })}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.learningChip}
              onPress={() => {
                Haptics.selectionAsync();
                setLangPickerOpen(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="globe-outline" size={17} color={colors.primary} />
              <Text style={[styles.learningChipText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {t("settings.learningSub", { lang: prefs.targetLanguage })}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.greetingRight}>
            <TouchableOpacity
              style={[styles.avatar, { borderColor: colors.primary }]}
              onPress={() => {
                Haptics.selectionAsync();
                router.push("/settings");
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="person" size={26} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.headerDivider, { backgroundColor: colors.border }]} />

        {/* Hero card */}
        <View style={[styles.hero, { backgroundColor: "#5B3FD9" }]}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroTitle, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
              {t("home.scanLearnSpeak")}
            </Text>
            <Text style={[styles.heroBody, { color: "rgba(255,255,255,0.82)", fontFamily: "Inter_400Regular" }]}>
              {t("home.heroDesc")}
            </Text>
            <TouchableOpacity
              style={[styles.heroButton, { backgroundColor: "#FFFFFF" }]}
              onPress={goScan}
              activeOpacity={0.85}
            >
              <Ionicons name="scan" size={16} color={colors.primary} />
              <Text style={[styles.heroButtonText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                {t("home.scanCta")}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroRight}>
            <View style={styles.heroBracket}>
              <CornerBrackets color="#FFFFFF" size={20} />
              <View style={[styles.heroIconCircle, { backgroundColor: "#FFFFFF" }]}>
                <Ionicons name="cube" size={48} color={colors.primary} />
              </View>
            </View>
            <View style={[styles.heroChip, { backgroundColor: "#FFFFFF" }]}>
              <Text style={[styles.heroChipText, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {HELLOS[prefs.targetLanguage] ?? "Hello"}
              </Text>
              <Ionicons name="volume-medium" size={14} color={colors.primary} />
            </View>
          </View>
        </View>

        {/* Categories — 2x2 grid */}
        <View style={{ gap: 14 }}>
          <View style={styles.gridRow}>
            <GridCard
              tag={t("home.pathSentencesTag")}
              title={t("home.pathSentencesTitle")}
              subtitle={t("home.pathSentencesSub")}
              ctaLabel={t("home.pathSentencesCta")}
              bg="#2563EB"
              fg="#FFFFFF"
              tagBg="#FFFFFF"
              tagFg="#1D4ED8"
              ctaBg="#FFFFFF"
              ctaFg="#1D4ED8"
              watermark="Hi"
              onPress={() => router.push("/sentences")}
            />
            <GridCard
              tag={t("home.pathChatTag")}
              title={t("home.pathChatTitle")}
              subtitle={t("home.pathChatSub")}
              ctaLabel={t("home.pathChatCta")}
              bg="#EA580C"
              fg="#FFFFFF"
              tagBg="#FFFFFF"
              tagFg="#C2410C"
              ctaBg="#FFFFFF"
              ctaFg="#C2410C"
              watermark="AI"
              onPress={goFreeChat}
              loading={startChat.isPending}
            />
          </View>
          <View style={styles.gridRow}>
            <GridCard
              tag={t("home.pathAlphabetTag")}
              title={t("home.pathAlphabetTitle")}
              subtitle={t("home.pathAlphabetSub")}
              ctaLabel={t("home.pathAlphabetCta")}
              bg="#FBBF24"
              fg="#422006"
              tagBg="rgba(255,255,255,0.55)"
              tagFg="#422006"
              ctaBg="#422006"
              ctaFg="#FBBF24"
              watermark="Aa"
              progress={alphabet.total > 0 ? alphabet.ratio : undefined}
              onPress={() => router.push("/alphabet")}
            />
            <GridCard
              tag={t("home.vocabTag")}
              title={t("home.vocabulary")}
              subtitle={t("home.pathVocabSub")}
              ctaLabel={t("home.pathVocabCta")}
              bg="#047857"
              fg="#FFFFFF"
              tagBg="#FFFFFF"
              tagFg="#047857"
              ctaBg="#FFFFFF"
              ctaFg="#047857"
              watermarkIcon="book"
              onPress={() => router.push("/vocabulary")}
            />
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsRow}>
          <StatTile
            icon="chatbubbles"
            iconColor={colors.primary}
            iconBg={colors.primarySoft}
            title={t("home.aiChats")}
            subtitle={t("home.sessions", { n: stats.totalConvos })}
            onPress={() => router.navigate("/(tabs)/history")}
          />
        </View>

        {/* New here CTA */}
        <View style={[styles.tourCard, { backgroundColor: colors.primarySoft }]}>
          <View style={[styles.tourBot, { backgroundColor: colors.primary }]}>
            <Ionicons name="sparkles" size={26} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.tourTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t("home.newHere")}
            </Text>
            <Text style={[styles.tourBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("home.newHereDesc")}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.tourBtn, { backgroundColor: "#FFFFFF" }]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/onboarding");
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={12} color={colors.primary} />
            <Text style={[styles.tourBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {t("home.takeTour")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Learning-language picker — change the language you're learning from home */}
      <Modal
        visible={langPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLangPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t("settings.chooseLearning")}
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {LANGUAGES.map((lang) => {
                const active = lang === prefs.targetLanguage;
                const nativeName = LOCALE_NATIVE_NAMES[lang as Locale] ?? lang;
                return (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.langOption,
                      active && { backgroundColor: colors.primarySoft },
                    ]}
                    onPress={() => {
                      if (active) {
                        setLangPickerOpen(false);
                        return;
                      }
                      const apply = () => {
                        update("targetLanguage", lang as Language);
                        setLangPickerOpen(false);
                        Haptics.selectionAsync();
                      };
                      if (lang === prefs.nativeLanguage) {
                        const title = t("settings.sameLangTitle");
                        const body = t("settings.sameLangBody", { lang });
                        if (Platform.OS === "web") {
                          if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) {
                            apply();
                          } else {
                            setLangPickerOpen(false);
                          }
                        } else {
                          Alert.alert(title, body, [
                            { text: t("history.cancel"), style: "cancel" },
                            {
                              text: t("settings.continueAnyway"),
                              style: "destructive",
                              onPress: apply,
                            },
                          ]);
                        }
                        return;
                      }
                      apply();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.langOptionText,
                          {
                            color: active ? colors.primary : colors.foreground,
                            fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                            textAlign: "left",
                            writingDirection: "ltr",
                          },
                        ]}
                      >
                        {nativeName}
                      </Text>
                      {nativeName !== lang && (
                        <Text
                          style={[
                            styles.langOptionSub,
                            {
                              color: colors.mutedForeground,
                              fontFamily: "Inter_400Regular",
                              textAlign: "left",
                              writingDirection: "ltr",
                            },
                          ]}
                        >
                          {lang}
                        </Text>
                      )}
                    </View>
                    {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 18, gap: 16 },

  greetingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  greeting: { fontSize: 30, letterSpacing: -0.6 },
  learningChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  learningChipText: { fontSize: 16 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    borderRadius: 20,
    padding: 18,
  },
  modalTitle: { fontSize: 18, marginBottom: 10 },
  langOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  langOptionText: { fontSize: 15 },
  langOptionSub: { fontSize: 11, marginTop: 2 },
  greetingRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerDivider: {
    height: 1,
    marginTop: -2,
    marginBottom: -2,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  hero: {
    flexDirection: "row",
    borderRadius: 24,
    padding: 20,
    gap: 12,
    overflow: "hidden",
  },
  heroLeft: { flex: 1, gap: 10 },
  heroTitle: { fontSize: 24, letterSpacing: -0.5, lineHeight: 28 },
  heroBody: { fontSize: 12, lineHeight: 17 },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  heroButtonText: { color: "#FFFFFF", fontSize: 14 },
  heroRight: {
    width: 120,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  heroBracket: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  heroIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  heroChip: {
    position: "absolute",
    top: 0,
    right: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    shadowColor: "#1A1B2E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  heroChipText: { fontSize: 13 },
  pathTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  pathTagText: { fontSize: 11, letterSpacing: 0.6 },
  pathProgressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  pathProgressFill: { height: "100%", borderRadius: 4 },
  gridRow: { flexDirection: "row", gap: 14 },
  gridCard: {
    flex: 1,
    minHeight: 210,
    borderRadius: 22,
    padding: 16,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  gridWatermark: { position: "absolute", right: -4, bottom: -14, opacity: 0.16 },
  gridWatermarkText: { fontSize: 84, fontFamily: "Inter_700Bold", letterSpacing: -3 },
  gridTitle: { fontSize: 19, letterSpacing: -0.4, lineHeight: 23 },
  gridSub: { fontSize: 12.5, lineHeight: 17, opacity: 0.95 },
  gridCta: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  gridCtaWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 999,
    marginTop: 2,
  },
  gridCtaLabel: { fontSize: 11.5, letterSpacing: -0.3, flex: 1, textAlign: "center" },
  statsRow: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  tileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: { fontSize: 16, letterSpacing: -0.2 },
  tileSubtitle: { fontSize: 12.5, lineHeight: 16 },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 2 },
  progressFill: { height: "100%", borderRadius: 3 },

  tourCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    gap: 12,
    marginTop: 4,
  },
  tourBot: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tourTitle: { fontSize: 14 },
  tourBody: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  tourBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  tourBtnText: { fontSize: 12 },
});
