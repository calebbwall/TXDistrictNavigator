/**
 * Hourly RSS / HTML page poller.
 *
 * For each enabled rss_feed row:
 *   - Sends conditional GET (If-None-Match / If-Modified-Since) when etag/lastModified is stored
 *   - 304: update last_polled_at, done
 *   - 200: compute fingerprint, compare to stored guid fingerprints; upsert new items
 *   - For each NEW item: insert alert + trigger targeted refresh
 *
 * Rate limiting: at most 5 concurrent in-flight requests at any time.
 */
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { db } from "../db";
import {
  rssFeeds,
  rssItems,
  alerts,
  type InsertRssItem,
  type InsertAlert,
  type RssFeed,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { refreshCommitteeHearings } from "./targetedRefresh";

const MAX_CONCURRENT = 5;
let isPolling = false;

export function getIsPollingRss(): boolean {
  return isPolling;
}

// ---------- fingerprint ----------
function itemFingerprint(parts: (string | null | undefined)[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex")
    .slice(0, 16);
}

// ---------- fetch with conditional headers ----------
interface FetchResult {
  status: number;
  body: string | null;
  etag: string | null;
  lastModified: string | null;
}

async function conditionalFetch(feed: RssFeed): Promise<FetchResult> {
  const headers: Record<string, string> = {
    "User-Agent": "TXDistrictNavigator/1.0 (Legislative Data Sync)",
  };
  if (feed.etag) headers["If-None-Match"] = feed.etag;
  if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(feed.url, { headers });
      const etag = res.headers.get("etag");
      const lastModified = res.headers.get("last-modified");

      if (res.status === 304) {
        return { status: 304, body: null, etag, lastModified };
      }
      if (res.ok) {
        const body = await res.text();
        return { status: 200, body, etag, lastModified };
      }
      if (res.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      console.warn(`[pollRss] HTTP ${res.status} for ${feed.url}`);
      return { status: res.status, body: null, etag: null, lastModified: null };
    } catch (err) {
      if (attempt === 2) {
        console.error(`[pollRss] Fetch error for ${feed.url}:`, err);
        return { status: 0, body: null, etag: null, lastModified: null };
      }
      await sleep(1000 * (attempt + 1));
    }
  }
  return { status: 0, body: null, etag: null, lastModified: null };
}

// ---------- RSS XML parser ----------
interface RssEntry {
  guid: string;
  title: string;
  link: string;
  summary: string | null;
  publishedAt: Date | null;
}

function parseRssXml(xml: string): RssEntry[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const entries: RssEntry[] = [];

  // Atom feed
  $("feed > entry").each((_, el) => {
    const guid = $(el).find("id").first().text().trim();
    const title = $(el).find("title").first().text().trim();
    const link =
      $(el).find("link[rel='alternate']").attr("href") ||
      $(el).find("link").attr("href") ||
      "";
    const summary = $(el).find("summary, content").first().text().trim() || null;
    const pubText = $(el).find("published, updated").first().text().trim();
    const publishedAt = pubText ? new Date(pubText) : null;
    if (guid && title) entries.push({ guid, title, link, summary, publishedAt });
  });

  if (entries.length > 0) return entries;

  // RSS 2.0
  $("channel > item").each((_, el) => {
    const guid =
      $(el).find("guid").text().trim() ||
      $(el).find("link").text().trim();
    const title = $(el).find("title").first().text().trim();
    const link = $(el).find("link").text().trim() || $(el).find("link").next().text().trim();
    const summary =
      $(el).find("description").first().text().trim() || null;
    const pubText =
      $(el).find("pubDate").text().trim() ||
      $(el).find("dc\\:date").text().trim();
    const publishedAt = pubText ? new Date(pubText) : null;
    if (guid && title) entries.push({ guid, title, link, summary, publishedAt });
  });

  return entries;
}

// ---------- HTML page parser (fingerprint-based) ----------
/**
 * For HTML_PAGE feeds, we treat the whole page as one "item".
 * The guid is the feed URL + date key (daily granularity).
 * We only insert a new item when the fingerprint changes.
 */
function parseHtmlPageAsItem(html: string, feedUrl: string): RssEntry | null {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || feedUrl;
  const fp = crypto.createHash("sha256").update(html).digest("hex").slice(0, 8);
  // Daily guid so we create at most one item per day per page change
  const dateKey = new Date().toISOString().slice(0, 10);
  return {
    guid: `${feedUrl}#${dateKey}-${fp}`,
    title,
    link: feedUrl,
    summary: `Page content updated (fingerprint ${fp})`,
    publishedAt: new Date(),
  };
}

// ---------- process a single feed ----------
async function processFeed(
  feed: RssFeed,
  stats: { feeds304: number; feedsNew: number; items: number; alerts: number },
): Promise<void> {
  const tag = `[pollRss][${feed.feedType}]`;
  const result = await conditionalFetch(feed);

  // Always update last_polled_at + conditional headers
  const headerUpdate = {
    lastPolledAt: new Date(),
    ...(result.etag !== null ? { etag: result.etag } : {}),
    ...(result.lastModified !== null ? { lastModified: result.lastModified } : {}),
    updatedAt: new Date(),
  };

  if (result.status === 304) {
    await db.update(rssFeeds).set(headerUpdate).where(eq(rssFeeds.id, feed.id));
    stats.feeds304++;
    return;
  }

  if (!result.body) {
    await db.update(rssFeeds).set(headerUpdate).where(eq(rssFeeds.id, feed.id));
    return;
  }

  // Parse entries
  let entries: RssEntry[] = [];
  if (feed.feedType === "RSS_XML") {
    entries = parseRssXml(result.body);
  } else {
    // HTML_PAGE: single synthetic entry
    const entry = parseHtmlPageAsItem(result.body, feed.url);
    if (entry) entries = [entry];
  }

  await db.update(rssFeeds).set(headerUpdate).where(eq(rssFeeds.id, feed.id));

  // Upsert items, track new ones
  for (const entry of entries) {
    const fp = itemFingerprint([entry.title, entry.link, entry.summary, entry.publishedAt?.toISOString()]);

    // Check if already exists
    const existing = await db
      .select({ id: rssItems.id, fingerprint: rssItems.fingerprint })
      .from(rssItems)
      .where(and(eq(rssItems.feedId, feed.id), eq(rssItems.guid, entry.guid)))
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].fingerprint !== fp) {
        // Content changed — update fingerprint but don't re-alert
        await db
          .update(rssItems)
          .set({ fingerprint: fp, summary: entry.summary ?? undefined })
          .where(eq(rssItems.id, existing[0].id));
      }
      continue;
    }

    // New item
    await db.insert(rssItems).values({
      feedId: feed.id,
      guid: entry.guid,
      title: entry.title,
      link: entry.link,
      summary: entry.summary ?? undefined,
      publishedAt: entry.publishedAt ?? undefined,
      fingerprint: fp,
    } satisfies InsertRssItem);

    stats.items++;
    stats.feedsNew++;

    // Insert alert
    await db.insert(alerts).values({
      userId: "default",
      alertType: "RSS_ITEM",
      entityType: "rss_item",
      entityId: entry.guid,
      title: entry.title.slice(0, 200),
      body: entry.summary?.slice(0, 500) ?? entry.link,
    } satisfies InsertAlert);
    stats.alerts++;

    // Trigger targeted refresh if scope is a committee
    const scope = feed.scopeJson as { committeeId?: string } | null;
    if (scope?.committeeId) {
      try {
        await refreshCommitteeHearings(scope.committeeId, 14);
      } catch (err) {
        console.error(`${tag} Targeted refresh failed for committee ${scope.committeeId}:`, err);
      }
    }

    console.log(`${tag} New item: "${entry.title.slice(0, 80)}"`);
  }
}

// ---------- concurrency limiter ----------
async function limitedMap<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// ---------- PUBLIC: pollAllFeeds ----------
export async function pollAllFeeds(): Promise<{
  feeds: number;
  feeds304: number;
  feedsNew: number;
  newItems: number;
  newAlerts: number;
}> {
  if (isPolling) {
    console.log("[pollRss] Already polling, skipping");
    return { feeds: 0, feeds304: 0, feedsNew: 0, newItems: 0, newAlerts: 0 };
  }

  isPolling = true;
  const start = Date.now();
  console.log("[pollRss] BEGIN hourly RSS/HTML poll");

  const stats = { feeds304: 0, feedsNew: 0, items: 0, alerts: 0 };

  try {
    const feeds = await db
      .select()
      .from(rssFeeds)
      .where(eq(rssFeeds.enabled, true));

    console.log(`[pollRss] Polling ${feeds.length} enabled feeds`);

    await limitedMap(feeds, MAX_CONCURRENT, (feed) =>
      processFeed(feed, stats).catch((err) =>
        console.error(`[pollRss] Error processing feed ${feed.id}:`, err),
      ),
    );

    const duration = Date.now() - start;
    console.log(
      `[pollRss] END poll: ${feeds.length} feeds, ${stats.feeds304} unchanged (304), ` +
        `${stats.feedsNew} with new items, ${stats.items} new items, ` +
        `${stats.alerts} alerts created (${duration}ms)`,
    );

    return {
      feeds: feeds.length,
      feeds304: stats.feeds304,
      feedsNew: stats.feedsNew,
      newItems: stats.items,
      newAlerts: stats.alerts,
    };
  } finally {
    isPolling = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
