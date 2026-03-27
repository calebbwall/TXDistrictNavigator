import React, { useState, useCallback, useMemo } from "react";
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
import * as Haptics from "expo-haptics";

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

function alertAccentColor(alertType: string, theme: { primary: string; success: string; warning: string }): string {
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
  isSelecting,
  isSelected,
  onPress,
  onLongPress,
}: {
  alert: Alert;
  isSelecting: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { theme } = useTheme();
  const isUnread = !alert.readAt;
  const color = alertAccentColor(alert.alertType, theme);
  const icon = alertIcon(alert.alertType);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.alertRow,
        {
          backgroundColor: isSelected
            ? theme.primary + "15"
            : isUnread
            ? color + "08"
            : theme.cardBackground,
          borderLeftColor: isSelecting
            ? "transparent"
            : isUnread
            ? color
            : "transparent",
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {isSelecting ? (
        <View
          style={[
            styles.checkbox,
            {
              borderColor: isSelected ? theme.primary : theme.border,
              backgroundColor: isSelected ? theme.primary : "transparent",
            },
          ]}
        >
          {isSelected ? (
            <Feather name="check" size={12} color="#fff" />
          ) : null}
        </View>
      ) : (
        <View style={[styles.iconWrap, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={16} color={color} />
        </View>
      )}

      <View style={styles.alertContent}>
        <ThemedText
          type="body"
          style={{ fontWeight: isUnread ? "700" : "400" }}
          numberOfLines={1}
        >
          {alert.title}
        </ThemedText>
        <ThemedText
          type="small"
          style={{ color: theme.secondaryText, marginTop: 2 }}
          numberOfLines={2}
        >
          {alert.body}
        </ThemedText>
        <ThemedText
          type="small"
          style={{ color: theme.secondaryText, marginTop: 4, opacity: 0.7 }}
        >
          {timeAgo(alert.createdAt)}
        </ThemedText>
      </View>

      {!isSelecting && isUnread ? (
        <View style={[styles.unreadDot, { backgroundColor: color }]} />
      ) : null}
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
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery<AlertsResponse>({
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
    onSuccess: () => qClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  const bulkMarkReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await apiRequest("POST", "/api/alerts/mark-read", { ids });
    },
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      exitSelecting();
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await apiRequest("DELETE", "/api/alerts/bulk", { ids });
    },
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      exitSelecting();
    },
  });

  const alerts = data?.alerts ?? [];

  const allIds = useMemo(() => alerts.map((a) => a.id), [alerts]);
  const allSelected = selectedIds.size === allIds.length && allIds.length > 0;
  const someUnreadSelected = useMemo(
    () => alerts.filter((a) => selectedIds.has(a.id) && !a.readAt).length > 0,
    [alerts, selectedIds],
  );

  const exitSelecting = useCallback(() => {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const enterSelecting = useCallback((preSelectId?: string) => {
    setIsSelecting(true);
    setSelectedIds(preSelectId ? new Set([preSelectId]) : new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [allSelected, allIds]);

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

  const handleRowPress = useCallback(
    (alert: Alert) => {
      if (isSelecting) {
        toggleSelect(alert.id);
      } else {
        if (!alert.readAt) markReadMutation.mutate(alert.id);
        handleNavigate(alert);
      }
    },
    [isSelecting, toggleSelect, markReadMutation, handleNavigate],
  );

  const handleLongPress = useCallback(
    (alert: Alert) => {
      if (!isSelecting) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        enterSelecting(alert.id);
      }
    },
    [isSelecting, enterSelecting],
  );

  const handleBulkMarkRead = useCallback(() => {
    if (selectedIds.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    bulkMarkReadMutation.mutate(Array.from(selectedIds));
  }, [selectedIds, bulkMarkReadMutation]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  }, [selectedIds, bulkDeleteMutation]);

  const isBusy = bulkMarkReadMutation.isPending || bulkDeleteMutation.isPending;

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {/* Top control row */}
      {isSelecting ? (
        <View
          style={[
            styles.selectionHeader,
            { borderBottomColor: theme.border, paddingTop: headerHeight },
          ]}
        >
          <Pressable onPress={exitSelecting} style={styles.selectionHeaderBtn} hitSlop={8}>
            <ThemedText type="body" style={{ color: theme.primary }}>
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText type="body" style={{ fontWeight: "600" }}>
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select items"}
          </ThemedText>
          <Pressable onPress={toggleSelectAll} style={styles.selectionHeaderBtn} hitSlop={8}>
            <ThemedText type="body" style={{ color: theme.primary }}>
              {allSelected ? "Deselect All" : "Select All"}
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.filterRow,
            { borderBottomColor: theme.border, paddingTop: headerHeight },
          ]}
        >
          <View style={styles.filterTabs}>
            <Pressable
              onPress={() => setUnreadOnly(false)}
              style={[styles.filterTab, !unreadOnly && { borderBottomWidth: 2, borderBottomColor: theme.primary }]}
            >
              <ThemedText
                type="body"
                style={{ color: !unreadOnly ? theme.primary : theme.secondaryText, fontWeight: !unreadOnly ? "700" : "400" }}
              >
                All
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setUnreadOnly(true)}
              style={[styles.filterTab, unreadOnly && { borderBottomWidth: 2, borderBottomColor: theme.primary }]}
            >
              <ThemedText
                type="body"
                style={{ color: unreadOnly ? theme.primary : theme.secondaryText, fontWeight: unreadOnly ? "700" : "400" }}
              >
                {"Unread"}
                {data && data.unreadCount > 0 ? (
                  <ThemedText type="body" style={{ color: theme.primary }}>
                    {` (${data.unreadCount})`}
                  </ThemedText>
                ) : null}
              </ThemedText>
            </Pressable>
          </View>
          {alerts.length > 0 ? (
            <Pressable
              onPress={() => enterSelecting()}
              style={styles.editBtn}
              hitSlop={8}
            >
              <ThemedText type="body" style={{ color: theme.primary }}>
                Edit
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      )}

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AlertRow
            alert={item}
            isSelecting={isSelecting}
            isSelected={selectedIds.has(item.id)}
            onPress={() => handleRowPress(item)}
            onLongPress={() => handleLongPress(item)}
          />
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Feather name="bell-off" size={56} color={theme.secondaryText} />
            <ThemedText
              type="h3"
              style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}
            >
              {unreadOnly ? "No unread alerts" : "No alerts yet"}
            </ThemedText>
            <ThemedText
              type="body"
              style={{ color: theme.secondaryText, marginTop: Spacing.sm, textAlign: "center" }}
            >
              Alerts appear when new hearings are posted or bills are referred
            </ThemedText>
          </View>
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />
        )}
        contentContainerStyle={{
          paddingBottom: isSelecting
            ? tabBarHeight + 72 + Spacing.xl
            : tabBarHeight + Spacing.xl,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      />

      {/* Bottom action bar — visible in selection mode */}
      {isSelecting ? (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: theme.cardBackground,
              borderTopColor: theme.border,
              paddingBottom: tabBarHeight + Spacing.sm,
            },
          ]}
        >
          <Pressable
            onPress={handleBulkMarkRead}
            disabled={!someUnreadSelected || isBusy}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: theme.primary + "15",
                opacity: !someUnreadSelected || isBusy ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            {isBusy && bulkMarkReadMutation.isPending ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Feather name="check-circle" size={18} color={theme.primary} />
            )}
            <ThemedText
              type="body"
              style={{ color: theme.primary, fontWeight: "600", marginLeft: Spacing.xs }}
            >
              Mark Read
            </ThemedText>
          </Pressable>

          <View style={[styles.actionDivider, { backgroundColor: theme.border }]} />

          <Pressable
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0 || isBusy}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: "#DC354515",
                opacity: selectedIds.size === 0 || isBusy ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}
          >
            {isBusy && bulkDeleteMutation.isPending ? (
              <ActivityIndicator size="small" color="#DC3545" />
            ) : (
              <Feather name="trash-2" size={18} color="#DC3545" />
            )}
            <ThemedText
              type="body"
              style={{ color: "#DC3545", fontWeight: "600", marginLeft: Spacing.xs }}
            >
              Delete
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xs,
  },
  filterTabs: {
    flex: 1,
    flexDirection: "row",
  },
  filterTab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  editBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },

  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectionHeaderBtn: {
    paddingVertical: Spacing.xs,
    minWidth: 70,
  },

  alertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    borderLeftWidth: 3,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
    marginTop: 2,
    flexShrink: 0,
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

  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  actionDivider: {
    width: 1,
    height: 36,
  },
});
