import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useListOpenaiConversations, useListVocabulary } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import type { TKey } from "@/constants/translations";

type Conversation = { id: number; title: string; createdAt: string };
type VocabEntry = { word: string; language: string; count: number };

type Badge = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  titleKey: TKey;
  descKey: TKey;
  goal: number;
  value: number;
};

export default function ChallengesScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: convos } = useListOpenaiConversations();
  const { data: vocab } = useListVocabulary();

  const list = (convos ?? []) as Conversation[];
  const vocabList = (vocab ?? []) as VocabEntry[];

  const badges: Badge[] = useMemo(() => {
    const languages = new Set(
      list.map((c) => c.title.split(" • ")[1]).filter(Boolean) as string[],
    );
    const days = new Set(
      list.map((c) => {
        const d = new Date(c.createdAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
    );
    return [
      {
        id: "first-scan",
        icon: "scan",
        color: "#7C5CFF",
        bg: "#EFE9FF",
        titleKey: "badge.firstScan.title",
        descKey: "badge.firstScan.desc",
        goal: 1,
        value: list.length,
      },
      {
        id: "chatty",
        icon: "chatbubbles",
        color: "#3B82F6",
        bg: "#DBEAFE",
        titleKey: "badge.chatty.title",
        descKey: "badge.chatty.desc",
        goal: 5,
        value: list.length,
      },
      {
        id: "word-hoard",
        icon: "book",
        color: "#F59E0B",
        bg: "#FEF3C7",
        titleKey: "badge.wordHoarder.title",
        descKey: "badge.wordHoarder.desc",
        goal: 50,
        value: vocabList.length,
      },
      {
        id: "polyglot",
        icon: "globe",
        color: "#22C55E",
        bg: "#DCFCE7",
        titleKey: "badge.polyglot.title",
        descKey: "badge.polyglot.desc",
        goal: 3,
        value: languages.size,
      },
      {
        id: "consistent",
        icon: "calendar",
        color: "#EC4899",
        bg: "#FCE7F3",
        titleKey: "badge.consistent.title",
        descKey: "badge.consistent.desc",
        goal: 7,
        value: days.size,
      },
      {
        id: "century",
        icon: "trophy",
        color: "#F59E0B",
        bg: "#FEF3C7",
        titleKey: "badge.century.title",
        descKey: "badge.century.desc",
        goal: 100,
        value: vocabList.length,
      },
    ];
  }, [list, vocabList]);

  const earned = badges.filter((b) => b.value >= b.goal).length;

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("challenges.title")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: bottomPadding, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.summary, { backgroundColor: colors.primary }]}>
          <Text style={[styles.summaryLabel, { fontFamily: "Inter_500Medium" }]}>{t("challenges.earned")}</Text>
          <Text style={[styles.summaryNumber, { fontFamily: "Inter_700Bold" }]}>
            {earned} <Text style={styles.summaryNumberSmall}>/ {badges.length}</Text>
          </Text>
          <Text style={[styles.summarySub, { fontFamily: "Inter_400Regular" }]}>
            {t("challenges.keepGoing")}
          </Text>
        </View>

        {badges.map((b) => {
          const done = b.value >= b.goal;
          const pct = Math.min(1, b.value / b.goal);
          return (
            <View key={b.id} style={[styles.badge, { backgroundColor: colors.card }]}>
              <View
                style={[
                  styles.badgeIcon,
                  { backgroundColor: done ? b.bg : colors.muted },
                ]}
              >
                <Ionicons
                  name={done ? b.icon : "lock-closed"}
                  size={22}
                  color={done ? b.color : colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.badgeHeader}>
                  <Text
                    style={[
                      styles.badgeTitle,
                      { color: colors.foreground, fontFamily: "Inter_700Bold" },
                    ]}
                  >
                    {t(b.titleKey)}
                  </Text>
                  {done && (
                    <View style={[styles.earnedPill, { backgroundColor: b.bg }]}>
                      <Ionicons name="checkmark" size={11} color={b.color} />
                      <Text style={[styles.earnedText, { color: b.color, fontFamily: "Inter_600SemiBold" }]}>
                        {t("challenges.earnedTag")}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.badgeDesc,
                    { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                  ]}
                >
                  {t(b.descKey)}
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${pct * 100}%`,
                        backgroundColor: done ? b.color : colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.badgeProgress,
                    { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  {Math.min(b.value, b.goal)} / {b.goal}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
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
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17 },

  summary: { padding: 22, borderRadius: 22, gap: 4, marginBottom: 4 },
  summaryLabel: { fontSize: 11, letterSpacing: 1.5, color: "rgba(255,255,255,0.8)" },
  summaryNumber: { color: "#FFFFFF", fontSize: 44, lineHeight: 48 },
  summaryNumberSmall: { fontSize: 22, opacity: 0.7 },
  summarySub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },

  badge: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 18,
    gap: 14,
    alignItems: "flex-start",
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  badgeTitle: { fontSize: 15 },
  badgeDesc: { fontSize: 12 },
  badgeProgress: { fontSize: 11, marginTop: 2 },
  earnedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  earnedText: { fontSize: 10 },
  progressTrack: { height: 6, borderRadius: 999, overflow: "hidden", marginTop: 6 },
  progressFill: { height: "100%", borderRadius: 999 },
});
