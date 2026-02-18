import { db } from "../db";
import { officialPublic, officialPrivate, persons } from "../../shared/schema";
import { eq, isNull, or } from "drizzle-orm";
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
  
  const sourceOrder: Record<string, number> = { 'TX_SENATE': 0, 'TX_HOUSE': 1, 'US_HOUSE': 2, 'OTHER_TX': 3 };
  const officials = allOfficials.sort((a, b) => (sourceOrder[a.source] ?? 9) - (sourceOrder[b.source] ?? 9));
  
  result.total = officials.length;
  console.log(`[BulkFill] Found ${officials.length} active officials (Senate first)`);
  
  const { isEffectivelyEmpty } = await import("../lib/backfillUtils");
  
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < officials.length; i++) {
    const official = officials[i];
    
    try {
      let existingPrivate = null;
      
      if (official.personId) {
        const records = await dbQuery(() => db
          .select()
          .from(officialPrivate)
          .where(eq(officialPrivate.personId, official.personId!)), `lookup ${official.fullName}`);
        existingPrivate = records[0] || null;
      }
      
      if (!existingPrivate) {
        const records = await dbQuery(() => db
          .select()
          .from(officialPrivate)
          .where(eq(officialPrivate.officialPublicId, official.id)), `lookup2 ${official.fullName}`);
        existingPrivate = records[0] || null;
      }
      
      if (!isEffectivelyEmpty(existingPrivate?.personalAddress)) {
        result.skipped++;
        result.details.push({
          name: official.fullName,
          status: "skipped",
          reason: "Already has personalAddress",
        });
        continue;
      }
      
      await delay(1000);
      
      const lookup = await lookupHometownFromTexasTribune(official.fullName);
      
      if (!lookup.success || !lookup.hometown) {
        result.notFound++;
        result.details.push({
          name: official.fullName,
          status: "not_found",
          reason: "Not found in Texas Tribune directory",
        });
        continue;
      }
      
      if (existingPrivate) {
        await dbQuery(() => db
          .update(officialPrivate)
          .set({
            personalAddress: lookup.hometown,
            addressSource: "tribune",
            updatedAt: new Date(),
          })
          .where(eq(officialPrivate.id, existingPrivate!.id)), `update ${official.fullName}`);
        console.log(`[BulkFill] Updated ${official.fullName}: ${lookup.hometown}`);
      } else {
        await dbQuery(() => db.insert(officialPrivate).values({
          personId: official.personId,
          officialPublicId: official.id,
          personalAddress: lookup.hometown,
          addressSource: "tribune",
        }), `insert ${official.fullName}`);
        console.log(`[BulkFill] Created ${official.fullName}: ${lookup.hometown}`);
      }
      
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
