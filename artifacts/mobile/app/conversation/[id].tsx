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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useGetOpenaiConversation } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOpenaiConversationQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { fetch as expoFetch } from "expo/fetch";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function MessageBubble({ message, colors }: { message: Message; colors: ReturnType<typeof useColors> }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.aiRow]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Ionicons name="language-outline" size={14} color="#FFFFFF" />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.userBubble }]
            : [styles.aiBubble, { backgroundColor: colors.aiBubble, borderColor: colors.border }],
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            {
              color: isUser ? colors.userBubbleText : colors.aiBubbleText,
              fontFamily: "Inter_400Regular",
            },
          ]}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function TypingIndicator({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.bubbleRow, styles.aiRow]}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Ionicons name="language-outline" size={14} color="#FFFFFF" />
      </View>
      <View style={[styles.bubble, styles.aiBubble, { backgroundColor: colors.aiBubble, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    </View>
  );
}

export default function ConversationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = parseInt(id ?? "0", 10);
  const queryClient = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList<Message>>(null);

  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const { data: conversation, isLoading } = useGetOpenaiConversation(conversationId, {
    query: {
      queryKey: getGetOpenaiConversationQueryKey(conversationId),
      enabled: !!conversationId,
    },
  });

  // Load messages from server into local state
  useEffect(() => {
    if (conversation?.messages) {
      const serverMessages = conversation.messages.map((m) => ({
        id: m.id.toString(),
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setMessages(serverMessages);
    }
  }, [conversation?.messages?.length]);

  // Parse title for display
  const parts = (conversation?.title ?? "").split(" • ");
  const itemName = parts[0] ?? "Conversation";
  const language = parts[1] ?? "";

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    setInputText("");
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
      const baseUrl =
        process.env.EXPO_PUBLIC_DOMAIN
          ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
          : "";

      const response = await expoFetch(
        `${baseUrl}/api/openai/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

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
          try {
            const parsed = JSON.parse(jsonStr) as {
              content?: string;
              done?: boolean;
              error?: string;
            };
            if (parsed.done) break;
            if (parsed.content) {
              fullText += parsed.content;
              setStreamingContent(fullText);
            }
          } catch {
            // ignore parse errors
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
      }
    } catch (err) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      queryClient.invalidateQueries({
        queryKey: getGetOpenaiConversationQueryKey(conversationId),
      });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [inputText, isStreaming, conversationId, queryClient]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
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
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPadding + 12,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {itemName}
          </Text>
          {language ? (
            <View style={[styles.langChip, { backgroundColor: colors.primary }]}>
              <Text style={[styles.langChipText, { fontFamily: "Inter_500Medium" }]}>
                {language}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={displayMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
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

        {/* Input Bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: bottomPadding + 8,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                backgroundColor: colors.secondary,
                color: colors.foreground,
                fontFamily: "Inter_400Regular",
                borderColor: colors.border,
              },
            ]}
            placeholder="Type your message..."
            placeholderTextColor={colors.mutedForeground}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: isStreaming || !inputText.trim() ? colors.secondary : colors.primary },
            ]}
            onPress={sendMessage}
            disabled={isStreaming || !inputText.trim()}
            activeOpacity={0.8}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={!inputText.trim() ? colors.mutedForeground : "#FFFFFF"}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
  },
  langChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  langChipText: {
    color: "#FFFFFF",
    fontSize: 12,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 4,
  },
  userRow: {
    justifyContent: "flex-end",
  },
  aiRow: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    borderWidth: 1,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
