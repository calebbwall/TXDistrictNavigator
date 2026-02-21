import React from "react";
import {
  StyleSheet,
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PrayerStackParamList } from "@/navigation/PrayerStackNavigator";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

type Prayer = {
  id: string;
  title: string;
  body: string;
  status: string;
  eventDate: string | null;
  officialIds: string[];
};

type OfficialItem = {
  id: string;
  fullName: string;
};

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(d);
  eventDay.setHours(0, 0, 0, 0);
  const diffMs = eventDay.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (diffDays < 0) return `${Math.abs(diffDays)} days ago, ${formatted}`;
  if (diffDays === 0) return `Today, ${formatted}`;
  if (diffDays === 1) return `Tomorrow, ${formatted}`;
  return `In ${diffDays} days, ${formatted}`;
}

function getRelativeBadge(dateStr: string): { label: string; color: string; type: "past" | "today" | "soon" | "future" } {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(d);
  eventDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((eventDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: "Past", color: "error", type: "past" };
  if (diffDays === 0) return { label: "Today", color: "warning", type: "today" };
  if (diffDays <= 7) return { label: "This Week", color: "success", type: "soon" };
  return { label: "Upcoming", color: "primary", type: "future" };
}

export default function UpcomingEventsScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<PrayerStackParamList>>();

  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 0; }

  const { data: prayers = [], isLoading, refetch } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers/upcoming"],
  });

  const { data: officialsData } = useQuery<{ officials: OfficialItem[] }>({
    queryKey: ["/api/officials"],
  });
  const officialsMap = new Map((officialsData?.officials ?? []).map((o) => [o.id, o.fullName]));

  const renderItem = ({ item }: { item: Prayer }) => {
    const badge = getRelativeBadge(item.eventDate!);
    const badgeColor = (theme as any)[badge.color] || theme.primary;
    const officialNames = item.officialIds
      .map((id) => officialsMap.get(id) || id.substring(0, 8))
      .filter(Boolean);

    return (
      <Card
        elevation={1}
        style={styles.card}
        onPress={() => navigation.navigate("PrayerDetail", { prayerId: item.id })}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.badgePill, { backgroundColor: badgeColor + "18" }]}>
            <ThemedText type="small" style={{ color: badgeColor, fontWeight: "700" }}>
              {badge.label}
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={16} color={theme.secondaryText} />
        </View>
        <ThemedText type="h3" style={{ marginTop: Spacing.sm }} numberOfLines={2}>
          {item.title}
        </ThemedText>
        <View style={styles.dateRow}>
          <Feather name="calendar" size={14} color={theme.warning} style={{ marginRight: Spacing.xs }} />
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>
            {formatEventDate(item.eventDate!)}
          </ThemedText>
        </View>
        {officialNames.length > 0 ? (
          <View style={styles.dateRow}>
            <Feather name="user" size={14} color={theme.primary} style={{ marginRight: Spacing.xs }} />
            <ThemedText type="caption" style={{ color: theme.secondaryText }} numberOfLines={1}>
              {officialNames.join(", ")}
            </ThemedText>
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={prayers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.sm,
            paddingHorizontal: Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl,
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="calendar" size={48} color={theme.secondaryText} />
              <ThemedText
                type="body"
                style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}
              >
                No upcoming events.{"\n"}Set event dates on your prayers to see them here.
              </ThemedText>
            </View>
          }
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 12,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 120,
  },
});
