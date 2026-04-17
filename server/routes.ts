import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { db } from "./db";
import { registerPrayerRoutes } from "./routes/prayerRoutes";
import { registerLegislativeRoutes } from "./routes/legislativeRoutes";
import { registerAiRoutes } from "./routes/aiRoutes";
import { registerMapRoutes } from "./routes/mapRoutes";
import { registerAdminRoutes } from "./routes/adminRoutes";
import {
  officialPublic,
  officialPrivate,
  updateOfficialPrivateSchema,
  DISTRICT_RANGES,
  type MergedOfficial,
  type OfficialPublic,
  type OfficialPrivate,
} from "@shared/schema";
import { eq, and, sql, or, ilike, inArray, isNull } from "drizzle-orm";
import { committees, committeeMemberships } from "@shared/schema";

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX";
type DistrictSourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE";

function createVacantOfficial(source: DistrictSourceType, district: number): MergedOfficial {
  const chamber = source === "TX_HOUSE" ? "TX House" 
    : source === "TX_SENATE" ? "TX Senate" 
    : "US House";
  
  const vacantId = `VACANT-${source}-${district}`;
  
  return {
    id: vacantId,
    personId: null,
    source,
    sourceMemberId: vacantId,
    chamber,
    district: String(district),
    fullName: "Vacant District",
    roleTitle: null,
    party: null,
    photoUrl: null,
    capitolAddress: null,
    capitolPhone: null,
    capitolRoom: null,
    districtAddresses: null,
    districtPhones: null,
    website: null,
    email: null,
    active: true,
    lastRefreshedAt: new Date(),
    searchZips: null,
    searchCities: null,
    isVacant: true,
    private: null,
  };
}

function fillVacancies(
  officials: MergedOfficial[], 
  source: DistrictSourceType
): MergedOfficial[] {
  const range = DISTRICT_RANGES[source];
  const districtMap = new Map<string, MergedOfficial>();
  
  for (const official of officials) {
    districtMap.set(official.district, { ...official, isVacant: false });
  }
  
  const result: MergedOfficial[] = [];
  
  for (let d = range.min; d <= range.max; d++) {
    const districtStr = String(d);
    if (districtMap.has(districtStr)) {
      result.push(districtMap.get(districtStr)!);
    } else {
      result.push(createVacantOfficial(source, d));
    }
  }
  
  return result;
}
import { maybeRunScheduledRefresh } from "./jobs/refreshOfficials";
import { startOfficialsRefreshScheduler } from "./jobs/scheduler";
import { maybeRunCommitteeRefresh } from "./jobs/refreshCommittees";
import { maybeRunOtherTxRefresh } from "./jobs/refreshOtherTexasOfficials";

type DistrictType = "tx_house" | "tx_senate" | "us_congress";

function sourceFromDistrictType(dt: DistrictType): "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" {
  switch (dt) {
    case "tx_house": return "TX_HOUSE";
    case "tx_senate": return "TX_SENATE";
    case "us_congress": return "US_HOUSE";
  }
}

function mergeOfficial(pub: OfficialPublic, priv: OfficialPrivate | null): MergedOfficial {
  const merged: MergedOfficial = { ...pub };
  if (priv) {
    merged.private = {
      personalPhone: priv.personalPhone,
      personalAddress: priv.personalAddress,
      spouseName: priv.spouseName,
      childrenNames: priv.childrenNames,
      birthday: priv.birthday,
      anniversary: priv.anniversary,
      notes: priv.notes,
      tags: priv.tags,
      updatedAt: priv.updatedAt,
      addressSource: priv.addressSource,
    };
  }
  return merged;
}

export async function registerRoutes(app: Express): Promise<Server> {
  maybeRunScheduledRefresh().catch(err => {
    console.error("[Startup] Failed to check scheduled refresh:", err);
  });

  maybeRunCommitteeRefresh().catch(err => {
    console.error("[Startup] Failed to check committee refresh:", err);
  });

  maybeRunOtherTxRefresh().catch(err => {
    console.error("[Startup] Failed to check Other TX officials seed:", err);
  });

  setTimeout(async () => {
    try {
      const { bulkFillHometowns } = await import("./scripts/bulkFillHometowns");
      console.log(`[Startup] Checking for new officials needing hometown lookup...`);
      const result = await bulkFillHometowns();
      console.log(`[Startup] Hometown check done: filled=${result.filled}, notFound=${result.notFound}, errors=${result.errors}`);
    } catch (err) {
      console.error(`[Startup] Hometown check failed:`, err instanceof Error ? err.message : err);
    }
  }, 90000);

  startOfficialsRefreshScheduler();

  registerPrayerRoutes(app);
  registerLegislativeRoutes(app);
  registerAiRoutes(app);
  registerMapRoutes(app);
  registerAdminRoutes(app);

  app.get("/api/officials", async (req, res) => {
    try {
      const { district_type, source, search, q, active } = req.query;
      
      const conditions = [];
      
      if (active !== "false") {
        conditions.push(eq(officialPublic.active, true));
      }
      
      let sourceFilter: SourceType | null = null;
      const isAllSources = source === "ALL";
      
      if (district_type && typeof district_type === "string") {
        const validTypes: DistrictType[] = ["tx_house", "tx_senate", "us_congress"];
        if (!validTypes.includes(district_type as DistrictType)) {
          return res.status(400).json({ error: "Invalid district_type" });
        }
        sourceFilter = sourceFromDistrictType(district_type as DistrictType);
        conditions.push(eq(officialPublic.source, sourceFilter));
      }
      
      if (source && typeof source === "string" && source !== "ALL") {
        const validSources = ["TX_HOUSE", "TX_SENATE", "US_HOUSE", "OTHER_TX"];
        if (!validSources.includes(source)) {
          return res.status(400).json({ error: "Invalid source" });
        }
        sourceFilter = source as SourceType;
        conditions.push(eq(officialPublic.source, sourceFilter));
      }
      
      const publicOfficials = await db.select()
        .from(officialPublic)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map(p => [p.officialPublicId, p]));
      
      let officials: MergedOfficial[] = publicOfficials.map(pub => 
        mergeOfficial(pub, privateMap.get(pub.id) || null)
      );
      
      // For source=ALL or no source filter, fill vacancies for all sources
      if (isAllSources || !sourceFilter) {
        // Combine officials from all sources with their vacancies
        const houseOfficials = fillVacancies(
          officials.filter(o => o.source === "TX_HOUSE"), 
          "TX_HOUSE"
        );
        const senateOfficials = fillVacancies(
          officials.filter(o => o.source === "TX_SENATE"), 
          "TX_SENATE"
        );
        const congressOfficials = fillVacancies(
          officials.filter(o => o.source === "US_HOUSE"), 
          "US_HOUSE"
        );
        officials = [...houseOfficials, ...senateOfficials, ...congressOfficials];
      } else if (sourceFilter && sourceFilter !== "OTHER_TX") {
        officials = fillVacancies(officials, sourceFilter);
      }
      
      // Multi-field search across name, district, addresses, party, email, website
      const searchTerm = search || q;
      if (searchTerm && typeof searchTerm === "string") {
        const term = searchTerm.toLowerCase();
        const beforeCount = officials.length;
        officials = officials.filter(o => {
          // Name match
          if (o.fullName.toLowerCase().includes(term)) return true;
          // District number match
          if (o.district.includes(term)) return true;
          // Vacancy match
          if (o.isVacant && "vacant".includes(term)) return true;
          // Party match
          if (o.party && o.party.toLowerCase().includes(term)) return true;
          // Capitol address match
          if (o.capitolAddress && o.capitolAddress.toLowerCase().includes(term)) return true;
          // District addresses match (JSON array)
          if (o.districtAddresses && Array.isArray(o.districtAddresses)) {
            for (const addr of o.districtAddresses) {
              if (typeof addr === "string" && addr.toLowerCase().includes(term)) return true;
            }
          }
          // Email match
          if (o.email && o.email.toLowerCase().includes(term)) return true;
          // Website match
          if (o.website && o.website.toLowerCase().includes(term)) return true;
          // Normalized search fields (faster for ZIP/city lookups)
          if (o.searchZips && o.searchZips.toLowerCase().includes(term)) return true;
          if (o.searchCities && o.searchCities.toLowerCase().includes(term)) return true;
          return false;
        });
        
        // Log search results for verification
        const afterCount = officials.length;
        const bySource: Record<string, number> = {};
        for (const o of officials) {
          bySource[o.source] = (bySource[o.source] || 0) + 1;
        }
        console.log(`[Search] q="${searchTerm}" | before=${beforeCount} | after=${afterCount} | bySource=${JSON.stringify(bySource)}`);
      }
      
      // Sorting: group by source (House, Senate, Congress), then by district asc, then by name
      const sourceOrder: Record<string, number> = {
        "TX_HOUSE": 1,
        "TX_SENATE": 2,
        "US_HOUSE": 3,
      };
      
      officials.sort((a, b) => {
        // First by source group (only matters for ALL source)
        if (isAllSources || !sourceFilter) {
          const orderA = sourceOrder[a.source] || 99;
          const orderB = sourceOrder[b.source] || 99;
          if (orderA !== orderB) return orderA - orderB;
        }
        // Then by district number
        const distA = parseInt(a.district, 10);
        const distB = parseInt(b.district, 10);
        if (!isNaN(distA) && !isNaN(distB)) {
          if (distA !== distB) return distA - distB;
        }
        // Then by last name
        const lastA = a.fullName.split(" ").pop() || "";
        const lastB = b.fullName.split(" ").pop() || "";
        return lastA.localeCompare(lastB);
      });
      
      const vacancyCount = officials.filter(o => o.isVacant).length;
      
      res.json({ officials, count: officials.length, vacancyCount });
    } catch (err) {
      console.error("[API] Error fetching officials:", err);
      res.status(500).json({ error: "Failed to fetch officials" });
    }
  });

  app.post("/api/officials/batch-backfill", async (req, res) => {
    try {
      const { officialIds } = req.body;
      
      if (!officialIds || !Array.isArray(officialIds)) {
        return res.status(400).json({ error: "officialIds array required" });
      }
      
      const results: Record<string, { hometown: string | null; addressSource: string | null }> = {};
      
      const privateRecords = await db.select({
        officialPublicId: officialPrivate.officialPublicId,
        personalAddress: officialPrivate.personalAddress,
        addressSource: officialPrivate.addressSource,
      }).from(officialPrivate);
      
      const privateMap = new Map(privateRecords.map(r => [r.officialPublicId, r]));
      
      for (const id of officialIds) {
        const priv = privateMap.get(id);
        results[id] = {
          hometown: priv?.personalAddress || null,
          addressSource: priv?.addressSource || null,
        };
      }
      
      res.json({ results });
    } catch (err) {
      console.error("[API] Batch backfill error:", err);
      res.status(500).json({ error: "Batch backfill failed" });
    }
  });

  app.get("/api/officials/backfill-audit", async (req, res) => {
    try {
      const allPublic = await db.select({
        id: officialPublic.id,
        fullName: officialPublic.fullName,
        source: officialPublic.source,
        district: officialPublic.district,
      }).from(officialPublic).where(eq(officialPublic.active, true));
      
      const allPrivate = await db.select().from(officialPrivate);
      const privMap = new Map(allPrivate.map(p => [p.officialPublicId, p]));
      
      const { isEffectivelyEmpty } = await import("./lib/backfillUtils");
      
      const audit = allPublic.map(pub => {
        const priv = privMap.get(pub.id);
        const address = priv?.personalAddress;
        const addrSource = priv?.addressSource || null;
        return {
          id: pub.id,
          name: pub.fullName,
          source: pub.source,
          district: pub.district,
          hasAddress: !isEffectivelyEmpty(address),
          address: address || null,
          addressSource: addrSource,
        };
      });
      
      const summary = {
        total: audit.length,
        withAddress: audit.filter(a => a.hasAddress).length,
        missingAddress: audit.filter(a => !a.hasAddress).length,
        bySource: {} as Record<string, { total: number; filled: number; missing: number }>,
        byAddressSource: {} as Record<string, number>,
      };
      
      for (const a of audit) {
        if (!summary.bySource[a.source]) {
          summary.bySource[a.source] = { total: 0, filled: 0, missing: 0 };
        }
        summary.bySource[a.source].total++;
        if (a.hasAddress) summary.bySource[a.source].filled++;
        else summary.bySource[a.source].missing++;
        
        const src = a.addressSource || "unknown";
        summary.byAddressSource[src] = (summary.byAddressSource[src] || 0) + 1;
      }
      
      res.json({ summary, officials: audit });
    } catch (err) {
      console.error("[API] Backfill audit error:", err);
      res.status(500).json({ error: "Audit failed" });
    }
  });

  // Get all officials with personal addresses (for map dots)
  // IMPORTANT: This route must come BEFORE /api/officials/:id to avoid matching "with-addresses" as an ID
  app.get("/api/officials/with-addresses", async (req, res) => {
    try {
      const results = await db
        .select({
          officialId: officialPublic.id,
          fullName: officialPublic.fullName,
          source: officialPublic.source,
          personalAddress: officialPrivate.personalAddress,
        })
        .from(officialPublic)
        .innerJoin(officialPrivate, eq(officialPublic.id, officialPrivate.officialPublicId))
        .where(
          and(
            eq(officialPublic.active, true),
            sql`${officialPrivate.personalAddress} IS NOT NULL AND ${officialPrivate.personalAddress} != ''`
          )
        );
      
      res.json({ 
        addresses: results.map(r => ({
          officialId: r.officialId,
          officialName: r.fullName,
          source: r.source,
          personalAddress: r.personalAddress,
        }))
      });
    } catch (err) {
      console.error("[API] Error fetching addresses:", err);
      res.status(500).json({ error: "Failed to fetch addresses" });
    }
  });

  app.get("/api/officials/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const vacantMatch = id.match(/^VACANT-(TX_HOUSE|TX_SENATE|US_HOUSE)-(\d+)$/);
      if (vacantMatch) {
        const source = vacantMatch[1] as DistrictSourceType;
        const district = parseInt(vacantMatch[2], 10);
        const vacant = createVacantOfficial(source, district);
        return res.json({ official: vacant });
      }
      
      // Handle SOURCE:DISTRICT format (e.g., TX_HOUSE:1)
      const sourceDistrictMatch = id.match(/^(TX_HOUSE|TX_SENATE|US_HOUSE):(\d+)$/);
      if (sourceDistrictMatch) {
        const source = sourceDistrictMatch[1] as DistrictSourceType;
        const district = sourceDistrictMatch[2];
        
        const [pub] = await db.select()
          .from(officialPublic)
          .where(and(
            eq(officialPublic.source, source),
            eq(officialPublic.district, district),
            eq(officialPublic.active, true)
          ))
          .limit(1);
        
        if (!pub) {
          // Return vacancy if no official found
          const vacant = createVacantOfficial(source, parseInt(district, 10));
          return res.json({ official: vacant });
        }
        
        const [priv] = await db.select()
          .from(officialPrivate)
          .where(eq(officialPrivate.officialPublicId, pub.id))
          .limit(1);
        
        const official = mergeOfficial(pub, priv || null);
        official.isVacant = false;
        return res.json({ official });
      }
      
      const [pub] = await db.select()
        .from(officialPublic)
        .where(eq(officialPublic.id, id))
        .limit(1);
      
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      
      const [priv] = await db.select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, id))
        .limit(1);
      
      const official = mergeOfficial(pub, priv || null);
      official.isVacant = false;
      res.json({ official });
    } catch (err) {
      console.error("[API] Error fetching official:", err);
      res.status(500).json({ error: "Failed to fetch official" });
    }
  });

  app.get("/api/officials/by-district", async (req, res) => {
    try {
      const { district_type, district_number } = req.query;
      
      if (!district_type || !district_number) {
        return res.status(400).json({ error: "district_type and district_number are required" });
      }
      
      const validTypes: DistrictType[] = ["tx_house", "tx_senate", "us_congress"];
      if (!validTypes.includes(district_type as DistrictType)) {
        return res.status(400).json({ error: "Invalid district_type" });
      }
      
      const distNum = String(district_number);
      const source = sourceFromDistrictType(district_type as DistrictType);
      
      const [pub] = await db.select()
        .from(officialPublic)
        .where(and(
          eq(officialPublic.source, source),
          eq(officialPublic.district, distNum),
          eq(officialPublic.active, true)
        ))
        .limit(1);
      
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      
      const [priv] = await db.select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, pub.id))
        .limit(1);
      
      const official = mergeOfficial(pub, priv || null);
      res.json({ official });
    } catch (err) {
      console.error("[API] Error fetching official by district:", err);
      res.status(500).json({ error: "Failed to fetch official" });
    }
  });

  app.post("/api/officials/by-districts", async (req, res) => {
    try {
      const { districts } = req.body;
      
      if (!Array.isArray(districts) || districts.length === 0) {
        return res.status(400).json({ error: "districts array is required" });
      }
      
      const results: MergedOfficial[] = [];
      
      for (const dist of districts) {
        const { source, districtNumber } = dist;
        if (!source || districtNumber === undefined) continue;
        
        const [pub] = await db.select()
          .from(officialPublic)
          .where(and(
            eq(officialPublic.source, source),
            eq(officialPublic.district, String(districtNumber)),
            eq(officialPublic.active, true)
          ))
          .limit(1);
        
        if (pub) {
          const [priv] = await db.select()
            .from(officialPrivate)
            .where(eq(officialPrivate.officialPublicId, pub.id))
            .limit(1);
          
          results.push(mergeOfficial(pub, priv || null));
        } else {
          results.push(createVacantOfficial(source, districtNumber));
        }
      }
      
      res.json({ officials: results });
    } catch (err) {
      console.error("[API] Error fetching officials by districts:", err);
      res.status(500).json({ error: "Failed to fetch officials" });
    }
  });

  app.patch("/api/officials/:id/private", async (req, res) => {
    try {
      const { id } = req.params;
      
      const [pub] = await db.select()
        .from(officialPublic)
        .where(eq(officialPublic.id, id))
        .limit(1);
      
      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }
      
      const parseResult = updateOfficialPrivateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request body", details: parseResult.error.issues });
      }
      
      const updateData = parseResult.data;
      
      const [existing] = await db.select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, id))
        .limit(1);
      
      if (existing) {
        await db.update(officialPrivate)
          .set({
            ...updateData,
            addressSource: "user",
            updatedAt: new Date(),
          })
          .where(eq(officialPrivate.id, existing.id));
      } else {
        let finalUpdateData = { ...updateData };
        let autoFilled = false;
        
        const addressIsEmpty = !updateData.personalAddress || 
          updateData.personalAddress.trim().length === 0;
        
        if (addressIsEmpty && pub.fullName) {
          console.log(`[API] Auto-fill: Looking up hometown for new private notes record for "${pub.fullName}"`);
          try {
            const { lookupHometownFromTexasTribune } = await import("./lib/texasTribuneLookup");
            const result = await lookupHometownFromTexasTribune(pub.fullName);
            if (result.success && result.hometown) {
              console.log(`[API] Auto-fill: Setting personalAddress to "${result.hometown}" for ${pub.fullName}`);
              finalUpdateData.personalAddress = result.hometown;
              autoFilled = true;
            } else {
              console.log(`[API] Auto-fill: No hometown found for ${pub.fullName}`);
            }
          } catch (error) {
            console.error(`[API] Auto-fill: Error looking up hometown:`, error);
          }
        }
        
        await db.insert(officialPrivate).values({
          officialPublicId: id,
          ...finalUpdateData,
          addressSource: autoFilled ? "tribune" : "user",
          updatedAt: new Date(),
        });
      }
      
      const [updatedPriv] = await db.select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, id))
        .limit(1);
      
      const official = mergeOfficial(pub, updatedPriv);
      res.json({ official });
    } catch (err) {
      console.error("[API] Error updating private data:", err);
      res.status(500).json({ error: "Failed to update private data" });
    }
  });


  app.get("/api/stats", async (_req, res) => {
    try {
      const counts = await db.select({
        source: officialPublic.source,
        count: sql<number>`count(*)::int`,
      })
        .from(officialPublic)
        .where(eq(officialPublic.active, true))
        .groupBy(officialPublic.source);
      
      const stats: Record<string, number> = {
        tx_house: 0,
        tx_senate: 0,
        us_congress: 0,
        total: 0,
      };
      
      for (const { source, count } of counts) {
        if (source === "TX_HOUSE") stats.tx_house = count;
        if (source === "TX_SENATE") stats.tx_senate = count;
        if (source === "US_HOUSE") stats.us_congress = count;
        stats.total += count;
      }
      
      if (stats.total === 0) {
        return res.json({
          tx_house: 150,
          tx_senate: 31,
          us_congress: 38,
          total: 219,
          source: "fallback",
        });
      }
      
      res.json(stats);
    } catch (err) {
      console.error("[API] Error fetching stats:", err);
      res.json({
        tx_house: 150,
        tx_senate: 31,
        us_congress: 38,
        total: 219,
        source: "fallback",
      });
    }
  });


  // Committee API endpoints
  app.get("/api/committees", async (req, res) => {
    try {
      const chamber = req.query.chamber as string | undefined;
      
      let query = db.select().from(committees);
      
      if (chamber === "TX_HOUSE" || chamber === "TX_SENATE") {
        query = query.where(eq(committees.chamber, chamber)) as typeof query;
      }
      
      const allCommittees = await query.orderBy(committees.sortOrder, committees.name);
      
      const parentCommittees = allCommittees.filter(c => !c.parentCommitteeId);
      const subcommittees = allCommittees.filter(c => c.parentCommitteeId);
      
      const result = parentCommittees.map(parent => ({
        ...parent,
        subcommittees: subcommittees.filter(sub => sub.parentCommitteeId === parent.id),
      }));
      
      res.json(result);
    } catch (err) {
      console.error("[API] Error fetching committees:", err);
      res.status(500).json({ error: "Failed to fetch committees" });
    }
  });

  app.get("/api/committees/:committeeId", async (req, res) => {
    try {
      const { committeeId } = req.params;
      
      const committee = await db
        .select()
        .from(committees)
        .where(eq(committees.id, committeeId))
        .limit(1);
      
      if (committee.length === 0) {
        return res.status(404).json({ error: "Committee not found" });
      }
      
      const members = await db
        .select({
          id: committeeMemberships.id,
          memberName: committeeMemberships.memberName,
          roleTitle: committeeMemberships.roleTitle,
          sortOrder: committeeMemberships.sortOrder,
          officialPublicId: committeeMemberships.officialPublicId,
          officialName: officialPublic.fullName,
          officialDistrict: officialPublic.district,
          officialParty: officialPublic.party,
          officialPhotoUrl: officialPublic.photoUrl,
        })
        .from(committeeMemberships)
        .leftJoin(officialPublic, eq(committeeMemberships.officialPublicId, officialPublic.id))
        .where(eq(committeeMemberships.committeeId, committeeId))
        .orderBy(committeeMemberships.sortOrder);
      
      res.json({
        committee: committee[0],
        members,
      });
    } catch (err) {
      console.error("[API] Error fetching committee details:", err);
      res.status(500).json({ error: "Failed to fetch committee details" });
    }
  });

  app.get("/api/officials/:officialId/committees", async (req, res) => {
    try {
      let { officialId } = req.params;

      // Resolve SOURCE:DISTRICT format (e.g., "TX_HOUSE:5") to UUID
      const sourceDistrictMatch = officialId.match(/^(TX_HOUSE|TX_SENATE|US_HOUSE):(\d+)$/);
      if (sourceDistrictMatch) {
        const source = sourceDistrictMatch[1] as DistrictSourceType;
        const district = sourceDistrictMatch[2];
        const [pub] = await db.select({ id: officialPublic.id })
          .from(officialPublic)
          .where(and(
            eq(officialPublic.source, source),
            eq(officialPublic.district, district),
            eq(officialPublic.active, true)
          ))
          .limit(1);
        if (pub) officialId = pub.id;
      }

      const memberships = await db
        .select({
          committeeId: committees.id,
          committeeName: committees.name,
          chamber: committees.chamber,
          roleTitle: committeeMemberships.roleTitle,
        })
        .from(committeeMemberships)
        .innerJoin(committees, eq(committeeMemberships.committeeId, committees.id))
        .where(eq(committeeMemberships.officialPublicId, officialId))
        .orderBy(committees.name);

      res.json(memberships);
    } catch (err) {
      console.error("[API] Error fetching official committees:", err);
      res.status(500).json({ error: "Failed to fetch official committees" });
    }
  });



  app.get("/api/other-tx-officials", async (req, res) => {
    try {
      const { active, grouped } = req.query;

      const conditions = [eq(officialPublic.source, "OTHER_TX")];

      if (active !== "false") {
        conditions.push(eq(officialPublic.active, true));
      }

      const officials = await db.select().from(officialPublic).where(and(...conditions));

      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map((p) => [p.officialPublicId, p]));

      const merged: MergedOfficial[] = officials.map((pub) =>
        mergeOfficial(pub, privateMap.get(pub.id) || null)
      );

      if (grouped === "true") {
        const groupedOfficials = {
          executive: [] as MergedOfficial[],
          secretaryOfState: [] as MergedOfficial[],
          supremeCourt: [] as MergedOfficial[],
          criminalAppeals: [] as MergedOfficial[],
        };

        for (const official of merged) {
          const role = official.roleTitle || "";
          if (role.includes("Supreme Court")) {
            groupedOfficials.supremeCourt.push(official);
          } else if (role.includes("Criminal Appeals")) {
            groupedOfficials.criminalAppeals.push(official);
          } else if (role.includes("Secretary of State")) {
            groupedOfficials.secretaryOfState.push(official);
          } else {
            groupedOfficials.executive.push(official);
          }
        }

        const extractPlace = (role: string): number => {
          const match = role.match(/Place (\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };

        groupedOfficials.supremeCourt.sort(
          (a, b) => extractPlace(a.roleTitle || "") - extractPlace(b.roleTitle || "")
        );
        groupedOfficials.criminalAppeals.sort(
          (a, b) => extractPlace(a.roleTitle || "") - extractPlace(b.roleTitle || "")
        );

        res.json({
          grouped: groupedOfficials,
          counts: {
            executive: groupedOfficials.executive.length,
            secretaryOfState: groupedOfficials.secretaryOfState.length,
            supremeCourt: groupedOfficials.supremeCourt.length,
            criminalAppeals: groupedOfficials.criminalAppeals.length,
            total: merged.length,
          },
        });
        return;
      }

      res.json(merged);
    } catch (err) {
      console.error("[API] Error fetching other TX officials:", err);
      res.status(500).json({ error: "Failed to fetch other TX officials" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
