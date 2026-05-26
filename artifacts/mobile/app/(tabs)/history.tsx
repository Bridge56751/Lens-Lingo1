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

  // Parse title format: "ItemName • Language"
  const parts = item.title.split(" • ");
  const itemName = parts[0] ?? item.title;
  const language = parts[1] ?? "";

  const date = new Date(item.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let dateStr: string;
  if (diffDays === 0) {
    dateStr = "Today";
  } else if (diffDays === 1) {
    dateStr = "Yesterday";
  } else if (diffDays < 7) {
    dateStr = `${diffDays} days ago`;
  } else {
    dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]}
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
      <View style={[styles.iconBox, { backgroundColor: colors.scanOverlay }]}>
        <Ionicons name="cube-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.itemContent}>
        <Text style={[styles.itemName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {itemName}
        </Text>
        <View style={styles.itemMeta}>
          {language ? (
            <View style={[styles.languageBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.languageBadgeText, { fontFamily: "Inter_500Medium" }]}>
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

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  const visibleConversations = (conversations ?? []) as Conversation[];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12 }]}>
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
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Loading...
          </Text>
        </View>
      ) : visibleConversations.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="time-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
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
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPadding },
          ]}
          onRefresh={refetch}
          refreshing={false}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
    gap: 6,
  },
  itemName: {
    fontSize: 16,
  },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  languageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  languageBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
  },
  itemDate: {
    fontSize: 12,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
  },
  emptyText: {
    fontSize: 14,
  },
  scanOverlay: {
    backgroundColor: "rgba(26, 155, 138, 0.12)",
  },
});
