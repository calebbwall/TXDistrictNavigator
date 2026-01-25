import {
  checkAndRefreshIfChanged,
  isInMondayCheckWindow,
  wasCheckedThisWeek,
  getIsRefreshing,
} from "./refreshOfficials";

let schedulerInterval: NodeJS.Timeout | null = null;
let lastCheckWindowRun: Date | null = null;

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function schedulerTick(): Promise<void> {
  try {
    if (getIsRefreshing()) {
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

    const alreadyChecked = await wasCheckedThisWeek();
    if (alreadyChecked) {
      console.log("[Scheduler] Already checked this week, skipping");
      return;
    }

    console.log("[Scheduler] Monday check window detected, running smart refresh...");
    lastCheckWindowRun = new Date();
    
    await checkAndRefreshIfChanged(false);
    
  } catch (err) {
    console.error("[Scheduler] Error during tick:", err);
  }
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
