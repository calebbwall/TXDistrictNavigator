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
  
  const officials = await db
    .select({
      id: officialPublic.id,
      fullName: officialPublic.fullName,
      personId: officialPublic.personId,
      source: officialPublic.source,
      active: officialPublic.active,
    })
    .from(officialPublic)
    .where(eq(officialPublic.active, true));
  
  result.total = officials.length;
  console.log(`[BulkFill] Found ${officials.length} active officials`);
  
  for (let i = 0; i < officials.length; i++) {
    const official = officials[i];
    console.log(`[BulkFill] Processing ${i + 1}/${officials.length}: ${official.fullName}`);
    
    try {
      let existingPrivate = null;
      
      if (official.personId) {
        const records = await db
          .select()
          .from(officialPrivate)
          .where(eq(officialPrivate.personId, official.personId));
        existingPrivate = records[0] || null;
      }
      
      if (!existingPrivate) {
        const records = await db
          .select()
          .from(officialPrivate)
          .where(eq(officialPrivate.officialPublicId, official.id));
        existingPrivate = records[0] || null;
      }
      
      const { isEffectivelyEmpty } = await import("../lib/backfillUtils");
      if (!isEffectivelyEmpty(existingPrivate?.personalAddress)) {
        console.log(`[BulkFill] Skipping ${official.fullName} - already has personalAddress`);
        result.skipped++;
        result.details.push({
          name: official.fullName,
          status: "skipped",
          reason: "Already has personalAddress",
        });
        continue;
      }
      
      await delay(500);
      
      const lookup = await lookupHometownFromTexasTribune(official.fullName);
      
      if (!lookup.success || !lookup.hometown) {
        console.log(`[BulkFill] No hometown found for ${official.fullName}`);
        result.notFound++;
        result.details.push({
          name: official.fullName,
          status: "not_found",
          reason: "Not found in Texas Tribune directory",
        });
        continue;
      }
      
      if (existingPrivate) {
        await db
          .update(officialPrivate)
          .set({
            personalAddress: lookup.hometown,
            addressSource: "tribune",
            updatedAt: new Date(),
          })
          .where(eq(officialPrivate.id, existingPrivate.id));
        console.log(`[BulkFill] Updated ${official.fullName} with hometown: ${lookup.hometown}`);
      } else {
        await db.insert(officialPrivate).values({
          personId: official.personId,
          officialPublicId: official.id,
          personalAddress: lookup.hometown,
          addressSource: "tribune",
        });
        console.log(`[BulkFill] Created new record for ${official.fullName} with hometown: ${lookup.hometown}`);
      }
      
      result.filled++;
      result.details.push({
        name: official.fullName,
        status: "filled",
        hometown: lookup.hometown,
      });
      
    } catch (error) {
      console.error(`[BulkFill] Error processing ${official.fullName}:`, error);
      result.errors++;
      result.details.push({
        name: official.fullName,
        status: "error",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  
  console.log(`[BulkFill] Complete! Filled: ${result.filled}, Skipped: ${result.skipped}, Not Found: ${result.notFound}, Errors: ${result.errors}`);
  
  return result;
}

if (require.main === module) {
  bulkFillHometowns()
    .then(result => {
      console.log("\n=== BULK FILL SUMMARY ===");
      console.log(`Total officials: ${result.total}`);
      console.log(`Filled: ${result.filled}`);
      console.log(`Skipped (already had address): ${result.skipped}`);
      console.log(`Not found in Tribune: ${result.notFound}`);
      console.log(`Errors: ${result.errors}`);
      process.exit(0);
    })
    .catch(err => {
      console.error("Bulk fill failed:", err);
      process.exit(1);
    });
}
