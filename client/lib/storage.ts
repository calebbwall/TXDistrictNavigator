import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Official } from "./mockData";

const SAVED_OFFICIALS_KEY = "@texas_districts:saved_officials";
const PRIVATE_NOTES_KEY = "@texas_districts:private_notes";
const OVERLAY_PREFERENCES_KEY = "@texas_districts:overlay_preferences";
const NOTES_PRAYER_KEY = "@texas_districts:notes_prayer";
const ENGAGEMENT_LOG_KEY = "@texas_districts:engagement_log";

export interface OverlayPreferences {
  senate: boolean;
  house: boolean;
  congress: boolean;
}

export interface PrivateNotes {
  personalPhone?: string;
  personalAddress?: string;
  spouse?: string;
  children?: string;
  birthday?: string;
  anniversary?: string;
  notes?: string;
}

export async function getSavedOfficials(): Promise<string[]> {
  try {
    const saved = await AsyncStorage.getItem(SAVED_OFFICIALS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export async function saveOfficial(officialId: string): Promise<void> {
  try {
    const saved = await getSavedOfficials();
    if (!saved.includes(officialId)) {
      saved.push(officialId);
      await AsyncStorage.setItem(SAVED_OFFICIALS_KEY, JSON.stringify(saved));
    }
  } catch {
    // Silently fail
  }
}

export async function removeOfficial(officialId: string): Promise<void> {
  try {
    const saved = await getSavedOfficials();
    const updated = saved.filter((id) => id !== officialId);
    await AsyncStorage.setItem(SAVED_OFFICIALS_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail
  }
}

export async function isOfficialSaved(officialId: string): Promise<boolean> {
  const saved = await getSavedOfficials();
  return saved.includes(officialId);
}

export async function getPrivateNotes(officialId: string): Promise<PrivateNotes | null> {
  try {
    const allNotes = await AsyncStorage.getItem(PRIVATE_NOTES_KEY);
    const parsed = allNotes ? JSON.parse(allNotes) : {};
    return parsed[officialId] || null;
  } catch {
    return null;
  }
}

export async function savePrivateNotes(officialId: string, notes: PrivateNotes): Promise<void> {
  try {
    const allNotes = await AsyncStorage.getItem(PRIVATE_NOTES_KEY);
    const parsed = allNotes ? JSON.parse(allNotes) : {};
    parsed[officialId] = notes;
    await AsyncStorage.setItem(PRIVATE_NOTES_KEY, JSON.stringify(parsed));
  } catch {
    // Silently fail
  }
}

const DEFAULT_OVERLAY_PREFS: OverlayPreferences = { 
  senate: true,   // Default to showing Senate overlay
  house: false, 
  congress: true  // Default to showing Congress overlay
};

export async function getOverlayPreferences(): Promise<OverlayPreferences> {
  try {
    const prefs = await AsyncStorage.getItem(OVERLAY_PREFERENCES_KEY);
    if (!prefs) return DEFAULT_OVERLAY_PREFS;
    
    const parsed = JSON.parse(prefs);
    // Ensure at least one overlay is visible
    if (!parsed.senate && !parsed.house && !parsed.congress) {
      return DEFAULT_OVERLAY_PREFS;
    }
    return parsed;
  } catch {
    return DEFAULT_OVERLAY_PREFS;
  }
}

export async function saveOverlayPreferences(prefs: OverlayPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(OVERLAY_PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Silently fail
  }
}

export interface NotePrayerEntry {
  id: string;
  createdAt: string;
  text: string;
  followUpNeeded: boolean;
}

export interface EngagementEntry {
  id: string;
  engagedAt: string;
  summary?: string;
}

function getPrivateKey(source: string, districtNumber: number): string {
  return `private:${source}:${districtNumber}`;
}

export async function getNotesPrayer(source: string, districtNumber: number): Promise<NotePrayerEntry[]> {
  try {
    const key = getPrivateKey(source, districtNumber);
    const allData = await AsyncStorage.getItem(NOTES_PRAYER_KEY);
    const parsed = allData ? JSON.parse(allData) : {};
    return parsed[key] || [];
  } catch {
    return [];
  }
}

export async function saveNotesPrayer(source: string, districtNumber: number, entries: NotePrayerEntry[]): Promise<void> {
  try {
    const key = getPrivateKey(source, districtNumber);
    const allData = await AsyncStorage.getItem(NOTES_PRAYER_KEY);
    const parsed = allData ? JSON.parse(allData) : {};
    parsed[key] = entries;
    await AsyncStorage.setItem(NOTES_PRAYER_KEY, JSON.stringify(parsed));
  } catch {
    // Silently fail
  }
}

export async function addNotePrayer(source: string, districtNumber: number, text: string, followUpNeeded: boolean): Promise<NotePrayerEntry> {
  const entries = await getNotesPrayer(source, districtNumber);
  const newEntry: NotePrayerEntry = {
    id: `np_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    text,
    followUpNeeded,
  };
  entries.unshift(newEntry);
  await saveNotesPrayer(source, districtNumber, entries);
  return newEntry;
}

export async function deleteNotePrayer(source: string, districtNumber: number, entryId: string): Promise<void> {
  const entries = await getNotesPrayer(source, districtNumber);
  const updated = entries.filter(e => e.id !== entryId);
  await saveNotesPrayer(source, districtNumber, updated);
}

export async function getEngagementLog(source: string, districtNumber: number): Promise<EngagementEntry[]> {
  try {
    const key = getPrivateKey(source, districtNumber);
    const allData = await AsyncStorage.getItem(ENGAGEMENT_LOG_KEY);
    const parsed = allData ? JSON.parse(allData) : {};
    return parsed[key] || [];
  } catch {
    return [];
  }
}

export async function saveEngagementLog(source: string, districtNumber: number, entries: EngagementEntry[]): Promise<void> {
  try {
    const key = getPrivateKey(source, districtNumber);
    const allData = await AsyncStorage.getItem(ENGAGEMENT_LOG_KEY);
    const parsed = allData ? JSON.parse(allData) : {};
    parsed[key] = entries;
    await AsyncStorage.setItem(ENGAGEMENT_LOG_KEY, JSON.stringify(parsed));
  } catch {
    // Silently fail
  }
}

export async function addEngagement(source: string, districtNumber: number, engagedAt: string, summary?: string): Promise<EngagementEntry> {
  const entries = await getEngagementLog(source, districtNumber);
  const newEntry: EngagementEntry = {
    id: `eng_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    engagedAt,
    summary,
  };
  entries.unshift(newEntry);
  await saveEngagementLog(source, districtNumber, entries);
  return newEntry;
}

export async function deleteEngagement(source: string, districtNumber: number, entryId: string): Promise<void> {
  const entries = await getEngagementLog(source, districtNumber);
  const updated = entries.filter(e => e.id !== entryId);
  await saveEngagementLog(source, districtNumber, updated);
}
