import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVocabBank,
  useListVocabSelections,
  useAddVocabSelection,
  useDeleteVocabSelection,
  getListVocabSelectionsQueryKey,
  type VocabBankWord,
  type VocabSelection,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { speakWord, prefetchSpeech, stopSpeaking } from "@/lib/speech";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_COLORS: Record<Level, { bg: string; fg: string }> = {
  beginner: { bg: "#DCFCE7", fg: "#16A34A" },
  intermediate: { bg: "#FEF3C7", fg: "#D97706" },
  advanced: { bg: "#FEE2E2", fg: "#DC2626" },
};

export default function VocabBankScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();
  const queryClient = useQueryClient();

  const target = prefs.targetLanguage;
  const native = prefs.nativeLanguage;

  const { data: bank, isLoading, isError, refetch } = useGetVocabBank({
    targetLanguage: target,
    nativeLanguage: native,
  });
  const { data: selections } = useListVocabSelections({ targetLanguage: target });

  const selectionsKey = getListVocabSelectionsQueryKey({ targetLanguage: target });
  const invalidateSelections = () =>
    queryClient.invalidateQueries({ queryKey: selectionsKey });

  const onMutationError = () => Alert.alert(t("vocab.actionError"));

  const addMutation = useAddVocabSelection({
    mutation: { onSuccess: invalidateSelections, onError: onMutationError },
  });
  const deleteMutation = useDeleteVocabSelection({
    mutation: { onSuccess: invalidateSelections, onError: onMutationError },
  });

  // Map word -> selection so we can show "added" state and remove by id.
  const selectedByWord = useMemo(() => {
    const map = new Map<string, VocabSelection>();
    for (const s of (selections ?? []) as VocabSelection[]) map.set(s.word, s);
    return map;
  }, [selections]);

  const grouped = useMemo(() => {
    const out: Record<Level, VocabBankWord[]> = {
      beginner: [],
      intermediate: [],
      advanced: [],
    };
    for (const w of bank?.words ?? []) {
      if ((LEVELS as readonly string[]).includes(w.level)) {
        out[w.level as Level].push(w);
      }
    }
    return out;
  }, [bank]);

  useFocusEffect(
    React.useCallback(() => {
      return () => stopSpeaking();
    }, []),
  );

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 100 : insets.bottom + 100;

  const hear = (word: string) => {
    Haptics.selectionAsync();
    speakWord(word, target);
  };

  const toggle = (w: VocabBankWord) => {
    const existing = selectedByWord.get(w.word);
    if (existing) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      deleteMutation.mutate({ id: existing.id });
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      addMutation.mutate({
        data: {
          word: w.word,
          translation: w.translation,
          level: w.level,
          targetLanguage: target,
        },
      });
      // Warm the audio so the first tap on the study screen is instant.
      prefetchSpeech(w.word);
    }
  };

  const selectedCount = selectedByWord.size;
  const isEmptyBank = LEVELS.every((level) => grouped[level].length === 0);

  const Header = (
    <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={26} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("vocab.bankTitle")}
      </Text>
      <TouchableOpacity
        onPress={() => router.push("/vocab-study")}
        style={styles.myWordsBtn}
        activeOpacity={0.8}
      >
        <Ionicons name="albums" size={16} color={colors.primary} />
        {selectedCount > 0 && (
          <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.countBadgeText}>{selectedCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {t("vocab.bankSub", { lang: target })}
          </Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.bankError")}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => refetch()}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {t("vocab.tryAgain")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Header}
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {t("vocab.bankSub", { lang: target })}
      </Text>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {isEmptyBank && (
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 40 }]}>
            {t("vocab.bankEmpty")}
          </Text>
        )}
        {LEVELS.map((level) => {
          const words = grouped[level];
          if (words.length === 0) return null;
          const lc = LEVEL_COLORS[level];
          return (
            <View key={level} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.levelTag, { backgroundColor: lc.bg }]}>
                  <Text style={[styles.levelTagText, { color: lc.fg, fontFamily: "Inter_700Bold" }]}>
                    {t(`vocab.${level}` as "vocab.beginner")}
                  </Text>
                </View>
              </View>
              {words.map((w) => {
                const added = selectedByWord.has(w.word);
                return (
                  <View
                    key={`${level}:${w.word}`}
                    style={[styles.wordCard, { backgroundColor: colors.card }]}
                  >
                    <TouchableOpacity
                      style={[styles.speakerSmall, { backgroundColor: colors.primarySoft }]}
                      onPress={() => hear(w.word)}
                      activeOpacity={0.8}
                      hitSlop={8}
                    >
                      <Ionicons name="volume-high" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <View style={styles.wordTextWrap}>
                      <Text
                        style={[styles.word, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                        numberOfLines={1}
                      >
                        {w.word}
                      </Text>
                      <Text
                        style={[styles.translation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                        numberOfLines={1}
                      >
                        {w.translation}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.addBtn,
                        added
                          ? { backgroundColor: "#DCFCE7" }
                          : { backgroundColor: colors.primary },
                      ]}
                      onPress={() => toggle(w)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={added ? "checkmark" : "add"}
                        size={16}
                        color={added ? "#16A34A" : "#FFFFFF"}
                      />
                      <Text
                        style={[
                          styles.addBtnText,
                          { color: added ? "#16A34A" : "#FFFFFF", fontFamily: "Inter_600SemiBold" },
                        ]}
                      >
                        {added ? t("vocab.added") : t("vocab.add")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
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
  myWordsBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_700Bold" },
  subtitle: { paddingHorizontal: 20, paddingBottom: 12, fontSize: 14 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  loadingText: { fontSize: 14, textAlign: "center" },
  bigSub: { fontSize: 14, textAlign: "center", maxWidth: 300, lineHeight: 20 },

  section: { marginBottom: 18 },
  sectionHeader: { marginBottom: 10 },
  levelTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  levelTagText: { fontSize: 13 },

  wordCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  speakerSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  wordTextWrap: { flex: 1 },
  word: { fontSize: 16 },
  translation: { fontSize: 13, marginTop: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  addBtnText: { fontSize: 13 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16 },
});
