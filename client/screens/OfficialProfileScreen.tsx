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
  ActionSheetIOS,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  isValidUSPhone,
  formatPhone,
  getPhoneDigits,
  isLikelyAddress,
  formatDateMMDDYYYY,
  toStorageDateString,
  toISODateString,
  parseISODate,
  getGoogleMapsUrl,
} from "@/utils/validation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, useNavigation, RouteProp, useFocusEffect, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { FocusDistrictParams } from "@/navigation/MapStackNavigator";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import type { BrowseStackParamList } from "@/navigation/BrowseStackNavigator";
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
import { useQuery } from "@tanstack/react-query";
import { fetchOfficialById, updateOfficialPrivate } from "@/lib/officialsApi";
import { apiOfficialToLegacy } from "@/lib/officialsAdapter";
import { getApiUrl } from "@/lib/query-client";
import { getProxiedPhotoUrl } from "@/lib/photoProxy";
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

type OfficialProfileParams = { officialId: string; initialSection?: "privateNotes"; initialTab?: "public" | "private" };
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
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  validationHint?: string;
  isPhone?: boolean;
}

function ContactRow({ icon, label, value, onPress, validationHint, isPhone }: ContactRowProps) {
  const { theme } = useTheme();
  const displayValue = isPhone && value ? formatPhone(value) : value;

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
          {displayValue}
        </ThemedText>
        {validationHint ? (
          <ThemedText type="small" style={{ color: theme.warning, marginTop: 2, fontStyle: "italic" }}>
            {validationHint}
          </ThemedText>
        ) : null}
      </View>
      {onPress ? (
        <Feather name="external-link" size={16} color={theme.secondaryText} />
      ) : null}
    </Pressable>
  );
}

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList & BrowseStackParamList>;

export default function OfficialProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const route = useRoute<RouteParams>();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const { officialId, initialSection, initialTab } = route.params;
  const [official, setOfficial] = useState<Official | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const [notesSectionY, setNotesSectionY] = useState<number | null>(null);
  const [hasScrolledToNotes, setHasScrolledToNotes] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const district = official ? getDistrictById(official.districtId) : undefined;

  const [activeTab, setActiveTab] = useState<TabType>(
    initialTab || (initialSection === "privateNotes" ? "private" : "private")
  );
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [showAnniversaryPicker, setShowAnniversaryPicker] = useState(false);
  const [birthdayPickerDate, setBirthdayPickerDate] = useState<Date>(new Date());
  const [anniversaryPickerDate, setAnniversaryPickerDate] = useState<Date>(new Date());
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [privateNotes, setPrivateNotes] = useState<PrivateNotes>({});
  const [notesPrayer, setNotesPrayer] = useState<NotePrayerEntry[]>([]);
  const [engagementLog, setEngagementLog] = useState<EngagementEntry[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteFollowUp, setNewNoteFollowUp] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showEngagementPicker, setShowEngagementPicker] = useState(false);
  const [engagementPickerDate, setEngagementPickerDate] = useState<Date>(new Date());
  const [engagementNote, setEngagementNote] = useState("");
  const [committees, setCommittees] = useState<Array<{
    committeeId: string;
    committeeName: string;
    roleTitle: string | null;
  }>>([]);
  const [committeesLoading, setCommitteesLoading] = useState(false);

  const { data: prayerCounts } = useQuery<{ open: number; answered: number; archived: number }>({
    queryKey: [`/api/officials/${officialId}/prayer-counts`],
    enabled: !!officialId,
  });

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
      if (notes) {
        // Non-destructive auto-fill: if local personalAddress is empty but server has one, use server's
        const localAddressEmpty = !notes.personalAddress || notes.personalAddress.trim() === '';
        const serverAddress = official.privateNotes?.personalAddress;
        const serverHasAddress = serverAddress && serverAddress.trim() !== '';
        if (localAddressEmpty && serverHasAddress) {
          console.log('[OfficialProfile] Auto-filling personalAddress from server:', serverAddress);
          notes.personalAddress = serverAddress;
        }
        setPrivateNotes(notes);
      } else if (official.privateNotes) {
        // Fallback to server data when no local data exists (e.g., hometown auto-fill)
        console.log('[OfficialProfile] Using server private notes as fallback:', official.privateNotes);
        setPrivateNotes(official.privateNotes);
      }
      
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

  useEffect(() => {
    const fetchCommittees = async () => {
      if (!officialId) return;
      setCommitteesLoading(true);
      try {
        const baseUrl = getApiUrl();
        const url = new URL(`/api/officials/${officialId}/committees`, baseUrl);
        const response = await fetch(url.toString());
        if (response.ok) {
          const data = await response.json();
          setCommittees(data);
        }
      } catch (error) {
        console.error("Failed to fetch committees:", error);
      }
      setCommitteesLoading(false);
    };
    fetchCommittees();
  }, [officialId]);

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

  // Handler to jump to district on map
  const handleJumpToDistrict = useCallback(() => {
    if (!official || !official.source || !district) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const focusDistrict: FocusDistrictParams = {
      source: official.source as 'TX_HOUSE' | 'TX_SENATE' | 'US_HOUSE',
      districtNumber: district.districtNumber,
    };
    
    // Navigate to Map tab with focus district params
    navigation.dispatch(
      CommonActions.navigate({
        name: 'MapTab',
        params: {
          screen: 'Map',
          params: { focusDistrict },
        },
      })
    );
  }, [official, district, navigation]);

  const handleSaveNotes = useCallback(async () => {
    console.log('[OfficialProfile] handleSaveNotes called');
    if (!official) return;
    console.log('[OfficialProfile] Saving notes for:', official.id, 'address:', privateNotes.personalAddress);
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
    if (!isValidUSPhone(phone)) return;
    const digits = getPhoneDigits(phone);
    
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Call", "Send Text"],
          cancelButtonIndex: 0,
          title: formatPhone(phone),
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            Linking.openURL(`tel:${digits}`);
          } else if (buttonIndex === 2) {
            Linking.openURL(`sms:${digits}`);
          }
        }
      );
    } else {
      Alert.alert(
        formatPhone(phone),
        "Choose an action",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Call", onPress: () => Linking.openURL(`tel:${digits}`) },
          { text: "Send Text", onPress: () => Linking.openURL(`sms:${digits}`) },
        ]
      );
    }
  }, []);

  const handleAddressPress = useCallback((address: string) => {
    if (!isLikelyAddress(address)) return;
    const url = getGoogleMapsUrl(address);
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

  const handleSetEngagementDate = useCallback(async (date: Date) => {
    if (!official?.source || !official?.districtNumber) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const entry = await addEngagement(
      official.source, 
      official.districtNumber, 
      date.toISOString(), 
      engagementNote.trim() || undefined
    );
    setEngagementLog([entry]);
    addRecentEngaged(official.source, official.districtNumber);
    setShowEngagementPicker(false);
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
          <Feather name="alert-circle" size={48} color={theme.secondaryText} />
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
              <Feather name="user-x" size={40} color={theme.secondaryText} />
            </View>
            <ThemedText type="h2" style={{ marginTop: Spacing.lg, textAlign: "center" }}>
              Vacant Seat
            </ThemedText>
            {district ? (
              <Pressable onPress={handleJumpToDistrict} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: Spacing.xs })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <ThemedText type="body" style={{ color: theme.primary, textAlign: "center" }}>
                    {getOfficeTypeLabel(official.officeType, official.roleTitle)} - District {district.districtNumber}
                  </ThemedText>
                  <Feather name="map-pin" size={14} color={theme.primary} />
                </View>
              </Pressable>
            ) : (
              <ThemedText type="body" style={{ color: theme.secondaryText, marginTop: Spacing.xs, textAlign: "center" }}>
                {getOfficeTypeLabel(official.officeType, official.roleTitle)}
              </ThemedText>
            )}
          </View>
          
          <View style={[styles.vacantCard, { backgroundColor: theme.cardBackground, borderColor: theme.warning }]}>
            <Feather name="info" size={24} color={theme.warning} />
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
          {getProxiedPhotoUrl(official.photoUrl) ? (
            <Pressable 
              onPress={() => setShowPhotoModal(true)}
              style={({ pressed }) => [
                styles.avatarContainer,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="View photo"
            >
              <Image source={{ uri: getProxiedPhotoUrl(official.photoUrl)! }} style={styles.avatar} />
            </Pressable>
          ) : (
            <View style={styles.avatarContainer}>
              <Image
                source={require("../../assets/images/default-avatar.png")}
                style={styles.avatar}
              />
            </View>
          )}
          <View style={styles.headerInfo}>
            <ThemedText type="h2">{official.fullName}</ThemedText>
            <ThemedText type="body" style={{ color: theme.secondaryText }}>
              {getOfficeTypeLabel(official.officeType, official.roleTitle)}
            </ThemedText>
            {district ? (
              <Pressable onPress={handleJumpToDistrict} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ThemedText type="caption" style={{ color: theme.primary }}>
                    {getDistrictTypeLabel(district.districtType)} District{" "}
                    {district.districtNumber}
                  </ThemedText>
                  <Feather name="map-pin" size={12} color={theme.primary} />
                </View>
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Pressable
              onPress={() => {
                navigation.navigate("PrayerTab" as any, {
                  screen: "AddPrayer",
                  params: { officialId: official?.id?.toString(), officialName: official?.fullName },
                });
              }}
              style={({ pressed }) => [
                styles.saveButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="heart" size={22} color={theme.secondary} style={{ opacity: 0.7 }} />
            </Pressable>
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
        </View>

        <View style={styles.tabContainer}>
          <TabButton
            label="Private Notes"
            isActive={activeTab === "private"}
            onPress={() => setActiveTab("private")}
          />
          <View style={{ width: Spacing.sm }} />
          <TabButton
            label="Public Info"
            isActive={activeTab === "public"}
            onPress={() => setActiveTab("public")}
          />
        </View>

        {activeTab === "public" ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.tabContent}>
            <View style={styles.section}>
              <ThemedText type="h3" style={styles.sectionTitle}>
                Details
              </ThemedText>
              {official.city ? (
                <ContactRow icon="map-pin" label="City" value={official.city} />
              ) : null}
              <ContactRow icon="users" label="Party" value={official.party} />
            </View>

            {official.offices.map((office) => {
              const phoneValid = isValidUSPhone(office.phone);
              const addressValid = isLikelyAddress(office.address);
              return (
                <View key={office.id} style={styles.section}>
                  <ThemedText type="h3" style={styles.sectionTitle}>
                    {office.officeKind === "capitol" ? "Capitol Office" : "District Office"}
                  </ThemedText>
                  {office.officeKind === "capitol" && office.room ? (
                    <ContactRow icon="home" label="Room" value={office.room} />
                  ) : null}
                  <ContactRow
                    icon="map"
                    label="Address"
                    value={office.address}
                    onPress={addressValid ? () => handleAddressPress(office.address) : undefined}
                    validationHint={!addressValid && office.address ? "Address format not recognized" : undefined}
                  />
                  <ContactRow
                    icon="phone"
                    label="Phone"
                    value={office.phone}
                    isPhone
                    onPress={phoneValid ? () => handlePhonePress(office.phone) : undefined}
                    validationHint={!phoneValid && office.phone ? "Invalid phone number" : undefined}
                  />
                </View>
              );
            })}

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

            <View style={styles.section}>
              <ThemedText type="h3" style={styles.sectionTitle}>
                Committees
              </ThemedText>
              {committeesLoading ? (
                <View style={styles.committeesLoading}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : committees.length > 0 ? (
                committees.map((committee) => (
                  <Pressable
                    key={committee.committeeId}
                    style={({ pressed }) => [
                      styles.committeeRow,
                      { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.navigate("CommitteeDetail", { 
                        committeeId: committee.committeeId, 
                        committeeName: committee.committeeName 
                      });
                    }}
                  >
                    <View style={[styles.committeeIcon, { backgroundColor: theme.primary + "20" }]}>
                      <Feather name="briefcase" size={14} color={theme.primary} />
                    </View>
                    <View style={styles.committeeContent}>
                      <ThemedText type="body" numberOfLines={2}>
                        {committee.committeeName}
                      </ThemedText>
                      {committee.roleTitle ? (
                        <View style={[
                          styles.roleBadge, 
                          { backgroundColor: committee.roleTitle === "Chair" ? "#FFD70020" : committee.roleTitle === "Vice Chair" ? "#A8D8EA20" : "#C0C0C020" },
                          committee.roleTitle === "Chair" && { borderWidth: 1.5, borderColor: "#FFD700" },
                          committee.roleTitle === "Vice Chair" && { borderWidth: 1, borderColor: "#A8D8EA" },
                        ]}>
                          <ThemedText type="caption" style={{ color: committee.roleTitle === "Chair" ? "#DAA520" : committee.roleTitle === "Vice Chair" ? "#5B9BD5" : "#C0C0C0", fontWeight: "600" }}>
                            {committee.roleTitle}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <Feather name="chevron-right" size={18} color={theme.secondaryText} />
                  </Pressable>
                ))
              ) : (
                <ThemedText type="body" style={{ color: theme.secondaryText }}>
                  No committee assignments found
                </ThemedText>
              )}
            </View>
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
                  <View>
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
                    {privateNotes.personalPhone && !isValidUSPhone(privateNotes.personalPhone) ? (
                      <ThemedText type="small" style={{ color: theme.warning, marginTop: 2, fontStyle: "italic" }}>
                        Enter a valid 10-digit phone number
                      </ThemedText>
                    ) : null}
                  </View>
                ) : privateNotes.personalPhone ? (
                  <Pressable
                    onPress={isValidUSPhone(privateNotes.personalPhone) ? () => handlePhonePress(privateNotes.personalPhone!) : undefined}
                    disabled={!isValidUSPhone(privateNotes.personalPhone)}
                    style={({ pressed }) => [{ opacity: pressed && isValidUSPhone(privateNotes.personalPhone!) ? 0.7 : 1 }]}
                  >
                    <View style={styles.tappableFieldRow}>
                      <ThemedText 
                        type="body" 
                        style={isValidUSPhone(privateNotes.personalPhone) ? { color: theme.link } : undefined}
                      >
                        {formatPhone(privateNotes.personalPhone)}
                      </ThemedText>
                      {isValidUSPhone(privateNotes.personalPhone) ? (
                        <Feather name="phone" size={16} color={theme.secondaryText} style={{ marginLeft: Spacing.xs }} />
                      ) : null}
                    </View>
                    {!isValidUSPhone(privateNotes.personalPhone) ? (
                      <ThemedText type="small" style={{ color: theme.warning, marginTop: 2, fontStyle: "italic" }}>
                        Invalid phone number
                      </ThemedText>
                    ) : null}
                  </Pressable>
                ) : (
                  <ThemedText type="body">Not set</ThemedText>
                )}
              </View>

              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Personal Address
                </ThemedText>
                {isEditing ? (
                  <View>
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
                    {privateNotes.personalAddress && !isLikelyAddress(privateNotes.personalAddress) ? (
                      <ThemedText type="small" style={{ color: theme.warning, marginTop: 2, fontStyle: "italic" }}>
                        Include street number, city and state
                      </ThemedText>
                    ) : null}
                  </View>
                ) : privateNotes.personalAddress ? (
                  <Pressable
                    onPress={isLikelyAddress(privateNotes.personalAddress) ? () => handleAddressPress(privateNotes.personalAddress!) : undefined}
                    disabled={!isLikelyAddress(privateNotes.personalAddress)}
                    style={({ pressed }) => [{ opacity: pressed && isLikelyAddress(privateNotes.personalAddress!) ? 0.7 : 1 }]}
                  >
                    <View style={styles.tappableFieldRow}>
                      <ThemedText 
                        type="body" 
                        style={isLikelyAddress(privateNotes.personalAddress) ? { color: theme.link } : undefined}
                      >
                        {privateNotes.personalAddress}
                      </ThemedText>
                      {isLikelyAddress(privateNotes.personalAddress) ? (
                        <Feather name="map-pin" size={16} color={theme.secondaryText} style={{ marginLeft: Spacing.xs }} />
                      ) : null}
                    </View>
                    {!isLikelyAddress(privateNotes.personalAddress) ? (
                      <ThemedText type="small" style={{ color: theme.warning, marginTop: 2, fontStyle: "italic" }}>
                        Address format not recognized
                      </ThemedText>
                    ) : null}
                  </Pressable>
                ) : (
                  <ThemedText type="body">Not set</ThemedText>
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
                  <View>
                    <Pressable
                      onPress={() => setShowBirthdayPicker(!showBirthdayPicker)}
                      style={[
                        styles.noteInput,
                        styles.datePickerButton,
                        { backgroundColor: theme.inputBackground },
                      ]}
                    >
                      <ThemedText type="body" style={{ color: privateNotes.birthday ? theme.text : theme.secondaryText }}>
                        {privateNotes.birthday ? formatDateMMDDYYYY(privateNotes.birthday) : "Select birthday..."}
                      </ThemedText>
                      <Feather name="calendar" size={18} color={theme.secondaryText} />
                    </Pressable>
                    {showBirthdayPicker ? (
                      <View style={[styles.inlineDatePicker, { backgroundColor: theme.cardBackground }]}>
                        {Platform.OS === "web" ? (
                          <input
                            type="date"
                            value={privateNotes.birthday || ""}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              setPrivateNotes({ ...privateNotes, birthday: e.target.value });
                              setShowBirthdayPicker(false);
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
                            <DateTimePicker
                              value={birthdayPickerDate}
                              mode="date"
                              display="spinner"
                              onChange={(event, date) => {
                                if (event.type === "dismissed") {
                                  setShowBirthdayPicker(false);
                                  return;
                                }
                                if (date) {
                                  setBirthdayPickerDate(date);
                                  const dateStr = toISODateString(date);
                                  setPrivateNotes({ ...privateNotes, birthday: dateStr });
                                  if (Platform.OS === "android") {
                                    setShowBirthdayPicker(false);
                                  }
                                }
                              }}
                              maximumDate={new Date()}
                            />
                            {Platform.OS === "ios" ? (
                              <Pressable
                                onPress={() => setShowBirthdayPicker(false)}
                                style={[styles.dateConfirmButton, { backgroundColor: theme.primary }]}
                              >
                                <ThemedText type="caption" style={{ color: "#FFFFFF" }}>Done</ThemedText>
                              </Pressable>
                            ) : null}
                          </View>
                        )}
                        {privateNotes.birthday ? (
                          <Pressable
                            onPress={() => {
                              setPrivateNotes({ ...privateNotes, birthday: "" });
                              setShowBirthdayPicker(false);
                            }}
                            style={{ marginTop: Spacing.xs, alignItems: "center" }}
                          >
                            <ThemedText type="caption" style={{ color: theme.warning }}>Clear</ThemedText>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <ThemedText type="body">
                    {privateNotes.birthday ? formatDateMMDDYYYY(privateNotes.birthday) : "Not set"}
                  </ThemedText>
                )}
              </View>

              <View style={styles.noteField}>
                <ThemedText type="small" style={{ color: theme.secondaryText }}>
                  Anniversary
                </ThemedText>
                {isEditing ? (
                  <View>
                    <Pressable
                      onPress={() => setShowAnniversaryPicker(!showAnniversaryPicker)}
                      style={[
                        styles.noteInput,
                        styles.datePickerButton,
                        { backgroundColor: theme.inputBackground },
                      ]}
                    >
                      <ThemedText type="body" style={{ color: privateNotes.anniversary ? theme.text : theme.secondaryText }}>
                        {privateNotes.anniversary ? formatDateMMDDYYYY(privateNotes.anniversary) : "Select anniversary..."}
                      </ThemedText>
                      <Feather name="calendar" size={18} color={theme.secondaryText} />
                    </Pressable>
                    {showAnniversaryPicker ? (
                      <View style={[styles.inlineDatePicker, { backgroundColor: theme.cardBackground }]}>
                        {Platform.OS === "web" ? (
                          <input
                            type="date"
                            value={privateNotes.anniversary || ""}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              setPrivateNotes({ ...privateNotes, anniversary: e.target.value });
                              setShowAnniversaryPicker(false);
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
                            <DateTimePicker
                              value={anniversaryPickerDate}
                              mode="date"
                              display="spinner"
                              onChange={(event, date) => {
                                if (event.type === "dismissed") {
                                  setShowAnniversaryPicker(false);
                                  return;
                                }
                                if (date) {
                                  setAnniversaryPickerDate(date);
                                  const dateStr = toISODateString(date);
                                  setPrivateNotes({ ...privateNotes, anniversary: dateStr });
                                  if (Platform.OS === "android") {
                                    setShowAnniversaryPicker(false);
                                  }
                                }
                              }}
                              maximumDate={new Date()}
                            />
                            {Platform.OS === "ios" ? (
                              <Pressable
                                onPress={() => setShowAnniversaryPicker(false)}
                                style={[styles.dateConfirmButton, { backgroundColor: theme.primary }]}
                              >
                                <ThemedText type="caption" style={{ color: "#FFFFFF" }}>Done</ThemedText>
                              </Pressable>
                            ) : null}
                          </View>
                        )}
                        {privateNotes.anniversary ? (
                          <Pressable
                            onPress={() => {
                              setPrivateNotes({ ...privateNotes, anniversary: "" });
                              setShowAnniversaryPicker(false);
                            }}
                            style={{ marginTop: Spacing.xs, alignItems: "center" }}
                          >
                            <ThemedText type="caption" style={{ color: theme.warning }}>Clear</ThemedText>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <ThemedText type="body">
                    {privateNotes.anniversary ? formatDateMMDDYYYY(privateNotes.anniversary) : "Not set"}
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

            <View style={[styles.section, { marginTop: Spacing.xl }]}>
              <View style={styles.editHeader}>
                <ThemedText type="h3">Prayers</ThemedText>
                <Pressable
                  onPress={() => {
                    navigation.navigate("PrayerTab" as any, {
                      screen: "PrayerList",
                      params: { officialId: officialId, officialName: official?.fullName },
                    });
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <ThemedText type="caption" style={{ color: theme.primary }}>View All</ThemedText>
                </Pressable>
              </View>
              {prayerCounts && (prayerCounts.open > 0 || prayerCounts.answered > 0 || prayerCounts.archived > 0) ? (
                <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm }}>
                  {prayerCounts.open > 0 ? (
                    <View style={[styles.prayerCountPill, { backgroundColor: theme.primary + "20" }]}>
                      <View style={[styles.prayerCountDot, { backgroundColor: theme.primary }]} />
                      <ThemedText type="caption">{prayerCounts.open} Active</ThemedText>
                    </View>
                  ) : null}
                  {prayerCounts.answered > 0 ? (
                    <View style={[styles.prayerCountPill, { backgroundColor: "#4CAF5020" }]}>
                      <View style={[styles.prayerCountDot, { backgroundColor: "#4CAF50" }]} />
                      <ThemedText type="caption">{prayerCounts.answered} Answered</ThemedText>
                    </View>
                  ) : null}
                  {prayerCounts.archived > 0 ? (
                    <View style={[styles.prayerCountPill, { backgroundColor: theme.secondaryText + "20" }]}>
                      <View style={[styles.prayerCountDot, { backgroundColor: theme.secondaryText }]} />
                      <ThemedText type="caption">{prayerCounts.archived} Archived</ThemedText>
                    </View>
                  ) : null}
                </View>
              ) : (
                <ThemedText type="caption" style={{ color: theme.secondaryText, marginTop: Spacing.sm }}>
                  No prayers yet. Tap the prayer icon above to add one.
                </ThemedText>
              )}
            </View>

            <View 
              style={[styles.section, { marginTop: Spacing.xl }]}
              onLayout={handleNotesSectionLayout}
            >
              <View style={styles.editHeader}>
                <View>
                  <ThemedText type="h3">Private Notes (Follow Up Needed)</ThemedText>
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
                  <Feather name={showAddNote ? "x" : "plus"} size={16} color="#FFFFFF" />
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
                      {newNoteFollowUp ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
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
                            <Feather name="trash-2" size={16} color={theme.secondaryText} />
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
                  <Feather name="calendar" size={18} color={theme.secondaryText} />
                  <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                    {engagementLog.length > 0 
                      ? new Date(engagementLog[0].engagedAt).toLocaleDateString()
                      : "Not set"}
                  </ThemedText>
                </View>
                <View style={styles.engagementDateActions}>
                  <Pressable
                    onPress={() => {
                      if (engagementLog.length > 0) {
                        setEngagementPickerDate(new Date(engagementLog[0].engagedAt));
                      } else {
                        setEngagementPickerDate(new Date());
                      }
                      setShowEngagementPicker(true);
                    }}
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
                      <Feather name="x" size={14} color={theme.secondaryText} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {showEngagementPicker ? (
                <View style={[styles.webDatePickerContainer, { backgroundColor: theme.cardBackground }]}>
                  {Platform.OS === "web" ? (
                    <input
                      type="date"
                      value={engagementLog.length > 0 
                        ? new Date(engagementLog[0].engagedAt).toISOString().split('T')[0]
                        : new Date().toISOString().split('T')[0]}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const date = new Date(e.target.value + "T12:00:00");
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
                      <DateTimePicker
                        value={engagementPickerDate}
                        mode="date"
                        display="spinner"
                        onChange={(event, date) => {
                          if (event.type === "dismissed") {
                            setShowEngagementPicker(false);
                            return;
                          }
                          if (date) {
                            setEngagementPickerDate(date);
                            if (Platform.OS === "android") {
                              handleSetEngagementDate(date);
                            }
                          }
                        }}
                        maximumDate={new Date()}
                      />
                      <View style={styles.iosPickerButtons}>
                        <Pressable
                          onPress={() => handleSetEngagementDate(new Date())}
                          style={({ pressed }) => [
                            styles.setTodayButton,
                            { backgroundColor: theme.border, opacity: pressed ? 0.7 : 1 },
                          ]}
                        >
                          <Feather name="calendar" size={16} color={theme.text} />
                          <ThemedText type="caption" style={{ color: theme.text, marginLeft: Spacing.xs }}>
                            Today
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => handleSetEngagementDate(engagementPickerDate)}
                          style={({ pressed }) => [
                            styles.setTodayButton,
                            { backgroundColor: theme.primary, opacity: pressed ? 0.7 : 1, marginLeft: Spacing.sm },
                          ]}
                        >
                          <Feather name="check" size={16} color="#FFFFFF" />
                          <ThemedText type="caption" style={{ color: "#FFFFFF", marginLeft: Spacing.xs }}>
                            Confirm
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  )}
                  <Pressable 
                    onPress={() => setShowEngagementPicker(false)}
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

      {getProxiedPhotoUrl(official.photoUrl) ? (
        <Modal
          visible={showPhotoModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPhotoModal(false)}
        >
          <Pressable
            style={styles.photoModalOverlay}
            onPress={() => setShowPhotoModal(false)}
          >
            <View style={styles.photoModalContent}>
              <Image
                source={{ uri: getProxiedPhotoUrl(official.photoUrl)! }}
                style={styles.photoModalImage}
                resizeMode="contain"
              />
            </View>
            <Pressable
              style={styles.photoModalClose}
              onPress={() => setShowPhotoModal(false)}
              hitSlop={16}
            >
              <Feather name="x" size={28} color="#FFFFFF" />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
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
  tappableFieldRow: {
    flexDirection: "row",
    alignItems: "center",
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
  datePickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inlineDatePicker: {
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  dateConfirmButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  committeesLoading: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  committeeRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  committeeIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  committeeContent: {
    flex: 1,
    gap: 2,
  },
  roleBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    alignSelf: "flex-start",
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalContent: {
    width: Dimensions.get("window").width - 32,
    height: Dimensions.get("window").width - 32,
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalImage: {
    width: "100%",
    height: "100%",
    borderRadius: BorderRadius.md,
  },
  photoModalClose: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  prayerCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  prayerCountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
