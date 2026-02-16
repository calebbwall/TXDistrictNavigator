import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Linking,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PrayerStackParamList } from "@/navigation/PrayerStackNavigator";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import * as WebBrowser from "expo-web-browser";

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

type PrayerCategory = {
  id: string;
  name: string;
};

const STATUS_TABS = [
  { key: "OPEN", label: "Active" },
  { key: "ANSWERED", label: "Answered" },
  { key: "ARCHIVED", label: "Archive" },
  { key: "ALL", label: "All" },
] as const;

const SORT_OPTIONS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "needsAttention", label: "Needs Attention" },
  { key: "recentlyAnswered", label: "Recently Answered" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["key"];

export default function PrayerListScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<PrayerStackParamList>>();
  const route = useRoute();
  const queryClient = useQueryClient();

  const routeParams = route.params as
    | { status?: string; officialId?: string; officialName?: string; categoryId?: string }
    | undefined;
  const initialStatus = routeParams?.status || "OPEN";
  const officialId = routeParams?.officialId;
  const officialName = routeParams?.officialName;
  const initialCategoryId = routeParams?.categoryId;

  const [activeTab, setActiveTab] = useState(initialStatus);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    initialCategoryId || null
  );
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0;
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", gap: Spacing.sm }}>
          <Pressable onPress={handleExport} hitSlop={8} style={{ padding: Spacing.xs }}>
            <Feather name="download" size={20} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              if (selectMode) {
                setSelectMode(false);
                setSelectedIds(new Set());
              } else {
                setSelectMode(true);
              }
            }}
            hitSlop={8}
            style={{ padding: Spacing.xs }}
          >
            <Feather name={selectMode ? "x" : "check-square"} size={20} color={theme.text} />
          </Pressable>
        </View>
      ),
    });
  }, [selectMode, theme.text]);

  const queryParams = new URLSearchParams();
  if (activeTab !== "ALL") queryParams.set("status", activeTab);
  if (debouncedSearch) queryParams.set("q", debouncedSearch);
  if (officialId) queryParams.set("officialId", officialId);
  if (selectedCategoryId === "UNCATEGORIZED") {
    queryParams.set("categoryId", "uncategorized");
  } else if (selectedCategoryId) {
    queryParams.set("categoryId", selectedCategoryId);
  }
  if (sortKey === "needsAttention") queryParams.set("sort", "needsAttention");

  const { data: rawPrayers = [], isLoading, refetch } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers", `?${queryParams.toString()}`],
  });

  const prayers = useMemo(() => {
    const list = [...rawPrayers];
    if (sortKey === "oldest") {
      list.reverse();
    } else if (sortKey === "recentlyAnswered") {
      list.sort((a, b) => {
        if (!a.answeredAt && !b.answeredAt) return 0;
        if (!a.answeredAt) return 1;
        if (!b.answeredAt) return -1;
        return new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime();
      });
    }
    return list;
  }, [rawPrayers, sortKey]);

  const { data: categories = [] } = useQuery<PrayerCategory[]>({
    queryKey: ["/api/prayer-categories"],
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const bulkMutation = useMutation({
    mutationFn: async ({ action, prayerIds }: { action: string; prayerIds: string[] }) => {
      await apiRequest("POST", "/api/prayers/bulk", { action, prayerIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
      setSelectMode(false);
      setSelectedIds(new Set());
    },
  });

  const handleExport = useCallback(() => {
    Alert.alert("Export Prayers", "Choose which prayers to export:", [
      {
        text: "Active",
        onPress: () => openExport("OPEN"),
      },
      {
        text: "Answered",
        onPress: () => openExport("ANSWERED"),
      },
      {
        text: "Archived",
        onPress: () => openExport("ARCHIVED"),
      },
      {
        text: "All",
        onPress: () => openExport(""),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);

  const openExport = useCallback(async (status: string) => {
    try {
      const base = getApiUrl();
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const url = `${base}/api/prayers/export?${params.toString()}`;
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert("Error", "Could not open export.");
    }
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkAction = useCallback(
    (action: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      bulkMutation.mutate({ action, prayerIds: ids });
    },
    [selectedIds, bulkMutation]
  );

  const cycleSortKey = useCallback(() => {
    setSortKey((prev) => {
      const idx = SORT_OPTIONS.findIndex((o) => o.key === prev);
      return SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length].key;
    });
  }, []);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label || "Newest";

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN":
        return theme.primary;
      case "ANSWERED":
        return theme.success;
      case "ARCHIVED":
        return theme.secondaryText;
      default:
        return theme.secondaryText;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "OPEN":
        return "Active";
      case "ANSWERED":
        return "Answered";
      case "ARCHIVED":
        return "Archived";
      default:
        return status;
    }
  };

  const renderPrayerItem = ({ item }: { item: Prayer }) => (
    <Card
      elevation={1}
      style={styles.prayerCard}
      onPress={() => {
        if (selectMode) {
          toggleSelect(item.id);
        } else {
          navigation.navigate("PrayerDetail", { prayerId: item.id });
        }
      }}
    >
      <View style={styles.prayerRow}>
        {selectMode ? (
          <Pressable
            onPress={() => toggleSelect(item.id)}
            style={styles.checkbox}
            hitSlop={8}
          >
            <Feather
              name={selectedIds.has(item.id) ? "check-square" : "square"}
              size={20}
              color={selectedIds.has(item.id) ? theme.primary : theme.secondaryText}
            />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            {item.pinnedDaily ? (
              <Feather
                name="star"
                size={14}
                color={theme.warning}
                style={{ marginRight: Spacing.xs }}
              />
            ) : null}
            {item.priority === 1 ? (
              <Feather
                name="alert-circle"
                size={14}
                color={theme.secondary}
                style={{ marginRight: Spacing.xs }}
              />
            ) : null}
            <ThemedText
              type="body"
              style={{ fontWeight: "700", flex: 1 }}
              numberOfLines={1}
            >
              {item.title}
            </ThemedText>
            {activeTab === "ALL" ? (
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: getStatusColor(item.status) + "20" },
                ]}
              >
                <ThemedText
                  type="small"
                  style={{ color: getStatusColor(item.status), fontWeight: "600" }}
                >
                  {getStatusLabel(item.status)}
                </ThemedText>
              </View>
            ) : null}
          </View>
          <ThemedText
            type="small"
            style={{ color: theme.secondaryText, marginTop: 2 }}
            numberOfLines={2}
          >
            {item.body}
          </ThemedText>
          <View style={styles.prayerFooter}>
            <ThemedText type="caption" style={{ color: theme.secondaryText }}>
              {formatDate(item.createdAt)}
            </ThemedText>
          </View>
        </View>
      </View>
    </Card>
  );

  const renderBulkBar = () => {
    if (!selectMode) return null;
    const count = selectedIds.size;

    const actions: { label: string; action: string }[] = [];
    if (activeTab === "OPEN" || activeTab === "ALL") {
      actions.push({ label: "Mark Answered", action: "answer" });
      actions.push({ label: "Archive", action: "archive" });
    }
    if (activeTab === "ANSWERED" || activeTab === "ALL") {
      actions.push({ label: "Reopen", action: "reopen" });
      if (activeTab === "ANSWERED") {
        actions.push({ label: "Archive", action: "archive" });
      }
    }
    if (activeTab === "ARCHIVED") {
      actions.push({ label: "Unarchive", action: "unarchive" });
      actions.push({ label: "Reopen", action: "reopen" });
    }

    return (
      <View
        style={[
          styles.bulkBar,
          {
            backgroundColor: theme.backgroundDefault,
            borderTopColor: theme.border,
            paddingBottom: tabBarHeight > 0 ? tabBarHeight : Spacing.lg,
          },
        ]}
      >
        <ThemedText type="caption" style={{ color: theme.secondaryText }}>
          {count} selected
        </ThemedText>
        <View style={styles.bulkActions}>
          {actions.map((a) => (
            <Pressable
              key={a.action}
              style={[styles.bulkButton, { backgroundColor: theme.primary }]}
              onPress={() => handleBulkAction(a.action)}
              disabled={count === 0}
            >
              <ThemedText type="small" style={{ color: theme.buttonText, fontWeight: "600" }}>
                {a.label}
              </ThemedText>
            </Pressable>
          ))}
          <Pressable
            style={[styles.bulkButton, { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => {
              setSelectMode(false);
              setSelectedIds(new Set());
            }}
          >
            <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={{ paddingTop: headerHeight + Spacing.sm, paddingHorizontal: Spacing.md }}>
        {officialName ? (
          <ThemedText
            type="caption"
            style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}
          >
            Showing prayers for {officialName}
          </ThemedText>
        ) : null}

        {officialId ? null : (
          <View style={styles.tabRow}>
            {STATUS_TABS.map((tab) => (
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryRow}
          contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.md }}
        >
          <Pressable
            style={[
              styles.categoryChip,
              {
                backgroundColor: selectedCategoryId === null ? theme.primary : "transparent",
                borderColor: theme.border,
              },
            ]}
            onPress={() => setSelectedCategoryId(null)}
          >
            <ThemedText
              type="small"
              style={{
                color: selectedCategoryId === null ? theme.buttonText : theme.text,
                fontWeight: selectedCategoryId === null ? "600" : "400",
              }}
            >
              All
            </ThemedText>
          </Pressable>
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              style={[
                styles.categoryChip,
                {
                  backgroundColor:
                    selectedCategoryId === cat.id ? theme.primary : "transparent",
                  borderColor: theme.border,
                },
              ]}
              onPress={() => setSelectedCategoryId(cat.id)}
            >
              <ThemedText
                type="small"
                style={{
                  color: selectedCategoryId === cat.id ? theme.buttonText : theme.text,
                  fontWeight: selectedCategoryId === cat.id ? "600" : "400",
                }}
              >
                {cat.name}
              </ThemedText>
            </Pressable>
          ))}
          <Pressable
            style={[
              styles.categoryChip,
              {
                backgroundColor:
                  selectedCategoryId === "UNCATEGORIZED" ? theme.primary : "transparent",
                borderColor: theme.border,
              },
            ]}
            onPress={() => setSelectedCategoryId("UNCATEGORIZED")}
          >
            <ThemedText
              type="small"
              style={{
                color:
                  selectedCategoryId === "UNCATEGORIZED" ? theme.buttonText : theme.text,
                fontWeight: selectedCategoryId === "UNCATEGORIZED" ? "600" : "400",
              }}
            >
              Uncategorized
            </ThemedText>
          </Pressable>
        </ScrollView>

        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: theme.inputBackground, borderColor: theme.border },
            ]}
          >
            <Feather name="search" size={16} color={theme.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search prayers..."
              placeholderTextColor={theme.secondaryText}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.length > 0 ? (
              <Pressable onPress={() => setSearchText("")} hitSlop={8}>
                <Feather name="x-circle" size={16} color={theme.secondaryText} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={[
              styles.sortButton,
              { backgroundColor: theme.inputBackground, borderColor: theme.border },
            ]}
            onPress={cycleSortKey}
          >
            <Feather name="sliders" size={14} color={theme.text} />
            <ThemedText type="small" style={{ color: theme.text, marginLeft: 4 }}>
              {currentSortLabel}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={prayers}
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
              <ThemedText
                type="body"
                style={{
                  color: theme.secondaryText,
                  marginTop: Spacing.md,
                  textAlign: "center",
                }}
              >
                {activeTab === "OPEN"
                  ? "No active prayers yet.\nTap + to add your first prayer."
                  : activeTab === "ANSWERED"
                    ? "No answered prayers yet."
                    : activeTab === "ARCHIVED"
                      ? "No archived prayers."
                      : "No prayers found."}
              </ThemedText>
            </View>
          }
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
        />
      )}

      {renderBulkBar()}

      {selectMode ? null : (
        <Pressable
          style={[
            styles.fab,
            { backgroundColor: theme.primary, bottom: tabBarHeight + Spacing.lg },
          ]}
          onPress={() =>
            navigation.navigate(
              "AddPrayer",
              officialId ? { officialId, officialName } : undefined
            )
          }
        >
          <Feather name="plus" size={24} color={theme.buttonText} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  categoryRow: {
    marginBottom: Spacing.sm,
    maxHeight: 36,
  },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  searchRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
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
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    height: 40,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  prayerCard: { marginBottom: Spacing.sm, padding: Spacing.md },
  prayerRow: { flexDirection: "row", alignItems: "flex-start" },
  titleRow: { flexDirection: "row", alignItems: "center" },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.sm,
  },
  prayerFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  checkbox: { marginRight: Spacing.sm, paddingTop: 2 },
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
  bulkBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bulkActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  bulkButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
});
