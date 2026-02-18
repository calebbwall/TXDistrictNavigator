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
  
  const { isEffectivelyEmpty } = await import("../lib/backfillUtils");
  
  for (let i = 0; i < officials.length; i++) {
    const official = officials[i];
    
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        
        if (!isEffectivelyEmpty(existingPrivate?.personalAddress)) {
          result.skipped++;
          result.details.push({
            name: official.fullName,
            status: "skipped",
            reason: "Already has personalAddress",
          });
          break;
        }
        
        await delay(800);
        
        const lookup = await lookupHometownFromTexasTribune(official.fullName);
        
        if (!lookup.success || !lookup.hometown) {
          result.notFound++;
          result.details.push({
            name: official.fullName,
            status: "not_found",
            reason: "Not found in Texas Tribune directory",
          });
          break;
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
          console.log(`[BulkFill] Updated ${official.fullName}: ${lookup.hometown}`);
        } else {
          await db.insert(officialPrivate).values({
            personId: official.personId,
            officialPublicId: official.id,
            personalAddress: lookup.hometown,
            addressSource: "tribune",
          });
          console.log(`[BulkFill] Created ${official.fullName}: ${lookup.hometown}`);
        }
        
        result.filled++;
        result.details.push({
          name: official.fullName,
          status: "filled",
          hometown: lookup.hometown,
        });
        break;
        
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (attempt < maxRetries && (msg.includes('timed out') || msg.includes('socket') || msg.includes('Authentication'))) {
          console.log(`[BulkFill] Retry ${attempt}/${maxRetries} for ${official.fullName}: ${msg}`);
          await delay(5000 * attempt);
          continue;
        }
        console.error(`[BulkFill] Failed ${official.fullName}: ${msg}`);
        result.errors++;
        result.details.push({
          name: official.fullName,
          status: "error",
          reason: msg,
        });
        break;
      }
    }
  }
  
  console.log(`[BulkFill] Complete! Filled: ${result.filled}, Skipped: ${result.skipped}, Not Found: ${result.notFound}, Errors: ${result.errors}`);
  
  return result;
}

