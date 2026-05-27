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
import { useListOpenaiConversations } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type Conversation = { id: number; title: string; createdAt: string };

const DAILY_GOAL = 10;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function ProgressScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data } = useListOpenaiConversations();

  const list = (data ?? []) as Conversation[];

  const { todayCount, streak, weekData, totalDays } = useMemo(() => {
    const today = startOfDay(new Date());
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const daysWithActivity = new Map<string, number>();
    for (const c of list) {
      const d = startOfDay(new Date(c.createdAt));
      const k = dayKey(d);
      daysWithActivity.set(k, (daysWithActivity.get(k) ?? 0) + 1);
    }

    let streakCount = 0;
    const cursor = new Date(today);
    while (daysWithActivity.has(dayKey(cursor))) {
      streakCount += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const week: { label: string; count: number; isToday: boolean }[] = [];
    const labels = ["S", "M", "T", "W", "T", "F", "S"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const count = daysWithActivity.get(dayKey(d)) ?? 0;
      week.push({
        label: labels[d.getDay()] ?? "",
        count,
        isToday: i === 0,
      });
    }

    return {
      todayCount: daysWithActivity.get(dayKey(today)) ?? 0,
      streak: streakCount,
      weekData: week,
      totalDays: daysWithActivity.size,
    };
  }, [list]);

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;
  const progress = Math.min(1, todayCount / DAILY_GOAL);
  const maxWeek = Math.max(1, ...weekData.map((d) => d.count));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("progress.title")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: bottomPadding, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Today ring */}
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <Text style={[styles.heroLabel, { fontFamily: "Inter_500Medium" }]}>{t("progress.today")}</Text>
          <Text style={[styles.heroNumber, { fontFamily: "Inter_700Bold" }]}>
            {todayCount} <Text style={styles.heroNumberSmall}>/ {DAILY_GOAL}</Text>
          </Text>
          <Text style={[styles.heroSub, { fontFamily: "Inter_400Regular" }]}>
            {todayCount >= DAILY_GOAL
              ? t("progress.complete")
              : t("progress.more", { n: DAILY_GOAL - todayCount })}
          </Text>
          <View style={styles.heroBarTrack}>
            <View style={[styles.heroBarFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>

        {/* Stat cards row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIcon, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="flame" size={20} color="#F59E0B" />
            </View>
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {streak}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("home.dayStreak")}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={[styles.statIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {totalDays}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {t("progress.activeDays")}
            </Text>
          </View>
        </View>

        {/* Week chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.chartTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("progress.last7")}
          </Text>
          <View style={styles.chart}>
            {weekData.map((d, idx) => {
              const h = (d.count / maxWeek) * 100;
              return (
                <View key={idx} style={styles.chartCol}>
                  <View style={styles.chartBarWrap}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: `${Math.max(4, h)}%`,
                          backgroundColor: d.count > 0 ? colors.primary : colors.muted,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.chartLabel,
                      {
                        color: d.isToday ? colors.primary : colors.mutedForeground,
                        fontFamily: d.isToday ? "Inter_700Bold" : "Inter_500Medium",
                      },
                    ]}
                  >
                    {d.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
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

  heroCard: { padding: 22, borderRadius: 22, gap: 6 },
  heroLabel: { fontSize: 11, letterSpacing: 1.5, color: "rgba(255,255,255,0.8)" },
  heroNumber: { color: "#FFFFFF", fontSize: 44, lineHeight: 48 },
  heroNumberSmall: { fontSize: 22, opacity: 0.7 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
  heroBarTrack: {
    marginTop: 14,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  heroBarFill: { height: "100%", backgroundColor: "#FFFFFF", borderRadius: 999 },

  statsRow: { flexDirection: "row", gap: 12 },
  statCard: { flex: 1, padding: 16, borderRadius: 18, gap: 4 },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statValue: { fontSize: 24 },
  statLabel: { fontSize: 12 },

  chartCard: { padding: 18, borderRadius: 18, gap: 14 },
  chartTitle: { fontSize: 15 },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 130,
    gap: 8,
  },
  chartCol: { flex: 1, alignItems: "center", gap: 6 },
  chartBarWrap: { width: "100%", flex: 1, justifyContent: "flex-end" },
  chartBar: { width: "100%", borderRadius: 8, minHeight: 6 },
  chartLabel: { fontSize: 11 },
});
