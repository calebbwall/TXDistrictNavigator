import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PrayerStackParamList } from "@/navigation/PrayerStackNavigator";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl, apiRequest } from "@/lib/query-client";

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

const STATUS_TABS = [
  { key: "OPEN", label: "Active" },
  { key: "ANSWERED", label: "Answered" },
  { key: "ARCHIVED", label: "Archive" },
] as const;

export default function PrayerListScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<PrayerStackParamList>>();
  const route = useRoute();
  const queryClient = useQueryClient();

  const routeParams = route.params as { status?: string; officialId?: string; officialName?: string } | undefined;
  const initialStatus = routeParams?.status || "OPEN";
  const officialId = routeParams?.officialId;
  const officialName = routeParams?.officialName;

  const [activeTab, setActiveTab] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDailyPicks, setShowDailyPicks] = useState(false);

  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 0; }

  const queryParams = new URLSearchParams();
  queryParams.set("status", activeTab);
  if (searchQuery.trim()) queryParams.set("q", searchQuery.trim());
  if (officialId) queryParams.set("officialId", officialId);

  const { data: prayersList = [], isLoading, refetch } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers", `?${queryParams.toString()}`],
  });

  const { data: dailyPicks, isLoading: dailyLoading } = useQuery<DailyPicksResponse>({
    queryKey: ["/api/daily-prayer-picks"],
    enabled: showDailyPicks,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const answerMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/prayers/${id}/answer`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/prayers/${id}/reopen`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/prayers/${id}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/prayers/${id}/unarchive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/prayers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const handleAction = (prayer: Prayer) => {
    const actions: { text: string; onPress: () => void; style?: "cancel" | "destructive" }[] = [];

    if (prayer.status === "OPEN") {
      actions.push({ text: "Mark Answered", onPress: () => answerMutation.mutate(prayer.id) });
      actions.push({ text: "Archive", onPress: () => archiveMutation.mutate(prayer.id) });
    } else if (prayer.status === "ANSWERED") {
      actions.push({ text: "Reopen", onPress: () => reopenMutation.mutate(prayer.id) });
      actions.push({ text: "Archive", onPress: () => archiveMutation.mutate(prayer.id) });
    } else if (prayer.status === "ARCHIVED") {
      actions.push({ text: "Reopen", onPress: () => unarchiveMutation.mutate(prayer.id) });
    }
    actions.push({ text: "Delete", style: "destructive", onPress: () => {
      Alert.alert("Delete Prayer", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(prayer.id) },
      ]);
    }});
    actions.push({ text: "Cancel", style: "cancel", onPress: () => {} });

    Alert.alert("Prayer Actions", prayer.title, actions);
  };

  const renderPrayerItem = ({ item }: { item: Prayer }) => (
    <Card elevation={1} style={styles.prayerCard} onPress={() => navigation.navigate("PrayerDetail", { prayerId: item.id })}>
      <View style={styles.prayerHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            {item.pinnedDaily ? (
              <Feather name="star" size={14} color={theme.warning} style={{ marginRight: Spacing.xs }} />
            ) : null}
            {item.priority === 1 ? (
              <Feather name="alert-circle" size={14} color={theme.secondary} style={{ marginRight: Spacing.xs }} />
            ) : null}
            <ThemedText type="body" style={{ fontWeight: "600", flex: 1 }} numberOfLines={1}>
              {item.title}
            </ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }} numberOfLines={2}>
            {item.body}
          </ThemedText>
        </View>
        <Pressable onPress={() => handleAction(item)} hitSlop={8} style={{ padding: Spacing.xs }}>
          <Feather name="more-vertical" size={20} color={theme.secondaryText} />
        </Pressable>
      </View>
      <View style={styles.prayerFooter}>
        <ThemedText type="caption" style={{ color: theme.secondaryText }}>
          {formatDate(item.createdAt)}
        </ThemedText>
        {item.status === "ANSWERED" && item.answeredAt ? (
          <ThemedText type="caption" style={{ color: theme.success }}>
            Answered {formatDate(item.answeredAt)}
          </ThemedText>
        ) : null}
        {item.officialIds && item.officialIds.length > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.primary + "20" }]}>
            <ThemedText type="caption" style={{ color: theme.primary }}>
              {item.officialIds.length} {item.officialIds.length === 1 ? "official" : "officials"}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Card>
  );

  const renderDailyPicks = () => {
    if (!showDailyPicks) return null;
    return (
      <View style={[styles.dailyPicksContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={styles.dailyPicksHeader}>
          <ThemedText type="h3">Today's Prayers</ThemedText>
          <Pressable onPress={() => setShowDailyPicks(false)} hitSlop={8}>
            <Feather name="x" size={20} color={theme.secondaryText} />
          </Pressable>
        </View>
        {dailyLoading ? (
          <ActivityIndicator style={{ padding: Spacing.lg }} />
        ) : dailyPicks && dailyPicks.prayers.length > 0 ? (
          dailyPicks.prayers.map((p) => (
            <Pressable key={p.id} style={[styles.dailyPickItem, { borderColor: theme.border }]} onPress={() => navigation.navigate("PrayerDetail", { prayerId: p.id })}>
              <ThemedText type="body" style={{ fontWeight: "500" }} numberOfLines={1}>{p.title}</ThemedText>
              <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }} numberOfLines={1}>{p.body}</ThemedText>
            </Pressable>
          ))
        ) : (
          <ThemedText type="small" style={{ color: theme.secondaryText, padding: Spacing.md }}>
            No active prayers for today's picks. Add some prayers first.
          </ThemedText>
        )}
      </View>
    );
  };

  const title = officialName ? `Prayers - ${officialName}` : "Prayers";

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={{ paddingTop: headerHeight + Spacing.sm, paddingHorizontal: Spacing.md }}>
        {officialName ? (
          <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
            Showing prayers for {officialName}
          </ThemedText>
        ) : null}

        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
            <Feather name="search" size={16} color={theme.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search prayers..."
              placeholderTextColor={theme.secondaryText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Feather name="x-circle" size={16} color={theme.secondaryText} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={[styles.dailyPicksBtn, { backgroundColor: showDailyPicks ? theme.primary : theme.inputBackground, borderColor: theme.border }]}
            onPress={() => setShowDailyPicks(!showDailyPicks)}
          >
            <Feather name="sun" size={18} color={showDailyPicks ? theme.buttonText : theme.text} />
          </Pressable>
        </View>

        {officialId ? null : (
          <View style={styles.tabRow}>
            {STATUS_TABS.map(tab => (
              <Pressable
                key={tab.key}
                style={[
                  styles.tab,
                  {
                    backgroundColor: activeTab === tab.key ? theme.primary : "transparent",
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setActiveTab(tab.key)}
              >
                <ThemedText
                  type="caption"
                  style={{
                    color: activeTab === tab.key ? theme.buttonText : theme.text,
                    fontWeight: activeTab === tab.key ? "600" : "400",
                  }}
                >
                  {tab.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        {renderDailyPicks()}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={prayersList}
          keyExtractor={(item) => item.id}
          renderItem={renderPrayerItem}
          contentContainerStyle={{
            paddingHorizontal: Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl + 60,
            paddingTop: Spacing.sm,
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="heart" size={48} color={theme.secondaryText} />
              <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.md, textAlign: "center" }}>
                {activeTab === "OPEN" ? "No active prayers yet.\nTap + to add your first prayer." :
                 activeTab === "ANSWERED" ? "No answered prayers yet." :
                 "No archived prayers."}
              </ThemedText>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => refetch()} />
          }
        />
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: theme.primary, bottom: tabBarHeight + Spacing.lg }]}
        onPress={() => navigation.navigate("AddPrayer", officialId ? { officialId, officialName } : undefined)}
      >
        <Feather name="plus" size={24} color={theme.buttonText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 40,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  dailyPicksBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tabRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  prayerCard: { marginBottom: Spacing.sm, padding: Spacing.md },
  prayerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center" },
  prayerFooter: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.sm },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  emptyContainer: { alignItems: "center", paddingTop: 80 },
  dailyPicksContainer: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  dailyPicksHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  dailyPickItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
});
