import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const BACKFILL_LAST_RUN_KEY = "@backfill_last_run";
const BACKFILL_INTERVAL_MS = 24 * 60 * 60 * 1000;

const EMPTY_PLACEHOLDERS = [
  "n/a",
  "na",
  "unknown",
  "tbd",
  "not available",
  "none",
  "\u2014",
  "-",
  ".",
  "pending",
];

function isEffectivelyEmpty(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (EMPTY_PLACEHOLDERS.includes(trimmed.toLowerCase())) return true;
  return false;
}

interface BackfillResult {
  checked: number;
  hometownFilled: number;
  skippedExisting: number;
  noDataAvailable: number;
}

export async function runStartupBackfill(): Promise<BackfillResult> {
  const result: BackfillResult = {
    checked: 0,
    hometownFilled: 0,
    skippedExisting: 0,
    noDataAvailable: 0,
  };

  try {
    const lastRun = await AsyncStorage.getItem(BACKFILL_LAST_RUN_KEY);
    if (lastRun) {
      const elapsed = Date.now() - parseInt(lastRun, 10);
      if (elapsed < BACKFILL_INTERVAL_MS) {
        console.log(
          `[Backfill] Skipping - last run ${Math.round(elapsed / 3600000)}h ago`,
        );
        return result;
      }
    }

    console.log("[Backfill] Starting hometown backfill check...");

    const baseUrl = getApiUrl();
    // Use the lightweight PUBLIC hometowns endpoint instead of the full roster.
    // The full /api/officials response merges with null private data, so it
    // never carried personalAddress — this fetch was heavy AND filled nothing.
    // /api/officials/hometowns returns only the (city-level) hometowns the
    // client is allowed to see, which is exactly what backfill needs.
    const hometownsRes = await fetch(
      new URL("/api/officials/hometowns", baseUrl).toString(),
    );
    if (!hometownsRes.ok) {
      console.error("[Backfill] Failed to fetch hometowns");
      return result;
    }
    const { addresses } = await hometownsRes.json();

    if (!addresses || !Array.isArray(addresses)) {
      console.error("[Backfill] Invalid hometowns response");
      return result;
    }

    const PRIVATE_NOTES_KEY = "@texas_districts:private_notes";
    const allNotesRaw = await AsyncStorage.getItem(PRIVATE_NOTES_KEY);
    const allNotes: Record<string, any> = allNotesRaw
      ? JSON.parse(allNotesRaw)
      : {};

    for (const addr of addresses) {
      result.checked++;
      const officialId = addr.officialId;
      if (!officialId) {
        result.noDataAvailable++;
        continue;
      }

      const localNotes = allNotes[officialId];
      const localAddress = localNotes?.personalAddress;

      if (!isEffectivelyEmpty(localAddress)) {
        result.skippedExisting++;
        continue;
      }

      const serverAddress = addr.personalAddress;
      if (!isEffectivelyEmpty(serverAddress)) {
        console.log(
          `[Backfill] Filling hometown for ${addr.officialName}: "${serverAddress}"`,
        );
        if (!allNotes[officialId]) {
          allNotes[officialId] = {};
        }
        allNotes[officialId].personalAddress = serverAddress;
        result.hometownFilled++;
      } else {
        result.noDataAvailable++;
      }
    }

    if (result.hometownFilled > 0) {
      await AsyncStorage.setItem(PRIVATE_NOTES_KEY, JSON.stringify(allNotes));
      console.log(
        `[Backfill] Saved ${result.hometownFilled} hometowns to local storage`,
      );
    }

    await AsyncStorage.setItem(BACKFILL_LAST_RUN_KEY, Date.now().toString());

    console.log(
      `[Backfill] Complete! Checked: ${result.checked}, Filled: ${result.hometownFilled}, Skipped (user-edited): ${result.skippedExisting}, No data: ${result.noDataAvailable}`,
    );

    return result;
  } catch (error) {
    console.error("[Backfill] Error during startup backfill:", error);
    return result;
  }
}
