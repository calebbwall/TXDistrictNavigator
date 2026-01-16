import * as cheerio from "cheerio";
import { db } from "../db";
import { officialPublic, refreshJobLog, type InsertOfficialPublic } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

const TLO_HOUSE_URL = "https://capitol.texas.gov/Members/Members.aspx?Chamber=H";
const TLO_SENATE_URL = "https://capitol.texas.gov/Members/Members.aspx?Chamber=S";
const TLO_BASE_URL = "https://capitol.texas.gov";
const CONGRESS_API_BASE = "https://api.congress.gov/v3";

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE";

interface ParsedOfficial {
  sourceMemberId: string;
  fullName: string;
  district: string;
  party?: string;
  photoUrl?: string;
  capitolAddress?: string;
  capitolPhone?: string;
  districtAddresses?: string[];
  districtPhones?: string[];
  website?: string;
  email?: string;
}

interface RefreshResult {
  source: SourceType;
  parsedCount: number;
  upsertedCount: number;
  skippedCount: number;
  deactivatedCount: number;
  errors: string[];
}

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (Official Data Sync)",
          ...options.headers,
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
  throw new Error("Max retries exceeded");
}

function validateTLORecord(record: ParsedOfficial, chamber: "house" | "senate"): string | null {
  if (!record.fullName || record.fullName.trim().length === 0) {
    return "Empty name";
  }
  
  const distNum = parseInt(record.district, 10);
  if (isNaN(distNum)) {
    return `Invalid district number: ${record.district}`;
  }
  
  const maxDistrict = chamber === "house" ? 150 : 31;
  if (distNum < 1 || distNum > maxDistrict) {
    return `District ${distNum} out of range (1-${maxDistrict})`;
  }
  
  const hasContact = record.capitolAddress || record.capitolPhone || 
                     (record.districtAddresses?.length ?? 0) > 0 ||
                     (record.districtPhones?.length ?? 0) > 0;
  if (!hasContact) {
    return "No contact information";
  }
  
  return null;
}

async function extractMemberDetailsFromTLO(memberUrl: string): Promise<Partial<ParsedOfficial>> {
  try {
    const response = await fetchWithRetry(memberUrl);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const details: Partial<ParsedOfficial> = {};
    
    const extractByLabel = (label: string): string | undefined => {
      const labelEl = $(`td:contains("${label}")`).first();
      if (labelEl.length) {
        const nextTd = labelEl.next("td");
        if (nextTd.length) {
          return nextTd.text().trim();
        }
      }
      
      const labelSpan = $(`span:contains("${label}")`).first();
      if (labelSpan.length) {
        const parent = labelSpan.parent();
        const text = parent.text().replace(label, "").trim();
        if (text) return text;
      }
      
      return undefined;
    };
    
    details.capitolAddress = extractByLabel("Capitol Address") || 
                             extractByLabel("Capitol Office") ||
                             $('td:contains("Room")').first().text().trim() ||
                             undefined;
    
    details.capitolPhone = extractByLabel("Capitol Phone") ||
                           $('td:contains("(512)")').first().text().trim() ||
                           undefined;
    
    const districtAddresses: string[] = [];
    const districtPhones: string[] = [];
    
    $('td:contains("District")').each((_, el) => {
      const text = $(el).text();
      if (text.includes("Address") || text.includes("Office")) {
        const addr = $(el).next("td").text().trim();
        if (addr && addr.length > 5) districtAddresses.push(addr);
      }
      if (text.includes("Phone")) {
        const phone = $(el).next("td").text().trim();
        if (phone && phone.match(/\(\d{3}\)/)) districtPhones.push(phone);
      }
    });
    
    if (districtAddresses.length > 0) details.districtAddresses = districtAddresses;
    if (districtPhones.length > 0) details.districtPhones = districtPhones;
    
    const emailLink = $('a[href^="mailto:"]').first();
    if (emailLink.length) {
      details.email = emailLink.attr("href")?.replace("mailto:", "");
    }
    
    const websiteLink = $('a[href*="house.texas.gov"], a[href*="senate.texas.gov"]').first();
    if (websiteLink.length) {
      details.website = websiteLink.attr("href");
    }
    
    const photoImg = $('img[src*="photo"], img[src*="member"], img[alt*="Photo"]').first();
    if (photoImg.length) {
      const src = photoImg.attr("src");
      if (src) {
        details.photoUrl = src.startsWith("http") ? src : `${TLO_BASE_URL}${src}`;
      }
    }
    
    return details;
  } catch (err) {
    console.error(`Failed to fetch member details from ${memberUrl}:`, err);
    return {};
  }
}

async function refreshTLO(chamber: "house" | "senate"): Promise<RefreshResult> {
  const source: SourceType = chamber === "house" ? "TX_HOUSE" : "TX_SENATE";
  const url = chamber === "house" ? TLO_HOUSE_URL : TLO_SENATE_URL;
  const result: RefreshResult = {
    source,
    parsedCount: 0,
    upsertedCount: 0,
    skippedCount: 0,
    deactivatedCount: 0,
    errors: [],
  };
  
  console.log(`[RefreshOfficials] Starting ${source} refresh from ${url}`);
  
  try {
    const response = await fetchWithRetry(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const records: ParsedOfficial[] = [];
    
    $('table tr, .member-row, [class*="member"]').each((_, row) => {
      const $row = $(row);
      
      const nameLink = $row.find('a[href*="MemberInfo"]').first();
      if (!nameLink.length) return;
      
      const fullName = nameLink.text().trim().replace(/\s+/g, " ");
      if (!fullName) return;
      
      const href = nameLink.attr("href") || "";
      const memberIdMatch = href.match(/Member=(\d+)/i) || href.match(/MemberInfo\.aspx\?(\d+)/i);
      const sourceMemberId = memberIdMatch ? memberIdMatch[1] : `${chamber}-${fullName.replace(/\s/g, "_")}`;
      
      let district = "";
      $row.find("td").each((_, td) => {
        const text = $(td).text().trim();
        const distMatch = text.match(/^\s*(\d{1,3})\s*$/);
        if (distMatch && parseInt(distMatch[1]) <= (chamber === "house" ? 150 : 31)) {
          district = distMatch[1];
        }
      });
      
      if (!district) {
        const rowText = $row.text();
        const distMatch = rowText.match(/District\s*(\d{1,3})/i);
        if (distMatch) district = distMatch[1];
      }
      
      let party: string | undefined;
      const rowText = $row.text();
      if (rowText.includes("(R)") || rowText.match(/\bRepublican\b/i)) {
        party = "R";
      } else if (rowText.includes("(D)") || rowText.match(/\bDemocrat\b/i)) {
        party = "D";
      }
      
      if (district) {
        records.push({
          sourceMemberId,
          fullName,
          district,
          party,
        });
      }
    });
    
    result.parsedCount = records.length;
    console.log(`[RefreshOfficials] Parsed ${records.length} ${source} members`);
    
    const processedMemberIds: string[] = [];
    
    for (const record of records) {
      const validationError = validateTLORecord(record, chamber);
      if (validationError) {
        result.errors.push(`${record.fullName}: ${validationError}`);
        result.skippedCount++;
        continue;
      }
      
      try {
        const existing = await db.select()
          .from(officialPublic)
          .where(and(
            eq(officialPublic.source, source),
            eq(officialPublic.sourceMemberId, record.sourceMemberId)
          ))
          .limit(1);
        
        const insertData: InsertOfficialPublic = {
          source,
          sourceMemberId: record.sourceMemberId,
          chamber: chamber === "house" ? "TX House" : "TX Senate",
          district: record.district,
          fullName: record.fullName,
          party: record.party,
          photoUrl: record.photoUrl,
          capitolAddress: record.capitolAddress,
          capitolPhone: record.capitolPhone,
          districtAddresses: record.districtAddresses,
          districtPhones: record.districtPhones,
          website: record.website,
          email: record.email,
          active: true,
          lastRefreshedAt: new Date(),
        };
        
        if (existing.length > 0) {
          await db.update(officialPublic)
            .set({
              ...insertData,
              id: undefined,
            })
            .where(eq(officialPublic.id, existing[0].id));
        } else {
          await db.insert(officialPublic).values(insertData);
        }
        
        processedMemberIds.push(record.sourceMemberId);
        result.upsertedCount++;
      } catch (err) {
        result.errors.push(`Failed to upsert ${record.fullName}: ${err}`);
        result.skippedCount++;
      }
    }
    
    if (processedMemberIds.length > 0) {
      const deactivated = await db.update(officialPublic)
        .set({ active: false })
        .where(and(
          eq(officialPublic.source, source),
          eq(officialPublic.active, true),
          sql`${officialPublic.sourceMemberId} NOT IN (${sql.join(processedMemberIds.map(id => sql`${id}`), sql`, `)})`
        ))
        .returning();
      result.deactivatedCount = deactivated.length;
    }
    
  } catch (err) {
    result.errors.push(`Fatal error: ${err}`);
    console.error(`[RefreshOfficials] ${source} refresh failed:`, err);
  }
  
  return result;
}

async function refreshUSHouse(): Promise<RefreshResult> {
  const source: SourceType = "US_HOUSE";
  const result: RefreshResult = {
    source,
    parsedCount: 0,
    upsertedCount: 0,
    skippedCount: 0,
    deactivatedCount: 0,
    errors: [],
  };
  
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    result.errors.push("CONGRESS_API_KEY not configured");
    console.warn("[RefreshOfficials] CONGRESS_API_KEY not set, skipping US House refresh");
    return result;
  }
  
  console.log("[RefreshOfficials] Starting US_HOUSE refresh from Congress.gov API");
  
  try {
    const url = `${CONGRESS_API_BASE}/member?currentMember=true&limit=500&api_key=${apiKey}`;
    const response = await fetchWithRetry(url);
    const data = await response.json() as { members?: Array<{
      bioguideId: string;
      name: string;
      state: string;
      district?: number;
      party?: string;
      depiction?: { imageUrl?: string };
      terms?: Array<{ chamber?: string }>;
      partyName?: string;
    }> };
    
    if (!data.members) {
      throw new Error("No members in API response");
    }
    
    const texasMembers = data.members.filter(m => 
      m.state === "Texas" || m.state === "TX"
    ).filter(m => {
      const lastTerm = m.terms?.[m.terms.length - 1];
      return lastTerm?.chamber === "House of Representatives";
    });
    
    result.parsedCount = texasMembers.length;
    console.log(`[RefreshOfficials] Found ${texasMembers.length} Texas US House members`);
    
    const processedMemberIds: string[] = [];
    
    for (const member of texasMembers) {
      const record: ParsedOfficial = {
        sourceMemberId: member.bioguideId,
        fullName: member.name,
        district: String(member.district || 0),
        party: member.party?.charAt(0) || member.partyName?.charAt(0),
        photoUrl: member.depiction?.imageUrl,
      };
      
      if (!record.district || record.district === "0") {
        result.errors.push(`${record.fullName}: Missing district`);
        result.skippedCount++;
        continue;
      }
      
      try {
        const existing = await db.select()
          .from(officialPublic)
          .where(and(
            eq(officialPublic.source, source),
            eq(officialPublic.sourceMemberId, record.sourceMemberId)
          ))
          .limit(1);
        
        const insertData: InsertOfficialPublic = {
          source,
          sourceMemberId: record.sourceMemberId,
          chamber: "US House",
          district: record.district,
          fullName: record.fullName,
          party: record.party,
          photoUrl: record.photoUrl,
          capitolAddress: "Washington, DC 20515",
          active: true,
          lastRefreshedAt: new Date(),
        };
        
        if (existing.length > 0) {
          await db.update(officialPublic)
            .set({
              ...insertData,
              id: undefined,
            })
            .where(eq(officialPublic.id, existing[0].id));
        } else {
          await db.insert(officialPublic).values(insertData);
        }
        
        processedMemberIds.push(record.sourceMemberId);
        result.upsertedCount++;
      } catch (err) {
        result.errors.push(`Failed to upsert ${record.fullName}: ${err}`);
        result.skippedCount++;
      }
    }
    
    if (processedMemberIds.length > 0) {
      const deactivated = await db.update(officialPublic)
        .set({ active: false })
        .where(and(
          eq(officialPublic.source, source),
          eq(officialPublic.active, true),
          sql`${officialPublic.sourceMemberId} NOT IN (${sql.join(processedMemberIds.map(id => sql`${id}`), sql`, `)})`
        ))
        .returning();
      result.deactivatedCount = deactivated.length;
    }
    
  } catch (err) {
    result.errors.push(`Fatal error: ${err}`);
    console.error("[RefreshOfficials] US_HOUSE refresh failed:", err);
  }
  
  return result;
}

async function getLastSuccessfulRefreshCounts(): Promise<Map<SourceType, number>> {
  const counts = new Map<SourceType, number>();
  
  for (const source of ["TX_HOUSE", "TX_SENATE", "US_HOUSE"] as SourceType[]) {
    const lastSuccess = await db.select()
      .from(refreshJobLog)
      .where(and(
        eq(refreshJobLog.source, source),
        eq(refreshJobLog.status, "success")
      ))
      .orderBy(sql`${refreshJobLog.completedAt} DESC`)
      .limit(1);
    
    if (lastSuccess.length > 0 && lastSuccess[0].upsertedCount) {
      counts.set(source, parseInt(lastSuccess[0].upsertedCount, 10));
    }
  }
  
  return counts;
}

function validateRefreshSanity(
  result: RefreshResult,
  lastCounts: Map<SourceType, number>
): { valid: boolean; reason?: string } {
  if (result.parsedCount === 0) {
    return { valid: false, reason: "Zero records parsed - possible source outage" };
  }
  
  const lastCount = lastCounts.get(result.source);
  if (lastCount && lastCount > 0) {
    const deviation = Math.abs(result.upsertedCount - lastCount) / lastCount;
    if (deviation > 0.25) {
      return { 
        valid: false, 
        reason: `Count deviation ${(deviation * 100).toFixed(1)}% exceeds 25% threshold (was ${lastCount}, now ${result.upsertedCount})` 
      };
    }
  }
  
  return { valid: true };
}

async function logRefreshJob(result: RefreshResult, status: string, durationMs: number, errorMessage?: string) {
  await db.insert(refreshJobLog).values({
    source: result.source,
    status,
    parsedCount: String(result.parsedCount),
    upsertedCount: String(result.upsertedCount),
    skippedCount: String(result.skippedCount),
    deactivatedCount: String(result.deactivatedCount),
    durationMs: String(durationMs),
    errorMessage: errorMessage || (result.errors.length > 0 ? result.errors.join("; ") : undefined),
    completedAt: new Date(),
  });
}

export async function refreshAllOfficials(): Promise<void> {
  console.log("[RefreshOfficials] Starting full refresh of all officials data");
  const overallStart = Date.now();
  
  const lastCounts = await getLastSuccessfulRefreshCounts();
  
  const sources: Array<{ name: SourceType; fn: () => Promise<RefreshResult> }> = [
    { name: "TX_HOUSE", fn: () => refreshTLO("house") },
    { name: "TX_SENATE", fn: () => refreshTLO("senate") },
    { name: "US_HOUSE", fn: refreshUSHouse },
  ];
  
  for (const { name, fn } of sources) {
    const start = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      const sanityCheck = validateRefreshSanity(result, lastCounts);
      
      if (!sanityCheck.valid) {
        console.error(`[RefreshOfficials] ${name} ABORTED: ${sanityCheck.reason}`);
        await logRefreshJob(result, "aborted", duration, sanityCheck.reason);
        continue;
      }
      
      console.log(`[RefreshOfficials] ${name} completed: ${result.upsertedCount} upserted, ${result.skippedCount} skipped, ${result.deactivatedCount} deactivated in ${duration}ms`);
      await logRefreshJob(result, "success", duration);
      
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[RefreshOfficials] ${name} FAILED:`, err);
      await logRefreshJob(
        { source: name, parsedCount: 0, upsertedCount: 0, skippedCount: 0, deactivatedCount: 0, errors: [] },
        "failed",
        duration,
        String(err)
      );
    }
  }
  
  const totalDuration = Date.now() - overallStart;
  console.log(`[RefreshOfficials] Full refresh completed in ${totalDuration}ms`);
}

export async function getLastRefreshTime(): Promise<Date | null> {
  const latest = await db.select()
    .from(refreshJobLog)
    .where(eq(refreshJobLog.status, "success"))
    .orderBy(sql`${refreshJobLog.completedAt} DESC`)
    .limit(1);
  
  return latest.length > 0 ? latest[0].completedAt : null;
}

export async function shouldRunRefresh(): Promise<boolean> {
  const lastRefresh = await getLastRefreshTime();
  if (!lastRefresh) return true;
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return lastRefresh < sevenDaysAgo;
}

let isRefreshing = false;

export async function maybeRunScheduledRefresh(): Promise<void> {
  if (isRefreshing) {
    console.log("[RefreshOfficials] Refresh already in progress, skipping");
    return;
  }
  
  const shouldRun = await shouldRunRefresh();
  if (!shouldRun) {
    console.log("[RefreshOfficials] Last refresh was less than 7 days ago, skipping");
    return;
  }
  
  isRefreshing = true;
  try {
    await refreshAllOfficials();
  } finally {
    isRefreshing = false;
  }
}

if (require.main === module) {
  refreshAllOfficials()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
