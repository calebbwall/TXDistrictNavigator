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
import { pollAllFeeds, getIsPollingRss } from "./pollRssFeeds";
import { runDailyRefresh, getIsDailyRefreshing, msUntilNext5amChicago } from "./refreshDailyLegislative";
import { processEventDateActions } from "../routes/prayerRoutes";
import { seedLegislativeFeeds } from "./seedLegislativeFeeds";

let schedulerInterval: NodeJS.Timeout | null = null;
let lastCheckWindowRun: Date | null = null;
let refreshCycleInProgress = false;

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ── Legislative scheduler state ──
let rssInterval: NodeJS.Timeout | null = null;
let dailyTimer: NodeJS.Timeout | null = null;
let lastRssPollAt: Date | null = null;
let lastDailyRefreshAt: Date | null = null;

const RSS_POLL_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

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
    console.log("[Scheduler] Step 1/6: Refreshing Legislature + US House officials...");
    await checkAndRefreshIfChanged(false);
    
    // Step 2: Refresh Other Texas Officials
    console.log("[Scheduler] Step 2/6: Refreshing Other Texas Officials...");
    await refreshOtherTexasOfficials({ force: false });
    
    // Step 3: Resolve personIds for all active officials
    console.log("[Scheduler] Step 3/6: Resolving personIds for active officials...");
    const identityResult = await resolveAllMissingPersonIds();
    console.log(`[Scheduler] Identity resolution: ${identityResult.resolved} resolved, ${identityResult.created} new persons`);
    
    // Step 4: Refresh GeoJSON district boundaries
    console.log("[Scheduler] Step 4/6: Refreshing GeoJSON district boundaries...");
    await checkAndRefreshGeoJSONIfChanged(false);
    
    // Step 5: Refresh Committees
    console.log("[Scheduler] Step 5/6: Refreshing Committees...");
    await checkAndRefreshCommitteesIfChanged(false);
    
    // Step 6: Backfill hometowns from Texas Tribune
    console.log("[Scheduler] Step 6/6: Backfilling hometowns...");
    try {
      const { bulkFillHometowns } = await import("../scripts/bulkFillHometowns");
      const hometownResult = await bulkFillHometowns();
      console.log(`[Scheduler] Hometown backfill: filled=${hometownResult.filled}, skipped=${hometownResult.skipped}`);
    } catch (err) {
      console.error("[Scheduler] Hometown backfill failed:", err);
    }
    
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

  // ── Legislative schedulers ──
  startLegislativeSchedulers();
}

export function stopOfficialsRefreshScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Stopped");
  }
  stopLegislativeSchedulers();
}

export function getSchedulerStatus(): {
  running: boolean;
  lastCheckWindowRun: Date | null;
  nextCheckIn: string;
  legislative: {
    rssRunning: boolean;
    lastRssPollAt: Date | null;
    lastDailyRefreshAt: Date | null;
    nextDailyRefreshIn: string;
  };
} {
  const now = new Date();
  const centralOptions: Intl.DateTimeFormatOptions = {
    timeZone: "America/Chicago",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  };

  const msUntilDaily = msUntilNext5amChicago();
  const hoursUntil = Math.floor(msUntilDaily / 3600000);
  const minsUntil = Math.floor((msUntilDaily % 3600000) / 60000);

  return {
    running: schedulerInterval !== null,
    lastCheckWindowRun,
    nextCheckIn: `Check window: Monday 3:00-4:00 AM Central Time (current: ${now.toLocaleString("en-US", centralOptions)})`,
    legislative: {
      rssRunning: rssInterval !== null,
      lastRssPollAt,
      lastDailyRefreshAt,
      nextDailyRefreshIn: `${hoursUntil}h ${minsUntil}m (5:00 AM America/Chicago)`,
    },
  };
}

// ── Legislative scheduler internals ──

function scheduleNextDailyRefresh(): void {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
  const delay = msUntilNext5amChicago();
  const h = Math.floor(delay / 3600000);
  const m = Math.floor((delay % 3600000) / 60000);
  console.log(`[Scheduler/daily] Next daily legislative refresh in ${h}h ${m}m (5:00 AM America/Chicago)`);

  dailyTimer = setTimeout(async () => {
    console.log("[Scheduler/daily] 5:00 AM trigger — running daily legislative refresh");
    lastDailyRefreshAt = new Date();
    try {
      await runDailyRefresh();
    } catch (err) {
      console.error("[Scheduler/daily] Daily refresh failed:", err);
    }
    try {
      await processEventDateActions();
      console.log("[Scheduler/daily] processEventDateActions completed");
    } catch (err) {
      console.error("[Scheduler/daily] processEventDateActions failed:", err);
    }
    // Schedule the next day's run
    scheduleNextDailyRefresh();
  }, delay);
}

async function runRssPoll(): Promise<void> {
  if (getIsPollingRss() || getIsDailyRefreshing()) {
    console.log("[Scheduler/rss] Poll or daily refresh in progress, skipping");
    return;
  }
  lastRssPollAt = new Date();
  try {
    await pollAllFeeds();
  } catch (err) {
    console.error("[Scheduler/rss] Poll failed:", err);
  }
}

function startLegislativeSchedulers(): void {
  console.log("[Scheduler/legislative] Starting RSS poller (every 60 min) + daily refresh (5 AM Chicago)");

  // Seed feeds first (idempotent) then start polling
  seedLegislativeFeeds()
    .catch((err) => console.error("[Scheduler/legislative] Seed failed:", err))
    .finally(() => {
      // Start hourly RSS polling — first poll after 30 seconds
      setTimeout(() => {
        runRssPoll();
        rssInterval = setInterval(runRssPoll, RSS_POLL_INTERVAL_MS);
      }, 30_000);
    });

  // Schedule DST-safe daily refresh
  scheduleNextDailyRefresh();
}

function stopLegislativeSchedulers(): void {
  if (rssInterval) {
    clearInterval(rssInterval);
    rssInterval = null;
  }
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
  console.log("[Scheduler/legislative] Stopped");
}

// ── Manual trigger exports for admin endpoints ──
export async function triggerRssPoll(): Promise<{ success: boolean; error?: string; result?: unknown }> {
  try {
    const result = await pollAllFeeds();
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function triggerDailyRefresh(): Promise<{ success: boolean; error?: string; result?: unknown }> {
  try {
    const result = await runDailyRefresh();
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
