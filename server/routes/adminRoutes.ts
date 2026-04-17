import type { Express } from "express";
import { db } from "../db";
import { officialPublic, refreshJobLog } from "@shared/schema";
import { desc, eq, and, sql, or, inArray, isNull } from "drizzle-orm";
import {
  checkAndRefreshIfChanged,
  getAllRefreshStates,
  getIsRefreshing,
} from "../jobs/refreshOfficials";
import { startOfficialsRefreshScheduler, getSchedulerStatus } from "../jobs/scheduler";
import {
  checkAndRefreshGeoJSONIfChanged,
  getGeoJSONRefreshStates,
  getIsRefreshingGeoJSON,
} from "../jobs/refreshGeoJSON";
import {
  checkAndRefreshCommitteesIfChanged,
  getAllCommitteeRefreshStates,
  getIsRefreshingCommittees,
  forceResetIsRefreshingCommittees,
  backfillMissingCommitteeMembers,
} from "../jobs/refreshCommittees";

export function registerAdminRoutes(app: Express): void {
  app.post("/api/refresh", async (_req, res) => {
    try {
      const { refreshAllOfficials } = await import("../jobs/refreshOfficials");
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
          message: "Set ADMIN_REFRESH_TOKEN environment variable",
        });
      }

      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }

      if (getIsRefreshing()) {
        return res.status(409).json({
          error: "Refresh in progress",
          message: "A refresh is already running. Try again later.",
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
          message: "Set ADMIN_REFRESH_TOKEN environment variable",
        });
      }

      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }

      if (getIsRefreshingGeoJSON()) {
        return res.status(409).json({
          error: "Refresh in progress",
          message: "A GeoJSON refresh is already running. Try again later.",
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
          message: "Set ADMIN_REFRESH_TOKEN environment variable",
        });
      }

      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }

      const sources = [
        {
          name: "TX_HOUSE",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1",
        },
        {
          name: "TX_SENATE",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_State_Senate_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1",
        },
        {
          name: "US_CONGRESS",
          url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/ArcGIS/rest/services/Texas_US_House_Districts/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=1",
        },
      ];

      const results = await Promise.all(
        sources.map(async (source) => {
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
              status: "ok",
            };
          } catch (err) {
            return { name: source.name, status: "error", error: String(err) };
          }
        })
      );

      res.json({ sources: results });
    } catch (err) {
      console.error("[Admin] GeoJSON source debug error:", err);
      res.status(500).json({ error: "Debug failed", details: String(err) });
    }
  });

  app.get("/api/admin/officials-counts", async (_req, res) => {
    try {
      const counts = await db
        .select({ source: officialPublic.source, count: sql<number>`count(*)::int` })
        .from(officialPublic)
        .where(eq(officialPublic.active, true))
        .groupBy(officialPublic.source);

      const countsBySource: Record<string, number> = { TX_HOUSE: 0, TX_SENATE: 0, US_HOUSE: 0 };
      for (const { source, count } of counts) {
        countsBySource[source] = count;
      }

      const lastRefreshJobs = await db
        .select()
        .from(refreshJobLog)
        .orderBy(desc(refreshJobLog.startedAt))
        .limit(5);

      const lastSuccessfulRefresh = lastRefreshJobs.find((j) => j.status === "success");
      const lastFailedRefresh = lastRefreshJobs.find(
        (j) => j.status === "failed" || j.status === "aborted"
      );

      const result = {
        counts: countsBySource,
        total: countsBySource.TX_HOUSE + countsBySource.TX_SENATE + countsBySource.US_HOUSE,
        lastRefresh: lastSuccessfulRefresh
          ? {
              source: lastSuccessfulRefresh.source,
              completedAt: lastSuccessfulRefresh.completedAt,
              parsedCount: lastSuccessfulRefresh.parsedCount,
              upsertedCount: lastSuccessfulRefresh.upsertedCount,
              durationMs: lastSuccessfulRefresh.durationMs,
            }
          : null,
        lastError: lastFailedRefresh
          ? {
              source: lastFailedRefresh.source,
              startedAt: lastFailedRefresh.startedAt,
              status: lastFailedRefresh.status,
              errorMessage: lastFailedRefresh.errorMessage,
            }
          : null,
        recentJobs: lastRefreshJobs.map((j) => ({
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

      res.json({ success: true, results: result.results, durationMs: result.durationMs });
    } catch (err) {
      console.error("[Admin] Committees refresh error:", err);
      res.status(500).json({ error: "Committees refresh failed" });
    }
  });

  app.post("/admin/refresh/committees/reset", (req, res) => {
    const adminToken = process.env.ADMIN_REFRESH_TOKEN;
    const providedToken = req.headers["x-admin-token"];
    if (!adminToken || providedToken !== adminToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    forceResetIsRefreshingCommittees();
    console.log("[Admin] isRefreshingCommittees flag force-reset");
    res.json({ success: true, message: "isRefreshing flag reset. You can now trigger a fresh refresh." });
  });

  app.post("/admin/refresh/committees/backfill-missing", async (req, res) => {
    const token = req.headers["x-admin-token"];
    if (token !== process.env.ADMIN_REFRESH_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = await backfillMissingCommitteeMembers();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[Admin] backfill-missing error:", err);
      res.status(500).json({ error: String(err) });
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

      const { refreshOtherTexasOfficials } = await import("../jobs/refreshOtherTexasOfficials");
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

  app.post("/admin/backfill/headshots", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];

      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }

      if (providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid admin token" });
      }

      const { lookupHeadshotFromTexasTribune } = await import("../lib/texasTribuneLookup");

      const officials = await db
        .select({
          id: officialPublic.id,
          fullName: officialPublic.fullName,
          source: officialPublic.source,
          photoUrl: officialPublic.photoUrl,
        })
        .from(officialPublic)
        .where(
          and(
            eq(officialPublic.active, true),
            inArray(officialPublic.source, ["TX_HOUSE", "TX_SENATE"]),
            or(isNull(officialPublic.photoUrl), eq(officialPublic.photoUrl, ""))
          )
        );

      console.log(`[Admin] Headshot backfill: ${officials.length} officials missing photos`);

      res.json({ message: "Headshot backfill started", totalToProcess: officials.length });

      let found = 0;
      let failed = 0;

      for (const official of officials) {
        try {
          const result = await lookupHeadshotFromTexasTribune(official.fullName);
          if (result.success && result.photoUrl) {
            await db
              .update(officialPublic)
              .set({ photoUrl: result.photoUrl })
              .where(eq(officialPublic.id, official.id));
            found++;
            console.log(`[Headshot] ${found}/${officials.length} Found: ${official.fullName}`);
          } else {
            failed++;
            console.log(`[Headshot] Not found: ${official.fullName}`);
          }
        } catch (err) {
          failed++;
          console.error(`[Headshot] Error for ${official.fullName}:`, err);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log(`[Admin] Headshot backfill complete: ${found} found, ${failed} not found`);
    } catch (err) {
      console.error("[Admin] Headshot backfill error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Headshot backfill failed" });
      }
    }
  });

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

      const official = await db
        .select()
        .from(officialPublic)
        .where(eq(officialPublic.id, officialPublicId))
        .limit(1);

      if (official.length === 0) {
        return res.status(404).json({ error: "Official not found" });
      }

      const { persons } = await import("@shared/schema");
      const person = await db.select().from(persons).where(eq(persons.id, personId)).limit(1);

      if (person.length === 0) {
        return res.status(404).json({ error: "Person not found" });
      }

      const { setExplicitPersonLink } = await import("../lib/identityResolver");
      const result = await setExplicitPersonLink(officialPublicId, personId);

      console.log(`[Admin] Created explicit person link: official ${officialPublicId} -> person ${personId}`);

      res.json({ success: true, link: result, official: official[0], person: person[0] });
    } catch (err) {
      console.error("[Admin] Person link error:", err);
      res.status(500).json({ error: "Failed to create person link" });
    }
  });

  app.get("/admin/status", async (req, res) => {
    try {
      const adminToken = process.env.ADMIN_REFRESH_TOKEN;
      const providedToken = req.headers["x-admin-token"];

      if (!adminToken) {
        return res.status(503).json({ error: "Admin not configured" });
      }

      if (!providedToken || providedToken !== adminToken) {
        return res.status(401).json({ error: "Invalid or missing admin token" });
      }

      const { getIdentityStats, getAllExplicitPersonLinks } = await import("../lib/identityResolver");
      const identityStats = await getIdentityStats();
      const explicitLinks = await getAllExplicitPersonLinks();

      const officialsStates = await getAllRefreshStates();
      const geojsonStates = await getGeoJSONRefreshStates();
      const committeesStates = await getAllCommitteeRefreshStates();
      const schedulerStatus = getSchedulerStatus();

      const datasets = {
        officials: {
          TX_HOUSE: officialsStates.find((s) => s.source === "TX_HOUSE") || null,
          TX_SENATE: officialsStates.find((s) => s.source === "TX_SENATE") || null,
          US_HOUSE: officialsStates.find((s) => s.source === "US_HOUSE") || null,
          isRefreshing: getIsRefreshing(),
        },
        other_tx_officials: { note: "Static data source - no refresh state tracking" },
        geojson: { states: geojsonStates, isRefreshing: getIsRefreshingGeoJSON() },
        committees: { states: committeesStates, isRefreshing: getIsRefreshingCommittees() },
      };

      res.json({
        timestamp: new Date().toISOString(),
        scheduler: schedulerStatus,
        datasets,
        identity: { ...identityStats, explicitLinksDetails: explicitLinks },
      });
    } catch (err) {
      console.error("[Admin] Status error:", err);
      res.status(500).json({ error: "Failed to get system status" });
    }
  });

  // Full legislative bootstrap: committees → RSS feeds → events
  app.post("/api/admin/bootstrap-legislative", async (_req, res) => {
    try {
      const { triggerFullLegislativeBootstrap } = await import("../jobs/scheduler");
      const result = await triggerFullLegislativeBootstrap();
      res.json(result);
    } catch (err) {
      console.error("[Admin] Bootstrap legislative error:", err);
      res.status(500).json({ error: "Bootstrap failed" });
    }
  });
}
