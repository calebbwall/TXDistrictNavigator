import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutUp } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  type?: "error" | "warning";
}

export function ErrorBanner({ message, onRetry, type = "error" }: ErrorBannerProps) {
  const { theme } = useTheme();
  const backgroundColor = type === "error" ? "#DC3545" : "#FFC107";
  const textColor = type === "error" ? "#FFFFFF" : "#212529";
  const iconColor = textColor;

  return (
    <Animated.View
      entering={SlideInUp.duration(200)}
      exiting={SlideOutUp.duration(150)}
      style={[styles.container, { backgroundColor }]}
    >
      <View style={styles.content}>
        <Feather
          name={type === "error" ? "alert-circle" : "alert-triangle"}
          size={16}
          color={iconColor}
        />
        <ThemedText
          type="small"
          style={[styles.message, { color: textColor }]}
          numberOfLines={2}
        >
          {message}
        </ThemedText>
      </View>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText type="small" style={[styles.retryText, { color: textColor }]}>
            Retry
          </ThemedText>
          <Feather name="refresh-cw" size={14} color={iconColor} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: Spacing.sm,
  },
  message: {
    flex: 1,
    fontWeight: "500",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  retryText: {
    fontWeight: "600",
  },
});
