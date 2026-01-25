import React from "react";
import { StyleSheet, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

interface ChamberRowProps {
  title: string;
  subtitle: string;
  chamber: "TX_HOUSE" | "TX_SENATE";
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

function ChamberRow({ title, subtitle, chamber, icon, color }: ChamberRowProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("CommitteeList", { chamber });
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.chamberRow,
        { backgroundColor: theme.cardBackground, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={[styles.chamberIcon, { backgroundColor: color + "20" }]}>
        <Feather name={icon} size={24} color={color} />
      </View>
      <View style={styles.chamberContent}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>{title}</ThemedText>
        <ThemedText type="caption" style={{ color: theme.secondaryText }}>
          {subtitle}
        </ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.secondaryText} />
    </Pressable>
  );
}

export default function CommitteesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <ThemedText type="body" style={[styles.description, { color: theme.secondaryText }]}>
          View committee assignments for Texas legislators
        </ThemedText>

        <View style={styles.chambersContainer}>
          <ChamberRow
            title="Texas House Committees"
            subtitle="150 Representatives"
            chamber="TX_HOUSE"
            icon="home"
            color="#E94B3C"
          />
          <View style={styles.spacer} />
          <ChamberRow
            title="Texas Senate Committees"
            subtitle="31 Senators"
            chamber="TX_SENATE"
            icon="users"
            color="#4A90E2"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  description: {
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  chambersContainer: {
    gap: Spacing.md,
  },
  chamberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  chamberIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  chamberContent: {
    flex: 1,
  },
  spacer: {
    height: Spacing.sm,
  },
});
