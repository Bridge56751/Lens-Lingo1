import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { File } from "expo-file-system";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  useGetOpenaiConversation,
  useGradeOpenaiConversation,
  type OpenaiConversationGrade,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOpenaiConversationQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { usePreferences, type Language } from "@/hooks/usePreferences";
import { getDeviceIdSync } from "@/lib/device";
import { authHeader } from "@/lib/authToken";
import { romanizeText, isNonLatinLanguage } from "@/lib/romanize";
import { speakWord, stopSpeaking, prefetchSpeech } from "@/lib/speech";
import { fetch as expoFetch } from "expo/fetch";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const WHISPER_LANG: Record<string, string> = {
  English: "en",
  Spanish: "es",
  French: "fr",
  German: "de",
  Italian: "it",
  Portuguese: "pt",
  Japanese: "ja",
  Chinese: "zh",
  Korean: "ko",
  Arabic: "ar",
  Russian: "ru",
  Hindi: "hi",
  Dutch: "nl",
};

const MAX_AUDIO_BASE64_LEN = 7_000_000;

// Reads a recorded audio file into base64. On web, expo-file-system's File API
// can't read the blob: URLs that expo-audio produces, so fetch the blob and
// convert it with FileReader instead. Native uses the File API directly.
async function readAudio(uri: string): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === "web") {
    const blob = await fetch(uri).then((r) => r.blob());
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read audio"));
      reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.includes(",")
      ? dataUrl.slice(dataUrl.indexOf(",") + 1)
      : "";
    const mimeType = (blob.type || "audio/webm").split(";")[0] ?? "audio/webm";
    return { base64, mimeType };
  }
  const base64 = await new File(uri).base64();
  return { base64, mimeType: "audio/m4a" };
}

function SparkleIcon({ color }: { color: string }) {
  return (
    <View style={styles.sparkleWrap}>
      <Ionicons name="sparkles" size={14} color={color} />
    </View>
  );
}

function MessageBubble({
  message,
  colors,
  language,
  nativeLanguage,
}: {
  message: Message;
  colors: ReturnType<typeof useColors>;
  language: Language;
  nativeLanguage: string;
}) {
  const t = useT();
  const isUser = message.role === "user";
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [romanization, setRomanization] = useState<string | null>(null);
  const [isRomanizing, setIsRomanizing] = useState(false);
  // The romanize aid only makes sense for AI turns written in a non-Latin
  // target language; it's an on-demand per-message button (no global setting).
  const canRomanize = isNonLatinLanguage(language);

  const toggleRomanization = useCallback(async () => {
    Haptics.selectionAsync();
    if (romanization !== null) {
      setRomanization(null);
      return;
    }
    if (isRomanizing) return;
    setIsRomanizing(true);
    try {
      setRomanization(await romanizeText(message.content, language));
    } catch {
      Alert.alert(t("conv.romanizeError"));
    } finally {
      setIsRomanizing(false);
    }
  }, [romanization, isRomanizing, message.content, language, t]);

  const toggleTranslation = useCallback(async () => {
    Haptics.selectionAsync();
    if (translation !== null) {
      setTranslation(null);
      return;
    }
    if (isTranslating) return;
    setIsTranslating(true);
    try {
      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "";
      const response = await expoFetch(`${baseUrl}/api/openai/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getDeviceIdSync() ? { "x-device-id": getDeviceIdSync()! } : {}),
          ...(await authHeader()),
        },
        body: JSON.stringify({ text: message.content, to: nativeLanguage }),
      });
      if (!response.ok) throw new Error("translate failed");
      const data = (await response.json()) as { translation?: string };
      if (!data.translation) throw new Error("empty translation");
      setTranslation(data.translation);
    } catch {
      Alert.alert(t("conv.translateError"));
    } finally {
      setIsTranslating(false);
    }
  }, [translation, isTranslating, message.content, nativeLanguage, t]);

  if (isUser) {
    return (
      <View style={[styles.bubbleRow, styles.userRow]}>
        <View
          style={[
            styles.bubble,
            styles.userBubble,
            { backgroundColor: colors.userBubble },
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              { color: colors.userBubbleText, fontFamily: "Inter_400Regular" },
            ]}
          >
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleRow, styles.aiRow]}>
      <View
        style={[
          styles.bubble,
          styles.aiBubble,
          { backgroundColor: colors.aiBubble },
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: colors.aiBubbleText, fontFamily: "Inter_400Regular" },
          ]}
        >
          {message.content}
        </Text>
        {canRomanize && romanization !== null ? (
          <View style={[styles.translationBox, { borderTopColor: colors.border }]}>
            <Text
              style={[
                styles.bubbleText,
                styles.translationText,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {romanization}
            </Text>
          </View>
        ) : null}
        {translation !== null ? (
          <View style={[styles.translationBox, { borderTopColor: colors.border }]}>
            <Text
              style={[
                styles.bubbleText,
                styles.translationText,
                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
              ]}
            >
              {translation}
            </Text>
          </View>
        ) : null}
        <View style={styles.bubbleActions}>
          <TouchableOpacity
            style={styles.speakButton}
            onPress={() => {
              Haptics.selectionAsync();
              speakWord(message.content, language);
            }}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Ionicons name="volume-medium" size={16} color={colors.primary} />
            <Text style={[styles.speakLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {t("alphabet.tapToHear")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.speakButton}
            onPress={toggleTranslation}
            disabled={isTranslating}
            hitSlop={8}
            activeOpacity={0.7}
          >
            {isTranslating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="language" size={16} color={colors.primary} />
            )}
            <Text style={[styles.speakLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {isTranslating
                ? t("conv.translating")
                : translation !== null
                  ? t("conv.hideTranslation")
                  : t("conv.translate")}
            </Text>
          </TouchableOpacity>
          {canRomanize ? (
            <TouchableOpacity
              style={styles.speakButton}
              onPress={toggleRomanization}
              disabled={isRomanizing}
              hitSlop={8}
              activeOpacity={0.7}
            >
              {isRomanizing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="text" size={16} color={colors.primary} />
              )}
              <Text style={[styles.speakLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                {isRomanizing
                  ? t("conv.romanizing")
                  : romanization !== null
                    ? t("conv.hideRomanization")
                    : t("conv.romanize")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <SparkleIcon color={colors.primary} />
    </View>
  );
}

function TypingIndicator({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.bubbleRow, styles.aiRow]}>
      <View style={[styles.bubble, styles.aiBubble, { backgroundColor: colors.aiBubble }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
      <SparkleIcon color={colors.primary} />
    </View>
  );
}

export default function ConversationScreen() {
  const t = useT();
  const { prefs } = usePreferences();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = parseInt(id ?? "0", 10);
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList<Message>>(null);
  const sendingRef = useRef(false);
  const inputTextRef = useRef("");

  const [inputText, setInputTextState] = useState("");
  const setInputText = useCallback((value: string) => {
    inputTextRef.current = value;
    setInputTextState(value);
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecordingState] = useState(false);
  const isRecordingRef = useRef(false);
  const setIsRecording = useCallback((value: boolean) => {
    isRecordingRef.current = value;
    setIsRecordingState(value);
  }, []);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [grade, setGrade] = useState<OpenaiConversationGrade | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const { mutateAsync: gradeConversation, isPending: isGrading } =
    useGradeOpenaiConversation();

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

  // Stop tutor playback when the screen loses focus (blur) or unmounts — a
  // stack screen can blur without unmounting, so this covers both.
  useFocusEffect(
    useCallback(() => {
      return () => stopSpeaking();
    }, []),
  );

  const { data: conversation, isLoading, dataUpdatedAt } = useGetOpenaiConversation(conversationId, {
    query: {
      queryKey: getGetOpenaiConversationQueryKey(conversationId),
      enabled: !!conversationId,
    },
  });

  useEffect(() => {
    // Don't overwrite optimistic/in-flight messages while a send is active;
    // the post-send query invalidation will re-run this and reconcile cleanly.
    if (sendingRef.current) return;
    if (conversation?.messages) {
      const serverMessages = conversation.messages.map((m) => ({
        id: m.id.toString(),
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setMessages(serverMessages);
    }
  }, [conversation?.messages?.length, dataUpdatedAt]);

  // Keep local grade in sync with the server. Re-run on conversation id too so a
  // stale grade from a previously-viewed conversation can't bleed into an
  // ungraded one. Using `?? null` is race-safe: right after runGrade() sets the
  // grade locally, neither dep has changed yet, so this effect won't clobber it.
  useEffect(() => {
    setGrade(conversation?.grade ?? null);
  }, [conversation?.grade, conversationId]);

  const parts = (conversation?.title ?? "").split(" • ");
  const itemName = parts[0] ?? t("conv.fallbackName");
  const language = prefs.targetLanguage;

  // Warm the TTS cache for the latest tutor message so the first "tap to hear"
  // after opening/returning to a conversation plays instantly instead of
  // waiting on a cold synth (messages loaded from the server aren't auto-played
  // the way freshly-streamed replies are).
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.role === "assistant") {
        prefetchSpeech(m.content, language);
        break;
      }
    }
  }, [messages, language]);

  const runGrade = useCallback(async () => {
    if (isGrading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGradeError(null);
    try {
      const result = await gradeConversation({
        id: conversationId,
        data: {
          targetLanguage: prefs.targetLanguage,
          nativeLanguage: prefs.nativeLanguage,
          difficulty: prefs.difficulty,
        },
      });
      setGrade(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({
        queryKey: getGetOpenaiConversationQueryKey(conversationId),
      });
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      setGradeError(status === 422 ? t("conv.gradeTooFewBody") : t("conv.gradeErrorBody"));
      if (status === 422) {
        Alert.alert(t("conv.gradeTooFewTitle"), t("conv.gradeTooFewBody"));
      } else {
        Alert.alert(t("conv.gradeErrorTitle"), t("conv.gradeErrorBody"));
      }
    }
  }, [
    isGrading,
    gradeConversation,
    conversationId,
    prefs.targetLanguage,
    prefs.nativeLanguage,
    prefs.difficulty,
    queryClient,
    t,
  ]);

  const startRecording = async () => {
    if (isRecording || isTranscribing || isStreaming) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t("conv.micDeniedTitle"), t("conv.micDeniedBody"));
        return;
      }
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
    setIsRecording(false);
    setIsTranscribing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await audioRecorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = audioRecorder.uri;
      if (!uri) throw new Error("No recording uri");

      const { base64: audioBase64, mimeType } = await readAudio(uri);
      if (!audioBase64) throw new Error("Empty recording");
      if (audioBase64.length > MAX_AUDIO_BASE64_LEN) {
        Alert.alert(t("conv.micTooLongTitle"), t("conv.micTooLongBody"));
        return;
      }

      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "";

      const response = await expoFetch(`${baseUrl}/api/openai/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getDeviceIdSync() ? { "x-device-id": getDeviceIdSync()! } : {}),
          ...(await authHeader()),
        },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          language: WHISPER_LANG[language],
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { text?: string };
      const transcript = data.text?.trim();
      if (transcript) {
        // Auto-send so speaking is a natural back-and-forth: stop talking → AI replies.
        const existing = inputTextRef.current.trim();
        setInputText("");
        setIsTranscribing(false);
        await sendText(existing ? `${existing} ${transcript}` : transcript);
        return;
      }
      Alert.alert(t("conv.transcribeEmptyTitle"), t("conv.transcribeEmptyBody"));
    } catch {
      Alert.alert(t("conv.transcribeErrorTitle"), t("conv.transcribeErrorBody"));
    } finally {
      setIsTranscribing(false);
    }
  };

  const sendText = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "";

      const response = await expoFetch(
        `${baseUrl}/api/openai/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(getDeviceIdSync() ? { "x-device-id": getDeviceIdSync()! } : {}),
            ...(await authHeader()),
          },
          body: JSON.stringify({
            content: text,
            targetLanguage: prefs.targetLanguage,
            difficulty: prefs.difficulty,
          }),
        },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          let parsed: { content?: string; done?: boolean; error?: string } | null = null;
          try {
            parsed = JSON.parse(jsonStr) as {
              content?: string;
              done?: boolean;
              error?: string;
            };
          } catch {
            // ignore parse errors
          }
          if (!parsed) continue;
          // Surface server-side stream errors instead of silently ending with no reply.
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.done) break;
          if (parsed.content) {
            fullText += parsed.content;
            setStreamingContent(fullText);
          }
        }
      }

      if (fullText) {
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: fullText,
        };
        setMessages((prev) => [...prev, aiMessage]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Read the tutor's reply aloud so it "speaks back" in the target language.
        speakWord(fullText, prefs.targetLanguage);
      }
    } catch (err) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: t("conv.errorReply"),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      sendingRef.current = false;
      setIsStreaming(false);
      setStreamingContent("");
      queryClient.invalidateQueries({
        queryKey: getGetOpenaiConversationQueryKey(conversationId),
      });
    }
  }, [conversationId, queryClient, t, prefs.targetLanguage, prefs.difficulty]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || isStreaming || isTranscribing || sendingRef.current) return;
    setInputText("");
    void sendText(text);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [inputText, isStreaming, isTranscribing, sendText, setInputText]);

  const topPadding = Platform.OS === "web" ? 16 : insets.top;
  const bottomPadding = insets.bottom;

  const displayMessages = [...messages];
  if (isStreaming && streamingContent) {
    displayMessages.push({
      id: "streaming",
      role: "assistant",
      content: streamingContent,
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPadding + 8,
            backgroundColor: colors.background,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {t("conv.title")}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {t("conv.about", { name: itemName })}
            {language ? ` • ${language}` : ""}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={displayMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                colors={colors}
                language={language}
                nativeLanguage={prefs.nativeLanguage}
              />
            )}
            contentContainerStyle={[styles.messageList, { paddingBottom: 16 }]}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            ListFooterComponent={
              isStreaming && !streamingContent ? (
                <TypingIndicator colors={colors} />
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
        )}

        {isRecording ? (
          <View style={[styles.recordingBanner, { backgroundColor: colors.primarySoft }]}>
            <View style={[styles.recordingDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.recordingText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {t("conv.listening")}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.gradeBarButton,
            { backgroundColor: colors.primarySoft, borderColor: colors.primary },
          ]}
          onPress={() => {
            setGradeError(null);
            setGradeModalOpen(true);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name={grade ? "ribbon" : "ribbon-outline"} size={18} color={colors.primary} />
          <Text style={[styles.gradeBarText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {t("conv.grade")}
          </Text>
        </TouchableOpacity>

        <View
          style={[
            styles.inputBar,
            {
              paddingBottom: bottomPadding + 12,
            },
          ]}
        >
          <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                { color: colors.foreground, fontFamily: "Inter_400Regular" },
              ]}
              placeholder={t("conv.placeholder")}
              placeholderTextColor={colors.mutedForeground}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
          </View>
          {(() => {
            const hasText = !!inputText.trim();
            const busy = isStreaming || isTranscribing;
            // The idle mic is bright orange so it stands out as the primary action.
            const MIC_ORANGE = "#FF7A1A";
            const isMicIdle = !isRecording && !busy && !hasText;
            const bg = isMicIdle
              ? MIC_ORANGE
              : busy
                ? colors.primarySoft
                : colors.primary;
            const onPress = isRecording
              ? stopAndTranscribe
              : hasText
                ? sendMessage
                : startRecording;
            return (
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: bg }]}
                onPress={onPress}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : isRecording ? (
                  <Ionicons name="stop" size={26} color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name={hasText ? "send" : "mic"}
                    size={hasText ? 24 : 30}
                    color="#FFFFFF"
                  />
                )}
              </TouchableOpacity>
            );
          })()}
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={gradeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGradeModalOpen(false)}
      >
        <Pressable style={styles.gradeBackdrop} onPress={() => setGradeModalOpen(false)}>
          <Pressable
            style={[styles.gradeCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.gradeHeaderRow}>
              <Text style={[styles.gradeHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {grade ? t("conv.gradeTitle") : t("conv.gradePromptTitle")}
              </Text>
              <TouchableOpacity onPress={() => setGradeModalOpen(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {gradeError && !isGrading ? (
              <Text style={[styles.gradeErrorText, { color: "#EF4444", fontFamily: "Inter_500Medium" }]}>
                {gradeError}
              </Text>
            ) : null}

            {isGrading ? (
              <View style={styles.gradeLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.gradeLoadingText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  {t("conv.grading")}
                </Text>
              </View>
            ) : grade ? (
              <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
                <View style={styles.scoreWrap}>
                  <Text style={[styles.scoreValue, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                    {grade.score}
                  </Text>
                  <Text style={[styles.scoreOutOf, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    {t("conv.gradeScore")}
                  </Text>
                </View>
                {grade.summary ? (
                  <Text style={[styles.gradeSummary, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                    {grade.summary}
                  </Text>
                ) : null}

                {grade.strengths.length > 0 ? (
                  <View style={styles.gradeSection}>
                    <Text style={[styles.gradeSectionLabel, { color: "#22C55E", fontFamily: "Inter_600SemiBold" }]}>
                      {t("conv.gradeStrengths")}
                    </Text>
                    {grade.strengths.map((s, i) => (
                      <View key={`st-${i}`} style={styles.gradeItemRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                        <Text style={[styles.gradeItemText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                          {s}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.gradeSection}>
                  <Text style={[styles.gradeSectionLabel, { color: "#F59E0B", fontFamily: "Inter_600SemiBold" }]}>
                    {t("conv.gradeMistakes")}
                  </Text>
                  {grade.mistakes.length > 0 ? (
                    grade.mistakes.map((m, i) => (
                      <View key={`mi-${i}`} style={styles.mistakeCard}>
                        <Text style={[styles.mistakeError, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                          {m.error}
                        </Text>
                        <View style={styles.gradeItemRow}>
                          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                          <Text style={[styles.mistakeCorrection, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                            {m.correction}
                          </Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.gradeItemText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {t("conv.gradeNoMistakes")}
                    </Text>
                  )}
                </View>

                {grade.suggestions.length > 0 ? (
                  <View style={styles.gradeSection}>
                    <Text style={[styles.gradeSectionLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                      {t("conv.gradeSuggestions")}
                    </Text>
                    {grade.suggestions.map((s, i) => (
                      <View key={`sg-${i}`} style={styles.gradeItemRow}>
                        <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                        <Text style={[styles.gradeItemText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                          {s}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.gradeButton, { backgroundColor: colors.primarySoft }]}
                  onPress={runGrade}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={18} color={colors.primary} />
                  <Text style={[styles.gradeButtonTextAlt, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                    {t("conv.gradeAgain")}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View style={{ gap: 16 }}>
                <Text style={[styles.gradeSummary, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {t("conv.gradePromptBody")}
                </Text>
                <TouchableOpacity
                  style={[styles.gradeButton, { backgroundColor: colors.primary }]}
                  onPress={runGrade}
                  activeOpacity={0.85}
                >
                  <Ionicons name="ribbon" size={18} color="#FFFFFF" />
                  <Text style={[styles.gradeButtonText, { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }]}>
                    {t("conv.gradeNow")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  gradeCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  gradeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gradeHeading: { fontSize: 18 },
  gradeLoading: { alignItems: "center", justifyContent: "center", paddingVertical: 36, gap: 12 },
  gradeLoadingText: { fontSize: 14 },
  scoreWrap: { alignItems: "center", paddingVertical: 8 },
  scoreValue: { fontSize: 52, lineHeight: 58 },
  scoreOutOf: { fontSize: 13, marginTop: -2 },
  gradeSummary: { fontSize: 14, lineHeight: 20 },
  gradeSection: { gap: 8, marginTop: 16 },
  gradeSectionLabel: { fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  gradeItemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  gradeItemText: { flex: 1, fontSize: 14, lineHeight: 20 },
  mistakeCard: { gap: 4, marginBottom: 4 },
  mistakeError: { fontSize: 14, lineHeight: 20, textDecorationLine: "line-through" },
  mistakeCorrection: { flex: 1, fontSize: 14, lineHeight: 20 },
  gradeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  gradeButtonText: { fontSize: 15 },
  gradeButtonTextAlt: { fontSize: 15 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17 },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  messageList: {
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 14,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    marginBottom: 2,
  },
  userRow: { justifyContent: "flex-end" },
  aiRow: { justifyContent: "flex-start" },
  sparkleWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
  },
  userBubble: { borderBottomRightRadius: 6 },
  aiBubble: { borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 16,
  },
  speakButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  speakLabel: { fontSize: 12 },
  translationBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  translationText: { fontStyle: "italic" },

  recordingBanner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 4,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordingText: { fontSize: 13 },
  gradeBarButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 2,
    paddingVertical: 13,
    borderRadius: 26,
    borderWidth: 1,
  },
  gradeBarText: { fontSize: 15 },
  gradeErrorText: { fontSize: 14, marginTop: 12, lineHeight: 20 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 26,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  input: {
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 8,
  },
  sendButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
