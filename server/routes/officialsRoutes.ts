import type { Express } from "express";
import { db } from "../db";
import {
  officialPublic,
  officialPrivate,
  updateOfficialPrivateSchema,
  type MergedOfficial,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  mergeOfficial,
  createVacantOfficial,
  fillVacancies,
  sourceFromDistrictType,
  type SourceType,
  type DistrictSourceType,
  type DistrictType,
} from "../lib/officialUtils";

export function registerOfficialsRoutes(app: Express): void {
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

      const publicOfficials = await db
        .select()
        .from(officialPublic)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const privateData = await db.select().from(officialPrivate);
      const privateMap = new Map(privateData.map((p) => [p.officialPublicId, p]));

      let officials: MergedOfficial[] = publicOfficials.map((pub) =>
        mergeOfficial(pub, privateMap.get(pub.id) || null)
      );

      if (isAllSources || !sourceFilter) {
        const houseOfficials = fillVacancies(
          officials.filter((o) => o.source === "TX_HOUSE"),
          "TX_HOUSE"
        );
        const senateOfficials = fillVacancies(
          officials.filter((o) => o.source === "TX_SENATE"),
          "TX_SENATE"
        );
        const congressOfficials = fillVacancies(
          officials.filter((o) => o.source === "US_HOUSE"),
          "US_HOUSE"
        );
        officials = [...houseOfficials, ...senateOfficials, ...congressOfficials];
      } else if (sourceFilter && sourceFilter !== "OTHER_TX") {
        officials = fillVacancies(officials, sourceFilter);
      }

      const searchTerm = search || q;
      if (searchTerm && typeof searchTerm === "string") {
        const term = searchTerm.toLowerCase();
        const beforeCount = officials.length;
        officials = officials.filter((o) => {
          if (o.fullName.toLowerCase().includes(term)) return true;
          if (o.district.includes(term)) return true;
          if (o.isVacant && "vacant".includes(term)) return true;
          if (o.party && o.party.toLowerCase().includes(term)) return true;
          if (o.capitolAddress && o.capitolAddress.toLowerCase().includes(term)) return true;
          if (o.districtAddresses && Array.isArray(o.districtAddresses)) {
            for (const addr of o.districtAddresses) {
              if (typeof addr === "string" && addr.toLowerCase().includes(term)) return true;
            }
          }
          if (o.email && o.email.toLowerCase().includes(term)) return true;
          if (o.website && o.website.toLowerCase().includes(term)) return true;
          if (o.searchZips && o.searchZips.toLowerCase().includes(term)) return true;
          if (o.searchCities && o.searchCities.toLowerCase().includes(term)) return true;
          return false;
        });

        const afterCount = officials.length;
        const bySource: Record<string, number> = {};
        for (const o of officials) {
          bySource[o.source] = (bySource[o.source] || 0) + 1;
        }
        console.log(
          `[Search] q="${searchTerm}" | before=${beforeCount} | after=${afterCount} | bySource=${JSON.stringify(bySource)}`
        );
      }

      const sourceOrder: Record<string, number> = { TX_HOUSE: 1, TX_SENATE: 2, US_HOUSE: 3 };

      officials.sort((a, b) => {
        if (isAllSources || !sourceFilter) {
          const orderA = sourceOrder[a.source] || 99;
          const orderB = sourceOrder[b.source] || 99;
          if (orderA !== orderB) return orderA - orderB;
        }
        const distA = parseInt(a.district, 10);
        const distB = parseInt(b.district, 10);
        if (!isNaN(distA) && !isNaN(distB) && distA !== distB) return distA - distB;
        const lastA = a.fullName.split(" ").pop() || "";
        const lastB = b.fullName.split(" ").pop() || "";
        return lastA.localeCompare(lastB);
      });

      const vacancyCount = officials.filter((o) => o.isVacant).length;

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

      const privateRecords = await db
        .select({
          officialPublicId: officialPrivate.officialPublicId,
          personalAddress: officialPrivate.personalAddress,
          addressSource: officialPrivate.addressSource,
        })
        .from(officialPrivate);

      const privateMap = new Map(privateRecords.map((r) => [r.officialPublicId, r]));

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
      const allPublic = await db
        .select({
          id: officialPublic.id,
          fullName: officialPublic.fullName,
          source: officialPublic.source,
          district: officialPublic.district,
        })
        .from(officialPublic)
        .where(eq(officialPublic.active, true));

      const allPrivate = await db.select().from(officialPrivate);
      const privMap = new Map(allPrivate.map((p) => [p.officialPublicId, p]));

      const { isEffectivelyEmpty } = await import("../lib/backfillUtils");

      const audit = allPublic.map((pub) => {
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
        withAddress: audit.filter((a) => a.hasAddress).length,
        missingAddress: audit.filter((a) => !a.hasAddress).length,
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

  // IMPORTANT: This route must come BEFORE /api/officials/:id to avoid matching "with-addresses" as an ID
  app.get("/api/officials/with-addresses", async (_req, res) => {
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
        addresses: results.map((r) => ({
          officialId: r.officialId,
          officialName: r.fullName,
          source: r.source,
          personalAddress: r.personalAddress,
        })),
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
        return res.json({ official: createVacantOfficial(source, district) });
      }

      const sourceDistrictMatch = id.match(/^(TX_HOUSE|TX_SENATE|US_HOUSE):(\d+)$/);
      if (sourceDistrictMatch) {
        const source = sourceDistrictMatch[1] as DistrictSourceType;
        const district = sourceDistrictMatch[2];

        const [pub] = await db
          .select()
          .from(officialPublic)
          .where(
            and(
              eq(officialPublic.source, source),
              eq(officialPublic.district, district),
              eq(officialPublic.active, true)
            )
          )
          .limit(1);

        if (!pub) {
          return res.json({ official: createVacantOfficial(source, parseInt(district, 10)) });
        }

        const [priv] = await db
          .select()
          .from(officialPrivate)
          .where(eq(officialPrivate.officialPublicId, pub.id))
          .limit(1);

        const official = mergeOfficial(pub, priv || null);
        official.isVacant = false;
        return res.json({ official });
      }

      const [pub] = await db
        .select()
        .from(officialPublic)
        .where(eq(officialPublic.id, id))
        .limit(1);

      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }

      const [priv] = await db
        .select()
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

      const [pub] = await db
        .select()
        .from(officialPublic)
        .where(
          and(
            eq(officialPublic.source, source),
            eq(officialPublic.district, distNum),
            eq(officialPublic.active, true)
          )
        )
        .limit(1);

      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }

      const [priv] = await db
        .select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, pub.id))
        .limit(1);

      res.json({ official: mergeOfficial(pub, priv || null) });
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

        const [pub] = await db
          .select()
          .from(officialPublic)
          .where(
            and(
              eq(officialPublic.source, source),
              eq(officialPublic.district, String(districtNumber)),
              eq(officialPublic.active, true)
            )
          )
          .limit(1);

        if (pub) {
          const [priv] = await db
            .select()
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

      const [pub] = await db
        .select()
        .from(officialPublic)
        .where(eq(officialPublic.id, id))
        .limit(1);

      if (!pub) {
        return res.status(404).json({ error: "Official not found" });
      }

      const parseResult = updateOfficialPrivateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res
          .status(400)
          .json({ error: "Invalid request body", details: parseResult.error.issues });
      }

      const updateData = parseResult.data;

      const [existing] = await db
        .select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, id))
        .limit(1);

      if (existing) {
        await db
          .update(officialPrivate)
          .set({ ...updateData, addressSource: "user", updatedAt: new Date() })
          .where(eq(officialPrivate.id, existing.id));
      } else {
        let finalUpdateData = { ...updateData };
        let autoFilled = false;

        const addressIsEmpty =
          !updateData.personalAddress || updateData.personalAddress.trim().length === 0;

        if (addressIsEmpty && pub.fullName) {
          console.log(
            `[API] Auto-fill: Looking up hometown for new private notes record for "${pub.fullName}"`
          );
          try {
            const { lookupHometownFromTexasTribune } = await import("../lib/texasTribuneLookup");
            const result = await lookupHometownFromTexasTribune(pub.fullName);
            if (result.success && result.hometown) {
              console.log(
                `[API] Auto-fill: Setting personalAddress to "${result.hometown}" for ${pub.fullName}`
              );
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

      const [updatedPriv] = await db
        .select()
        .from(officialPrivate)
        .where(eq(officialPrivate.officialPublicId, id))
        .limit(1);

      res.json({ official: mergeOfficial(pub, updatedPriv) });
    } catch (err) {
      console.error("[API] Error updating private data:", err);
      res.status(500).json({ error: "Failed to update private data" });
    }
  });
}
