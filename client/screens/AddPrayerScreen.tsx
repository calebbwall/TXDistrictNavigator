import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Alert,
  Pressable,
  Switch,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { invalidatePrayerQueries } from "@/lib/prayer-utils";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

type PrayerCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

type OfficialItem = {
  id: string;
  fullName: string;
  source: string;
  district: string;
  party: string | null;
};

export default function AddPrayerScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const queryClient = useQueryClient();

  const params = route.params as { officialId?: string; officialName?: string; categoryId?: string; categoryName?: string } | undefined;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinnedDaily, setPinnedDaily] = useState(false);
  const [priority, setPriority] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(params?.categoryId || null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedOfficialIds, setSelectedOfficialIds] = useState<string[]>(
    params?.officialId ? [params.officialId] : []
  );
  const [selectedOfficialNames, setSelectedOfficialNames] = useState<string[]>(
    params?.officialName ? [params.officialName] : []
  );
  const [showOfficialPicker, setShowOfficialPicker] = useState(false);
  const [officialSearch, setOfficialSearch] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [autoAfterEventAction, setAutoAfterEventAction] = useState<"none" | "markAnswered" | "archive">("none");
  const [autoAfterEventDaysOffset, setAutoAfterEventDaysOffset] = useState(0);
  const [showAutoActionPicker, setShowAutoActionPicker] = useState(false);

  const { data: categories = [], refetch: refetchCategories } = useQuery<PrayerCategory[]>({
    queryKey: ["/api/prayer-categories"],
  });

  const { data: officialsData } = useQuery<{ officials: OfficialItem[] }>({
    queryKey: ["/api/officials"],
  });

  const officials = officialsData?.officials ?? [];

  const filteredOfficials = officialSearch.trim().length > 0
    ? officials.filter((o) =>
        o.fullName.toLowerCase().includes(officialSearch.toLowerCase())
      )
    : officials;

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/prayer-categories", { name });
      return await res.json();
    },
    onSuccess: (newCat: PrayerCategory) => {
      setCategoryId(newCat.id);
      setNewCategoryName("");
      setShowNewCategoryModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-categories"] });
    },
    onError: (err: Error) => {
      const msg = err.message;
      if (msg.includes("already exists")) {
        Alert.alert("Duplicate", "A category with this name already exists.");
      } else {
        Alert.alert("Error", "Could not create category.");
      }
    },
  });

  const autoActionLabel = autoAfterEventAction === "markAnswered" ? "Mark Answered" : autoAfterEventAction === "archive" ? "Archive" : "No Action";

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        pinnedDaily,
        priority,
        categoryId: categoryId || null,
        officialIds: selectedOfficialIds,
        eventDate: eventDate ? eventDate.toISOString() : null,
        autoAfterEventAction,
        autoAfterEventDaysOffset,
      };
      await apiRequest("POST", "/api/prayers", payload);
    },
    onSuccess: () => {
      invalidatePrayerQueries(queryClient);
      navigation.goBack();
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const canSave = title.trim().length > 0 && body.trim().length > 0 && selectedOfficialIds.length > 0;

  const currentCategoryName = categories.find((c) => c.id === categoryId)?.name ?? "None";

  const toggleOfficial = (official: OfficialItem) => {
    setSelectedOfficialIds((prev) => {
      if (prev.includes(official.id)) {
        setSelectedOfficialNames((names) => names.filter((_, i) => prev[i] !== official.id));
        return prev.filter((id) => id !== official.id);
      }
      setSelectedOfficialNames((names) => [...names, official.fullName]);
      return [...prev, official.id];
    });
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "TX_HOUSE": return "TX House";
      case "TX_SENATE": return "TX Senate";
      case "US_HOUSE": return "US House";
      case "OTHER_TX": return "Statewide";
      default: return source;
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingHorizontal: Spacing.md,
        paddingBottom: insets.bottom + Spacing.xxl,
      }}
    >
      {selectedOfficialNames.length > 0 ? (
        <View style={styles.officialBadgesRow}>
          {selectedOfficialNames.map((name, idx) => (
            <View key={idx} style={[styles.officialBadge, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="user" size={14} color={theme.primary} />
              <ThemedText type="caption" style={{ color: theme.primary, marginLeft: Spacing.xs }}>
                {name}
              </ThemedText>
              {params?.officialId ? null : (
                <Pressable
                  onPress={() => {
                    setSelectedOfficialIds((prev) => prev.filter((_, i) => i !== idx));
                    setSelectedOfficialNames((prev) => prev.filter((_, i) => i !== idx));
                  }}
                  hitSlop={8}
                  style={{ marginLeft: Spacing.xs }}
                >
                  <Feather name="x" size={14} color={theme.primary} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}

      <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>Title</ThemedText>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
        placeholder="Prayer title..."
        placeholderTextColor={theme.secondaryText}
        value={title}
        onChangeText={setTitle}
        maxLength={500}
      />

      <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>Prayer</ThemedText>
      <TextInput
        style={[styles.input, styles.textArea, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
        placeholder="Write your prayer..."
        placeholderTextColor={theme.secondaryText}
        value={body}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
      />

      <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>Category</ThemedText>
      <Pressable
        style={[styles.dropdownButton, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
        onPress={() => setShowCategoryPicker(!showCategoryPicker)}
      >
        <ThemedText type="body" style={{ color: theme.text, flex: 1 }}>
          {currentCategoryName}
        </ThemedText>
        <Feather name={showCategoryPicker ? "chevron-up" : "chevron-down"} size={18} color={theme.secondaryText} />
      </Pressable>
      {showCategoryPicker ? (
        <Card elevation={2} style={{ marginTop: Spacing.xs, padding: Spacing.sm }}>
          <Pressable
            style={[styles.categoryOption, categoryId === null ? { backgroundColor: theme.primary + "15" } : null]}
            onPress={() => { setCategoryId(null); setShowCategoryPicker(false); }}
          >
            <ThemedText type="body" style={{ color: categoryId === null ? theme.primary : theme.text }}>None</ThemedText>
          </Pressable>
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              style={[styles.categoryOption, categoryId === cat.id ? { backgroundColor: theme.primary + "15" } : null]}
              onPress={() => { setCategoryId(cat.id); setShowCategoryPicker(false); }}
            >
              <ThemedText type="body" style={{ color: categoryId === cat.id ? theme.primary : theme.text }}>{cat.name}</ThemedText>
            </Pressable>
          ))}
          <Pressable
            style={[styles.categoryOption, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, marginTop: Spacing.xs }]}
            onPress={() => { setShowCategoryPicker(false); setShowNewCategoryModal(true); }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Feather name="plus" size={16} color={theme.primary} style={{ marginRight: Spacing.xs }} />
              <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>New Category</ThemedText>
            </View>
          </Pressable>
        </Card>
      ) : null}

      {params?.officialId ? null : (
        <View style={{ marginTop: Spacing.md }}>
          <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>
            Officials {selectedOfficialIds.length > 0 ? `(${selectedOfficialIds.length})` : "(required)"}
          </ThemedText>
          <Pressable
            style={[styles.dropdownButton, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
            onPress={() => setShowOfficialPicker(true)}
          >
            <ThemedText type="body" style={{ color: selectedOfficialIds.length > 0 ? theme.text : theme.secondaryText, flex: 1 }}>
              {selectedOfficialIds.length > 0 ? `${selectedOfficialIds.length} selected` : "Select officials..."}
            </ThemedText>
            <Feather name="users" size={18} color={theme.secondaryText} />
          </Pressable>
        </View>
      )}

      <View style={{ marginTop: Spacing.md }}>
        <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText, marginTop: 0 }]}>Event Date</ThemedText>
        <Pressable
          style={[styles.dropdownButton, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}
          onPress={() => setShowDatePicker(true)}
        >
          <Feather name="calendar" size={16} color={eventDate ? theme.warning : theme.secondaryText} style={{ marginRight: Spacing.sm }} />
          <ThemedText type="body" style={{ color: eventDate ? theme.text : theme.secondaryText, flex: 1 }}>
            {eventDate ? eventDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "No event date"}
          </ThemedText>
          {eventDate ? (
            <Pressable onPress={() => { setEventDate(null); setAutoAfterEventAction("none"); }} hitSlop={8}>
              <Feather name="x-circle" size={16} color={theme.secondaryText} />
            </Pressable>
          ) : null}
        </Pressable>
        {showDatePicker ? (
          Platform.OS === "web" ? (
            <View style={{ marginTop: Spacing.sm }}>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.inputBackground, borderColor: theme.border }]}
                value={eventDate ? eventDate.toISOString().split("T")[0] : ""}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.secondaryText}
                onChangeText={(text) => {
                  const parsed = new Date(text + "T12:00:00");
                  if (!isNaN(parsed.getTime()) && text.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    setEventDate(parsed);
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
              minimumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS === "android") setShowDatePicker(false);
                if (date) setEventDate(date);
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
      </View>

      {eventDate ? (
        <View style={{ marginTop: Spacing.md }}>
          <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText, marginTop: 0 }]}>After Event</ThemedText>
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
                  onPress={() => { setAutoAfterEventAction(opt.key); setShowAutoActionPicker(false); }}
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
                  onPress={() => setAutoAfterEventDaysOffset(Math.max(0, autoAfterEventDaysOffset - 1))}
                  style={[styles.stepperBtn, { borderColor: theme.border }]}
                >
                  <Feather name="minus" size={16} color={theme.text} />
                </Pressable>
                <ThemedText type="body" style={{ minWidth: 30, textAlign: "center" }}>
                  {autoAfterEventDaysOffset}
                </ThemedText>
                <Pressable
                  onPress={() => setAutoAfterEventDaysOffset(autoAfterEventDaysOffset + 1)}
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

      <View style={styles.optionRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="body">Pin to Daily Picks</ThemedText>
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>Always include in today's prayers</ThemedText>
        </View>
        <Switch value={pinnedDaily} onValueChange={setPinnedDaily} />
      </View>

      <View style={styles.optionRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="body">High Priority</ThemedText>
          <ThemedText type="caption" style={{ color: theme.secondaryText }}>Weighted higher in rotation</ThemedText>
        </View>
        <Switch value={priority === 1} onValueChange={(v) => setPriority(v ? 1 : 0)} />
      </View>

      <Button
        onPress={() => createMutation.mutate()}
        disabled={!canSave || createMutation.isPending}
        style={styles.addButton}
      >
        {createMutation.isPending ? "Saving..." : "Add Prayer"}
      </Button>

      {!canSave && title.trim().length > 0 && body.trim().length > 0 && selectedOfficialIds.length === 0 ? (
        <ThemedText type="caption" style={{ color: theme.warning, textAlign: "center", marginTop: Spacing.sm }}>
          Please select at least one official
        </ThemedText>
      ) : null}

      <Modal visible={showNewCategoryModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewCategoryModal(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]} onPress={() => {}}>
            <ThemedText type="h3" style={{ marginBottom: Spacing.md }}>New Category</ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border }]}
              placeholder="Category name..."
              placeholderTextColor={theme.secondaryText}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md }}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => { setShowNewCategoryModal(false); setNewCategoryName(""); }}
              >
                <ThemedText type="body" style={{ color: theme.text }}>Cancel</ThemedText>
              </Pressable>
              <Button
                onPress={() => {
                  if (newCategoryName.trim().length > 0) {
                    createCategoryMutation.mutate(newCategoryName.trim());
                  }
                }}
                disabled={newCategoryName.trim().length === 0 || createCategoryMutation.isPending}
                style={{ flex: 1 }}
              >
                {createCategoryMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showOfficialPicker} transparent animationType="slide">
        <View style={[styles.officialPickerContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.officialPickerHeader, { borderBottomColor: theme.border }]}>
            <ThemedText type="h3">Select Officials</ThemedText>
            <Pressable onPress={() => { setShowOfficialPicker(false); setOfficialSearch(""); }} hitSlop={8}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}>
            <View style={[styles.searchBox, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
              <Feather name="search" size={16} color={theme.secondaryText} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search officials..."
                placeholderTextColor={theme.secondaryText}
                value={officialSearch}
                onChangeText={setOfficialSearch}
              />
              {officialSearch.length > 0 ? (
                <Pressable onPress={() => setOfficialSearch("")} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={theme.secondaryText} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <FlatList
            data={filteredOfficials}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selectedOfficialIds.includes(item.id);
              return (
                <Pressable
                  style={[styles.officialRow, { borderBottomColor: theme.border }]}
                  onPress={() => toggleOfficial(item)}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: isSelected ? "700" : "400" }}>
                      {item.fullName}
                    </ThemedText>
                    <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                      {getSourceLabel(item.source)} - District {item.district}
                    </ThemedText>
                  </View>
                  <Feather
                    name={isSelected ? "check-square" : "square"}
                    size={20}
                    color={isSelected ? theme.primary : theme.secondaryText}
                  />
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: Spacing.xl }}>
                <ThemedText type="body" style={{ color: theme.secondaryText }}>No officials found</ThemedText>
              </View>
            }
          />
          <View style={[styles.officialPickerFooter, { backgroundColor: theme.backgroundDefault, paddingBottom: insets.bottom + Spacing.md }]}>
            <ThemedText type="caption" style={{ color: theme.secondaryText }}>
              {selectedOfficialIds.length} selected
            </ThemedText>
            <Button onPress={() => { setShowOfficialPicker(false); setOfficialSearch(""); }}>
              Done
            </Button>
          </View>
        </View>
      </Modal>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: { marginTop: Spacing.md, marginBottom: Spacing.xs, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 15,
  },
  textArea: { minHeight: 120 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
  },
  officialBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  officialBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    minHeight: 48,
  },
  categoryOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
  },
  addButton: {
    marginTop: Spacing.lg,
    minHeight: 48,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  officialPickerContainer: {
    flex: 1,
    paddingTop: 50,
  },
  officialPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  officialPickerFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 40,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  officialRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
