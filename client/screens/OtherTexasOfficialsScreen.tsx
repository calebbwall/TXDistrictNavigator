import React from "react";
import { StyleSheet, View, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import type { MergedOfficial } from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

interface OfficialRowProps {
  official: MergedOfficial;
}

function OfficialRow({ official }: OfficialRowProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("OfficialProfile", { officialId: official.id });
  };

  const partyColor = official.party === "R" ? "#E94B3C" : official.party === "D" ? "#4A90E2" : theme.secondaryText;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.officialRow,
        { backgroundColor: theme.cardBackground, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={[styles.partyIndicator, { backgroundColor: partyColor }]} />
      <View style={styles.officialContent}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>{official.fullName}</ThemedText>
        <ThemedText type="caption" style={{ color: theme.secondaryText }}>
          {official.roleTitle || "Statewide Official"}
        </ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.secondaryText} />
    </Pressable>
  );
}

function groupOfficialsByCategory(officials: MergedOfficial[]): { title: string; data: MergedOfficial[] }[] {
  const executive: MergedOfficial[] = [];
  const railroadComm: MergedOfficial[] = [];
  const judicial: MergedOfficial[] = [];
  const other: MergedOfficial[] = [];

  for (const official of officials) {
    const role = official.roleTitle || "";
    if (role.includes("Governor") || role.includes("Attorney General") || role.includes("Comptroller") || 
        role.includes("Commissioner of Agriculture") || role.includes("General Land Office") ||
        role.includes("Secretary of State")) {
      executive.push(official);
    } else if (role.includes("Railroad")) {
      railroadComm.push(official);
    } else if (role.includes("Justice") || role.includes("Judge") || role.includes("Court")) {
      judicial.push(official);
    } else {
      other.push(official);
    }
  }

  const categories = [];
  if (executive.length > 0) categories.push({ title: "Executive Branch", data: executive });
  if (railroadComm.length > 0) categories.push({ title: "Railroad Commission", data: railroadComm });
  if (judicial.length > 0) categories.push({ title: "Judiciary", data: judicial });
  if (other.length > 0) categories.push({ title: "Other Officials", data: other });

  return categories;
}

export default function OtherTexasOfficialsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const { data: officials, isLoading, error } = useQuery<MergedOfficial[]>({
    queryKey: ["/api/other-tx-officials"],
  });

  const categories = officials ? groupOfficialsByCategory(officials) : [];

  const renderSectionItem = ({ item }: { item: { title: string; data: MergedOfficial[] } }) => (
    <View style={styles.section}>
      <ThemedText type="caption" style={[styles.sectionTitle, { color: theme.secondaryText }]}>
        {item.title}
      </ThemedText>
      <View style={[styles.sectionContent, { backgroundColor: theme.cardBackground }]}>
        {item.data.map((official, index) => (
          <React.Fragment key={official.id}>
            {index > 0 && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
            <OfficialRow official={official} />
          </React.Fragment>
        ))}
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={48} color="#E94B3C" />
        <ThemedText type="body" style={{ marginTop: Spacing.md }}>
          Failed to load officials
        </ThemedText>
      </View>
    );
  }

  if (!officials || officials.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="users" size={48} color={theme.secondaryText} />
        <ThemedText type="body" style={{ marginTop: Spacing.md, color: theme.secondaryText }}>
          No statewide officials found
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={categories}
        renderItem={renderSectionItem}
        keyExtractor={(item) => item.title}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        ListHeaderComponent={
          <ThemedText type="body" style={[styles.description, { color: theme.secondaryText }]}>
            Texas statewide elected officials including the Governor, Attorney General, and other constitutional officers.
          </ThemedText>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  description: {
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
    marginLeft: Spacing.sm,
  },
  sectionContent: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  officialRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  partyIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: Spacing.md,
  },
  officialContent: {
    flex: 1,
  },
  separator: {
    height: 1,
    marginLeft: Spacing.md + 4 + Spacing.md,
  },
});
