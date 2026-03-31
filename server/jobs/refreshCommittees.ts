import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { db, pool } from "../db";
import { committees, committeeMemberships, committeeRefreshState, officialPublic, alerts, type InsertCommittee, type InsertCommitteeMembership, type InsertAlert } from "@shared/schema";
import { sendPushToAll } from "../lib/expoPush";
import { eq, and, sql, ilike, isNotNull } from "drizzle-orm";

// Unique advisory lock ID for committee refresh — prevents concurrent refreshes across instances
const COMMITTEE_REFRESH_LOCK_ID = 624242;

const TLO_BASE_URL = "https://capitol.texas.gov";
const CURRENT_LEG_SESSION = "89R";

type CommitteeSource = "TX_HOUSE_COMMITTEES" | "TX_SENATE_COMMITTEES";
type ChamberType = "TX_HOUSE" | "TX_SENATE";

interface ParsedCommittee {
  name: string;
  slug: string;
  code: string;
  sourceUrl: string;
  isSubcommittee: boolean;
  parentCode: string | null; // Code of parent committee for subcommittees
  sortOrder: number;
}

interface ParsedMember {
  memberName: string;
  roleTitle: string;
  legCode: string;
  sortOrder: number;
}

interface CommitteeWithMembers {
  committee: ParsedCommittee;
  members: ParsedMember[];
}

let isRefreshing = false;

export function getIsRefreshingCommittees(): boolean {
  return isRefreshing;
}

export function forceResetIsRefreshingCommittees(): void {
  isRefreshing = false;
}

async function fetchWithRetry(url: string, retries = 3, timeoutMs = 20000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (Committee Data Sync)",
        },
      });
      clearTimeout(timer);
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      clearTimeout(timer);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

function computeFingerprint(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Titles that appear in committee rosters but are not elected officials in our DB.
// Members whose normalized name (after prefix stripping) still contains one of these
// will be silently skipped rather than generating a match-failure warning.
const NON_OFFICIAL_PREFIXES = ["lt. gov.", "lieutenant governor", "speaker"];

function normalizeName(name: string): string {
  return name
    .replace(/^(Rep\.|Sen\.|Lt\.?\s*Gov\.?|Representative|Senator|Lieutenant\s+Governor)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function fetchCommitteeList(chamber: "H" | "S"): Promise<ParsedCommittee[]> {
  const url = `${TLO_BASE_URL}/committees/Committees.aspx?Chamber=${chamber}`;
  console.log(`[RefreshCommittees] Fetching committee list from ${url}`);

  const response = await fetchWithRetry(url);
  const html = await response.text();
  const $ = cheerio.load(html);

  const rawCommittees: Array<{ name: string; code: string }> = [];
  const seenCodes = new Set<string>();
  const GENERIC_LABELS = new Set(["meetings", "members", "bills", "membership", "home"]);

  function extractCommitteeName(el: ReturnType<typeof $>[number]): string {
    const linkText = $(el).text().trim();
    if (linkText && !GENERIC_LABELS.has(linkText.toLowerCase())) {
      return linkText;
    }
    // Link text is generic — look for committee name in the parent row
    const row = $(el).closest("tr");
    if (row.length) {
      // Prefer cells with no links (just name text)
      let found = "";
      row.find("td").each((_, cell) => {
        if (found) return;
        const $cell = $(cell);
        if ($cell.find("a").length === 0) {
          const txt = $cell.text().trim();
          if (txt && !GENERIC_LABELS.has(txt.toLowerCase()) && txt.length > 3) {
            found = txt;
          }
        }
      });
      if (found) return found;
      // Also try link text in cells that doesn't point to a committee nav page
      row.find("td a").each((_, a) => {
        if (found) return;
        const aText = $(a).text().trim();
        const aHref = $(a).attr("href") || "";
        if (
          aText &&
          !GENERIC_LABELS.has(aText.toLowerCase()) &&
          !aHref.includes("MeetingsByCmte") &&
          !aHref.includes("MembershipCmte") &&
          aText.length > 3
        ) {
          found = aText;
        }
      });
      if (found) return found;
    }
    return linkText;
  }

  // Look for committee links — both meetings and membership pages carry CmteCode
  $('a[href*="MeetingsByCmte.aspx"], a[href*="MembershipCmte.aspx"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!href) return;

    const codeMatch = href.match(/CmteCode=([A-Z0-9]+)/i);
    const code = codeMatch ? codeMatch[1] : "";
    if (!code || seenCodes.has(code)) return;

    const name = extractCommitteeName(el);
    if (!name) return;

    seenCodes.add(code);
    rawCommittees.push({ name, code });
  });
  
  const result: ParsedCommittee[] = [];
  let currentParentCode: string | null = null;
  let sortOrder = 0;
  
  for (const { name, code } of rawCommittees) {
    const isAppropriationsSubcommittee = name.toLowerCase().startsWith("appropriations - s/c");
    const isStandaloneSubcommittee = name.toLowerCase().startsWith("s/c on") || name.toLowerCase().startsWith("s/c ");
    const isSubcommittee = isAppropriationsSubcommittee || isStandaloneSubcommittee;
    
    let parentCode: string | null = null;
    
    if (isAppropriationsSubcommittee) {
      const appropriationsCommittee = rawCommittees.find(c => 
        c.name.toLowerCase() === "appropriations"
      );
      parentCode = appropriationsCommittee?.code || null;
    } else if (isStandaloneSubcommittee) {
      parentCode = currentParentCode;
    } else {
      currentParentCode = code;
    }
    
    result.push({
      name,
      slug: createSlug(name),
      code,
      sourceUrl: `${TLO_BASE_URL}/Committees/MembershipCmte.aspx?LegSess=${CURRENT_LEG_SESSION}&CmteCode=${code}`,
      isSubcommittee,
      parentCode,
      sortOrder: sortOrder++,
    });
  }
  
  const subcommitteeCount = result.filter(c => c.isSubcommittee).length;
  console.log(`[RefreshCommittees] Found ${result.length} committees for chamber ${chamber} (${subcommitteeCount} subcommittees)`);
  return result;
}

function isValidPersonName(name: string): boolean {
  if (!name || name.length < 3) return false;
  if (name.endsWith(":")) return false;
  if (/^\d/.test(name)) return false;
  if (/\d{5,}/.test(name)) return false;
  
  const invalidPatterns = [
    /^texas legislature/i,
    /^help.*faq/i,
    /^site.*map/i,
    /^contact.*login/i,
    /^bill:/i,
    /^clerk:/i,
    /^phone:/i,
    /^fax:/i,
    /^email:/i,
    /^address:/i,
    /^room:/i,
    /^member$/i,
    /^position$/i,
    /mapcontact/i,
    /login$/i,
    /online$/i,
    /website/i,
    /capitol\.texas/i,
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(name)) return false;
  }
  
  const nameParts = name.split(/\s+/).filter(p => p.length > 0);
  if (nameParts.length < 2) return false;
  
  return true;
}

async function fetchCommitteeMembers(committee: ParsedCommittee): Promise<ParsedMember[]> {
  const url = committee.sourceUrl;
  
  try {
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const members: ParsedMember[] = [];
    let sortOrder = 0;

    // TLO now renders memberships in a CSS-grid div, not a <table>.
    // Structure: div.grid-template-two-column_membershipcmte > div (pairs of position|member)
    const gridDiv = $("div.grid-template-two-column_membershipcmte");
    if (gridDiv.length > 0) {
      const cells = gridDiv.children("div").toArray();
      // First two cells are header ("Position" / "Member") — skip them
      let currentRole = "Member";
      for (let i = 2; i < cells.length - 1; i += 2) {
        const positionText = $(cells[i]).text().trim();
        const memberCell = $(cells[i + 1]);
        const memberLink = memberCell.find("a");
        const memberName = memberLink.text().trim() || memberCell.text().trim();
        const memberHref = memberLink.attr("href") || "";

        // Update the running role when a position label is present
        if (positionText) {
          if (/^chair$/i.test(positionText)) {
            currentRole = "Chair";
          } else if (/^vice\s*chair$/i.test(positionText)) {
            currentRole = "Vice Chair";
          } else if (/^members?$/i.test(positionText)) {
            currentRole = "Member";
          }
        }

        if (!memberName) continue;
        if (!isValidPersonName(memberName)) continue;

        const legCodeMatch = memberHref.match(/LegCode=([A-Z0-9]+)/i);
        const legCode = legCodeMatch ? legCodeMatch[1] : "";

        members.push({
          memberName: memberName.replace(/^(Rep\.|Sen\.)\s*/i, "").trim(),
          roleTitle: currentRole,
          legCode,
          sortOrder: sortOrder++,
        });
      }
    } else {
      // Fallback: legacy <table> layout (kept for safety)
      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;

        const positionCell = $(cells[0]).text().trim();
        const memberCell = $(cells[1]);
        const memberLink = memberCell.find("a");
        const memberName = memberLink.text().trim() || memberCell.text().trim();
        const memberHref = memberLink.attr("href") || "";

        if (!memberName || memberName === "Member") return;
        if (positionCell === "Position") return;
        if (!isValidPersonName(memberName)) return;

        const legCodeMatch = memberHref.match(/LegCode=([A-Z0-9]+)/i);
        const legCode = legCodeMatch ? legCodeMatch[1] : "";

        let roleTitle = "Member";
        if (positionCell.includes("Chair:") && !positionCell.includes("Vice")) {
          roleTitle = "Chair";
        } else if (positionCell.includes("Vice Chair:")) {
          roleTitle = "Vice Chair";
        }

        members.push({
          memberName: memberName.replace(/^(Rep\.|Sen\.)\s*/i, "").trim(),
          roleTitle,
          legCode,
          sortOrder: sortOrder++,
        });
      });
    }

    return members;
  } catch (err) {
    console.error(`[RefreshCommittees] Failed to fetch members for ${committee.name}:`, err);
    return [];
  }
}

async function fetchAllCommitteesWithMembers(chamber: ChamberType): Promise<CommitteeWithMembers[]> {
  const chamberCode = chamber === "TX_HOUSE" ? "H" : "S";
  const committeeList = await fetchCommitteeList(chamberCode);

  const result: CommitteeWithMembers[] = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < committeeList.length; i += CONCURRENCY) {
    const batch = committeeList.slice(i, i + CONCURRENCY);
    const membersBatch = await Promise.all(batch.map(c => fetchCommitteeMembers(c)));
    for (let j = 0; j < batch.length; j++) {
      result.push({ committee: batch[j], members: membersBatch[j] });
    }
    // Brief pause between batches to avoid hammering TLO
    if (i + CONCURRENCY < committeeList.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return result;
}

async function matchMemberToOfficial(
  memberName: string,
  legCode: string,
  chamber: ChamberType
): Promise<string | null> {
  const source = chamber;
  
  const officials = await db
    .select({ id: officialPublic.id, fullName: officialPublic.fullName, sourceMemberId: officialPublic.sourceMemberId })
    .from(officialPublic)
    .where(and(
      eq(officialPublic.source, source),
      eq(officialPublic.active, true)
    ));
  
  const normalizedSearchName = normalizeName(memberName);
  
  for (const official of officials) {
    const normalizedOfficialName = normalizeName(official.fullName);
    
    if (normalizedOfficialName === normalizedSearchName) {
      return official.id;
    }
    
    const searchParts = normalizedSearchName.split(" ");
    const officialParts = normalizedOfficialName.split(" ");
    
    if (searchParts.length >= 2 && officialParts.length >= 2) {
      const searchLast = searchParts[searchParts.length - 1];
      const officialLast = officialParts[officialParts.length - 1];
      const searchFirst = searchParts[0];
      const officialFirst = officialParts[0];
      
      if (searchLast === officialLast && 
          (searchFirst === officialFirst || searchFirst.charAt(0) === officialFirst.charAt(0))) {
        return official.id;
      }
    }
  }
  
  // Silently skip known non-official roles (Lt. Governor, Speaker, etc.)
  const rawLower = memberName.toLowerCase().replace(/\s+/g, " ").trim();
  const isNonOfficial = NON_OFFICIAL_PREFIXES.some(p => rawLower.startsWith(p) || rawLower.includes(p));
  if (!isNonOfficial) {
    console.log(`[RefreshCommittees] Could not match member "${memberName}" to any ${chamber} official`);
  }
  return null;
}

async function getRefreshState(source: CommitteeSource): Promise<{
  fingerprint: string | null;
  lastCheckedAt: Date | null;
  lastChangedAt: Date | null;
  lastRefreshedAt: Date | null;
} | null> {
  const result = await db
    .select()
    .from(committeeRefreshState)
    .where(eq(committeeRefreshState.source, source))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

async function updateRefreshState(
  source: CommitteeSource,
  fingerprint: string,
  wasRefreshed: boolean
): Promise<void> {
  const now = new Date();
  const existing = await getRefreshState(source);
  
  if (existing) {
    await db
      .update(committeeRefreshState)
      .set({
        fingerprint,
        lastCheckedAt: now,
        lastChangedAt: wasRefreshed ? now : existing.lastChangedAt,
        lastRefreshedAt: wasRefreshed ? now : existing.lastRefreshedAt,
        updatedAt: now,
      })
      .where(eq(committeeRefreshState.source, source));
  } else {
    await db.insert(committeeRefreshState).values({
      source,
      fingerprint,
      lastCheckedAt: now,
      lastChangedAt: wasRefreshed ? now : null,
      lastRefreshedAt: wasRefreshed ? now : null,
    });
  }
}

async function refreshChamberCommittees(
  chamber: ChamberType,
  committeesWithMembers: CommitteeWithMembers[]
): Promise<{ committeesCount: number; membershipsCount: number }> {
  let committeesCount = 0;
  let membershipsCount = 0;
  
  const codeToId = new Map<string, string>();
  
  for (const { committee, members } of committeesWithMembers) {
    const existing = await db
      .select()
      .from(committees)
      .where(and(
        eq(committees.chamber, chamber),
        eq(committees.slug, committee.slug)
      ))
      .limit(1);
    
    let committeeId: string;
    
    if (existing.length > 0) {
      committeeId = existing[0].id;
      await db
        .update(committees)
        .set({
          name: committee.name,
          sourceUrl: committee.sourceUrl,
          sortOrder: String(committee.sortOrder),
          updatedAt: new Date(),
        })
        .where(eq(committees.id, committeeId));
    } else {
      const inserted = await db
        .insert(committees)
        .values({
          chamber,
          name: committee.name,
          slug: committee.slug,
          sourceUrl: committee.sourceUrl,
          sortOrder: String(committee.sortOrder),
        })
        .returning();
      committeeId = inserted[0].id;
    }
    
    codeToId.set(committee.code, committeeId);
    committeesCount++;
    
    // Only replace memberships when we actually got member data back.
    // An empty list most likely means the fetch failed — don't wipe existing data.
    if (members.length > 0) {
      // Snapshot existing roster before we touch anything
      const existingRows = await db
        .select({ memberName: committeeMemberships.memberName, roleTitle: committeeMemberships.roleTitle })
        .from(committeeMemberships)
        .where(eq(committeeMemberships.committeeId, committeeId));
      const existingSet = new Set(existingRows.map(r => `${r.memberName}|${r.roleTitle}`));
      const newSet = new Set(members.map(m => `${m.memberName}|${m.roleTitle}`));

      await db
        .delete(committeeMemberships)
        .where(eq(committeeMemberships.committeeId, committeeId));

      for (const member of members) {
        const officialId = await matchMemberToOfficial(member.memberName, member.legCode, chamber);

        await db.insert(committeeMemberships).values({
          committeeId,
          officialPublicId: officialId,
          memberName: member.memberName,
          roleTitle: member.roleTitle,
          sortOrder: String(member.sortOrder),
        });
        membershipsCount++;
      }

      // Alert only when the roster actually changed (not on every routine refresh)
      const added = [...newSet].filter(k => !existingSet.has(k)).length;
      const removed = [...existingSet].filter(k => !newSet.has(k)).length;
      if (added > 0 || removed > 0) {
        const parts: string[] = [];
        if (added > 0) parts.push(`${added} member${added > 1 ? "s" : ""} added`);
        if (removed > 0) parts.push(`${removed} member${removed > 1 ? "s" : ""} removed`);
        const alertTitle = `Committee Updated: ${committee.name}`;
        const alertBody = parts.join(", ");
        await db.insert(alerts).values({
          userId: "default",
          alertType: "COMMITTEE_MEMBER_CHANGE",
          entityType: "committee",
          entityId: committeeId,
          title: alertTitle,
          body: alertBody,
        } satisfies InsertAlert);
        // Fire-and-forget push notification
        sendPushToAll(alertTitle, alertBody, { alertType: "COMMITTEE_MEMBER_CHANGE", entityId: committeeId }).catch(
          (err) => console.error("[refreshCommittees] Push failed:", err),
        );
      }
    }
  }
  
  for (const { committee } of committeesWithMembers) {
    if (committee.isSubcommittee && committee.parentCode) {
      const parentId = codeToId.get(committee.parentCode);
      const childId = codeToId.get(committee.code);
      if (parentId && childId) {
        await db
          .update(committees)
          .set({ parentCommitteeId: parentId })
          .where(eq(committees.id, childId));
      }
    } else {
      const childId = codeToId.get(committee.code);
      if (childId) {
        await db
          .update(committees)
          .set({ parentCommitteeId: null })
          .where(eq(committees.id, childId));
      }
    }
  }
  
  return { committeesCount, membershipsCount };
}

export interface CommitteeRefreshResult {
  source: CommitteeSource;
  checked: boolean;
  changed: boolean;
  refreshed: boolean;
  committeesCount: number;
  membershipsCount: number;
  error?: string;
}

async function checkAndRefreshChamber(
  source: CommitteeSource,
  chamber: ChamberType,
  force: boolean
): Promise<CommitteeRefreshResult> {
  const result: CommitteeRefreshResult = {
    source,
    checked: false,
    changed: false,
    refreshed: false,
    committeesCount: 0,
    membershipsCount: 0,
  };
  
  try {
    const committeesWithMembers = await fetchAllCommitteesWithMembers(chamber);
    result.checked = true;
    
    const dataForFingerprint = JSON.stringify(committeesWithMembers);
    const newFingerprint = computeFingerprint(dataForFingerprint);
    
    const existingState = await getRefreshState(source);
    const hasChanged = !existingState?.fingerprint || existingState.fingerprint !== newFingerprint;
    
    result.changed = hasChanged;
    
    if (!hasChanged && !force) {
      console.log(`[RefreshCommittees] ${source}: No changes detected, skipping refresh`);
      await updateRefreshState(source, newFingerprint, false);
      return result;
    }
    
    console.log(`[RefreshCommittees] ${source}: ${force ? "Force refresh" : "Changes detected"}, refreshing...`);
    
    const { committeesCount, membershipsCount } = await refreshChamberCommittees(chamber, committeesWithMembers);
    
    result.refreshed = true;
    result.committeesCount = committeesCount;
    result.membershipsCount = membershipsCount;
    
    await updateRefreshState(source, newFingerprint, true);
    
    console.log(`[RefreshCommittees] ${source}: Refreshed ${committeesCount} committees, ${membershipsCount} memberships`);
    
  } catch (err) {
    result.error = String(err);
    console.error(`[RefreshCommittees] ${source} failed:`, err);
  }
  
  return result;
}

export interface FullCommitteeRefreshResult {
  results: CommitteeRefreshResult[];
  durationMs: number;
}

export async function checkAndRefreshCommitteesIfChanged(
  force: boolean = false
): Promise<FullCommitteeRefreshResult> {
  const startTime = Date.now();
  const results: CommitteeRefreshResult[] = [];

  if (isRefreshing) {
    console.log("[RefreshCommittees] Already refreshing (local flag), skipping");
    return { results, durationMs: 0 };
  }

  // Acquire a DB-level advisory lock so concurrent instances don't fight each other.
  // pg_try_advisory_lock is non-blocking: returns false immediately if another session holds it.
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    const lockResult = await lockClient.query(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [COMMITTEE_REFRESH_LOCK_ID]
    );
    lockAcquired = lockResult.rows[0].acquired as boolean;

    if (!lockAcquired) {
      console.log("[RefreshCommittees] Another instance holds the DB lock — skipping duplicate refresh");
      return { results, durationMs: 0 };
    }

    console.log("[RefreshCommittees] DB advisory lock acquired");
    isRefreshing = true;

    try {
      const houseResult = await checkAndRefreshChamber("TX_HOUSE_COMMITTEES", "TX_HOUSE", force);
      results.push(houseResult);

      const senateResult = await checkAndRefreshChamber("TX_SENATE_COMMITTEES", "TX_SENATE", force);
      results.push(senateResult);
    } finally {
      isRefreshing = false;
    }
  } finally {
    if (lockAcquired) {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [COMMITTEE_REFRESH_LOCK_ID]);
      console.log("[RefreshCommittees] DB advisory lock released");
    }
    lockClient.release();
  }

  const durationMs = Date.now() - startTime;
  console.log(`[RefreshCommittees] Complete in ${durationMs}ms`);

  return { results, durationMs };
}

/**
 * Run a committee refresh on startup if neither chamber has been checked in the
 * past week. This ensures the database is seeded even when the Monday scheduler
 * window hasn't fired yet (e.g., first deployment or after a DB reset).
 */
export async function maybeRunCommitteeRefresh(): Promise<void> {
  if (isRefreshing) return;
  const alreadyChecked = await wasCommitteesCheckedThisWeek();
  if (alreadyChecked) {
    // Even when recently checked, force re-run if committees are in the DB but
    // memberships are empty. This self-heals the case where the initial scrape
    // populated the committee list but failed to fetch individual member pages
    // (e.g. TLO was temporarily unreachable), leaving committeeRefreshState
    // updated but committeeMemberships empty.
    const [{ committeeCount }] = await db
      .select({ committeeCount: sql<number>`count(*)::int` })
      .from(committees);
    const [{ memberCount }] = await db
      .select({ memberCount: sql<number>`count(*)::int` })
      .from(committeeMemberships);
    if (committeeCount > 0 && memberCount === 0) {
      console.log(
        `[RefreshCommittees] ${committeeCount} committees exist but 0 memberships — forcing re-run`
      );
      await checkAndRefreshCommitteesIfChanged(true);
      return;
    }

    // Partial-empty: some committees have members but others have none.
    // Use a targeted backfill instead of a full re-scrape.
    const [{ emptyCount }] = await db
      .select({
        emptyCount: sql<number>`count(*)::int`,
      })
      .from(committees)
      .where(
        sql`${committees.id} NOT IN (SELECT DISTINCT committee_id FROM ${committeeMemberships})`,
      );

    if (emptyCount > 0) {
      console.log(
        `[RefreshCommittees] ${emptyCount} committees have 0 members — running targeted backfill`,
      );
      await backfillMissingCommitteeMembers();
      return;
    }

    console.log("[RefreshCommittees] Already checked this week, skipping startup seed");
    return;
  }
  console.log("[RefreshCommittees] Committees not checked this week — running startup seed");
  await checkAndRefreshCommitteesIfChanged(false);
}

export async function wasCommitteesCheckedThisWeek(): Promise<boolean> {
  // Return true (= "skip startup seed") if committees AND memberships already exist.
  // The self-healing check in maybeRunCommitteeRefresh still catches the case where
  // committees exist but memberships are empty (partial failure scenario).
  const [{ committeeCount }] = await db
    .select({ committeeCount: sql<number>`count(*)::int` })
    .from(committees);
  const [{ memberCount }] = await db
    .select({ memberCount: sql<number>`count(*)::int` })
    .from(committeeMemberships);
  return committeeCount > 0 && memberCount > 0;
}

export async function backfillMissingCommitteeMembers(): Promise<{
  filled: number;
  skipped: number;
  errors: number;
}> {
  if (isRefreshing) {
    console.log("[RefreshCommittees] backfill skipped — refresh already in progress");
    return { filled: 0, skipped: 0, errors: 0 };
  }

  // Find committees that have no memberships at all and have a URL to scrape.
  const emptyCommittees = await db
    .select()
    .from(committees)
    .where(
      and(
        isNotNull(committees.sourceUrl),
        sql`${committees.id} NOT IN (
          SELECT DISTINCT committee_id FROM ${committeeMemberships}
        )`,
      ),
    );

  if (emptyCommittees.length === 0) {
    console.log("[RefreshCommittees] backfill: no committees with 0 members found");
    return { filled: 0, skipped: 0, errors: 0 };
  }

  console.log(
    `[RefreshCommittees] backfill: ${emptyCommittees.length} committees have 0 members — fetching`,
  );

  let filled = 0;
  let skipped = 0;
  let errors = 0;
  const CONCURRENCY = 5;

  for (let i = 0; i < emptyCommittees.length; i += CONCURRENCY) {
    const batch = emptyCommittees.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (row) => {
        try {
          const members = await fetchCommitteeMembers({
            name: row.name,
            sourceUrl: row.sourceUrl!,
            slug: row.slug,
            code: "",
            isSubcommittee: row.parentCommitteeId !== null,
            parentCode: null,
            sortOrder: 0,
          });

          if (members.length === 0) {
            skipped++;
            console.log(`[RefreshCommittees] backfill: ${row.name} — 0 members returned, skipping`);
            return;
          }

          const chamber = row.chamber as ChamberType;

          for (const member of members) {
            const officialId = await matchMemberToOfficial(
              member.memberName,
              member.legCode,
              chamber,
            );
            await db.insert(committeeMemberships).values({
              committeeId: row.id,
              officialPublicId: officialId,
              memberName: member.memberName,
              roleTitle: member.roleTitle,
              sortOrder: String(member.sortOrder),
            });
          }

          filled++;
          console.log(
            `[RefreshCommittees] backfill: ${row.name} — inserted ${members.length} members`,
          );
        } catch (err) {
          errors++;
          console.error(`[RefreshCommittees] backfill error for ${row.name}:`, err);
        }
      }),
    );

    if (i + CONCURRENCY < emptyCommittees.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(
    `[RefreshCommittees] backfill complete — filled=${filled} skipped=${skipped} errors=${errors}`,
  );
  return { filled, skipped, errors };
}

export async function getAllCommitteeRefreshStates(): Promise<Array<{
  source: string;
  fingerprint: string | null;
  lastCheckedAt: Date | null;
  lastChangedAt: Date | null;
  lastRefreshedAt: Date | null;
}>> {
  const states = await db.select().from(committeeRefreshState);
  return states.map(s => ({
    source: s.source,
    fingerprint: s.fingerprint,
    lastCheckedAt: s.lastCheckedAt,
    lastChangedAt: s.lastChangedAt,
    lastRefreshedAt: s.lastRefreshedAt,
  }));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  checkAndRefreshCommitteesIfChanged(true)
    .then((result) => {
      console.log("Result:", JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
