import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useListOpenaiConversations,
  useDeleteOpenaiConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Conversation = {
  id: number;
  title: string;
  createdAt: string;
};

function ConversationItem({
  item,
  onPress,
  onDelete,
}: {
  item: Conversation;
  onPress: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();

  const parts = item.title.split(" • ");
  const itemName = parts[0] ?? item.title;
  const language = parts[1] ?? "";

  const date = new Date(item.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let dateStr: string;
  if (diffDays === 0) dateStr = "Today";
  else if (diffDays === 1) dateStr = "Yesterday";
  else if (diffDays < 7) dateStr = `${diffDays} days ago`;
  else dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("Delete conversation?", `Remove "${itemName}" from history?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ]);
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
          <Text style={[styles.itemDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {dateStr}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: conversations, isLoading, refetch } = useListOpenaiConversations();
  const { mutate: deleteConversation } = useDeleteOpenaiConversation();

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

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  const visibleConversations = (conversations ?? []) as Conversation[];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          History
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Your past scans
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
            No scans yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Scan an object to start learning
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleConversations}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <ConversationItem
              item={item}
              onPress={() => router.push(`/conversation/${item.id}`)}
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
