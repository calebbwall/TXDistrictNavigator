import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Official } from "./mockData";

const SAVED_OFFICIALS_KEY = "@texas_districts:saved_officials";
const PRIVATE_NOTES_KEY = "@texas_districts:private_notes";
const OVERLAY_PREFERENCES_KEY = "@texas_districts:overlay_preferences";

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
