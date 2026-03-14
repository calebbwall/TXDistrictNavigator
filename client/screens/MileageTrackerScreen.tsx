import React, { useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
  RefreshControl,
  Share,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import {
  getMileageEntries,
  deleteMileageEntry,
  type MileageEntry,
} from "@/lib/storage";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getCurrentYear(): string {
  return new Date().getFullYear().toString();
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

async function exportMileageToCsv(
  entries: MileageEntry[],
  fromDate: string,
  toDate: string
): Promise<void> {
  const filtered = entries
    .filter((e) => e.date >= fromDate && e.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (filtered.length === 0) {
    Alert.alert("No Entries", "No mileage entries found for the selected date range.");
    return;
  }

  const header = "Date,Description,Start Mileage,End Mileage,Total Miles\n";
  const rows = filtered
    .map(
      (e) =>
        `"${e.date}","${e.description.replace(/"/g, '""')}",${e.startMileage},${e.endMileage},${e.totalMiles}`
    )
    .join("\n");
  const totalMiles = filtered.reduce((sum, e) => sum + e.totalMiles, 0);
  const summary = `\n"TOTAL","",,,${totalMiles}`;
  const csv = header + rows + summary;

  try {
    const file = new File(Paths.cache, `mileage_${fromDate}_to_${toDate}.csv`);
    file.write(csv);

    await Share.share({
      url: file.uri,
      message: csv,
      title: "Mileage Export",
    });
  } catch (error) {
    Alert.alert("Export Failed", "Could not export mileage data. Please try again.");
    console.error("[Mileage] Export error:", error);
  }
}

export default function MileageTrackerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFrom, setExportFrom] = useState(`${getCurrentYear()}-01-01`);
  const [exportTo, setExportTo] = useState(getToday());

  const loadEntries = useCallback(async () => {
    const data = await getMileageEntries();
    setEntries(data.slice().sort((a, b) => b.date.localeCompare(a.date)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  }, [loadEntries]);

  const handleDelete = useCallback(
    (entry: MileageEntry) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        "Delete Entry",
        `Delete the entry for ${formatDate(entry.date)}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              await deleteMileageEntry(entry.id);
              await loadEntries();
            },
          },
        ]
      );
    },
    [loadEntries]
  );

  const handleExport = useCallback(async () => {
    setShowExportModal(false);
    await exportMileageToCsv(entries, exportFrom, exportTo);
  }, [entries, exportFrom, exportTo]);

  const totalMilesAll = entries.reduce((sum, e) => sum + e.totalMiles, 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Summary + Actions Row */}
        <View style={styles.topRow}>
          <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground }]}>
            <ThemedText type="caption" style={{ color: theme.secondaryText }}>
              Total Miles
            </ThemedText>
            <ThemedText type="h2" style={{ color: theme.primary }}>
              {totalMilesAll.toFixed(1)}
            </ThemedText>
          </View>
          <View style={styles.actionButtons}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: theme.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("MileageEntry", {});
              }}
            >
              <Feather name="plus" size={18} color="#fff" />
              <ThemedText type="caption" style={{ color: "#fff", marginLeft: 4 }}>
                Add
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: theme.cardBackground, borderWidth: 1, borderColor: theme.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowExportModal(true);
              }}
            >
              <Feather name="download" size={18} color={theme.primary} />
              <ThemedText type="caption" style={{ color: theme.primary, marginLeft: 4 }}>
                Export
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <Feather name="navigation" size={40} color={theme.secondaryText} />
            </View>
            <ThemedText type="h3" style={{ marginBottom: Spacing.sm }}>
              No Entries Yet
            </ThemedText>
            <ThemedText
              type="body"
              style={{ color: theme.secondaryText, textAlign: "center" }}
            >
              Tap "Add" to log your first mileage trip.
            </ThemedText>
          </View>
        ) : (
          entries.map((entry) => (
            <Pressable
              key={entry.id}
              onPress={() => navigation.navigate("MileageEntry", { entryId: entry.id })}
              onLongPress={() => handleDelete(entry)}
              style={({ pressed }) => [
                styles.entryCard,
                { backgroundColor: theme.cardBackground, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={styles.entryHeader}>
                <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                  {formatDate(entry.date)}
                </ThemedText>
                <View
                  style={[styles.milesBadge, { backgroundColor: theme.primary + "20" }]}
                >
                  <ThemedText
                    type="caption"
                    style={{ color: theme.primary, fontWeight: "600" }}
                  >
                    {entry.totalMiles.toFixed(1)} mi
                  </ThemedText>
                </View>
              </View>
              <ThemedText
                type="body"
                style={{ marginTop: Spacing.xs }}
                numberOfLines={2}
              >
                {entry.description}
              </ThemedText>
              <ThemedText
                type="caption"
                style={{ color: theme.secondaryText, marginTop: 2 }}
              >
                {entry.startMileage} → {entry.endMileage} mi
              </ThemedText>

              {(entry.startPhotoUri || entry.endPhotoUri) && (
                <View style={styles.photoRow}>
                  {entry.startPhotoUri && (
                    <Image
                      source={{ uri: entry.startPhotoUri }}
                      style={styles.photoThumb}
                      contentFit="cover"
                    />
                  )}
                  {entry.endPhotoUri && (
                    <Image
                      source={{ uri: entry.endPhotoUri }}
                      style={styles.photoThumb}
                      contentFit="cover"
                    />
                  )}
                </View>
              )}

              <View style={styles.entryFooter}>
                <Feather name="chevron-right" size={16} color={theme.secondaryText} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Export Date Range Modal */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowExportModal(false)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.cardBackground }]}
            onPress={() => {}}
          >
            <ThemedText type="h3" style={{ marginBottom: Spacing.md }}>
              Export Mileage
            </ThemedText>
            <ThemedText
              type="caption"
              style={{ color: theme.secondaryText, marginBottom: Spacing.lg }}
            >
              Select a date range for your CSV export.
            </ThemedText>

            <ThemedText type="caption" style={styles.inputLabel}>
              From (YYYY-MM-DD)
            </ThemedText>
            <TextInput
              value={exportFrom}
              onChangeText={setExportFrom}
              placeholder="2026-01-01"
              placeholderTextColor={theme.secondaryText}
              style={[
                styles.dateInput,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              keyboardType="numbers-and-punctuation"
            />

            <ThemedText type="caption" style={[styles.inputLabel, { marginTop: Spacing.sm }]}>
              To (YYYY-MM-DD)
            </ThemedText>
            <TextInput
              value={exportTo}
              onChangeText={setExportTo}
              placeholder={getToday()}
              placeholderTextColor={theme.secondaryText}
              style={[
                styles.dateInput,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              keyboardType="numbers-and-punctuation"
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setShowExportModal(false)}
              >
                <ThemedText type="body">Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: theme.primary }]}
                onPress={handleExport}
              >
                <Feather name="download" size={16} color="#fff" style={{ marginRight: 6 }} />
                <ThemedText type="body" style={{ color: "#fff" }}>
                  Export CSV
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  actionButtons: { gap: Spacing.sm },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  entryCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  milesBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  photoRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.sm,
  },
  entryFooter: {
    alignItems: "flex-end",
    marginTop: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  inputLabel: {
    marginBottom: 4,
  },
  dateInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modalBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
});
