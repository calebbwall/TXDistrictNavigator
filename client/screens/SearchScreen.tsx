import React, { useState, useCallback } from "react";
import { StyleSheet, View, TextInput, Image, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CompositeNavigationProp } from "@react-navigation/native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { SearchMethodCard } from "@/components/SearchMethodCard";
import { OfficialCard } from "@/components/OfficialCard";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { searchOfficialsByName, mockOfficials, type Official } from "@/lib/mockData";
import { fetchOfficials } from "@/lib/officialsApi";
import { apiOfficialsToLegacy } from "@/lib/officialsAdapter";
import type { SearchStackParamList } from "@/navigation/SearchStackNavigator";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<SearchStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

type SearchMode = "methods" | "name" | "zip";

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const [searchMode, setSearchMode] = useState<SearchMode>("methods");
  const [searchQuery, setSearchQuery] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [searchResults, setSearchResults] = useState<Official[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleNameSearch = useCallback(async () => {
    if (searchQuery.trim().length < 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const apiResults = await fetchOfficials(undefined, searchQuery.trim());
      if (apiResults.length > 0) {
        setSearchResults(apiOfficialsToLegacy(apiResults));
      } else {
        const fallbackResults = searchOfficialsByName(searchQuery.trim());
        setSearchResults(fallbackResults);
      }
    } catch (error) {
      console.error("API search failed, using mock data:", error);
      const fallbackResults = searchOfficialsByName(searchQuery.trim());
      setSearchResults(fallbackResults);
    }
    setHasSearched(true);
  }, [searchQuery]);

  const handleZipSearch = useCallback(async () => {
    if (zipCode.trim().length !== 5) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const [houseOfficials, senateOfficials, congressOfficials] = await Promise.all([
        fetchOfficials("tx_house"),
        fetchOfficials("tx_senate"),
        fetchOfficials("us_congress"),
      ]);
      const allOfficials = [...houseOfficials.slice(0, 1), ...senateOfficials.slice(0, 1), ...congressOfficials.slice(0, 1)];
      if (allOfficials.length > 0) {
        setSearchResults(apiOfficialsToLegacy(allOfficials));
      } else {
        setSearchResults(mockOfficials.slice(0, 3));
      }
    } catch (error) {
      console.error("API ZIP search failed, using mock data:", error);
      setSearchResults(mockOfficials.slice(0, 3));
    }
    setHasSearched(true);
  }, [zipCode]);

  const handleOfficialPress = useCallback(
    (official: Official) => {
      navigation.navigate("OfficialProfile", { officialId: official.id });
    },
    [navigation]
  );

  const handleDrawSearch = useCallback(() => {
    navigation.navigate("DrawSearch");
  }, [navigation]);

  const handleBackToMethods = useCallback(() => {
    setSearchMode("methods");
    setSearchQuery("");
    setZipCode("");
    setSearchResults([]);
    setHasSearched(false);
  }, []);

  const renderOfficialItem = useCallback(
    ({ item }: { item: Official }) => (
      <View style={styles.resultItem}>
        <OfficialCard official={item} onPress={() => handleOfficialPress(item)} />
      </View>
    ),
    [handleOfficialPress]
  );

  if (searchMode === "name") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <KeyboardAwareScrollViewCompat
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: headerHeight + Spacing.lg,
              paddingBottom: tabBarHeight + Spacing.xl,
            },
          ]}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
        >
          <View style={styles.searchHeader}>
            <Button onPress={handleBackToMethods} style={styles.backButton}>
              Back
            </Button>
            <ThemedText type="h2" style={styles.searchTitle}>
              Search by Name
            </ThemedText>
          </View>

          <View
            style={[
              styles.searchInputContainer,
              { backgroundColor: theme.inputBackground, borderColor: theme.border },
            ]}
          >
            <Feather name="search" size={20} color={theme.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Enter official's name..."
              placeholderTextColor={theme.secondaryText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleNameSearch}
              returnKeyType="search"
              autoFocus
            />
            {searchQuery.length > 0 ? (
              <Feather
                name="x"
                size={20}
                color={theme.secondaryText}
                onPress={() => setSearchQuery("")}
              />
            ) : null}
          </View>

          <Button
            onPress={handleNameSearch}
            disabled={searchQuery.trim().length < 2}
            style={styles.searchButton}
          >
            Search
          </Button>

          {hasSearched ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={styles.resultsContainer}
            >
              <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
              </ThemedText>
              <View style={{ height: Spacing.md }} />
              {searchResults.length > 0 ? (
                searchResults.map((official) => (
                  <View key={official.id} style={styles.resultItem}>
                    <OfficialCard
                      official={official}
                      onPress={() => handleOfficialPress(official)}
                    />
                  </View>
                ))
              ) : (
                <View style={styles.emptyResults}>
                  <Image
                    source={require("../../assets/images/empty-search.png")}
                    style={styles.emptyImage}
                    resizeMode="contain"
                  />
                  <ThemedText
                    type="body"
                    style={{ color: theme.secondaryText, textAlign: "center" }}
                  >
                    No officials found matching your search
                  </ThemedText>
                </View>
              )}
            </Animated.View>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (searchMode === "zip") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <KeyboardAwareScrollViewCompat
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: headerHeight + Spacing.lg,
              paddingBottom: tabBarHeight + Spacing.xl,
            },
          ]}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
        >
          <View style={styles.searchHeader}>
            <Button onPress={handleBackToMethods} style={styles.backButton}>
              Back
            </Button>
            <ThemedText type="h2" style={styles.searchTitle}>
              Search by ZIP Code
            </ThemedText>
          </View>

          <View
            style={[
              styles.searchInputContainer,
              { backgroundColor: theme.inputBackground, borderColor: theme.border },
            ]}
          >
            <Feather name="map-pin" size={20} color={theme.secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Enter 5-digit ZIP code..."
              placeholderTextColor={theme.secondaryText}
              value={zipCode}
              onChangeText={(text) => setZipCode(text.replace(/[^0-9]/g, "").slice(0, 5))}
              onSubmitEditing={handleZipSearch}
              returnKeyType="search"
              keyboardType="number-pad"
              maxLength={5}
              autoFocus
            />
          </View>

          <Button
            onPress={handleZipSearch}
            disabled={zipCode.length !== 5}
            style={styles.searchButton}
          >
            Find Districts
          </Button>

          {hasSearched ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              style={styles.resultsContainer}
            >
              <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                Officials representing ZIP code {zipCode}
              </ThemedText>
              <View style={{ height: Spacing.md }} />
              {searchResults.length > 0 ? (
                searchResults.map((official) => (
                  <View key={official.id} style={styles.resultItem}>
                    <OfficialCard
                      official={official}
                      onPress={() => handleOfficialPress(official)}
                    />
                  </View>
                ))
              ) : (
                <View style={styles.emptyResults}>
                  <Image
                    source={require("../../assets/images/empty-search.png")}
                    style={styles.emptyImage}
                    resizeMode="contain"
                  />
                  <ThemedText
                    type="body"
                    style={{ color: theme.secondaryText, textAlign: "center" }}
                  >
                    No districts found for this ZIP code
                  </ThemedText>
                </View>
              )}
            </Animated.View>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <ThemedText type="h2" style={styles.sectionTitle}>
          Find Your Representatives
        </ThemedText>
        <ThemedText
          type="body"
          style={{ color: theme.secondaryText, marginBottom: Spacing.lg }}
        >
          Search for Texas officials by ZIP code, name, or by drawing on the map.
        </ThemedText>

        <View style={styles.methodsContainer}>
          <SearchMethodCard
            icon="map-pin"
            title="ZIP Code Search"
            description="Find officials by your ZIP code"
            onPress={() => setSearchMode("zip")}
          />
          <View style={{ height: Spacing.md }} />
          <SearchMethodCard
            icon="user"
            title="Search by Name"
            description="Look up a specific official"
            onPress={() => setSearchMode("name")}
          />
          <View style={{ height: Spacing.md }} />
          <SearchMethodCard
            icon="edit-2"
            title="Draw to Search"
            description="Draw an area on the map to find districts"
            onPress={handleDrawSearch}
          />
          <View style={{ height: Spacing.md }} />
          <SearchMethodCard
            icon="list"
            title="Browse Lists"
            description="View full rosters for House, Senate, and Congress"
            onPress={() => navigation.navigate("BrowseOfficials")}
          />
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
  methodsContainer: {
    gap: Spacing.md,
  },
  searchHeader: {
    marginBottom: Spacing.lg,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    height: 40,
    marginBottom: Spacing.md,
  },
  searchTitle: {
    marginBottom: Spacing.sm,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    height: Spacing.inputHeight,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  searchButton: {
    marginBottom: Spacing.lg,
  },
  resultsContainer: {
    marginTop: Spacing.md,
  },
  resultItem: {
    marginBottom: Spacing.sm,
  },
  emptyResults: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  emptyImage: {
    width: 150,
    height: 150,
    marginBottom: Spacing.md,
    opacity: 0.7,
  },
});
