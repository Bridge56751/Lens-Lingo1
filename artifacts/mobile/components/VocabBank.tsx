import React, { useMemo, useState } from "react";
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
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVocabBank,
  useListVocabSelections,
  useAddVocabSelection,
  useDeleteVocabSelection,
  getListVocabSelectionsQueryKey,
  getGetVocabBankQueryKey,
  type VocabBankWord,
  type VocabSelection,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useRomanizations } from "@/hooks/useRomanizations";
import { RomanizeToggle } from "@/components/RomanizeToggle";
import { useT } from "@/hooks/useT";
import { speakWord, prefetchSpeech, stopSpeaking } from "@/lib/speech";
import { getBundledVocabBank } from "@/lib/offlineAssets";
import { MODULE_ACCENTS } from "@/constants/colors";

const accent = MODULE_ACCENTS.vocab;

const LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_COLORS: Record<Level, { bg: string; fg: string }> = {
  beginner: { bg: "#DCFCE7", fg: "#16A34A" },
  intermediate: { bg: "#FEF3C7", fg: "#D97706" },
  advanced: { bg: "#FEE2E2", fg: "#DC2626" },
  expert: { bg: "#EDE9FE", fg: "#7C3AED" },
};

/**
 * The browse-and-add Word Bank experience: level tabs, word cards with
 * pronunciation, and add/remove to the study list. Rendered both as the
 * standalone `/vocab-bank` route and inside the Vocabulary screen's
 * "Word Bank" tab. Manages all of its own data and selection state.
 */
export default function VocabBank() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();
  const queryClient = useQueryClient();

  const target = prefs.targetLanguage;
  const native = prefs.nativeLanguage;

  const bundled = useMemo(
    () => getBundledVocabBank(target, native),
    [target, native],
  );

  const { data: bank, isLoading, isError, refetch } = useGetVocabBank(
    { targetLanguage: target, nativeLanguage: native },
    {
      query: {
        initialData: bundled,
        queryKey: getGetVocabBankQueryKey({
          targetLanguage: target,
          nativeLanguage: native,
        }),
      },
    },
  );
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
      expert: [],
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

  const bottomPadding = Platform.OS === "web" ? 100 : insets.bottom + 100;

  const [loadingWord, setLoadingWord] = useState<string | null>(null);
  const speakReq = React.useRef(0);

  const hear = async (word: string) => {
    Haptics.selectionAsync();
    const id = ++speakReq.current;
    setLoadingWord(word);
    try {
      await speakWord(word, target);
    } finally {
      if (speakReq.current === id) setLoadingWord(null);
    }
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
      prefetchSpeech(w.word, target);
    }
  };

  const isEmptyBank = LEVELS.every((level) => grouped[level].length === 0);
  const [selectedLevel, setSelectedLevel] = useState<Level>("beginner");
  const [showRoman, setShowRoman] = useState(false);
  const visibleWords = grouped[selectedLevel];
  const roman = useRomanizations(
    (visibleWords ?? []).map((w) => w.word),
    target,
    showRoman,
  );

  if (isLoading) {
    return (
      <View style={styles.flex}>
        <View style={styles.center}>
          <ActivityIndicator color={accent.color} />
        </View>
      </View>
    );
  }

  if (isError && !bank) {
    return (
      <View style={styles.flex}>
        <View style={styles.center}>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.bankError")}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: accent.color }]}
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
    <View style={styles.flex}>
      <View style={styles.tabsRow}>
        {LEVELS.map((level) => {
          const active = level === selectedLevel;
          const lc = LEVEL_COLORS[level];
          return (
            <TouchableOpacity
              key={level}
              style={[
                styles.tab,
                { backgroundColor: active ? lc.bg : colors.card },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedLevel(level);
              }}
              activeOpacity={0.85}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  {
                    color: active ? lc.fg : colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {t(`vocab.${level}` as "vocab.beginner")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <RomanizeToggle
        language={target}
        active={showRoman}
        onToggle={() => setShowRoman((v) => !v)}
        style={{ marginHorizontal: 20, marginBottom: 8 }}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {isEmptyBank || visibleWords.length === 0 ? (
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 40 }]}>
            {t("vocab.bankEmpty")}
          </Text>
        ) : (
          visibleWords.map((w) => {
            const added = selectedByWord.has(w.word);
            return (
              <View
                key={`${selectedLevel}:${w.word}`}
                style={[styles.wordCard, { backgroundColor: colors.card }]}
              >
                <TouchableOpacity
                  style={[styles.speakerSmall, { backgroundColor: accent.soft }]}
                  onPress={() => hear(w.word)}
                  activeOpacity={0.8}
                  hitSlop={8}
                  disabled={loadingWord === w.word}
                >
                  {loadingWord === w.word ? (
                    <ActivityIndicator size="small" color={accent.color} />
                  ) : (
                    <Ionicons name="volume-high" size={20} color={accent.color} />
                  )}
                </TouchableOpacity>
                <View style={styles.wordTextWrap}>
                  <Text
                    style={[styles.word, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                    numberOfLines={1}
                  >
                    {w.word}
                  </Text>
                  {roman.get(w.word) ? (
                    <Text
                      style={[styles.translation, { color: accent.color, fontStyle: "italic", fontFamily: "Inter_400Regular" }]}
                      numberOfLines={1}
                    >
                      {roman.get(w.word)}
                    </Text>
                  ) : null}
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
                      : { backgroundColor: accent.color },
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
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabsRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: { fontSize: 11 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  bigSub: { fontSize: 14, textAlign: "center", maxWidth: 300, lineHeight: 20, alignSelf: "center" },

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
