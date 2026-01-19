import React, { useState, useCallback } from "react";
import { StyleSheet, View, FlatList, Image, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeIn } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { OfficialCard } from "@/components/OfficialCard";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { getSavedOfficialsWithData, type SavedOfficialData } from "@/lib/storage";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

export default function SavedOfficialsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const [savedOfficials, setSavedOfficials] = useState<SavedOfficialData[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const officials = await getSavedOfficialsWithData();
    setSavedOfficials(officials);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleOfficialPress = useCallback(
    (official: SavedOfficialData) => {
      navigation.navigate("OfficialProfile", { officialId: `${official.source}:${official.districtNumber}` });
    },
    [navigation]
  );

  const renderOfficial = useCallback(
    ({ item }: { item: SavedOfficialData }) => {
      const officialForCard = {
        id: `${item.source}:${item.districtNumber}`,
        fullName: item.fullName,
        party: item.party,
        chamber: item.source === "TX_HOUSE" ? "TX House" : item.source === "TX_SENATE" ? "TX Senate" : "US House",
        district: String(item.districtNumber),
        source: item.source,
        districtNumber: item.districtNumber,
        photoUrl: item.photoUrl,
        isVacant: false,
      };
      return (
        <View style={styles.cardContainer}>
          <OfficialCard
            official={officialForCard as any}
            onPress={() => handleOfficialPress(item)}
          />
        </View>
      );
    },
    [handleOfficialPress]
  );

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.centered, { paddingTop: headerHeight }]}>
          <ThemedText type="body" style={{ color: theme.secondaryText }}>
            Loading...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {savedOfficials.length > 0 ? (
        <FlatList
          data={savedOfficials}
          keyExtractor={(item) => `${item.source}:${item.districtNumber}`}
          renderItem={renderOfficial}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      ) : (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[styles.emptyState, { paddingTop: headerHeight + Spacing.xl }]}
        >
          <Image
            source={require("../../assets/images/empty-saved.png")}
            style={styles.emptyImage}
            resizeMode="contain"
          />
          <ThemedText
            type="body"
            style={{ color: theme.secondaryText, textAlign: "center" }}
          >
            No saved officials yet
          </ThemedText>
          <ThemedText
            type="caption"
            style={{ color: theme.secondaryText, textAlign: "center", marginTop: Spacing.xs }}
          >
            Tap the bookmark icon on an official's profile to save them
          </ThemedText>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  cardContainer: {
    marginBottom: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyImage: {
    width: 120,
    height: 120,
    marginBottom: Spacing.lg,
    opacity: 0.6,
  },
});
