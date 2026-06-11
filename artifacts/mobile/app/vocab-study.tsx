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
  InputAccessoryView,
  Keyboard,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
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
import { useRomanizations } from "@/hooks/useRomanizations";
import { RomanizeToggle } from "@/components/RomanizeToggle";
import { useT } from "@/hooks/useT";
import { ProGuard } from "@/components/ProGuard";
import { speakWord, prefetchSpeech, stopSpeaking } from "@/lib/speech";
import {
  transcribeAudio,
  AudioTooLongError,
  EmptyTranscriptError,
} from "@/lib/audio";
import { getOfflineExample, setOfflineExample } from "@/lib/offlineExamples";
import { recordPractice, markVoiceChat } from "@/lib/activity";
import { MODULE_ACCENTS } from "@/constants/colors";

// Target languages whose scripts a default Latin/QWERTY keyboard can't type, so
// the learner needs to add that keyboard to their device (or use the mic).
const NON_LATIN_LANGS = new Set([
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Russian",
  "Hindi",
]);

const INPUT_ACCESSORY_ID = "vocabSentenceInput";

const accent = MODULE_ACCENTS.vocab;

export default function VocabStudyScreen() {
  return (
    <ProGuard>
      <VocabStudyScreenInner />
    </ProGuard>
  );
}

function VocabStudyScreenInner() {
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
  const [showRoman, setShowRoman] = useState(false);
  const card = deck[pos];

  // Per-card UI state.
  const [example, setExample] = useState<VocabExample | null>(null);
  const wordRoman = useRomanizations(
    card ? [card.word] : [],
    target,
    showRoman,
  );
  const exampleRoman = useRomanizations(
    example ? [example.sentence] : [],
    target,
    showRoman,
  );
  const [sentence, setSentence] = useState("");
  const [feedback, setFeedback] = useState<VocabCheck | null>(null);

  // Voice input for the learner's own sentence.
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Cache generated examples by word so navigating back doesn't refetch.
  const exampleCache = useRef<Map<string, VocabExample>>(new Map());
  // Tracks the word currently on screen so stale async results don't leak onto the wrong card.
  const currentWordRef = useRef<string | undefined>(undefined);
  // Scroll the "Now you try" input above the keyboard when it focuses.
  const scrollRef = useRef<ScrollView>(null);

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
    if (!card) {
      setExample(null);
      return;
    }
    const cached = exampleCache.current.get(card.word);
    if (cached) {
      setExample(cached);
      return;
    }
    setExample(null);
    // Offline-first: hydrate a previously downloaded example so studying saved
    // words works with no network.
    const word = card.word;
    void getOfflineExample(target, native, word).then((stored) => {
      if (!stored) return;
      exampleCache.current.set(word, stored);
      if (currentWordRef.current === word) setExample(stored);
    });
  }, [pos, card, target, native]);

  // Speak the word when a new card appears, and warm the audio for the next few
  // cards so advancing feels instant instead of waiting on a fresh synth.
  useEffect(() => {
    if (card) speakWord(card.word, target);
    for (let i = 1; i <= 3; i++) {
      const upcoming = deck[pos + i];
      if (upcoming) prefetchSpeech(upcoming.word, target);
    }
  }, [pos, card, target, deck]);

  useFocusEffect(
    React.useCallback(() => {
      return () => stopSpeaking();
    }, []),
  );

  useEffect(() => {
    return () => {
      if (audioRecorder.isRecording) {
        audioRecorder.stop().catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, [audioRecorder]);

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
      // Persist so this example is available offline next time.
      void setOfflineExample(target, native, wordAtRequest, result);
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
      void recordPractice();
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

  const startRecording = async () => {
    if (isRecording || isTranscribing || checkMutation.isPending) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t("conv.micDeniedTitle"), t("conv.micDeniedBody"));
        return;
      }
      stopSpeaking();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      setIsRecording(false);
      Alert.alert(t("conv.micErrorTitle"), t("conv.micErrorBody"));
    }
  };

  const stopAndTranscribe = async () => {
    if (!isRecording) return;
    const wordAtRequest = currentWordRef.current;
    setIsRecording(false);
    setIsTranscribing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("No recording uri");

      const transcript = await transcribeAudio(uri, target);
      // Ignore a transcript that arrives after the user moved to another card.
      if (currentWordRef.current !== wordAtRequest) return;
      void markVoiceChat();
      // Drop the transcription into the input so the learner can review and
      // edit before submitting it for the (strict) grade.
      setSentence((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    } catch (err) {
      if (err instanceof AudioTooLongError) {
        Alert.alert(t("conv.micTooLongTitle"), t("conv.micTooLongBody"));
      } else if (err instanceof EmptyTranscriptError) {
        Alert.alert(t("conv.transcribeEmptyTitle"), t("conv.transcribeEmptyBody"));
      } else {
        Alert.alert(t("conv.transcribeErrorTitle"), t("conv.transcribeErrorBody"));
      }
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setIsTranscribing(false);
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
          <ActivityIndicator color={accent.color} />
        </View>
      </View>
    );
  }

  if (deck.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {Header}
        <View style={styles.center}>
          <View style={[styles.bigIcon, { backgroundColor: accent.soft }]}>
            <Ionicons name="albums" size={32} color={accent.color} />
          </View>
          <Text style={[styles.bigTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("vocab.studyEmpty")}
          </Text>
          <Text style={[styles.bigSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("vocab.studyEmptySub", { lang: target })}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: accent.color }]}
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
            style={[styles.primaryBtn, { backgroundColor: accent.color }]}
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
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
    >
      {Header}

      <View style={styles.progressWrap}>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accent.color }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          {t("vocab.progress", { current: pos + 1, total: deck.length })}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPadding }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        {/* Word card */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.speaker, { backgroundColor: accent.color }]}
            onPress={() => hear(card.word)}
            activeOpacity={0.85}
            hitSlop={10}
          >
            <Ionicons name="volume-high" size={36} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.word, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {card.word}
          </Text>
          {wordRoman.get(card.word) ? (
            <Text style={[styles.translation, { color: accent.color, fontStyle: "italic", fontFamily: "Inter_400Regular" }]}>
              {wordRoman.get(card.word)}
            </Text>
          ) : null}
          <Text style={[styles.translation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {card.translation}
          </Text>
          <TouchableOpacity onPress={() => hear(card.word)} activeOpacity={0.7} style={styles.replayLink}>
            <Ionicons name="refresh" size={14} color={accent.color} />
            <Text style={[styles.replayText, { color: accent.color, fontFamily: "Inter_500Medium" }]}>
              {t("vocab.tapHear")}
            </Text>
          </TouchableOpacity>
          <RomanizeToggle
            language={target}
            active={showRoman}
            onToggle={() => setShowRoman((v) => !v)}
            style={{ alignSelf: "center", marginTop: 12 }}
          />
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
                  style={[styles.speakerSmall, { backgroundColor: accent.soft }]}
                  onPress={() => hear(example.sentence)}
                  activeOpacity={0.8}
                  hitSlop={8}
                >
                  <Ionicons name="volume-high" size={18} color={accent.color} />
                </TouchableOpacity>
              </View>
              {exampleRoman.get(example.sentence) ? (
                <Text style={[styles.exampleTranslation, { color: accent.color, fontStyle: "italic", fontFamily: "Inter_400Regular" }]}>
                  {exampleRoman.get(example.sentence)}
                </Text>
              ) : null}
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
                  <ActivityIndicator size="small" color={accent.color} />
                  <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    {t("vocab.loadingExample")}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color={accent.color} />
                  <Text style={[styles.secondaryBtnText, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
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
          {NON_LATIN_LANGS.has(target) && (
            <View style={styles.scriptHint}>
              <Ionicons name="information-circle-outline" size={15} color={colors.mutedForeground} />
              <Text style={[styles.scriptHintText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {t("vocab.scriptHint", { lang: target })}
              </Text>
            </View>
          )}
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
            inputAccessoryViewID={Platform.OS === "ios" ? INPUT_ACCESSORY_ID : undefined}
            onFocus={() => {
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
            }}
          />
          <TouchableOpacity
            style={[
              styles.micBtn,
              isRecording
                ? { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }
                : { backgroundColor: colors.background, borderColor: colors.border },
            ]}
            onPress={isRecording ? stopAndTranscribe : startRecording}
            activeOpacity={0.85}
            disabled={isTranscribing || checkMutation.isPending}
          >
            {isTranscribing ? (
              <>
                <ActivityIndicator size="small" color={accent.color} />
                <Text style={[styles.micBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  {t("vocab.transcribing")}
                </Text>
              </>
            ) : isRecording ? (
              <>
                <View style={styles.recDot} />
                <Text style={[styles.micBtnText, { color: "#DC2626", fontFamily: "Inter_600SemiBold" }]}>
                  {t("vocab.recording")}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="mic" size={18} color={accent.color} />
                <Text style={[styles.micBtnText, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
                  {t("vocab.speak")}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: accent.color, opacity: sentence.trim() && !checkMutation.isPending ? 1 : 0.5 },
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
                    style={[styles.speakerSmall, { backgroundColor: accent.soft }]}
                    onPress={() => hear(feedback.correction)}
                    activeOpacity={0.8}
                    hitSlop={8}
                  >
                    <Ionicons name="volume-high" size={18} color={accent.color} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: accent.soft, opacity: isRecording || isTranscribing ? 0.5 : 1 }]}
          onPress={next}
          activeOpacity={0.85}
          disabled={isRecording || isTranscribing}
        >
          <Text style={[styles.nextBtnText, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
            {t("vocab.next")}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={accent.color} />
        </TouchableOpacity>
      </ScrollView>

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID}>
          <View style={[styles.accessoryBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={10} activeOpacity={0.7}>
              <Text style={[styles.accessoryDone, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
                {t("vocab.doneTyping")}
              </Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
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
  accessoryBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accessoryDone: { fontSize: 16 },

  micBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  micBtnText: { fontSize: 14 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#DC2626" },

  scriptHint: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: -2 },
  scriptHintText: { flex: 1, fontSize: 12, lineHeight: 17 },

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
