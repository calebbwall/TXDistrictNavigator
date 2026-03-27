import { db } from "../db";
import { officialPublic, officialPrivate, persons } from "../../shared/schema";
import { eq, isNull, or, notInArray, sql } from "drizzle-orm";
import { lookupHometownFromTexasTribune } from "../lib/texasTribuneLookup";

interface BulkFillResult {
  total: number;
  filled: number;
  skipped: number;
  notFound: number;
  errors: number;
  details: {
    name: string;
    status: "filled" | "skipped" | "not_found" | "error";
    hometown?: string;
    reason?: string;
  }[];
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function dbQuery<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < maxRetries && (msg.includes('timed out') || msg.includes('socket') || msg.includes('Authentication') || msg.includes('terminated') || msg.includes('TLS'))) {
        console.log(`[BulkFill] DB retry ${attempt}/${maxRetries} (${label}): ${msg}`);
        await delay(3000 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unreachable");
}

export async function bulkFillHometowns(): Promise<BulkFillResult> {
  console.log("[BulkFill] Starting bulk hometown fill...");
  
  const result: BulkFillResult = {
    total: 0,
    filled: 0,
    skipped: 0,
    notFound: 0,
    errors: 0,
    details: [],
  };
  
  const allPrivate = await dbQuery(() => db
    .select({
      officialPublicId: officialPrivate.officialPublicId,
      personId: officialPrivate.personId,
    })
    .from(officialPrivate), "fetch existing private records");
  
  const coveredOfficialIds = new Set(allPrivate.map(p => p.officialPublicId).filter(Boolean));
  const coveredPersonIds = new Set(allPrivate.map(p => p.personId).filter(Boolean));
  
  const allOfficials = await dbQuery(() => db
    .select({
      id: officialPublic.id,
      fullName: officialPublic.fullName,
      personId: officialPublic.personId,
      source: officialPublic.source,
      active: officialPublic.active,
    })
    .from(officialPublic)
    .where(eq(officialPublic.active, true)), "fetch officials");
  
  const uncheckedOfficials = allOfficials.filter(o => {
    if (coveredOfficialIds.has(o.id)) return false;
    if (o.personId && coveredPersonIds.has(o.personId)) return false;
    return true;
  });
  
  const sourceOrder: Record<string, number> = { 'TX_SENATE': 0, 'TX_HOUSE': 1, 'US_HOUSE': 2, 'OTHER_TX': 3 };
  const officials = uncheckedOfficials.sort((a, b) => (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9));
  
  result.total = officials.length;

  if (officials.length === 0) {
    console.log(`[BulkFill] All ${allOfficials.length} officials already have private records. Nothing to do.`);
    return result;
  }

  console.log(`[BulkFill] Found ${officials.length} unchecked officials (of ${allOfficials.length} total)`);

  // Process in concurrent batches of 3 (down from sequential) for ~3x throughput.
  // We still wait 1s between each individual request to be polite to Texas Tribune.
  const CONCURRENCY = 3;
  const PROGRESS_LOG_EVERY = 15; // log every 15 officials

  async function processOne(official: typeof officials[0], index: number): Promise<void> {
    // Stagger start within the batch to avoid burst
    await delay(Math.floor(index % CONCURRENCY) * 400);
    try {
      const lookup = await lookupHometownFromTexasTribune(official.fullName);

      if (!lookup.success || !lookup.hometown) {
        await dbQuery(() => db.insert(officialPrivate).values({
          personId: official.personId,
          officialPublicId: official.id,
          personalAddress: null,
          addressSource: "tribune_not_found",
        }), `mark-not-found ${official.fullName}`);
        console.log(`[BulkFill] Not found, marked checked: ${official.fullName}`);
        result.notFound++;
        result.details.push({
          name: official.fullName,
          status: "not_found",
          reason: "Not found in Texas Tribune directory (marked so it won't be re-checked)",
        });
        return;
      }

      await dbQuery(() => db.insert(officialPrivate).values({
        personId: official.personId,
        officialPublicId: official.id,
        personalAddress: lookup.hometown,
        addressSource: "tribune",
      }), `insert ${official.fullName}`);
      console.log(`[BulkFill] Created ${official.fullName}: ${lookup.hometown}`);

      result.filled++;
      result.details.push({
        name: official.fullName,
        status: "filled",
        hometown: lookup.hometown,
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[BulkFill] Failed ${official.fullName}: ${msg}`);
      result.errors++;
      result.details.push({
        name: official.fullName,
        status: "error",
        reason: msg,
      });
    }
  }

  for (let i = 0; i < officials.length; i += CONCURRENCY) {
    const chunk = officials.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((official, j) => processOne(official, j)));

    const processed = Math.min(i + CONCURRENCY, officials.length);
    if (processed % PROGRESS_LOG_EVERY === 0 || processed === officials.length) {
      console.log(`[BulkFill] Progress: ${processed}/${officials.length} (filled=${result.filled}, notFound=${result.notFound})`);
    }
    // Polite pause between batches
    if (i + CONCURRENCY < officials.length) {
      await delay(1200);
    }
  }

  console.log(`[BulkFill] Complete! Filled: ${result.filled}, Skipped: ${result.skipped}, Not Found: ${result.notFound}, Errors: ${result.errors}`);
  
  return result;
}
