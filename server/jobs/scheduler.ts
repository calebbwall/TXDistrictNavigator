import {
  checkAndRefreshIfChanged,
  isInMondayCheckWindow,
  wasCheckedThisWeek,
  getIsRefreshing,
} from "./refreshOfficials";
import {
  checkAndRefreshGeoJSONIfChanged,
  wasGeoJSONCheckedThisWeek,
  getIsRefreshingGeoJSON,
} from "./refreshGeoJSON";
import {
  checkAndRefreshCommitteesIfChanged,
  wasCommitteesCheckedThisWeek,
  getIsRefreshingCommittees,
} from "./refreshCommittees";
import { refreshOtherTexasOfficials } from "./refreshOtherTexasOfficials";
import { resolveAllMissingPersonIds } from "../lib/identityResolver";

let schedulerInterval: NodeJS.Timeout | null = null;
let lastCheckWindowRun: Date | null = null;
let refreshCycleInProgress = false;

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Run a full refresh cycle with explicit ordering and logging.
 * 
 * Refresh Order:
 * 1. Legislature + US House officials
 * 2. Other Texas Officials (statewide offices)
 * 3. Resolve personIds for all active office records
 * 4. GeoJSON district boundaries
 * 5. Committees
 */
async function runRefreshCycle(): Promise<void> {
  if (refreshCycleInProgress) {
    console.log("[Scheduler] Refresh cycle already in progress, skipping");
    return;
  }
  
  refreshCycleInProgress = true;
  const cycleStart = Date.now();
  
  console.log("========================================");
  console.log("[Scheduler] BEGIN refresh cycle");
  console.log("========================================");
  
  try {
    // Step 1: Refresh Legislature + US House officials
    console.log("[Scheduler] Step 1/5: Refreshing Legislature + US House officials...");
    await checkAndRefreshIfChanged(false);
    
    // Step 2: Refresh Other Texas Officials
    console.log("[Scheduler] Step 2/5: Refreshing Other Texas Officials...");
    await refreshOtherTexasOfficials({ force: false });
    
    // Step 3: Resolve personIds for all active officials
    console.log("[Scheduler] Step 3/5: Resolving personIds for active officials...");
    const identityResult = await resolveAllMissingPersonIds();
    console.log(`[Scheduler] Identity resolution: ${identityResult.resolved} resolved, ${identityResult.created} new persons`);
    
    // Step 4: Refresh GeoJSON district boundaries
    console.log("[Scheduler] Step 4/5: Refreshing GeoJSON district boundaries...");
    await checkAndRefreshGeoJSONIfChanged(false);
    
    // Step 5: Refresh Committees
    console.log("[Scheduler] Step 5/5: Refreshing Committees...");
    await checkAndRefreshCommitteesIfChanged(false);
    
    const cycleDuration = Date.now() - cycleStart;
    console.log("========================================");
    console.log(`[Scheduler] END refresh cycle (${cycleDuration}ms)`);
    console.log("========================================");
    
  } catch (err) {
    console.error("[Scheduler] Error during refresh cycle:", err);
    console.log("========================================");
    console.log("[Scheduler] END refresh cycle (FAILED)");
    console.log("========================================");
  } finally {
    refreshCycleInProgress = false;
  }
}

async function schedulerTick(): Promise<void> {
  try {
    const officialsRefreshing = getIsRefreshing();
    const geoJSONRefreshing = getIsRefreshingGeoJSON();
    const committeesRefreshing = getIsRefreshingCommittees();
    
    if (officialsRefreshing || geoJSONRefreshing || committeesRefreshing || refreshCycleInProgress) {
      console.log("[Scheduler] Refresh in progress, skipping tick");
      return;
    }

    const inWindow = isInMondayCheckWindow();
    
    if (!inWindow) {
      return;
    }

    if (lastCheckWindowRun) {
      const timeSinceLast = Date.now() - lastCheckWindowRun.getTime();
      if (timeSinceLast < 60 * 60 * 1000) {
        return;
      }
    }

    const officialsChecked = await wasCheckedThisWeek();
    const geoJSONChecked = await wasGeoJSONCheckedThisWeek();
    const committeesChecked = await wasCommitteesCheckedThisWeek();
    
    if (officialsChecked && geoJSONChecked && committeesChecked) {
      console.log("[Scheduler] All sources already checked this week, skipping");
      return;
    }

    console.log("[Scheduler] Monday check window detected, starting full refresh cycle...");
    lastCheckWindowRun = new Date();
    
    // Run full refresh cycle with explicit ordering
    await runRefreshCycle();
    
  } catch (err) {
    console.error("[Scheduler] Error during tick:", err);
  }
}

/**
 * Export for admin endpoints to trigger full refresh cycle manually.
 */
export async function triggerFullRefreshCycle(): Promise<{ success: boolean; error?: string }> {
  try {
    await runRefreshCycle();
    return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

export function getRefreshCycleInProgress(): boolean {
  return refreshCycleInProgress;
}

export function startOfficialsRefreshScheduler(): void {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running");
    return;
  }

  console.log(`[Scheduler] Starting officials refresh scheduler (check every ${CHECK_INTERVAL_MS / 60000} minutes)`);
  
  schedulerInterval = setInterval(schedulerTick, CHECK_INTERVAL_MS);

  setTimeout(() => {
    schedulerTick().catch(err => {
      console.error("[Scheduler] Initial tick failed:", err);
    });
  }, 5000);
}

export function stopOfficialsRefreshScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Stopped");
  }
}

export function getSchedulerStatus(): {
  running: boolean;
  lastCheckWindowRun: Date | null;
  nextCheckIn: string;
} {
  const now = new Date();
  const centralOptions: Intl.DateTimeFormatOptions = {
    timeZone: "America/Chicago",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  };
  
  return {
    running: schedulerInterval !== null,
    lastCheckWindowRun,
    nextCheckIn: `Check window: Monday 3:00-4:00 AM Central Time (current: ${now.toLocaleString("en-US", centralOptions)})`,
  };
}
