import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { txHouseGeoJSON, txSenateGeoJSON, usCongressGeoJSON } from "./data/geojson";
import { db } from "./db";
import { 
  officialPublic, 
  officialPrivate, 
  updateOfficialPrivateSchema,
  type MergedOfficial,
  type OfficialPublic,
  type OfficialPrivate 
} from "@shared/schema";
import { eq, and, sql, or, ilike } from "drizzle-orm";
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
      const { district_type, search, active } = req.query;
      
      let query = db.select().from(officialPublic);
      const conditions = [];
      
      if (active !== "false") {
        conditions.push(eq(officialPublic.active, true));
      }
      
      if (district_type && typeof district_type === "string") {
        const validTypes: DistrictType[] = ["tx_house", "tx_senate", "us_congress"];
        if (!validTypes.includes(district_type as DistrictType)) {
          return res.status(400).json({ error: "Invalid district_type" });
        }
        conditions.push(eq(officialPublic.source, sourceFromDistrictType(district_type as DistrictType)));
      }
      
      if (search && typeof search === "string") {
        conditions.push(or(
          ilike(officialPublic.fullName, `%${search}%`),
          ilike(officialPublic.district, `%${search}%`)
        ));
      }
      
      const publicOfficials = await db.select()
        .from(officialPublic)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map(p => [p.officialPublicId, p]));
      
      const officials: MergedOfficial[] = publicOfficials.map(pub => 
        mergeOfficial(pub, privateMap.get(pub.id) || null)
      );
      
      res.json({ officials, count: officials.length });
    } catch (err) {
      console.error("[API] Error fetching officials:", err);
      res.status(500).json({ error: "Failed to fetch officials" });
    }
  });

  app.get("/api/officials/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
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

  const httpServer = createServer(app);
  return httpServer;
}
