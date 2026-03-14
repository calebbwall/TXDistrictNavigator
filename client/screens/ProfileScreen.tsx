import React, { useState, useCallback } from "react";
import { StyleSheet, View, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { getOverlayPreferences, saveOverlayPreferences, type OverlayPreferences } from "@/lib/storage";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

interface SettingRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  isToggle,
  toggleValue,
  onToggle,
}: SettingRowProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={isToggle || !onPress}
      style={({ pressed }) => [
        styles.settingRow,
        { backgroundColor: theme.cardBackground, opacity: pressed && onPress ? 0.8 : 1 },
      ]}
    >
      <View style={[styles.settingIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.settingContent}>
        <ThemedText type="body">{label}</ThemedText>
        {value ? (
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>
            {value}
          </ThemedText>
        ) : null}
      </View>
      {isToggle ? (
        <Pressable
          onPress={() => onToggle?.(!toggleValue)}
          style={[
            styles.toggle,
            {
              backgroundColor: toggleValue ? theme.primary : theme.backgroundSecondary,
            },
          ]}
        >
          <View
            style={[
              styles.toggleKnob,
              {
                backgroundColor: "#FFFFFF",
                transform: [{ translateX: toggleValue ? 18 : 2 }],
              },
            ]}
          />
        </Pressable>
      ) : onPress ? (
        <Feather name="chevron-right" size={20} color={theme.secondaryText} />
      ) : null}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const [overlayPrefs, setOverlayPrefs] = useState<OverlayPreferences>({
    senate: false,
    house: false,
    congress: false,
  });
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const prefs = await getOverlayPreferences();
    setOverlayPrefs(prefs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleOverlayToggle = useCallback(
    async (type: keyof OverlayPreferences, value: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newPrefs = { ...overlayPrefs, [type]: value };
      setOverlayPrefs(newPrefs);
      await saveOverlayPreferences(newPrefs);
    },
    [overlayPrefs]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.profileHeader}>
          <View style={[styles.avatarPlaceholder, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="user" size={40} color={theme.secondaryText} />
          </View>
          <ThemedText type="h2" style={styles.welcomeText}>
            Texas Districts
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.secondaryText }}>
            Your guide to Texas representatives
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Tools
          </ThemedText>
          <View style={styles.settingsGroup}>
            <SettingRow icon="bookmark" label="Saved Officials" onPress={() => navigation.navigate("SavedOfficials")} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow icon="flag" label="Follow-up Dashboard" onPress={() => navigation.navigate("FollowUpDashboard")} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow icon="navigation" label="Mileage" onPress={() => navigation.navigate("MileageTracker")} />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Default Overlays
          </ThemedText>
          <ThemedText
            type="caption"
            style={{ color: theme.secondaryText, marginBottom: Spacing.md }}
          >
            Choose which district overlays to show by default on the map
          </ThemedText>
          <View style={styles.settingsGroup}>
            <SettingRow
              icon="layers"
              label="TX Senate"
              isToggle
              toggleValue={overlayPrefs.senate}
              onToggle={(value) => handleOverlayToggle("senate", value)}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow
              icon="layers"
              label="TX House"
              isToggle
              toggleValue={overlayPrefs.house}
              onToggle={(value) => handleOverlayToggle("house", value)}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow
              icon="layers"
              label="US Congress"
              isToggle
              toggleValue={overlayPrefs.congress}
              onToggle={(value) => handleOverlayToggle("congress", value)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            About
          </ThemedText>
          <View style={styles.settingsGroup}>
            <SettingRow icon="info" label="App Version" value="1.0.2" />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <SettingRow icon="book-open" label="About This App" onPress={() => navigation.navigate("About")} />
          </View>
        </View>

        <ThemedText
          type="caption"
          style={{
            color: theme.secondaryText,
            textAlign: "center",
            marginTop: Spacing.lg,
          }}
        >
          Built for the State Minister of Texas
        </ThemedText>
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
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  welcomeText: {
    marginBottom: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
  savedItem: {
    marginBottom: Spacing.sm,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyImage: {
    width: 120,
    height: 120,
    marginBottom: Spacing.md,
    opacity: 0.7,
  },
  settingsGroup: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  settingContent: {
    flex: 1,
  },
  divider: {
    height: 1,
    marginLeft: 60,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});
