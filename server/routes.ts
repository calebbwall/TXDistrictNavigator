import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { txHouseGeoJSON, txSenateGeoJSON, usCongressGeoJSON } from "./data/geojson";
import { db } from "./db";
import { 
  officialPublic, 
  officialPrivate, 
  updateOfficialPrivateSchema,
  DISTRICT_RANGES,
  type MergedOfficial,
  type OfficialPublic,
  type OfficialPrivate 
} from "@shared/schema";
import { eq, and, sql, or, ilike } from "drizzle-orm";
import * as turf from "@turf/turf";
import booleanIntersects from "@turf/boolean-intersects";
import type { Feature, FeatureCollection, Polygon } from "geojson";

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE";

function createVacantOfficial(source: SourceType, district: number): MergedOfficial {
  const chamber = source === "TX_HOUSE" ? "TX House" 
    : source === "TX_SENATE" ? "TX Senate" 
    : "US House";
  
  const vacantId = `VACANT-${source}-${district}`;
  
  return {
    id: vacantId,
    source,
    sourceMemberId: vacantId,
    chamber,
    district: String(district),
    fullName: "Vacant District",
    party: null,
    photoUrl: null,
    capitolAddress: null,
    capitolPhone: null,
    districtAddresses: null,
    districtPhones: null,
    website: null,
    email: null,
    active: true,
    lastRefreshedAt: new Date(),
    isVacant: true,
    private: null,
  };
}

function fillVacancies(
  officials: MergedOfficial[], 
  source: SourceType
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

  app.get("/api/geojson/tx_house", (_req, res) => {
    res.json(txHouseGeoJSON);
  });

  app.get("/api/geojson/tx_senate", (_req, res) => {
    res.json(txSenateGeoJSON);
  });

  app.get("/api/geojson/us_congress", (_req, res) => {
    res.json(usCongressGeoJSON);
  });

  app.get("/api/officials", async (req, res) => {
    try {
      const { district_type, source, search, q, active } = req.query;
      
      const conditions = [];
      
      if (active !== "false") {
        conditions.push(eq(officialPublic.active, true));
      }
      
      let sourceFilter: SourceType | null = null;
      
      if (district_type && typeof district_type === "string") {
        const validTypes: DistrictType[] = ["tx_house", "tx_senate", "us_congress"];
        if (!validTypes.includes(district_type as DistrictType)) {
          return res.status(400).json({ error: "Invalid district_type" });
        }
        sourceFilter = sourceFromDistrictType(district_type as DistrictType);
        conditions.push(eq(officialPublic.source, sourceFilter));
      }
      
      if (source && typeof source === "string") {
        const validSources = ["TX_HOUSE", "TX_SENATE", "US_HOUSE"];
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
      
      if (sourceFilter) {
        officials = fillVacancies(officials, sourceFilter);
      } else {
        officials = officials.map(o => ({ ...o, isVacant: false }));
      }
      
      const searchTerm = search || q;
      if (searchTerm && typeof searchTerm === "string") {
        const term = searchTerm.toLowerCase();
        officials = officials.filter(o => 
          o.fullName.toLowerCase().includes(term) ||
          o.district.includes(term) ||
          (o.isVacant && "vacant".includes(term))
        );
      }
      
      officials.sort((a, b) => {
        const distA = parseInt(a.district, 10);
        const distB = parseInt(b.district, 10);
        if (!isNaN(distA) && !isNaN(distB)) {
          if (distA !== distB) return distA - distB;
        }
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
        const source = vacantMatch[1] as SourceType;
        const district = parseInt(vacantMatch[2], 10);
        const vacant = createVacantOfficial(source, district);
        return res.json({ official: vacant });
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

  app.get("/api/admin/officials-counts", async (_req, res) => {
    try {
      const counts = await db.select({
        source: officialPublic.source,
        count: sql<number>`count(*)::int`,
      })
        .from(officialPublic)
        .where(eq(officialPublic.active, true))
        .groupBy(officialPublic.source);
      
      const result: Record<string, number> = {
        TX_HOUSE: 0,
        TX_SENATE: 0,
        US_HOUSE: 0,
      };
      
      for (const { source, count } of counts) {
        result[source] = count;
      }
      
      console.log("[API] Admin officials counts:", result);
      
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
