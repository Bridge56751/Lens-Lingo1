import React, { useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useListOpenaiConversations,
  useStartOpenaiChat,
  useListVocabSelections,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences, type Language } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { computeStreak, computeBestStreak } from "@/lib/streak";
import { useAlphabetProgress } from "@/lib/alphabetProgress";

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

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
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
      <View style={[styles.tileIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.tileTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {title}
      </Text>
      <Text style={[styles.tileSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {subtitle}
      </Text>
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

function ConversationRow({ item }: { item: Conversation }) {
  const t = useT();
  const colors = useColors();
  const parts = item.title.split(" • ");
  const itemName = parts[0] ?? item.title;
  const language = parts[1] ?? "";

  return (
    <TouchableOpacity
      style={[styles.convoRow, { backgroundColor: colors.card }]}
      onPress={() => router.push(`/conversation/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={[styles.convoThumb, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="cube" size={22} color={colors.primary} />
      </View>
      <View style={styles.convoBody}>
        <Text style={[styles.convoName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {itemName}
        </Text>
        <Text
          style={[styles.convoSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
          numberOfLines={1}
        >
          {language ? t("home.practicing", { lang: language }) : t("home.tapToContinue")}
        </Text>
      </View>
      <View style={[styles.continueBtn, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="chatbubble" size={12} color={colors.primary} />
        <Text style={[styles.continueText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Continue
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function PathCard({
  tag,
  title,
  subtitle,
  cta,
  bg,
  fg,
  tagBg,
  tagFg,
  ctaBg,
  ctaFg,
  ctaBorder,
  watermark,
  progress,
  progressLabel,
  onPress,
  loading,
}: {
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  bg: string;
  fg: string;
  tagBg: string;
  tagFg: string;
  ctaBg?: string;
  ctaFg: string;
  ctaBorder?: string;
  watermark: string;
  progress?: number;
  progressLabel?: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.pathCard, { backgroundColor: bg, opacity: loading ? 0.7 : 1 }]}
      onPress={() => {
        if (loading) return;
        Haptics.selectionAsync();
        onPress();
      }}
      activeOpacity={0.9}
      disabled={loading}
    >
      <View style={styles.pathWatermark} pointerEvents="none">
        <Text style={[styles.pathWatermarkText, { color: fg }]} numberOfLines={1}>
          {watermark}
        </Text>
      </View>
      <View style={[styles.pathTag, { backgroundColor: tagBg }]}>
        <Text style={[styles.pathTagText, { color: tagFg, fontFamily: "Inter_700Bold" }]}>
          {tag}
        </Text>
      </View>
      <Text style={[styles.pathTitle, { color: fg, fontFamily: "Inter_700Bold" }]}>
        {title}
      </Text>
      <Text style={[styles.pathSub, { color: fg, fontFamily: "Inter_500Medium" }]}>
        {subtitle}
      </Text>
      {progress !== undefined && (
        <View style={styles.pathProgressWrap}>
          <View style={[styles.pathProgressTrack, { backgroundColor: "rgba(0,0,0,0.14)" }]}>
            <View
              style={[
                styles.pathProgressFill,
                { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: fg },
              ]}
            />
          </View>
          {progressLabel ? (
            <Text style={[styles.pathProgressLabel, { color: fg, fontFamily: "Inter_600SemiBold" }]}>
              {progressLabel}
            </Text>
          ) : null}
        </View>
      )}
      <View
        style={[
          styles.pathCta,
          ctaBorder
            ? { borderColor: ctaBorder, borderWidth: 1.5 }
            : { backgroundColor: ctaBg },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={ctaFg} />
        ) : (
          <>
            <Text style={[styles.pathCtaText, { color: ctaFg, fontFamily: "Inter_700Bold" }]}>
              {cta}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={ctaFg} />
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

function AlphabetMasteredStrip({
  onReview,
  onHide,
}: {
  onReview: () => void;
  onHide: () => void;
}) {
  const t = useT();
  return (
    <TouchableOpacity
      style={[styles.masteredStrip, { backgroundColor: "#FEF9C3", borderColor: "#FDE68A", borderWidth: 1 }]}
      onPress={() => {
        Haptics.selectionAsync();
        onReview();
      }}
      activeOpacity={0.8}
    >
      <View style={[styles.masteredIcon, { backgroundColor: "#FDE68A" }]}>
        <Ionicons name="checkmark-circle" size={20} color="#CA8A04" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.masteredTitle, { color: "#854D0E", fontFamily: "Inter_700Bold" }]}>
          {t("home.alphabetMastered")}
        </Text>
        <Text style={[styles.masteredSub, { color: "#A16207", fontFamily: "Inter_400Regular" }]}>
          {t("home.alphabetMasteredSub")}
        </Text>
      </View>
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          Haptics.selectionAsync();
          onHide();
        }}
        hitSlop={10}
        style={styles.masteredClose}
        activeOpacity={0.6}
      >
        <Ionicons name="close" size={18} color="#A16207" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs, update } = usePreferences();
  const { languageProgress } = useAlphabetProgress();
  const alphabet = languageProgress(prefs.targetLanguage);
  const { data: conversations } = useListOpenaiConversations();
  const { data: vocabSelections } = useListVocabSelections({
    targetLanguage: prefs.targetLanguage,
  });

  const list = (conversations ?? []) as Conversation[];

  const stats = useMemo(() => {
    const dates = list.map((c) => c.createdAt);
    return {
      streak: computeStreak(dates),
      bestStreak: computeBestStreak(dates),
      totalConvos: list.length,
      vocab: vocabSelections?.length ?? 0,
    };
  }, [list, vocabSelections]);

  // Best streak is the longest run ever — never let it drop, even if the
  // conversations it was derived from are deleted, by persisting the high-water
  // mark in preferences.
  const bestStreak = Math.max(stats.bestStreak, stats.streak, prefs.bestStreak ?? 0);
  useEffect(() => {
    if (bestStreak > (prefs.bestStreak ?? 0)) {
      update("bestStreak", bestStreak);
    }
  }, [bestStreak, prefs.bestStreak, update]);

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
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.greeting, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {t("home.greeting", { name: prefs.displayName })}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.learningChip}
              onPress={() => {
                Haptics.selectionAsync();
                router.push("/settings");
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="globe-outline" size={14} color={colors.primary} />
              <Text style={[styles.learningChipText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {t("settings.learningSub", { lang: prefs.targetLanguage })}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Streak pills stacked */}
          <View style={styles.streakPills}>
            <View style={[styles.streakPill, { backgroundColor: "#FEF3C7" }]}>
              <Text style={{ fontSize: 12 }}>🔥</Text>
              <Text style={[styles.streakPillLabel, { color: "#D97706", fontFamily: "Inter_600SemiBold" }]}>
                {t("home.dailyStreak")}
              </Text>
              <Text style={[styles.streakPillNum, { color: "#D97706", fontFamily: "Inter_700Bold" }]}>
                {stats.streak}
              </Text>
            </View>
            <View style={[styles.streakPill, { backgroundColor: "#DCFCE7" }]}>
              <Ionicons name="trophy" size={12} color="#22C55E" />
              <Text style={[styles.streakPillLabel, { color: "#16A34A", fontFamily: "Inter_600SemiBold" }]}>
                {t("home.bestStreak")}
              </Text>
              <Text style={[styles.streakPillNum, { color: "#16A34A", fontFamily: "Inter_700Bold" }]}>
                {bestStreak}
              </Text>
            </View>
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

        {/* Learning paths */}
        <View style={{ gap: 14 }}>
          <PathCard
            tag={t("home.pathSentencesTag")}
            title={t("home.pathSentencesTitle")}
            subtitle={t("home.pathSentencesSub")}
            cta={t("home.pathSentencesCta")}
            bg="#2563EB"
            fg="#FFFFFF"
            tagBg="#FFFFFF"
            tagFg="#1D4ED8"
            ctaBg="#FFFFFF"
            ctaFg="#1D4ED8"
            watermark="Hi"
            onPress={() => router.push("/sentences")}
          />
          <PathCard
            tag={t("home.pathChatTag")}
            title={t("home.pathChatTitle")}
            subtitle={t("home.pathChatSub")}
            cta={t("home.pathChatCta")}
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
          {!prefs.alphabetCardHidden[prefs.targetLanguage] &&
            (alphabet.mastered ? (
              <AlphabetMasteredStrip
                onReview={() => router.push("/alphabet")}
                onHide={() =>
                  update("alphabetCardHidden", {
                    ...prefs.alphabetCardHidden,
                    [prefs.targetLanguage]: true,
                  })
                }
              />
            ) : (
              <PathCard
                tag={t("home.pathAlphabetTag")}
                title={t("home.pathAlphabetTitle")}
                subtitle={t("home.pathAlphabetSub")}
                cta={t("home.pathAlphabetCta")}
                bg="#FBBF24"
                fg="#422006"
                tagBg="rgba(255,255,255,0.55)"
                tagFg="#422006"
                ctaBg="#422006"
                ctaFg="#FBBF24"
                watermark="Aa"
                progress={alphabet.total > 0 ? alphabet.ratio : undefined}
                progressLabel={
                  alphabet.completed > 0
                    ? t("home.alphabetProgress", {
                        done: alphabet.completed,
                        total: alphabet.total,
                      })
                    : undefined
                }
                onPress={() => router.push("/alphabet")}
              />
            ))}
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
          <StatTile
            icon="book"
            iconColor="#F59E0B"
            iconBg="#FEF3C7"
            title={t("home.vocabulary")}
            subtitle={t("home.words", { n: stats.vocab })}
            onPress={() => router.push("/vocabulary")}
          />
        </View>

        {/* Continue your conversations */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("home.continueConvos")}
          </Text>
          {list.length > 0 && (
            <TouchableOpacity onPress={() => router.navigate("/(tabs)/history")} activeOpacity={0.7}>
              <Text style={[styles.seeAll, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                See all
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {list.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="scan" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                No scans yet
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Tap Scan an Item to get started.
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {list.slice(0, 3).map((item) => (
              <ConversationRow key={item.id} item={item} />
            ))}
          </View>
        )}

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
            onPress={goScan}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={12} color={colors.primary} />
            <Text style={[styles.tourBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              Start
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 18, gap: 16 },

  greetingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  greeting: { fontSize: 22, letterSpacing: -0.4 },
  learningChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  learningChipText: { fontSize: 13 },
  greetingRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerDivider: {
    height: 1,
    marginTop: -2,
    marginBottom: -2,
  },
  streakPills: {
    gap: 6,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 9,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: 11,
  },
  streakPillLabel: { fontSize: 11, flex: 1 },
  streakPillNum: { fontSize: 12, lineHeight: 15 },
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

  pathCard: {
    borderRadius: 24,
    padding: 20,
    overflow: "hidden",
  },
  pathWatermark: {
    position: "absolute",
    right: -6,
    bottom: -22,
    opacity: 0.16,
  },
  pathWatermarkText: { fontSize: 110, fontFamily: "Inter_700Bold", letterSpacing: -4 },
  pathTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  pathTagText: { fontSize: 11, letterSpacing: 0.6 },
  pathTitle: { fontSize: 26, letterSpacing: -0.6, lineHeight: 30 },
  pathSub: { fontSize: 13, marginTop: 4 },
  pathCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 16,
  },
  pathCtaText: { fontSize: 14 },
  pathProgressWrap: { marginTop: 14, gap: 6 },
  pathProgressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  pathProgressFill: { height: "100%", borderRadius: 4 },
  pathProgressLabel: { fontSize: 12 },
  masteredStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
  },
  masteredIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  masteredTitle: { fontSize: 15 },
  masteredSub: { fontSize: 12, marginTop: 2 },
  masteredClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: { fontSize: 14 },
  tileSubtitle: { fontSize: 11, lineHeight: 14 },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 2 },
  progressFill: { height: "100%", borderRadius: 3 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: { fontSize: 16 },
  seeAll: { fontSize: 13 },

  convoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    gap: 12,
  },
  convoThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  convoBody: { flex: 1, gap: 3 },
  convoName: { fontSize: 14 },
  convoSub: { fontSize: 12 },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  continueText: { fontSize: 11 },

  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 15 },
  emptyBody: { fontSize: 12, marginTop: 2 },

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
