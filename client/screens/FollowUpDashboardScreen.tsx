import React, { useCallback, useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
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
import { getAllFollowUps, archiveFollowUp, unarchiveFollowUp, NotePrayerEntry, getCachedOfficials, type OfficialsCacheData } from "@/lib/storage";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import type { Official } from "@/lib/officials";

interface FollowUpItem {
  source: string;
  districtNumber: number;
  entries: NotePrayerEntry[];
  officialName?: string;
  isVacant?: boolean;
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
  const [showArchived, setShowArchived] = useState(false);
  const [officialsCache, setOfficialsCache] = useState<OfficialsCacheData | null>(null);

  useEffect(() => {
    getCachedOfficials("ALL").then(setOfficialsCache);
  }, []);

  const loadFollowUps = useCallback(async () => {
    try {
      const data = await getAllFollowUps(showArchived);
      const enriched = data.map(item => {
        const official = officialsCache?.officials?.find(
          (o: Official) => o.source === item.source && o.districtNumber === item.districtNumber
        );
        return {
          ...item,
          officialName: official?.fullName || undefined,
          isVacant: official?.isVacant || !official,
        };
      });
      const sorted = enriched.sort((a, b) => {
        const latestA = Math.max(...a.entries.map(e => new Date(e.createdAt).getTime()));
        const latestB = Math.max(...b.entries.map(e => new Date(e.createdAt).getTime()));
        return latestB - latestA;
      });
      setFollowUps(sorted);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showArchived, officialsCache]);

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
        initialSection: "privateNotes",
      });
    },
    [navigation]
  );

  const handleArchive = useCallback(
    async (item: FollowUpItem, entryId: string) => {
      const actionText = showArchived ? "restore" : "archive";
      Alert.alert(
        showArchived ? "Restore Follow-Up" : "Archive Follow-Up",
        showArchived 
          ? "Restore this follow-up to your active list?" 
          : "Mark this follow-up as no longer needed?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: showArchived ? "Restore" : "Archive",
            onPress: async () => {
              if (showArchived) {
                await unarchiveFollowUp(item.source, item.districtNumber, entryId);
              } else {
                await archiveFollowUp(item.source, item.districtNumber, entryId);
              }
              loadFollowUps();
            },
          },
        ]
      );
    },
    [showArchived, loadFollowUps]
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

      const title = item.isVacant 
        ? "Vacant District" 
        : (item.officialName || `${formatSource(item.source)} District ${item.districtNumber}`);

      return (
        <Pressable
          onPress={() => handleOfficialPress(item)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.officialInfo}>
                <ThemedText style={styles.officialName}>
                  {title}
                </ThemedText>
                <ThemedText style={[styles.districtLabel, { color: theme.secondaryText }]}>
                  {formatSource(item.source)} District {item.districtNumber}
                </ThemedText>
                <ThemedText style={styles.entryCount}>
                  {item.entries.length} follow-up{item.entries.length !== 1 ? "s" : ""}
                </ThemedText>
              </View>
              <View style={[styles.badge, { backgroundColor: showArchived ? theme.success + "20" : theme.warning + "20" }]}>
                <Feather 
                  name={showArchived ? "check-circle" : "flag"} 
                  size={12} 
                  color={showArchived ? theme.success : theme.warning} 
                />
                <ThemedText style={[styles.badgeText, { color: showArchived ? theme.success : theme.warning }]}>
                  {showArchived ? "Resolved" : "Follow Up"}
                </ThemedText>
              </View>
            </View>
            <View style={styles.notePreview}>
              <ThemedText style={styles.noteText} numberOfLines={2}>
                {latestEntry.text}
              </ThemedText>
              <ThemedText style={[styles.dateText, { color: theme.secondaryText }]}>
                {showArchived && latestEntry.followUpArchivedAt 
                  ? `Resolved ${formatDate(latestEntry.followUpArchivedAt)}`
                  : formatDate(latestEntry.createdAt)}
              </ThemedText>
            </View>
            <View style={styles.cardFooter}>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  handleArchive(item, latestEntry.id);
                }}
                style={({ pressed }) => [
                  styles.archiveButton,
                  { 
                    backgroundColor: showArchived ? theme.success + "15" : theme.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather 
                  name={showArchived ? "rotate-ccw" : "check"} 
                  size={14} 
                  color={showArchived ? theme.success : theme.secondaryText} 
                />
                <ThemedText style={[styles.archiveButtonText, { color: showArchived ? theme.success : theme.secondaryText }]}>
                  {showArchived ? "Restore" : "No longer needed"}
                </ThemedText>
              </Pressable>
              <Feather name="chevron-right" size={20} color={theme.secondaryText} />
            </View>
          </Card>
        </Pressable>
      );
    },
    [theme, handleOfficialPress, handleArchive, showArchived]
  );

  const ListHeaderComponent = useMemo(() => (
    <View style={[styles.filterRow, { backgroundColor: theme.backgroundRoot }]}>
      <Pressable
        onPress={() => setShowArchived(false)}
        style={[
          styles.filterButton,
          { 
            backgroundColor: !showArchived ? theme.primary : theme.inputBackground,
            borderColor: theme.border,
          },
        ]}
      >
        <ThemedText
          style={[
            styles.filterButtonText,
            { color: !showArchived ? "#FFFFFF" : theme.text },
          ]}
        >
          Active
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={() => setShowArchived(true)}
        style={[
          styles.filterButton,
          { 
            backgroundColor: showArchived ? theme.primary : theme.inputBackground,
            borderColor: theme.border,
          },
        ]}
      >
        <ThemedText
          style={[
            styles.filterButtonText,
            { color: showArchived ? "#FFFFFF" : theme.text },
          ]}
        >
          Archived
        </ThemedText>
      </Pressable>
    </View>
  ), [showArchived, theme]);

  if (loading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={followUps}
        keyExtractor={(item) => `${item.source}-${item.districtNumber}`}
        renderItem={renderFollowUpCard}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name={showArchived ? "archive" : "flag"} size={48} color={theme.secondaryText} />
            <ThemedText style={[styles.emptyTitle, { marginTop: Spacing.lg }]}>
              {showArchived ? "No Archived Follow-Ups" : "No Follow-Ups"}
            </ThemedText>
            <ThemedText
              style={[styles.emptyText, { color: theme.secondaryText }]}
            >
              {showArchived 
                ? "Follow-ups you've marked as resolved will appear here."
                : "Notes marked for follow-up will appear here. Add notes to officials and flag them for follow-up to track your action items."}
            </ThemedText>
          </View>
        }
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
        stickyHeaderIndices={[0]}
      />
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
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  filterButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  filterButtonText: {
    ...Typography.caption,
    fontWeight: "600" as const,
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
  officialName: {
    ...Typography.body,
    fontWeight: "600" as const,
  },
  districtLabel: {
    ...Typography.caption,
    marginTop: 2,
  },
  entryCount: {
    ...Typography.small,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },
  archiveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  archiveButtonText: {
    ...Typography.small,
    fontWeight: "500" as const,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl * 2,
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
