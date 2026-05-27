import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useListOpenaiConversations } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences, type Language } from "@/hooks/usePreferences";

const HELLOS: Record<Language, string> = {
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
          {language ? `Practicing ${language}` : "Tap to continue"}
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

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();
  const { data: conversations } = useListOpenaiConversations();

  const list = (conversations ?? []) as Conversation[];

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = list.filter((c) => new Date(c.createdAt) >= today).length;

    const days = new Set(
      list.map((c) => {
        const d = new Date(c.createdAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
    );

    return {
      streak: Math.max(1, days.size),
      totalConvos: list.length,
      vocab: list.length * 5,
      dailyDone: todayCount,
      dailyGoal: 10,
    };
  }, [list]);

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 90;

  const goScan = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/scan");
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
                Hello, {prefs.displayName}!
              </Text>
              <Text style={styles.wave}>👋</Text>
            </View>
            <Text style={[styles.greetingSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Scan something around you{"\n"}and start a real conversation.
            </Text>
          </View>
          <View style={styles.greetingRight}>
            <View style={[styles.streakPill, { backgroundColor: "#FFF1E6" }]}>
              <Text style={{ fontSize: 14 }}>🔥</Text>
              <View>
                <Text style={[styles.streakNum, { color: "#1A1B2E", fontFamily: "Inter_700Bold" }]}>
                  {stats.streak}
                </Text>
                <Text style={[styles.streakLabel, { color: "#7A7B8E", fontFamily: "Inter_500Medium" }]}>
                  Day streak
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.avatar, { borderColor: colors.primary }]}
              onPress={() => {
                Haptics.selectionAsync();
                router.push("/settings");
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="person" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero card */}
        <View style={[styles.hero, { backgroundColor: colors.primarySoft }]}>
          <View style={styles.heroLeft}>
            <Text style={[styles.heroTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Scan. Learn.{"\n"}Speak.
            </Text>
            <Text style={[styles.heroBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Scan any object to learn the words and start a conversation about it.
            </Text>
            <TouchableOpacity
              style={[styles.heroButton, { backgroundColor: colors.primary }]}
              onPress={goScan}
              activeOpacity={0.85}
            >
              <Ionicons name="scan" size={16} color="#FFFFFF" />
              <Text style={[styles.heroButtonText, { fontFamily: "Inter_600SemiBold" }]}>
                Scan an Item
              </Text>
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
                {HELLOS[prefs.targetLanguage] ?? "hello"}
              </Text>
              <Ionicons name="volume-medium" size={14} color={colors.primary} />
            </View>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsRow}>
          <StatTile
            icon="chatbubbles"
            iconColor={colors.primary}
            iconBg={colors.primarySoft}
            title="AI Chats"
            subtitle={`${stats.totalConvos} sessions`}
            onPress={() => router.push("/(tabs)/history")}
          />
          <StatTile
            icon="book"
            iconColor="#F59E0B"
            iconBg="#FEF3C7"
            title="Vocabulary"
            subtitle={`${stats.vocab} words`}
            onPress={() => router.push("/vocabulary")}
          />
        </View>
        <View style={styles.statsRow}>
          <StatTile
            icon="checkmark-circle"
            iconColor="#22C55E"
            iconBg="#DCFCE7"
            title="Daily Goal"
            subtitle={`${stats.dailyDone} / ${stats.dailyGoal} today`}
            progress={stats.dailyDone / stats.dailyGoal}
            onPress={() => router.push("/progress")}
          />
          <StatTile
            icon="trophy"
            iconColor="#3B82F6"
            iconBg="#DBEAFE"
            title="Challenges"
            subtitle="Earn badges"
            onPress={() => router.push("/challenges")}
          />
        </View>

        {/* Continue your conversations */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Continue your conversations
          </Text>
          {list.length > 0 && (
            <TouchableOpacity onPress={() => router.push("/history")} activeOpacity={0.7}>
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
              New here?
            </Text>
            <Text style={[styles.tourBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Start your first scan and let AI help you speak from day one.
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

  greetingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  greeting: { fontSize: 24, letterSpacing: -0.4 },
  wave: { fontSize: 22 },
  greetingSub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  greetingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  streakNum: { fontSize: 14, lineHeight: 16 },
  streakLabel: { fontSize: 9, lineHeight: 11 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
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
