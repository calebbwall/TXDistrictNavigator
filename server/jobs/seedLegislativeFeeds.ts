/**
 * Idempotent seed for rss_feeds rows.
 *
 * TLO does not publish RSS feeds in the traditional sense; instead we poll the
 * committee meetings list page (HTML_PAGE type) for each committee in the DB.
 *
 * Seed strategy:
 *   1. For each committee already in the committees table, ensure an rss_feeds row
 *      exists pointing at its MeetingsByCmte.aspx URL.
 *   2. Only inserts missing rows (URL unique constraint prevents duplicates).
 */
import { db } from "../db";
import { committees, rssFeeds, type InsertRssFeed } from "@shared/schema";
import { eq } from "drizzle-orm";

const TLO_BASE = "https://capitol.texas.gov";
const LEG_SESSION = "89R";

export async function seedLegislativeFeeds(): Promise<{
  inserted: number;
  skipped: number;
}> {
  const tag = "[seedFeeds]";
  console.log(`${tag} Seeding RSS/polling feeds for all committees...`);

  const allCommittees = await db
    .select({
      id: committees.id,
      chamber: committees.chamber,
      name: committees.name,
      sourceUrl: committees.sourceUrl,
    })
    .from(committees);

  if (allCommittees.length === 0) {
    console.log(`${tag} No committees in DB yet — seed will run again after first committee refresh`);
    return { inserted: 0, skipped: 0 };
  }

  // Get existing feed URLs to avoid re-querying DB per committee
  const existingFeeds = await db
    .select({ url: rssFeeds.url })
    .from(rssFeeds);
  const existingUrls = new Set(existingFeeds.map((f) => f.url));

  let inserted = 0;
  let skipped = 0;

  for (const committee of allCommittees) {
    // Derive committee code from sourceUrl
    const codeMatch = (committee.sourceUrl ?? "").match(/CmteCode=([A-Z0-9]+)/i);
    if (!codeMatch) {
      skipped++;
      continue;
    }
    const cmteCode = codeMatch[1];
    const url = `${TLO_BASE}/Committees/MeetingsByCmte.aspx?LegSess=${LEG_SESSION}&CmteCode=${cmteCode}`;

    if (existingUrls.has(url)) {
      skipped++;
      continue;
    }

    try {
      await db.insert(rssFeeds).values({
        feedType: "HTML_PAGE",
        url,
        scopeJson: { committeeId: committee.id, cmteCode, chamber: committee.chamber },
        enabled: true,
      } satisfies InsertRssFeed);
      inserted++;
      existingUrls.add(url); // prevent duplicate if committee list has same URL twice
    } catch {
      // URL unique constraint already exists (race condition), safe to ignore
      skipped++;
    }
  }

  console.log(`${tag} Done: ${inserted} feeds inserted, ${skipped} skipped`);
  return { inserted, skipped };
}
