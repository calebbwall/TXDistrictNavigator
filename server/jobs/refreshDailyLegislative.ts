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
  committees,
  committeeMemberships,
  officialPublic,
  userSubscriptions,
  legislativeEvents,
  hearingDetails,
  alerts,
  type InsertAlert,
} from "@shared/schema";
import { eq, sql, inArray, and, gte } from "drizzle-orm";
import {
  refreshCommitteeHearings,
  refreshHearingDetail,
} from "./targetedRefresh";
import { sendPushToAll } from "../lib/expoPush";

let isDailyRefreshing = false;

export function getIsDailyRefreshing(): boolean {
  return isDailyRefreshing;
}

// ---------- gather scoped committee IDs ----------
async function getScopedCommitteeIds(): Promise<string[]> {
  const ids = new Set<string>();

  // 1. Committees linked to officials who have private data (= "saved officials")
  //    saved officials are those with an officialPrivate record OR tagged in prayers —
  //    simplest proxy: any official with committee memberships
  //    For now: all committees that have at least one membership (proxy for active committees)
  const memberships = await db
    .select({ committeeId: committeeMemberships.committeeId })
    .from(committeeMemberships)
    .groupBy(committeeMemberships.committeeId)
    .limit(100);

  memberships.forEach((m) => ids.add(m.committeeId));

  // 2. Explicitly subscribed committees
  const subs = await db
    .select({ committeeId: userSubscriptions.committeeId })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.type, "COMMITTEE"),
        sql`${userSubscriptions.committeeId} IS NOT NULL`,
      ),
    );
  subs.forEach((s) => s.committeeId && ids.add(s.committeeId));

  // 3. Fallback: if still empty, grab up to 20 committees from DB
  if (ids.size === 0) {
    const fallback = await db
      .select({ id: committees.id })
      .from(committees)
      .limit(20);
    fallback.forEach((c) => ids.add(c.id));
  }

  return [...ids];
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
    const committeeIds = await getScopedCommitteeIds();
    console.log(`[dailyRefresh] Scoped to ${committeeIds.length} committees`);

    for (const committeeId of committeeIds) {
      try {
        const { newEvents, updatedEvents } = await refreshCommitteeHearings(
          committeeId,
          14,
        );
        totalNew += newEvents;
        totalUpdated += updatedEvents;
        committeesRefreshed++;

        // Create HEARING_POSTED alerts for genuinely new events
        if (newEvents > 0) {
          // Find events created in the last 2 minutes for this committee
          const recentEvents = await db
            .select({
              id: legislativeEvents.id,
              title: legislativeEvents.title,
              startsAt: legislativeEvents.startsAt,
            })
            .from(legislativeEvents)
            .where(
              and(
                eq(legislativeEvents.committeeId, committeeId),
                gte(
                  legislativeEvents.createdAt,
                  new Date(Date.now() - 2 * 60 * 1000),
                ),
              ),
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
            // Fire-and-forget push notification
            sendPushToAll(alertTitle, alertBody, { alertType: "HEARING_POSTED", entityId: event.id }).catch(
              (err) => console.error("[dailyRefresh] Push failed:", err),
            );
          }
        }

        // Fetch detail pages for new/updated hearings that have a notice URL
        const hearingsNeedingDetails = await db
          .select({ id: legislativeEvents.id, sourceUrl: legislativeEvents.sourceUrl })
          .from(legislativeEvents)
          .where(
            and(
              eq(legislativeEvents.committeeId, committeeId),
              sql`${legislativeEvents.sourceUrl} LIKE '%tlodocs%' OR ${legislativeEvents.sourceUrl} LIKE '%MtgNotice%'`,
            ),
          )
          .limit(10);

        for (const ev of hearingsNeedingDetails) {
          const changed = await refreshHearingDetail(ev.id);
          if (changed) detailsFetched++;
        }

        // Small delay between committees to avoid rate limiting
        await sleep(500);
      } catch (err) {
        console.error(`[dailyRefresh] Error refreshing committee ${committeeId}:`, err);
      }
    }

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
