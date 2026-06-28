import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { db } from "../db";
import {
  officialPublic,
  refreshJobLog,
  refreshState,
  type InsertOfficialPublic,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

import {
  fetchTexasHouseParties,
  fetchTexasSenateParties,
} from "../lib/partyLookup";
import { SCRAPER_FETCH_TIMEOUT_MS } from "../lib/timeouts";

const TLO_BASE_URL = "https://capitol.texas.gov";
const CONGRESS_API_BASE = "https://api.congress.gov/v3";

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX";

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
  capitolRoom?: string;
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

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        // Fresh signal per attempt so a hung upstream can't stall a refresh.
        // Callers may still pass their own signal to override the default.
        signal: options.signal ?? AbortSignal.timeout(SCRAPER_FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (Official Data Sync)",
          ...options.headers,
        },
      });
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

function computeFingerprint(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function getRefreshState(source: SourceType): Promise<{
  fingerprint: string | null;
  lastCheckedAt: Date | null;
  lastChangedAt: Date | null;
} | null> {
  const [state] = await db
    .select()
    .from(refreshState)
    .where(eq(refreshState.source, source))
    .limit(1);

  if (!state) return null;

  return {
    fingerprint: state.fingerprint,
    lastCheckedAt: state.lastCheckedAt,
    lastChangedAt: state.lastChangedAt,
  };
}

async function updateRefreshState(
  source: SourceType,
  fingerprint: string,
  changed: boolean,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(refreshState)
    .where(eq(refreshState.source, source))
    .limit(1);

  const now = new Date();

  if (existing) {
    await db
      .update(refreshState)
      .set({
        fingerprint,
        lastCheckedAt: now,
        lastChangedAt: changed ? now : existing.lastChangedAt,
        lastRefreshedAt: changed ? now : existing.lastRefreshedAt,
        updatedAt: now,
      })
      .where(eq(refreshState.id, existing.id));
  } else {
    await db.insert(refreshState).values({
      source,
      fingerprint,
      lastCheckedAt: now,
      lastChangedAt: changed ? now : null,
      lastRefreshedAt: changed ? now : null,
    });
  }
}

async function markCheckedOnly(source: SourceType): Promise<void> {
  const [existing] = await db
    .select()
    .from(refreshState)
    .where(eq(refreshState.source, source))
    .limit(1);

  const now = new Date();

  if (existing) {
    await db
      .update(refreshState)
      .set({ lastCheckedAt: now, updatedAt: now })
      .where(eq(refreshState.id, existing.id));
  } else {
    await db.insert(refreshState).values({
      source,
      lastCheckedAt: now,
    });
  }
}

type ContactFallbackTarget = {
  capitolAddress?: string | null;
  capitolPhone?: string | null;
  capitolRoom?: string | null;
  districtAddresses?: string[] | null;
  districtPhones?: string[] | null;
  email?: string | null;
  searchZips?: string | null;
  searchCities?: string | null;
};

async function applyTribuneContactFallback(
  fullName: string,
  target: ContactFallbackTarget,
): Promise<boolean> {
  const needsAny =
    !target.capitolAddress ||
    !target.capitolPhone ||
    !target.capitolRoom ||
    !target.districtAddresses ||
    target.districtAddresses.length === 0 ||
    !target.districtPhones ||
    target.districtPhones.length === 0 ||
    !target.email;

  if (!needsAny) return false;

  try {
    const { lookupContactInfoFromTexasTribune } = await import(
      "../lib/texasTribuneLookup"
    );
    const info = await lookupContactInfoFromTexasTribune(fullName);
    if (!info.success) return false;

    let mutated = false;
    if (!target.capitolAddress && info.capitolAddress) {
      target.capitolAddress = info.capitolAddress;
      mutated = true;
    }
    if (!target.capitolPhone && info.capitolPhone) {
      target.capitolPhone = info.capitolPhone;
      mutated = true;
    }
    if (!target.capitolRoom && info.capitolRoom) {
      target.capitolRoom = info.capitolRoom;
      mutated = true;
    }
    if (
      (!target.districtAddresses || target.districtAddresses.length === 0) &&
      info.districtAddress
    ) {
      target.districtAddresses = [info.districtAddress];
      mutated = true;
    }
    if (
      (!target.districtPhones || target.districtPhones.length === 0) &&
      info.districtPhone
    ) {
      target.districtPhones = [info.districtPhone];
      mutated = true;
    }
    if (!target.email && info.capitolEmail) {
      target.email = info.capitolEmail;
      mutated = true;
    }

    if (mutated) {
      const merged: string[] = [];
      if (target.capitolAddress) merged.push(target.capitolAddress);
      if (target.districtAddresses) merged.push(...target.districtAddresses);
      if (merged.length > 0) {
        target.searchZips = extractSearchZips(merged);
        target.searchCities = extractSearchCities(merged);
      }
      console.log(
        `[RefreshOfficials] Tribune contact fallback applied for ${fullName}`,
      );
    }
    return mutated;
  } catch (err) {
    console.log(
      `[RefreshOfficials] Tribune contact fallback failed for ${fullName}: ${err}`,
    );
    return false;
  }
}

export interface CapitolBackfillResult {
  total: number;
  updated: number;
  notFound: number;
  errors: number;
}

export async function backfillCapitolContactInfo(): Promise<CapitolBackfillResult> {
  const result: CapitolBackfillResult = {
    total: 0,
    updated: 0,
    notFound: 0,
    errors: 0,
  };

  const officials = await db
    .select()
    .from(officialPublic)
    .where(
      and(
        eq(officialPublic.active, true),
        sql`${officialPublic.source} IN ('TX_HOUSE','TX_SENATE')`,
        sql`(
          ${officialPublic.capitolAddress} IS NULL OR ${officialPublic.capitolAddress} = ''
          OR ${officialPublic.capitolPhone} IS NULL OR ${officialPublic.capitolPhone} = ''
          OR ${officialPublic.capitolRoom} IS NULL OR ${officialPublic.capitolRoom} = ''
        )`,
      ),
    );

  result.total = officials.length;
  console.log(
    `[RefreshOfficials] Capitol backfill: ${officials.length} officials with missing Capitol contact info`,
  );

  for (const official of officials) {
    const target: ContactFallbackTarget = {
      capitolAddress: official.capitolAddress,
      capitolPhone: official.capitolPhone,
      capitolRoom: official.capitolRoom,
      districtAddresses: official.districtAddresses ?? null,
      districtPhones: official.districtPhones ?? null,
      email: official.email,
      searchZips: official.searchZips,
      searchCities: official.searchCities,
    };

    try {
      const mutated = await applyTribuneContactFallback(
        official.fullName,
        target,
      );
      if (mutated) {
        await db
          .update(officialPublic)
          .set({
            capitolAddress: target.capitolAddress ?? null,
            capitolPhone: target.capitolPhone ?? null,
            capitolRoom: target.capitolRoom ?? null,
            districtAddresses: target.districtAddresses ?? null,
            districtPhones: target.districtPhones ?? null,
            email: target.email ?? null,
            searchZips: target.searchZips ?? null,
            searchCities: target.searchCities ?? null,
          })
          .where(eq(officialPublic.id, official.id));
        result.updated++;
      } else {
        result.notFound++;
      }
    } catch (err) {
      console.error(
        `[RefreshOfficials] Backfill error for ${official.fullName}:`,
        err,
      );
      result.errors++;
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(
    `[RefreshOfficials] Capitol backfill complete: updated=${result.updated} notFound=${result.notFound} errors=${result.errors}`,
  );
  return result;
}

async function fetchTLOListPage(chamber: "house" | "senate"): Promise<string> {
  const chamberParam = chamber === "house" ? "H" : "S";
  const listUrl = `${TLO_BASE_URL}/Members/Members.aspx?Chamber=${chamberParam}`;
  const response = await fetchWithRetry(listUrl);
  return response.text();
}

async function fetchUSHouseData(): Promise<string> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    throw new Error("CONGRESS_API_KEY not configured");
  }

  const allMembers: any[] = [];
  let offset = 0;
  const limit = 250;
  let hasMore = true;

  while (hasMore) {
    const url = `${CONGRESS_API_BASE}/member?currentMember=true&limit=${limit}&offset=${offset}&api_key=${apiKey}`;
    const response = await fetchWithRetry(url);
    const data = (await response.json()) as {
      members?: any[];
      pagination?: { next?: string };
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

    await new Promise((r) => setTimeout(r, 300));
  }

  const texasMembers = allMembers.filter((m) => {
    const isTexas = m.state === "Texas" || m.state === "TX";
    if (!isTexas) return false;
    const terms = m.terms?.item || [];
    if (terms.length === 0)
      return m.district !== undefined && m.district !== null;
    const lastTerm = terms[terms.length - 1];
    return (
      lastTerm?.chamber === "House of Representatives" ||
      lastTerm?.chamber?.includes("House") ||
      m.district !== undefined
    );
  });

  return JSON.stringify(
    texasMembers.map((m) => ({
      bioguideId: m.bioguideId,
      name: m.name,
      district: m.district,
      party: m.party,
    })),
  );
}

export interface CheckResult {
  source: SourceType;
  changed: boolean;
  previousFingerprint: string | null;
  newFingerprint: string;
  error?: string;
}

export async function checkSourceForChanges(
  source: SourceType,
): Promise<CheckResult> {
  console.log(`[RefreshOfficials] Checking ${source} for changes...`);

  try {
    let rawData: string;

    if (source === "TX_HOUSE") {
      rawData = await fetchTLOListPage("house");
    } else if (source === "TX_SENATE") {
      rawData = await fetchTLOListPage("senate");
    } else {
      rawData = await fetchUSHouseData();
    }

    const newFingerprint = computeFingerprint(rawData);
    const state = await getRefreshState(source);
    const previousFingerprint = state?.fingerprint || null;
    const changed = previousFingerprint !== newFingerprint;

    console.log(
      `[RefreshOfficials] ${source}: fingerprint=${newFingerprint.slice(0, 12)}... changed=${changed}`,
    );

    return {
      source,
      changed,
      previousFingerprint,
      newFingerprint,
    };
  } catch (err) {
    console.error(`[RefreshOfficials] Error checking ${source}:`, err);
    return {
      source,
      changed: false,
      previousFingerprint: null,
      newFingerprint: "",
      error: String(err),
    };
  }
}

function validateTLORecord(
  record: ParsedOfficial,
  chamber: "house" | "senate",
): string | null {
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

async function fetchMemberDetails(
  memberUrl: string,
  chamber: "house" | "senate",
): Promise<ParsedOfficial | null> {
  try {
    const response = await fetchWithRetry(memberUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    const urlMatch = memberUrl.match(/Code=([A-Z0-9]+)/i);
    const sourceMemberId = urlMatch ? urlMatch[1] : "";

    if (!sourceMemberId) return null;

    // TLO WCAG 2.1 redesign (2026): member name moved from <title> to <h1>.
    // Old title: "Information for Rep. Alma Allen"
    // New title: "Member Information | Texas Legislature Online" (generic)
    // New h1:    "Information for Rep. Alma Allen"
    const h1Text = $("h1").first().text().trim();
    const NAME_RE = /Information for (Rep\.|Sen\.)\s*(.+)$/;
    let fullName = "";

    const h1Match = h1Text.match(NAME_RE);
    if (h1Match) {
      fullName = h1Match[2].trim();
    }

    // Lt. Gov. pages won't match NAME_RE (no Rep./Sen. prefix) — they return null naturally.
    // Keep an explicit guard for safety.
    if (h1Text.includes("Lt. Gov.") || h1Text.includes("Lieutenant Governor")) {
      return null;
    }

    // Fallback: legacy <title> format (in case TLO reverts or for old cached pages)
    if (!fullName) {
      const titleText = $("title").text();
      if (
        titleText.includes("Lt. Gov.") ||
        titleText.includes("Lieutenant Governor")
      ) {
        return null;
      }
      const titleMatch = titleText.match(NAME_RE);
      fullName = titleMatch ? titleMatch[2].trim() : "";
    }

    // Final fallback: header page-title span
    if (!fullName) {
      const pageTitle = $("#usrHeader_lblPageTitle").text();
      const altMatch = pageTitle.match(NAME_RE);
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
      console.warn(
        `[RefreshOfficials] No district found for ${fullName} at ${memberUrl}`,
      );
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
    const capitolAddress = [capitolAddr1, capitolAddr2]
      .filter(Boolean)
      .join(", ");

    const capitolOfficeText = $("#lblCapitolOffice").text().trim();
    let capitolRoom: string | undefined;
    if (capitolOfficeText) {
      // Keep the full building code (e.g., "EXT E1.304", "CAP 1W.3", "GNB.647")
      capitolRoom = capitolOfficeText;
    }

    const capitolPhone = $("#lblCapitolPhone").text().trim() || undefined;

    const districtAddr1 = $("#lblDistrictAddress1").text().trim();
    const districtAddr2 = $("#lblDistrictAddress2").text().trim();
    const districtAddress = [districtAddr1, districtAddr2]
      .filter(Boolean)
      .join(", ");
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
      capitolRoom,
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

  const partyLookup =
    chamber === "house"
      ? await fetchTexasHouseParties()
      : await fetchTexasSenateParties();

  try {
    const response = await fetchWithRetry(listUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    const memberLinks: string[] = [];
    $('a[href*="MemberInfo.aspx"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const fullUrl = href.startsWith("http")
          ? href
          : `${TLO_BASE_URL}/Members/${href}`;
        if (!memberLinks.includes(fullUrl)) {
          memberLinks.push(fullUrl);
        }
      }
    });

    const filteredLinks = memberLinks.filter(
      (url) =>
        url.includes(`Chamber=${chamberParam}`) ||
        (chamber === "senate" && url.includes("Chamber=S")) ||
        (chamber === "house" && url.includes("Chamber=H")),
    );

    console.log(
      `[RefreshOfficials] Found ${filteredLinks.length} member links for ${source} (total links: ${memberLinks.length})`,
    );

    const expectedMin = chamber === "house" ? 140 : 25;
    if (filteredLinks.length < expectedMin) {
      console.warn(
        `[RefreshOfficials] WARNING: Only found ${filteredLinks.length} links, expected at least ${expectedMin}`,
      );
      $("a").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href.toLowerCase().includes("member")) {
          console.log(`[RefreshOfficials] Debug link: ${href}`);
        }
      });
    }

    memberLinks.length = 0;
    memberLinks.push(...filteredLinks);

    console.log(
      `[RefreshOfficials] Processing ${memberLinks.length} member links for ${source}`,
    );

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
            console.warn(
              `[RefreshOfficials] Failed to parse member from: ${url}`,
            );
          }
          return record;
        }),
      );

      for (const record of batchResults) {
        if (record) {
          records.push(record);
        }
      }

      if (i + batchSize < memberLinks.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    result.parsedCount = records.length;
    console.log(
      `[RefreshOfficials] Parsed ${records.length} ${source} members`,
    );

    // Safety guard: if the list page returned plenty of links but we parsed zero
    // records, something is wrong with the scraper (e.g. TLO changed their HTML).
    // Return early WITHOUT running the deactivation step so we don't wipe existing officials.
    // (expectedMin already declared above when checking link count from the list page)
    if (memberLinks.length >= expectedMin && records.length === 0) {
      const msg = `SAFETY ABORT: found ${memberLinks.length} member links but parsed 0 records — TLO page structure may have changed. Skipping upsert and deactivation to protect existing data.`;
      console.error(`[RefreshOfficials] ${msg}`);
      result.errors.push(msg);
      try {
        const { recordScraperAlert } = await import("./scraperAlerts");
        await recordScraperAlert({
          source,
          kind: "SAFETY_ABORT",
          severity: "critical",
          message: msg,
          details: {
            chamber,
            listUrl,
            memberLinksFound: memberLinks.length,
            expectedMin,
            parsedRecords: records.length,
          },
        });
      } catch (alertErr) {
        console.error(
          `[RefreshOfficials] Failed to raise SAFETY_ABORT alert:`,
          alertErr,
        );
      }
      return result;
    }

    const processedMemberIds: string[] = [];

    for (const record of records) {
      const validationError = validateTLORecord(record, chamber);
      if (validationError) {
        result.errors.push(`${record.fullName}: ${validationError}`);
        result.skippedCount++;
        continue;
      }

      try {
        const existing = await db
          .select()
          .from(officialPublic)
          .where(
            and(
              eq(officialPublic.source, source),
              eq(officialPublic.sourceMemberId, record.sourceMemberId),
            ),
          )
          .limit(1);

        const allAddresses: string[] = [];
        if (record.capitolAddress) allAddresses.push(record.capitolAddress);
        if (record.districtAddresses)
          allAddresses.push(...record.districtAddresses);

        const districtNum = parseInt(record.district, 10);
        const authorativeParty = partyLookup.get(districtNum) || record.party;

        const insertData: InsertOfficialPublic = {
          source,
          sourceMemberId: record.sourceMemberId,
          chamber: chamber === "house" ? "TX House" : "TX Senate",
          district: record.district,
          fullName: record.fullName,
          party: authorativeParty,
          photoUrl: record.photoUrl,
          capitolAddress: record.capitolAddress,
          capitolPhone: record.capitolPhone,
          capitolRoom: record.capitolRoom,
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
          const {
            id: _ignoredId,
            ...updateData
          }: Partial<InsertOfficialPublic> & { id?: unknown } = {
            ...insertData,
          };
          if (existing[0].photoUrl && !updateData.photoUrl) {
            updateData.photoUrl = existing[0].photoUrl;
          }
          // TLO's WCAG 2.1 redesign removed address/phone/website fields from
          // member pages. Preserve whatever already exists in the DB rather
          // than blanking those columns on every refresh.
          const prev = existing[0];
          if (!record.capitolAddress && prev.capitolAddress)
            updateData.capitolAddress = prev.capitolAddress;
          if (!record.capitolPhone && prev.capitolPhone)
            updateData.capitolPhone = prev.capitolPhone;
          if (!record.capitolRoom && prev.capitolRoom)
            updateData.capitolRoom = prev.capitolRoom;
          if (
            (!record.districtAddresses ||
              record.districtAddresses.length === 0) &&
            prev.districtAddresses &&
            prev.districtAddresses.length > 0
          ) {
            updateData.districtAddresses = prev.districtAddresses;
          }
          if (
            (!record.districtPhones || record.districtPhones.length === 0) &&
            prev.districtPhones &&
            prev.districtPhones.length > 0
          ) {
            updateData.districtPhones = prev.districtPhones;
          }
          if (!record.website && prev.website)
            updateData.website = prev.website;
          if (!record.email && prev.email) updateData.email = prev.email;
          // If we ended up keeping prior addresses, recompute search arrays from
          // the merged set so we don't wipe the search index either.
          const mergedAddresses: string[] = [];
          if (updateData.capitolAddress)
            mergedAddresses.push(updateData.capitolAddress);
          if (updateData.districtAddresses)
            mergedAddresses.push(...updateData.districtAddresses);
          if (mergedAddresses.length > 0) {
            updateData.searchZips = extractSearchZips(mergedAddresses);
            updateData.searchCities = extractSearchCities(mergedAddresses);
          } else if (prev.searchZips && prev.searchZips.length > 0) {
            updateData.searchZips = prev.searchZips;
            updateData.searchCities = prev.searchCities;
          }
          if (
            !updateData.photoUrl &&
            (source === "TX_HOUSE" || source === "TX_SENATE")
          ) {
            try {
              const { lookupHeadshotFromTexasTribune } = await import(
                "../lib/texasTribuneLookup"
              );
              const headshot = await lookupHeadshotFromTexasTribune(
                record.fullName,
              );
              if (headshot.success && headshot.photoUrl) {
                updateData.photoUrl = headshot.photoUrl;
              }
            } catch (err) {
              console.log(
                `[RefreshOfficials] Headshot lookup failed for ${record.fullName}`,
              );
            }
          }
          if (source === "TX_HOUSE" || source === "TX_SENATE") {
            await applyTribuneContactFallback(record.fullName, updateData);
          }
          await db
            .update(officialPublic)
            .set(updateData)
            .where(eq(officialPublic.id, existing[0].id));
        } else {
          if (!insertData.photoUrl) {
            try {
              const { lookupHeadshotFromTexasTribune } = await import(
                "../lib/texasTribuneLookup"
              );
              const headshot = await lookupHeadshotFromTexasTribune(
                record.fullName,
              );
              if (headshot.success && headshot.photoUrl) {
                insertData.photoUrl = headshot.photoUrl;
              }
            } catch (err) {
              console.log(
                `[RefreshOfficials] Headshot lookup failed for ${record.fullName}`,
              );
            }
          }
          if (source === "TX_HOUSE" || source === "TX_SENATE") {
            await applyTribuneContactFallback(record.fullName, insertData);
          }
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
      const deactivated = await db
        .update(officialPublic)
        .set({ active: false })
        .where(
          and(
            eq(officialPublic.source, source),
            eq(officialPublic.active, true),
            sql`${officialPublic.sourceMemberId} NOT IN (${sql.join(
              processedMemberIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
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
    console.warn(
      "[RefreshOfficials] CONGRESS_API_KEY not set, skipping US House refresh",
    );
    return result;
  }

  console.log(
    "[RefreshOfficials] Starting US_HOUSE refresh from Congress.gov API",
  );

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
      console.log(
        `[RefreshOfficials] Fetching Congress.gov page offset=${offset}`,
      );
      const response = await fetchWithRetry(url);
      const data = (await response.json()) as {
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

      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(
      `[RefreshOfficials] Fetched ${allMembers.length} total members from Congress.gov`,
    );

    const texasMembers = allMembers.filter((m) => {
      const isTexas = m.state === "Texas" || m.state === "TX";
      if (!isTexas) return false;

      const terms = m.terms?.item || [];
      if (terms.length === 0) {
        return m.district !== undefined && m.district !== null;
      }
      const lastTerm = terms[terms.length - 1];
      const isHouse =
        lastTerm?.chamber === "House of Representatives" ||
        lastTerm?.chamber?.includes("House") ||
        m.district !== undefined;
      return isHouse;
    });

    console.log(
      `[RefreshOfficials] Filtered to ${texasMembers.length} Texas US House members`,
    );

    if (texasMembers.length < 30) {
      result.errors.push(
        `Only found ${texasMembers.length} TX members, expected ~38. Check API filtering.`,
      );
      console.warn(
        `[RefreshOfficials] WARNING: Only ${texasMembers.length} TX House members found`,
      );
    }

    result.parsedCount = texasMembers.length;
    console.log(
      `[RefreshOfficials] Found ${texasMembers.length} Texas US House members`,
    );

    const processedMemberIds: string[] = [];

    for (const member of texasMembers) {
      const fullName =
        member.name ||
        `${member.firstName || ""} ${member.lastName || ""}`.trim();
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
        const existing = await db
          .select()
          .from(officialPublic)
          .where(
            and(
              eq(officialPublic.source, source),
              eq(officialPublic.sourceMemberId, record.sourceMemberId),
            ),
          )
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
          await db
            .update(officialPublic)
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
      const deactivated = await db
        .update(officialPublic)
        .set({ active: false })
        .where(
          and(
            eq(officialPublic.source, source),
            eq(officialPublic.active, true),
            sql`${officialPublic.sourceMemberId} NOT IN (${sql.join(
              processedMemberIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
        .returning();
      result.deactivatedCount = deactivated.length;
    }
  } catch (err) {
    result.errors.push(`Fatal error: ${err}`);
    console.error("[RefreshOfficials] US_HOUSE refresh failed:", err);
  }

  return result;
}

async function getLastSuccessfulRefreshCounts(): Promise<
  Map<SourceType, number>
> {
  const counts = new Map<SourceType, number>();

  for (const source of ["TX_HOUSE", "TX_SENATE", "US_HOUSE"] as SourceType[]) {
    const lastSuccess = await db
      .select()
      .from(refreshJobLog)
      .where(
        and(
          eq(refreshJobLog.source, source),
          eq(refreshJobLog.status, "success"),
        ),
      )
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
  lastCounts: Map<SourceType, number>,
): { valid: boolean; reason?: string } {
  if (result.parsedCount === 0) {
    return {
      valid: false,
      reason: "Zero records parsed - possible source outage",
    };
  }

  const lastCount = lastCounts.get(result.source);

  if (lastCount && lastCount >= 20) {
    const deviation = Math.abs(result.upsertedCount - lastCount) / lastCount;
    if (deviation > 0.25) {
      return {
        valid: false,
        reason: `Count deviation ${(deviation * 100).toFixed(1)}% exceeds 25% threshold (was ${lastCount}, now ${result.upsertedCount})`,
      };
    }
  } else if (lastCount && lastCount < 20 && result.upsertedCount > lastCount) {
    console.log(
      `[RefreshOfficials] ${result.source}: Allowing population growth from ${lastCount} to ${result.upsertedCount} (initial population)`,
    );
  }

  const expectedMins: Partial<Record<SourceType, number>> = {
    TX_HOUSE: 140,
    TX_SENATE: 25,
    US_HOUSE: 30,
  };

  const expectedMin = expectedMins[result.source] ?? 0;
  if (result.upsertedCount < expectedMin) {
    console.warn(
      `[RefreshOfficials] WARNING: ${result.source} has only ${result.upsertedCount} members, expected at least ${expectedMin}`,
    );
  }

  return { valid: true };
}

async function logRefreshJob(
  result: RefreshResult,
  status: string,
  durationMs: number,
  errorMessage?: string,
) {
  await db.insert(refreshJobLog).values({
    source: result.source,
    status,
    parsedCount: String(result.parsedCount),
    upsertedCount: String(result.upsertedCount),
    skippedCount: String(result.skippedCount),
    deactivatedCount: String(result.deactivatedCount),
    durationMs: String(durationMs),
    errorMessage:
      errorMessage ||
      (result.errors.length > 0 ? result.errors.join("; ") : undefined),
    completedAt: new Date(),
  });
}

export async function refreshAllOfficials(): Promise<void> {
  console.log("[RefreshOfficials] Starting full refresh of all officials data");
  const overallStart = Date.now();

  const lastCounts = await getLastSuccessfulRefreshCounts();

  const sources: Array<{ name: SourceType; fn: () => Promise<RefreshResult> }> =
    [
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
        console.error(
          `[RefreshOfficials] ${name} ABORTED: ${sanityCheck.reason}`,
        );
        await logRefreshJob(result, "aborted", duration, sanityCheck.reason);
        try {
          const { recordScraperAlert } = await import("./scraperAlerts");
          const isZero = result.parsedCount === 0;
          await recordScraperAlert({
            source: name,
            kind: isZero ? "ZERO_PARSED" : "SANITY_ABORT",
            severity: isZero ? "critical" : "warning",
            message: `${name} sanity check failed: ${sanityCheck.reason}`,
            details: {
              parsedCount: result.parsedCount,
              upsertedCount: result.upsertedCount,
              reason: sanityCheck.reason,
            },
          });
        } catch (alertErr) {
          console.error(
            `[RefreshOfficials] Failed to raise sanity alert:`,
            alertErr,
          );
        }
        continue;
      }

      console.log(
        `[RefreshOfficials] ${name} completed: ${result.upsertedCount} upserted, ${result.skippedCount} skipped, ${result.deactivatedCount} deactivated in ${duration}ms`,
      );
      await logRefreshJob(result, "success", duration);
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[RefreshOfficials] ${name} FAILED:`, err);
      await logRefreshJob(
        {
          source: name,
          parsedCount: 0,
          upsertedCount: 0,
          skippedCount: 0,
          deactivatedCount: 0,
          errors: [],
        },
        "failed",
        duration,
        String(err),
      );
      try {
        const { recordScraperAlert } = await import("./scraperAlerts");
        await recordScraperAlert({
          source: name,
          kind: "JOB_FAILED",
          severity: "critical",
          message: `${name} refresh job threw: ${String(err)}`,
          details: { error: String(err) },
        });
      } catch (alertErr) {
        console.error(
          `[RefreshOfficials] Failed to raise JOB_FAILED alert:`,
          alertErr,
        );
      }
    }
  }

  const totalDuration = Date.now() - overallStart;
  console.log(
    `[RefreshOfficials] Full refresh completed in ${totalDuration}ms`,
  );
}

export async function getLastRefreshTime(): Promise<Date | null> {
  const latest = await db
    .select()
    .from(refreshJobLog)
    .where(eq(refreshJobLog.status, "success"))
    .orderBy(sql`${refreshJobLog.completedAt} DESC`)
    .limit(1);

  return latest.length > 0 ? latest[0].completedAt : null;
}

export async function shouldRunRefresh(): Promise<boolean> {
  // Only seed on startup if the DB has no officials — the Monday scheduler
  // handles change detection via fingerprinting once data is populated.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(officialPublic)
    .where(eq(officialPublic.active, true));
  return count === 0;
}

let isRefreshing = false;

export function getIsRefreshing(): boolean {
  return isRefreshing;
}

export interface SmartRefreshResult {
  sourcesChecked: SourceType[];
  sourcesChanged: SourceType[];
  sourcesRefreshed: SourceType[];
  errors: { source: SourceType; error: string }[];
  durationMs: number;
}

export async function checkAndRefreshIfChanged(
  force = false,
): Promise<SmartRefreshResult> {
  if (isRefreshing) {
    console.log("[RefreshOfficials] Refresh already in progress, skipping");
    return {
      sourcesChecked: [],
      sourcesChanged: [],
      sourcesRefreshed: [],
      errors: [{ source: "TX_HOUSE", error: "Refresh already in progress" }],
      durationMs: 0,
    };
  }

  isRefreshing = true;
  const startTime = Date.now();
  const result: SmartRefreshResult = {
    sourcesChecked: [],
    sourcesChanged: [],
    sourcesRefreshed: [],
    errors: [],
    durationMs: 0,
  };

  console.log(
    `[RefreshOfficials] Starting smart check-and-refresh (force=${force})`,
  );

  try {
    const sources: SourceType[] = ["TX_HOUSE", "TX_SENATE", "US_HOUSE"];
    const lastCounts = await getLastSuccessfulRefreshCounts();

    for (const source of sources) {
      result.sourcesChecked.push(source);

      const checkResult = await checkSourceForChanges(source);

      if (checkResult.error) {
        result.errors.push({ source, error: checkResult.error });
        continue;
      }

      if (!checkResult.changed && !force) {
        console.log(
          `[RefreshOfficials] ${source}: No changes detected, skipping refresh`,
        );
        await markCheckedOnly(source);
        continue;
      }

      result.sourcesChanged.push(source);
      console.log(
        `[RefreshOfficials] ${source}: Changes detected, running refresh...`,
      );

      const refreshStart = Date.now();
      let refreshResult: RefreshResult;

      try {
        if (source === "TX_HOUSE") {
          refreshResult = await refreshTLO("house");
        } else if (source === "TX_SENATE") {
          refreshResult = await refreshTLO("senate");
        } else {
          refreshResult = await refreshUSHouse();
        }

        const duration = Date.now() - refreshStart;
        const sanityCheck = validateRefreshSanity(refreshResult, lastCounts);

        if (!sanityCheck.valid) {
          console.error(
            `[RefreshOfficials] ${source} ABORTED: ${sanityCheck.reason}`,
          );
          await logRefreshJob(
            refreshResult,
            "aborted",
            duration,
            sanityCheck.reason,
          );
          result.errors.push({
            source,
            error: sanityCheck.reason || "Sanity check failed",
          });
          try {
            const { recordScraperAlert } = await import("./scraperAlerts");
            const isZero = refreshResult.parsedCount === 0;
            await recordScraperAlert({
              source,
              kind: isZero ? "ZERO_PARSED" : "SANITY_ABORT",
              severity: isZero ? "critical" : "warning",
              message: `${source} sanity check failed: ${sanityCheck.reason}`,
              details: {
                parsedCount: refreshResult.parsedCount,
                upsertedCount: refreshResult.upsertedCount,
                reason: sanityCheck.reason,
              },
            });
          } catch (alertErr) {
            console.error(
              `[RefreshOfficials] Failed to raise sanity alert:`,
              alertErr,
            );
          }
          continue;
        }

        await logRefreshJob(refreshResult, "success", duration);
        await updateRefreshState(source, checkResult.newFingerprint, true);
        result.sourcesRefreshed.push(source);

        console.log(
          `[RefreshOfficials] ${source} refreshed: ${refreshResult.upsertedCount} upserted in ${duration}ms`,
        );
      } catch (err) {
        const duration = Date.now() - refreshStart;
        console.error(`[RefreshOfficials] ${source} FAILED:`, err);
        await logRefreshJob(
          {
            source,
            parsedCount: 0,
            upsertedCount: 0,
            skippedCount: 0,
            deactivatedCount: 0,
            errors: [],
          },
          "failed",
          duration,
          String(err),
        );
        result.errors.push({ source, error: String(err) });
        try {
          const { recordScraperAlert } = await import("./scraperAlerts");
          await recordScraperAlert({
            source,
            kind: "JOB_FAILED",
            severity: "critical",
            message: `${source} refresh job threw: ${String(err)}`,
            details: { error: String(err) },
          });
        } catch (alertErr) {
          console.error(
            `[RefreshOfficials] Failed to raise JOB_FAILED alert:`,
            alertErr,
          );
        }
      }
    }
  } finally {
    isRefreshing = false;
    result.durationMs = Date.now() - startTime;
  }

  console.log(
    `[RefreshOfficials] Smart refresh completed: checked=${result.sourcesChecked.length}, changed=${result.sourcesChanged.length}, refreshed=${result.sourcesRefreshed.length}, errors=${result.errors.length} in ${result.durationMs}ms`,
  );

  return result;
}

export async function maybeRunScheduledRefresh(): Promise<void> {
  if (isRefreshing) {
    console.log("[RefreshOfficials] Refresh already in progress, skipping");
    return;
  }

  const shouldRun = await shouldRunRefresh();
  if (!shouldRun) {
    console.log(
      "[RefreshOfficials] Last refresh was less than 7 days ago, skipping",
    );
    return;
  }

  isRefreshing = true;
  try {
    await refreshAllOfficials();
  } finally {
    isRefreshing = false;
  }
}

export function isInMondayCheckWindow(): boolean {
  const now = new Date();
  const centralOptions: Intl.DateTimeFormatOptions = {
    timeZone: "America/Chicago",
    weekday: "long",
    hour: "numeric",
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat("en-US", centralOptions);
  const parts = formatter.formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hourPart = parts.find((p) => p.type === "hour")?.value;
  const hour = hourPart ? parseInt(hourPart, 10) : -1;

  return weekday === "Monday" && hour >= 3 && hour < 4;
}

export async function wasCheckedThisWeek(): Promise<boolean> {
  const sources: SourceType[] = ["TX_HOUSE", "TX_SENATE", "US_HOUSE"];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const source of sources) {
    const state = await getRefreshState(source);
    if (!state?.lastCheckedAt || state.lastCheckedAt < oneWeekAgo) {
      return false;
    }
  }

  return true;
}

export async function getAllRefreshStates(): Promise<
  Array<{
    source: SourceType;
    fingerprint: string | null;
    lastCheckedAt: Date | null;
    lastChangedAt: Date | null;
    lastRefreshedAt: Date | null;
  }>
> {
  const states = await db.select().from(refreshState);
  return states.map((s) => ({
    source: s.source,
    fingerprint: s.fingerprint,
    lastCheckedAt: s.lastCheckedAt,
    lastChangedAt: s.lastChangedAt,
    lastRefreshedAt: s.lastRefreshedAt,
  }));
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  refreshAllOfficials()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
