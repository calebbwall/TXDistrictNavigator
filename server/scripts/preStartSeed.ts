/**
 * Pre-start seed script — populates the DB with all required data before the
 * server begins accepting requests.
 *
 * Run via: npm run db:seed
 *
 * Calling sequence:
 *   1. Push DB schema (drizzle-kit push)
 *   2. Refresh officials (TX House, TX Senate, US House, Other TX)
 *   3. Refresh committees (both chambers)
 *   4. Backfill legislator hometowns from Texas Tribune
 *   5. Seed RSS feeds and run daily legislative refresh to populate hearings
 *
 * Each step is idempotent — safe to re-run after partial failure.
 */

import { db } from "../db";
import { officialPublic, committees, legislativeEvents, officialPrivate } from "../../shared/schema";
import { sql } from "drizzle-orm";

async function count(table: Parameters<typeof db.select>[0] extends undefined ? never : any): Promise<number> {
  // Generic count helper
  return 0; // placeholder — counts are done inline below
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log("[PreStartSeed] BEGIN pre-start database seed");
  console.log("========================================");
  const start = Date.now();

  // ── Step 1: Check what's already populated ──
  const [officialsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(officialPublic);
  const [committeesRow] = await db.select({ n: sql<number>`count(*)::int` }).from(committees);
  const [eventsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(legislativeEvents);
  const [hometownsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(officialPrivate);

  console.log(`[PreStartSeed] Current DB state:`);
  console.log(`  Officials: ${officialsRow.n}`);
  console.log(`  Committees: ${committeesRow.n}`);
  console.log(`  Hometowns: ${hometownsRow.n}`);
  console.log(`  Legislative events: ${eventsRow.n}`);

  // ── Step 2: Officials ──
  if (officialsRow.n === 0) {
    console.log("[PreStartSeed] Step 1/4: Officials table empty — running full refresh...");
    const { checkAndRefreshIfChanged } = await import("../jobs/refreshOfficials");
    await checkAndRefreshIfChanged(true);
    const { refreshOtherTexasOfficials } = await import("../jobs/refreshOtherTexasOfficials");
    await refreshOtherTexasOfficials({ force: true });
    const { resolveAllMissingPersonIds } = await import("../lib/identityResolver");
    await resolveAllMissingPersonIds();
  } else {
    console.log(`[PreStartSeed] Step 1/4: Officials already populated (${officialsRow.n}) — skipping`);
  }

  // ── Step 3: Committees ──
  if (committeesRow.n === 0) {
    console.log("[PreStartSeed] Step 2/4: Committees table empty — refreshing...");
    const { checkAndRefreshCommitteesIfChanged } = await import("../jobs/refreshCommittees");
    await checkAndRefreshCommitteesIfChanged(true);
  } else {
    console.log(`[PreStartSeed] Step 2/4: Committees already populated (${committeesRow.n}) — skipping`);
  }

  // ── Step 4: Hometowns ──
  const [updatedOfficialsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(officialPublic);
  if (hometownsRow.n < updatedOfficialsRow.n * 0.5) {
    // If fewer than half of officials have hometown records, run backfill
    console.log(`[PreStartSeed] Step 3/4: Hometowns incomplete (${hometownsRow.n} of ${updatedOfficialsRow.n}) — running backfill...`);
    const { bulkFillHometowns } = await import("./bulkFillHometowns");
    const result = await bulkFillHometowns();
    console.log(`[PreStartSeed] Hometown backfill: filled=${result.filled}, notFound=${result.notFound}, errors=${result.errors}`);
  } else {
    console.log(`[PreStartSeed] Step 3/4: Hometowns sufficiently populated (${hometownsRow.n}) — skipping`);
  }

  // ── Step 5: Legislative events ──
  if (eventsRow.n === 0) {
    console.log("[PreStartSeed] Step 4/4: No legislative events — seeding RSS feeds and running daily refresh...");
    const { seedLegislativeFeeds } = await import("../jobs/seedLegislativeFeeds");
    const { inserted } = await seedLegislativeFeeds();
    if (inserted > 0) console.log(`[PreStartSeed] Seeded ${inserted} RSS feed(s)`);

    const { runDailyRefresh } = await import("../jobs/refreshDailyLegislative");
    const eventResult = await runDailyRefresh();
    console.log(`[PreStartSeed] Daily refresh: +${eventResult.newEvents} new events, ${eventResult.alertsCreated} alerts`);
  } else {
    console.log(`[PreStartSeed] Step 4/4: Legislative events already populated (${eventsRow.n}) — skipping`);
  }

  const duration = Date.now() - start;
  console.log("========================================");
  console.log(`[PreStartSeed] END pre-start seed complete in ${Math.round(duration / 1000)}s`);
  console.log("========================================");

  process.exit(0);
}

main().catch((err) => {
  console.error("[PreStartSeed] FATAL:", err);
  process.exit(1);
});
