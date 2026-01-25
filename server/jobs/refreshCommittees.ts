import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { db } from "../db";
import { committees, committeeMemberships, committeeRefreshState, officialPublic, type InsertCommittee, type InsertCommitteeMembership } from "@shared/schema";
import { eq, and, sql, ilike } from "drizzle-orm";

const TLO_BASE_URL = "https://capitol.texas.gov";
const CURRENT_LEG_SESSION = "89R";

type CommitteeSource = "TX_HOUSE_COMMITTEES" | "TX_SENATE_COMMITTEES";
type ChamberType = "TX_HOUSE" | "TX_SENATE";

interface ParsedCommittee {
  name: string;
  slug: string;
  code: string;
  sourceUrl: string;
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

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (Committee Data Sync)",
        },
      });
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
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

function normalizeName(name: string): string {
  return name
    .replace(/^(Rep\.|Sen\.|Representative|Senator)\s*/i, "")
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
  
  const committees: ParsedCommittee[] = [];
  
  $('a[href*="MeetingsByCmte.aspx"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const name = $(el).text().trim();
    
    if (!name || !href) return;
    
    const codeMatch = href.match(/CmteCode=([A-Z0-9]+)/i);
    const code = codeMatch ? codeMatch[1] : "";
    
    if (!code) return;
    
    committees.push({
      name,
      slug: createSlug(name),
      code,
      sourceUrl: `${TLO_BASE_URL}/Committees/MembershipCmte.aspx?LegSess=${CURRENT_LEG_SESSION}&CmteCode=${code}`,
    });
  });
  
  console.log(`[RefreshCommittees] Found ${committees.length} committees for chamber ${chamber}`);
  return committees;
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
    
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;
      
      const positionCell = $(cells[0]).text().trim();
      const memberCell = $(cells[1]);
      const memberLink = memberCell.find('a');
      const memberName = memberLink.text().trim() || memberCell.text().trim();
      const memberHref = memberLink.attr("href") || "";
      
      if (!memberName || memberName === "Member") return;
      if (positionCell === "Position") return;
      
      if (!isValidPersonName(memberName)) {
        return;
      }
      
      const legCodeMatch = memberHref.match(/LegCode=([A-Z0-9]+)/i);
      const legCode = legCodeMatch ? legCodeMatch[1] : "";
      
      let roleTitle = "Member";
      if (positionCell.includes("Chair:") && !positionCell.includes("Vice")) {
        roleTitle = "Chair";
      } else if (positionCell.includes("Vice Chair:")) {
        roleTitle = "Vice Chair";
      } else if (positionCell.includes("Members:") || positionCell === "") {
        roleTitle = "Member";
      }
      
      members.push({
        memberName: memberName.replace(/^(Rep\.|Sen\.)\s*/, "").trim(),
        roleTitle,
        legCode,
        sortOrder: sortOrder++,
      });
    });
    
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
  
  for (const committee of committeeList) {
    await new Promise(r => setTimeout(r, 200));
    const members = await fetchCommitteeMembers(committee);
    result.push({ committee, members });
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
  
  console.log(`[RefreshCommittees] Could not match member "${memberName}" to any ${chamber} official`);
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
        })
        .returning();
      committeeId = inserted[0].id;
    }
    committeesCount++;
    
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
    console.log("[RefreshCommittees] Already refreshing, skipping");
    return { results, durationMs: 0 };
  }
  
  isRefreshing = true;
  
  try {
    const houseResult = await checkAndRefreshChamber("TX_HOUSE_COMMITTEES", "TX_HOUSE", force);
    results.push(houseResult);
    
    const senateResult = await checkAndRefreshChamber("TX_SENATE_COMMITTEES", "TX_SENATE", force);
    results.push(senateResult);
    
  } finally {
    isRefreshing = false;
  }
  
  const durationMs = Date.now() - startTime;
  console.log(`[RefreshCommittees] Complete in ${durationMs}ms`);
  
  return { results, durationMs };
}

export async function wasCommitteesCheckedThisWeek(): Promise<boolean> {
  const sources: CommitteeSource[] = ["TX_HOUSE_COMMITTEES", "TX_SENATE_COMMITTEES"];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  for (const source of sources) {
    const state = await getRefreshState(source);
    if (!state?.lastCheckedAt || state.lastCheckedAt < oneWeekAgo) {
      return false;
    }
  }
  
  return true;
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

if (require.main === module) {
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
