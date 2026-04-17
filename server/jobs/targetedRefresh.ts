/**
 * Targeted legislative refresh utilities.
 * Called after RSS/polling detects a change, or by the daily refresh job.
 *
 * TLO URL patterns (89th Legislature):
 *   Upcoming meetings (new): https://capitol.texas.gov/Committees/MeetingsUpcoming.aspx?chamber=H|S
 *   Hearing notice (HTML):   https://capitol.texas.gov/tlodocs/89R/schedules/html/<docId>.htm
 *   Bill history:            https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB1234
 *
 * NOTE: MeetingsByCmte.aspx?LegSess=89R&CmteCode=XXX now redirects to a generic page —
 * use MeetingsUpcoming.aspx?chamber=H|S instead which lists all upcoming hearings per chamber.
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
  alerts,
  type InsertLegislativeEvent,
  type InsertHearingDetail,
  type InsertHearingAgendaItem,
  type InsertWitness,
  type InsertBill,
  type InsertBillAction,
  type InsertAlert,
} from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { sendPushToAll } from "../lib/expoPush";

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

// ---------- parse upcoming meetings page (new TLO structure) ----------
interface ParsedMeetingWithCode extends ParsedMeeting {
  cmteCode: string | null;
  meetingType: string | null;
}

/**
 * Parse the new TLO MeetingsUpcoming.aspx page.
 * Structure: date row (sectionTitle) → time row (Gainsboro) → one or more committee rows.
 */
function parseMeetingsUpcomingPage(html: string, chamberCode: "H" | "S"): ParsedMeetingWithCode[] {
  const $ = cheerio.load(html);
  const meetings: ParsedMeetingWithCode[] = [];
  let currentDateStr: string | null = null;
  let currentTimeStr: string | null = null;

  $("table tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length === 0) return;

    const firstTd = $(tds[0]);
    const dataLabel = (firstTd.attr("data-label") ?? "").toLowerCase();

    // Date row: data-label="Committee Meeting Date"
    if (dataLabel === "committee meeting date") {
      currentDateStr = firstTd.text().trim();
      return;
    }

    // Time row: data-label="Committee Meeting Time"
    if (dataLabel === "committee meeting time") {
      currentTimeStr = firstTd.text().trim();
      return;
    }

    // Committee meeting row: data-label contains "committee name"
    if (!dataLabel.includes("committee name")) return;
    if (!currentDateStr || !currentTimeStr) return;

    // Parse start time
    const startsAt = parseUpcomingDateTime(currentDateStr, currentTimeStr);

    // Extract committee name (text before the <br> tag)
    const cellHtml = firstTd.html() ?? "";
    const brIdx = cellHtml.search(/<br\s*\/?>/i);
    const namePart = brIdx >= 0 ? cellHtml.slice(0, brIdx) : cellHtml;
    const committeeName = cheerio.load(namePart).text().trim();
    if (!committeeName) return;

    // Extract type and location from after the <br>
    const afterBr = brIdx >= 0 ? firstTd.text().slice(committeeName.length).replace(/\u00a0/g, " ").trim() : "";
    const typeMatch = afterBr.match(/Type:\s*([^L]+?)(?:\s+Location:|$)/i);
    const locationMatch = afterBr.match(/Location:\s*(.+)/i);
    const meetingType = typeMatch ? typeMatch[1].trim() : null;
    const location = locationMatch ? locationMatch[1].trim() : null;

    // Extract notice URL and committee code from any link in the row
    let noticeDocUrl: string | null = null;
    let cmteCode: string | null = null;
    tds.each((_, td) => {
      $(td).find("a[href]").each((__, a) => {
        const href = $(a).attr("href") ?? "";
        if (!href.includes("tlodocs") && !href.includes("schedules")) return;
        const fullHref = href.startsWith("http")
          ? href
          : `${TLO_BASE}${href.startsWith("/") ? "" : "/"}${href}`;
        if (!noticeDocUrl) noticeDocUrl = fullHref;
        // Extract committee code from filename: C5102026040110001.HTM → C510
        if (!cmteCode) {
          const filename = href.split("/").pop() ?? "";
          const m = filename.match(/^([A-Z][A-Z0-9]{1,5}?)(?=20\d{2})/i);
          cmteCode = m ? m[1].toUpperCase() : null;
        }
      });
    });

    // Build stable externalId
    const dateKey = startsAt
      ? `${startsAt.getFullYear()}${String(startsAt.getMonth() + 1).padStart(2, "0")}${String(startsAt.getDate()).padStart(2, "0")}`
      : currentDateStr.replace(/[^0-9]/g, "").slice(0, 8);
    const timeKey = currentTimeStr.replace(/[^0-9APM]/g, "");
    const codeKey = cmteCode ?? committeeName.replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
    const externalId = `${chamberCode}${codeKey}-${dateKey}-${timeKey}`;

    const sourceUrl = noticeDocUrl ?? `${TLO_BASE}/Committees/MeetingsUpcoming.aspx?chamber=${chamberCode}`;

    meetings.push({
      externalId,
      title: committeeName,
      startsAt,
      location,
      sourceUrl,
      noticeDocUrl,
      cmteCode,
      meetingType,
    });
  });

  return meetings;
}

function parseUpcomingDateTime(dateStr: string, timeStr: string): Date | null {
  // dateStr: "Wednesday, April 1, 2026"  timeStr: "10:00 AM"
  try {
    const cleanDate = dateStr.replace(/^[A-Z][a-z]+,\s*/i, "").trim(); // "April 1, 2026"
    const timeMatch = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) return null;
    let hour = parseInt(timeMatch[1], 10);
    const min = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3].toUpperCase();
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const d = new Date(`${cleanDate} ${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// ---------- parse hearing notice page (agenda + witnesses) ----------
interface ParsedWitness {
  fullName: string;
  organization: string | null;
  position: string | null; // "FOR" | "AGAINST" | "ON"
  billNumber: string | null;
}

interface ParsedHearingDetail {
  title: string;
  committeeName: string | null;
  dateStr: string | null;
  location: string | null;
  noticeText: string;
  agendaItems: { billNumber: string | null; itemText: string; sortOrder: number }[];
  meetingType: string | null;
  witnesses: ParsedWitness[];
}

const WITNESS_POSITION_RE = /^(FOR|AGAINST|ON)$/i;
const WITNESS_BILL_RE = /\b([HS][BJR]{1,2}\s*\d+)\b/i;

/**
 * Extract witnesses from TLO notice HTML.
 *
 * TLO notice pages list witnesses in an HTML table whose cells contain
 * FOR/AGAINST/ON position keywords. When no table is found the function
 * falls back to scanning the plain text for a WITNESSES section.
 *
 * Column order varies across chambers and sessions; the function detects
 * layout from header text and falls back to positional heuristics.
 */
function parseWitnessesFromHtml($: ReturnType<typeof cheerio.load>): ParsedWitness[] {
  const results: ParsedWitness[] = [];

  // Strategy 1: find tables that contain position keyword cells
  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    if (rows.length < 2) return;

    // Confirm this table has at least one FOR/AGAINST/ON cell
    let hasPositionCell = false;
    rows.each((_, row) => {
      if (hasPositionCell) return;
      $(row).find("td").each((_, td) => {
        if (WITNESS_POSITION_RE.test($(td).text().trim())) hasPositionCell = true;
      });
    });
    if (!hasPositionCell) return;

    // Detect column indices from header row (th or first tr with th)
    let posCol = -1, nameCol = -1, orgCol = -1, billCol = -1;
    const headerCells = $(rows[0]).find("th");
    if (headerCells.length > 0) {
      headerCells.each((idx, th) => {
        const t = $(th).text().trim().toLowerCase();
        if (/position|stance/.test(t)) posCol = idx;
        else if (/witness|name/.test(t)) nameCol = idx;
        else if (/organ|represent|behalf|group/.test(t)) orgCol = idx;
        else if (/bill/.test(t)) billCol = idx;
      });
    }

    rows.each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const texts = cells.map((_, td) => $(td).text().trim()).get();

      // Find the position cell in this row
      const posIdx = posCol >= 0 ? posCol : texts.findIndex(t => WITNESS_POSITION_RE.test(t));
      if (posIdx < 0 || posIdx >= texts.length) return;

      const rawPosition = texts[posIdx].toUpperCase();
      const position = ["FOR", "AGAINST", "ON"].includes(rawPosition) ? rawPosition : null;

      // Remaining cells (excluding position) carry name, org, bill
      const rest = texts.filter((_, i) => i !== posIdx);

      let fullName: string | null = null;
      let organization: string | null = null;
      let billNumber: string | null = null;

      if (nameCol >= 0 && orgCol >= 0) {
        // Columns identified from header
        fullName = texts[nameCol] || null;
        organization = texts[orgCol] || null;
        billNumber = billCol >= 0 ? texts[billCol] || null : null;
      } else {
        // Heuristic: first non-empty rest cell = name, second = org
        // Any cell matching a bill pattern = bill
        for (const t of rest) {
          const bm = t.match(WITNESS_BILL_RE);
          if (bm && !billNumber) {
            billNumber = bm[1].replace(/\s+/g, "").toUpperCase();
            continue;
          }
          if (!fullName && t.length >= 2) { fullName = t; continue; }
          if (!organization && t.length >= 2) { organization = t; }
        }
      }

      if (!fullName || fullName.length < 2) return;

      if (billNumber) billNumber = billNumber.replace(/\s+/g, "").toUpperCase();

      results.push({ fullName, organization: organization || null, position, billNumber: billNumber || null });
    });
  });

  if (results.length > 0) return results;

  // Strategy 2: plain-text fallback — find a WITNESSES section and parse lines
  const fullText = $("body").text();
  const sectionMatch = fullText.match(/WITNESS(?:ES)?(?:\s+LIST)?\s*[:\n]([\s\S]{1,4000})/i);
  if (!sectionMatch) return results;

  const lines = sectionMatch[1].split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  let currentPosition: string | null = null;

  for (const line of lines) {
    // Position header line: "FOR:" or "AGAINST" alone on a line
    const posMatch = line.match(/^(FOR|AGAINST|ON(?:\s+THE\s+BILL)?)[:\s]*$/i);
    if (posMatch) {
      const raw = posMatch[1].replace(/\s+THE\s+BILL$/i, "").toUpperCase();
      currentPosition = ["FOR", "AGAINST", "ON"].includes(raw) ? raw : null;
      continue;
    }
    if (line.length < 3 || line.length > 200) continue;
    // "Name, Organization" or "Name - Organization"
    const parts = line.split(/,\s*|-\s+/);
    const fullName = parts[0]?.trim() || null;
    if (!fullName) continue;
    const organization = parts[1]?.trim() || null;
    const billMatch = line.match(WITNESS_BILL_RE);
    results.push({
      fullName,
      organization: organization || null,
      position: currentPosition,
      billNumber: billMatch ? billMatch[1].replace(/\s+/g, "").toUpperCase() : null,
    });
  }

  return results;
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

  const witnesses = parseWitnessesFromHtml($);

  return {
    title,
    committeeName,
    dateStr,
    location,
    noticeText: fullText.slice(0, 4000),
    agendaItems,
    meetingType,
    witnesses,
  };
}

// ---------- PUBLIC: refreshChamberUpcomingHearings ----------
/**
 * Fetch the MeetingsUpcoming.aspx page for a full chamber (H or S) and upsert
 * all upcoming hearings into legislative_events. This replaces the old per-committee
 * approach (MeetingsByCmte.aspx) which TLO has deprecated / redirected.
 *
 * Also builds a code→committeeId lookup from the DB so each event is associated
 * with the correct committee row.
 */
export async function refreshChamberUpcomingHearings(
  chamber: "H" | "S",
  windowDays = 30,
): Promise<{ newEvents: number; updatedEvents: number }> {
  const tag = `[targetedRefresh.chamberHearings.${chamber}]`;

  // Build cmteCode → DB committeeId map
  const allCommittees = await db
    .select({ id: committees.id, chamber: committees.chamber, sourceUrl: committees.sourceUrl })
    .from(committees);
  const codeToId = new Map<string, string>();
  for (const c of allCommittees) {
    const m = (c.sourceUrl ?? "").match(/CmteCode=([A-Z0-9]+)/i);
    if (m) codeToId.set(m[1].toUpperCase(), c.id);
  }

  // Fetch the chamber-wide upcoming meetings page
  const url = `${TLO_BASE}/Committees/MeetingsUpcoming.aspx?chamber=${chamber}`;
  console.log(`${tag} Fetching ${url}`);

  let html: string;
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      console.warn(`${tag} HTTP ${res.status}`);
      return { newEvents: 0, updatedEvents: 0 };
    }
    html = await res.text();
  } catch (err) {
    console.error(`${tag} Fetch failed:`, err);
    return { newEvents: 0, updatedEvents: 0 };
  }

  const parsed = parseMeetingsUpcomingPage(html, chamber);
  const chamberDb = chamber === "S" ? "TX_SENATE" : "TX_HOUSE";

  // Filter to windowDays from now
  const cutoff = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);
  const windowed = parsed.filter((m) => !m.startsAt || m.startsAt <= cutoff);

  console.log(`${tag} Parsed ${parsed.length} meetings, ${windowed.length} within ${windowDays}d window`);

  let newEvents = 0;
  let updatedEvents = 0;

  for (const meeting of windowed) {
    const committeeId = meeting.cmteCode ? codeToId.get(meeting.cmteCode) : undefined;
    const fp = fingerprint(JSON.stringify({ externalId: meeting.externalId, sourceUrl: meeting.sourceUrl }));

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
          chamber: chamberDb,
          committeeId: committeeId ?? undefined,
          title: meeting.title,
          startsAt: meeting.startsAt ?? undefined,
          location: meeting.location ?? undefined,
          sourceUrl: meeting.sourceUrl,
          externalId: meeting.externalId,
          fingerprint: fp,
          lastSeenAt: new Date(),
        } satisfies InsertLegislativeEvent)
        .returning({ id: legislativeEvents.id });

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

        const [ev] = await db
          .select({ title: legislativeEvents.title, startsAt: legislativeEvents.startsAt })
          .from(legislativeEvents)
          .where(eq(legislativeEvents.id, existing[0].id))
          .limit(1);

        if (ev) {
          const dateLabel = ev.startsAt
            ? ev.startsAt.toLocaleDateString("en-US", {
                timeZone: "America/Chicago",
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "TBD";
          const alertTitle = `Hearing Updated: ${ev.title}`;
          const alertBody = `Schedule for ${dateLabel} has changed`;
          await db.insert(alerts).values({
            userId: "default",
            alertType: "HEARING_UPDATED",
            entityType: "event",
            entityId: existing[0].id,
            title: alertTitle,
            body: alertBody,
          } satisfies InsertAlert);
          sendPushToAll(alertTitle, alertBody, { alertType: "HEARING_UPDATED", entityId: existing[0].id }).catch(
            (err) => console.error(`${tag} Push failed:`, err),
          );
        }
        updatedEvents++;
      } else {
        await db
          .update(legislativeEvents)
          .set({ lastSeenAt: new Date() })
          .where(eq(legislativeEvents.id, existing[0].id));
      }
    }
  }

  console.log(`${tag} Done: +${newEvents} new, ~${updatedEvents} updated`);
  return { newEvents, updatedEvents };
}

// ---------- PUBLIC: refreshCommitteeHearings ----------
/**
 * Refresh hearings for a single committee. Delegates to refreshChamberUpcomingHearings
 * for the appropriate chamber (the new TLO URL returns all chambers at once).
 * Kept for backward-compatibility with pollRssFeeds.ts.
 */
export async function refreshCommitteeHearings(
  committeeId: string,
  _windowDays = 14,
): Promise<{ newEvents: number; updatedEvents: number }> {
  const [committee] = await db
    .select({ chamber: committees.chamber })
    .from(committees)
    .where(eq(committees.id, committeeId))
    .limit(1);

  if (!committee) {
    console.warn(`[targetedRefresh.hearings] Committee ${committeeId} not found`);
    return { newEvents: 0, updatedEvents: 0 };
  }

  const chamberCode = committee.chamber === "TX_SENATE" ? "S" : "H";
  return refreshChamberUpcomingHearings(chamberCode);
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

  // Preserve the committee name title from the meetings list unless the event
  // only has the generic fallback title.  TLO notice pages sometimes lead with
  // accessibility/legal boilerplate that would corrupt the stored title.
  const currentTitle = event.title ?? "";
  const titleToStore =
    currentTitle && currentTitle !== "Committee Hearing"
      ? currentTitle
      : parsed.title;

  // Prefer the already-stored location (from meetings page, cleaner) over the
  // notice page location which can include chair/boilerplate context.
  await db
    .update(legislativeEvents)
    .set({
      title: titleToStore,
      location: event.location ?? parsed.location ?? undefined,
      fingerprint: fp,
      updatedAt: new Date(),
    })
    .where(eq(legislativeEvents.id, eventId));

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

  // Replace witnesses and update witness count
  await db.delete(witnesses).where(eq(witnesses.eventId, eventId));

  let insertedWitnessCount = 0;
  for (const [idx, w] of parsed.witnesses.entries()) {
    let billId: string | null = null;
    if (w.billNumber) {
      billId = await findOrCreateBill(w.billNumber);
    }
    await db.insert(witnesses).values({
      eventId,
      fullName: w.fullName,
      organization: w.organization ?? undefined,
      position: w.position ?? undefined,
      billId: billId ?? undefined,
      sortOrder: idx,
    } satisfies InsertWitness);
    insertedWitnessCount++;
  }

  // Upsert hearing_details with accurate witnessCount
  await db
    .insert(hearingDetails)
    .values({
      eventId,
      noticeText: parsed.noticeText,
      meetingType: parsed.meetingType ?? undefined,
      witnessCount: insertedWitnessCount,
    } satisfies InsertHearingDetail)
    .onConflictDoUpdate({
      target: hearingDetails.eventId,
      set: {
        noticeText: parsed.noticeText,
        meetingType: parsed.meetingType ?? undefined,
        witnessCount: insertedWitnessCount,
        updatedDate: new Date(),
      },
    });

  console.log(
    `${tag} Event ${eventId} updated: ${parsed.agendaItems.length} agenda items, ${insertedWitnessCount} witnesses`,
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
      const result = await db
        .insert(billActions)
        .values(row)
        .onConflictDoNothing()
        .returning({ id: billActions.id });
      if (result.length > 0) inserted++;
    } catch {
      // duplicate, skip
    }
  }

  // Alert for newly inserted bill actions
  if (inserted > 0) {
    const latestAction = rows[rows.length - 1];
    const alertTitle = `Bill Update: ${billNumber}`;
    const alertBody = latestAction?.actionText?.slice(0, 120) ?? `${inserted} new action${inserted > 1 ? "s" : ""}`;
    await db.insert(alerts).values({
      userId: "default",
      alertType: "BILL_ACTION",
      entityType: "bill",
      entityId: billId,
      title: alertTitle,
      body: alertBody,
    } satisfies InsertAlert);
    sendPushToAll(alertTitle, alertBody, { alertType: "BILL_ACTION", entityId: billId }).catch(
      (err) => console.error("[targetedRefresh] Push failed:", err),
    );
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
  // Check unfavorable before favorable (substring match ordering)
  if (t.includes("unfavorable") || t.includes("failed")) return "FAILED";
  if (t.includes("passed") || t.includes("favorable")) return "PASSED";
  if (t.includes("filed")) return "FILED";
  if (t.includes("signed")) return "SIGNED";
  if (t.includes("vetoed")) return "VETOED";
  if (t.includes("hearing")) return "HEARING_SCHEDULED";
  if (t.includes("vote") || t.includes("voted")) return "VOTE";
  return "ACTION";
}
