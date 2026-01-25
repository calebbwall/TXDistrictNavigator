import React from "react";
import { StyleSheet, View, FlatList, Pressable, ActivityIndicator, Image } from "react-native";
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
type RouteParams = RouteProp<ProfileStackParamList, "CommitteeDetail">;

interface CommitteeMember {
  id: string;
  memberName: string;
  roleTitle: string | null;
  sortOrder: string | null;
  officialPublicId: string | null;
  officialName: string | null;
  officialDistrict: string | null;
  officialParty: string | null;
  officialPhotoUrl: string | null;
}

interface CommitteeDetailData {
  committee: {
    id: string;
    chamber: string;
    name: string;
    slug: string;
    sourceUrl: string | null;
  };
  members: CommitteeMember[];
}

interface MemberRowProps {
  member: CommitteeMember;
  chamber: string;
}

function MemberRow({ member, chamber }: MemberRowProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const handlePress = () => {
    if (!member.officialPublicId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("OfficialProfile", { officialId: member.officialPublicId });
  };

  const isChair = member.roleTitle === "Chair";
  const isViceChair = member.roleTitle === "Vice Chair";
  const roleColor = isChair ? "#FFD700" : isViceChair ? "#A8D8EA" : theme.secondaryText;

  const partyColor = member.officialParty === "R" ? "#E94B3C" : member.officialParty === "D" ? "#4A90E2" : theme.secondaryText;

  return (
    <Pressable
      onPress={handlePress}
      disabled={!member.officialPublicId}
      style={({ pressed }) => [
        styles.memberRow,
        {
          backgroundColor: theme.cardBackground,
          opacity: pressed && member.officialPublicId ? 0.8 : 1,
        },
      ]}
    >
      {member.officialPhotoUrl ? (
        <Image
          source={{ uri: member.officialPhotoUrl }}
          style={styles.memberPhoto}
        />
      ) : (
        <View style={[styles.memberPhoto, { backgroundColor: theme.backgroundDefault, justifyContent: "center", alignItems: "center" }]}>
          <Feather name="user" size={20} color={theme.secondaryText} />
        </View>
      )}
      <View style={styles.memberContent}>
        <ThemedText type="body" numberOfLines={1}>
          {member.officialName || member.memberName}
        </ThemedText>
        <View style={styles.memberMeta}>
          {member.roleTitle ? (
            <View style={[
              styles.roleBadge, 
              { backgroundColor: roleColor + "20" },
              isChair && { borderWidth: 1.5, borderColor: "#FFD700" },
              isViceChair && { borderWidth: 1, borderColor: "#A8D8EA" },
            ]}>
              <ThemedText type="caption" style={{ color: isChair ? "#DAA520" : isViceChair ? "#5B9BD5" : roleColor, fontWeight: "600" }}>
                {member.roleTitle}
              </ThemedText>
            </View>
          ) : null}
          {member.officialDistrict ? (
            <ThemedText type="caption" style={{ color: theme.secondaryText }}>
              {chamber === "TX_HOUSE" ? "HD" : "SD"}-{member.officialDistrict}
            </ThemedText>
          ) : null}
          {member.officialParty ? (
            <View style={[styles.partyBadge, { backgroundColor: partyColor + "20" }]}>
              <ThemedText type="caption" style={{ color: partyColor, fontWeight: "600" }}>
                {member.officialParty}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
      {member.officialPublicId ? (
        <Feather name="chevron-right" size={20} color={theme.secondaryText} />
      ) : null}
    </Pressable>
  );
}

export default function CommitteeDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const route = useRoute<RouteParams>();
  const { committeeId } = route.params;

  const { data, isLoading, error } = useQuery<CommitteeDetailData>({
    queryKey: ["/api/committees", committeeId],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/committees/${committeeId}`);
      if (!response.ok) throw new Error("Failed to fetch committee details");
      return response.json();
    },
  });

  const renderItem = ({ item }: { item: CommitteeMember }) => (
    <MemberRow member={item} chamber={data?.committee.chamber || "TX_HOUSE"} />
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={[styles.committeeIcon, { backgroundColor: theme.primary + "20" }]}>
        <Feather name="briefcase" size={24} color={theme.primary} />
      </View>
      <ThemedText type="h3" style={styles.committeeName}>
        {data?.committee.name}
      </ThemedText>
      <ThemedText type="caption" style={{ color: theme.secondaryText }}>
        {data?.members.length || 0} member{data?.members.length !== 1 ? "s" : ""}
      </ThemedText>
      <View style={styles.divider} />
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="users" size={48} color={theme.secondaryText} />
      <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.md }}>
        No members found
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

  if (error || !data) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={48} color="#DC3545" />
        <ThemedText type="body" style={{ color: "#DC3545", marginTop: Spacing.md }}>
          Failed to load committee details
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={data.members}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
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
  headerContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  committeeIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  committeeName: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#E0E0E0",
    marginTop: Spacing.lg,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  memberPhoto: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
  },
  memberContent: {
    flex: 1,
  },
  memberMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  partyBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
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
