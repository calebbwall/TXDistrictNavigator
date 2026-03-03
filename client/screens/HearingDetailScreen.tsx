import React, { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { LegislativeStackParamList } from "@/navigation/LegislativeStackNavigator";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { apiRequest } from "@/lib/query-client";

type RouteParams = RouteProp<LegislativeStackParamList, "HearingDetail">;
type NavigationProp = NativeStackNavigationProp<LegislativeStackParamList>;

// ── Types ──
interface HearingResponse {
  hearing: {
    id: string;
    title: string;
    committeeName: string | null;
    chamber: string | null;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
    location: string | null;
    status: string;
    sourceUrl: string;
    noticeText: string | null;
    meetingType: string | null;
    witnessCount: number | null;
    videoUrl: string | null;
  };
  agenda: {
    id: string;
    billNumber: string | null;
    itemText: string;
    sortOrder: number;
  }[];
}

interface WitnessesResponse {
  witnesses: {
    id: string;
    fullName: string;
    organization: string | null;
    position: string | null;
    sortOrder: number;
  }[];
  total: number;
}

// ── Helpers ──
function formatDateTime(iso: string | null, timezone: string): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
}

function chamberLabel(chamber: string | null | undefined): string {
  if (chamber === "TX_HOUSE") return "Texas House";
  if (chamber === "TX_SENATE") return "Texas Senate";
  return chamber ?? "Legislature";
}

function positionColor(position: string | null, theme: { success: string; secondary: string; secondaryText: string }): string {
  if (!position) return theme.secondaryText;
  const p = position.toUpperCase();
  if (p.includes("FOR")) return theme.success;
  if (p.includes("AGAINST")) return theme.secondary;
  return theme.secondaryText;
}

// ── Section ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="caption" style={[styles.sectionTitle, { color: theme.secondaryText }]}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

// ── Collapsible Notice Text ──
function CollapsibleNotice({ text }: { text: string }) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const preview = text.slice(0, 300);
  const hasMore = text.length > 300;

  return (
    <View style={[styles.noticeBox, { backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.md }]}>
      <ThemedText type="small" style={{ color: theme.secondaryText, lineHeight: 18 }}>
        {expanded ? text : preview + (hasMore && !expanded ? "…" : "")}
      </ThemedText>
      {hasMore && (
        <Pressable onPress={() => setExpanded((v) => !v)} style={{ marginTop: Spacing.xs }}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            {expanded ? "Show less" : "Show more"}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const TLO_BILL_URL = (billNumber: string) =>
  `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${encodeURIComponent(billNumber)}`;

// ── Agenda Item Row ──
function AgendaRow({ item }: { item: HearingResponse["agenda"][0] }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.agendaRow, { backgroundColor: theme.cardBackground, borderRadius: BorderRadius.sm }]}>
      {item.billNumber ? (
        <Pressable
          onPress={() => Linking.openURL(TLO_BILL_URL(item.billNumber!))}
          style={[styles.billBadge, { backgroundColor: theme.primary + "18" }]}
        >
          <ThemedText type="small" style={{ color: theme.primary, fontWeight: "700" }}>
            {item.billNumber}
          </ThemedText>
          <Feather name="external-link" size={10} color={theme.primary} style={{ marginTop: 1 }} />
        </Pressable>
      ) : (
        <View style={[styles.billBadge, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="file" size={12} color={theme.secondaryText} />
        </View>
      )}
      <ThemedText type="small" style={{ flex: 1, color: theme.secondaryText, lineHeight: 18 }} numberOfLines={3}>
        {item.itemText}
      </ThemedText>
    </View>
  );
}

// ── Witness Row ──
function WitnessRow({ witness }: { witness: WitnessesResponse["witnesses"][0] }) {
  const { theme } = useTheme();
  const pColor = positionColor(witness.position, { success: theme.success, secondary: theme.secondary, secondaryText: theme.secondaryText });

  return (
    <View style={[styles.witnessRow, { backgroundColor: theme.cardBackground, borderRadius: BorderRadius.sm }]}>
      <Feather name="user" size={14} color={theme.secondaryText} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>{witness.fullName}</ThemedText>
        {witness.organization ? (
          <ThemedText type="small" style={{ color: theme.secondaryText }}>{witness.organization}</ThemedText>
        ) : null}
      </View>
      {witness.position ? (
        <View style={[styles.positionBadge, { backgroundColor: pColor + "20" }]}>
          <ThemedText type="small" style={{ color: pColor, fontWeight: "700", fontSize: 10 }}>
            {witness.position.toUpperCase().slice(0, 7)}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

// ── Main Screen ──
export default function HearingDetailScreen() {
  const { theme } = useTheme();
  const route = useRoute<RouteParams>();
  const navigation = useNavigation<NavigationProp>();
  const headerHeight = useHeaderHeight();
  let tabBarHeight = 0;
  try { tabBarHeight = useBottomTabBarHeight(); } catch { tabBarHeight = 80; }

  const { eventId } = route.params;
  const [showWitnesses, setShowWitnesses] = useState(false);

  const { data, isLoading, error } = useQuery<HearingResponse>({
    queryKey: ["/api/hearings", eventId],
    queryFn: async () => {
      const url = new URL(`/api/hearings/${eventId}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch hearing");
      return res.json();
    },
  });

  const { data: witnessData, isLoading: witnessLoading } = useQuery<WitnessesResponse>({
    queryKey: ["/api/hearings", eventId, "witnesses"],
    queryFn: async () => {
      const url = new URL(`/api/hearings/${eventId}/witnesses`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch witnesses");
      return res.json();
    },
    enabled: showWitnesses,
  });

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={48} color="#DC3545" />
        <ThemedText type="body" style={{ color: "#DC3545", marginTop: Spacing.md }}>
          Failed to load hearing
        </ThemedText>
      </View>
    );
  }

  const { hearing, agenda } = data;
  const isSenate = hearing.chamber === "TX_SENATE";
  const accentColor = isSenate ? "#4A90E2" : "#E94B3C";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.md, paddingBottom: tabBarHeight + Spacing.xl }}
    >
      {/* Header card */}
      <View style={[styles.headerCard, { backgroundColor: theme.cardBackground }]}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        <View style={styles.headerContent}>
          <View style={styles.headerMeta}>
            <View style={[styles.chamberBadge, { backgroundColor: accentColor + "20" }]}>
              <ThemedText type="small" style={{ color: accentColor, fontWeight: "700" }}>
                {chamberLabel(hearing.chamber)}
              </ThemedText>
            </View>
            {hearing.meetingType ? (
              <View style={[styles.typeBadge, { backgroundColor: theme.backgroundSecondary }]}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>{hearing.meetingType}</ThemedText>
              </View>
            ) : null}
            <View style={[styles.statusBadge, { backgroundColor: hearing.status === "POSTED" ? "#28A74520" : theme.backgroundSecondary }]}>
              <ThemedText type="small" style={{ color: hearing.status === "POSTED" ? theme.success : theme.secondaryText }}>
                {hearing.status}
              </ThemedText>
            </View>
          </View>

          <ThemedText type="h3" style={styles.hearingTitle}>
            {hearing.committeeName ?? hearing.title}
          </ThemedText>

          <View style={styles.detailRow}>
            <Feather name="clock" size={15} color={theme.secondaryText} />
            <ThemedText type="body" style={{ color: theme.text, marginLeft: Spacing.sm }}>
              {formatDateTime(hearing.startsAt, hearing.timezone)}
            </ThemedText>
          </View>

          {hearing.location ? (
            <View style={styles.detailRow}>
              <Feather name="map-pin" size={15} color={theme.secondaryText} />
              <ThemedText type="body" style={{ color: theme.text, marginLeft: Spacing.sm }}>
                {hearing.location}
              </ThemedText>
            </View>
          ) : null}

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => Linking.openURL(hearing.sourceUrl)}
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
            >
              <Feather name="external-link" size={14} color="#FFF" />
              <ThemedText type="small" style={{ color: "#FFF", marginLeft: 6, fontWeight: "600" }}>
                Open on TLO
              </ThemedText>
            </Pressable>
            {hearing.videoUrl ? (
              <Pressable
                onPress={() => Linking.openURL(hearing.videoUrl!)}
                style={[styles.actionButton, { backgroundColor: theme.backgroundSecondary }]}
              >
                <Feather name="video" size={14} color={theme.text} />
                <ThemedText type="small" style={{ color: theme.text, marginLeft: 6 }}>
                  Watch
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {/* Agenda section (first) */}
      {agenda.length > 0 ? (
        <Section title={`Agenda (${agenda.length} item${agenda.length !== 1 ? "s" : ""})`}>
          <View style={styles.agendaList}>
            {agenda.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </View>
        </Section>
      ) : null}

      {/* Witnesses section */}
      <Section title={`Witnesses${hearing.witnessCount ? ` (${hearing.witnessCount})` : ""}`}>
        {!showWitnesses ? (
          <Pressable
            onPress={() => setShowWitnesses(true)}
            style={[styles.loadWitnessesBtn, { backgroundColor: theme.backgroundSecondary }]}
          >
            <Feather name="users" size={16} color={theme.primary} />
            <ThemedText type="body" style={{ color: theme.primary, marginLeft: Spacing.sm }}>
              Load witnesses
            </ThemedText>
          </Pressable>
        ) : witnessLoading ? (
          <ActivityIndicator color={theme.primary} />
        ) : witnessData && witnessData.witnesses.length > 0 ? (
          <View style={styles.witnessList}>
            {witnessData.witnesses.map((w) => (
              <WitnessRow key={w.id} witness={w} />
            ))}
          </View>
        ) : (
          <ThemedText type="body" style={{ color: theme.secondaryText }}>
            No witnesses registered yet
          </ThemedText>
        )}
      </Section>

      {/* Notice text (collapsible) */}
      {hearing.noticeText ? (
        <Section title="Notice Text">
          <CollapsibleNotice text={hearing.noticeText} />
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerCard: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  accentBar: { width: 5 },
  headerContent: { flex: 1, padding: Spacing.md },
  headerMeta: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs, marginBottom: Spacing.sm },
  chamberBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.xs },
  typeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.xs },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.xs },
  hearingTitle: { fontWeight: "700", marginBottom: Spacing.sm },
  detailRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: Spacing.sm },
  buttonRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  section: { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
  sectionTitle: { fontWeight: "700", letterSpacing: 0.8, marginBottom: Spacing.sm },
  agendaList: { gap: Spacing.xs },
  agendaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  billBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 3,
  },
  witnessList: { gap: Spacing.xs },
  witnessRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.sm,
  },
  positionBadge: { paddingHorizontal: Spacing.xs, paddingVertical: 2, borderRadius: BorderRadius.xs },
  loadWitnessesBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  noticeBox: { padding: Spacing.md },
});
