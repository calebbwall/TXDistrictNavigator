import React, { useCallback, useState } from "react";
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
import { invalidatePrayerQueries } from "@/lib/prayer-utils";

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
  customPeopleNames: string[];
  pinnedDaily: boolean;
  priority: number;
  lastShownAt: string | null;
  lastPrayedAt: string | null;
  eventDate: string | null;
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

type GroupItem = {
  id: string;
  name: string;
  count: number;
};

type GroupedResponse = {
  groupBy: string;
  groups: GroupItem[];
};

type OfficialItem = {
  id: string;
  fullName: string;
};

const STATUS_TABS = [
  { key: "OPEN", label: "Open" },
  { key: "ANSWERED", label: "Answered" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "ALL", label: "All" },
] as const;

const BROWSE_MODES = [
  { key: "officials", label: "Officials" },
  { key: "categories", label: "Categories" },
] as const;

function getTodayDateKey(): string {
  const localeStr = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  const parts = localeStr.split("/");
  const month = parts[0].padStart(2, "0");
  const day = parts[1].padStart(2, "0");
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

export default function PrayerDashboardScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<PrayerStackParamList>>();
  const queryClient = useQueryClient();

  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 0; }

  const [statusTab, setStatusTab] = useState<string>("OPEN");
  const [browseMode, setBrowseMode] = useState<string>("officials");
  const [showCompletedPicks, setShowCompletedPicks] = useState(false);

  const { data: dailyPicks, isLoading: dailyLoading, refetch: refetchDaily } = useQuery<DailyPicksResponse>({
    queryKey: ["/api/daily-prayer-picks"],
  });

  const { data: streak, refetch: refetchStreak } = useQuery<StreakResponse>({
    queryKey: ["/api/prayer-streak"],
  });

  const groupedUrl = `/api/prayers/grouped?status=${statusTab}&groupBy=${browseMode}`;
  const { data: groupedData, isLoading: groupedLoading, refetch: refetchGrouped } = useQuery<GroupedResponse>({
    queryKey: [groupedUrl],
  });

  const { data: upcomingPrayers = [], refetch: refetchUpcoming } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers/upcoming"],
  });

  const { data: officialsData } = useQuery<{ officials: OfficialItem[] }>({
    queryKey: ["/api/officials"],
  });
  const officialsMap = new Map((officialsData?.officials ?? []).map((o) => [o.id, o.fullName]));

  useFocusEffect(
    useCallback(() => {
      refetchDaily();
      refetchStreak();
      refetchGrouped();
      refetchUpcoming();
    }, [refetchDaily, refetchStreak, refetchGrouped, refetchUpcoming])
  );

  const completeTodayMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/prayer-streak/complete-today");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-streak"] });
    },
  });

  const markPrayedMutation = useMutation({
    mutationFn: async (prayerId: string) => {
      await apiRequest("PATCH", `/api/prayers/${prayerId}`, {
        lastPrayedAt: new Date().toISOString(),
      });
    },
    onSuccess: (_data, prayerId) => {
      invalidatePrayerQueries(queryClient);
      // Check if all today's picks are now prayed — if so, auto-complete streak
      if (dailyPicks) {
        const updatedPicks = dailyPicks.prayers.map((p) =>
          p.id === prayerId ? { ...p, lastPrayedAt: new Date().toISOString() } : p
        );
        const allPrayed = updatedPicks.every((p) => isPrayedToday(p));
        if (allPrayed) {
          completeTodayMutation.mutate();
        }
      }
    },
  });

  const getFirstLine = (body: string) => {
    const line = body.split("\n")[0];
    return line.length > 80 ? line.substring(0, 80) + "..." : line;
  };

  const todayKey = getTodayDateKey();

  const isPrayedToday = (prayer: Prayer): boolean => {
    if (!prayer.lastPrayedAt) return false;
    const prayedDate = new Date(prayer.lastPrayedAt);
    const prayedKey = prayedDate.toLocaleDateString("en-US", { timeZone: "America/Chicago" })
      .split("/").map((p, i) => i === 2 ? p : p.padStart(2, "0"))
      .reduce((_, __, i, arr) => `${arr[2]}-${arr[0]}-${arr[1]}`);
    return prayedKey === todayKey;
  };

  const getPeopleLabel = (prayer: Prayer): string | null => {
    const officialNames = (prayer.officialIds ?? [])
      .map((id) => officialsMap.get(id))
      .filter(Boolean) as string[];
    const allNames = [...officialNames, ...(prayer.customPeopleNames ?? [])];
    if (allNames.length === 0) return null;
    if (allNames.length <= 2) return allNames.join(", ");
    return `${allNames[0]} +${allNames.length - 1} more`;
  };

  const completedToday = streak ? streak.lastCompletedDateKey === todayKey : false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const nextUpcoming = upcomingPrayers.find((p) => {
    if (!p.eventDate) return false;
    const d = new Date(p.eventDate);
    d.setHours(0, 0, 0, 0);
    return d >= now;
  });

  const formatEventDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDay = new Date(d);
    eventDay.setHours(0, 0, 0, 0);
    const diffMs = eventDay.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const formatted = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    if (diffDays === 0) return `Today, ${formatted}`;
    if (diffDays === 1) return `Tomorrow, ${formatted}`;
    return `In ${diffDays} days, ${formatted}`;
  };

  const groups = groupedData?.groups ?? [];

  const handleGroupPress = (group: GroupItem) => {
    if (browseMode === "officials") {
      if (group.id === "__none__") {
        navigation.navigate("PrayerList", { status: statusTab });
      } else {
        const officialName = officialsMap.get(group.id) || group.name;
        navigation.navigate("PrayerList", {
          status: statusTab,
          officialId: group.id,
          officialName,
        });
      }
    } else {
      if (group.id === "__uncategorized__") {
        navigation.navigate("PrayerList", {
          status: statusTab,
          categoryId: "uncategorized",
          categoryName: "Uncategorized",
        });
      } else {
        navigation.navigate("PrayerList", {
          status: statusTab,
          categoryId: group.id,
          categoryName: group.name,
        });
      }
    }
  };

  const resolveOfficialName = (group: GroupItem) => {
    if (group.id === "__none__") return "No Official";
    return officialsMap.get(group.id) || group.id.substring(0, 8) + "...";
  };

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
              streak.currentStreak > 0 ? (
                <View style={styles.streakBadge}>
                  <Feather name="zap" size={16} color={theme.warning} style={{ marginRight: 4 }} />
                  <ThemedText type="h3" style={{ color: theme.warning }}>
                    Day {streak.currentStreak}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                  Day {streak.currentStreak}
                </ThemedText>
              )
            ) : null}
          </View>

          {dailyLoading ? (
            <ActivityIndicator style={{ paddingVertical: Spacing.lg }} />
          ) : dailyPicks && dailyPicks.prayers.length > 0 ? (
            <View>
              {dailyPicks.prayers
                .filter((prayer) => !isPrayedToday(prayer))
                .map((prayer, _idx, activePrayers) => {
                  const originalIndex = dailyPicks.prayers.indexOf(prayer);
                  const peopleLabel = getPeopleLabel(prayer);
                  return (
                    <Card
                      key={prayer.id}
                      elevation={1}
                      style={styles.dailyCard}
                      onPress={() =>
                        navigation.navigate("FocusedMode", {
                          prayerIds: activePrayers.map((p) => p.id),
                          startIndex: activePrayers.indexOf(prayer),
                        })
                      }
                    >
                      <View style={styles.dailyCardContent}>
                        <View style={[styles.numberBadge, { backgroundColor: theme.primary + "18" }]}>
                          <ThemedText type="caption" style={{ color: theme.primary, fontWeight: "700" }}>
                            {originalIndex + 1}
                          </ThemedText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText type="h3" numberOfLines={1}>
                            {prayer.title}
                          </ThemedText>
                          {peopleLabel ? (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                              <Feather name="user" size={11} color={theme.primary} style={{ marginRight: 3 }} />
                              <ThemedText type="small" style={{ color: theme.primary }} numberOfLines={1}>
                                {peopleLabel}
                              </ThemedText>
                            </View>
                          ) : null}
                          <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }} numberOfLines={1}>
                            {getFirstLine(prayer.body)}
                          </ThemedText>
                        </View>
                        <Pressable
                          onPress={(e) => { e.stopPropagation?.(); markPrayedMutation.mutate(prayer.id); }}
                          style={[styles.markPrayedBtn, { borderColor: theme.success + "80" }]}
                          hitSlop={4}
                          disabled={markPrayedMutation.isPending}
                        >
                          <Feather name="check" size={16} color={theme.success} />
                        </Pressable>
                      </View>
                    </Card>
                  );
                })}

              {(() => {
                const completedPrayers = dailyPicks.prayers.filter((p) => isPrayedToday(p));
                const allDone = completedPrayers.length === dailyPicks.prayers.length;
                if (allDone) {
                  return (
                    <View style={styles.completedRow}>
                      <Feather name="check-circle" size={18} color={theme.success} style={{ marginRight: Spacing.sm }} />
                      <ThemedText type="body" style={{ color: theme.success, fontWeight: "600" }}>
                        Completed today
                      </ThemedText>
                    </View>
                  );
                }
                if (completedPrayers.length > 0) {
                  return (
                    <Pressable
                      onPress={() => setShowCompletedPicks((v) => !v)}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: Spacing.sm }}
                    >
                      <Feather
                        name={showCompletedPicks ? "eye-off" : "eye"}
                        size={14}
                        color={theme.secondaryText}
                        style={{ marginRight: Spacing.xs }}
                      />
                      <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                        {showCompletedPicks ? "Hide completed" : `Show ${completedPrayers.length} completed`}
                      </ThemedText>
                    </Pressable>
                  );
                }
                return null;
              })()}

              {showCompletedPicks
                ? dailyPicks.prayers
                    .filter((p) => isPrayedToday(p))
                    .map((prayer, _idx) => {
                      const originalIndex = dailyPicks.prayers.indexOf(prayer);
                      const peopleLabel = getPeopleLabel(prayer);
                      return (
                        <Card
                          key={prayer.id}
                          elevation={0}
                          style={[styles.dailyCard, { opacity: 0.55 }]}
                          onPress={() =>
                            navigation.navigate("PrayerDetail", { prayerId: prayer.id })
                          }
                        >
                          <View style={styles.dailyCardContent}>
                            <View style={[styles.numberBadge, { backgroundColor: theme.success + "18" }]}>
                              <Feather name="check" size={14} color={theme.success} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <ThemedText type="h3" numberOfLines={1} style={{ color: theme.secondaryText }}>
                                {prayer.title}
                              </ThemedText>
                              {peopleLabel ? (
                                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                                  <Feather name="user" size={11} color={theme.secondaryText} style={{ marginRight: 3 }} />
                                  <ThemedText type="small" style={{ color: theme.secondaryText }} numberOfLines={1}>
                                    {peopleLabel}
                                  </ThemedText>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </Card>
                      );
                    })
                : null}
            </View>
          ) : (
            <Card elevation={0} style={styles.emptyCard}>
              <View style={styles.emptyContent}>
                <Feather name="sunrise" size={36} color={theme.secondaryText} style={{ marginBottom: Spacing.md }} />
                <ThemedText type="body" style={{ color: theme.secondaryText, textAlign: "center", marginBottom: Spacing.md }}>
                  No active prayers yet. Add one, or reopen an answered prayer.
                </ThemedText>
                <Button onPress={() => navigation.navigate("AddPrayer", {})}>
                  Add Prayer
                </Button>
              </View>
            </Card>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Feather name="calendar" size={18} color={theme.warning} style={{ marginRight: Spacing.sm }} />
              <ThemedText type="h3">Upcoming Events</ThemedText>
            </View>
            <Pressable
              onPress={() => navigation.navigate("UpcomingEvents")}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <ThemedText type="caption" style={{ color: theme.primary, fontWeight: "600", marginRight: 4 }}>
                View All
              </ThemedText>
              <Feather name="arrow-right" size={14} color={theme.primary} />
            </Pressable>
          </View>

          {nextUpcoming ? (
            <Card
              elevation={1}
              style={styles.upcomingCard}
              onPress={() => navigation.navigate("PrayerDetail", { prayerId: nextUpcoming.id })}
            >
              <View style={styles.upcomingHeader}>
                <View style={[styles.upcomingIcon, { backgroundColor: theme.warning + "18" }]}>
                  <Feather name="calendar" size={16} color={theme.warning} />
                </View>
                <ThemedText type="body" style={{ fontWeight: "600", flex: 1 }} numberOfLines={1}>
                  {nextUpcoming.title}
                </ThemedText>
                <Feather name="chevron-right" size={16} color={theme.secondaryText} />
              </View>
              <ThemedText type="caption" style={{ color: theme.secondaryText, marginTop: 4, marginLeft: 40 }}>
                {formatEventDate(nextUpcoming.eventDate!)}
              </ThemedText>
            </Card>
          ) : (
            <View style={{ paddingVertical: Spacing.md, alignItems: "center" }}>
              <ThemedText type="caption" style={{ color: theme.secondaryText, textAlign: "center" }}>
                No upcoming events. Set event dates on your prayers to track them here.
              </ThemedText>
            </View>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.section}>
          <View style={styles.segmentedRow}>
            {STATUS_TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[
                  styles.segmentItem,
                  {
                    backgroundColor: statusTab === tab.key ? theme.primary : "transparent",
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setStatusTab(tab.key)}
              >
                <ThemedText
                  type="caption"
                  style={{
                    color: statusTab === tab.key ? theme.buttonText : theme.text,
                    fontWeight: statusTab === tab.key ? "700" : "400",
                  }}
                >
                  {tab.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <View style={[styles.segmentedRow, { marginTop: Spacing.sm }]}>
            {BROWSE_MODES.map((mode) => (
              <Pressable
                key={mode.key}
                style={[
                  styles.browseSegmentItem,
                  {
                    backgroundColor: browseMode === mode.key ? theme.backgroundSecondary : "transparent",
                    borderColor: browseMode === mode.key ? theme.primary : theme.border,
                    borderWidth: browseMode === mode.key ? 1.5 : 1,
                  },
                ]}
                onPress={() => setBrowseMode(mode.key)}
              >
                <Feather
                  name={mode.key === "officials" ? "users" : "folder"}
                  size={14}
                  color={browseMode === mode.key ? theme.primary : theme.secondaryText}
                  style={{ marginRight: Spacing.xs }}
                />
                <ThemedText
                  type="caption"
                  style={{
                    color: browseMode === mode.key ? theme.primary : theme.text,
                    fontWeight: browseMode === mode.key ? "700" : "400",
                  }}
                >
                  {mode.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          {groupedLoading ? (
            <ActivityIndicator style={{ paddingVertical: Spacing.lg }} />
          ) : groups.length === 0 ? (
            <View style={{ paddingVertical: Spacing.xl, alignItems: "center" }}>
              <Feather
                name={browseMode === "officials" ? "users" : "folder"}
                size={32}
                color={theme.secondaryText}
                style={{ marginBottom: Spacing.sm }}
              />
              <ThemedText type="body" style={{ color: theme.secondaryText, textAlign: "center" }}>
                No {browseMode === "officials" ? "officials" : "categories"} with {statusTab === "ALL" ? "" : statusTab.toLowerCase() + " "}prayers
              </ThemedText>
            </View>
          ) : (
            groups.map((group) => (
              <Pressable
                key={group.id}
                style={[styles.groupRow, { borderBottomColor: theme.border }]}
                onPress={() => handleGroupPress(group)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: Spacing.sm }}>
                  <View style={[styles.groupIcon, { backgroundColor: theme.primary + "12" }]}>
                    <Feather
                      name={browseMode === "officials" ? "user" : "tag"}
                      size={14}
                      color={theme.primary}
                    />
                  </View>
                  <ThemedText type="body" style={{ flex: 1, fontWeight: "500" }} numberOfLines={1}>
                    {browseMode === "officials" ? resolveOfficialName(group) : group.name}
                  </ThemedText>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={[styles.countBadge, { backgroundColor: theme.primary + "18" }]}>
                    <ThemedText type="caption" style={{ color: theme.primary, fontWeight: "700" }}>
                      {group.count}
                    </ThemedText>
                  </View>
                  <Feather name="chevron-right" size={16} color={theme.secondaryText} />
                </View>
              </Pressable>
            ))
          )}

          <Pressable
            style={[styles.viewAllRow]}
            onPress={() => navigation.navigate("AllPrayers", {})}
          >
            <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>
              View All Prayers
            </ThemedText>
            <Feather name="arrow-right" size={16} color={theme.primary} />
          </Pressable>
        </View>
      </ScrollView>

      <Pressable
        style={[
          styles.fab,
          { backgroundColor: theme.primary, bottom: tabBarHeight + Spacing.lg },
        ]}
        onPress={() => navigation.navigate("AddPrayer", {})}
      >
        <Feather name="plus" size={24} color={theme.buttonText} />
      </Pressable>
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
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  upcomingCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.md,
  },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  upcomingIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  dailyCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
  },
  dailyCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  emptyCard: {
    padding: Spacing.xl,
  },
  markPrayedBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.sm,
  },
  emptyContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  segmentedRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  browseSegmentItem: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  countBadge: {
    minWidth: 28,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xs,
    marginRight: Spacing.xs,
  },
  viewAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  fab: {
    position: "absolute",
    left: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});
