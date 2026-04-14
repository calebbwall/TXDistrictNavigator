import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

import { Ionicons, Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  loading?: boolean;
}

const SUGGESTIONS = [
  "Which Republicans are on Business & Commerce?",
  "What are the highest profile hearings coming up?",
  "Tell me about the upcoming State Affairs hearing",
  "Who chairs the Education committee?",
  "Describe HB 2127",
  "Which Democrats are in the TX Senate?",
];

export default function AskAIScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);

  const sendQuestion = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: question.trim(),
    };
    const loadingMsg: Message = {
      id: `loading-${Date.now()}`,
      role: "assistant",
      text: "",
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInputText("");
    setIsLoading(true);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await fetch(`${getApiUrl()}/api/ai/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      const data = await res.json();
      const answerText = res.ok
        ? (data.answer ?? "No answer returned.")
        : (data.error ?? "Something went wrong. Please try again.");

      setMessages((prev) =>
        prev.map((m) =>
          m.loading ? { ...m, text: answerText, loading: false } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.loading
            ? { ...m, text: "Couldn't reach the server. Please check your connection.", loading: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [isLoading]);

  const handleSend = useCallback(() => {
    sendQuestion(inputText);
  }, [inputText, sendQuestion]);

  const handleSuggestion = useCallback((text: string) => {
    sendQuestion(text);
  }, [sendQuestion]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === "user";
      return (
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.aiBubble,
            isUser
              ? { backgroundColor: theme.primary }
              : { backgroundColor: theme.cardBackground, borderColor: theme.border, borderWidth: 1 },
          ]}
        >
          {item.loading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <ThemedText
              type="body"
              style={[
                styles.messageText,
                isUser ? { color: "#FFFFFF" } : { color: theme.text },
              ]}
            >
              {item.text}
            </ThemedText>
          )}
        </View>
      );
    },
    [theme]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const EmptyState = (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconContainer, { backgroundColor: theme.primary + "18" }]}>
        <Ionicons name="sparkles" size={32} color={theme.primary} />
      </View>
      <ThemedText type="h3" style={[styles.emptyTitle, { color: theme.text }]}>
        Ask anything
      </ThemedText>
      <ThemedText type="body" style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
        Ask dynamic questions about Texas legislators and legislation
      </ThemedText>
      <View style={styles.suggestionsGrid}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            style={({ pressed }) => [
              styles.suggestionChip,
              {
                backgroundColor: theme.inputBackground,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => handleSuggestion(s)}
          >
            <ThemedText type="caption" style={{ color: theme.text }}>
              {s}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: Spacing.md,
            flexGrow: messages.length === 0 ? 1 : undefined,
          },
        ]}
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
      />

      {/* Input bar — KAV wraps only here so it lifts above the keyboard */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={headerHeight}
      >
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: theme.backgroundRoot,
              borderTopColor: theme.border,
              paddingBottom: insets.bottom + Spacing.sm,
            },
          ]}
        >
          <View
            style={[
              styles.inputContainer,
              { backgroundColor: theme.inputBackground, borderColor: theme.border },
            ]}
          >
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Ask about legislators or legislation..."
              placeholderTextColor={theme.secondaryText}
              value={inputText}
              onChangeText={setInputText}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit
            />
            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor:
                    inputText.trim() && !isLoading ? theme.primary : theme.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="send" size={18} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  messageBubble: {
    maxWidth: "85%",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    minHeight: 36,
    justifyContent: "center",
  },
  userBubble: {
    alignSelf: "flex-end",
  },
  aiBubble: {
    alignSelf: "flex-start",
  },
  messageText: {
    lineHeight: 22,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: Spacing.xs,
    fontWeight: "700",
  },
  emptySubtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  suggestionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  suggestionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  inputBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 100,
    paddingVertical: Spacing.xs,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    marginBottom: 2,
  },
});
