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
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import {
  useListVocabSelections,
  useGetVocabExample,
  useCheckVocabSentence,
  usePronounceVocabWord,
  type VocabSelection,
  type VocabCheck,
  type VocabPronounce,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePreferences } from "@/hooks/usePreferences";
import { useRomanizations } from "@/hooks/useRomanizations";
import { RomanizeToggle } from "@/components/RomanizeToggle";
import { useT } from "@/hooks/useT";
import { ProGuard } from "@/components/ProGuard";
import { speakWord, prefetchSpeech, stopSpeaking } from "@/lib/speech";
import {
  readAudio,
  transcribeAudio,
  AudioTooLongError,
  EmptyTranscriptError,
  ProRequiredError,
} from "@/lib/audio";
import { playEffect } from "@/lib/sounds";
import {
  getOfflineExample,
  setOfflineExample,
  type OfflineExample,
} from "@/lib/offlineExamples";
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
    // The default deck is the active learning list — mastered words are a "done"
    // archive and only ever studied when their ids are passed explicitly (Review).
    const learning = all.filter((s) => !s.mastered);
    if (!idsParam) return learning;
    const idSet = new Set(
      idsParam.split(",").map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n)),
    );
    if (idSet.size === 0) return learning;
    const subset = all.filter((s) => idSet.has(s.id));
    return subset.length > 0 ? subset : learning;
  }, [selections, idsParam]);

  const [pos, setPos] = useState(0);
  const [showRoman, setShowRoman] = useState(false);
  const card = deck[pos];

  // Per-card UI state.
  const [example, setExample] = useState<OfflineExample | null>(null);
  const wordRoman = useRomanizations(
    card ? [card.word] : [],
    target,
    showRoman,
  );
  const exampleRoman = useRomanizations(
    example ? [example.sentence] : [],
    target,
    showRoman,
    // A downloaded example carries its own romanization so the aid works offline.
    example?.romanization
      ? { [example.sentence]: example.romanization }
      : undefined,
  );
  const [sentence, setSentence] = useState("");
  const [feedback, setFeedback] = useState<VocabCheck | null>(null);

  // Voice input for the learner's own sentence.
  // Metering powers "Say it" auto-stop: we watch the input level to detect
  // when the learner has finished saying the word.
  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const [isRecording, setIsRecordingState] = useState(false);
  const isRecordingRef = useRef(false);
  const setIsRecording = React.useCallback((value: boolean) => {
    isRecordingRef.current = value;
    setIsRecordingState(value);
  }, []);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // "Say it" pronunciation practice on the word card. Shares the single
  // audioRecorder with the sentence mic, so each flow guards against the other.
  const [sayItRecording, setSayItRecordingState] = useState(false);
  const setSayItRecording = React.useCallback(
    (value: boolean) => {
      // Reuse the shared ref so the unmount teardown stops whichever flow is live.
      isRecordingRef.current = value;
      setSayItRecordingState(value);
    },
    [],
  );
  const [sayItResult, setSayItResult] = useState<VocabPronounce | null>(null);
  // Held from the moment the learner taps "stop" until grading fully finishes.
  // Covers the window where recording has been flagged off but the native
  // recorder is still stopping / the file is still being read — without it the
  // recorder could be re-entered mid-stop (mutation.isPending is still false).
  const [sayItBusy, setSayItBusy] = useState(false);
  const pronounceMutation = usePronounceVocabWord();
  // Auto-stop bookkeeping for "Say it": once speech has been heard, ~1s of
  // silence (or a hard time cap) triggers grading without a second tap.
  const recorderState = useAudioRecorderState(audioRecorder, 150);
  const sayItStartedAtRef = useRef(0);
  const sayItHeardSpeechRef = useRef(false);
  const sayItSilenceSinceRef = useRef<number | null>(null);

  // Flashcard flip: front = word + pronunciation, back = sentence practice.
  const [side, setSide] = useState<"front" | "back">("front");
  const flipAnim = useRef(new Animated.Value(0)).current;
  const flipRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });
  const flippingRef = useRef(false);
  // Bumped on every card change and flip start; stale animation callbacks
  // compare against it and bail instead of mutating the new card's state.
  const flipEpochRef = useRef(0);

  // Cache generated examples by word so navigating back doesn't refetch.
  const exampleCache = useRef<Map<string, OfflineExample>>(new Map());
  // Tracks the word currently on screen so stale async results don't leak onto the wrong card.
  const currentWordRef = useRef<string | undefined>(undefined);
  // Scroll the "Now you try" input above the keyboard when it focuses.
  const scrollRef = useRef<ScrollView>(null);
  // Y offset of the "Your turn" block within the scroll content, captured on
  // layout so focusing the input scrolls it into view (not past it).
  const yourTurnY = useRef(0);

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
    setSayItResult(null);
    setSide("front");
    flipEpochRef.current++; // invalidate any in-flight flip callbacks
    flipAnim.stopAnimation();
    flipAnim.setValue(0);
    flippingRef.current = false;
    pronounceMutation.reset();
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
      // Best-effort teardown on unmount. expo-audio can release the recorder's
      // native shared object during unmount; touching ANY of its
      // properties/methods afterward throws NativeSharedObjectNotFoundException
      // synchronously, which surfaces as an uncaught redbox on the device. Never
      // read the native `audioRecorder.isRecording` getter here (use our ref),
      // and wrap every native call in try/catch.
      try {
        if (isRecordingRef.current) {
          audioRecorder.stop().catch(() => {});
        }
      } catch {
        // recorder already released — nothing to stop
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
    // Intentionally run only on true unmount. `audioRecorder` is stable from
    // useAudioRecorder; depending on it risks tearing down a live recorder
    // mid-session if its identity ever changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (sayItRecording || sayItBusy) return;
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
      if (err instanceof ProRequiredError) {
        // Paywall already opened by the helper; don't show a generic error.
        return;
      } else if (err instanceof AudioTooLongError) {
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

  const startSayIt = async () => {
    if (sayItRecording || sayItBusy || isRecording || isTranscribing) return;
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
      setSayItResult(null);
      pronounceMutation.reset();
      sayItStartedAtRef.current = Date.now();
      sayItHeardSpeechRef.current = false;
      sayItSilenceSinceRef.current = null;
      setSayItRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      setSayItRecording(false);
      Alert.alert(t("conv.micErrorTitle"), t("conv.micErrorBody"));
    }
  };

  const stopSayItAndGrade = async () => {
    if (!sayItRecording || sayItBusy || !card) return;
    const wordAtRequest = card.word;
    setSayItBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await audioRecorder.stop();
      // Only now is the native recorder fully stopped and safe to re-enter.
      setSayItRecording(false);
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("No recording uri");
      const { base64 } = await readAudio(uri);

      const result = await pronounceMutation.mutateAsync({
        data: {
          audioBase64: base64,
          word: wordAtRequest,
          targetLanguage: target,
          nativeLanguage: native,
        },
      });
      // Ignore a grade that arrives after the user moved to another card.
      if (currentWordRef.current !== wordAtRequest) return;
      void recordPractice();
      void markVoiceChat();
      setSayItResult(result);
      if (!result.heard) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (result.correct) {
        playEffect("ding");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        playEffect("miss");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      // surfaced via pronounceMutation.isError in the UI
    } finally {
      setSayItRecording(false);
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setSayItBusy(false);
    }
  };

  // Auto-stop "Say it": watch the mic level while recording. Once we've heard
  // speech and then ~1s of silence, grade automatically. A hard cap ends the
  // recording even when metering is unavailable (e.g. web preview).
  useEffect(() => {
    if (!sayItRecording || sayItBusy) return;
    const now = Date.now();
    const MAX_RECORD_MS = 6000;
    const SILENCE_AFTER_SPEECH_MS = 1000;
    const SPEECH_DB = -35;
    const SILENCE_DB = -40;

    if (now - sayItStartedAtRef.current >= MAX_RECORD_MS) {
      void stopSayItAndGrade();
      return;
    }
    const level = recorderState.metering;
    if (typeof level !== "number") return; // no metering — rely on the cap
    if (level > SPEECH_DB) {
      sayItHeardSpeechRef.current = true;
      sayItSilenceSinceRef.current = null;
    } else if (sayItHeardSpeechRef.current && level < SILENCE_DB) {
      if (sayItSilenceSinceRef.current == null) {
        sayItSilenceSinceRef.current = now;
      } else if (now - sayItSilenceSinceRef.current >= SILENCE_AFTER_SPEECH_MS) {
        void stopSayItAndGrade();
      }
    } else {
      sayItSilenceSinceRef.current = null;
    }
    // recorderState updates every 150ms while recording, driving this check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState, sayItRecording, sayItBusy]);

  // Flip the flashcard: rotate to edge-on, swap the face, rotate back.
  const flipBlocked =
    isRecording ||
    isTranscribing ||
    sayItRecording ||
    sayItBusy ||
    checkMutation.isPending;
  const flip = () => {
    if (flippingRef.current || flipBlocked) return;
    flippingRef.current = true;
    // Epoch guard: a card change (Next) invalidates any in-flight animation
    // callbacks so a stale flip can't flip the NEW card to its back face.
    const epoch = ++flipEpochRef.current;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    const goingToBack = side === "front";
    // Load the example sentence as soon as the learner flips to the back.
    if (goingToBack && !example && !exampleMutation.isPending) {
      void loadExample();
    }
    Animated.timing(flipAnim, {
      toValue: 1,
      duration: 140,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      if (flipEpochRef.current !== epoch) return;
      setSide(goingToBack ? "back" : "front");
      Animated.timing(flipAnim, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        if (flipEpochRef.current !== epoch) return;
        flippingRef.current = false;
      });
    });
  };

  const next = () => {
    if (flippingRef.current) return; // let the flip settle first
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
        {/* Flashcard: front = word + pronunciation, back = sentence practice */}
        <Animated.View
          style={{ transform: [{ perspective: 1000 }, { rotateY: flipRotate }] }}
        >
        {side === "front" ? (
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
          {/* Say it: record the learner saying the word, then grade it */}
          <TouchableOpacity
            style={[
              styles.sayItBtn,
              sayItRecording
                ? { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }
                : { backgroundColor: colors.background, borderColor: colors.border },
            ]}
            onPress={sayItRecording ? stopSayItAndGrade : startSayIt}
            activeOpacity={0.85}
            disabled={(sayItBusy && !sayItRecording) || isRecording || isTranscribing}
          >
            {sayItBusy && !sayItRecording ? (
              <>
                <ActivityIndicator size="small" color={accent.color} />
                <Text style={[styles.micBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  {t("vocab.sayItGrading")}
                </Text>
              </>
            ) : sayItRecording ? (
              <>
                <View style={styles.recDot} />
                <Text style={[styles.micBtnText, { color: "#DC2626", fontFamily: "Inter_600SemiBold" }]}>
                  {t("vocab.sayItListening")}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="mic" size={18} color={accent.color} />
                <Text style={[styles.micBtnText, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
                  {t("vocab.sayIt")}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {pronounceMutation.isError && !sayItResult && (
            <Text style={[styles.errorText, { color: "#DC2626", fontFamily: "Inter_500Medium" }]}>
              {t("vocab.actionError")}
            </Text>
          )}

          {sayItResult && !sayItResult.heard ? (
            <View style={[styles.sayItResult, { backgroundColor: "#FEF3C7" }]}>
              <View style={styles.feedbackHead}>
                <Ionicons name="mic-off" size={18} color="#D97706" />
                <Text style={[styles.feedbackText, { flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {t("vocab.sayItNoSpeech")}
                </Text>
              </View>
            </View>
          ) : sayItResult ? (
            <View
              style={[
                styles.sayItResult,
                { backgroundColor: sayItResult.correct ? "#DCFCE7" : "#FEF3C7" },
              ]}
            >
              <View style={styles.feedbackHead}>
                <Ionicons
                  name={sayItResult.correct ? "checkmark-circle" : "ear"}
                  size={18}
                  color={sayItResult.correct ? "#16A34A" : "#D97706"}
                />
                <Text
                  style={[
                    styles.feedbackTitle,
                    {
                      flex: 1,
                      color: sayItResult.correct ? "#16A34A" : "#D97706",
                      fontFamily: "Inter_700Bold",
                    },
                  ]}
                >
                  {sayItResult.correct ? t("vocab.sayItGreat") : t("vocab.sayItClose")}
                </Text>
                <View
                  style={[
                    styles.scoreBadge,
                    { backgroundColor: sayItResult.correct ? "#16A34A" : "#D97706" },
                  ]}
                >
                  <Text style={[styles.scoreBadgeText, { fontFamily: "Inter_700Bold" }]}>
                    {sayItResult.score}
                  </Text>
                </View>
              </View>
              {sayItResult.feedback ? (
                <Text style={[styles.feedbackText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {sayItResult.feedback}
                </Text>
              ) : null}
              {!sayItResult.correct && sayItResult.heard ? (
                <Text style={[styles.heardText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {t("vocab.sayItHeard", { heard: sayItResult.heard })}
                </Text>
              ) : null}
            </View>
          ) : null}

          <RomanizeToggle
            language={target}
            active={showRoman}
            onToggle={() => setShowRoman((v) => !v)}
            style={{ alignSelf: "center", marginTop: 12 }}
          />

          <TouchableOpacity
            style={[styles.flipBtn, { borderColor: accent.color }]}
            onPress={flip}
            activeOpacity={0.85}
            disabled={flipBlocked}
          >
            <Ionicons name="sync" size={17} color={accent.color} />
            <Text style={[styles.flipBtnText, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
              {t("vocab.flipToSentence")}
            </Text>
          </TouchableOpacity>
        </View>
        ) : (
        <View style={[styles.cardBack, { backgroundColor: colors.card }]}>
          {/* Example sentence */}
          <View style={styles.backSection}>
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

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Your turn */}
          <View
            style={styles.backSection}
            onLayout={(e) => {
              yourTurnY.current = e.nativeEvent.layout.y;
            }}
          >
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
              // Bring the input (top of the "Your turn" block) just under the
              // header and above the keyboard. scrollToEnd overshot to the
              // buttons below the input, hiding where the user types.
              setTimeout(
                () =>
                  scrollRef.current?.scrollTo({
                    y: Math.max(yourTurnY.current - 12, 0),
                    animated: true,
                  }),
                250,
              );
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
            style={styles.flipBackLink}
            onPress={flip}
            activeOpacity={0.7}
            disabled={flipBlocked}
          >
            <Ionicons name="sync" size={15} color={accent.color} />
            <Text style={[styles.flipBtnText, { color: accent.color, fontFamily: "Inter_600SemiBold" }]}>
              {t("vocab.flipToWord")}
            </Text>
          </TouchableOpacity>
        </View>
        )}
        </Animated.View>

        <TouchableOpacity
          style={[
            styles.nextBtn,
            {
              backgroundColor: accent.soft,
              opacity: isRecording || isTranscribing || sayItRecording || sayItBusy ? 0.5 : 1,
            },
          ]}
          onPress={next}
          activeOpacity={0.85}
          disabled={isRecording || isTranscribing || sayItRecording || sayItBusy}
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
  cardBack: {
    borderRadius: 24,
    padding: 20,
    gap: 14,
    marginBottom: 14,
  },
  backSection: { gap: 10 },
  divider: { height: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  flipBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignSelf: "stretch",
    marginTop: 4,
  },
  flipBtnText: { fontSize: 14 },
  flipBackLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
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

  sayItBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "stretch",
  },
  sayItResult: { alignSelf: "stretch", borderRadius: 14, padding: 12, gap: 8 },
  scoreBadge: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignItems: "center",
  },
  scoreBadgeText: { color: "#FFFFFF", fontSize: 13 },
  heardText: { fontSize: 13, fontStyle: "italic" },

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
