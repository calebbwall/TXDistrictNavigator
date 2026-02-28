/**
 * Targeted legislative refresh utilities.
 * Called after RSS/polling detects a change, or by the daily refresh job.
 *
 * TLO URL patterns (89th Legislature):
 *   Committee meetings list: https://capitol.texas.gov/Committees/MeetingsByCmte.aspx?LegSess=89R&CmteCode=HCF
 *   Hearing notice (HTML):   https://capitol.texas.gov/tlodocs/89R/schedules/html/<docId>.htm
 *   Bill history:            https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB1234
 */
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { db } from "../db";
import {
  committees,
  legislativeEvents,
  hearingDetails,
  hearingAgendaItems,
  witnesses,
  bills,
  billActions,
  type InsertLegislativeEvent,
  type InsertHearingDetail,
  type InsertHearingAgendaItem,
  type InsertWitness,
  type InsertBill,
  type InsertBillAction,
} from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

const TLO_BASE = "https://capitol.texas.gov";
const LEG_SESSION = "89R";

// ---------- fetch helper (same pattern as refreshCommittees.ts) ----------
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "TXDistrictNavigator/1.0 (Legislative Data Sync)",
          ...options.headers,
        },
      });
      if (response.ok || response.status === 304 || response.status === 404) {
        return response;
      }
      if (response.status === 429) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${url}`);
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function fingerprint(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

// ---------- parse committee meetings list page ----------
interface ParsedMeeting {
  externalId: string; // stable TLO doc id or date-based key
  title: string;
  startsAt: Date | null;
  location: string | null;
  sourceUrl: string; // link to notice page
  noticeDocUrl: string | null;
}

function parseIsoDateTime(dateStr: string, timeStr: string): Date | null {
  // TLO date format: "01/15/2025" time: "9:00 AM"
  try {
    const [month, day, year] = dateStr.split("/").map(Number);
    const [timePart, ampm] = timeStr.trim().split(" ");
    const [rawHour, rawMin] = timePart.split(":").map(Number);
    let hour = rawHour;
    if (ampm?.toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (ampm?.toUpperCase() === "AM" && hour === 12) hour = 0;
    // Build ISO string in America/Chicago context (store as UTC, display with tz)
    const dateIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(rawMin ?? 0).padStart(2, "0")}:00`;
    return new Date(dateIso); // naive local → caller note: UTC offset not adjusted; fine for storage
  } catch {
    return null;
  }
}

function parseMeetingsPage(html: string, committeeCode: string, chamberCode: "H" | "S"): ParsedMeeting[] {
  const $ = cheerio.load(html);
  const meetings: ParsedMeeting[] = [];

  // TLO meetings table: each row is a meeting with Date, Time, Room, Notice columns
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const dateText = $(cells[0]).text().trim();
    const timeText = $(cells[1]).text().trim();
    const roomText = $(cells[2]).text().trim();

    // Skip header rows
    if (!dateText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) return;

    const startsAt = parseIsoDateTime(dateText, timeText);
    const dateKey = dateText.replace(/\//g, "");

    // Look for notice link
    let noticeDocUrl: string | null = null;
    let noticeHref: string | null = null;
    cells.each((_, cell) => {
      const link = $(cell).find("a[href]").first();
      if (link.length) {
        const href = link.attr("href") || "";
        if (href.includes("tlodocs") || href.includes("schedules") || href.includes("MtgNotice")) {
          noticeHref = href.startsWith("http") ? href : `${TLO_BASE}${href.startsWith("/") ? "" : "/"}${href}`;
          noticeDocUrl = noticeHref;
        }
      }
    });

    // Derive stable external ID from committee code + date + time
    const externalId = `${chamberCode}${committeeCode}-${dateKey}-${timeText.replace(/[^0-9APM]/g, "")}`;

    meetings.push({
      externalId,
      title: `Committee Hearing`, // enriched in detail fetch
      startsAt,
      location: roomText || null,
      sourceUrl:
        noticeDocUrl ??
        `${TLO_BASE}/Committees/MeetingsByCmte.aspx?LegSess=${LEG_SESSION}&CmteCode=${committeeCode}`,
      noticeDocUrl,
    });
  });

  return meetings;
}

// ---------- parse hearing notice page (agenda + witnesses) ----------
interface ParsedHearingDetail {
  title: string;
  committeeName: string | null;
  dateStr: string | null;
  location: string | null;
  noticeText: string;
  agendaItems: { billNumber: string | null; itemText: string; sortOrder: number }[];
  meetingType: string | null;
}

function parseHearingNoticePage(html: string): ParsedHearingDetail {
  const $ = cheerio.load(html);
  const fullText = $("body").text().replace(/\s+/g, " ").trim();

  // Extract committee name (usually in H1 or prominent heading)
  const committeeName =
    $("h1, h2, .committee-name, [class*='committee']").first().text().trim() ||
    null;

  // Extract date/time/location from common TLO notice format
  let dateStr: string | null = null;
  let location: string | null = null;
  let meetingType: string | null = null;

  const dateMatch = fullText.match(
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)/i,
  );
  if (dateMatch) dateStr = `${dateMatch[1]} ${dateMatch[2]}`;

  const roomMatch = fullText.match(/(?:Room|Rm\.?|E\d\.\d{3}|Capitol\s+Extension)/i);
  if (roomMatch) {
    const idx = fullText.indexOf(roomMatch[0]);
    location = fullText.slice(idx, idx + 60).split(/[,\n]/)[0].trim();
  }

  const typeMatch = fullText.match(/(?:Public Hearing|Work Session|Formal Meeting|Mark-up)/i);
  if (typeMatch) meetingType = typeMatch[0];

  // Extract agenda items — look for bill numbers HB/SB/HJR/SJR etc.
  const agendaItems: ParsedHearingDetail["agendaItems"] = [];
  const billPattern = /\b([HS][BJR]{1,2}\s*\d+)\b/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  let sortOrder = 0;

  while ((match = billPattern.exec(fullText)) !== null) {
    const billNumber = match[1].replace(/\s+/g, "").toUpperCase();
    if (seen.has(billNumber)) continue;
    seen.add(billNumber);

    // Extract surrounding context as itemText (up to 200 chars)
    const start = Math.max(0, match.index - 20);
    const end = Math.min(fullText.length, match.index + 200);
    const context = fullText.slice(start, end).replace(/\s+/g, " ").trim();

    agendaItems.push({ billNumber, itemText: context, sortOrder: sortOrder++ });
  }

  const title = committeeName
    ? `${committeeName} Hearing`
    : "Committee Hearing";

  return {
    title,
    committeeName,
    dateStr,
    location,
    noticeText: fullText.slice(0, 4000),
    agendaItems,
    meetingType,
  };
}

// ---------- PUBLIC: refreshCommitteeHearings ----------
/**
 * Fetch committee meetings page for a given committeeId (DB id).
 * Upserts legislative_events for meetings within the next windowDays.
 * Returns count of new/updated events.
 */
export async function refreshCommitteeHearings(
  committeeId: string,
  windowDays = 14,
): Promise<{ newEvents: number; updatedEvents: number }> {
  const tag = "[targetedRefresh.hearings]";

  // Look up committee record
  const [committee] = await db
    .select()
    .from(committees)
    .where(eq(committees.id, committeeId))
    .limit(1);

  if (!committee) {
    console.warn(`${tag} Committee ${committeeId} not found`);
    return { newEvents: 0, updatedEvents: 0 };
  }

  // Derive committee code from sourceUrl
  // e.g. https://capitol.texas.gov/Committees/MembershipCmte.aspx?LegSess=89R&CmteCode=HCF
  const codeMatch = (committee.sourceUrl ?? "").match(/CmteCode=([A-Z0-9]+)/i);
  if (!codeMatch) {
    console.warn(`${tag} Cannot derive CmteCode from ${committee.sourceUrl}`);
    return { newEvents: 0, updatedEvents: 0 };
  }
  const cmteCode = codeMatch[1];
  const chamberCode = committee.chamber === "TX_SENATE" ? "S" : "H";

  const url = `${TLO_BASE}/Committees/MeetingsByCmte.aspx?LegSess=${LEG_SESSION}&CmteCode=${cmteCode}`;
  console.log(`${tag} Fetching ${url}`);

  let html: string;
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      console.warn(`${tag} HTTP ${res.status} for ${url}`);
      return { newEvents: 0, updatedEvents: 0 };
    }
    html = await res.text();
  } catch (err) {
    console.error(`${tag} Fetch failed for ${url}:`, err);
    return { newEvents: 0, updatedEvents: 0 };
  }

  const meetings = parseMeetingsPage(html, cmteCode, chamberCode);

  // Filter to windowDays
  const cutoff = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);
  const windowedMeetings = meetings.filter(
    (m) => !m.startsAt || m.startsAt <= cutoff,
  );

  let newEvents = 0;
  let updatedEvents = 0;

  for (const meeting of windowedMeetings) {
    const fp = fingerprint(
      JSON.stringify({ externalId: meeting.externalId, sourceUrl: meeting.sourceUrl }),
    );

    const existing = await db
      .select({ id: legislativeEvents.id, fingerprint: legislativeEvents.fingerprint })
      .from(legislativeEvents)
      .where(eq(legislativeEvents.externalId, meeting.externalId))
      .limit(1);

    if (existing.length === 0) {
      const [inserted] = await db
        .insert(legislativeEvents)
        .values({
          eventType: "COMMITTEE_HEARING",
          chamber: committee.chamber,
          committeeId,
          title: meeting.title,
          startsAt: meeting.startsAt ?? undefined,
          location: meeting.location ?? undefined,
          sourceUrl: meeting.sourceUrl,
          externalId: meeting.externalId,
          fingerprint: fp,
          lastSeenAt: new Date(),
        } satisfies InsertLegislativeEvent)
        .returning({ id: legislativeEvents.id });

      // Insert skeleton hearing_details row
      if (inserted) {
        await db
          .insert(hearingDetails)
          .values({ eventId: inserted.id, witnessCount: 0 } satisfies InsertHearingDetail)
          .onConflictDoNothing();
      }

      newEvents++;
    } else {
      if (existing[0].fingerprint !== fp) {
        await db
          .update(legislativeEvents)
          .set({ fingerprint: fp, lastSeenAt: new Date(), updatedAt: new Date() })
          .where(eq(legislativeEvents.id, existing[0].id));
        updatedEvents++;
      } else {
        // Touch lastSeenAt so we know it's still live
        await db
          .update(legislativeEvents)
          .set({ lastSeenAt: new Date() })
          .where(eq(legislativeEvents.id, existing[0].id));
      }
    }
  }

  console.log(
    `${tag} Committee ${cmteCode}: ${meetings.length} meetings found, +${newEvents} new, ~${updatedEvents} updated`,
  );
  return { newEvents, updatedEvents };
}

// ---------- PUBLIC: refreshHearingDetail ----------
/**
 * Fetch the hearing notice HTML for a given event and populate
 * hearing_details + agenda items.
 */
export async function refreshHearingDetail(eventId: string): Promise<boolean> {
  const tag = "[targetedRefresh.hearingDetail]";

  const [event] = await db
    .select()
    .from(legislativeEvents)
    .where(eq(legislativeEvents.id, eventId))
    .limit(1);

  if (!event) {
    console.warn(`${tag} Event ${eventId} not found`);
    return false;
  }

  // Determine the notice URL — prefer sourceUrl if it points to a notice page
  let noticeUrl = event.sourceUrl;
  if (!noticeUrl.includes("tlodocs") && !noticeUrl.includes("MtgNotice")) {
    console.log(`${tag} No direct notice URL for event ${eventId}, skipping detail fetch`);
    return false;
  }

  console.log(`${tag} Fetching notice ${noticeUrl}`);
  let html: string;
  try {
    const res = await fetchWithRetry(noticeUrl);
    if (!res.ok) {
      console.warn(`${tag} HTTP ${res.status} for ${noticeUrl}`);
      return false;
    }
    html = await res.text();
  } catch (err) {
    console.error(`${tag} Fetch failed:`, err);
    return false;
  }

  const fp = fingerprint(html);

  // Check if fingerprint changed
  const [existing] = await db
    .select({ fingerprint: legislativeEvents.fingerprint })
    .from(legislativeEvents)
    .where(eq(legislativeEvents.id, eventId))
    .limit(1);

  if (existing?.fingerprint === fp) {
    console.log(`${tag} No change for event ${eventId}`);
    return false; // unchanged
  }

  const parsed = parseHearingNoticePage(html);

  // Update event title/location if enriched
  await db
    .update(legislativeEvents)
    .set({
      title: parsed.title,
      location: parsed.location ?? event.location ?? undefined,
      fingerprint: fp,
      updatedAt: new Date(),
    })
    .where(eq(legislativeEvents.id, eventId));

  // Upsert hearing_details
  await db
    .insert(hearingDetails)
    .values({
      eventId,
      noticeText: parsed.noticeText,
      meetingType: parsed.meetingType ?? undefined,
      witnessCount: 0,
    } satisfies InsertHearingDetail)
    .onConflictDoUpdate({
      target: hearingDetails.eventId,
      set: {
        noticeText: parsed.noticeText,
        meetingType: parsed.meetingType ?? undefined,
        updatedDate: new Date(),
      },
    });

  // Replace agenda items
  await db.delete(hearingAgendaItems).where(eq(hearingAgendaItems.eventId, eventId));

  for (const item of parsed.agendaItems) {
    // Find or create bill record
    let billId: string | null = null;
    if (item.billNumber) {
      billId = await findOrCreateBill(item.billNumber);
    }

    await db.insert(hearingAgendaItems).values({
      eventId,
      billId: billId ?? undefined,
      billNumber: item.billNumber ?? undefined,
      itemText: item.itemText,
      sortOrder: item.sortOrder,
    } satisfies InsertHearingAgendaItem);
  }

  console.log(
    `${tag} Event ${eventId} updated: ${parsed.agendaItems.length} agenda items`,
  );
  return true;
}

// ---------- PUBLIC: refreshBillHistory ----------
/**
 * Fetch bill action history from TLO for a given bill number.
 * Only call for bills that are on a hearing agenda or explicitly subscribed.
 */
export async function refreshBillHistory(billNumber: string): Promise<number> {
  const tag = "[targetedRefresh.billHistory]";
  const url = `${TLO_BASE}/BillLookup/History.aspx?LegSess=${LEG_SESSION}&Bill=${encodeURIComponent(billNumber)}`;

  console.log(`${tag} Fetching history for ${billNumber}`);
  let html: string;
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      console.warn(`${tag} HTTP ${res.status}`);
      return 0;
    }
    html = await res.text();
  } catch (err) {
    console.error(`${tag} Fetch failed:`, err);
    return 0;
  }

  const $ = cheerio.load(html);
  const billId = await findOrCreateBill(billNumber);
  if (!billId) return 0;

  let inserted = 0;
  const rows: InsertBillAction[] = [];

  // TLO history page has a table with Date, Description columns
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const dateText = $(cells[0]).text().trim();
    const descText = $(cells[1]).text().trim();
    if (!dateText || !descText || !dateText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) return;

    const [month, day, year] = dateText.split("/").map(Number);
    const actionAt = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);

    const externalId = `${billNumber}-${dateText}-${fingerprint(descText)}`;

    rows.push({
      billId,
      actionAt,
      actionText: descText,
      parsedActionType: parsedActionType(descText),
      sourceUrl: url,
      externalId,
    });
  });

  for (const row of rows) {
    try {
      await db
        .insert(billActions)
        .values(row)
        .onConflictDoNothing();
      inserted++;
    } catch {
      // duplicate, skip
    }
  }

  console.log(`${tag} ${billNumber}: ${inserted} actions upserted`);
  return inserted;
}

// ---------- helpers ----------
async function findOrCreateBill(billNumber: string): Promise<string | null> {
  const clean = billNumber.trim().toUpperCase();

  const existing = await db
    .select({ id: bills.id })
    .from(bills)
    .where(and(eq(bills.billNumber, clean), eq(bills.legSession, LEG_SESSION)))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [inserted] = await db
    .insert(bills)
    .values({
      billNumber: clean,
      legSession: LEG_SESSION,
      sourceUrl: `${TLO_BASE}/BillLookup/History.aspx?LegSess=${LEG_SESSION}&Bill=${encodeURIComponent(clean)}`,
    } satisfies InsertBill)
    .onConflictDoNothing()
    .returning({ id: bills.id });

  return inserted?.id ?? null;
}

function parsedActionType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("referred to")) return "COMMITTEE_REFERRAL";
  if (t.includes("passed") || t.includes("favorable")) return "PASSED";
  if (t.includes("failed") || t.includes("unfavorable")) return "FAILED";
  if (t.includes("filed")) return "FILED";
  if (t.includes("signed")) return "SIGNED";
  if (t.includes("vetoed")) return "VETOED";
  if (t.includes("hearing")) return "HEARING_SCHEDULED";
  if (t.includes("vote") || t.includes("voted")) return "VOTE";
  return "ACTION";
}
