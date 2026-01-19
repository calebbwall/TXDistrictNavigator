import React, { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { getAllFollowUps, NotePrayerEntry } from "@/lib/storage";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

interface FollowUpItem {
  source: string;
  districtNumber: number;
  entries: NotePrayerEntry[];
}

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

export default function FollowUpDashboardScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFollowUps = useCallback(async () => {
    try {
      const data = await getAllFollowUps();
      const sorted = data.sort((a, b) => {
        const latestA = Math.max(...a.entries.map(e => new Date(e.createdAt).getTime()));
        const latestB = Math.max(...b.entries.map(e => new Date(e.createdAt).getTime()));
        return latestB - latestA;
      });
      setFollowUps(sorted);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFollowUps();
    }, [loadFollowUps])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadFollowUps();
  }, [loadFollowUps]);

  const handleOfficialPress = useCallback(
    (item: FollowUpItem) => {
      const officialId = `${item.source}:${item.districtNumber}`;
      navigation.navigate("OfficialProfile", {
        officialId,
      });
    },
    [navigation]
  );

  const formatSource = (source: string) => {
    switch (source) {
      case "TX_HOUSE":
        return "TX House";
      case "TX_SENATE":
        return "TX Senate";
      case "US_HOUSE":
        return "US House";
      default:
        return source;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const renderFollowUpCard = useCallback(
    ({ item }: { item: FollowUpItem }) => {
      const latestEntry = item.entries.reduce((latest, entry) =>
        new Date(entry.createdAt) > new Date(latest.createdAt) ? entry : latest
      );

      return (
        <Pressable
          onPress={() => handleOfficialPress(item)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.officialInfo}>
                <ThemedText style={styles.sourceLabel}>
                  {formatSource(item.source)} District {item.districtNumber}
                </ThemedText>
                <ThemedText style={styles.entryCount}>
                  {item.entries.length} follow-up{item.entries.length !== 1 ? "s" : ""}
                </ThemedText>
              </View>
              <View style={[styles.badge, { backgroundColor: theme.warning + "20" }]}>
                <Feather name="flag" size={12} color={theme.warning} />
                <ThemedText style={[styles.badgeText, { color: theme.warning }]}>
                  Follow Up
                </ThemedText>
              </View>
            </View>
            <View style={styles.notePreview}>
              <ThemedText style={styles.noteText} numberOfLines={2}>
                {latestEntry.text}
              </ThemedText>
              <ThemedText style={[styles.dateText, { color: theme.secondaryText }]}>
                {formatDate(latestEntry.createdAt)}
              </ThemedText>
            </View>
            <View style={styles.cardFooter}>
              <Feather name="chevron-right" size={20} color={theme.secondaryText} />
            </View>
          </Card>
        </Pressable>
      );
    },
    [theme, handleOfficialPress]
  );

  if (loading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {followUps.length === 0 ? (
        <View style={[styles.emptyContainer, { paddingTop: headerHeight }]}>
          <Feather name="flag" size={48} color={theme.secondaryText} />
          <ThemedText style={[styles.emptyTitle, { marginTop: Spacing.lg }]}>
            No Follow-Ups
          </ThemedText>
          <ThemedText
            style={[styles.emptyText, { color: theme.secondaryText }]}
          >
            Notes marked for follow-up will appear here. Add notes to officials
            and flag them for follow-up to track your action items.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={followUps}
          keyExtractor={(item) => `${item.source}-${item.districtNumber}`}
          renderItem={renderFollowUpCard}
          contentContainerStyle={[
            styles.listContent,
            { 
              paddingTop: headerHeight + Spacing.sm,
              paddingBottom: insets.bottom + Spacing.xl,
            },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  card: {
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  officialInfo: {
    flex: 1,
  },
  sourceLabel: {
    ...Typography.body,
    fontWeight: "600" as const,
  },
  entryCount: {
    ...Typography.caption,
    opacity: 0.7,
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  badgeText: {
    ...Typography.small,
    fontWeight: "500" as const,
  },
  notePreview: {
    marginTop: Spacing.xs,
  },
  noteText: {
    ...Typography.caption,
    lineHeight: 20,
  },
  dateText: {
    ...Typography.small,
    marginTop: Spacing.xs,
  },
  cardFooter: {
    alignItems: "flex-end",
    marginTop: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.h3,
  },
  emptyText: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
