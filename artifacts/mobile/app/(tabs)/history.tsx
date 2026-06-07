import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useListOpenaiConversations,
  useDeleteOpenaiConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { usePreferences, LANGUAGES, type Language } from "@/hooks/usePreferences";

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
  lastOpenedAt?: string | null;
  gradeScore?: number | null;
};

function getLanguage(title: string): string {
  return title.split(" • ")[1]?.trim() ?? "";
}

// Resolve the chat's language segment to a known, canonical Language (case
// tolerant). Returns null when the title has no language or an unrecognized
// one — those chats are treated as "unknown" and never gated/locked.
function resolveLanguage(title: string): Language | null {
  const seg = getLanguage(title);
  if (!seg) return null;
  return LANGUAGES.find((l) => l.toLowerCase() === seg.toLowerCase()) ?? null;
}

function ConversationItem({
  item,
  locked,
  onPress,
  onDelete,
}: {
  item: Conversation;
  locked: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const colors = useColors();

  const parts = item.title.split(" • ");
  const itemName = parts[0] ?? item.title;
  const language = parts[1] ?? "";

  const date = new Date(item.lastOpenedAt ?? item.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let dateStr: string;
  if (diffDays === 0) dateStr = t("history.today");
  else if (diffDays === 1) dateStr = t("history.yesterday");
  else if (diffDays < 7) dateStr = t("history.daysAgo", { n: diffDays });
  else dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.card }, locked && styles.itemLocked]}
      onPress={onPress}
      activeOpacity={0.7}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
          t("history.deleteTitle"),
          t("history.deleteBody", { name: itemName }),
          [
            { text: t("history.cancel"), style: "cancel" },
            { text: t("history.delete"), style: "destructive", onPress: onDelete },
          ],
        );
      }}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="cube" size={22} color={colors.primary} />
      </View>
      <View style={styles.itemContent}>
        <Text style={[styles.itemName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {itemName}
        </Text>
        <View style={styles.itemMeta}>
          {language ? (
            <View style={[styles.languageBadge, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.languageBadgeText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {language}
              </Text>
            </View>
          ) : null}
          {item.gradeScore != null ? (
            <View style={[styles.gradeBadge, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="ribbon" size={11} color={colors.primary} />
              <Text style={[styles.gradeBadgeText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {t("history.grade", { score: item.gradeScore })}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.itemDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {dateStr}
          </Text>
        </View>
      </View>
      <Ionicons
        name={locked ? "lock-closed" : "chevron-forward"}
        size={locked ? 16 : 18}
        color={colors.mutedForeground}
      />
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { prefs, update } = usePreferences();

  const { data: conversations, isLoading, refetch } = useListOpenaiConversations();
  const { mutate: deleteConversation } = useDeleteOpenaiConversation();

  // Tab screens stay mounted in Expo Router, so React Query won't auto-refetch
  // when the user returns here after starting a new chat. Refetch on focus so
  // newly created conversations always show up without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const handleDelete = (id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteConversation(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListOpenaiConversationsQueryKey(),
          });
        },
      },
    );
  };

  const switchAndOpen = (lang: Language, id: number) => {
    // Avoid leaving target === native: if the chat's language is the user's
    // native language, swap native to the language they were just learning.
    if (lang === prefs.nativeLanguage) {
      update("nativeLanguage", prefs.targetLanguage);
    }
    update("targetLanguage", lang);
    Haptics.selectionAsync();
    router.push(`/conversation/${id}`);
  };

  const handleOpen = (item: Conversation) => {
    const chatLang = resolveLanguage(item.title);
    // Open directly when it matches the current learning language (or we can't
    // recognize what language the chat is in).
    if (!chatLang || chatLang === prefs.targetLanguage) {
      router.push(`/conversation/${item.id}`);
      return;
    }

    const title = t("history.lockedTitle");
    const body = t("history.lockedBody", { lang: chatLang, current: prefs.targetLanguage });
    const doSwitch = () => switchAndOpen(chatLang, item.id);

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) {
        doSwitch();
      }
      return;
    }
    Alert.alert(title, body, [
      { text: t("history.keepCurrent"), style: "cancel" },
      { text: t("history.switchAndOpen", { lang: chatLang }), onPress: doSwitch },
    ]);
  };

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  const visibleConversations = (conversations ?? []) as Conversation[];

  // Group conversations by language, preserving the API order (most recent
  // first) both for the order languages appear in and within each group.
  const sections = useMemo(() => {
    const groups = new Map<string, { canonical: Language | null; data: Conversation[] }>();
    for (const c of visibleConversations) {
      const canonical = resolveLanguage(c.title);
      const label = canonical ?? getLanguage(c.title) ?? "";
      const key = label || t("conv.fallbackName");
      const existing = groups.get(key);
      if (existing) existing.data.push(c);
      else groups.set(key, { canonical, data: [c] });
    }
    return Array.from(groups.entries()).map(([language, g]) => ({
      language,
      canonical: g.canonical,
      data: g.data,
    }));
  }, [visibleConversations, t]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("history.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {t("home.subtitleLine1")}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <Ionicons name="hourglass-outline" size={40} color={colors.mutedForeground} />
        </View>
      ) : visibleConversations.length === 0 ? (
        <View style={styles.centered}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="scan" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("history.empty")}
          </Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("history.emptySub")}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id.toString()}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => {
            const isCurrent = section.canonical === prefs.targetLanguage;
            const isLocked = section.canonical !== null && !isCurrent;
            return (
              <View style={styles.sectionHeader}>
                <View
                  style={[
                    styles.sectionBar,
                    { backgroundColor: isCurrent ? colors.primary : colors.mutedForeground },
                  ]}
                />
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.foreground, fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {section.language}
                </Text>
                {isCurrent ? (
                  <View style={[styles.currentTag, { backgroundColor: colors.primarySoft }]}>
                    <Text
                      style={[
                        styles.currentTagText,
                        { color: colors.primary, fontFamily: "Inter_600SemiBold" },
                      ]}
                    >
                      {t("history.currentLangTag")}
                    </Text>
                  </View>
                ) : isLocked ? (
                  <Ionicons name="lock-closed" size={13} color={colors.mutedForeground} />
                ) : null}
              </View>
            );
          }}
          renderItem={({ item, section }) => (
            <ConversationItem
              item={item}
              locked={section.canonical !== null && section.canonical !== prefs.targetLanguage}
              onPress={() => handleOpen(item)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding }]}
          onRefresh={refetch}
          refreshing={false}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: { fontSize: 30, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 4 },
  listContent: { paddingHorizontal: 20, paddingTop: 4 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 22,
    paddingBottom: 10,
  },
  sectionBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  sectionTitle: { fontSize: 15, letterSpacing: -0.2 },
  currentTag: {
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentTagText: { fontSize: 10, letterSpacing: 0.2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 14,
    gap: 14,
    shadowColor: "#1A1B2E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  itemLocked: { opacity: 0.55 },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: { flex: 1, gap: 6 },
  itemName: { fontSize: 16 },
  itemMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  languageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  languageBadgeText: { fontSize: 11 },
  gradeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gradeBadgeText: { fontSize: 11 },
  itemDate: { fontSize: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 18 },
  emptyText: { fontSize: 14, textAlign: "center" },
});
