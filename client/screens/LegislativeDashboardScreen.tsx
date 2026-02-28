import React, { useState, useCallback } from "react";
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
import { queryClient } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<LegislativeStackParamList>;

// ── Types ──
interface LegislativeEvent {
  id: string;
  eventType: string;
  chamber: string | null;
  committeeId: string | null;
  title: string;
  startsAt: string | null;
  location: string | null;
  status: string;
  sourceUrl: string;
  committeeName: string | null;
  committeeChamber: string | null;
  witnessCount: number | null;
  billCount: number;
}

interface EventsResponse {
  events: LegislativeEvent[];
  total: number;
}

// ── Filter chip types ──
type FilterScope = "all" | "house" | "senate";

// ── Helpers ──
function formatDateShort(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(d);
  eventDay.setHours(0, 0, 0, 0);
  const diff = Math.round((eventDay.getTime() - today.getTime()) / 86400000);
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Chicago",
  });
  if (diff === 0) return `Today ${timeStr}`;
  if (diff === 1) return `Tomorrow ${timeStr}`;
  if (diff <= 7) {
    const day = d.toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "America/Chicago",
    });
    return `${day} ${timeStr}`;
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  }) + ` ${timeStr}`;
}

function getDayGroup(iso: string | null): string {
  if (!iso) return "No Date";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(d);
  eventDay.setHours(0, 0, 0, 0);
  const diff = Math.round((eventDay.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 2) return "Next 48 Hours";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
}

function chamberLabel(chamber: string | null | undefined): string {
  if (chamber === "TX_HOUSE") return "House";
  if (chamber === "TX_SENATE") return "Senate";
  return chamber ?? "";
}

// ── Event Card ──
function EventCard({
  event,
  onPress,
}: {
  event: LegislativeEvent;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const isSenate = event.chamber === "TX_SENATE" || event.committeeChamber === "TX_SENATE";
  const accentColor = isSenate ? theme.overlaySenate.replace("0.4", "1") : theme.overlayHouse.replace("0.4", "1");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCard,
        { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {/* Chamber accent bar */}
      <View style={[styles.chamberBar, { backgroundColor: isSenate ? "#4A90E2" : "#E94B3C" }]} />

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.chamberBadge}>
            <ThemedText type="small" style={{ color: isSenate ? "#4A90E2" : "#E94B3C", fontWeight: "700" }}>
              {chamberLabel(event.chamber ?? event.committeeChamber)}
            </ThemedText>
          </View>
          {event.status !== "POSTED" && (
            <View style={[styles.statusBadge, { backgroundColor: theme.backgroundSecondary }]}>
              <ThemedText type="small" style={{ color: theme.secondaryText }}>
                {event.status}
              </ThemedText>
            </View>
          )}
        </View>

        <ThemedText type="body" style={styles.eventTitle} numberOfLines={2}>
          {event.committeeName ?? event.title}
        </ThemedText>

        <View style={styles.metaRow}>
          <Feather name="clock" size={13} color={theme.secondaryText} />
          <ThemedText type="small" style={{ color: theme.secondaryText, marginLeft: 4 }}>
            {formatDateShort(event.startsAt)}
          </ThemedText>
        </View>

        {event.location ? (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={13} color={theme.secondaryText} />
            <ThemedText type="small" style={{ color: theme.secondaryText, marginLeft: 4 }} numberOfLines={1}>
              {event.location}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.countRow}>
          {event.billCount > 0 ? (
            <View style={[styles.countChip, { backgroundColor: theme.primary + "18" }]}>
              <Feather name="file-text" size={11} color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.primary, marginLeft: 3 }}>
                {event.billCount} bill{event.billCount !== 1 ? "s" : ""}
              </ThemedText>
            </View>
          ) : null}
          {event.witnessCount != null && event.witnessCount > 0 ? (
            <View style={[styles.countChip, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="users" size={11} color={theme.secondaryText} />
              <ThemedText type="small" style={{ color: theme.secondaryText, marginLeft: 3 }}>
                {event.witnessCount} witness{event.witnessCount !== 1 ? "es" : ""}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      <Feather name="chevron-right" size={18} color={theme.secondaryText} style={{ marginRight: Spacing.sm }} />
    </Pressable>
  );
}

// ── Section Header ──
function SectionHeader({ title }: { title: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
      <ThemedText type="caption" style={{ color: theme.secondaryText, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {title}
      </ThemedText>
    </View>
  );
}

// ── Filter Chips ──
function FilterChips({
  selected,
  onSelect,
}: {
  selected: FilterScope;
  onSelect: (scope: FilterScope) => void;
}) {
  const { theme } = useTheme();
  const chips: { key: FilterScope; label: string }[] = [
    { key: "all", label: "All" },
    { key: "house", label: "House" },
    { key: "senate", label: "Senate" },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
      {chips.map((chip) => {
        const active = selected === chip.key;
        return (
          <Pressable
            key={chip.key}
            onPress={() => onSelect(chip.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor: active ? theme.primary : theme.backgroundSecondary,
                borderColor: active ? theme.primary : "transparent",
              },
            ]}
          >
            <ThemedText type="small" style={{ color: active ? "#FFFFFF" : theme.text, fontWeight: "600" }}>
              {chip.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Main Screen ──
export default function LegislativeDashboardScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const headerHeight = useHeaderHeight();
  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 80;
  }

  const [filter, setFilter] = useState<FilterScope>("all");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<EventsResponse>({
    queryKey: ["/api/events/upcoming"],
    queryFn: async () => {
      const url = new URL("/api/events/upcoming?days=14", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const events = data?.events ?? [];

  const filtered = events.filter((e) => {
    if (filter === "house") return e.chamber === "TX_HOUSE" || e.committeeChamber === "TX_HOUSE";
    if (filter === "senate") return e.chamber === "TX_SENATE" || e.committeeChamber === "TX_SENATE";
    return true;
  });

  // Group by day
  type ListItem =
    | { type: "header"; title: string }
    | { type: "event"; event: LegislativeEvent };

  const listData: ListItem[] = [];
  let lastGroup = "";
  for (const event of filtered) {
    const group = getDayGroup(event.startsAt);
    if (group !== lastGroup) {
      listData.push({ type: "header", title: group });
      lastGroup = group;
    }
    listData.push({ type: "event", event });
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      return <SectionHeader title={item.title} />;
    }
    return (
      <EventCard
        event={item.event}
        onPress={() =>
          navigation.navigate("HearingDetail", {
            eventId: item.event.id,
            title: item.event.committeeName ?? item.event.title,
          })
        }
      />
    );
  };

  const EmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <Feather name="calendar" size={56} color={theme.secondaryText} />
      <ThemedText type="h3" style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}>
        No upcoming hearings
      </ThemedText>
      <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.sm, textAlign: "center" }}>
        Check back after the daily refresh (5 AM Central)
      </ThemedText>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={48} color="#DC3545" />
        <ThemedText type="body" style={{ color: "#DC3545", marginTop: Spacing.md }}>
          Failed to load events
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FilterChips selected={filter} onSelect={setFilter} />
      <FlatList
        data={listData}
        keyExtractor={(item, index) =>
          item.type === "header" ? `h-${item.title}` : `e-${item.event.id}-${index}`
        }
        renderItem={renderItem}
        ListEmptyComponent={EmptyComponent}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: Spacing.sm, paddingBottom: tabBarHeight + Spacing.xl },
        ]}
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
  filterScroll: { flexGrow: 0 },
  filterContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: "row",
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  listContent: { paddingHorizontal: Spacing.md },
  sectionHeader: {
    paddingVertical: Spacing.sm,
    paddingTop: Spacing.md,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  chamberBar: { width: 4, alignSelf: "stretch" },
  cardContent: { flex: 1, padding: Spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 4 },
  chamberBadge: {},
  statusBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  eventTitle: { fontWeight: "600", marginBottom: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  countRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs },
  countChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl * 2,
    paddingHorizontal: Spacing.xl,
  },
});
