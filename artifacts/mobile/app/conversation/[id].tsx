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
import { useGetOpenaiConversation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOpenaiConversationQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { usePreferences, type Language } from "@/hooks/usePreferences";
import { getDeviceIdSync } from "@/lib/device";
import { speakWord, stopSpeaking } from "@/lib/speech";
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
}: {
  message: Message;
  colors: ReturnType<typeof useColors>;
  language: Language;
}) {
  const t = useT();
  const isUser = message.role === "user";

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
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    return () => {
      if (audioRecorder.isRecording) {
        audioRecorder.stop().catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, [audioRecorder]);

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

  const parts = (conversation?.title ?? "").split(" • ");
  const itemName = parts[0] ?? t("conv.fallbackName");
  const language = prefs.targetLanguage;

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
          },
          body: JSON.stringify({ content: text, targetLanguage: prefs.targetLanguage }),
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
  }, [conversationId, queryClient, t, prefs.targetLanguage]);

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
        <TouchableOpacity style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.foreground} />
        </TouchableOpacity>
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
              <MessageBubble message={item} colors={colors} language={language} />
            )}
            contentContainerStyle={[styles.messageList, { paddingBottom: 16 }]}
            keyboardDismissMode="interactive"
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
            const bg = isRecording
              ? colors.primary
              : busy || !hasText
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
                  <Ionicons name="stop" size={20} color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name={hasText ? "send" : "mic"}
                    size={20}
                    color={hasText ? "#FFFFFF" : colors.primary}
                  />
                )}
              </TouchableOpacity>
            );
          })()}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  speakButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  speakLabel: { fontSize: 12 },

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
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
