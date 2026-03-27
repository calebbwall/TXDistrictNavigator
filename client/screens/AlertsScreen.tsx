import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { LegislativeStackParamList } from "@/navigation/LegislativeStackNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl, apiRequest } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<LegislativeStackParamList>;

interface Alert {
  id: string;
  alertType: string;
  entityType: string;
  entityId: string | null;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

interface AlertsResponse {
  alerts: Alert[];
  unreadCount: number;
}

function timeAgo(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function alertIcon(alertType: string): keyof typeof Feather.glyphMap {
  switch (alertType) {
    case "HEARING_POSTED": return "calendar";
    case "HEARING_UPDATED": return "edit-2";
    case "CALENDAR_UPDATED": return "grid";
    case "BILL_ACTION": return "file-text";
    case "COMMITTEE_MEMBER_CHANGE": return "users";
    default: return "bell";
  }
}

function alertAccentColor(alertType: string, theme: { primary: string; success: string; warning: string; secondary: string }): string {
  switch (alertType) {
    case "HEARING_POSTED": return theme.success;
    case "HEARING_UPDATED": return theme.warning;
    case "BILL_ACTION": return theme.primary;
    case "COMMITTEE_MEMBER_CHANGE": return theme.warning;
    default: return theme.primary;
  }
}

function AlertRow({
  alert,
  onRead,
  onNavigate,
}: {
  alert: Alert;
  onRead: (id: string) => void;
  onNavigate: (alert: Alert) => void;
}) {
  const { theme } = useTheme();
  const isUnread = !alert.readAt;
  const color = alertAccentColor(alert.alertType, theme);
  const icon = alertIcon(alert.alertType);

  return (
    <Pressable
      onPress={() => {
        if (isUnread) onRead(alert.id);
        onNavigate(alert);
      }}
      style={({ pressed }) => [
        styles.alertRow,
        {
          backgroundColor: isUnread ? color + "08" : theme.cardBackground,
          borderLeftColor: isUnread ? color : "transparent",
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <View style={styles.alertContent}>
        <ThemedText type="body" style={{ fontWeight: isUnread ? "700" : "400" }} numberOfLines={1}>
          {alert.title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }} numberOfLines={2}>
          {alert.body}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 4, opacity: 0.7 }}>
          {timeAgo(alert.createdAt)}
        </ThemedText>
      </View>
      {isUnread && (
        <View style={[styles.unreadDot, { backgroundColor: color }]} />
      )}
    </Pressable>
  );
}

export default function AlertsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const qClient = useQueryClient();
  const headerHeight = useHeaderHeight();
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 80; }

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<AlertsResponse>({
    queryKey: ["/api/alerts", { unreadOnly }],
    queryFn: async () => {
      const url = new URL(`/api/alerts${unreadOnly ? "?unreadOnly=true" : ""}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    staleTime: 60_000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/alerts/${id}/read`);
    },
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleNavigate = useCallback(
    (alert: Alert) => {
      if (alert.entityType === "event" && alert.entityId) {
        navigation.navigate("HearingDetail", {
          eventId: alert.entityId,
          title: alert.title,
        });
      } else if (alert.entityType === "committee" && alert.entityId) {
        navigation.navigate("CommitteeDetail", {
          committeeId: alert.entityId,
          committeeName: alert.title.replace(/^Committee Updated:\s*/i, ""),
        });
      }
    },
    [navigation],
  );

  const alerts = data?.alerts ?? [];

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {/* Filter row */}
      <View style={[styles.filterRow, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => setUnreadOnly(false)}
          style={[styles.filterTab, !unreadOnly && styles.filterTabActive]}
        >
          <ThemedText type="body" style={{ color: !unreadOnly ? theme.primary : theme.secondaryText, fontWeight: !unreadOnly ? "700" : "400" }}>
            All
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setUnreadOnly(true)}
          style={[styles.filterTab, unreadOnly && styles.filterTabActive]}
        >
          <ThemedText type="body" style={{ color: unreadOnly ? theme.primary : theme.secondaryText, fontWeight: unreadOnly ? "700" : "400" }}>
            Unread
            {data && data.unreadCount > 0 ? (
              <ThemedText type="body" style={{ color: theme.primary }}> ({data.unreadCount})</ThemedText>
            ) : null}
          </ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AlertRow
            alert={item}
            onRead={(id) => markReadMutation.mutate(id)}
            onNavigate={handleNavigate}
          />
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Feather name="bell-off" size={56} color={theme.secondaryText} />
            <ThemedText type="h3" style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}>
              {unreadOnly ? "No unread alerts" : "No alerts yet"}
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.sm, textAlign: "center" }}>
              Alerts appear when new hearings are posted or bills are referred
            </ThemedText>
          </View>
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
        )}
        contentContainerStyle={{
          paddingTop: headerHeight,
          paddingBottom: tabBarHeight + Spacing.xl,
          flexGrow: 1,
        }}
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
  filterRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
  },
  filterTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "transparent", // overridden by parent's primary color usage
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    borderLeftWidth: 3,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
  alertContent: { flex: 1, marginRight: Spacing.sm },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 6,
    flexShrink: 0,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
});
