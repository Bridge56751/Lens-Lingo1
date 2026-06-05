import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useListVocabSelections,
  useGetVocabExample,
  useCheckVocabSentence,
  type VocabSelection,
  type VocabExample,
  type VocabCheck,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useT } from "@/hooks/useT";
import { speakWord, stopSpeaking } from "@/lib/speech";

export default function VocabStudyScreen() {
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { prefs } = usePreferences();

  const target = prefs.targetLanguage;
  const native = prefs.nativeLanguage;

  const { ids } = useLocalSearchParams<{ ids?: string | string[] }>();
  const idsParam = Array.isArray(ids) ? ids.join(",") : ids;

  const { data: selections, isLoading } = useListVocabSelections({ targetLanguage: target });
  const deck = useMemo(() => {
    const all = (selections ?? []) as VocabSelection[];
    if (!idsParam) return all;
    const idSet = new Set(
      idsParam.split(",").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n)),
    );
    if (idSet.size === 0) return all;
    const subset = all.filter((s) => idSet.has(s.id));
    return subset.length > 0 ? subset : all;
  }, [selections, idsParam]);

  const [pos, setPos] = useState(0);
  const card = deck[pos];

  // Per-card UI state.
  const [example, setExample] = useState<VocabExample | null>(null);
  const [sentence, setSentence] = useState("");
  const [feedback, setFeedback] = useState<VocabCheck | null>(null);

  // Cache generated examples by word so navigating back doesn't refetch.
  const exampleCache = useRef<Map<string, VocabExample>>(new Map());
  // Tracks the word currently on screen so stale async results don't leak onto the wrong card.
  const currentWordRef = useRef<string | undefined>(undefined);

  const exampleMutation = useGetVocabExample();
  const checkMutation = useCheckVocabSentence();

  // Keep pos within range if the deck shrinks (e.g. language change / selection update).
  useEffect(() => {
    if (pos > deck.length) setPos(deck.length);
  }, [deck.length, pos]);

  // Reset card-local state whenever the visible word changes.
  useEffect(() => {
    currentWordRef.current = card?.word;
    setSentence("");
    setFeedback(null);
    if (card) {
      const cached = exampleCache.current.get(card.word);
      setExample(cached ?? null);
    } else {
      setExample(null);
    }
  }, [pos, card]);

  // Speak the word when a new card appears.
  useEffect(() => {
    if (card) speakWord(card.word, target);
  }, [pos, card, target]);

  useFocusEffect(
    React.useCallback(() => {
      return () => stopSpeaking();
    }, []),
  );

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 40 : insets.bottom + 24;

  const hear = (text: string) => {
    Haptics.selectionAsync();
    speakWord(text, target);
  };

  const loadExample = async () => {
    if (!card) return;
    const wordAtRequest = card.word;
    Haptics.selectionAsync();
    try {
      const result = await exampleMutation.mutateAsync({
        data: { word: wordAtRequest, targetLanguage: target, nativeLanguage: native },
      });
      exampleCache.current.set(wordAtRequest, result);
      // Ignore a result that arrives after the user has moved to another card.
      if (currentWordRef.current !== wordAtRequest) return;
      setExample(result);
      speakWord(result.sentence, target);
    } catch {
      // surfaced via exampleMutation.isError in the UI
    }
  };

  const checkSentence = async () => {
    if (!card || !sentence.trim()) return;
    const wordAtRequest = card.word;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await checkMutation.mutateAsync({
        data: {
          word: wordAtRequest,
          sentence: sentence.trim(),
          targetLanguage: target,
          nativeLanguage: native,
        },
      });
      // Ignore a result that arrives after the user has moved to another card.
      if (currentWordRef.current !== wordAtRequest) return;
      setFeedback(result);
      Haptics.notificationAsync(
        result.correct
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch {
      // surfaced via checkMutation.isError in the UI
    }
  };

  const next = () => {
    stopSpeaking();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPos((p) => p + 1);
  };

  const restart = () => {
    Haptics.selectionAsync();
    setPos(0);
  };

  const Header = (
    <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={26} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {t("vocab.myWords")}
      </Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (deck.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="albums" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("vocab.studyEmpty")}
          </Text>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.studyEmptySub", { lang: target })}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/vocab-bank")}
            activeOpacity={0.85}
          >
            <Ionicons name="book" size={18} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {t("vocab.openBank")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!card) {
    // Finished going through every picked word.
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: "#DCFCE7" }]}>
            <Ionicons name="checkmark-circle" size={36} color="#22C55E" />
          </View>
          <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("vocab.done")}
          </Text>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.doneSub")}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={restart}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {t("vocab.restart")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const progress = (pos + 1) / deck.length;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {Header}

      <View style={styles.progressWrap}>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          {t("vocab.progress", { current: pos + 1, total: deck.length })}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPadding }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Word card */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.speaker, { backgroundColor: colors.primary }]}
            onPress={() => hear(card.word)}
            activeOpacity={0.85}
            hitSlop={10}
          >
            <Ionicons name="volume-high" size={36} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.word, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {card.word}
          </Text>
          <Text style={[styles.translation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {card.translation}
          </Text>
          <TouchableOpacity onPress={() => hear(card.word)} activeOpacity={0.7} style={styles.replayLink}>
            <Ionicons name="refresh" size={14} color={colors.primary} />
            <Text style={[styles.replayText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {t("vocab.tapHear")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Example sentence */}
        <View style={[styles.block, { backgroundColor: colors.card }]}>
          <Text style={[styles.blockLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {t("vocab.example")}
          </Text>
          {example ? (
            <>
              <View style={styles.exampleRow}>
                <Text style={[styles.exampleSentence, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {example.sentence}
                </Text>
                <TouchableOpacity
                  style={[styles.speakerSmall, { backgroundColor: colors.primarySoft }]}
                  onPress={() => hear(example.sentence)}
                  activeOpacity={0.8}
                  hitSlop={8}
                >
                  <Ionicons name="volume-high" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.exampleTranslation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {example.translation}
              </Text>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={loadExample}
              activeOpacity={0.8}
              disabled={exampleMutation.isPending}
            >
              {exampleMutation.isPending ? (
                <>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    {t("vocab.loadingExample")}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                  <Text style={[styles.secondaryBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                    {t("vocab.showExample")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {exampleMutation.isError && !example && (
            <Text style={[styles.errorText, { color: "#DC2626", fontFamily: "Inter_500Medium" }]}>
              {t("vocab.actionError")}
            </Text>
          )}
        </View>

        {/* Your turn */}
        <View style={[styles.block, { backgroundColor: colors.card }]}>
          <Text style={[styles.blockLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {t("vocab.yourTurn")}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.background,
                fontFamily: "Inter_400Regular",
              },
            ]}
            value={sentence}
            onChangeText={setSentence}
            placeholder={t("vocab.inputPlaceholder", { word: card.word })}
            placeholderTextColor={colors.mutedForeground}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: sentence.trim() && !checkMutation.isPending ? 1 : 0.5 },
            ]}
            onPress={checkSentence}
            activeOpacity={0.85}
            disabled={!sentence.trim() || checkMutation.isPending}
          >
            {checkMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
            )}
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              {checkMutation.isPending ? t("vocab.checking") : t("vocab.check")}
            </Text>
          </TouchableOpacity>

          {checkMutation.isError && !feedback && (
            <Text style={[styles.errorText, { color: "#DC2626", fontFamily: "Inter_500Medium" }]}>
              {t("vocab.actionError")}
            </Text>
          )}

          {feedback && (
            <View
              style={[
                styles.feedback,
                { backgroundColor: feedback.correct ? "#DCFCE7" : "#FEF3C7" },
              ]}
            >
              <View style={styles.feedbackHead}>
                <Ionicons
                  name={feedback.correct ? "checkmark-circle" : "bulb"}
                  size={18}
                  color={feedback.correct ? "#16A34A" : "#D97706"}
                />
                <Text
                  style={[
                    styles.feedbackTitle,
                    { color: feedback.correct ? "#16A34A" : "#D97706", fontFamily: "Inter_700Bold" },
                  ]}
                >
                  {feedback.correct ? t("vocab.correct") : t("vocab.needsWork")}
                </Text>
              </View>
              <Text style={[styles.feedbackText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {feedback.feedback}
              </Text>
              {feedback.correction ? (
                <View style={styles.correctionRow}>
                  <Text style={[styles.correctionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                    {t("vocab.correction")}
                  </Text>
                  <Text style={[styles.correctionText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {feedback.correction}
                  </Text>
                  <TouchableOpacity
                    style={[styles.speakerSmall, { backgroundColor: colors.primarySoft }]}
                    onPress={() => hear(feedback.correction)}
                    activeOpacity={0.8}
                    hitSlop={8}
                  >
                    <Ionicons name="volume-high" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primarySoft }]}
          onPress={next}
          activeOpacity={0.85}
        >
          <Text style={[styles.nextBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {t("vocab.next")}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  bigIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  bigTitle: { fontSize: 20, textAlign: "center" },
  bigSub: { fontSize: 14, textAlign: "center", maxWidth: 300, lineHeight: 20 },

  progressWrap: { paddingHorizontal: 20, gap: 6, paddingBottom: 10 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 12, textAlign: "right" },

  card: {
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    marginBottom: 14,
  },
  speaker: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  word: { fontSize: 30, textAlign: "center", textTransform: "capitalize" },
  translation: { fontSize: 15, textAlign: "center" },
  replayLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  replayText: { fontSize: 13 },

  block: { borderRadius: 18, padding: 16, marginBottom: 14, gap: 10 },
  blockLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },

  exampleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  exampleSentence: { flex: 1, fontSize: 17, lineHeight: 24 },
  exampleTranslation: { fontSize: 14, lineHeight: 20 },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14 },
  errorText: { fontSize: 13, textAlign: "center", marginTop: 2 },

  input: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlignVertical: "top",
  },

  feedback: { borderRadius: 14, padding: 14, gap: 8 },
  feedbackHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  feedbackTitle: { fontSize: 15 },
  feedbackText: { fontSize: 14, lineHeight: 20 },
  correctionRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  correctionLabel: { fontSize: 12 },
  correctionText: { flex: 1, fontSize: 15 },

  speakerSmall: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

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

  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 2,
  },
  nextBtnText: { fontSize: 16 },
});
