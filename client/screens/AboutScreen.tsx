import React from "react";
import { StyleSheet, View, Linking, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppIcon from "@/components/AppIcon";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const handleVisitWebsite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("https://www.capitolcommissiontexas.org");
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View
        style={[
          styles.content,
          {
            paddingTop: Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primary }]}>
            <AppIcon name="map" size={40} color="#FFFFFF" />
          </View>
          <ThemedText type="h1" style={styles.title}>
            About
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
          <ThemedText type="body" style={styles.description}>
            This app helps identify Texas legislative and congressional districts and supports private, device-only notes for outreach.
          </ThemedText>
        </View>

        <View style={styles.linkSection}>
          <Button onPress={handleVisitWebsite} style={styles.linkButton}>
            <View style={styles.buttonContent}>
              <AppIcon name="external-link" size={18} color="#FFFFFF" />
              <ThemedText type="body" style={styles.buttonText}>
                Visit Capitol Commission Texas
              </ThemedText>
            </View>
          </Button>
        </View>

        <View style={styles.footer}>
          <ThemedText type="small" style={{ color: theme.secondaryText, textAlign: "center" }}>
            All private notes and engagement data remain on your device and are never uploaded.
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
  },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  description: {
    textAlign: "center",
    lineHeight: 24,
  },
  linkSection: {
    marginBottom: Spacing.xl,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  footer: {
    marginTop: "auto",
    paddingTop: Spacing.lg,
  },
});
