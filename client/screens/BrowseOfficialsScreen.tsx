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
import { apiOfficialToNormalized } from "@/lib/officialsAdapter";
import type { Official } from "@/lib/officials";
import type { BrowseStackParamList } from "@/navigation/BrowseStackNavigator";

type NavigationProp = NativeStackNavigationProp<BrowseStackParamList>;

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "ALL";

interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  fromCache?: boolean;
}

interface DistrictHit {
  source: "TX_HOUSE" | "TX_SENATE" | "US_HOUSE";
  districtNumber: number;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  TX_HOUSE: "TX House",
  TX_SENATE: "TX Senate",
  US_HOUSE: "US House",
  ALL: "All",
};

const SEARCH_PLACEHOLDERS: Record<SourceType, string> = {
  TX_HOUSE: "Search by name, district, city, ZIP...",
  TX_SENATE: "Search by name, district, city, ZIP...",
  US_HOUSE: "Search by name, district, city, ZIP...",
  ALL: "Search any TX city/ZIP or name...",
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
  const [placeInfo, setPlaceInfo] = useState<{ name: string; districts: DistrictHit[] } | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
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
      setPlaceInfo(null);
      
      if (!debouncedSearch.trim()) {
        const url = new URL("/api/officials", getApiUrl());
        url.searchParams.set("source", selectedSource);
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error("Failed to fetch officials");
        return response.json();
      }

      const query = debouncedSearch.trim();
      console.log(`[Browse] Searching for: "${query}"`);

      try {
        const placeUrl = new URL("/api/lookup/place", getApiUrl());
        placeUrl.searchParams.set("q", query);
        const placeRes = await fetch(placeUrl.toString());

        if (placeRes.ok) {
          const place: PlaceResult = await placeRes.json();
          console.log(`[Browse] Place found: ${place.name} (${place.lat}, ${place.lng}) [cache=${place.fromCache}]`);

          const districtsRes = await fetch(new URL("/api/lookup/districts-at-point", getApiUrl()).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: place.lat, lng: place.lng }),
          });

          if (!districtsRes.ok) {
            console.log("[Browse] Districts lookup failed, falling back to text search");
            throw new Error("Districts lookup failed");
          }

          const { hits } = await districtsRes.json() as { hits: DistrictHit[] };
          console.log(`[Browse] Districts found: ${hits.map(h => `${h.source}:${h.districtNumber}`).join(", ")}`);

          if (hits.length === 0) {
            console.log("[Browse] No districts found at location, falling back to text search");
            throw new Error("No districts found");
          }

          const filteredHits = selectedSource === "ALL" 
            ? hits 
            : hits.filter(h => h.source === selectedSource);

          if (filteredHits.length === 0) {
            setPlaceInfo({ name: place.name, districts: hits });
            return { officials: [], count: 0, vacancyCount: 0 };
          }

          const officialsRes = await fetch(new URL("/api/officials/by-districts", getApiUrl()).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ districts: filteredHits }),
          });

          if (!officialsRes.ok) {
            console.log("[Browse] Officials by-districts failed, falling back to text search");
            throw new Error("Officials lookup failed");
          }

          const officialsData = await officialsRes.json();
          console.log(`[Browse] Found ${officialsData.count} officials for place "${place.name}"`);

          setPlaceInfo({ name: place.name, districts: filteredHits });
          return officialsData;
        }

        console.log(`[Browse] No place found, using text search for "${query}"`);
      } catch (err) {
        console.log(`[Browse] Place lookup error, falling back to text search`);
      }

      const url = new URL("/api/officials", getApiUrl());
      url.searchParams.set("source", selectedSource);
      url.searchParams.set("q", query);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to fetch officials");
      return response.json();
    },
    placeholderData: (prev) => prev,
  });

  const officials: Official[] = useMemo(() => {
    if (!data?.officials) return [];
    return data.officials.map(apiOfficialToNormalized);
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

  const placeLabel = useMemo(() => {
    if (!placeInfo) return null;
    const districtNames = placeInfo.districts.map(d => {
      const chamber = d.source === "TX_HOUSE" ? "House" : d.source === "TX_SENATE" ? "Senate" : "Congress";
      return `${chamber} ${d.districtNumber}`;
    }).join(", ");
    return { name: placeInfo.name, districts: districtNames };
  }, [placeInfo]);

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

  const sources: SourceType[] = ["TX_HOUSE", "TX_SENATE", "US_HOUSE", "ALL"];

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
          {sources.map((source) => (
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

        {placeLabel ? (
          <View style={styles.placeLabelContainer}>
            <Feather name="map-pin" size={14} color={theme.primary} />
            <ThemedText type="caption" style={{ color: theme.primary, fontWeight: "600" }}>
              {placeLabel.name}
            </ThemedText>
            <ThemedText type="caption" style={{ color: theme.secondaryText }}>
              {placeLabel.districts}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.countLabelRow}>
          <ThemedText
            type="caption"
            style={[styles.countLabel, { color: theme.secondaryText }]}
          >
            {countLabel}
          </ThemedText>
          {searchText !== debouncedSearch && searchText.trim().length > 0 ? (
            <View style={styles.searchingIndicator}>
              <ActivityIndicator size="small" color={theme.primary} />
              <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}>
                Searching...
              </ThemedText>
            </View>
          ) : null}
        </View>

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
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={false}
        getItemLayout={(_, index) => ({
          length: 120,
          offset: 120 * index,
          index,
        })}
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
  countLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  countLabel: {
    textAlign: "center",
  },
  searchingIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  placeLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
    flexWrap: "wrap",
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
