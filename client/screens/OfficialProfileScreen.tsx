import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Image,
  Pressable,
  TextInput,
  Linking,
  Platform,
  Alert,
  ScrollView,
  LayoutChangeEvent,
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
import AppIcon from "@/components/AppIcon";
import type { IconName } from "@/components/AppIcon";
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
  saveOfficialWithData,
  removeOfficialByKey,
  isOfficialSavedByKey,
  getNotesPrayer,
  addNotePrayer,
  deleteNotePrayer,
  getEngagementLog,
  addEngagement,
  deleteEngagement,
  addRecentEngaged,
  type PrivateNotes,
  type NotePrayerEntry,
  type EngagementEntry,
} from "@/lib/storage";
import type { MapStackParamList } from "@/navigation/MapStackNavigator";

type OfficialProfileParams = { officialId: string; initialSection?: "privateNotes" };
type RouteParams = RouteProp<{ OfficialProfile: OfficialProfileParams }, "OfficialProfile">;

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
  icon: IconName;
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
        <AppIcon name={icon} size={16} color={theme.primary} />
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
        <AppIcon name="external-link" size={16} color={theme.secondaryText} />
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

  const { officialId, initialSection } = route.params;
  const [official, setOfficial] = useState<Official | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const [notesSectionY, setNotesSectionY] = useState<number | null>(null);
  const [hasScrolledToNotes, setHasScrolledToNotes] = useState(false);

  const district = official ? getDistrictById(official.districtId) : undefined;

  const [activeTab, setActiveTab] = useState<TabType>(initialSection === "privateNotes" ? "private" : "public");
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [privateNotes, setPrivateNotes] = useState<PrivateNotes>({});
  const [notesPrayer, setNotesPrayer] = useState<NotePrayerEntry[]>([]);
  const [engagementLog, setEngagementLog] = useState<EngagementEntry[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteFollowUp, setNewNoteFollowUp] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [engagementNote, setEngagementNote] = useState("");

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
      const notes = await getPrivateNotes(official.id);
      if (notes) setPrivateNotes(notes);
      
      if (official.source && official.districtNumber) {
        const saved = await isOfficialSavedByKey(official.source, official.districtNumber);
        setIsSaved(saved);
        const npEntries = await getNotesPrayer(official.source, official.districtNumber);
        setNotesPrayer(npEntries);
        const engEntries = await getEngagementLog(official.source, official.districtNumber);
        setEngagementLog(engEntries);
        if (engEntries.length > 0 && engEntries[0].summary) {
          setEngagementNote(engEntries[0].summary);
        }
      }
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

  useEffect(() => {
    if (
      initialSection === "privateNotes" &&
      notesSectionY !== null &&
      !hasScrolledToNotes &&
      !isLoading &&
      scrollViewRef.current
    ) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: notesSectionY - 20,
          animated: true,
        });
        setHasScrolledToNotes(true);
      }, 100);
    }
  }, [initialSection, notesSectionY, hasScrolledToNotes, isLoading]);

  const handleNotesSectionLayout = useCallback((event: LayoutChangeEvent) => {
    const { y } = event.nativeEvent.layout;
    setNotesSectionY(y);
  }, []);

  const handleToggleSaved = useCallback(async () => {
    if (!official || !official.source || !official.districtNumber) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isSaved) {
      await removeOfficialByKey(official.source, official.districtNumber);
      setIsSaved(false);
    } else {
      await saveOfficialWithData(
        official.source,
        official.districtNumber,
        official.fullName,
        undefined,
        official.photoUrl || undefined
      );
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

  const handleAddNotePrayer = useCallback(async () => {
    if (!official?.source || !official?.districtNumber || !newNoteText.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry = await addNotePrayer(official.source, official.districtNumber, newNoteText.trim(), newNoteFollowUp);
    setNotesPrayer(prev => [entry, ...prev]);
    setNewNoteText("");
    setNewNoteFollowUp(false);
    setShowAddNote(false);
  }, [official, newNoteText, newNoteFollowUp]);

  const handleDeleteNotePrayer = useCallback(async (entryId: string) => {
    if (!official?.source || !official?.districtNumber) return;
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await deleteNotePrayer(official.source!, official.districtNumber!, entryId);
          setNotesPrayer(prev => prev.filter(e => e.id !== entryId));
        },
      },
    ]);
  }, [official]);

  const handleSetEngagementDate = useCallback(async (selectedDate: Date) => {
    if (!official?.source || !official?.districtNumber) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry = await addEngagement(
      official.source, 
      official.districtNumber, 
      selectedDate.toISOString(), 
      engagementNote.trim() || undefined
    );
    setEngagementLog([entry]);
    addRecentEngaged(official.source, official.districtNumber);
    setShowDatePicker(false);
  }, [official, engagementNote]);

  const handleSaveEngagementNote = useCallback(async () => {
    if (!official?.source || !official?.districtNumber) return;
    if (engagementLog.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const currentEntry = engagementLog[0];
    const updatedEntry = await addEngagement(
      official.source,
      official.districtNumber,
      currentEntry.engagedAt,
      engagementNote.trim() || undefined
    );
    setEngagementLog([updatedEntry]);
  }, [official, engagementLog, engagementNote]);

  const handleClearEngagement = useCallback(async () => {
    if (!official?.source || !official?.districtNumber) return;
    Alert.alert("Clear Engagement", "Are you sure you want to clear the last engaged date?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (engagementLog.length > 0) {
            await deleteEngagement(official.source!, official.districtNumber!, engagementLog[0].id);
          }
          setEngagementLog([]);
          setEngagementNote("");
        },
      },
    ]);
  }, [official, engagementLog]);

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
          <AppIcon name="alert-circle" size={48} color={theme.secondaryText} />
          <ThemedText type="body" style={{ marginTop: Spacing.md }}>
            Official not found
          </ThemedText>
        </View>
      </View>
    );
  }

  const isVacant = official.isVacant === true;

  if (isVacant) {
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
          <View style={styles.vacantHeader}>
            <View style={[styles.vacantAvatarContainer, { borderColor: theme.warning }]}>
              <AppIcon name="user-x" size={40} color={theme.secondaryText} />
            </View>
            <ThemedText type="h2" style={{ marginTop: Spacing.lg, textAlign: "center" }}>
              Vacant Seat
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.xs, textAlign: "center" }}>
              {getOfficeTypeLabel(official.officeType)} - {district ? `District ${district.districtNumber}` : ""}
            </ThemedText>
          </View>
          
          <View style={[styles.vacantCard, { backgroundColor: theme.cardBackground, borderColor: theme.warning }]}>
            <AppIcon name="info" size={24} color={theme.warning} />
            <View style={styles.vacantCardContent}>
              <ThemedText type="h3">This District is Currently Vacant</ThemedText>
              <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.xs }}>
                There is no representative currently serving this district. A special election or appointment may be pending to fill this seat.
              </ThemedText>
            </View>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <KeyboardAwareScrollViewCompat
        ref={scrollViewRef}
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
            <AppIcon
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
                  <AppIcon name="edit-2" size={18} color={theme.primary} />
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

            <View 
              style={[styles.section, { marginTop: Spacing.xl }]}
              onLayout={handleNotesSectionLayout}
            >
              <View style={styles.editHeader}>
                <View>
                  <ThemedText type="h3">Private Notes & Prayer</ThemedText>
                  <ThemedText type="small" style={{ color: theme.secondaryText }}>
                    Private to this device.
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => setShowAddNote(!showAddNote)}
                  style={({ pressed }) => [
                    styles.addButton,
                    { backgroundColor: theme.primary, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <AppIcon name={showAddNote ? "x" : "plus"} size={16} color="#FFFFFF" />
                  <ThemedText type="caption" style={{ color: "#FFFFFF", marginLeft: 4 }}>
                    {showAddNote ? "Cancel" : "Add Note"}
                  </ThemedText>
                </Pressable>
              </View>

              {showAddNote ? (
                <View style={[styles.addEntryForm, { backgroundColor: theme.cardBackground }]}>
                  <TextInput
                    style={[
                      styles.noteInput,
                      styles.notesTextArea,
                      { backgroundColor: theme.inputBackground, color: theme.text },
                    ]}
                    value={newNoteText}
                    onChangeText={setNewNoteText}
                    placeholder="Enter your note or prayer..."
                    placeholderTextColor={theme.secondaryText}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  <Pressable
                    onPress={() => setNewNoteFollowUp(!newNoteFollowUp)}
                    style={styles.checkboxRow}
                  >
                    <View style={[
                      styles.checkbox,
                      { borderColor: theme.border },
                      newNoteFollowUp && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}>
                      {newNoteFollowUp ? <AppIcon name="check" size={14} color="#FFFFFF" /> : null}
                    </View>
                    <ThemedText type="body">Follow-up needed</ThemedText>
                  </Pressable>
                  <Button onPress={handleAddNotePrayer} disabled={!newNoteText.trim()}>
                    Save Note
                  </Button>
                </View>
              ) : null}

              {notesPrayer.length > 0 ? (
                <View style={styles.entriesList}>
                  {notesPrayer.map((entry) => (
                    <View key={entry.id} style={[styles.entryCard, { backgroundColor: theme.cardBackground }]}>
                      <View style={styles.entryHeader}>
                        <ThemedText type="small" style={{ color: theme.secondaryText }}>
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </ThemedText>
                        <View style={styles.entryActions}>
                          {entry.followUpNeeded ? (
                            <View style={[styles.followUpBadge, { backgroundColor: theme.primary }]}>
                              <ThemedText type="small" style={{ color: "#FFFFFF" }}>Follow-up</ThemedText>
                            </View>
                          ) : null}
                          <Pressable onPress={() => handleDeleteNotePrayer(entry.id)}>
                            <AppIcon name="trash-2" size={16} color={theme.secondaryText} />
                          </Pressable>
                        </View>
                      </View>
                      <ThemedText type="body">{entry.text}</ThemedText>
                    </View>
                  ))}
                </View>
              ) : (
                <ThemedText type="body" style={{ color: theme.secondaryText, fontStyle: "italic" }}>
                  No notes yet.
                </ThemedText>
              )}
            </View>

            <View style={[styles.section, { marginTop: Spacing.xl }]}>
              <ThemedText type="h3" style={{ marginBottom: Spacing.md }}>Last Engaged</ThemedText>
              
              <View style={styles.engagementDateRow}>
                <View style={styles.engagementDateInfo}>
                  <AppIcon name="calendar" size={18} color={theme.secondaryText} />
                  <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                    {engagementLog.length > 0 
                      ? new Date(engagementLog[0].engagedAt).toLocaleDateString()
                      : "Not set"}
                  </ThemedText>
                </View>
                <View style={styles.engagementDateActions}>
                  <Pressable
                    onPress={() => setShowDatePicker(true)}
                    style={({ pressed }) => [
                      styles.dateButton,
                      { backgroundColor: theme.primary, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <ThemedText type="caption" style={{ color: "#FFFFFF" }}>
                      {engagementLog.length > 0 ? "Change" : "Set Date"}
                    </ThemedText>
                  </Pressable>
                  {engagementLog.length > 0 ? (
                    <Pressable
                      onPress={handleClearEngagement}
                      style={({ pressed }) => [
                        styles.dateButton,
                        { backgroundColor: theme.border, opacity: pressed ? 0.7 : 1, marginLeft: Spacing.xs },
                      ]}
                    >
                      <AppIcon name="x" size={14} color={theme.secondaryText} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {showDatePicker ? (
                <View style={[styles.webDatePickerContainer, { backgroundColor: theme.cardBackground }]}>
                  {Platform.OS === "web" ? (
                    <input
                      type="date"
                      value={engagementLog.length > 0 
                        ? new Date(engagementLog[0].engagedAt).toISOString().split('T')[0]
                        : new Date().toISOString().split('T')[0]}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const date = new Date(e.target.value);
                        handleSetEngagementDate(date);
                      }}
                      style={{
                        padding: 12,
                        fontSize: 16,
                        borderRadius: 8,
                        border: `1px solid ${theme.border}`,
                        backgroundColor: theme.inputBackground,
                        color: theme.text,
                        width: "100%",
                      }}
                    />
                  ) : (
                    <View>
                      <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
                        Enter date (YYYY-MM-DD):
                      </ThemedText>
                      <TextInput
                        style={[
                          styles.noteInput,
                          { backgroundColor: theme.inputBackground, color: theme.text },
                        ]}
                        placeholder="2026-01-15"
                        placeholderTextColor={theme.secondaryText}
                        value={selectedDate.toISOString().split('T')[0]}
                        onChangeText={(text) => {
                          const parsed = new Date(text);
                          if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
                            setSelectedDate(parsed);
                          }
                        }}
                        keyboardType="default"
                      />
                      <View style={styles.iosPickerButtons}>
                        <Pressable
                          onPress={() => handleSetEngagementDate(new Date())}
                          style={({ pressed }) => [
                            styles.setTodayButton,
                            { backgroundColor: theme.border, opacity: pressed ? 0.7 : 1 },
                          ]}
                        >
                          <AppIcon name="calendar" size={16} color={theme.text} />
                          <ThemedText type="caption" style={{ color: theme.text, marginLeft: Spacing.xs }}>
                            Today
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => handleSetEngagementDate(selectedDate)}
                          style={({ pressed }) => [
                            styles.setTodayButton,
                            { backgroundColor: theme.primary, opacity: pressed ? 0.7 : 1, marginLeft: Spacing.sm },
                          ]}
                        >
                          <AppIcon name="check" size={16} color="#FFFFFF" />
                          <ThemedText type="caption" style={{ color: "#FFFFFF", marginLeft: Spacing.xs }}>
                            Confirm
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  )}
                  <Pressable 
                    onPress={() => setShowDatePicker(false)}
                    style={{ marginTop: Spacing.sm, alignItems: "center" }}
                  >
                    <ThemedText type="caption" style={{ color: theme.secondaryText }}>Cancel</ThemedText>
                  </Pressable>
                </View>
              ) : null}

              <View style={{ marginTop: Spacing.md }}>
                <ThemedText type="caption" style={{ color: theme.secondaryText, marginBottom: Spacing.xs }}>
                  Note (optional)
                </ThemedText>
                <TextInput
                  style={[
                    styles.noteInput,
                    { backgroundColor: theme.inputBackground, color: theme.text },
                  ]}
                  value={engagementNote}
                  onChangeText={setEngagementNote}
                  onBlur={handleSaveEngagementNote}
                  placeholder="e.g., 'Met at Capitol'"
                  placeholderTextColor={theme.secondaryText}
                  multiline
                  editable={engagementLog.length > 0}
                />
                {engagementLog.length === 0 ? (
                  <ThemedText type="caption" style={{ color: theme.secondaryText, fontStyle: "italic", marginTop: Spacing.xs }}>
                    Set a date first to add a note
                  </ThemedText>
                ) : null}
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
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  saveButton: {
    padding: Spacing.sm,
  },
  quickActionsContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  quickActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  quickActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600" as const,
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
  vacantHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  vacantAvatarContainer: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
  },
  vacantCard: {
    flexDirection: "row",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    gap: Spacing.md,
  },
  vacantCardContent: {
    flex: 1,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  addEntryForm: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  entriesList: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  entryCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  followUpBadge: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  engagementDateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  engagementDateInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  engagementDateActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  webDatePickerContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  setTodayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  iosPickerButtons: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
});
