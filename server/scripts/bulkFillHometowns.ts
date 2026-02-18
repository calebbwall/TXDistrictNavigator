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
  
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < officials.length; i++) {
    const official = officials[i];
    
    try {
      await delay(1000);
      
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
        continue;
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
    
    if ((i + 1) % BATCH_SIZE === 0 && i + 1 < officials.length) {
      console.log(`[BulkFill] Progress: ${i + 1}/${officials.length} processed (filled=${result.filled}). Pausing 5s...`);
      await delay(5000);
    }
  }
  
  console.log(`[BulkFill] Complete! Filled: ${result.filled}, Skipped: ${result.skipped}, Not Found: ${result.notFound}, Errors: ${result.errors}`);
  
  return result;
}
