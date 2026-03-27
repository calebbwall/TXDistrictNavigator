/**
 * Daily legislative refresh — runs at 5:00 AM America/Chicago.
 *
 * Scope:
 *   1. Find committees linked to saved officials (via committeeMemberships)
 *   2. Add committees from user_subscriptions (type=COMMITTEE)
 *   3. If none found, fall back to top 20 committees in DB
 *   4. Refresh upcoming hearings (next 14 days) for each scoped committee
 *   5. For each new/changed hearing, fetch detail page
 *
 * Uses fingerprinting to avoid rewriting unchanged rows.
 */
import { db } from "../db";
import {
  legislativeEvents,
  alerts,
  type InsertAlert,
} from "@shared/schema";
import { sql, gte } from "drizzle-orm";
import {
  refreshChamberUpcomingHearings,
  refreshHearingDetail,
} from "./targetedRefresh";
import { sendPushToAll } from "../lib/expoPush";

let isDailyRefreshing = false;

export function getIsDailyRefreshing(): boolean {
  return isDailyRefreshing;
}

// ---------- PUBLIC: runDailyRefresh ----------
export async function runDailyRefresh(): Promise<{
  committeesRefreshed: number;
  newEvents: number;
  updatedEvents: number;
  detailsFetched: number;
  alertsCreated: number;
}> {
  if (isDailyRefreshing) {
    console.log("[dailyRefresh] Already running, skipping");
    return {
      committeesRefreshed: 0,
      newEvents: 0,
      updatedEvents: 0,
      detailsFetched: 0,
      alertsCreated: 0,
    };
  }

  isDailyRefreshing = true;
  const jobStart = Date.now();
  console.log("========================================");
  console.log("[dailyRefresh] BEGIN daily legislative refresh");
  console.log("========================================");

  let committeesRefreshed = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  let detailsFetched = 0;
  let alertsCreated = 0;

  try {
    const refreshStart = Date.now();

    // Refresh both chambers at once (new TLO URL returns all upcoming meetings per chamber)
    for (const chamber of ["H", "S"] as const) {
      try {
        const { newEvents, updatedEvents } = await refreshChamberUpcomingHearings(chamber, 30);
        totalNew += newEvents;
        totalUpdated += updatedEvents;
        committeesRefreshed++;

        // Create HEARING_POSTED alerts for genuinely new events (created in last 2 min)
        if (newEvents > 0) {
          const recentEvents = await db
            .select({
              id: legislativeEvents.id,
              title: legislativeEvents.title,
              startsAt: legislativeEvents.startsAt,
            })
            .from(legislativeEvents)
            .where(
              gte(legislativeEvents.createdAt, new Date(Date.now() - 2 * 60 * 1000)),
            );

          for (const event of recentEvents) {
            const dateLabel = event.startsAt
              ? event.startsAt.toLocaleDateString("en-US", {
                  timeZone: "America/Chicago",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "TBD";

            const alertTitle = `New Hearing: ${event.title}`;
            const alertBody = `Scheduled for ${dateLabel}`;
            await db.insert(alerts).values({
              userId: "default",
              alertType: "HEARING_POSTED",
              entityType: "event",
              entityId: event.id,
              title: alertTitle,
              body: alertBody,
            } satisfies InsertAlert);
            alertsCreated++;
            sendPushToAll(alertTitle, alertBody, {
              alertType: "HEARING_POSTED",
              entityId: event.id,
            }).catch((err) => console.error("[dailyRefresh] Push failed:", err));
          }
        }
      } catch (err) {
        console.error(`[dailyRefresh] Error refreshing chamber ${chamber}:`, err);
      }
    }

    // Fetch detail pages for events that have notice URLs (but no detail yet)
    const hearingsNeedingDetails = await db
      .select({ id: legislativeEvents.id, sourceUrl: legislativeEvents.sourceUrl })
      .from(legislativeEvents)
      .where(
        sql`${legislativeEvents.sourceUrl} LIKE '%tlodocs%' OR ${legislativeEvents.sourceUrl} LIKE '%MtgNotice%'`,
      )
      .limit(20);

    for (const ev of hearingsNeedingDetails) {
      try {
        const changed = await refreshHearingDetail(ev.id);
        if (changed) detailsFetched++;
        await sleep(300);
      } catch (err) {
        console.error("[dailyRefresh] Detail fetch failed:", err);
      }
    }

    console.log(`[dailyRefresh] Chamber refresh took ${Date.now() - refreshStart}ms`);

    const duration = Date.now() - jobStart;
    console.log("========================================");
    console.log(
      `[dailyRefresh] END: ${committeesRefreshed} committees, ` +
        `+${totalNew} new events, ~${totalUpdated} updated, ` +
        `${detailsFetched} details fetched, ${alertsCreated} alerts (${duration}ms)`,
    );
    console.log("========================================");

    return {
      committeesRefreshed,
      newEvents: totalNew,
      updatedEvents: totalUpdated,
      detailsFetched,
      alertsCreated,
    };
  } finally {
    isDailyRefreshing = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- DST-safe 5 AM Chicago scheduler helper ----------
/**
 * Compute milliseconds until the next 5:00 AM America/Chicago.
 * Called each time the daily job fires so DST transitions are handled correctly.
 */
export function msUntilNext5amChicago(): number {
  const now = new Date();
  // Get current time in Chicago as a string, parse hour/minute
  const chicagoStr = now.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const [h, m, s] = chicagoStr.split(":").map(Number);
  const secondsIntoDay = h * 3600 + m * 60 + (s || 0);
  const target5am = 5 * 3600; // 05:00:00

  let secondsUntil = target5am - secondsIntoDay;
  if (secondsUntil <= 0) secondsUntil += 24 * 3600; // roll to tomorrow

  return secondsUntil * 1000;
}
