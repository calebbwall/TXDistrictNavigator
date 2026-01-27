import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { txHouseGeoJSON, txSenateGeoJSON, usCongressGeoJSON, txHouseGeoJSONFull, txSenateGeoJSONFull, usCongressGeoJSONFull } from "./data/geojson";
import { db } from "./db";
import { 
  officialPublic, 
  officialPrivate, 
  refreshJobLog,
  updateOfficialPrivateSchema,
  DISTRICT_RANGES,
  type MergedOfficial,
  type OfficialPublic,
  type OfficialPrivate 
} from "@shared/schema";
import { desc } from "drizzle-orm";
import { eq, and, sql, or, ilike } from "drizzle-orm";
import * as turf from "@turf/turf";
import booleanIntersects from "@turf/boolean-intersects";
import type { Feature, FeatureCollection, Polygon } from "geojson";

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
import { 
  maybeRunScheduledRefresh, 
  checkAndRefreshIfChanged, 
  getAllRefreshStates,
  getIsRefreshing,
  type SmartRefreshResult 
} from "./jobs/refreshOfficials";
import { startOfficialsRefreshScheduler, getSchedulerStatus } from "./jobs/scheduler";
import { 
  checkAndRefreshGeoJSONIfChanged, 
  getGeoJSONRefreshStates,
  getIsRefreshingGeoJSON,
} from "./jobs/refreshGeoJSON";
import {
  checkAndRefreshCommitteesIfChanged,
  getAllCommitteeRefreshStates,
  getIsRefreshingCommittees,
} from "./jobs/refreshCommittees";
import { lookupPlace, lookupPlaceCandidates, getCacheStats, type PlaceResult } from "./geonames";
import { committees, committeeMemberships } from "@shared/schema";

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
    };
  }
  return merged;
}

export async function registerRoutes(app: Express): Promise<Server> {
  maybeRunScheduledRefresh().catch(err => {
    console.error("[Startup] Failed to check scheduled refresh:", err);
  });

  startOfficialsRefreshScheduler();

  app.get("/api/geojson/tx_house", (_req, res) => {
    res.json(txHouseGeoJSON);
  });

  app.get("/api/geojson/tx_senate", (_req, res) => {
    res.json(txSenateGeoJSON);
  });

  app.get("/api/geojson/us_congress", (_req, res) => {
    res.json(usCongressGeoJSON);
  });

  app.get("/api/geojson/tx_house_full", (_req, res) => {
    res.json(txHouseGeoJSONFull);
  });

  app.get("/api/geojson/tx_senate_full", (_req, res) => {
    res.json(txSenateGeoJSONFull);
  });

  app.get("/api/geojson/us_congress_full", (_req, res) => {
    res.json(usCongressGeoJSONFull);
  });

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
            updatedAt: new Date(),
          })
          .where(eq(officialPrivate.id, existing.id));
      } else {
        await db.insert(officialPrivate).values({
          officialPublicId: id,
          ...updateData,
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

  app.post("/api/refresh", async (req, res) => {
    try {
      const { refreshAllOfficials } = await import("./jobs/refreshOfficials");
      await refreshAllOfficials();
      res.json({ success: true, message: "Refresh completed" });
    } catch (err) {
      console.error("[API] Error during manual refresh:", err);
      res.status(500).json({ error: "Refresh failed" });
    }
  });

  app.post("/admin/refresh/officials", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ 
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable" 
        });
      }
      
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      
      if (getIsRefreshing()) {
        return res.status(409).json({ 
          error: "Refresh in progress",
          message: "A refresh is already running. Try again later." 
        });
      }
      
      const force = req.query.force === "true";
      
      console.log(`[Admin] Manual refresh triggered (force=${force})`);
      
      const result = await checkAndRefreshIfChanged(force);
      
      res.json({
        success: true,
        force,
        sourcesChecked: result.sourcesChecked,
        sourcesChanged: result.sourcesChanged,
        sourcesRefreshed: result.sourcesRefreshed,
        errors: result.errors,
        durationMs: result.durationMs,
      });
      
    } catch (err) {
      console.error("[Admin] Refresh error:", err);
      res.status(500).json({ error: "Refresh failed", details: String(err) });
    }
  });

  app.get("/admin/refresh/status", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      
      const refreshStates = await getAllRefreshStates();
      const geoJSONStates = await getGeoJSONRefreshStates();
      const committeeStates = await getAllCommitteeRefreshStates();
      const schedulerStatus = getSchedulerStatus();
      const isRefreshing = getIsRefreshing();
      const isRefreshingGeoJSON = getIsRefreshingGeoJSON();
      const isRefreshingCommittees = getIsRefreshingCommittees();
      
      res.json({
        isRefreshing,
        isRefreshingGeoJSON,
        isRefreshingCommittees,
        scheduler: schedulerStatus,
        officialsSources: refreshStates,
        geoJSONSources: geoJSONStates,
        committeeSources: committeeStates,
      });
      
    } catch (err) {
      console.error("[Admin] Status error:", err);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  app.post("/admin/refresh/geojson", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ 
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable" 
        });
      }
      
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      
      if (getIsRefreshingGeoJSON()) {
        return res.status(409).json({ 
          error: "Refresh in progress",
          message: "A GeoJSON refresh is already running. Try again later." 
        });
      }
      
      const force = req.query.force === "true";
      
      console.log(`[Admin] Manual GeoJSON refresh triggered (force=${force})`);
      
      const result = await checkAndRefreshGeoJSONIfChanged(force);
      
      res.json({
        success: true,
        force,
        sourcesChecked: result.sourcesChecked,
        sourcesChanged: result.sourcesChanged,
        sourcesRefreshed: result.sourcesRefreshed,
        errors: result.errors,
        durationMs: result.durationMs,
      });
      
    } catch (err) {
      console.error("[Admin] GeoJSON refresh error:", err);
      res.status(500).json({ error: "Refresh failed", details: String(err) });
    }
  });

  app.get("/api/admin/geojson/source-debug", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ 
          error: "Admin refresh not configured",
          message: "Set ADMIN_REFRESH_TOKEN environment variable" 
        });
      }
      
      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }
      
      const sources = [
        {
          name: "TX_HOUSE",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        },
        {
          name: "TX_SENATE",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_Senate_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        },
        {
          name: "US_CONGRESS",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_US_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1"
        }
      ];
      
      const results = await Promise.all(sources.map(async (source) => {
        try {
          const response = await fetch(source.url);
          const data = await response.json() as { features?: Array<{ properties?: Record<string, unknown> }> };
          const sampleProps = data.features?.[0]?.properties || {};
          
          const countUrl = source.url.replace("resultRecordCount=1", "returnCountOnly=true");
          const countResponse = await fetch(countUrl);
          const countData = await countResponse.json() as { count?: number };
          
          return {
            name: source.name,
            featureCount: countData.count,
            samplePropertyKeys: Object.keys(sampleProps),
            sampleDistrictValue: sampleProps.DIST_NBR,
            sampleRepName: sampleProps.REP_NM,
            status: "ok"
          };
        } catch (err) {
          return {
            name: source.name,
            status: "error",
            error: String(err)
          };
        }
      }));
      
      res.json({ sources: results });
      
    } catch (err) {
      console.error("[Admin] GeoJSON source debug error:", err);
      res.status(500).json({ error: "Debug failed", details: String(err) });
    }
  });

  app.get("/api/admin/officials-counts", async (_req, res) => {
    try {
      const counts = await db.select({
        source: officialPublic.source,
        count: sql<number>`count(*)::int`,
      })
        .from(officialPublic)
        .where(eq(officialPublic.active, true))
        .groupBy(officialPublic.source);
      
      const countsBySource: Record<string, number> = {
        TX_HOUSE: 0,
        TX_SENATE: 0,
        US_HOUSE: 0,
      };
      
      for (const { source, count } of counts) {
        countsBySource[source] = count;
      }
      
      const lastRefreshJobs = await db.select()
        .from(refreshJobLog)
        .orderBy(desc(refreshJobLog.startedAt))
        .limit(5);
      
      const lastSuccessfulRefresh = lastRefreshJobs.find(j => j.status === 'success');
      const lastFailedRefresh = lastRefreshJobs.find(j => j.status === 'failed' || j.status === 'aborted');
      
      const result = {
        counts: countsBySource,
        total: countsBySource.TX_HOUSE + countsBySource.TX_SENATE + countsBySource.US_HOUSE,
        lastRefresh: lastSuccessfulRefresh ? {
          source: lastSuccessfulRefresh.source,
          completedAt: lastSuccessfulRefresh.completedAt,
          parsedCount: lastSuccessfulRefresh.parsedCount,
          upsertedCount: lastSuccessfulRefresh.upsertedCount,
          durationMs: lastSuccessfulRefresh.durationMs,
        } : null,
        lastError: lastFailedRefresh ? {
          source: lastFailedRefresh.source,
          startedAt: lastFailedRefresh.startedAt,
          status: lastFailedRefresh.status,
          errorMessage: lastFailedRefresh.errorMessage,
        } : null,
        recentJobs: lastRefreshJobs.map(j => ({
          source: j.source,
          status: j.status,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
          errorMessage: j.errorMessage,
        })),
      };
      
      console.log("[API] Admin officials counts:", result.counts);
      
      res.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.json(result);
    } catch (err) {
      console.error("[API] Error fetching admin counts:", err);
      res.status(500).json({ error: "Failed to fetch counts" });
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

  // Cache parsed GeoJSON feature collections for spatial queries
  let cachedGeoJSON: {
    tx_house: FeatureCollection | null;
    tx_senate: FeatureCollection | null;
    us_congress: FeatureCollection | null;
  } = {
    tx_house: null,
    tx_senate: null,
    us_congress: null,
  };

  function getGeoJSONForOverlay(overlayType: string): FeatureCollection | null {
    if (overlayType === "house" || overlayType === "tx_house") {
      if (!cachedGeoJSON.tx_house) {
        cachedGeoJSON.tx_house = txHouseGeoJSON as unknown as FeatureCollection;
      }
      return cachedGeoJSON.tx_house;
    }
    if (overlayType === "senate" || overlayType === "tx_senate") {
      if (!cachedGeoJSON.tx_senate) {
        cachedGeoJSON.tx_senate = txSenateGeoJSON as unknown as FeatureCollection;
      }
      return cachedGeoJSON.tx_senate;
    }
    if (overlayType === "congress" || overlayType === "us_congress") {
      if (!cachedGeoJSON.us_congress) {
        cachedGeoJSON.us_congress = usCongressGeoJSON as unknown as FeatureCollection;
      }
      return cachedGeoJSON.us_congress;
    }
    return null;
  }

  function getSourceFromOverlay(overlay: string): SourceType {
    if (overlay === "house" || overlay === "tx_house") return "TX_HOUSE";
    if (overlay === "senate" || overlay === "tx_senate") return "TX_SENATE";
    return "US_HOUSE";
  }

  function getDistrictNumber(feature: Feature): number | null {
    const props = feature.properties || {};
    const districtNum = props.district || props.SLDUST || props.SLDLST || props.CD;
    return districtNum ? parseInt(String(districtNum)) : null;
  }

  app.get("/api/lookup/place", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      
      if (q.length < 2) {
        return res.status(400).json({ error: "Query too short (min 2 characters)" });
      }

      const { result, fromCache, error } = await lookupPlace(q);

      if (error) {
        console.log(`[Lookup] Place error: ${error}`);
        return res.status(500).json({ error });
      }

      if (!result) {
        console.log(`[Lookup] No Texas place found for "${q}"`);
        return res.status(404).json({ message: "No Texas place found" });
      }

      console.log(`[Lookup] Place: "${q}" → ${result.name} (${result.lat}, ${result.lng}) [cache=${fromCache}]`);
      res.json({ ...result, fromCache });
    } catch (err) {
      console.error("[Lookup] Place error:", err);
      res.status(500).json({ error: "Place lookup failed" });
    }
  });

  app.get("/api/lookup/place/candidates", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const maxResults = Math.min(parseInt(String(req.query.max || "5"), 10) || 5, 10);
      
      if (q.length < 2) {
        return res.status(400).json({ error: "Query too short (min 2 characters)" });
      }

      const { results, fromCache, error } = await lookupPlaceCandidates(q, maxResults);

      if (error) {
        console.log(`[Lookup] Place candidates error: ${error}`);
        return res.status(500).json({ error });
      }

      console.log(`[Lookup] Place candidates: "${q}" → ${results.length} results [cache=${fromCache}]`);
      res.json({ results, fromCache });
    } catch (err) {
      console.error("[Lookup] Place candidates error:", err);
      res.status(500).json({ error: "Place lookup failed" });
    }
  });

  app.post("/api/lookup/districts-at-point", (req, res) => {
    try {
      const { lat, lng } = req.body;

      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ error: "lat and lng (numbers) are required" });
      }

      console.log(`[Lookup] Districts at point: (${lat}, ${lng})`);

      const point = turf.point([lng, lat]);
      const hits: { source: SourceType; districtNumber: number }[] = [];

      const overlayMappings: Array<{ overlay: "house" | "senate" | "congress"; source: SourceType }> = [
        { overlay: "house", source: "TX_HOUSE" },
        { overlay: "senate", source: "TX_SENATE" },
        { overlay: "congress", source: "US_HOUSE" },
      ];

      for (const { overlay, source } of overlayMappings) {
        const featureCollection = getGeoJSONForOverlay(overlay);
        if (!featureCollection || !featureCollection.features) continue;

        for (const feature of featureCollection.features) {
          try {
            if (turf.booleanPointInPolygon(point, feature as Feature<Polygon>)) {
              const districtNumber = getDistrictNumber(feature as Feature);
              if (districtNumber !== null) {
                hits.push({ source, districtNumber });
                break;
              }
            }
          } catch {
          }
        }
      }

      console.log(`[Lookup] Districts found: ${hits.map(h => `${h.source}:${h.districtNumber}`).join(", ") || "none"}`);
      res.json({ hits, lat, lng });
    } catch (err) {
      console.error("[Lookup] Districts-at-point error:", err);
      res.status(500).json({ error: "Failed to find districts at point" });
    }
  });

  app.get("/api/lookup/cache-stats", (req, res) => {
    res.json(getCacheStats());
  });

  // Committee API endpoints
  app.get("/api/committees", async (req, res) => {
    try {
      const chamber = req.query.chamber as string | undefined;
      
      let query = db.select().from(committees);
      
      if (chamber === "TX_HOUSE" || chamber === "TX_SENATE") {
        query = query.where(eq(committees.chamber, chamber)) as typeof query;
      }
      
      const result = await query.orderBy(committees.name);
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
      const { officialId } = req.params;
      
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

  app.post("/admin/refresh/committees", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(500).json({ error: "ADMIN_REFRESH_TOKEN not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      const force = req.query.force === "true";
      
      if (getIsRefreshingCommittees()) {
        return res.status(409).json({ error: "Committees refresh already in progress" });
      }
      
      console.log(`[Admin] Committees refresh triggered (force=${force})`);
      const result = await checkAndRefreshCommitteesIfChanged(force);
      
      res.json({
        success: true,
        results: result.results,
        durationMs: result.durationMs,
      });
    } catch (err) {
      console.error("[Admin] Committees refresh error:", err);
      res.status(500).json({ error: "Committees refresh failed" });
    }
  });

  // Other Texas Officials endpoints
  app.get("/api/other-tx-officials", async (req, res) => {
    try {
      const { active, grouped } = req.query;
      
      const conditions = [eq(officialPublic.source, "OTHER_TX")];
      
      if (active !== "false") {
        conditions.push(eq(officialPublic.active, true));
      }
      
      const officials = await db.select()
        .from(officialPublic)
        .where(and(...conditions));
      
      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map(p => [p.officialPublicId, p]));
      
      const merged: MergedOfficial[] = officials.map(pub => 
        mergeOfficial(pub, privateMap.get(pub.id) || null)
      );
      
      // Return grouped by category if requested
      if (grouped === "true") {
        const groupedOfficials = {
          executive: [] as MergedOfficial[],
          secretaryOfState: [] as MergedOfficial[],
          supremeCourt: [] as MergedOfficial[],
          criminalAppeals: [] as MergedOfficial[],
        };
        
        for (const official of merged) {
          const role = official.roleTitle || '';
          if (role.includes('Supreme Court')) {
            groupedOfficials.supremeCourt.push(official);
          } else if (role.includes('Criminal Appeals')) {
            groupedOfficials.criminalAppeals.push(official);
          } else if (role.includes('Secretary of State')) {
            groupedOfficials.secretaryOfState.push(official);
          } else {
            groupedOfficials.executive.push(official);
          }
        }
        
        // Sort Supreme Court and Criminal Appeals by place number
        const extractPlace = (role: string): number => {
          const match = role.match(/Place (\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };
        
        groupedOfficials.supremeCourt.sort((a, b) => 
          extractPlace(a.roleTitle || '') - extractPlace(b.roleTitle || '')
        );
        groupedOfficials.criminalAppeals.sort((a, b) => 
          extractPlace(a.roleTitle || '') - extractPlace(b.roleTitle || '')
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

  app.post("/admin/refresh/other-tx-officials", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(500).json({ error: "ADMIN_REFRESH_TOKEN not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      const force = req.query.force === "true";
      
      console.log(`[Admin] Other TX Officials refresh triggered (force=${force})`);
      
      const { refreshOtherTexasOfficials } = await import("./jobs/refreshOtherTexasOfficials");
      const result = await refreshOtherTexasOfficials({ force });
      
      res.json({
        success: result.success,
        fingerprint: result.fingerprint,
        changed: result.changed,
        upsertedCount: result.upsertedCount,
        deactivatedCount: result.deactivatedCount,
        totalOfficials: result.totalOfficials,
        breakdown: result.breakdown,
        sources: result.sources,
        error: result.error,
      });
    } catch (err) {
      console.error("[Admin] Other TX Officials refresh error:", err);
      res.status(500).json({ error: "Other TX Officials refresh failed" });
    }
  });

  // Admin endpoint: Create explicit person link (identity override)
  app.post("/admin/person/link", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      const { officialPublicId, personId } = req.body;
      
      if (!officialPublicId || !personId) {
        return res.status(400).json({ error: "officialPublicId and personId are required" });
      }
      
      // Verify official exists
      const official = await db
        .select()
        .from(officialPublic)
        .where(eq(officialPublic.id, officialPublicId))
        .limit(1);
      
      if (official.length === 0) {
        return res.status(404).json({ error: "Official not found" });
      }
      
      // Verify person exists
      const { persons } = await import("@shared/schema");
      const person = await db
        .select()
        .from(persons)
        .where(eq(persons.id, personId))
        .limit(1);
      
      if (person.length === 0) {
        return res.status(404).json({ error: "Person not found" });
      }
      
      const { setExplicitPersonLink } = await import("./lib/identityResolver");
      const result = await setExplicitPersonLink(officialPublicId, personId);
      
      console.log(`[Admin] Created explicit person link: official ${officialPublicId} -> person ${personId}`);
      
      res.json({
        success: true,
        link: result,
        official: official[0],
        person: person[0],
      });
    } catch (err) {
      console.error("[Admin] Person link error:", err);
      res.status(500).json({ error: "Failed to create person link" });
    }
  });

  // Admin endpoint: Get comprehensive system status
  app.get("/admin/status", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];
      
      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      
      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }
      
      // Get identity stats
      const { getIdentityStats, getAllExplicitPersonLinks } = await import("./lib/identityResolver");
      const identityStats = await getIdentityStats();
      const explicitLinks = await getAllExplicitPersonLinks();
      
      // Get refresh states for all data sources
      const officialsStates = await getAllRefreshStates();
      const geojsonStates = await getGeoJSONRefreshStates();
      const committeesStates = await getAllCommitteeRefreshStates();
      
      // Get scheduler status
      const schedulerStatus = getSchedulerStatus();
      
      // Format response
      const datasets = {
        officials: {
          TX_HOUSE: officialsStates.find(s => s.source === "TX_HOUSE") || null,
          TX_SENATE: officialsStates.find(s => s.source === "TX_SENATE") || null,
          US_HOUSE: officialsStates.find(s => s.source === "US_HOUSE") || null,
          isRefreshing: getIsRefreshing(),
        },
        other_tx_officials: {
          note: "Static data source - no refresh state tracking",
        },
        geojson: {
          states: geojsonStates,
          isRefreshing: getIsRefreshingGeoJSON(),
        },
        committees: {
          states: committeesStates,
          isRefreshing: getIsRefreshingCommittees(),
        },
      };
      
      res.json({
        timestamp: new Date().toISOString(),
        scheduler: schedulerStatus,
        datasets,
        identity: {
          ...identityStats,
          explicitLinksDetails: explicitLinks,
        },
      });
    } catch (err) {
      console.error("[Admin] Status error:", err);
      res.status(500).json({ error: "Failed to get system status" });
    }
  });

  app.post("/api/map/area-hits", (req, res) => {
    try {
      const { geometry, overlays } = req.body;

      if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
        return res.status(400).json({ error: "Invalid geometry: must be a Polygon" });
      }

      if (!overlays || typeof overlays !== "object") {
        return res.status(400).json({ error: "overlays object is required" });
      }

      console.log("[API] /api/map/area-hits - geometry points:", geometry.coordinates[0]?.length);
      console.log("[API] /api/map/area-hits - overlays:", JSON.stringify(overlays));

      const drawnPolygon = turf.polygon(geometry.coordinates);
      const hits: { source: SourceType; districtNumber: number }[] = [];
      const hitDebug: Record<string, number> = {};

      const overlayTypes = ["house", "senate", "congress"] as const;

      for (const overlayType of overlayTypes) {
        if (!overlays[overlayType]) continue;

        const featureCollection = getGeoJSONForOverlay(overlayType);
        if (!featureCollection || !featureCollection.features) {
          console.log(`[API] No GeoJSON for overlay: ${overlayType}`);
          continue;
        }

        let hitCount = 0;
        for (const feature of featureCollection.features) {
          try {
            if (booleanIntersects(drawnPolygon, feature as Feature)) {
              const districtNumber = getDistrictNumber(feature as Feature);
              if (districtNumber !== null) {
                const source = getSourceFromOverlay(overlayType);
                const alreadyExists = hits.some(
                  (h) => h.source === source && h.districtNumber === districtNumber
                );
                if (!alreadyExists) {
                  hits.push({ source, districtNumber });
                  hitCount++;
                }
              }
            }
          } catch (intersectErr) {
            // Skip invalid geometries
          }
        }
        hitDebug[overlayType] = hitCount;
      }

      console.log("[API] /api/map/area-hits - hits per overlay:", JSON.stringify(hitDebug));
      console.log("[API] /api/map/area-hits - total hits:", hits.length);

      res.json({ hits });
    } catch (err) {
      console.error("[API] Error in /api/map/area-hits:", err);
      res.status(500).json({ error: "Failed to compute area hits" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
