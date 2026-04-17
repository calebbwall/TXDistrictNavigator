import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { db } from "./db";
import { registerPrayerRoutes } from "./routes/prayerRoutes";
import { registerLegislativeRoutes } from "./routes/legislativeRoutes";
import { registerAiRoutes } from "./routes/aiRoutes";
import { registerMapRoutes } from "./routes/mapRoutes";
import { registerAdminRoutes } from "./routes/adminRoutes";
import { registerOfficialsRoutes } from "./routes/officialsRoutes";
import { officialPublic, officialPrivate, type MergedOfficial } from "@shared/schema";
import { committees, committeeMemberships } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { mergeOfficial } from "./lib/officialUtils";
import { maybeRunScheduledRefresh } from "./jobs/refreshOfficials";
import { startOfficialsRefreshScheduler } from "./jobs/scheduler";
import { maybeRunCommitteeRefresh } from "./jobs/refreshCommittees";
import { maybeRunOtherTxRefresh } from "./jobs/refreshOtherTexasOfficials";

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
  registerOfficialsRoutes(app);

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
