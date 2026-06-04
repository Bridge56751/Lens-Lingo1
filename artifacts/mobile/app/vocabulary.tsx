import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useListVocabulary } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";

type Entry = {
  word: string;
  language: string;
  count: number;
  firstSeenAt: string;
  conversationId: number;
  conversationTitle: string;
};

export default function VocabularyScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useListVocabulary();
  const { prefs } = usePreferences();
  const [activeLang, setActiveLang] = useState<string | null>(null);

  const entries = (data ?? []) as Entry[];
  const hasTargetVocab = entries.some((e) => e.language === prefs.targetLanguage);

  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.language, (counts.get(e.language) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => ({ lang, count }));
  }, [entries]);

  const filtered = useMemo(() => {
    const list = activeLang ? entries.filter((e) => e.language === activeLang) : entries;
    return [...list].sort((a, b) => b.count - a.count);
  }, [entries, activeLang]);

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {t("vocab.title")}
        </Text>
        {hasTargetVocab ? (
          <TouchableOpacity
            onPress={() => router.push("/practice")}
            style={styles.iconBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="school" size={24} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {languages.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <Chip
            label={t("vocab.all")}
            count={entries.length}
            active={activeLang === null}
            onPress={() => setActiveLang(null)}
          />
          {languages.map(({ lang, count }) => (
            <Chip
              key={lang}
              label={lang}
              count={count}
              active={activeLang === lang}
              onPress={() => setActiveLang(lang)}
            />
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="book" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("vocab.empty")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.emptySub")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: bottomPadding, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.summary, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {t("vocab.unique", { n: filtered.length })}
          </Text>
          {filtered.map((e) => (
            <TouchableOpacity
              key={`${e.language}-${e.word}`}
              style={[styles.wordRow, { backgroundColor: colors.card }]}
              onPress={() => router.push(`/conversation/${e.conversationId}`)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.word, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  {e.word}
                </Text>
                <Text
                  style={[styles.wordSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                  numberOfLines={1}
                >
                  {e.language} · {t("vocab.from", { title: e.conversationTitle.split(" • ")[0] ?? "" })}
                </Text>
              </View>
              <View style={[styles.countPill, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.countText, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                  ×{e.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border ?? "transparent",
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: active ? "#FFFFFF" : colors.foreground,
            fontFamily: "Inter_600SemiBold",
          },
        ]}
      >
        {label}
        <Text style={{ opacity: 0.7 }}> · {count}</Text>
      </Text>
    </TouchableOpacity>
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
  chipsRow: { paddingHorizontal: 18, paddingVertical: 8, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: { fontSize: 13 },
  summary: { fontSize: 12, paddingHorizontal: 4, marginBottom: 4 },
  wordRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  word: { fontSize: 16, textTransform: "capitalize" },
  wordSub: { fontSize: 12, marginTop: 2 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  countText: { fontSize: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18 },
  emptySub: { fontSize: 14, textAlign: "center", maxWidth: 280 },
});
