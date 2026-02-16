import React, { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";

type Prayer = {
  id: string;
  title: string;
  status: string;
};

type DailyPicksResponse = {
  dateKey: string;
  prayers: Prayer[];
  generatedAt: string;
};

type StreakResponse = {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDateKey: string | null;
};

type AutoArchiveSettings = {
  enabled: boolean;
  days: number;
};

type TestResult = {
  step: string;
  passed: boolean;
  error?: string;
};

function getDateKey(date: Date): string {
  const localeStr = date.toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  const parts = localeStr.split("/");
  const month = parts[0].padStart(2, "0");
  const day = parts[1].padStart(2, "0");
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

function getYesterdayDateKey(): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  return getDateKey(yesterday);
}

export default function PrayerDiagnosticsScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const todayKey = getDateKey(new Date());
  const yesterdayKey = getYesterdayDateKey();

  const { data: dailyPicks } = useQuery<DailyPicksResponse>({
    queryKey: ["/api/daily-prayer-picks"],
  });

  const { data: openPrayers = [] } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers?status=OPEN"],
  });

  const { data: answeredPrayers = [] } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers?status=ANSWERED"],
  });

  const { data: archivedPrayers = [] } = useQuery<Prayer[]>({
    queryKey: ["/api/prayers?status=ARCHIVED"],
  });

  const { data: streak } = useQuery<StreakResponse>({
    queryKey: ["/api/prayer-streak"],
  });

  const { data: archiveSettings } = useQuery<AutoArchiveSettings>({
    queryKey: ["/api/settings/auto-archive"],
  });

  const runSelfTest = async () => {
    setTestRunning(true);
    setTestResults([]);
    const results: TestResult[] = [];
    let createdId: string | null = null;

    const timestamp = Date.now();
    const testTitle = `[TEST] Self-test ${timestamp}`;

    try {
      const createRes = await apiRequest("POST", "/api/prayers", {
        title: testTitle,
        body: "Automated self-test prayer",
      });
      const created = await createRes.json();
      createdId = created.id;
      results.push({ step: "Create test prayer", passed: true });
    } catch (err: any) {
      results.push({ step: "Create test prayer", passed: false, error: err.message });
      setTestResults([...results]);
      setTestRunning(false);
      return;
    }
    setTestResults([...results]);

    try {
      await apiRequest("POST", `/api/prayers/${createdId}/answer`, {
        answerNote: "Auto-test answer",
      });
      results.push({ step: "Mark answered", passed: true });
    } catch (err: any) {
      results.push({ step: "Mark answered", passed: false, error: err.message });
    }
    setTestResults([...results]);

    try {
      await apiRequest("POST", `/api/prayers/${createdId}/archive`);
      results.push({ step: "Archive prayer", passed: true });
    } catch (err: any) {
      results.push({ step: "Archive prayer", passed: false, error: err.message });
    }
    setTestResults([...results]);

    try {
      await apiRequest("POST", `/api/prayers/${createdId}/unarchive`);
      results.push({ step: "Unarchive prayer", passed: true });
    } catch (err: any) {
      results.push({ step: "Unarchive prayer", passed: false, error: err.message });
    }
    setTestResults([...results]);

    try {
      await apiRequest("DELETE", `/api/prayers/${createdId}`);
      results.push({ step: "Delete prayer", passed: true });
    } catch (err: any) {
      results.push({ step: "Delete prayer", passed: false, error: err.message });
    }
    setTestResults([...results]);

    setTestRunning(false);
  };

  const allPassed = testResults.length > 0 && testResults.every((r) => r.passed);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.sm,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="calendar" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Date Keys</ThemedText>
          </View>
          <DiagRow label="Today" value={todayKey} theme={theme} />
          <DiagRow label="Yesterday" value={yesterdayKey} theme={theme} />
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="sun" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Daily Picks</ThemedText>
          </View>
          <DiagRow
            label="Today's pick IDs"
            value={dailyPicks ? dailyPicks.prayers.map((p) => p.id.substring(0, 8)).join(", ") : "Loading..."}
            theme={theme}
          />
          <DiagRow
            label="Count"
            value={dailyPicks ? String(dailyPicks.prayers.length) : "--"}
            theme={theme}
          />
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="database" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Prayer Counts</ThemedText>
          </View>
          <DiagRow label="Active (OPEN)" value={String(openPrayers.length)} theme={theme} />
          <DiagRow label="Answered" value={String(answeredPrayers.length)} theme={theme} />
          <DiagRow label="Archived" value={String(archivedPrayers.length)} theme={theme} />
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="zap" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Streak</ThemedText>
          </View>
          <DiagRow label="Current" value={streak ? String(streak.currentStreak) : "--"} theme={theme} />
          <DiagRow label="Longest" value={streak ? String(streak.longestStreak) : "--"} theme={theme} />
          <DiagRow
            label="Last completed"
            value={streak?.lastCompletedDateKey ?? "Never"}
            theme={theme}
          />
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="settings" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Auto-Archive Settings</ThemedText>
          </View>
          <DiagRow
            label="Enabled"
            value={archiveSettings ? (archiveSettings.enabled ? "Yes" : "No") : "--"}
            theme={theme}
          />
          <DiagRow
            label="Days"
            value={archiveSettings ? String(archiveSettings.days) : "--"}
            theme={theme}
          />
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="wifi" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">API</ThemedText>
          </View>
          <DiagRow label="Base URL" value={(() => { try { return getApiUrl(); } catch { return "Not configured"; } })()} theme={theme} />
          <DiagRow label="Last sync" value="Now (live queries)" theme={theme} />
        </Card>

        <Card elevation={1} style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Feather name="play-circle" size={18} color={theme.primary} style={{ marginRight: Spacing.sm }} />
            <ThemedText type="h3">Quick Self-Test</ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.secondaryText, marginBottom: Spacing.md }}>
            Creates, answers, archives, unarchives, and deletes a test prayer.
          </ThemedText>

          <Pressable
            onPress={runSelfTest}
            disabled={testRunning}
            style={({ pressed }) => [
              styles.testButton,
              {
                backgroundColor: testRunning ? theme.backgroundSecondary : theme.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {testRunning ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600", textAlign: "center" }}>
                Run Self-Test
              </ThemedText>
            )}
          </Pressable>

          {testResults.length > 0 ? (
            <View style={styles.resultsContainer}>
              {testResults.map((result, index) => (
                <View key={index} style={[styles.resultRow, { borderBottomColor: theme.border }]}>
                  <Feather
                    name={result.passed ? "check-circle" : "x-circle"}
                    size={16}
                    color={result.passed ? theme.success : theme.secondary}
                    style={{ marginRight: Spacing.sm }}
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="caption">{result.step}</ThemedText>
                    {result.error ? (
                      <ThemedText type="small" style={{ color: theme.secondary, marginTop: 2 }}>
                        {result.error}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText
                    type="small"
                    style={{
                      color: result.passed ? theme.success : theme.secondary,
                      fontWeight: "600",
                    }}
                  >
                    {result.passed ? "PASS" : "FAIL"}
                  </ThemedText>
                </View>
              ))}
              {allPassed ? (
                <View style={styles.summaryRow}>
                  <Feather name="check" size={16} color={theme.success} style={{ marginRight: Spacing.sm }} />
                  <ThemedText type="caption" style={{ color: theme.success, fontWeight: "600" }}>
                    All tests passed
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

function DiagRow({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={diagStyles.row}>
      <ThemedText type="caption" style={{ color: theme.secondaryText, flex: 1 }}>
        {label}
      </ThemedText>
      <ThemedText type="caption" style={{ fontWeight: "600", flexShrink: 1, textAlign: "right" }} numberOfLines={2}>
        {value}
      </ThemedText>
    </View>
  );
}

const diagStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs + 2,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  testButton: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  resultsContainer: {
    marginTop: Spacing.md,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing.md,
  },
});
