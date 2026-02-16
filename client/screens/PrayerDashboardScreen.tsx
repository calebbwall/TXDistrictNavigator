import React, { useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PrayerStackParamList } from "@/navigation/PrayerStackNavigator";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type Prayer = {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "ANSWERED" | "ARCHIVED";
  createdAt: string;
  answeredAt: string | null;
  archivedAt: string | null;
  answerNote: string | null;
  categoryId: string | null;
  officialIds: string[];
  pinnedDaily: boolean;
  priority: number;
  lastShownAt: string | null;
  lastPrayedAt: string | null;
};

type DailyPicksResponse = {
  dateKey: string;
  prayers: Prayer[];
  generatedAt: string;
};

type StreakResponse = {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDateKey: string | null;
};

type PrayerCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export default function PrayerDashboardScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<PrayerStackParamList>>();
  const queryClient = useQueryClient();

  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 0; }

  const { data: dailyPicks, isLoading: dailyLoading, refetch: refetchDaily } = useQuery<DailyPicksResponse>({
    queryKey: ["/api/daily-prayer-picks"],
  });

  const { data: streak, refetch: refetchStreak } = useQuery<StreakResponse>({
    queryKey: ["/api/prayer-streak"],
  });

  const { data: needsAttention = [], refetch: refetchAttention } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers/needs-attention"],
  });

  const { data: recentlyAnswered = [], refetch: refetchAnswered } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers/recently-answered"],
  });

  const { data: categories = [], refetch: refetchCategories } = useQuery<PrayerCategory[]>({
    queryKey: ["/api/prayer-categories"],
  });

  const { data: openPrayers = [] } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers", "?status=OPEN"],
  });

  useFocusEffect(
    useCallback(() => {
      refetchDaily();
      refetchStreak();
      refetchAttention();
      refetchAnswered();
      refetchCategories();
    }, [refetchDaily, refetchStreak, refetchAttention, refetchAnswered, refetchCategories])
  );

  const completeTodayMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/prayer-streak/complete-today");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-streak"] });
    },
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getFirstLine = (body: string) => {
    const line = body.split("\n")[0];
    return line.length > 80 ? line.substring(0, 80) + "..." : line;
  };

  const getCategoryCount = (categoryId: string) => {
    return openPrayers.filter((p) => p.categoryId === categoryId).length;
  };

  const uncategorizedCount = openPrayers.filter((p) => !p.categoryId).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.sm,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Feather name="sun" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
              <ThemedText type="h3">Today's 3</ThemedText>
            </View>
            {streak ? (
              <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                Day {streak.currentStreak}
              </ThemedText>
            ) : null}
          </View>

          {dailyLoading ? (
            <ActivityIndicator style={{ paddingVertical: Spacing.lg }} />
          ) : dailyPicks && dailyPicks.prayers.length > 0 ? (
            <View>
              {dailyPicks.prayers.map((prayer, index) => (
                <Card
                  key={prayer.id}
                  elevation={1}
                  style={styles.dailyCard}
                  onPress={() =>
                    navigation.navigate("FocusedMode", {
                      prayerIds: dailyPicks.prayers.map((p) => p.id),
                      startIndex: index,
                    })
                  }
                >
                  <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
                    {prayer.title}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 4 }} numberOfLines={1}>
                    {getFirstLine(prayer.body)}
                  </ThemedText>
                </Card>
              ))}
              <Button
                onPress={() => completeTodayMutation.mutate()}
                disabled={completeTodayMutation.isPending}
                style={{ marginTop: Spacing.sm }}
              >
                Mark Today Complete
              </Button>
            </View>
          ) : (
            <ThemedText type="small" style={{ color: theme.secondaryText, paddingVertical: Spacing.md }}>
              No daily prayers available. Add some prayers first.
            </ThemedText>
          )}
        </View>

        {needsAttention.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Feather name="alert-circle" size={18} color={theme.warning} style={{ marginRight: Spacing.sm }} />
                <ThemedText type="h3">Needs Attention</ThemedText>
              </View>
            </View>
            {needsAttention.slice(0, 5).map((prayer) => (
              <View key={prayer.id} style={[styles.attentionRow, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <ThemedText type="body" numberOfLines={1}>{prayer.title}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }} numberOfLines={1}>
                    {getFirstLine(prayer.body)}
                  </ThemedText>
                </View>
                <Pressable
                  style={[styles.prayButton, { backgroundColor: theme.primary }]}
                  onPress={() =>
                    navigation.navigate("FocusedMode", {
                      prayerIds: [prayer.id],
                      startIndex: 0,
                    })
                  }
                >
                  <ThemedText type="small" style={{ color: theme.buttonText, fontWeight: "600" }}>
                    Pray
                  </ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {recentlyAnswered.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Feather name="check-circle" size={18} color={theme.success} style={{ marginRight: Spacing.sm }} />
                <ThemedText type="h3">Recently Answered</ThemedText>
              </View>
            </View>
            {recentlyAnswered.slice(0, 5).map((prayer) => (
              <View key={prayer.id} style={[styles.answeredRow, { borderBottomColor: theme.border }]}>
                <ThemedText type="body" numberOfLines={1} style={{ flex: 1 }}>
                  {prayer.title}
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.success }}>
                  {formatDate(prayer.answeredAt)}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Feather name="folder" size={18} color={theme.secondaryText} style={{ marginRight: Spacing.sm }} />
              <ThemedText type="h3">Categories</ThemedText>
            </View>
          </View>
          {categories.length > 0 ? (
            <View>
              {categories.map((cat) => {
                const count = getCategoryCount(cat.id);
                return (
                  <Pressable
                    key={cat.id}
                    style={[styles.categoryRow, { borderBottomColor: theme.border }]}
                    onPress={() => navigation.navigate("AllPrayers", { categoryId: cat.id })}
                  >
                    <ThemedText type="body">{cat.name}</ThemedText>
                    <View style={styles.categoryRight}>
                      <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                        {count} open
                      </ThemedText>
                      <Feather name="chevron-right" size={16} color={theme.secondaryText} />
                    </View>
                  </Pressable>
                );
              })}
              {uncategorizedCount > 0 ? (
                <Pressable
                  style={[styles.categoryRow, { borderBottomColor: theme.border }]}
                  onPress={() => navigation.navigate("AllPrayers", {})}
                >
                  <ThemedText type="body" style={{ color: theme.secondaryText }}>Uncategorized</ThemedText>
                  <View style={styles.categoryRight}>
                    <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                      {uncategorizedCount} open
                    </ThemedText>
                    <Feather name="chevron-right" size={16} color={theme.secondaryText} />
                  </View>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <ThemedText type="small" style={{ color: theme.secondaryText, paddingVertical: Spacing.md }}>
              No categories yet.
            </ThemedText>
          )}
        </View>

        <Button
          onPress={() => navigation.navigate("AllPrayers", {})}
          style={{ marginTop: Spacing.md, marginBottom: Spacing.lg }}
        >
          View All Prayers
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dailyCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  prayButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  answeredRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
});
