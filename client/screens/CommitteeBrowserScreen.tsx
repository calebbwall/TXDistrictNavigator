/**
 * CommitteeBrowserScreen — browse all TX House & Senate committees
 * within the Legislative tab.
 *
 * Filter chips: All | House | Senate
 * Each row shows: name · chamber badge · upcoming hearing count (from events)
 * Tap → CommitteeDetail (Members | Hearings | Bills tabs)
 *
 * Data sources:
 *   GET /api/committees                    — full list (existing route)
 *   GET /api/events/upcoming?days=14       — reused to compute per-committee counts
 */
import React, { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { LegislativeStackParamList } from "@/navigation/LegislativeStackNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

type NavigationProp = NativeStackNavigationProp<LegislativeStackParamList>;
type ChamberFilter = "all" | "TX_HOUSE" | "TX_SENATE";

interface Committee {
  id: string;
  chamber: "TX_HOUSE" | "TX_SENATE";
  name: string;
  slug: string;
  sourceUrl: string | null;
  parentCommitteeId: string | null;
  sortOrder: string | null;
  subcommittees?: Committee[];
}

interface LegislativeEvent {
  id: string;
  committeeId: string | null;
  startsAt: string | null;
}
interface EventsResponse { events: LegislativeEvent[]; total: number }

// ── Filter chip bar ──
function FilterBar<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterContent}
    >
      {options.map((opt) => {
        const active = selected === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={[
              styles.chip,
              { backgroundColor: active ? theme.primary : theme.backgroundSecondary },
            ]}
          >
            <ThemedText
              type="small"
              style={{ color: active ? "#fff" : theme.text, fontWeight: "600" }}
            >
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Committee row ──
function CommitteeRow({
  committee,
  upcomingCount,
  isSubcommittee,
  onPress,
}: {
  committee: Committee;
  upcomingCount: number;
  isSubcommittee?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const isSenate = committee.chamber === "TX_SENATE";
  const chamberColor = isSenate ? "#4A90E2" : "#E94B3C";
  const chamberLabel = isSenate ? "Senate" : "House";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.committeeRow,
        {
          backgroundColor: theme.cardBackground,
          opacity: pressed ? 0.85 : 1,
          marginLeft: isSubcommittee ? Spacing.lg : 0,
        },
      ]}
    >
      {/* Chamber bar */}
      <View style={[styles.chamberBar, { backgroundColor: chamberColor }]} />

      <View style={[styles.rowIcon, { backgroundColor: chamberColor + "15" }]}>
        <Feather
          name={isSubcommittee ? "corner-down-right" : "briefcase"}
          size={16}
          color={chamberColor}
        />
      </View>

      <View style={styles.rowContent}>
        <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={2}>
          {committee.name}
        </ThemedText>
        <View style={styles.rowMeta}>
          <View style={[styles.chamberBadge, { backgroundColor: chamberColor + "15" }]}>
            <ThemedText type="small" style={{ color: chamberColor, fontWeight: "700" }}>
              {chamberLabel}
            </ThemedText>
          </View>
          {isSubcommittee ? (
            <ThemedText type="small" style={{ color: theme.secondaryText }}>
              Subcommittee
            </ThemedText>
          ) : null}
        </View>
      </View>

      {upcomingCount > 0 ? (
        <View style={[styles.hearingBadge, { backgroundColor: theme.success + "20" }]}>
          <Feather name="calendar" size={11} color={theme.success} />
          <ThemedText type="small" style={{ color: theme.success, fontWeight: "700", marginLeft: 3 }}>
            {upcomingCount}
          </ThemedText>
        </View>
      ) : null}

      <Feather name="chevron-right" size={18} color={theme.secondaryText} style={{ marginLeft: Spacing.xs }} />
    </Pressable>
  );
}

// ── Stats bar ──
function StatsBar({ total }: { total: number }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.sortBar, { borderBottomColor: theme.border }]}>
      <ThemedText type="small" style={{ color: theme.secondaryText }}>
        {total} committee{total !== 1 ? "s" : ""}
      </ThemedText>
    </View>
  );
}

// ── Main screen ──
export default function CommitteeBrowserScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const headerHeight = useHeaderHeight();
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 80; }

  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const { data: committeesData, isLoading: committeesLoading, refetch: refetchCommittees } = useQuery<Committee[]>({
    queryKey: ["/api/committees"],
    queryFn: async () => {
      const url = new URL("/api/committees", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch committees");
      return res.json();
    },
    // Committees only update on the Monday scheduler run — never go stale on the
    // client so we avoid unnecessary background re-fetches on navigation.
    staleTime: Infinity,
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery<EventsResponse>({
    queryKey: ["/api/events/upcoming", "committee-browser"],
    queryFn: async () => {
      const url = new URL("/api/events/upcoming?days=30", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) return { events: [], total: 0 };
      return res.json();
    },
    staleTime: 10 * 60_000,
  });

  // Build committeeId → upcoming hearing count map
  const hearingCounts = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const e of eventsData?.events ?? []) {
      if (e.committeeId) {
        map[e.committeeId] = (map[e.committeeId] ?? 0) + 1;
      }
    }
    return map;
  }, [eventsData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchCommittees(), refetchEvents()]);
    setRefreshing(false);
  }, [refetchCommittees, refetchEvents]);

  const handleCommitteePress = useCallback(
    (committee: Committee) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate("CommitteeDetail", {
        committeeId: committee.id,
        committeeName: committee.name,
      });
    },
    [navigation],
  );

  // Flatten committees (parent + subcommittees) respecting chamber filter, sorted A-Z
  const flatList = useMemo<{ committee: Committee; isSubcommittee: boolean }[]>(() => {
    const all = committeesData ?? [];
    const filtered = chamberFilter === "all"
      ? all
      : all.filter((c) => c.chamber === chamberFilter);

    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

    const rows: { committee: Committee; isSubcommittee: boolean }[] = [];
    for (const parent of sorted) {
      rows.push({ committee: parent, isSubcommittee: false });
      const subs = (parent.subcommittees ?? []).filter(
        (s) => chamberFilter === "all" || s.chamber === chamberFilter,
      );
      for (const sub of [...subs].sort((a, b) => a.name.localeCompare(b.name))) {
        rows.push({ committee: sub, isSubcommittee: true });
      }
    }
    return rows;
  }, [committeesData, chamberFilter]);

  if (committeesLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const chamberOptions: { value: ChamberFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "TX_HOUSE", label: "House" },
    { value: "TX_SENATE", label: "Senate" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {/* Filter chips */}
      <View style={[styles.filterBar, { paddingTop: headerHeight + Spacing.xs }]}>
        <FilterBar
          options={chamberOptions}
          selected={chamberFilter}
          onSelect={setChamberFilter}
        />
      </View>

      {/* Stats */}
      <StatsBar total={flatList.length} />

      {/* Committee list */}
      <FlatList
        data={flatList}
        keyExtractor={(item) => item.committee.id}
        renderItem={({ item }) => (
          <CommitteeRow
            committee={item.committee}
            upcomingCount={hearingCounts[item.committee.id] ?? 0}
            isSubcommittee={item.isSubcommittee}
            onPress={() => handleCommitteePress(item.committee)}
          />
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: Spacing.md }} />
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Feather name="briefcase" size={48} color={theme.secondaryText} />
            <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}>
              No committees found
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.xs, textAlign: "center" }}>
              Run a committee refresh from the admin panel to populate this list.
            </ThemedText>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  filterBar: { paddingBottom: Spacing.xs },
  filterContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  committeeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
    gap: Spacing.sm,
    overflow: "hidden",
  },
  chamberBar: { width: 4, alignSelf: "stretch" },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowContent: { flex: 1 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: 2 },
  chamberBadge: { paddingHorizontal: Spacing.xs, paddingVertical: 2, borderRadius: BorderRadius.xs },
  hearingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    flexShrink: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
});
