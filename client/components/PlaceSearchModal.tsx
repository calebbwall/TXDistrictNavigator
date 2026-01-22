import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import AppIcon from "@/components/AppIcon";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";
import { getRecentPlaces, addRecentPlace, RecentPlaceEntry } from "@/lib/storage";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";

export interface PlaceCandidate {
  name: string;
  lat: number;
  lng: number;
  county?: string;
  population?: number;
  geonameId?: number;
  postalCode?: string;
}

interface PlaceSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlace: (place: PlaceCandidate) => void;
}

export function PlaceSearchModal({
  visible,
  onClose,
  onSelectPlace,
}: PlaceSearchModalProps) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [recentPlaces, setRecentPlaces] = useState<RecentPlaceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (visible) {
      loadRecentPlaces();
      setQuery("");
      setCandidates([]);
      setError(null);
      setHasSearched(false);
    }
  }, [visible]);

  const loadRecentPlaces = useCallback(async () => {
    const recents = await getRecentPlaces();
    setRecentPlaces(recents);
  }, []);

  const searchPlaces = useCallback(async () => {
    if (query.trim().length < 2) {
      setError("Enter at least 2 characters");
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);
    Keyboard.dismiss();

    try {
      const url = new URL("/api/lookup/place/candidates", getApiUrl());
      url.searchParams.set("q", query.trim());
      url.searchParams.set("max", "8");

      const response = await fetch(url.toString());
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Search failed");
        setCandidates([]);
        return;
      }

      setCandidates(data.results || []);
      if (data.results?.length === 0) {
        setError("No Texas places found");
      }
    } catch (err) {
      setError("Network error - please try again");
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleSelectPlace = useCallback(
    async (place: PlaceCandidate) => {
      await addRecentPlace({
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        county: place.county,
      });
      onSelectPlace(place);
      onClose();
    },
    [onSelectPlace, onClose]
  );

  const handleSelectRecent = useCallback(
    (recent: RecentPlaceEntry) => {
      const place: PlaceCandidate = {
        name: recent.name,
        lat: recent.lat,
        lng: recent.lng,
        county: recent.county,
      };
      onSelectPlace(place);
      onClose();
    },
    [onSelectPlace, onClose]
  );

  const renderPlaceItem = useCallback(
    ({ item }: { item: PlaceCandidate }) => (
      <Pressable
        onPress={() => handleSelectPlace(item)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card style={styles.placeCard}>
          <View style={styles.placeInfo}>
            <ThemedText style={styles.placeName}>{item.name}</ThemedText>
            {item.county ? (
              <ThemedText style={[styles.placeDetail, { color: theme.secondaryText }]}>
                {item.county} County
              </ThemedText>
            ) : null}
            {item.population ? (
              <ThemedText style={[styles.placeDetail, { color: theme.secondaryText }]}>
                Pop. {item.population.toLocaleString()}
              </ThemedText>
            ) : null}
          </View>
          <AppIcon name="chevron-right" size={20} color={theme.secondaryText} />
        </Card>
      </Pressable>
    ),
    [theme, handleSelectPlace]
  );

  const renderRecentItem = useCallback(
    ({ item }: { item: RecentPlaceEntry }) => (
      <Pressable
        onPress={() => handleSelectRecent(item)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card style={styles.placeCard}>
          <View style={styles.placeInfo}>
            <View style={styles.recentRow}>
              <AppIcon name="clock" size={14} color={theme.secondaryText} />
              <ThemedText style={styles.placeName}>{item.name}</ThemedText>
            </View>
            {item.county ? (
              <ThemedText style={[styles.placeDetail, { color: theme.secondaryText }]}>
                {item.county} County
              </ThemedText>
            ) : null}
          </View>
          <AppIcon name="chevron-right" size={20} color={theme.secondaryText} />
        </Card>
      </Pressable>
    ),
    [theme, handleSelectRecent]
  );

  const showRecents = !hasSearched && recentPlaces.length > 0;
  const showCandidates = hasSearched && candidates.length > 0;
  const showEmpty = hasSearched && candidates.length === 0 && !loading && !error;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Search Texas Place</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}>
            <AppIcon name="x" size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <View style={[styles.searchInput, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
            <AppIcon name="search" size={18} color={theme.secondaryText} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="City name or ZIP code..."
              placeholderTextColor={theme.secondaryText}
              style={[styles.input, { color: theme.text }]}
              returnKeyType="search"
              onSubmitEditing={searchPlaces}
              autoFocus
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <AppIcon name="x-circle" size={18} color={theme.secondaryText} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={searchPlaces}
            disabled={loading}
            style={[styles.searchButton, { backgroundColor: theme.primary, opacity: loading ? 0.6 : 1 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <AppIcon name="search" size={20} color="#FFFFFF" />
            )}
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <AppIcon name="alert-circle" size={20} color={theme.secondary} />
            <ThemedText style={[styles.errorText, { color: theme.secondary }]}>
              {error}
            </ThemedText>
          </View>
        ) : null}

        {showRecents ? (
          <View style={styles.listContainer}>
            <ThemedText style={[styles.sectionTitle, { color: theme.secondaryText }]}>
              Recent Searches
            </ThemedText>
            <FlatList
              data={recentPlaces}
              keyExtractor={(item, i) => `${item.lat}-${item.lng}-${i}`}
              renderItem={renderRecentItem}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
            />
          </View>
        ) : null}

        {showCandidates ? (
          <View style={styles.listContainer}>
            <ThemedText style={[styles.sectionTitle, { color: theme.secondaryText }]}>
              Select a Place ({candidates.length} found)
            </ThemedText>
            <FlatList
              data={candidates}
              keyExtractor={(item, i) => `${item.geonameId || item.postalCode}-${i}`}
              renderItem={renderPlaceItem}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
            />
          </View>
        ) : null}

        {showEmpty ? (
          <View style={styles.emptyContainer}>
            <AppIcon name="map-pin" size={40} color={theme.secondaryText} />
            <ThemedText style={[styles.emptyText, { color: theme.secondaryText }]}>
              No places found for "{query}"
            </ThemedText>
          </View>
        ) : null}

        {!hasSearched && recentPlaces.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AppIcon name="map" size={40} color={theme.secondaryText} />
            <ThemedText style={[styles.emptyText, { color: theme.secondaryText }]}>
              Enter a Texas city name or ZIP code to search
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h2,
  },
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  errorText: {
    ...Typography.caption,
  },
  listContainer: {
    flex: 1,
  },
  sectionTitle: {
    ...Typography.caption,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  placeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  placeInfo: {
    flex: 1,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  placeName: {
    ...Typography.body,
    fontWeight: "500" as const,
  },
  placeDetail: {
    ...Typography.small,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: Spacing.md,
  },
});
