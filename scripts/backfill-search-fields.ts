import { db } from "../server/db";
import { officialPublic } from "../shared/schema";
import { eq } from "drizzle-orm";

const CITY_STATE_ZIP_REGEX = /,\s*TX\s+(\d{5})(?:-\d{4})?\b/gi;
const CITY_REGEX = /([A-Z][a-zA-Z\s]+),\s*TX\b/gi;

function extractZips(addresses: string[]): string[] {
  const zips = new Set<string>();
  for (const addr of addresses) {
    const matches = addr.matchAll(CITY_STATE_ZIP_REGEX);
    for (const match of matches) {
      zips.add(match[1]);
    }
  }
  return Array.from(zips);
}

function extractCities(addresses: string[]): string[] {
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
  return Array.from(cities);
}

async function backfillSearchFields() {
  console.log("[Backfill] Starting search fields backfill...");
  
  const officials = await db.select().from(officialPublic);
  console.log(`[Backfill] Found ${officials.length} officials to process`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const official of officials) {
    const addresses: string[] = [];
    
    if (official.capitolAddress) {
      addresses.push(official.capitolAddress);
    }
    
    if (official.districtAddresses && Array.isArray(official.districtAddresses)) {
      for (const addr of official.districtAddresses) {
        if (typeof addr === "string") {
          addresses.push(addr);
        }
      }
    }
    
    if (addresses.length === 0) {
      skipped++;
      continue;
    }
    
    const zips = extractZips(addresses);
    const cities = extractCities(addresses);
    
    const searchZips = zips.length > 0 ? zips.join(",") : null;
    const searchCities = cities.length > 0 ? cities.join(",") : null;
    
    await db.update(officialPublic)
      .set({
        searchZips,
        searchCities,
      })
      .where(eq(officialPublic.id, official.id));
    
    updated++;
    
    if (updated % 50 === 0) {
      console.log(`[Backfill] Progress: ${updated}/${officials.length}`);
    }
  }
  
  console.log(`[Backfill] Complete: ${updated} updated, ${skipped} skipped`);
  
  const sample = await db.select({
    id: officialPublic.id,
    fullName: officialPublic.fullName,
    searchZips: officialPublic.searchZips,
    searchCities: officialPublic.searchCities,
  })
    .from(officialPublic)
    .limit(5);
  
  console.log("[Backfill] Sample results:");
  for (const s of sample) {
    console.log(`  ${s.fullName}: zips=${s.searchZips}, cities=${s.searchCities}`);
  }
}

backfillSearchFields()
  .then(() => {
    console.log("[Backfill] Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Backfill] Error:", err);
    process.exit(1);
  });
