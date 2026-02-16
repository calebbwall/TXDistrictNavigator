import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Switch,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PrayerStackParamList } from "@/navigation/PrayerStackNavigator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/components/Toast";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type AutoArchiveSettings = {
  enabled: boolean;
  days: number;
};

const DAY_OPTIONS = [30, 60, 90, 180];

export default function PrayerSettingsScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<PrayerStackParamList>>();

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("08:00");
  const [notificationsUnavailable, setNotificationsUnavailable] = useState(false);

  const { data: archiveSettings, isLoading } = useQuery<AutoArchiveSettings>({
    queryKey: ["/api/settings/auto-archive"],
  });

  const archiveMutation = useMutation({
    mutationFn: async (settings: AutoArchiveSettings) => {
      await apiRequest("PUT", "/api/settings/auto-archive", settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auto-archive"] });
      showToast("Settings saved");
    },
    onError: (err: Error) => {
      showToast("Failed to save: " + err.message);
    },
  });

  useEffect(() => {
    const loadReminderPrefs = async () => {
      try {
        const enabled = await AsyncStorage.getItem("prayerReminderEnabled");
        const time = await AsyncStorage.getItem("prayerReminderTime");
        if (enabled !== null) setReminderEnabled(enabled === "true");
        if (time !== null) setReminderTime(time);
      } catch {}
    };
    loadReminderPrefs();
  }, []);

  const handleArchiveToggle = useCallback(
    (enabled: boolean) => {
      if (!archiveSettings) return;
      archiveMutation.mutate({ enabled, days: archiveSettings.days });
    },
    [archiveSettings, archiveMutation]
  );

  const handleDaysChange = useCallback(
    (days: number) => {
      if (!archiveSettings) return;
      archiveMutation.mutate({ enabled: archiveSettings.enabled, days });
    },
    [archiveSettings, archiveMutation]
  );

  const handleReminderToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        try {
          const Notifications = await import("expo-notifications");
          const { status } = await Notifications.getPermissionsAsync();
          if (status !== "granted") {
            const { status: newStatus } = await Notifications.requestPermissionsAsync();
            if (newStatus !== "granted") {
              setNotificationsUnavailable(true);
              setReminderEnabled(false);
              await AsyncStorage.setItem("prayerReminderEnabled", "false");
              return;
            }
          }
          setNotificationsUnavailable(false);
        } catch {
          setNotificationsUnavailable(true);
          setReminderEnabled(false);
          await AsyncStorage.setItem("prayerReminderEnabled", "false");
          return;
        }
      }
      setReminderEnabled(enabled);
      await AsyncStorage.setItem("prayerReminderEnabled", String(enabled));
    },
    []
  );

  const handleTimeChange = useCallback(async (time: string) => {
    setReminderTime(time);
    await AsyncStorage.setItem("prayerReminderTime", time);
  }, []);

  const timeOptions = ["06:00", "07:00", "08:00", "09:00", "12:00", "18:00", "21:00"];

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator style={{ marginTop: headerHeight + Spacing.xxl }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.sm,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="archive" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Auto-Archive</ThemedText>
          </View>

          <View style={styles.optionRow}>
            <View style={{ flex: 1 }}>
              <ThemedText type="body">Auto-archive answered prayers</ThemedText>
              <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }}>
                Automatically archive prayers after they've been answered
              </ThemedText>
            </View>
            <Switch
              value={archiveSettings?.enabled ?? false}
              onValueChange={handleArchiveToggle}
            />
          </View>

          {archiveSettings?.enabled ? (
            <View style={styles.daysSection}>
              <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.sm }}>
                Archive after
              </ThemedText>
              <View style={styles.pillRow}>
                {DAY_OPTIONS.map((days) => {
                  const isSelected = archiveSettings?.days === days;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => handleDaysChange(days)}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.backgroundSecondary,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <ThemedText
                        type="caption"
                        style={{
                          color: isSelected ? "#FFFFFF" : theme.text,
                          fontWeight: isSelected ? "700" : "400",
                        }}
                      >
                        {days} days
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="bell" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Daily Reminder</ThemedText>
          </View>

          <View style={styles.optionRow}>
            <View style={{ flex: 1 }}>
              <ThemedText type="body">Daily reminder</ThemedText>
              <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }}>
                Get a daily reminder to pray
              </ThemedText>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleReminderToggle}
            />
          </View>

          {notificationsUnavailable ? (
            <View style={[styles.noticeRow, { backgroundColor: theme.warning + "20" }]}>
              <Feather name="alert-triangle" size={16} color={theme.warning} style={{ marginRight: Spacing.sm }} />
              <ThemedText type="small" style={{ color: theme.secondaryText, flex: 1 }}>
                Notifications unavailable in this build.
              </ThemedText>
            </View>
          ) : null}

          {reminderEnabled ? (
            <View style={styles.daysSection}>
              <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.sm }}>
                Reminder time
              </ThemedText>
              <View style={styles.pillRow}>
                {timeOptions.map((time) => {
                  const isSelected = reminderTime === time;
                  const hour = parseInt(time.split(":")[0], 10);
                  const label = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
                  return (
                    <Pressable
                      key={time}
                      onPress={() => handleTimeChange(time)}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.backgroundSecondary,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <ThemedText
                        type="caption"
                        style={{
                          color: isSelected ? "#FFFFFF" : theme.text,
                          fontWeight: isSelected ? "700" : "400",
                        }}
                      >
                        {label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="tag" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Categories</ThemedText>
          </View>
          <Pressable
            onPress={() => navigation.navigate("ManageCategories")}
            style={[styles.navRow, { borderColor: theme.border }]}
          >
            <ThemedText type="body">Manage Categories</ThemedText>
            <Feather name="chevron-right" size={18} color={theme.secondaryText} />
          </Pressable>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  daysSection: {
    marginTop: Spacing.md,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
