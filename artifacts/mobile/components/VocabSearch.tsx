import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  Keyboard,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSearchVocab,
  useListVocabSelections,
  useAddVocabSelection,
  useDeleteVocabSelection,
  getListVocabSelectionsQueryKey,
  type VocabBankWord,
  type VocabSelection,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useRomanizations } from "@/hooks/useRomanizations";
import { RomanizeToggle } from "@/components/RomanizeToggle";
import { useT } from "@/hooks/useT";
import { speakWord, prefetchSpeech, stopSpeaking } from "@/lib/speech";
import { MODULE_ACCENTS } from "@/constants/colors";

const accent = MODULE_ACCENTS.vocab;

/**
 * The Search tab of the Vocabulary screen: type any word (in either language),
 * the AI returns matching words with translations, and the user can add them to
 * their personal study list ("My Words"). Mirrors VocabBank's card styling and
 * add/remove flow so an added word immediately appears in My Words.
 */
export default function VocabSearch() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();
  const queryClient = useQueryClient();

  const target = prefs.targetLanguage;
  const native = prefs.nativeLanguage;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VocabBankWord[] | null>(null);
  const [showRoman, setShowRoman] = useState(false);
  const roman = useRomanizations(
    (results ?? []).map((w) => w.word),
    target,
    showRoman,
  );

  const { data: selections } = useListVocabSelections({ targetLanguage: target });

  const selectionsKey = getListVocabSelectionsQueryKey({ targetLanguage: target });
  const invalidateSelections = () =>
    queryClient.invalidateQueries({ queryKey: selectionsKey });

  const onMutationError = () => Alert.alert(t("vocab.actionError"));

  const searchMutation = useSearchVocab({
    mutation: {
      onSuccess: (data) => setResults(data.results),
      onError: () => Alert.alert(t("vocab.searchError")),
    },
  });
  const addMutation = useAddVocabSelection({
    mutation: { onSuccess: invalidateSelections, onError: onMutationError },
  });
  const deleteMutation = useDeleteVocabSelection({
    mutation: { onSuccess: invalidateSelections, onError: onMutationError },
  });

  const selectedByWord = useMemo(() => {
    const map = new Map<string, VocabSelection>();
    for (const s of (selections ?? []) as VocabSelection[]) map.set(s.word, s);
    return map;
  }, [selections]);

  useFocusEffect(
    React.useCallback(() => {
      return () => stopSpeaking();
    }, []),
  );

  const runSearch = () => {
    const q = query.trim();
    if (!q || searchMutation.isPending) return;
    Keyboard.dismiss();
    Haptics.selectionAsync();
    searchMutation.mutate({
      data: { query: q, targetLanguage: target, nativeLanguage: native },
    });
  };

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
      prefetchSpeech(w.word, target);
    }
  };

  const bottomPadding = Platform.OS === "web" ? 100 : insets.bottom + 100;
  const isSearching = searchMutation.isPending;

  return (
    <View style={styles.flex}>
      <View style={styles.searchRow}>
        <View style={[styles.inputWrap, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("vocab.searchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}
            returnKeyType="search"
            onSubmitEditing={runSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={8} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.searchBtn,
            { backgroundColor: accent.color, opacity: query.trim() && !isSearching ? 1 : 0.5 },
          ]}
          onPress={runSearch}
          activeOpacity={0.85}
          disabled={!query.trim() || isSearching}
        >
          <Text style={[styles.searchBtnText, { fontFamily: "Inter_600SemiBold" }]}>
            {t("vocab.searchAction")}
          </Text>
        </TouchableOpacity>
      </View>

      {results && results.length > 0 ? (
        <RomanizeToggle
          language={target}
          active={showRoman}
          onToggle={() => setShowRoman((v) => !v)}
          style={{ marginHorizontal: 20, marginBottom: 8 }}
        />
      ) : null}

      {isSearching ? (
        <View style={styles.center}>
          <ActivityIndicator color={accent.color} />
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.searching")}
          </Text>
        </View>
      ) : results == null ? (
        <Pressable style={styles.center} onPress={Keyboard.dismiss} accessible={false}>
          <View style={[styles.emptyIcon, { backgroundColor: accent.soft }]}>
            <Ionicons name="search" size={30} color={accent.color} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("vocab.searchEmptyTitle")}
          </Text>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.searchEmptySub", { lang: target })}
          </Text>
        </Pressable>
      ) : results.length === 0 ? (
        <Pressable style={styles.center} onPress={Keyboard.dismiss} accessible={false}>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.searchNoResults")}
          </Text>
        </Pressable>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPadding }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {results.map((w, i) => {
            const added = selectedByWord.has(w.word);
            return (
              <View
                key={`${w.word}:${i}`}
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
                    added ? { backgroundColor: "#DCFCE7" } : { backgroundColor: accent.color },
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
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 4,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
  },
  input: { flex: 1, fontSize: 15, padding: 0 },
  searchBtn: {
    paddingHorizontal: 18,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: { color: "#FFFFFF", fontSize: 15 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18 },
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
});
