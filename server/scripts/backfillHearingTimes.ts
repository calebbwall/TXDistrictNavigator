/**
 * One-shot script to correct `starts_at` on existing legislative_events rows
 * whose times were saved by the old server-local-TZ parser bug.
 *
 * Re-scrapes the TLO upcoming-meetings pages and force-updates `starts_at`
 * for each matching externalId. No fingerprint diff, no alerts, no push.
 *
 * Run: npx tsx server/scripts/backfillHearingTimes.ts
 */

import { db } from "../db";
import { legislativeEvents } from "../../shared/schema";
import { eq } from "drizzle-orm";
import {
  TLO_BASE,
  fetchWithRetry,
  parseMeetingsUpcomingPage,
} from "../jobs/targetedRefresh";

async function backfillChamber(chamber: "H" | "S"): Promise<{ checked: number; updated: number; missing: number }> {
  const url = `${TLO_BASE}/Committees/MeetingsUpcoming.aspx?chamber=${chamber}`;
  console.log(`[Backfill ${chamber}] Fetching ${url}`);
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    console.warn(`[Backfill ${chamber}] HTTP ${res.status}`);
    return { checked: 0, updated: 0, missing: 0 };
  }
  const html = await res.text();
  const parsed = parseMeetingsUpcomingPage(html, chamber);
  console.log(`[Backfill ${chamber}] Parsed ${parsed.length} meetings`);

  let checked = 0;
  let updated = 0;
  let missing = 0;

  for (const meeting of parsed) {
    if (!meeting.startsAt) continue;
    checked++;

    const rows = await db
      .select({ id: legislativeEvents.id, startsAt: legislativeEvents.startsAt })
      .from(legislativeEvents)
      .where(eq(legislativeEvents.externalId, meeting.externalId))
      .limit(1);

    if (rows.length === 0) {
      missing++;
      continue;
    }

    const existing = rows[0];
    const existingMs = existing.startsAt ? existing.startsAt.getTime() : null;
    const newMs = meeting.startsAt.getTime();
    if (existingMs === newMs) continue;

    await db
      .update(legislativeEvents)
      .set({ startsAt: meeting.startsAt, updatedAt: new Date() })
      .where(eq(legislativeEvents.id, existing.id));

    updated++;
    const before = existing.startsAt ? existing.startsAt.toISOString() : "null";
    console.log(
      `[Backfill ${chamber}] ${meeting.externalId}: ${before} -> ${meeting.startsAt.toISOString()}`,
    );
  }

  return { checked, updated, missing };
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log("[Backfill] Correcting hearing starts_at values");
  console.log("========================================");
  const start = Date.now();

  const house = await backfillChamber("H");
  const senate = await backfillChamber("S");

  console.log("----------------------------------------");
  console.log(`[Backfill House ] checked=${house.checked} updated=${house.updated} missing=${house.missing}`);
  console.log(`[Backfill Senate] checked=${senate.checked} updated=${senate.updated} missing=${senate.missing}`);
  console.log(`[Backfill] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Backfill] Fatal:", err);
    process.exit(1);
  });
