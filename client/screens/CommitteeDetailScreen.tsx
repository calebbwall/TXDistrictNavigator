import React, { useState } from "react";
import { StyleSheet, View, FlatList, Pressable, ActivityIndicator, Image, ScrollView } from "react-native";
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

// ── Hearings tab ──
interface CommitteeHearing {
  id: string;
  title: string;
  startsAt: string | null;
  location: string | null;
  status: string;
  sourceUrl: string;
  witnessCount: number | null;
}

function HearingsTab({ committeeId }: { committeeId: string }) {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<{ hearings: CommitteeHearing[] }>({
    queryKey: ["/api/committees", committeeId, "hearings"],
    queryFn: async () => {
      const url = new URL(`/api/committees/${committeeId}/hearings?range=upcoming`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch hearings");
      return res.json();
    },
  });

  if (isLoading) return <ActivityIndicator style={{ marginTop: Spacing.xl }} color={theme.primary} />;

  const hearings = data?.hearings ?? [];
  if (hearings.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="calendar" size={48} color={theme.secondaryText} />
        <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.md }}>
          No upcoming hearings
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}>
      {hearings.map((h) => (
        <Pressable
          key={h.id}
          onPress={() => (navigation as any).navigate("HearingDetail", { eventId: h.id, title: h.title })}
          style={({ pressed }) => [
            styles.hearingRow,
            { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>{h.title}</ThemedText>
            <ThemedText type="small" style={{ color: theme.secondaryText, marginTop: 2 }}>
              {h.startsAt ? new Date(h.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }) : "TBD"}
              {h.location ? ` · ${h.location}` : ""}
            </ThemedText>
            {h.witnessCount != null && h.witnessCount > 0 ? (
              <ThemedText type="small" style={{ color: theme.secondaryText }}>
                {h.witnessCount} witness{h.witnessCount !== 1 ? "es" : ""}
              </ThemedText>
            ) : null}
          </View>
          <Feather name="chevron-right" size={18} color={theme.secondaryText} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ── Bills tab ──
interface CommitteeBillAction {
  id: string;
  actionText: string;
  actionAt: string | null;
  billNumber: string | null;
  parsedActionType: string | null;
}

function BillsTab({ committeeId }: { committeeId: string }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // Fetch recent bill referrals to this committee via bill_actions
  const { data, isLoading } = useQuery<{ hearings: { id: string; title: string; startsAt: string | null }[] }>({
    queryKey: ["/api/committees", committeeId, "hearings", "past"],
    queryFn: async () => {
      const url = new URL(`/api/committees/${committeeId}/hearings?range=past`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch past hearings");
      return res.json();
    },
  });

  if (isLoading) return <ActivityIndicator style={{ marginTop: Spacing.xl }} color={theme.primary} />;

  const past = data?.hearings ?? [];
  if (past.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="file-text" size={48} color={theme.secondaryText} />
        <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.md }}>
          No past hearings with bill data
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}>
      <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.sm }}>
        PAST HEARINGS ({past.length})
      </ThemedText>
      {past.map((h) => (
        <View key={h.id} style={[styles.hearingRow, { backgroundColor: theme.cardBackground }]}>
          <ThemedText type="body">{h.title}</ThemedText>
          {h.startsAt ? (
            <ThemedText type="small" style={{ color: theme.secondaryText }}>
              {new Date(h.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })}
            </ThemedText>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Tab bar ──
type TabKey = "members" | "hearings" | "bills";
const TABS: { key: TabKey; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "hearings", label: "Hearings" },
  { key: "bills", label: "Bills" },
];

export default function CommitteeDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const route = useRoute<RouteParams>();
  const { committeeId } = route.params;
  const [activeTab, setActiveTab] = useState<TabKey>("members");

  const { data, isLoading, error } = useQuery<CommitteeDetailData>({
    queryKey: ["/api/committees", committeeId],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/committees/${committeeId}`, baseUrl);
      const response = await fetch(url.toString());
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
      {/* Committee header */}
      <View style={[styles.headerContainer, { paddingTop: headerHeight + Spacing.md }]}>
        <View style={[styles.committeeIcon, { backgroundColor: theme.primary + "20" }]}>
          <Feather name="briefcase" size={24} color={theme.primary} />
        </View>
        <ThemedText type="h3" style={styles.committeeName}>
          {data.committee.name}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.secondaryText }}>
          {data.members.length} member{data.members.length !== 1 ? "s" : ""}
        </ThemedText>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.border, backgroundColor: theme.backgroundRoot }]}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabItem, activeTab === tab.key && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          >
            <ThemedText
              type="body"
              style={{ color: activeTab === tab.key ? theme.primary : theme.secondaryText, fontWeight: activeTab === tab.key ? "700" : "400" }}
            >
              {tab.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === "members" && (
        <FlatList
          data={data.members}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
      {activeTab === "hearings" && <HearingsTab committeeId={committeeId} />}
      {activeTab === "bills" && <BillsTab committeeId={committeeId} />}
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
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  hearingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
});
