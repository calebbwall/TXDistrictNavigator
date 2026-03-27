import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

// Keys for stored notification identifiers
const DAILY_PRAYER_NOTIF_KEY = "notif:dailyPrayer";
const annualKey = (officialId: string, type: "birthday" | "anniversary") =>
  `notif:annual:${type}:${officialId}`;
const followUpKey = (entryId: string) => `notif:followup:${entryId}`;

// Configure how foreground notifications are displayed
export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

// Schedule a daily prayer reminder. Cancels any existing one first.
export async function scheduleDailyPrayerReminder(
  hour: number,
  minute: number
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await cancelDailyPrayerReminder();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Time to Pray",
        body: "Open TXDistrictNavigator to pray for your representatives.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    await AsyncStorage.setItem(DAILY_PRAYER_NOTIF_KEY, id);
  } catch {}
}

export async function cancelDailyPrayerReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const id = await AsyncStorage.getItem(DAILY_PRAYER_NOTIF_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(DAILY_PRAYER_NOTIF_KEY);
    }
  } catch {}
}

// Schedule an annual birthday or anniversary reminder.
export async function scheduleAnnualReminder(
  officialId: string,
  name: string,
  month: number, // 1-based
  day: number,
  type: "birthday" | "anniversary"
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const key = annualKey(officialId, type);
    // Cancel existing
    const existingId = await AsyncStorage.getItem(key);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    }
    const label = type === "birthday" ? "Birthday" : "Anniversary";
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${name}'s ${label}`,
        body: `Today is ${name}'s ${label.toLowerCase()}. Remember them in prayer!`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.YEARLY,
        month: month - 1, // expo uses 0-indexed months
        day,
        hour: 8,
        minute: 0,
      },
    });
    await AsyncStorage.setItem(key, id);
  } catch {}
}

export async function cancelAnnualReminder(
  officialId: string,
  type: "birthday" | "anniversary"
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const key = annualKey(officialId, type);
    const id = await AsyncStorage.getItem(key);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(key);
    }
  } catch {}
}

// Schedule a one-time follow-up reminder.
export async function scheduleFollowUpReminder(
  entryId: string,
  text: string,
  dueDate: Date
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    // Don't schedule if due date is in the past
    if (dueDate <= new Date()) return;
    const key = followUpKey(entryId);
    const existingId = await AsyncStorage.getItem(key);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    }
    // Remind at 9 AM on the due date
    const triggerDate = new Date(dueDate);
    triggerDate.setHours(9, 0, 0, 0);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Follow-Up Due",
        body: text.length > 80 ? text.slice(0, 80) + "…" : text,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
    await AsyncStorage.setItem(key, id);
  } catch {}
}

export async function cancelFollowUpReminder(entryId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const key = followUpKey(entryId);
    const id = await AsyncStorage.getItem(key);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(key);
    }
  } catch {}
}

const PUSH_TOKEN_STORAGE_KEY = "pushToken:registered";
const EXPO_PROJECT_ID = "f1fa6722-e341-4f9f-a57e-2327bffc26eb";

/**
 * Register device push token with the server for server-driven notifications.
 * Idempotent — only sends to server if token has changed since last registration.
 * Skip on web (push not supported).
 */
export async function registerAndSyncPushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    const token = tokenData.data;
    if (!token) return;

    // Only send to server if token changed
    const stored = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (stored === token) return;

    const base = getApiUrl();
    await fetch(`${base}/api/push-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });

    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Non-fatal — push notifications are best-effort
  }
}
