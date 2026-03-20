import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Official } from "./mockData";
import type { Official as NormalizedOfficial } from "./officials";

const SAVED_OFFICIALS_KEY = "@texas_districts:saved_officials";
const PRIVATE_NOTES_KEY = "@texas_districts:private_notes";
const OVERLAY_PREFERENCES_KEY = "@texas_districts:overlay_preferences";
const NOTES_PRAYER_KEY = "@texas_districts:notes_prayer";
const ENGAGEMENT_LOG_KEY = "@texas_districts:engagement_log";
const CACHE_VERSION = "v1";
const OFFICIALS_CACHE_KEY = `@texas_districts:cache:${CACHE_VERSION}:officials`;
const FAVORITES_KEY = "@texas_districts:favorites";
const RECENT_VIEWED_KEY = "@texas_districts:recent_viewed";
const RECENT_ENGAGED_KEY = "@texas_districts:recent_engaged";
const RECENT_PLACES_KEY = "@texas_districts:recent_places";

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

export interface SavedOfficialData {
  source: string;
  districtNumber: number;
  fullName: string;
  party?: string;
  photoUrl?: string;
  savedAt: string;
}

const SAVED_OFFICIALS_DATA_KEY = "@texas_districts:saved_officials_data";

export async function getSavedOfficials(): Promise<string[]> {
  try {
    const saved = await AsyncStorage.getItem(SAVED_OFFICIALS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export async function getSavedOfficialsWithData(): Promise<SavedOfficialData[]> {
  try {
    const data = await AsyncStorage.getItem(SAVED_OFFICIALS_DATA_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveOfficialWithData(
  source: string,
  districtNumber: number,
  fullName: string,
  party?: string,
  photoUrl?: string
): Promise<void> {
  try {
    const key = `${source}:${districtNumber}`;
    const saved = await getSavedOfficials();
    if (!saved.includes(key)) {
      saved.push(key);
      await AsyncStorage.setItem(SAVED_OFFICIALS_KEY, JSON.stringify(saved));
    }
    
    const allData = await getSavedOfficialsWithData();
    const existing = allData.findIndex(o => o.source === source && o.districtNumber === districtNumber);
    const entry: SavedOfficialData = {
      source,
      districtNumber,
      fullName,
      party,
      photoUrl,
      savedAt: new Date().toISOString(),
    };
    if (existing >= 0) {
      allData[existing] = entry;
    } else {
      allData.unshift(entry);
    }
    await AsyncStorage.setItem(SAVED_OFFICIALS_DATA_KEY, JSON.stringify(allData));
  } catch {
    // Silently fail
  }
}

export async function removeOfficialByKey(source: string, districtNumber: number): Promise<void> {
  try {
    const key = `${source}:${districtNumber}`;
    const saved = await getSavedOfficials();
    const updated = saved.filter((id) => id !== key);
    await AsyncStorage.setItem(SAVED_OFFICIALS_KEY, JSON.stringify(updated));
    
    const allData = await getSavedOfficialsWithData();
    const filtered = allData.filter(o => !(o.source === source && o.districtNumber === districtNumber));
    await AsyncStorage.setItem(SAVED_OFFICIALS_DATA_KEY, JSON.stringify(filtered));
  } catch {
    // Silently fail
  }
}

export async function isOfficialSavedByKey(source: string, districtNumber: number): Promise<boolean> {
  const saved = await getSavedOfficials();
  return saved.includes(`${source}:${districtNumber}`);
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

// Get all private notes keyed by official ID (for search index building)
export async function getAllPrivateNotes(): Promise<Record<string, PrivateNotes>> {
  try {
    const allNotes = await AsyncStorage.getItem(PRIVATE_NOTES_KEY);
    if (!allNotes) return {};
    return JSON.parse(allNotes) as Record<string, PrivateNotes>;
  } catch {
    return {};
  }
}

export async function savePrivateNotes(officialId: string, notes: PrivateNotes): Promise<void> {
  try {
    console.log('[Storage] Saving private notes for:', officialId, 'address:', notes.personalAddress);
    const allNotes = await AsyncStorage.getItem(PRIVATE_NOTES_KEY);
    const parsed = allNotes ? JSON.parse(allNotes) : {};
    parsed[officialId] = notes;
    await AsyncStorage.setItem(PRIVATE_NOTES_KEY, JSON.stringify(parsed));
    console.log('[Storage] Private notes saved successfully');
  } catch (error) {
    console.error('[Storage] Failed to save private notes:', error);
  }
}

const DEFAULT_OVERLAY_PREFS: OverlayPreferences = { 
  senate: true,   // Default to showing TX Senate overlay
  house: true,    // Default to showing TX House overlay
  congress: false // Default to NOT showing US Congress overlay
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
  followUpArchivedAt?: string;
  dueDate?: string; // ISO date string (YYYY-MM-DD)
  priority?: "low" | "medium" | "high";
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

export async function addNotePrayer(
  source: string,
  districtNumber: number,
  text: string,
  followUpNeeded: boolean,
  dueDate?: string,
  priority?: "low" | "medium" | "high"
): Promise<NotePrayerEntry> {
  const entries = await getNotesPrayer(source, districtNumber);
  const newEntry: NotePrayerEntry = {
    id: `np_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    text,
    followUpNeeded,
    dueDate,
    priority,
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

export interface OfficialsCacheData {
  officials: NormalizedOfficial[];
  source: string;
  timestamp: string;
  counts: { txHouse: number; txSenate: number; usHouse: number; total: number };
}

export async function getCachedOfficials(source: string): Promise<OfficialsCacheData | null> {
  try {
    const key = `${OFFICIALS_CACHE_KEY}:${source}`;
    const cached = await AsyncStorage.getItem(key);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

export async function setCachedOfficials(source: string, data: OfficialsCacheData): Promise<void> {
  try {
    const key = `${OFFICIALS_CACHE_KEY}:${source}`;
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Silently fail
  }
}

export async function validateCacheData(
  newData: NormalizedOfficial[],
  cachedData: OfficialsCacheData | null
): Promise<boolean> {
  if (newData.length === 0) return false;
  if (!cachedData) return true;
  const cachedCount = cachedData.officials.length;
  if (cachedCount === 0) return true;
  const dropPercent = (cachedCount - newData.length) / cachedCount;
  if (dropPercent > 0.25) return false;
  return true;
}

function getFavoriteKey(source: string, districtNumber: number): string {
  return `${source}:${districtNumber}`;
}

export async function getFavorites(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(FAVORITES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addFavorite(source: string, districtNumber: number): Promise<void> {
  try {
    const favorites = await getFavorites();
    const key = getFavoriteKey(source, districtNumber);
    if (!favorites.includes(key)) {
      favorites.push(key);
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }
  } catch {
    // Silently fail
  }
}

export async function removeFavorite(source: string, districtNumber: number): Promise<void> {
  try {
    const favorites = await getFavorites();
    const key = getFavoriteKey(source, districtNumber);
    const updated = favorites.filter(f => f !== key);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail
  }
}

export async function isFavorite(source: string, districtNumber: number): Promise<boolean> {
  const favorites = await getFavorites();
  return favorites.includes(getFavoriteKey(source, districtNumber));
}

export interface RecentOfficialEntry {
  source: string;
  districtNumber: number;
  timestamp: string;
}

const MAX_RECENTS = 20;

export async function getRecentViewed(): Promise<RecentOfficialEntry[]> {
  try {
    const data = await AsyncStorage.getItem(RECENT_VIEWED_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addRecentViewed(source: string, districtNumber: number): Promise<void> {
  try {
    let recents = await getRecentViewed();
    recents = recents.filter(r => !(r.source === source && r.districtNumber === districtNumber));
    recents.unshift({ source, districtNumber, timestamp: new Date().toISOString() });
    if (recents.length > MAX_RECENTS) recents = recents.slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(recents));
  } catch {
    // Silently fail
  }
}

export async function getRecentEngaged(): Promise<RecentOfficialEntry[]> {
  try {
    const data = await AsyncStorage.getItem(RECENT_ENGAGED_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addRecentEngaged(source: string, districtNumber: number): Promise<void> {
  try {
    let recents = await getRecentEngaged();
    recents = recents.filter(r => !(r.source === source && r.districtNumber === districtNumber));
    recents.unshift({ source, districtNumber, timestamp: new Date().toISOString() });
    if (recents.length > MAX_RECENTS) recents = recents.slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(RECENT_ENGAGED_KEY, JSON.stringify(recents));
  } catch {
    // Silently fail
  }
}

export interface RecentPlaceEntry {
  name: string;
  lat: number;
  lng: number;
  county?: string;
  timestamp: string;
}

const MAX_RECENT_PLACES = 10;

export async function getRecentPlaces(): Promise<RecentPlaceEntry[]> {
  try {
    const data = await AsyncStorage.getItem(RECENT_PLACES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addRecentPlace(place: Omit<RecentPlaceEntry, "timestamp">): Promise<void> {
  try {
    let recents = await getRecentPlaces();
    recents = recents.filter(r => !(r.lat === place.lat && r.lng === place.lng));
    recents.unshift({ ...place, timestamp: new Date().toISOString() });
    if (recents.length > MAX_RECENT_PLACES) recents = recents.slice(0, MAX_RECENT_PLACES);
    await AsyncStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(recents));
  } catch {
    // Silently fail
  }
}

export async function getAllFollowUps(includeArchived: boolean = false): Promise<{ source: string; districtNumber: number; entries: NotePrayerEntry[] }[]> {
  try {
    const allData = await AsyncStorage.getItem(NOTES_PRAYER_KEY);
    if (!allData) return [];
    const parsed = JSON.parse(allData) as Record<string, NotePrayerEntry[]>;
    const results: { source: string; districtNumber: number; entries: NotePrayerEntry[] }[] = [];
    for (const [key, entries] of Object.entries(parsed)) {
      const followUps = entries.filter(e => {
        if (!e.followUpNeeded) return false;
        if (includeArchived) {
          return !!e.followUpArchivedAt;
        }
        return !e.followUpArchivedAt;
      });
      if (followUps.length > 0) {
        const parts = key.split(":");
        if (parts.length === 3 && parts[0] === "private") {
          results.push({
            source: parts[1],
            districtNumber: parseInt(parts[2], 10),
            entries: followUps,
          });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function archiveFollowUp(source: string, districtNumber: number, entryId: string): Promise<void> {
  try {
    const entries = await getNotesPrayer(source, districtNumber);
    const updated = entries.map(e => 
      e.id === entryId ? { ...e, followUpArchivedAt: new Date().toISOString() } : e
    );
    await saveNotesPrayer(source, districtNumber, updated);
  } catch {
    // Silently fail
  }
}

export async function unarchiveFollowUp(source: string, districtNumber: number, entryId: string): Promise<void> {
  try {
    const entries = await getNotesPrayer(source, districtNumber);
    const updated = entries.map(e => 
      e.id === entryId ? { ...e, followUpArchivedAt: undefined } : e
    );
    await saveNotesPrayer(source, districtNumber, updated);
  } catch {
    // Silently fail
  }
}

const GEOCODE_CACHE_KEY = "@texas_districts:geocode_cache";

export interface GeocodedAddress {
  address: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface AddressDotData {
  officialId: string;
  source: string;
  districtNumber: number;
  lat: number;
  lng: number;
}

export async function getGeocodedAddressCache(): Promise<Record<string, GeocodedAddress>> {
  try {
    const data = await AsyncStorage.getItem(GEOCODE_CACHE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export async function saveGeocodedAddress(officialId: string, address: string, lat: number, lng: number): Promise<void> {
  try {
    const cache = await getGeocodedAddressCache();
    cache[officialId] = { address, lat, lng, timestamp: new Date().toISOString() };
    await AsyncStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail
  }
}

export async function getAllPrivateNotesWithAddresses(): Promise<Array<{
  officialId: string;
  personalAddress: string;
}>> {
  try {
    const allNotes = await AsyncStorage.getItem(PRIVATE_NOTES_KEY);
    console.log('[Storage] Raw private notes:', allNotes ? allNotes.substring(0, 200) : 'null');
    if (!allNotes) return [];
    const parsed = JSON.parse(allNotes) as Record<string, PrivateNotes>;
    const results: Array<{ officialId: string; personalAddress: string }> = [];
    for (const [officialId, notes] of Object.entries(parsed)) {
      console.log('[Storage] Checking official:', officialId, 'address:', notes.personalAddress);
      if (notes.personalAddress && notes.personalAddress.trim().length > 0) {
        results.push({ officialId, personalAddress: notes.personalAddress.trim() });
      }
    }
    return results;
  } catch (error) {
    console.error('[Storage] Error reading private notes:', error);
    return [];
  }
}

// ─── Mileage Tracker ──────────────────────────────────────────────────────────

const MILEAGE_ENTRIES_KEY = "@texas_districts:mileage_entries";

export interface MileageEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  startMileage: number;
  endMileage?: number; // optional until trip is completed
  totalMiles?: number; // optional until trip is completed
  startPhotoUri?: string;
  endPhotoUri?: string;
  status: "in_progress" | "completed";
  createdAt: string;
}

export async function getMileageEntries(): Promise<MileageEntry[]> {
  try {
    const data = await AsyncStorage.getItem(MILEAGE_ENTRIES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveMileageEntry(entry: MileageEntry): Promise<void> {
  try {
    const entries = await getMileageEntries();
    entries.push(entry);
    await AsyncStorage.setItem(MILEAGE_ENTRIES_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error("[Storage] Error saving mileage entry:", error);
  }
}

export async function updateMileageEntry(entry: MileageEntry): Promise<void> {
  try {
    const entries = await getMileageEntries();
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx !== -1) entries[idx] = entry;
    else entries.push(entry);
    await AsyncStorage.setItem(MILEAGE_ENTRIES_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error("[Storage] Error updating mileage entry:", error);
  }
}

export async function deleteMileageEntry(id: string): Promise<void> {
  try {
    const entries = await getMileageEntries();
    const filtered = entries.filter((e) => e.id !== id);
    await AsyncStorage.setItem(MILEAGE_ENTRIES_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("[Storage] Error deleting mileage entry:", error);
  }
}
