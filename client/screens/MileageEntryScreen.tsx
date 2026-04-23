import React, { useState, useCallback, useEffect, useLayoutEffect } from "react";
import {
  View,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActionSheetIOS,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import {
  getMileageEntries,
  saveMileageEntry,
  updateMileageEntry,
  type MileageEntry,
} from "@/lib/storage";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;
type RoutePropType = RouteProp<ProfileStackParamList, "MileageEntry">;

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

async function copyToAppStorage(uri: string): Promise<string> {
  const filename = `mileage_${Date.now()}.jpg`;
  const src = new File(uri);
  const dest = new File(Paths.document, filename);
  await src.copy(dest);
  return dest.uri;
}

async function promptPhotoSource(
  setUri: (uri: string) => void
): Promise<void> {
  const persistUri = async (rawUri: string): Promise<string> => {
    try {
      return await copyToAppStorage(rawUri);
    } catch (e) {
      console.error("[MileageEntry] photo copy failed, using raw URI:", e);
      return rawUri;
    }
  };

  const handleChoice = async (index: number) => {
    if (index === 0) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Camera access is needed to take a photo."
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled) {
        const persisted = await persistUri(result.assets[0].uri);
        setUri(persisted);
      }
    } else if (index === 1) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Photo library access is needed to select a photo."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.7,
      });
      if (!result.canceled) {
        const persisted = await persistUri(result.assets[0].uri);
        setUri(persisted);
      }
    }
  };

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Take Photo", "Choose from Library", "Cancel"],
        cancelButtonIndex: 2,
      },
      handleChoice
    );
  } else {
    Alert.alert("Add Photo", undefined, [
      { text: "Take Photo", onPress: () => handleChoice(0) },
      { text: "Choose from Library", onPress: () => handleChoice(1) },
      { text: "Cancel", style: "cancel" },
    ]);
  }
}

export default function MileageEntryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const entryId = route.params?.entryId;

  const [existing, setExisting] = useState<MileageEntry | undefined>();
  const [date, setDate] = useState(getToday());
  const [description, setDescription] = useState("");
  const [startMileage, setStartMileage] = useState("");
  const [endMileage, setEndMileage] = useState("");
  const [startPhotoUri, setStartPhotoUri] = useState<string | undefined>();
  const [endPhotoUri, setEndPhotoUri] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const loadExisting = useCallback(async () => {
    if (!entryId) return;
    const entries = await getMileageEntries();
    const found = entries.find((e) => e.id === entryId);
    if (found) {
      setExisting(found);
      setDate(found.date);
      setDescription(found.description);
      setStartMileage(String(found.startMileage));
      if (found.endMileage !== undefined) setEndMileage(String(found.endMileage));
      setStartPhotoUri(found.startPhotoUri);
      setEndPhotoUri(found.endPhotoUri);
    }
  }, [entryId]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  // Derive mode from state
  const isNew = !entryId;
  const isInProgress = existing?.status === "in_progress";
  const isCompleted = existing?.status === "completed";

  useLayoutEffect(() => {
    if (isNew) {
      navigation.setOptions({ headerTitle: "Start Trip" });
    } else if (isInProgress) {
      navigation.setOptions({ headerTitle: "Complete Trip" });
    } else if (isCompleted) {
      navigation.setOptions({ headerTitle: "Edit Entry" });
    }
  }, [navigation, isNew, isInProgress, isCompleted]);

  const startNum = parseFloat(startMileage);
  const endNum = parseFloat(endMileage);
  const totalMiles =
    !isNaN(startNum) && !isNaN(endNum) && endNum >= startNum
      ? endNum - startNum
      : null;

  // Validation depends on mode
  const isStartValid =
    description.trim().length > 0 && !isNaN(startNum);
  const isCompleteValid =
    !isNaN(endNum) && !isNaN(startNum) && endNum >= startNum;
  const isEditValid =
    description.trim().length > 0 &&
    !isNaN(startNum) &&
    !isNaN(endNum) &&
    endNum >= startNum;

  const handleSave = useCallback(async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isNew) {
        // Start Trip: save as in_progress
        const entry: MileageEntry = {
          id: String(Date.now()) + String(Math.random()).slice(2, 8),
          date,
          description: description.trim(),
          startMileage: startNum,
          startPhotoUri,
          status: "in_progress",
          createdAt: new Date().toISOString(),
        };
        await saveMileageEntry(entry);
      } else if (isInProgress) {
        // Complete Trip: update with end data
        const updated: MileageEntry = {
          ...existing!,
          endMileage: endNum,
          totalMiles: endNum - existing!.startMileage,
          endPhotoUri,
          status: "completed",
        };
        await updateMileageEntry(updated);
      } else {
        // Edit completed entry: save all fields
        const entry: MileageEntry = {
          id: entryId!,
          date,
          description: description.trim(),
          startMileage: startNum,
          endMileage: endNum,
          totalMiles: endNum - startNum,
          startPhotoUri,
          endPhotoUri,
          status: "completed",
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        await updateMileageEntry(entry);
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }, [
    isNew,
    isInProgress,
    existing,
    entryId,
    date,
    description,
    startNum,
    endNum,
    startPhotoUri,
    endPhotoUri,
    navigation,
  ]);

  const saveDisabled =
    saving ||
    (isNew && !isStartValid) ||
    (isInProgress && !isCompleteValid) ||
    (isCompleted && !isEditValid);

  const buttonLabel = saving
    ? "Saving…"
    : isNew
    ? "Start Trip"
    : isInProgress
    ? "Complete Trip"
    : "Save Changes";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + Spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Mode B: Complete Trip — show read-only start summary at top ── */}
        {isInProgress && existing && (
          <>
            <View style={[styles.summaryCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
                Trip Started
              </ThemedText>
              <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={2}>
                {existing.description}
              </ThemedText>
              <ThemedText type="caption" style={{ color: theme.secondaryText, marginTop: 2 }}>
                {existing.date} · {existing.startMileage} mi start
              </ThemedText>
              {existing.startPhotoUri && (
                <Image
                  source={{ uri: existing.startPhotoUri }}
                  style={styles.summaryPhoto}
                  contentFit="cover"
                />
              )}
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <ThemedText type="caption" style={[styles.sectionLabel, { color: theme.secondaryText }]}>
              Now add your ending details
            </ThemedText>
          </>
        )}

        {/* ── Mode A & C: Date ── */}
        {(isNew || isCompleted) && (
          <View style={styles.fieldGroup}>
            <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>
              Date
            </ThemedText>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.secondaryText}
              style={[
                styles.input,
                { backgroundColor: theme.cardBackground, color: theme.text, borderColor: theme.border },
              ]}
              keyboardType="numbers-and-punctuation"
            />
          </View>
        )}

        {/* ── Mode A & C: Description ── */}
        {(isNew || isCompleted) && (
          <View style={styles.fieldGroup}>
            <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>
              Where are you going and what is this for?
            </ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Drive to food pantry to drop off donations"
              placeholderTextColor={theme.secondaryText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: theme.cardBackground, color: theme.text, borderColor: theme.border },
              ]}
            />
          </View>
        )}

        {/* ── Starting Mileage (Mode A & C) ── */}
        {(isNew || isCompleted) && (
          <View style={styles.fieldGroup}>
            <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>
              Starting Mileage
            </ThemedText>
            <View style={styles.mileageInputWrap}>
              <TextInput
                value={startMileage}
                onChangeText={setStartMileage}
                placeholder="00000"
                placeholderTextColor={theme.secondaryText}
                keyboardType="numeric"
                style={[
                  styles.input,
                  styles.mileageInput,
                  { backgroundColor: theme.cardBackground, color: theme.text, borderColor: theme.border },
                ]}
              />
              <ThemedText type="caption" style={[styles.miLabel, { color: theme.secondaryText }]}>
                mi
              </ThemedText>
            </View>
          </View>
        )}

        {/* ── Start Odometer Photo (Mode A & C) ── */}
        {(isNew || isCompleted) && (
          <View style={styles.fieldGroup}>
            <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>
              Starting Odometer Photo
            </ThemedText>
            {startPhotoUri ? (
              <View style={styles.photoPreview}>
                <Image source={{ uri: startPhotoUri }} style={styles.photoFull} contentFit="cover" />
                <Pressable
                  onPress={() => setStartPhotoUri(undefined)}
                  style={[styles.removePhotoBtn, { backgroundColor: theme.cardBackground }]}
                >
                  <Feather name="x" size={16} color={theme.secondaryText} />
                  <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: 4 }}>
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => promptPhotoSource(setStartPhotoUri)}
                style={[styles.photoButton, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
              >
                <Feather name="camera" size={22} color={theme.primary} />
                <ThemedText type="body" style={{ color: theme.primary, marginTop: Spacing.xs }}>
                  Add Start Photo
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Ending Mileage (Mode B & C) ── */}
        {(isInProgress || isCompleted) && (
          <View style={styles.fieldGroup}>
            <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>
              Ending Mileage
            </ThemedText>
            <View style={styles.mileageInputWrap}>
              <TextInput
                value={endMileage}
                onChangeText={setEndMileage}
                placeholder="00000"
                placeholderTextColor={theme.secondaryText}
                keyboardType="numeric"
                style={[
                  styles.input,
                  styles.mileageInput,
                  {
                    backgroundColor: theme.cardBackground,
                    color: theme.text,
                    borderColor:
                      endMileage && !isNaN(endNum) && endNum < startNum
                        ? "#FF3B30"
                        : theme.border,
                  },
                ]}
              />
              <ThemedText type="caption" style={[styles.miLabel, { color: theme.secondaryText }]}>
                mi
              </ThemedText>
            </View>
          </View>
        )}

        {/* ── Total Miles Display (Mode B & C) ── */}
        {(isInProgress || isCompleted) && (
          <>
            <View
              style={[
                styles.totalCard,
                { backgroundColor: totalMiles !== null ? theme.primary + "15" : theme.cardBackground },
              ]}
            >
              <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                Total Miles
              </ThemedText>
              <ThemedText
                type="h2"
                style={{ color: totalMiles !== null ? theme.primary : theme.secondaryText }}
              >
                {totalMiles !== null ? `${totalMiles.toFixed(1)} mi` : "—"}
              </ThemedText>
            </View>

            {endMileage && !isNaN(endNum) && endNum < (existing?.startMileage ?? startNum) && (
              <ThemedText
                type="caption"
                style={{ color: "#FF3B30", marginBottom: Spacing.md, textAlign: "center" }}
              >
                Ending mileage must be greater than starting mileage.
              </ThemedText>
            )}
          </>
        )}

        {/* ── End Odometer Photo (Mode B & C) ── */}
        {(isInProgress || isCompleted) && (
          <View style={styles.fieldGroup}>
            <ThemedText type="caption" style={[styles.label, { color: theme.secondaryText }]}>
              Ending Odometer Photo
            </ThemedText>
            {endPhotoUri ? (
              <View style={styles.photoPreview}>
                <Image source={{ uri: endPhotoUri }} style={styles.photoFull} contentFit="cover" />
                <Pressable
                  onPress={() => setEndPhotoUri(undefined)}
                  style={[styles.removePhotoBtn, { backgroundColor: theme.cardBackground }]}
                >
                  <Feather name="x" size={16} color={theme.secondaryText} />
                  <ThemedText type="caption" style={{ color: theme.secondaryText, marginLeft: 4 }}>
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => promptPhotoSource(setEndPhotoUri)}
                style={[styles.photoButton, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
              >
                <Feather name="camera" size={22} color={theme.primary} />
                <ThemedText type="body" style={{ color: theme.primary, marginTop: Spacing.xs }}>
                  Add End Photo
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Save Button ── */}
        <Pressable
          onPress={handleSave}
          disabled={saveDisabled}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: !saveDisabled ? theme.primary : theme.backgroundSecondary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Feather
            name={saving ? "loader" : isNew ? "play" : isInProgress ? "check-circle" : "check"}
            size={18}
            color={!saveDisabled ? "#fff" : theme.secondaryText}
          />
          <ThemedText
            type="body"
            style={{
              color: !saveDisabled ? "#fff" : theme.secondaryText,
              marginLeft: Spacing.sm,
              fontWeight: "600",
            }}
          >
            {buttonLabel}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg },
  fieldGroup: { marginBottom: Spacing.lg },
  label: { marginBottom: Spacing.xs },
  sectionLabel: { marginBottom: Spacing.lg, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    paddingTop: Spacing.sm,
  },
  mileageInputWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  mileageInput: { flex: 1 },
  miLabel: { marginLeft: Spacing.xs },
  totalCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  summaryPhoto: {
    width: "100%",
    height: 120,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  divider: {
    height: 1,
    marginBottom: Spacing.lg,
  },
  photoButton: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPreview: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  photoFull: {
    width: "100%",
    height: 200,
    borderRadius: BorderRadius.md,
  },
  removePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
});
