import React, { useMemo } from "react";
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
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { useAlphabetProgress } from "@/lib/alphabetProgress";

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
};

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

function GridCard({
  tag,
  title,
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
      <View style={[styles.pathTag, { backgroundColor: tagBg }]}>
        <Text style={[styles.pathTagText, { color: tagFg, fontFamily: "Inter_700Bold" }]}>
          {tag}
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        <Text
          style={[styles.gridTitle, { color: fg, fontFamily: "Inter_700Bold" }]}
          numberOfLines={2}
        >
          {title}
        </Text>
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
        <View style={[styles.gridCta, { backgroundColor: ctaBg }]}>
          {loading ? (
            <ActivityIndicator size="small" color={ctaFg} />
          ) : (
            <Ionicons name={icon} size={18} color={ctaFg} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();
  const { languageProgress } = useAlphabetProgress();
  const alphabet = languageProgress(prefs.targetLanguage);
  const { data: conversations } = useListOpenaiConversations();
  const { data: vocabSelections } = useListVocabSelections({
    targetLanguage: prefs.targetLanguage,
  });

  const list = (conversations ?? []) as Conversation[];

  const stats = useMemo(() => {
    return {
      totalConvos: list.length,
      vocab: vocabSelections?.length ?? 0,
    };
  }, [list, vocabSelections]);

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
                router.push("/settings");
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="globe-outline" size={17} color={colors.primary} />
              <Text style={[styles.learningChipText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {t("settings.learningSub", { lang: prefs.targetLanguage })}
              </Text>
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

        {/* Top categories — 2x2 grid */}
        <View style={{ gap: 14 }}>
          <View style={styles.gridRow}>
            <GridCard
              tag={t("home.scanTag")}
              title={t("home.scanCta")}
              bg="#5B3FD9"
              fg="#FFFFFF"
              tagBg="#FFFFFF"
              tagFg="#5B3FD9"
              ctaBg="#FFFFFF"
              ctaFg="#5B3FD9"
              watermarkIcon="scan"
              icon="scan"
              onPress={goScan}
            />
            <GridCard
              tag={t("home.pathSentencesTag")}
              title={t("home.pathSentencesTitle")}
              bg="#2563EB"
              fg="#FFFFFF"
              tagBg="#FFFFFF"
              tagFg="#1D4ED8"
              ctaBg="#FFFFFF"
              ctaFg="#1D4ED8"
              watermark="Hi"
              onPress={() => router.push("/sentences")}
            />
          </View>
          <View style={styles.gridRow}>
            <GridCard
              tag={t("home.pathChatTag")}
              title={t("home.pathChatTitle")}
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
            <GridCard
              tag={t("home.pathAlphabetTag")}
              title={t("home.pathAlphabetTitle")}
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
          <StatTile
            icon="book"
            iconColor="#F59E0B"
            iconBg="#FEF3C7"
            title={t("home.vocabulary")}
            subtitle={t("home.words", { n: stats.vocab })}
            onPress={() => router.push("/vocabulary")}
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
    minHeight: 150,
    borderRadius: 22,
    padding: 16,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  gridWatermark: { position: "absolute", right: -4, bottom: -14, opacity: 0.16 },
  gridWatermarkText: { fontSize: 84, fontFamily: "Inter_700Bold", letterSpacing: -3 },
  gridTitle: { fontSize: 19, letterSpacing: -0.4, lineHeight: 23 },
  gridCta: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 2,
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
