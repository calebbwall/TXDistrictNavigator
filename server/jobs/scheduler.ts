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
import { db } from "../db";
import { committees, legislativeEvents } from "@shared/schema";
import { sql } from "drizzle-orm";

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

  // On startup: if the officials table is empty, run a full refresh immediately
  // instead of waiting for the Monday window. This ensures fresh deploys are
  // seeded without manual intervention.
  setTimeout(async () => {
    try {
      const { officialPublic } = await import("@shared/schema");
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(officialPublic);
      if (count === 0) {
        console.log("[Scheduler] Officials table is empty — running immediate full refresh cycle");
        await runRefreshCycle();
      } else {
        // Normal Monday-window tick
        schedulerTick().catch(err => {
          console.error("[Scheduler] Initial tick failed:", err);
        });
      }
    } catch (err) {
      console.error("[Scheduler] Startup check failed:", err);
    }
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

async function maybeRunStartupLegislativeRefresh(): Promise<void> {
  // Poll for committees to be populated before seeding events.
  // Committee scraping takes 5-15 minutes (70+ pages × 200ms delay + HTTP RTT),
  // so we cannot rely on a fixed timer — we poll until committees appear.
  const MAX_WAIT_MS = 30 * 60 * 1000; // wait up to 30 minutes
  const POLL_INTERVAL_MS = 30 * 1000; // re-check every 30 seconds
  const started = Date.now();

  try {
    while (true) {
      const [{ committeeCount }] = await db
        .select({ committeeCount: sql<number>`count(*)::int` })
        .from(committees);

      if (committeeCount > 0) break; // committees are in DB — proceed

      if (Date.now() - started >= MAX_WAIT_MS) {
        console.log("[Scheduler/legislative] Timed out waiting for committees — skipping startup event seed");
        return;
      }

      console.log("[Scheduler/legislative] Committees not yet seeded, waiting 30s...");
      await sleep(POLL_INTERVAL_MS);
    }

    // Re-seed feeds now that committees exist (idempotent — safe to call again)
    try {
      const { inserted } = await seedLegislativeFeeds();
      if (inserted > 0) {
        console.log(`[Scheduler/legislative] Seeded ${inserted} RSS feed(s) after committee refresh`);
      }
    } catch (err) {
      console.error("[Scheduler/legislative] Feed re-seed failed:", err);
    }

    const [{ eventCount }] = await db
      .select({ eventCount: sql<number>`count(*)::int` })
      .from(legislativeEvents);
    if (eventCount > 0) {
      console.log(`[Scheduler/legislative] ${eventCount} events already in DB — skipping startup daily refresh`);
      return;
    }

    // If committees exist but events are missing (e.g., server restarted after
    // committees were scraped), run the daily refresh immediately without waiting.
    console.log("[Scheduler/legislative] No events in DB — running startup daily refresh immediately");
    await runDailyRefresh();
  } catch (err) {
    console.error("[Scheduler/legislative] Startup event seed failed:", err);
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

  // Bootstrap events on fresh DB — starts after a short delay then polls until
  // committees are available (replaces the old fixed 2-minute wait which raced
  // against the committee scraper that can take 5-15 minutes).
  setTimeout(() => {
    maybeRunStartupLegislativeRefresh().catch((err) =>
      console.error("[Scheduler/legislative] Startup refresh error:", err)
    );
  }, 10 * 1000); // 10-second head-start, then polling handles the rest

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

/**
 * Full legislative bootstrap: committees → RSS feeds → events.
 * Exposed as POST /api/admin/bootstrap-legislative.
 * Use this to force-seed a fresh DB without waiting for the Monday scheduler window.
 */
export async function triggerFullLegislativeBootstrap(): Promise<{
  success: boolean;
  error?: string;
  committees?: unknown;
  feedsInserted?: number;
  events?: unknown;
}> {
  try {
    // Step 1: Force-refresh committees (both chambers)
    console.log("[Bootstrap] Step 1/3: Refreshing committees...");
    const { checkAndRefreshCommitteesIfChanged } = await import("./refreshCommittees");
    const committeeResult = await checkAndRefreshCommitteesIfChanged(true);

    // Step 2: Seed RSS feeds (idempotent)
    console.log("[Bootstrap] Step 2/3: Seeding RSS feeds...");
    const { inserted: feedsInserted } = await seedLegislativeFeeds();
    console.log(`[Bootstrap] ${feedsInserted} RSS feed(s) inserted`);

    // Step 3: Seed legislative events via daily refresh
    console.log("[Bootstrap] Step 3/3: Running daily refresh for events...");
    const eventResult = await runDailyRefresh();

    console.log("[Bootstrap] Complete");
    return {
      success: true,
      committees: committeeResult,
      feedsInserted,
      events: eventResult,
    };
  } catch (err) {
    console.error("[Bootstrap] Failed:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
