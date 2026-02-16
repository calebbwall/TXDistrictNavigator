import React from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type Prayer = {
  id: string;
  title: string;
  body: string;
  status: "OPEN" | "ANSWERED" | "ARCHIVED";
  createdAt: string;
  answeredAt: string | null;
  archivedAt: string | null;
  answerNote: string | null;
  categoryId: string | null;
  officialIds: string[];
  pinnedDaily: boolean;
  priority: number;
};

export default function PrayerDetailScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { prayerId } = route.params as { prayerId: string };

  const { data: prayer, isLoading } = useQuery<Prayer>({
    queryKey: ["/api/prayers", prayerId],
  });

  const answerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/prayers/${prayerId}/answer`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/prayers/${prayerId}/reopen`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/prayers/${prayerId}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/prayers/${prayerId}/unarchive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/prayers/${prayerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers"] });
      navigation.goBack();
    },
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!prayer) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <ThemedText type="body" style={{ color: theme.secondaryText }}>Prayer not found</ThemedText>
      </View>
    );
  }

  const statusColor = prayer.status === "OPEN" ? theme.primary : prayer.status === "ANSWERED" ? theme.success : theme.secondaryText;
  const statusLabel = prayer.status === "OPEN" ? "Active" : prayer.status === "ANSWERED" ? "Answered" : "Archived";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.md, paddingHorizontal: Spacing.md, paddingBottom: insets.bottom + Spacing.xxl }}
    >
      <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <ThemedText type="caption" style={{ color: statusColor, fontWeight: "600" }}>{statusLabel}</ThemedText>
      </View>

      <ThemedText type="h2" style={{ marginTop: Spacing.md }}>{prayer.title}</ThemedText>

      <View style={styles.metaRow}>
        <Feather name="calendar" size={14} color={theme.secondaryText} />
        <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}>
          Created {formatDate(prayer.createdAt)}
        </ThemedText>
      </View>

      {prayer.pinnedDaily ? (
        <View style={styles.metaRow}>
          <Feather name="star" size={14} color={theme.warning} />
          <ThemedText type="caption" style={{ color: theme.warning, marginLeft: Spacing.xs }}>Pinned to Daily</ThemedText>
        </View>
      ) : null}

      {prayer.priority === 1 ? (
        <View style={styles.metaRow}>
          <Feather name="alert-circle" size={14} color={theme.secondary} />
          <ThemedText type="caption" style={{ color: theme.secondary, marginLeft: Spacing.xs }}>High Priority</ThemedText>
        </View>
      ) : null}

      <Card elevation={1} style={{ marginTop: Spacing.lg, padding: Spacing.md }}>
        <ThemedText type="body" style={{ lineHeight: 22 }}>{prayer.body}</ThemedText>
      </Card>

      {prayer.status === "ANSWERED" && prayer.answeredAt ? (
        <Card elevation={1} style={{ marginTop: Spacing.md, padding: Spacing.md }}>
          <View style={styles.metaRow}>
            <Feather name="check-circle" size={16} color={theme.success} />
            <ThemedText type="body" style={{ color: theme.success, fontWeight: "600", marginLeft: Spacing.xs }}>
              Answered {formatDate(prayer.answeredAt)}
            </ThemedText>
          </View>
          {prayer.answerNote ? (
            <ThemedText type="body" style={{ marginTop: Spacing.sm, lineHeight: 22 }}>{prayer.answerNote}</ThemedText>
          ) : null}
        </Card>
      ) : null}

      <View style={styles.actionButtons}>
        {prayer.status === "OPEN" ? (
          <>
            <Button onPress={() => answerMutation.mutate()} style={{ flex: 1 }}>
              Mark Answered
            </Button>
            <Pressable
              style={[styles.outlineBtn, { borderColor: theme.border }]}
              onPress={() => archiveMutation.mutate()}
            >
              <ThemedText type="caption" style={{ color: theme.secondaryText }}>Archive</ThemedText>
            </Pressable>
          </>
        ) : prayer.status === "ANSWERED" ? (
          <>
            <Button onPress={() => reopenMutation.mutate()} style={{ flex: 1 }}>
              Reopen
            </Button>
            <Pressable
              style={[styles.outlineBtn, { borderColor: theme.border }]}
              onPress={() => archiveMutation.mutate()}
            >
              <ThemedText type="caption" style={{ color: theme.secondaryText }}>Archive</ThemedText>
            </Pressable>
          </>
        ) : (
          <Button onPress={() => unarchiveMutation.mutate()} style={{ flex: 1 }}>
            Reopen
          </Button>
        )}
      </View>

      <Pressable
        style={styles.deleteRow}
        onPress={() => {
          Alert.alert("Delete Prayer", "This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
          ]);
        }}
      >
        <Feather name="trash-2" size={16} color={theme.secondary} />
        <ThemedText type="caption" style={{ color: theme.secondary, marginLeft: Spacing.xs }}>Delete Prayer</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: Spacing.xs },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  outlineBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xl,
    padding: Spacing.md,
  },
});
