import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  TextInput,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, useNavigation, RouteProp, useFocusEffect } from "@react-navigation/native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
  WithSpringConfig,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Shadows } from "@/constants/theme";
import {
  getOfficialById,
  getDistrictById,
  getOfficeTypeLabel,
  getDistrictTypeLabel,
  type Official,
  type Office,
} from "@/lib/mockData";
import { fetchOfficialById, updateOfficialPrivate } from "@/lib/officialsApi";
import { apiOfficialToLegacy } from "@/lib/officialsAdapter";
import {
  getPrivateNotes,
  savePrivateNotes,
  isOfficialSaved,
  saveOfficial,
  removeOfficial,
  type PrivateNotes,
} from "@/lib/storage";
import type { MapStackParamList } from "@/navigation/MapStackNavigator";

type RouteParams = RouteProp<MapStackParamList, "OfficialProfile">;

type TabType = "public" | "private";

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 180,
};

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function TabButton({ label, isActive, onPress }: TabButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
  };

  return (
    <Animated.View style={[styles.tabButton, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.tabButtonInner,
          {
            backgroundColor: isActive ? theme.primary : "transparent",
            borderColor: theme.border,
          },
        ]}
      >
        <ThemedText
          type="caption"
          style={{
            color: isActive ? "#FFFFFF" : theme.text,
            fontWeight: "600",
          }}
        >
          {label}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

interface ContactRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}

function ContactRow({ icon, label, value, onPress }: ContactRowProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.contactRow,
        { opacity: pressed && onPress ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.contactIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name={icon} size={16} color={theme.primary} />
      </View>
      <View style={styles.contactContent}>
        <ThemedText type="small" style={{ color: theme.secondaryText }}>
          {label}
        </ThemedText>
        <ThemedText type="body" style={onPress ? { color: theme.link } : undefined}>
          {value}
        </ThemedText>
      </View>
      {onPress ? (
        <Feather name="external-link" size={16} color={theme.secondaryText} />
      ) : null}
    </Pressable>
  );
}

export default function OfficialProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const route = useRoute<RouteParams>();
  const navigation = useNavigation();
  const { theme } = useTheme();

  const { officialId } = route.params;
  const [official, setOfficial] = useState<Official | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const district = official ? getDistrictById(official.districtId) : undefined;

  const [activeTab, setActiveTab] = useState<TabType>("public");
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [privateNotes, setPrivateNotes] = useState<PrivateNotes>({});

  const loadOfficial = useCallback(async () => {
    setIsLoading(true);
    try {
      const apiOfficial = await fetchOfficialById(officialId);
      if (apiOfficial) {
        setOfficial(apiOfficialToLegacy(apiOfficial));
      } else {
        const mockOfficial = getOfficialById(officialId);
        setOfficial(mockOfficial || null);
      }
    } catch (error) {
      console.error("Failed to fetch official from API:", error);
      const mockOfficial = getOfficialById(officialId);
      setOfficial(mockOfficial || null);
    }
    setIsLoading(false);
  }, [officialId]);

  const loadSavedState = useCallback(async () => {
    if (official) {
      const saved = await isOfficialSaved(official.id);
      setIsSaved(saved);
      const notes = await getPrivateNotes(official.id);
      if (notes) setPrivateNotes(notes);
    }
  }, [official]);

  useFocusEffect(
    useCallback(() => {
      loadOfficial();
    }, [loadOfficial])
  );

  useFocusEffect(
    useCallback(() => {
      if (official) {
        loadSavedState();
      }
    }, [official, loadSavedState])
  );

  useEffect(() => {
    if (official) {
      navigation.setOptions({
        headerTitle: official.fullName,
      });
    }
  }, [navigation, official]);

  const handleToggleSaved = useCallback(async () => {
    if (!official) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isSaved) {
      await removeOfficial(official.id);
      setIsSaved(false);
    } else {
      await saveOfficial(official.id);
      setIsSaved(true);
    }
  }, [official, isSaved]);

  const handleSaveNotes = useCallback(async () => {
    if (!official) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await savePrivateNotes(official.id, privateNotes);
    try {
      await updateOfficialPrivate(official.id, {
        personalPhone: privateNotes.personalPhone || null,
        personalAddress: privateNotes.personalAddress || null,
        spouseName: privateNotes.spouse || null,
        childrenNames: privateNotes.children ? [privateNotes.children] : null,
        birthday: privateNotes.birthday || null,
        anniversary: privateNotes.anniversary || null,
        notes: privateNotes.notes || null,
      });
    } catch (error) {
      console.error("Failed to sync private notes to API:", error);
    }
    setIsEditing(false);
  }, [official, privateNotes]);

  const handlePhonePress = useCallback((phone: string) => {
    const cleaned = phone.replace(/[^0-9]/g, "");
    Linking.openURL(`tel:${cleaned}`);
  }, []);

  const handleAddressPress = useCallback((address: string) => {
    const encoded = encodeURIComponent(address);
    const url = Platform.select({
      ios: `maps:?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
      default: `https://maps.google.com/?q=${encoded}`,
    });
    Linking.openURL(url);
  }, []);

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={styles.errorState}>
          <ThemedText type="body">Loading...</ThemedText>
        </View>
      </View>
    );
  }

  if (!official) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={styles.errorState}>
          <Feather name="alert-circle" size={48} color={theme.secondaryText} />
          <ThemedText type="body" style={{ marginTop: Spacing.md }}>
            Official not found
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {official.photoUrl ? (
              <Image source={{ uri: official.photoUrl }} style={styles.avatar} />
            ) : (
              <Image
                source={require("../../assets/images/default-avatar.png")}
                style={styles.avatar}
              />
            )}
          </View>
          <View style={styles.headerInfo}>
            <ThemedText type="h2">{official.fullName}</ThemedText>
            <ThemedText type="body" style={{ color: theme.secondaryText }}>
              {getOfficeTypeLabel(official.officeType)}
            </ThemedText>
            {district ? (
              <ThemedText type="caption" style={{ color: theme.secondaryText }}>
                {getDistrictTypeLabel(district.districtType)} District{" "}
                {district.districtNumber}
              </ThemedText>
            ) : null}
          </View>
          <Pressable
            onPress={handleToggleSaved}
            style={({ pressed }) => [
              styles.saveButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather
              name={isSaved ? "bookmark" : "bookmark"}
              size={24}
              color={isSaved ? theme.primary : theme.secondaryText}
              style={{ opacity: isSaved ? 1 : 0.5 }}
            />
          </Pressable>
        </View>

        <View style={styles.tabContainer}>
          <TabButton
            label="Public Info"
            isActive={activeTab === "public"}
            onPress={() => setActiveTab("public")}
          />
          <View style={{ width: Spacing.sm }} />
          <TabButton
            label="Private Notes"
            isActive={activeTab === "private"}
            onPress={() => setActiveTab("private")}
          />
        </View>

        {activeTab === "public" ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.tabContent}>
            <View style={styles.section}>
              <ThemedText type="h3" style={styles.sectionTitle}>
                Details
              </ThemedText>
              <ContactRow icon="map-pin" label="City" value={official.city} />
              <ContactRow icon="briefcase" label="Occupation" value={official.occupation} />
            </View>

            {official.offices.map((office) => (
              <View key={office.id} style={styles.section}>
                <ThemedText type="h3" style={styles.sectionTitle}>
                  {office.officeKind === "capitol" ? "Capitol Office" : "District Office"}
                </ThemedText>
                <ContactRow
                  icon="map"
                  label="Address"
                  value={office.address}
                  onPress={() => handleAddressPress(office.address)}
                />
                <ContactRow
                  icon="phone"
                  label="Phone"
                  value={office.phone}
                  onPress={() => handlePhonePress(office.phone)}
                />
              </View>
            ))}

            {official.staff.length > 0 ? (
              <View style={styles.section}>
                <ThemedText type="h3" style={styles.sectionTitle}>
                  Staff
                </ThemedText>
                {official.staff.map((staff) => (
                  <ContactRow
                    key={staff.id}
                    icon="user"
                    label={staff.role}
                    value={staff.name}
                  />
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)} style={styles.tabContent}>
            <View style={styles.editHeader}>
              <ThemedText type="h3">Private Notes</ThemedText>
              {isEditing ? (
                <Button onPress={handleSaveNotes} style={styles.saveNotesButton}>
                  Save
                </Button>
              ) : (
                <Pressable
                  onPress={() => setIsEditing(true)}
                  style={({ pressed }) => [
                    styles.editButton,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Feather name="edit-2" size={18} color={theme.primary} />
                  <ThemedText type="caption" style={{ color: theme.primary, marginLeft: 4 }}>
                    Edit
                  </ThemedText>
                </Pressable>
              )}
            </View>

            <ThemedText
              type="caption"
              style={{ color: theme.secondaryText, marginBottom: Spacing.md }}
            >
              This information is stored locally on your device and never synced.
            </ThemedText>

            <View style={styles.notesSection}>
              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Personal Phone
                </ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[
                      styles.noteInput,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    value={privateNotes.personalPhone || ""}
                    onChangeText={(text) =>
                      setPrivateNotes({ ...privateNotes, personalPhone: text })
                    }
                    placeholder="Add phone number..."
                    placeholderTextColor={theme.secondaryText}
                    keyboardType="phone-pad"
                  />
                ) : (
                  <ThemedText type="body">
                    {privateNotes.personalPhone || "Not set"}
                  </ThemedText>
                )}
              </View>

              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Personal Address
                </ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[
                      styles.noteInput,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    value={privateNotes.personalAddress || ""}
                    onChangeText={(text) =>
                      setPrivateNotes({ ...privateNotes, personalAddress: text })
                    }
                    placeholder="Add address..."
                    placeholderTextColor={theme.secondaryText}
                  />
                ) : (
                  <ThemedText type="body">
                    {privateNotes.personalAddress || "Not set"}
                  </ThemedText>
                )}
              </View>

              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Spouse
                </ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[
                      styles.noteInput,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    value={privateNotes.spouse || ""}
                    onChangeText={(text) =>
                      setPrivateNotes({ ...privateNotes, spouse: text })
                    }
                    placeholder="Add spouse name..."
                    placeholderTextColor={theme.secondaryText}
                  />
                ) : (
                  <ThemedText type="body">
                    {privateNotes.spouse || "Not set"}
                  </ThemedText>
                )}
              </View>

              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Children
                </ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[
                      styles.noteInput,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    value={privateNotes.children || ""}
                    onChangeText={(text) =>
                      setPrivateNotes({ ...privateNotes, children: text })
                    }
                    placeholder="Add children names..."
                    placeholderTextColor={theme.secondaryText}
                  />
                ) : (
                  <ThemedText type="body">
                    {privateNotes.children || "Not set"}
                  </ThemedText>
                )}
              </View>

              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Birthday
                </ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[
                      styles.noteInput,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    value={privateNotes.birthday || ""}
                    onChangeText={(text) =>
                      setPrivateNotes({ ...privateNotes, birthday: text })
                    }
                    placeholder="Add birthday..."
                    placeholderTextColor={theme.secondaryText}
                  />
                ) : (
                  <ThemedText type="body">
                    {privateNotes.birthday || "Not set"}
                  </ThemedText>
                )}
              </View>

              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Anniversary
                </ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[
                      styles.noteInput,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    value={privateNotes.anniversary || ""}
                    onChangeText={(text) =>
                      setPrivateNotes({ ...privateNotes, anniversary: text })
                    }
                    placeholder="Add anniversary..."
                    placeholderTextColor={theme.secondaryText}
                  />
                ) : (
                  <ThemedText type="body">
                    {privateNotes.anniversary || "Not set"}
                  </ThemedText>
                )}
              </View>

              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Notes
                </ThemedText>
                {isEditing ? (
                  <TextInput
                    style={[
                      styles.noteInput,
                      styles.notesTextArea,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    value={privateNotes.notes || ""}
                    onChangeText={(text) =>
                      setPrivateNotes({ ...privateNotes, notes: text })
                    }
                    placeholder="Add notes..."
                    placeholderTextColor={theme.secondaryText}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                ) : (
                  <ThemedText type="body">
                    {privateNotes.notes || "No notes"}
                  </ThemedText>
                )}
              </View>
            </View>
          </Animated.View>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    backgroundColor: "#E0E0E0",
  },
  avatar: {
    width: 80,
    height: 80,
  },
  headerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    gap: 2,
  },
  saveButton: {
    padding: Spacing.sm,
  },
  tabContainer: {
    flexDirection: "row",
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
  },
  tabButtonInner: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  tabContent: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  contactIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  contactContent: {
    flex: 1,
  },
  editHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.xs,
  },
  saveNotesButton: {
    height: 36,
    paddingHorizontal: Spacing.md,
  },
  notesSection: {
    gap: Spacing.md,
  },
  noteField: {
    gap: Spacing.xs,
  },
  noteInput: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  notesTextArea: {
    minHeight: 100,
    paddingTop: Spacing.sm,
  },
});
