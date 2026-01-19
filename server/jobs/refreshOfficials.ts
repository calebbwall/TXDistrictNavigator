import * as cheerio from "cheerio";
import { db } from "../db";
import { officialPublic, refreshJobLog, type InsertOfficialPublic } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const TLO_BASE_URL = "https://capitol.texas.gov";
const CONGRESS_API_BASE = "https://api.congress.gov/v3";

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE";

const CITY_STATE_ZIP_REGEX = /,\s*TX\s+(\d{5})(?:-\d{4})?\b/gi;
const CITY_REGEX = /([A-Z][a-zA-Z\s]+),\s*TX\b/gi;

function extractSearchZips(addresses: string[]): string | null {
  const zips = new Set<string>();
  for (const addr of addresses) {
    const matches = addr.matchAll(CITY_STATE_ZIP_REGEX);
    for (const match of matches) {
      zips.add(match[1]);
    }
  }
  return zips.size > 0 ? Array.from(zips).join(",") : null;
}

function extractSearchCities(addresses: string[]): string | null {
  const cities = new Set<string>();
  for (const addr of addresses) {
    const matches = addr.matchAll(CITY_REGEX);
    for (const match of matches) {
      const city = match[1].trim();
      if (city.length > 1 && city.length < 50) {
        cities.add(city);
      }
    }
  }
  return cities.size > 0 ? Array.from(cities).join(",") : null;
}

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
  
  return null;
}

async function fetchMemberDetails(memberUrl: string, chamber: "house" | "senate"): Promise<ParsedOfficial | null> {
  try {
    const response = await fetchWithRetry(memberUrl);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const urlMatch = memberUrl.match(/Code=([A-Z0-9]+)/i);
    const sourceMemberId = urlMatch ? urlMatch[1] : "";
    
    if (!sourceMemberId) return null;
    
    const titleText = $("title").text();
    
    if (titleText.includes("Lt. Gov.") || titleText.includes("Lieutenant Governor")) {
      return null;
    }
    
    const nameMatch = titleText.match(/Information for (Rep\.|Sen\.)\s*(.+)$/);
    let fullName = nameMatch ? nameMatch[2].trim() : "";
    
    if (!fullName) {
      const pageTitle = $("#usrHeader_lblPageTitle").text();
      const altMatch = pageTitle.match(/Information for (Rep\.|Sen\.)\s*(.+)$/);
      fullName = altMatch ? altMatch[2].trim() : "";
    }
    
    if (!fullName) return null;
    
    let district = $("#lblDistrict").text().trim();
    
    if (!district) {
      const pageText = $("body").text();
      const distMatch = pageText.match(/District\s*:?\s*(\d+)/i);
      if (distMatch) {
        district = distMatch[1];
      }
    }
    
    if (!district) {
      $("*").each((_, el) => {
        const text = $(el).text();
        const match = text.match(/^(\d{1,3})$/);
        if (match && !district) {
          const num = parseInt(match[1], 10);
          const max = chamber === "house" ? 150 : 31;
          if (num >= 1 && num <= max) {
            const parentText = $(el).parent().text();
            if (parentText.toLowerCase().includes("district")) {
              district = match[1];
            }
          }
        }
      });
    }
    
    if (!district) {
      console.warn(`[RefreshOfficials] No district found for ${fullName} at ${memberUrl}`);
      return null;
    }
    
    let party: string | undefined;
    const partyText = $("body").text();
    if (partyText.includes("(R)") || partyText.match(/\bRepublican\b/i)) {
      party = "R";
    } else if (partyText.includes("(D)") || partyText.match(/\bDemocrat\b/i)) {
      party = "D";
    }
    
    const capitolAddr1 = $("#lblCapitolAddress1").text().trim();
    const capitolAddr2 = $("#lblCapitolAddress2").text().trim();
    const capitolAddress = [capitolAddr1, capitolAddr2].filter(Boolean).join(", ");
    
    const capitolPhone = $("#lblCapitolPhone").text().trim() || undefined;
    
    const districtAddr1 = $("#lblDistrictAddress1").text().trim();
    const districtAddr2 = $("#lblDistrictAddress2").text().trim();
    const districtAddress = [districtAddr1, districtAddr2].filter(Boolean).join(", ");
    const districtAddresses = districtAddress ? [districtAddress] : undefined;
    
    const districtPhone = $("#lblDistrictPhone").text().trim();
    const districtPhones = districtPhone ? [districtPhone] : undefined;
    
    const homePageLink = $("#lnkHomePage").attr("href");
    const website = homePageLink || undefined;
    
    const photoImg = $('img[src*="photo"], img[alt*="Member"]').first();
    let photoUrl: string | undefined;
    if (photoImg.length) {
      const src = photoImg.attr("src");
      if (src) {
        photoUrl = src.startsWith("http") ? src : `${TLO_BASE_URL}${src}`;
      }
    }
    
    return {
      sourceMemberId,
      fullName,
      district,
      party,
      capitolAddress: capitolAddress || undefined,
      capitolPhone,
      districtAddresses,
      districtPhones,
      website,
      photoUrl,
    };
  } catch (err) {
    console.error(`Failed to fetch member details from ${memberUrl}:`, err);
    return null;
  }
}

async function refreshTLO(chamber: "house" | "senate"): Promise<RefreshResult> {
  const source: SourceType = chamber === "house" ? "TX_HOUSE" : "TX_SENATE";
  const chamberParam = chamber === "house" ? "H" : "S";
  const listUrl = `${TLO_BASE_URL}/Members/Members.aspx?Chamber=${chamberParam}`;
  
  const result: RefreshResult = {
    source,
    parsedCount: 0,
    upsertedCount: 0,
    skippedCount: 0,
    deactivatedCount: 0,
    errors: [],
  };
  
  console.log(`[RefreshOfficials] Starting ${source} refresh from ${listUrl}`);
  
  try {
    const response = await fetchWithRetry(listUrl);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const memberLinks: string[] = [];
    $('a[href*="MemberInfo.aspx"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const fullUrl = href.startsWith("http") ? href : `${TLO_BASE_URL}/Members/${href}`;
        if (!memberLinks.includes(fullUrl)) {
          memberLinks.push(fullUrl);
        }
      }
    });
    
    const filteredLinks = memberLinks.filter(url => 
      url.includes(`Chamber=${chamberParam}`) || 
      (chamber === "senate" && url.includes("Chamber=S")) ||
      (chamber === "house" && url.includes("Chamber=H"))
    );
    
    console.log(`[RefreshOfficials] Found ${filteredLinks.length} member links for ${source} (total links: ${memberLinks.length})`);
    
    const expectedMin = chamber === "house" ? 140 : 25;
    if (filteredLinks.length < expectedMin) {
      console.warn(`[RefreshOfficials] WARNING: Only found ${filteredLinks.length} links, expected at least ${expectedMin}`);
      $('a').each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href.toLowerCase().includes("member")) {
          console.log(`[RefreshOfficials] Debug link: ${href}`);
        }
      });
    }
    
    memberLinks.length = 0;
    memberLinks.push(...filteredLinks);
    
    console.log(`[RefreshOfficials] Processing ${memberLinks.length} member links for ${source}`);
    
    if (memberLinks.length === 0) {
      result.errors.push("No member links found on list page");
      return result;
    }
    
    const records: ParsedOfficial[] = [];
    const batchSize = 10;
    
    for (let i = 0; i < memberLinks.length; i += batchSize) {
      const batch = memberLinks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (url, idx) => {
          const record = await fetchMemberDetails(url, chamber);
          if (!record) {
            console.warn(`[RefreshOfficials] Failed to parse member from: ${url}`);
          }
          return record;
        })
      );
      
      for (const record of batchResults) {
        if (record) {
          records.push(record);
        }
      }
      
      if (i + batchSize < memberLinks.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
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
        
        const allAddresses: string[] = [];
        if (record.capitolAddress) allAddresses.push(record.capitolAddress);
        if (record.districtAddresses) allAddresses.push(...record.districtAddresses);
        
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
          searchZips: extractSearchZips(allAddresses),
          searchCities: extractSearchCities(allAddresses),
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
    const allMembers: Array<{
      bioguideId: string;
      name: string;
      firstName?: string;
      lastName?: string;
      state: string;
      district?: number;
      party?: string;
      partyName?: string;
      depiction?: { imageUrl?: string };
      terms?: { item?: Array<{ chamber?: string }> };
    }> = [];
    
    let offset = 0;
    const limit = 250;
    let hasMore = true;
    
    while (hasMore) {
      const url = `${CONGRESS_API_BASE}/member?currentMember=true&limit=${limit}&offset=${offset}&api_key=${apiKey}`;
      console.log(`[RefreshOfficials] Fetching Congress.gov page offset=${offset}`);
      const response = await fetchWithRetry(url);
      const data = await response.json() as { 
        members?: Array<any>;
        pagination?: { count?: number; next?: string };
      };
      
      if (!data.members || data.members.length === 0) {
        hasMore = false;
        break;
      }
      
      allMembers.push(...data.members);
      
      if (data.members.length < limit || !data.pagination?.next) {
        hasMore = false;
      } else {
        offset += limit;
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    console.log(`[RefreshOfficials] Fetched ${allMembers.length} total members from Congress.gov`);
    
    const texasMembers = allMembers.filter(m => {
      const isTexas = m.state === "Texas" || m.state === "TX";
      if (!isTexas) return false;
      
      const terms = m.terms?.item || [];
      if (terms.length === 0) {
        return m.district !== undefined && m.district !== null;
      }
      const lastTerm = terms[terms.length - 1];
      const isHouse = lastTerm?.chamber === "House of Representatives" || 
                      lastTerm?.chamber?.includes("House") ||
                      m.district !== undefined;
      return isHouse;
    });
    
    console.log(`[RefreshOfficials] Filtered to ${texasMembers.length} Texas US House members`);
    
    if (texasMembers.length < 30) {
      result.errors.push(`Only found ${texasMembers.length} TX members, expected ~38. Check API filtering.`);
      console.warn(`[RefreshOfficials] WARNING: Only ${texasMembers.length} TX House members found`);
    }
    
    result.parsedCount = texasMembers.length;
    console.log(`[RefreshOfficials] Found ${texasMembers.length} Texas US House members`);
    
    const processedMemberIds: string[] = [];
    
    for (const member of texasMembers) {
      const fullName = member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim();
      const record: ParsedOfficial = {
        sourceMemberId: member.bioguideId,
        fullName,
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
        
        const congressAddresses: string[] = ["Washington, DC 20515"];
        
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
          searchZips: extractSearchZips(congressAddresses),
          searchCities: extractSearchCities(congressAddresses),
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
  
  if (lastCount && lastCount >= 20) {
    const deviation = Math.abs(result.upsertedCount - lastCount) / lastCount;
    if (deviation > 0.25) {
      return { 
        valid: false, 
        reason: `Count deviation ${(deviation * 100).toFixed(1)}% exceeds 25% threshold (was ${lastCount}, now ${result.upsertedCount})` 
      };
    }
  } else if (lastCount && lastCount < 20 && result.upsertedCount > lastCount) {
    console.log(`[RefreshOfficials] ${result.source}: Allowing population growth from ${lastCount} to ${result.upsertedCount} (initial population)`);
  }
  
  const expectedMins: Record<SourceType, number> = {
    TX_HOUSE: 140,
    TX_SENATE: 25,
    US_HOUSE: 30,
  };
  
  const expectedMin = expectedMins[result.source];
  if (result.upsertedCount < expectedMin) {
    console.warn(`[RefreshOfficials] WARNING: ${result.source} has only ${result.upsertedCount} members, expected at least ${expectedMin}`);
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
