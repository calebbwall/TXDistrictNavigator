import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
  Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { OfficialCard } from "@/components/OfficialCard";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { apiOfficialToLegacy } from "@/lib/officialsAdapter";
import type { Official } from "@/lib/mockData";
import type { SearchStackParamList } from "@/navigation/SearchStackNavigator";

type NavigationProp = NativeStackNavigationProp<SearchStackParamList>;

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE";

const SOURCE_LABELS: Record<SourceType, string> = {
  TX_HOUSE: "TX House",
  TX_SENATE: "TX Senate",
  US_HOUSE: "US House",
};

const SEARCH_PLACEHOLDERS: Record<SourceType, string> = {
  TX_HOUSE: "Search Texas House...",
  TX_SENATE: "Search Texas Senate...",
  US_HOUSE: "Search US House...",
};

export default function BrowseOfficialsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const [selectedSource, setSelectedSource] = useState<SourceType>("TX_HOUSE");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 250);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchText]);

  const queryKey = useMemo(
    () => ["/api/officials", selectedSource, debouncedSearch],
    [selectedSource, debouncedSearch]
  );

  const { data, isLoading, isFetching, refetch } = useQuery<{
    officials: any[];
    count: number;
    vacancyCount?: number;
  }>({
    queryKey,
    queryFn: async () => {
      const url = new URL("/api/officials", getApiUrl());
      url.searchParams.set("source", selectedSource);
      if (debouncedSearch.trim()) {
        url.searchParams.set("q", debouncedSearch.trim());
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error("Failed to fetch officials");
      }
      return response.json();
    },
    placeholderData: (prev) => prev,
  });

  const officials: Official[] = useMemo(() => {
    if (!data?.officials) return [];
    return data.officials.map(apiOfficialToLegacy);
  }, [data]);

  const handleSourceChange = useCallback((source: SourceType) => {
    setSelectedSource(source);
    setSearchText("");
    setDebouncedSearch("");
  }, []);

  const handleOfficialPress = useCallback(
    (official: Official) => {
      navigation.navigate("OfficialProfile", { officialId: official.id });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: Official }) => (
      <View style={styles.listItem}>
        <OfficialCard official={item} onPress={() => handleOfficialPress(item)} />
      </View>
    ),
    [handleOfficialPress]
  );

  const keyExtractor = useCallback((item: Official) => item.id, []);

  const countLabel = useMemo(() => {
    if (isLoading && !data) return "Loading...";
    const count = officials.length;
    const vacancyCount = officials.filter(o => o.isVacant).length;
    
    const vacancyText = vacancyCount > 0 
      ? ` (${vacancyCount} ${vacancyCount === 1 ? "vacancy" : "vacancies"})`
      : "";
    
    if (debouncedSearch.trim()) {
      return `${count} result${count !== 1 ? "s" : ""}${vacancyText}`;
    }
    return `${count} member${count !== 1 ? "s" : ""}${vacancyText}`;
  }, [isLoading, data, officials, debouncedSearch]);

  const ListEmptyComponent = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Image
          source={require("../../assets/images/empty-search.png")}
          style={styles.emptyImage}
          resizeMode="contain"
        />
        <ThemedText
          type="body"
          style={{ color: theme.secondaryText, textAlign: "center" }}
        >
          {debouncedSearch.trim() ? "No results found" : "No members found"}
        </ThemedText>
      </View>
    );
  }, [isLoading, theme, debouncedSearch]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: headerHeight + Spacing.md,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        <View style={styles.segmentedControl}>
          {(["TX_HOUSE", "TX_SENATE", "US_HOUSE"] as SourceType[]).map((source) => (
            <Pressable
              key={source}
              style={[
                styles.segmentButton,
                {
                  backgroundColor:
                    selectedSource === source
                      ? theme.primary
                      : theme.inputBackground,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => handleSourceChange(source)}
            >
              <ThemedText
                type="caption"
                style={{
                  color: selectedSource === source ? "#FFFFFF" : theme.text,
                  fontWeight: selectedSource === source ? "600" : "400",
                }}
              >
                {SOURCE_LABELS[source]}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <ThemedText
          type="caption"
          style={[styles.countLabel, { color: theme.secondaryText }]}
        >
          {countLabel}
        </ThemedText>

        <View
          style={[
            styles.searchInputContainer,
            { backgroundColor: theme.inputBackground, borderColor: theme.border },
          ]}
        >
          <Feather name="search" size={18} color={theme.secondaryText} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={SEARCH_PLACEHOLDERS[selectedSource]}
            placeholderTextColor={theme.secondaryText}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
          />
          {searchText.length > 0 ? (
            <Pressable onPress={() => setSearchText("")}>
              <Feather name="x" size={18} color={theme.secondaryText} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={officials}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        ListEmptyComponent={ListEmptyComponent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  segmentedControl: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  countLabel: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  listItem: {
    marginBottom: Spacing.sm,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
  },
  emptyImage: {
    width: 120,
    height: 120,
    marginBottom: Spacing.md,
    opacity: 0.7,
  },
});
