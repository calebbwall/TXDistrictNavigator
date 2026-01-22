import React from "react";
import { StyleSheet, View } from "react-native";
import AppIcon from "@/components/AppIcon";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ThemedText } from "./ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface OfflineBannerProps {
  visible: boolean;
  message?: string;
}

export function OfflineBanner({ 
  visible, 
  message = "Offline — showing saved data" 
}: OfflineBannerProps) {
  const { theme } = useTheme();
  
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.container,
        { backgroundColor: theme.warning + "E6" },
      ]}
    >
      <AppIcon name="wifi-off" size={16} color="#000" />
      <ThemedText style={styles.text}>{message}</ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
    color: "#000",
  },
});
