import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Switch,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useToast } from "@/components/Toast";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { invalidatePrayerQueries } from "@/lib/prayer-utils";

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
  lastShownAt: string | null;
  lastPrayedAt: string | null;
  eventDate: string | null;
  autoAfterEventAction: string;
  autoAfterEventDaysOffset: number;
};

type OfficialItem = {
  id: string;
  fullName: string;
  source: string;
  district: string;
};

type PrayerCategory = {
  id: string;
  name: string;
};

export default function PrayerDetailScreen() {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { prayerId } = route.params as { prayerId: string };

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [pinnedDaily, setPinnedDaily] = useState(false);
  const [priority, setPriority] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [autoAfterEventAction, setAutoAfterEventAction] = useState<"none" | "markAnswered" | "archive">("none");
  const [autoAfterEventDaysOffset, setAutoAfterEventDaysOffset] = useState(0);
  const [showAutoActionPicker, setShowAutoActionPicker] = useState(false);

  const { data: prayer, isLoading } = useQuery<Prayer>({
    queryKey: ["/api/prayers", prayerId],
  });

  const { data: categories } = useQuery<PrayerCategory[]>({
    queryKey: ["/api/prayer-categories"],
  });

  const { data: officialsData } = useQuery<{ officials: OfficialItem[] }>({
    queryKey: ["/api/officials"],
  });
  const officialsMap = new Map((officialsData?.officials ?? []).map((o) => [o.id, o.fullName]));

  useEffect(() => {
    if (prayer) {
      setTitle(prayer.title);
      setBody(prayer.body);
      setCategoryId(prayer.categoryId);
      setPinnedDaily(prayer.pinnedDaily);
      setPriority(prayer.priority);
      setEventDate(prayer.eventDate ? new Date(prayer.eventDate) : null);
      setAutoAfterEventAction((prayer.autoAfterEventAction as "none" | "markAnswered" | "archive") || "none");
      setAutoAfterEventDaysOffset(prayer.autoAfterEventDaysOffset || 0);
      setHasChanges(false);
    }
  }, [prayer]);

  const autoActionLabel = autoAfterEventAction === "markAnswered" ? "Mark Answered" : autoAfterEventAction === "archive" ? "Archive" : "No Action";

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/prayers/${prayerId}`, {
        title,
        body,
        categoryId,
        officialIds: prayer?.officialIds ?? [],
        pinnedDaily,
        priority,
        eventDate: eventDate ? eventDate.toISOString() : null,
        autoAfterEventAction,
        autoAfterEventDaysOffset,
      });
    },
    onSuccess: () => {
      setHasChanges(false);
      invalidatePrayerQueries(queryClient);
      showToast("Changes saved");
    },
  });

  const answerMutation = useMutation({
    mutationFn: async (answerNote: string) => {
      await apiRequest("POST", `/api/prayers/${prayerId}/answer`, { answerNote });
    },
    onSuccess: () => {
      invalidatePrayerQueries(queryClient);
      showToast("Prayer answered", { undoAction: () => reopenMutation.mutate() });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/prayers/${prayerId}/reopen`);
    },
    onSuccess: () => {
      invalidatePrayerQueries(queryClient);
      showToast("Prayer reopened");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/prayers/${prayerId}/archive`);
    },
    onSuccess: () => {
      invalidatePrayerQueries(queryClient);
      showToast("Prayer archived", { undoAction: () => unarchiveMutation.mutate() });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/prayers/${prayerId}/unarchive`);
    },
    onSuccess: () => {
      invalidatePrayerQueries(queryClient);
      showToast("Prayer unarchived");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/prayers/${prayerId}`);
    },
    onSuccess: () => {
      invalidatePrayerQueries(queryClient);
      navigation.goBack();
    },
  });

  const markChanged = () => {
    setHasChanges(true);
  };

  const handleMarkAnswered = () => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Mark as Answered",
        "Add an optional answer note:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark Answered",
            onPress: (note?: string) => {
              answerMutation.mutate(note ?? "");
            },
          },
        ],
        "plain-text",
        ""
      );
    } else {
      Alert.alert(
        "Mark as Answered",
        "Mark this prayer as answered?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark Answered",
            onPress: () => {
              answerMutation.mutate("");
            },
          },
        ]
      );
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Prayer", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  };

  const handleCategorySelect = () => {
    if (!categories || categories.length === 0) return;
    setShowCategoryPicker(!showCategoryPicker);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const currentCategoryName = categories?.find((c) => c.id === categoryId)?.name ?? "None";
  const statusColor =
    prayer?.status === "OPEN"
      ? theme.primary
      : prayer?.status === "ANSWERED"
      ? theme.success
      : theme.secondaryText;
  const statusLabel =
    prayer?.status === "OPEN"
      ? "Active"
      : prayer?.status === "ANSWERED"
      ? "Answered"
      : "Archived";

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!prayer) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ThemedText type="body" style={{ color: theme.secondaryText }}>
          Prayer not found
        </ThemedText>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingHorizontal: Spacing.md,
        paddingBottom: insets.bottom + Spacing.xxl,
      }}
    >
      <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <ThemedText type="caption" style={{ color: statusColor, fontWeight: "600" }}>
          {statusLabel}
        </ThemedText>
      </View>

      <View style={{ marginTop: Spacing.lg }}>
        <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
          Title
        </ThemedText>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: theme.inputBackground,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          value={title}
          onChangeText={(val) => {
            setTitle(val);
            markChanged();
          }}
          placeholder="Prayer title"
          placeholderTextColor={theme.secondaryText}
        />
      </View>

      <View style={{ marginTop: Spacing.md }}>
        <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
          Body
        </ThemedText>
        <TextInput
          style={[
            styles.textInput,
            styles.multilineInput,
            {
              backgroundColor: theme.inputBackground,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          value={body}
          onChangeText={(val) => {
            setBody(val);
            markChanged();
          }}
          placeholder="Prayer body"
          placeholderTextColor={theme.secondaryText}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={{ marginTop: Spacing.md }}>
        <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
          Category
        </ThemedText>
        <Pressable
          style={[
            styles.dropdownButton,
            {
              backgroundColor: theme.inputBackground,
              borderColor: theme.border,
            },
          ]}
          onPress={handleCategorySelect}
        >
          <ThemedText type="body" style={{ color: theme.text, flex: 1 }}>
            {currentCategoryName}
          </ThemedText>
          <Feather
            name={showCategoryPicker ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.secondaryText}
          />
        </Pressable>
        {showCategoryPicker ? (
          <Card elevation={2} style={{ marginTop: Spacing.xs, padding: Spacing.sm }}>
            <Pressable
              style={[
                styles.categoryOption,
                categoryId === null ? { backgroundColor: theme.primary + "15" } : null,
              ]}
              onPress={() => {
                setCategoryId(null);
                setShowCategoryPicker(false);
                markChanged();
              }}
            >
              <ThemedText
                type="body"
                style={{
                  color: categoryId === null ? theme.primary : theme.text,
                }}
              >
                None
              </ThemedText>
            </Pressable>
            {categories?.map((cat) => (
              <Pressable
                key={cat.id}
                style={[
                  styles.categoryOption,
                  categoryId === cat.id ? { backgroundColor: theme.primary + "15" } : null,
                ]}
                onPress={() => {
                  setCategoryId(cat.id);
                  setShowCategoryPicker(false);
                  markChanged();
                }}
              >
                <ThemedText
                  type="body"
                  style={{
                    color: categoryId === cat.id ? theme.primary : theme.text,
                  }}
                >
                  {cat.name}
                </ThemedText>
              </Pressable>
            )) ?? null}
          </Card>
        ) : null}
      </View>

      <View style={{ marginTop: Spacing.md }}>
        <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
          Officials
        </ThemedText>
        <View style={styles.chipsContainer}>
          {prayer.officialIds.length > 0 ? (
            prayer.officialIds.map((oid) => (
              <View
                key={oid}
                style={[styles.chip, { backgroundColor: theme.primary + "12" }]}
              >
                <Feather name="user" size={12} color={theme.primary} style={{ marginRight: 4 }} />
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: "500" }}>
                  {officialsMap.get(oid) || oid}
                </ThemedText>
              </View>
            ))
          ) : (
            <ThemedText type="caption" style={{ color: theme.secondaryText }}>
              No officials attached
            </ThemedText>
          )}
        </View>
      </View>

      <Card elevation={1} style={{ marginTop: Spacing.lg, padding: Spacing.md }}>
        <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
          Event Date
        </ThemedText>
        <Pressable
          style={[styles.dropdownButton, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
          onPress={() => setShowDatePicker(true)}
        >
          <Feather name="calendar" size={16} color={eventDate ? theme.warning : theme.secondaryText} style={{ marginRight: Spacing.sm }} />
          <ThemedText type="body" style={{ color: eventDate ? theme.text : theme.secondaryText, flex: 1 }}>
            {eventDate ? eventDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "No event date"}
          </ThemedText>
          {eventDate ? (
            <Pressable onPress={() => { setEventDate(null); setAutoAfterEventAction("none"); markChanged(); }} hitSlop={8}>
              <Feather name="x-circle" size={16} color={theme.secondaryText} />
            </Pressable>
          ) : null}
        </Pressable>
        {showDatePicker ? (
          Platform.OS === "web" ? (
            <View style={{ marginTop: Spacing.sm }}>
              <TextInput
                style={[styles.textInput, { color: theme.text, backgroundColor: theme.inputBackground, borderColor: theme.border }]}
                value={eventDate ? eventDate.toISOString().split("T")[0] : ""}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.secondaryText}
                onChangeText={(text) => {
                  const parsed = new Date(text + "T12:00:00");
                  if (!isNaN(parsed.getTime()) && text.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    setEventDate(parsed);
                    markChanged();
                  }
                }}
                keyboardType="default"
              />
              <Pressable onPress={() => setShowDatePicker(false)} style={{ alignSelf: "flex-end", marginTop: Spacing.xs }}>
                <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>Done</ThemedText>
              </Pressable>
            </View>
          ) : (
            <DateTimePicker
              value={eventDate || new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(ev, date) => {
                if (Platform.OS === "android") setShowDatePicker(false);
                if (date) { setEventDate(date); markChanged(); }
              }}
              themeVariant="dark"
            />
          )
        ) : null}
        {Platform.OS === "ios" && showDatePicker ? (
          <Pressable onPress={() => setShowDatePicker(false)} style={{ alignSelf: "flex-end", marginTop: Spacing.xs }}>
            <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>Done</ThemedText>
          </Pressable>
        ) : null}

        {eventDate ? (
          <View style={{ marginTop: Spacing.md }}>
            <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
              After Event
            </ThemedText>
            <Pressable
              style={[styles.dropdownButton, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
              onPress={() => setShowAutoActionPicker(!showAutoActionPicker)}
            >
              <ThemedText type="body" style={{ color: theme.text, flex: 1 }}>
                {autoActionLabel}
              </ThemedText>
              <Feather name={showAutoActionPicker ? "chevron-up" : "chevron-down"} size={18} color={theme.secondaryText} />
            </Pressable>
            {showAutoActionPicker ? (
              <Card elevation={2} style={{ marginTop: Spacing.xs, padding: Spacing.sm }}>
                {([
                  { key: "none" as const, label: "No Action" },
                  { key: "markAnswered" as const, label: "Mark Answered" },
                  { key: "archive" as const, label: "Archive" },
                ]).map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[styles.categoryOption, autoAfterEventAction === opt.key ? { backgroundColor: theme.primary + "15" } : null]}
                    onPress={() => { setAutoAfterEventAction(opt.key); setShowAutoActionPicker(false); markChanged(); }}
                  >
                    <ThemedText type="body" style={{ color: autoAfterEventAction === opt.key ? theme.primary : theme.text }}>
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </Card>
            ) : null}

            {autoAfterEventAction !== "none" ? (
              <View style={{ marginTop: Spacing.sm }}>
                <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
                  Days after event to trigger ({autoAfterEventDaysOffset})
                </ThemedText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                  <Pressable
                    onPress={() => { setAutoAfterEventDaysOffset(Math.max(0, autoAfterEventDaysOffset - 1)); markChanged(); }}
                    style={[styles.stepperBtn, { borderColor: theme.border }]}
                  >
                    <Feather name="minus" size={16} color={theme.text} />
                  </Pressable>
                  <ThemedText type="body" style={{ minWidth: 30, textAlign: "center" }}>
                    {autoAfterEventDaysOffset}
                  </ThemedText>
                  <Pressable
                    onPress={() => { setAutoAfterEventDaysOffset(autoAfterEventDaysOffset + 1); markChanged(); }}
                    style={[styles.stepperBtn, { borderColor: theme.border }]}
                  >
                    <Feather name="plus" size={16} color={theme.text} />
                  </Pressable>
                  <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                    days after event
                  </ThemedText>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card elevation={1} style={{ marginTop: Spacing.lg, padding: Spacing.md }}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="body">Pin to Daily</ThemedText>
            <ThemedText type="small" style={{ color: theme.secondaryText }}>
              Show in daily prayer rotation
            </ThemedText>
          </View>
          <Switch
            value={pinnedDaily}
            onValueChange={(val) => {
              setPinnedDaily(val);
              markChanged();
            }}
            trackColor={{ false: theme.border, true: theme.primary + "60" }}
            thumbColor={pinnedDaily ? theme.primary : theme.secondaryText}
          />
        </View>
        <View style={[styles.toggleRow, { marginTop: Spacing.md }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="body">High Priority</ThemedText>
            <ThemedText type="small" style={{ color: theme.secondaryText }}>
              Elevate this prayer in lists
            </ThemedText>
          </View>
          <Switch
            value={priority === 1}
            onValueChange={(val) => {
              setPriority(val ? 1 : 0);
              markChanged();
            }}
            trackColor={{ false: theme.border, true: theme.secondary + "60" }}
            thumbColor={priority === 1 ? theme.secondary : theme.secondaryText}
          />
        </View>
      </Card>

      {hasChanges ? (
        <Button
          onPress={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          style={{ marginTop: Spacing.lg }}
        >
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      ) : null}

      <Card elevation={1} style={{ marginTop: Spacing.lg, padding: Spacing.md }}>
        <ThemedText type="h3" style={{ marginBottom: Spacing.sm }}>
          Actions
        </ThemedText>

        {prayer.status === "OPEN" ? (
          <View>
            <Pressable
              style={[styles.actionBtn, { borderColor: theme.primary, backgroundColor: theme.primary + "10", marginTop: Spacing.sm }]}
              onPress={handleMarkAnswered}
              disabled={answerMutation.isPending}
            >
              <Feather name="check" size={16} color={theme.primary} style={{ marginRight: Spacing.xs }} />
              <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>
                {answerMutation.isPending ? "Saving..." : "Mark Answered"}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.outlineBtn, { borderColor: theme.border, marginTop: Spacing.sm }]}
              onPress={() => archiveMutation.mutate()}
            >
              <ThemedText type="body" style={{ color: theme.secondaryText }}>
                Archive
              </ThemedText>
            </Pressable>
          </View>
        ) : prayer.status === "ANSWERED" ? (
          <View>
            {prayer.answerNote ? (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                  Answer Note
                </ThemedText>
                <ThemedText type="body" style={{ marginTop: Spacing.xs, lineHeight: 22 }}>
                  {prayer.answerNote}
                </ThemedText>
              </View>
            ) : null}
            {prayer.answeredAt ? (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText type="caption" style={{ color: theme.success }}>
                  Answered {formatDate(prayer.answeredAt)}
                </ThemedText>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <Button
                onPress={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
                style={{ flex: 1 }}
              >
                Reopen
              </Button>
              <Pressable
                style={[styles.outlineBtn, { borderColor: theme.border }]}
                onPress={() => archiveMutation.mutate()}
              >
                <ThemedText type="body" style={{ color: theme.secondaryText }}>
                  Archive
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <Button
              onPress={() => unarchiveMutation.mutate()}
              disabled={unarchiveMutation.isPending}
              style={{ flex: 1 }}
            >
              Unarchive
            </Button>
            <Button
              onPress={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
              style={{ flex: 1 }}
            >
              Reopen
            </Button>
          </View>
        )}
      </Card>

      <Card elevation={1} style={{ marginTop: Spacing.lg, padding: Spacing.md }}>
        <ThemedText type="h3" style={{ marginBottom: Spacing.sm }}>
          Dates
        </ThemedText>
        <View style={styles.dateRow}>
          <Feather name="calendar" size={14} color={theme.secondaryText} />
          <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}>
            Created: {formatDate(prayer.createdAt)}
          </ThemedText>
        </View>
        <View style={styles.dateRow}>
          <Feather name="check-circle" size={14} color={theme.secondaryText} />
          <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}>
            Answered: {formatDate(prayer.answeredAt)}
          </ThemedText>
        </View>
        <View style={styles.dateRow}>
          <Feather name="archive" size={14} color={theme.secondaryText} />
          <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}>
            Archived: {formatDate(prayer.archivedAt)}
          </ThemedText>
        </View>
        <View style={styles.dateRow}>
          <Feather name="eye" size={14} color={theme.secondaryText} />
          <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}>
            Last Shown: {formatDate(prayer.lastShownAt)}
          </ThemedText>
        </View>
        <View style={styles.dateRow}>
          <Feather name="heart" size={14} color={theme.secondaryText} />
          <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: Spacing.xs }}>
            Last Prayed: {formatDate(prayer.lastPrayedAt)}
          </ThemedText>
        </View>
      </Card>

      <Pressable style={styles.deleteRow} onPress={handleDelete}>
        <Feather name="trash-2" size={16} color={theme.secondary} />
        <ThemedText type="caption" style={{ color: theme.secondary, marginLeft: Spacing.xs }}>
          Delete Prayer
        </ThemedText>
      </Pressable>
    </KeyboardAwareScrollViewCompat>
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
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 120,
    paddingTop: Spacing.sm + 2,
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    height: Spacing.inputHeight,
  },
  categoryOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  outlineBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 48,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
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
