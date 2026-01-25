import React from "react";
import { StyleSheet, View, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;
type RouteParams = RouteProp<ProfileStackParamList, "CommitteeList">;

interface Committee {
  id: string;
  chamber: string;
  name: string;
  slug: string;
  sourceUrl: string | null;
}

interface CommitteeRowProps {
  committee: Committee;
}

function CommitteeRow({ committee }: CommitteeRowProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("CommitteeDetail", { committeeId: committee.id, committeeName: committee.name });
  };

  const isSubcommittee = committee.name.toLowerCase().includes("s/c");

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.committeeRow,
        {
          backgroundColor: theme.cardBackground,
          opacity: pressed ? 0.8 : 1,
          marginLeft: isSubcommittee ? Spacing.lg : 0,
        },
      ]}
    >
      <View style={[styles.committeeIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather
          name={isSubcommittee ? "corner-down-right" : "briefcase"}
          size={18}
          color={theme.primary}
        />
      </View>
      <View style={styles.committeeContent}>
        <ThemedText type="body" numberOfLines={2}>
          {committee.name}
        </ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.secondaryText} />
    </Pressable>
  );
}

export default function CommitteeListScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const route = useRoute<RouteParams>();
  const { chamber } = route.params;

  const { data: committees, isLoading, error } = useQuery<Committee[]>({
    queryKey: ["/api/committees", chamber],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/committees?chamber=${chamber}`);
      if (!response.ok) throw new Error("Failed to fetch committees");
      return response.json();
    },
  });

  const renderItem = ({ item }: { item: Committee }) => (
    <CommitteeRow committee={item} />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="inbox" size={48} color={theme.secondaryText} />
      <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.md }}>
        No committees found
      </ThemedText>
      <ThemedText type="caption" style={{ color: theme.secondaryText, marginTop: Spacing.xs }}>
        Use the admin refresh to populate committee data
      </ThemedText>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={48} color="#DC3545" />
        <ThemedText type="body" style={{ color: "#DC3545", marginTop: Spacing.md }}>
          Failed to load committees
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={committees}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  committeeRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  committeeIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  committeeContent: {
    flex: 1,
  },
  separator: {
    height: Spacing.xs,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl * 2,
  },
});
