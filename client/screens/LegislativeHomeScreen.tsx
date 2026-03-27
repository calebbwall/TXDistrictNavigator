/**
 * LegislativeHomeScreen — hub/root of the Legislative tab.
 *
 * Two navigation cards:
 *   1. Legislative Calendar → full upcoming-events list
 *   2. Committees → browse all committees filtered by chamber
 *
 * Also shows a 3-event "today / next 48 h" quick-preview so the user
 * doesn't have to drill in just to see what's happening right now.
 */
import React, { useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
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

type NavigationProp = NativeStackNavigationProp<LegislativeStackParamList>;

// ── shared types ──
interface LegislativeEvent {
  id: string;
  chamber: string | null;
  committeeName: string | null;
  committeeChamber: string | null;
  title: string;
  startsAt: string | null;
  location: string | null;
  status: string;
  billCount: number;
  witnessCount: number | null;
}
interface EventsResponse { events: LegislativeEvent[]; total: number }
interface AlertsResponse { alerts: unknown[]; unreadCount: number }

// ── date helpers ──
function formatDateCompact(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago" });
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }) + ` ${time}`;
}

function dayGroup(iso: string | null): "today-tomorrow" | "week" | "later" {
  if (!iso) return "later";
  const diff = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 1) return "today-tomorrow";
  if (diff <= 7) return "week";
  return "later";
}

// ── NavCard — big pressable card navigating to a sub-screen ──
function NavCard({
  icon,
  color,
  title,
  subtitle,
  badge,
  badgeColor,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  color: string;
  title: string;
  subtitle: string;
  badge?: string | null;
  badgeColor?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navCard,
        { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.navCardIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={24} color={color} />
      </View>
      <View style={styles.navCardText}>
        <ThemedText type="body" style={{ fontWeight: "700" }}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }}>
          {subtitle}
        </ThemedText>
      </View>
      {badge ? (
        <View style={[styles.navCardBadge, { backgroundColor: (badgeColor ?? color) }]}>
          <ThemedText type="small" style={{ color: "#fff", fontWeight: "700" }}>
            {badge}
          </ThemedText>
        </View>
      ) : null}
      <Feather name="chevron-right" size={20} color={theme.secondaryText} style={{ marginLeft: Spacing.xs }} />
    </Pressable>
  );
}

// ── Mini event row for quick-preview ──
function MiniEventRow({
  event,
  onPress,
}: {
  event: LegislativeEvent;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const isSenate = event.chamber === "TX_SENATE" || event.committeeChamber === "TX_SENATE";
  const accent = isSenate ? "#4A90E2" : "#E94B3C";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniRow,
        { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.miniAccent, { backgroundColor: accent }]} />
      <View style={styles.miniContent}>
        <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
          {event.committeeName ?? event.title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.secondaryText }}>
          {formatDateCompact(event.startsAt)}
          {event.location ? ` · ${event.location}` : ""}
        </ThemedText>
      </View>
      {event.billCount > 0 ? (
        <View style={[styles.miniBillBadge, { backgroundColor: theme.primary + "18" }]}>
          <ThemedText type="small" style={{ color: theme.primary, fontWeight: "700" }}>
            {event.billCount}
          </ThemedText>
        </View>
      ) : null}
      <Feather name="chevron-right" size={16} color={theme.secondaryText} />
    </Pressable>
  );
}

// ── Section header ──
function SectionLabel({ children }: { children: string }) {
  const { theme } = useTheme();
  return (
    <ThemedText
      type="caption"
      style={{ color: theme.secondaryText, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: Spacing.sm }}
    >
      {children}
    </ThemedText>
  );
}

// ── Main screen ──
export default function LegislativeHomeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const headerHeight = useHeaderHeight();
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 80; }

  const [refreshing, setRefreshing] = useState(false);

  const { data: alertsData, refetch: refetchAlerts } = useQuery<AlertsResponse>({
    queryKey: ["/api/alerts", { unreadOnly: true }],
    queryFn: async () => {
      const url = new URL("/api/alerts?unreadOnly=true", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) return { alerts: [], unreadCount: 0 };
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: eventsData, refetch: refetchEvents } = useQuery<EventsResponse>({
    queryKey: ["/api/events/upcoming", "home-preview"],
    queryFn: async () => {
      const url = new URL("/api/events/upcoming?days=14", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) return { events: [], total: 0 };
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAlerts(), refetchEvents()]);
    setRefreshing(false);
  }, [refetchAlerts, refetchEvents]);

  const events = eventsData?.events ?? [];
  const todayTomorrow = events.filter((e) => dayGroup(e.startsAt) === "today-tomorrow");
  const thisWeek = events.filter((e) => dayGroup(e.startsAt) === "week");
  const previewEvents = todayTomorrow.slice(0, 3).length > 0
    ? todayTomorrow.slice(0, 3)
    : thisWeek.slice(0, 3);

  const unreadCount = alertsData?.unreadCount ?? 0;
  const totalUpcoming = events.length;

  // Unique committees in the events list (for subtitle)
  const committeeSet = new Set(events.map((e) => e.committeeName).filter(Boolean));

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.md,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }
    >
      {/* ── Navigation cards ── */}
      <View style={styles.cardsRow}>
        {/* Calendar card */}
        <NavCard
          icon="calendar"
          color={theme.primary}
          title="Calendar"
          subtitle={
            totalUpcoming > 0
              ? `${totalUpcoming} upcoming hearing${totalUpcoming !== 1 ? "s" : ""}`
              : "No upcoming hearings"
          }
          onPress={() => navigation.navigate("LegislativeDashboard")}
        />

        {/* Committees card */}
        <NavCard
          icon="briefcase"
          color={theme.secondary}
          title="Committees"
          subtitle={
            committeeSet.size > 0
              ? `${committeeSet.size} active this period`
              : "Browse all committees"
          }
          onPress={() => navigation.navigate("CommitteeBrowser")}
        />

        {/* Alerts card */}
        <NavCard
          icon="bell"
          color={unreadCount > 0 ? theme.warning : theme.secondaryText}
          title="Alerts"
          subtitle={
            unreadCount > 0 ? `${unreadCount} unread` : "No new alerts"
          }
          badge={unreadCount > 0 ? String(unreadCount) : null}
          badgeColor={theme.warning}
          onPress={() => navigation.navigate("Alerts")}
        />
      </View>

      {/* ── Quick preview ── */}
      {previewEvents.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <SectionLabel>
              {todayTomorrow.length > 0 ? "Today & Tomorrow" : "This Week"}
            </SectionLabel>
            <Pressable onPress={() => navigation.navigate("LegislativeDashboard")}>
              <ThemedText type="small" style={{ color: theme.primary, fontWeight: "600" }}>
                See all
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.previewList}>
            {previewEvents.map((event) => (
              <MiniEventRow
                key={event.id}
                event={event}
                onPress={() =>
                  navigation.navigate("HearingDetail", {
                    eventId: event.id,
                    title: event.committeeName ?? event.title,
                  })
                }
              />
            ))}
            {(todayTomorrow.length > 3 || thisWeek.length > 3) ? (
              <Pressable
                onPress={() => navigation.navigate("LegislativeDashboard")}
                style={[styles.moreRow, { backgroundColor: theme.backgroundSecondary }]}
              >
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: "600" }}>
                  View all {totalUpcoming} hearings →
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ── Empty state if no events and no loading ── */}
      {previewEvents.length === 0 && !refreshing ? (
        <View style={styles.emptyState}>
          <Feather name="calendar" size={48} color={theme.secondaryText} />
          <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}>
            No upcoming hearings found
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: Spacing.xs, textAlign: "center" }}>
            Data refreshes daily at 5 AM Central.{"\n"}Tap Committees to browse all committee pages.
          </ThemedText>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cardsRow: { gap: Spacing.sm, marginBottom: Spacing.xl },
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  navCardIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  navCardText: { flex: 1 },
  navCardBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    minWidth: 24,
    alignItems: "center",
  },
  section: { marginBottom: Spacing.xl },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  previewList: { gap: Spacing.xs },
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    gap: Spacing.sm,
  },
  miniAccent: { width: 4, alignSelf: "stretch" },
  miniContent: { flex: 1, paddingVertical: Spacing.sm },
  miniBillBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
    flexShrink: 0,
  },
  moreRow: {
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
});
