import React, { useMemo } from "react";
import { StyleSheet, View, SectionList, Pressable, ActivityIndicator } from "react-native";
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
import { 
  normalizeAndGroupOfficials, 
  NormalizedOfficial, 
  OfficialSection,
  getSubgroupLabel 
} from "@/utils/otherTxOfficialsNormalizer";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

interface OfficialRowProps {
  official: NormalizedOfficial;
  isFirst: boolean;
  isLast: boolean;
  showSubgroupHeader: boolean;
  subgroupLabel: string | null;
}

function OfficialRow({ official, isFirst, isLast, showSubgroupHeader, subgroupLabel }: OfficialRowProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("OfficialProfile", { officialId: official.id });
  };

  const partyColor = official.party === "R" ? "#E94B3C" : official.party === "D" ? "#4A90E2" : theme.secondaryText;

  const displayTitle = useMemo(() => {
    const role = official.roleTitle || "Official";
    if (official.roleModifier) {
      return role;
    }
    if (official.placeNumber !== null && official.subgroup !== "Executive Officers") {
      if (official.subgroup === "Texas Supreme Court") {
        return `Justice, Place ${official.placeNumber}`;
      }
      if (official.subgroup === "Texas Court of Criminal Appeals") {
        return `Judge, Place ${official.placeNumber}`;
      }
      if (official.subgroup === "Railroad Commission") {
        return "Commissioner";
      }
    }
    return role;
  }, [official]);

  return (
    <View>
      {showSubgroupHeader && subgroupLabel ? (
        <View style={[styles.subgroupHeader, { backgroundColor: theme.backgroundRoot }]}>
          <ThemedText type="caption" style={[styles.subgroupTitle, { color: theme.secondaryText }]}>
            {subgroupLabel}
          </ThemedText>
        </View>
      ) : null}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.officialRow,
          { 
            backgroundColor: theme.cardBackground, 
            opacity: pressed ? 0.8 : 1,
          },
          isFirst && !showSubgroupHeader && styles.firstRow,
          isLast && styles.lastRow,
        ]}
      >
        <View style={[styles.partyIndicator, { backgroundColor: partyColor }]} />
        <View style={styles.officialContent}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>{official.fullName}</ThemedText>
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>
            {displayTitle}
          </ThemedText>
        </View>
        <Feather name="chevron-right" size={20} color={theme.secondaryText} />
      </Pressable>
    </View>
  );
}

interface SectionHeaderProps {
  title: string;
  description: string;
}

function SectionHeader({ title, description }: SectionHeaderProps) {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.sectionHeaderContainer, { backgroundColor: theme.backgroundRoot }]}>
      <ThemedText type="h3" style={[styles.sectionTitle, { color: theme.text }]}>
        {title}
      </ThemedText>
      <ThemedText type="caption" style={[styles.sectionDescription, { color: theme.secondaryText }]}>
        {description}
      </ThemedText>
    </View>
  );
}

export default function OtherTexasOfficialsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const { data: officials, isLoading, error } = useQuery<MergedOfficial[]>({
    queryKey: ["/api/other-tx-officials"],
  });

  const sections = useMemo(() => {
    if (!officials) return [];
    return normalizeAndGroupOfficials(officials);
  }, [officials]);

  const renderItem = ({ item, index, section }: { item: NormalizedOfficial; index: number; section: OfficialSection }) => {
    const isFirst = index === 0;
    const isLast = index === section.data.length - 1;
    
    let showSubgroupHeader = false;
    let subgroupLabel: string | null = null;
    
    if (section.key === "judiciary") {
      const currentSubgroup = item.subgroup;
      if (index === 0) {
        showSubgroupHeader = true;
        subgroupLabel = getSubgroupLabel(item);
      } else {
        const prevItem = section.data[index - 1];
        if (prevItem.subgroup !== currentSubgroup) {
          showSubgroupHeader = true;
          subgroupLabel = getSubgroupLabel(item);
        }
      }
    }
    
    return (
      <OfficialRow 
        official={item} 
        isFirst={isFirst && !showSubgroupHeader}
        isLast={isLast}
        showSubgroupHeader={showSubgroupHeader}
        subgroupLabel={subgroupLabel}
      />
    );
  };

  const renderSectionHeader = ({ section }: { section: OfficialSection }) => (
    <SectionHeader title={section.title} description={section.description} />
  );

  const ItemSeparator = () => {
    const { theme } = useTheme();
    return <View style={[styles.separator, { backgroundColor: theme.border }]} />;
  };

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
      <SectionList
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={true}
        ItemSeparatorComponent={ItemSeparator}
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
            Texas statewide elected officials organized by branch of government.
          </ThemedText>
        }
        SectionSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
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
  sectionHeaderContainer: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 18,
    marginBottom: Spacing.xs,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  subgroupHeader: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  subgroupTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
  },
  officialRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  firstRow: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  lastRow: {
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
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
