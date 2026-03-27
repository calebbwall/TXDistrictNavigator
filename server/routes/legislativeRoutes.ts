/**
 * Legislative Refresh System — API routes
 *
 * GET  /api/alerts                     ?unreadOnly=true
 * POST /api/alerts/:id/read
 * GET  /api/events/upcoming            ?days=7&scope=savedOfficials|followed|all
 * GET  /api/committees/:id/hearings    ?range=upcoming|past
 * GET  /api/hearings/:eventId          includes details + agenda summary + witness_count
 * GET  /api/hearings/:eventId/witnesses
 * POST /api/subscriptions
 * DELETE /api/subscriptions/:id
 *
 * Admin (require ADMIN_CRON_SECRET header):
 * POST /api/admin/run-hourly
 * POST /api/admin/run-daily
 */
import type { Express, Request, Response } from "express";
import { db } from "../db";
import {
  alerts,
  legislativeEvents,
  hearingDetails,
  hearingAgendaItems,
  witnesses,
  userSubscriptions,
  committees,
  pushTokens,
  type InsertUserSubscription,
  type InsertPushToken,
} from "@shared/schema";
import { eq, and, isNull, desc, asc, gte, lte, sql, inArray } from "drizzle-orm";
import { triggerRssPoll, triggerDailyRefresh, triggerFullLegislativeBootstrap } from "../jobs/scheduler";

function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_CRON_SECRET;
  if (!secret) return true; // not configured = open (dev mode)
  const provided =
    req.headers["x-admin-secret"] ??
    req.headers["authorization"]?.replace("Bearer ", "");
  if (provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerLegislativeRoutes(app: Express): void {
  // ── Alerts ──

  /**
   * GET /api/alerts
   * Query: unreadOnly=true (default false)
   * Returns up to 100 most recent alerts for the default user.
   */
  app.get("/api/alerts", async (req: Request, res: Response) => {
    try {
      const unreadOnly = req.query.unreadOnly === "true";
      const conditions = [eq(alerts.userId, "default")];
      if (unreadOnly) conditions.push(isNull(alerts.readAt));

      const rows = await db
        .select()
        .from(alerts)
        .where(and(...conditions))
        .orderBy(desc(alerts.createdAt))
        .limit(100);

      const unreadCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(alerts)
        .where(and(eq(alerts.userId, "default"), isNull(alerts.readAt)));

      res.json({ alerts: rows, unreadCount: Number(unreadCount[0]?.count ?? 0) });
    } catch (err) {
      console.error("[api/alerts] Error:", err);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  /**
   * POST /api/alerts/:id/read
   * Marks a single alert as read.
   */
  app.post("/api/alerts/:id/read", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(alerts)
        .set({ readAt: new Date() })
        .where(and(eq(alerts.id, id), isNull(alerts.readAt)))
        .returning({ id: alerts.id });

      if (!updated) {
        return res.status(404).json({ error: "Alert not found or already read" });
      }
      res.json({ success: true, id: updated.id });
    } catch (err) {
      console.error("[api/alerts/:id/read] Error:", err);
      res.status(500).json({ error: "Failed to mark alert as read" });
    }
  });

  /**
   * POST /api/alerts/mark-read
   * Marks multiple alerts as read.
   * Body: { ids: string[] }  — pass [] to mark all as read.
   */
  app.post("/api/alerts/mark-read", async (req: Request, res: Response) => {
    try {
      const { ids } = req.body as { ids: string[] };
      const now = new Date();
      if (Array.isArray(ids) && ids.length > 0) {
        await db
          .update(alerts)
          .set({ readAt: now })
          .where(and(eq(alerts.userId, "default"), isNull(alerts.readAt), inArray(alerts.id, ids)));
      } else {
        await db
          .update(alerts)
          .set({ readAt: now })
          .where(and(eq(alerts.userId, "default"), isNull(alerts.readAt)));
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[api/alerts/mark-read] Error:", err);
      res.status(500).json({ error: "Failed to mark alerts as read" });
    }
  });

  /**
   * DELETE /api/alerts/bulk
   * Deletes multiple alerts.
   * Body: { ids: string[] }  — pass [] to delete all.
   */
  app.delete("/api/alerts/bulk", async (req: Request, res: Response) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (Array.isArray(ids) && ids.length > 0) {
        await db
          .delete(alerts)
          .where(and(eq(alerts.userId, "default"), inArray(alerts.id, ids)));
      } else {
        await db
          .delete(alerts)
          .where(eq(alerts.userId, "default"));
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[api/alerts/bulk] Error:", err);
      res.status(500).json({ error: "Failed to delete alerts" });
    }
  });

  /**
   * DELETE /api/alerts/:id
   * Deletes a single alert.
   */
  app.delete("/api/alerts/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await db
        .delete(alerts)
        .where(and(eq(alerts.id, id), eq(alerts.userId, "default")));
      res.json({ success: true });
    } catch (err) {
      console.error("[api/alerts/:id] Error:", err);
      res.status(500).json({ error: "Failed to delete alert" });
    }
  });

  // ── Events ──

  /**
   * GET /api/events/upcoming
   * Query: days=7 (default), scope=all|savedOfficials|followed
   * Returns legislative events starting within the next N days.
   */
  app.get("/api/events/upcoming", async (req: Request, res: Response) => {
    try {
      const days = Math.min(parseInt(String(req.query.days ?? "7"), 10) || 7, 60);
      const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const now = new Date();

      const rows = await db
        .select({
          id: legislativeEvents.id,
          eventType: legislativeEvents.eventType,
          chamber: legislativeEvents.chamber,
          committeeId: legislativeEvents.committeeId,
          title: legislativeEvents.title,
          startsAt: legislativeEvents.startsAt,
          endsAt: legislativeEvents.endsAt,
          timezone: legislativeEvents.timezone,
          location: legislativeEvents.location,
          status: legislativeEvents.status,
          sourceUrl: legislativeEvents.sourceUrl,
          externalId: legislativeEvents.externalId,
          committeeName: committees.name,
          committeeChamber: committees.chamber,
          witnessCount: hearingDetails.witnessCount,
        })
        .from(legislativeEvents)
        .leftJoin(committees, eq(committees.id, legislativeEvents.committeeId))
        .leftJoin(hearingDetails, eq(hearingDetails.eventId, legislativeEvents.id))
        .where(
          and(
            gte(legislativeEvents.startsAt, now),
            lte(legislativeEvents.startsAt, cutoff),
          ),
        )
        .orderBy(asc(legislativeEvents.startsAt))
        .limit(200);

      // Get agenda item counts per event
      const eventIds = rows.map((r) => r.id);
      const agendaCounts: Record<string, number> = {};
      if (eventIds.length > 0) {
        const counts = await db
          .select({
            eventId: hearingAgendaItems.eventId,
            count: sql<number>`count(*)`,
          })
          .from(hearingAgendaItems)
          .where(inArray(hearingAgendaItems.eventId, eventIds))
          .groupBy(hearingAgendaItems.eventId);
        counts.forEach((c) => (agendaCounts[c.eventId] = Number(c.count)));
      }

      const enriched = rows.map((r) => ({
        ...r,
        billCount: agendaCounts[r.id] ?? 0,
      }));

      res.json({ events: enriched, total: enriched.length });
    } catch (err) {
      console.error("[api/events/upcoming] Error:", err);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // ── Committee hearings ──

  /**
   * GET /api/committees/:id/hearings
   * Query: range=upcoming (default) | past
   */
  app.get("/api/committees/:id/hearings", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const range = req.query.range === "past" ? "past" : "upcoming";
      const now = new Date();

      const rows = await db
        .select({
          id: legislativeEvents.id,
          title: legislativeEvents.title,
          startsAt: legislativeEvents.startsAt,
          location: legislativeEvents.location,
          status: legislativeEvents.status,
          sourceUrl: legislativeEvents.sourceUrl,
          externalId: legislativeEvents.externalId,
          witnessCount: hearingDetails.witnessCount,
          noticeText: hearingDetails.noticeText,
        })
        .from(legislativeEvents)
        .leftJoin(hearingDetails, eq(hearingDetails.eventId, legislativeEvents.id))
        .where(
          and(
            eq(legislativeEvents.committeeId, id),
            eq(legislativeEvents.eventType, "COMMITTEE_HEARING"),
            range === "upcoming"
              ? gte(legislativeEvents.startsAt, now)
              : lte(legislativeEvents.startsAt, now),
          ),
        )
        .orderBy(
          range === "upcoming"
            ? asc(legislativeEvents.startsAt)
            : desc(legislativeEvents.startsAt),
        )
        .limit(50);

      // Attach per-event bill (agenda item) counts
      const eventIds = rows.map((r) => r.id);
      const agendaCounts: Record<string, number> = {};
      if (eventIds.length > 0) {
        const counts = await db
          .select({
            eventId: hearingAgendaItems.eventId,
            count: sql<number>`count(*)`,
          })
          .from(hearingAgendaItems)
          .where(inArray(hearingAgendaItems.eventId, eventIds))
          .groupBy(hearingAgendaItems.eventId);
        counts.forEach((c) => (agendaCounts[c.eventId] = Number(c.count)));
      }

      const hearings = rows.map((r) => ({ ...r, billCount: agendaCounts[r.id] ?? 0 }));
      res.json({ hearings, total: hearings.length });
    } catch (err) {
      console.error("[api/committees/:id/hearings] Error:", err);
      res.status(500).json({ error: "Failed to fetch hearings" });
    }
  });

  // ── Hearing detail ──

  /**
   * GET /api/hearings/:eventId
   * Returns full hearing with details + agenda items summary + witness count.
   */
  app.get("/api/hearings/:eventId", async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;

      const [event] = await db
        .select({
          id: legislativeEvents.id,
          eventType: legislativeEvents.eventType,
          chamber: legislativeEvents.chamber,
          committeeId: legislativeEvents.committeeId,
          title: legislativeEvents.title,
          startsAt: legislativeEvents.startsAt,
          endsAt: legislativeEvents.endsAt,
          timezone: legislativeEvents.timezone,
          location: legislativeEvents.location,
          status: legislativeEvents.status,
          sourceUrl: legislativeEvents.sourceUrl,
          externalId: legislativeEvents.externalId,
          committeeName: committees.name,
          noticeText: hearingDetails.noticeText,
          meetingType: hearingDetails.meetingType,
          postingDate: hearingDetails.postingDate,
          videoUrl: hearingDetails.videoUrl,
          witnessCount: hearingDetails.witnessCount,
        })
        .from(legislativeEvents)
        .leftJoin(committees, eq(committees.id, legislativeEvents.committeeId))
        .leftJoin(hearingDetails, eq(hearingDetails.eventId, legislativeEvents.id))
        .where(eq(legislativeEvents.id, eventId))
        .limit(1);

      if (!event) {
        return res.status(404).json({ error: "Hearing not found" });
      }

      const agenda = await db
        .select({
          id: hearingAgendaItems.id,
          billNumber: hearingAgendaItems.billNumber,
          itemText: hearingAgendaItems.itemText,
          sortOrder: hearingAgendaItems.sortOrder,
        })
        .from(hearingAgendaItems)
        .where(eq(hearingAgendaItems.eventId, eventId))
        .orderBy(asc(hearingAgendaItems.sortOrder))
        .limit(100);

      res.json({ hearing: event, agenda });
    } catch (err) {
      console.error("[api/hearings/:eventId] Error:", err);
      res.status(500).json({ error: "Failed to fetch hearing" });
    }
  });

  /**
   * GET /api/hearings/:eventId/witnesses
   */
  app.get(
    "/api/hearings/:eventId/witnesses",
    async (req: Request, res: Response) => {
      try {
        const { eventId } = req.params;
        const rows = await db
          .select()
          .from(witnesses)
          .where(eq(witnesses.eventId, eventId))
          .orderBy(asc(witnesses.sortOrder))
          .limit(500);

        res.json({ witnesses: rows, total: rows.length });
      } catch (err) {
        console.error("[api/hearings/:eventId/witnesses] Error:", err);
        res.status(500).json({ error: "Failed to fetch witnesses" });
      }
    },
  );

  // ── Subscriptions ──

  /**
   * POST /api/subscriptions
   * Body: { type, committeeId?, billId?, chamber?, officialPublicId? }
   */
  app.post("/api/subscriptions", async (req: Request, res: Response) => {
    try {
      const { type, committeeId, billId, chamber, officialPublicId } = req.body as {
        type: string;
        committeeId?: string;
        billId?: string;
        chamber?: string;
        officialPublicId?: string;
      };

      if (!["COMMITTEE", "BILL", "CHAMBER", "OFFICIAL"].includes(type)) {
        return res.status(400).json({ error: "Invalid subscription type" });
      }

      const [inserted] = await db
        .insert(userSubscriptions)
        .values({
          userId: "default",
          type: type as InsertUserSubscription["type"],
          committeeId: committeeId ?? undefined,
          billId: billId ?? undefined,
          chamber: chamber ?? undefined,
          officialPublicId: officialPublicId ?? undefined,
        })
        .returning();

      res.status(201).json({ subscription: inserted });
    } catch (err) {
      console.error("[api/subscriptions POST] Error:", err);
      res.status(500).json({ error: "Failed to create subscription" });
    }
  });

  /**
   * DELETE /api/subscriptions/:id
   */
  app.delete("/api/subscriptions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [deleted] = await db
        .delete(userSubscriptions)
        .where(and(eq(userSubscriptions.id, id), eq(userSubscriptions.userId, "default")))
        .returning({ id: userSubscriptions.id });

      if (!deleted) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[api/subscriptions DELETE] Error:", err);
      res.status(500).json({ error: "Failed to delete subscription" });
    }
  });

  /**
   * GET /api/subscriptions
   */
  app.get("/api/subscriptions", async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, "default"))
        .orderBy(desc(userSubscriptions.createdAt));
      res.json({ subscriptions: rows });
    } catch (err) {
      console.error("[api/subscriptions GET] Error:", err);
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  // ── Admin manual triggers ──
  // Secured by ADMIN_CRON_SECRET env var (see README).

  /**
   * POST /api/admin/run-hourly
   * Manually triggers the hourly RSS/HTML poll.
   */
  app.post("/api/admin/run-hourly", async (req: Request, res: Response) => {
    if (!requireAdminSecret(req, res)) return;
    try {
      const result = await triggerRssPoll();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * POST /api/admin/run-daily
   * Manually triggers the daily legislative refresh.
   */
  app.post("/api/admin/run-daily", async (req: Request, res: Response) => {
    if (!requireAdminSecret(req, res)) return;
    try {
      const result = await triggerDailyRefresh();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * POST /api/admin/bootstrap-legislative
   * Full legislative data bootstrap: committees → RSS feeds → events.
   * Use this to force-seed data on a fresh DB or after a reset.
   */
  app.post("/api/admin/bootstrap-legislative", async (req: Request, res: Response) => {
    if (!requireAdminSecret(req, res)) return;
    try {
      const result = await triggerFullLegislativeBootstrap();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Push Tokens ──

  /**
   * POST /api/push-tokens
   * Body: { token: string, platform?: "android" | "ios" }
   * Registers or refreshes a device push token (idempotent).
   */
  app.post("/api/push-tokens", async (req: Request, res: Response) => {
    try {
      const { token, platform } = req.body as { token?: string; platform?: string };
      if (!token || typeof token !== "string") {
        res.status(400).json({ error: "token is required" });
        return;
      }

      await db
        .insert(pushTokens)
        .values({
          userId: "default",
          token,
          platform: platform ?? null,
          lastSeenAt: new Date(),
        } satisfies InsertPushToken)
        .onConflictDoUpdate({
          target: pushTokens.token,
          set: { lastSeenAt: new Date(), platform: platform ?? null },
        });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * DELETE /api/push-tokens/:token
   * Unregisters a device push token.
   */
  app.delete("/api/push-tokens/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      await db.delete(pushTokens).where(eq(pushTokens.token, token));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}
