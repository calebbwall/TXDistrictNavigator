import type { Express, Request, Response } from "express";
import { db } from "../db";
import {
  prayers,
  prayerCategories,
  dailyPrayerPicks,
  prayerStreak,
  appSettings,
  insertPrayerSchema,
  updatePrayerSchema,
  type Prayer,
} from "@shared/schema";
import { eq, and, sql, or, ilike, inArray, desc, asc, isNull, lte, gte, not } from "drizzle-orm";
import { processEventDateActions } from "../lib/prayerUtils";
import { requireUser } from "../middleware/userAuth";

export { processEventDateActions };

function getTodayDateKey(): string {
  const now = new Date();
  const chicagoStr = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  const y = chicagoDate.getFullYear();
  const m = String(chicagoDate.getMonth() + 1).padStart(2, "0");
  const d = String(chicagoDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getYesterdayDateKey(): string {
  const now = new Date();
  const chicagoStr = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  chicagoDate.setDate(chicagoDate.getDate() - 1);
  const y = chicagoDate.getFullYear();
  const m = String(chicagoDate.getMonth() + 1).padStart(2, "0");
  const d = String(chicagoDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDateKeyNDaysAgo(n: number): string {
  const now = new Date();
  const chicagoStr = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicagoDate = new Date(chicagoStr);
  chicagoDate.setDate(chicagoDate.getDate() - n);
  const y = chicagoDate.getFullYear();
  const m = String(chicagoDate.getMonth() + 1).padStart(2, "0");
  const d = String(chicagoDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function getAutoArchiveEnabled(): Promise<boolean> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "autoArchiveEnabled")).limit(1);
  if (row.length > 0) return row[0].value === "true";
  return true;
}

async function getAutoArchiveDays(): Promise<number> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "autoArchiveDays")).limit(1);
  if (row.length > 0) return parseInt(row[0].value, 10) || 90;
  return 90;
}

// Auto-archive scoped to the requesting user only — prevents an anonymous
// caller from forcing global state mutations across every user's prayers.
async function autoArchiveAnswered(userId: string): Promise<void> {
  const enabled = await getAutoArchiveEnabled();
  if (!enabled) return;
  const days = await getAutoArchiveDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  await db.update(prayers)
    .set({ status: "ARCHIVED", archivedAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(prayers.userId, userId),
      eq(prayers.status, "ANSWERED"),
      lte(prayers.answeredAt, cutoff)
    ));
}

async function ensureStreakRow(userId: string) {
  const rows = await db
    .select()
    .from(prayerStreak)
    .where(eq(prayerStreak.userId, userId))
    .limit(1);
  if (rows.length === 0) {
    await db
      .insert(prayerStreak)
      .values({
        userId,
        currentStreak: 0,
        longestStreak: 0,
        lastCompletedDateKey: null,
      })
      .onConflictDoNothing();
  }
}

export function registerPrayerRoutes(app: Express) {

  // ── Prayer Categories ──

  app.get("/api/prayer-categories", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const cats = await db
        .select()
        .from(prayerCategories)
        .where(eq(prayerCategories.userId, userId))
        .orderBy(asc(prayerCategories.sortOrder), asc(prayerCategories.name));
      res.json(cats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/prayer-categories", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { name, sortOrder } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Category name is required" });
      }
      const existing = await db
        .select()
        .from(prayerCategories)
        .where(and(
          eq(prayerCategories.userId, userId),
          sql`LOWER(${prayerCategories.name}) = LOWER(${name.trim()})`
        ));
      if (existing.length > 0) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
      const [cat] = await db.insert(prayerCategories).values({
        userId,
        name: name.trim(),
        sortOrder: sortOrder ?? 0,
      }).returning();
      res.status(201).json(cat);
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/prayer-categories/:id", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const updates: any = { updatedAt: new Date() };
      if (req.body.name !== undefined) updates.name = req.body.name.trim();
      if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;
      const [cat] = await db
        .update(prayerCategories)
        .set(updates)
        .where(and(eq(prayerCategories.id, id), eq(prayerCategories.userId, userId)))
        .returning();
      if (!cat) return res.status(404).json({ error: "Category not found" });
      res.json(cat);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/prayer-categories/:id", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      // Detach the category from this user's prayers only.
      await db
        .update(prayers)
        .set({ categoryId: null, updatedAt: new Date() })
        .where(and(eq(prayers.categoryId, id), eq(prayers.userId, userId)));
      const [cat] = await db
        .delete(prayerCategories)
        .where(and(eq(prayerCategories.id, id), eq(prayerCategories.userId, userId)))
        .returning();
      if (!cat) return res.status(404).json({ error: "Category not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Prayers CRUD ──

  app.get("/api/prayers", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      autoArchiveAnswered(userId).catch(() => {});
      processEventDateActions().catch(() => {});

      const { status, categoryId, officialId, q, limit: lim, offset: off, sort } = req.query;
      const conditions: any[] = [eq(prayers.userId, userId)];

      if (status && status !== "ALL") {
        conditions.push(eq(prayers.status, status as "OPEN" | "ANSWERED" | "ARCHIVED"));
      }
      if (categoryId === "uncategorized") {
        conditions.push(isNull(prayers.categoryId));
      } else if (categoryId) {
        conditions.push(eq(prayers.categoryId, categoryId as string));
      }
      if (q && typeof q === "string" && q.trim()) {
        const search = `%${q.trim()}%`;
        conditions.push(or(ilike(prayers.title, search), ilike(prayers.body, search)));
      }
      if (officialId && typeof officialId === "string") {
        conditions.push(sql`${prayers.officialIds}::jsonb @> ${JSON.stringify([officialId])}::jsonb`);
      }

      const orderBy = sort === "needsAttention"
        ? [asc(prayers.lastPrayedAt), desc(prayers.priority), desc(prayers.createdAt)]
        : [desc(prayers.createdAt)];

      let query = db.select().from(prayers)
        .where(and(...conditions))
        .orderBy(...orderBy);

      const limitVal = Math.min(parseInt(lim as string) || 50, 200);
      const offsetVal = parseInt(off as string) || 0;
      // @ts-ignore - limit/offset chaining
      const results: Prayer[] = await query.limit(limitVal).offset(offsetVal);

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/prayers", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const parsed = insertPrayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues });
      }
      const { title, body, categoryId, officialIds, pinnedDaily, priority, eventDate, autoAfterEventAction, autoAfterEventDaysOffset } = parsed.data;
      const [prayer] = await db.insert(prayers).values({
        userId,
        title,
        body,
        categoryId: categoryId ?? null,
        officialIds: officialIds ?? [],
        pinnedDaily: pinnedDaily ?? false,
        priority: priority ?? 0,
        eventDate: eventDate ? new Date(eventDate) : null,
        autoAfterEventAction: autoAfterEventAction ?? "none",
        autoAfterEventDaysOffset: autoAfterEventDaysOffset ?? 0,
      }).returning();
      res.status(201).json(prayer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/prayers/export", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      await autoArchiveAnswered(userId);
      const { status, dateFrom, dateTo, includeBody } = req.query;
      const conditions: any[] = [eq(prayers.userId, userId)];
      if (status && status !== "ALL") {
        conditions.push(eq(prayers.status, status as "OPEN" | "ANSWERED" | "ARCHIVED"));
      }
      if (dateFrom && typeof dateFrom === "string") {
        const from = new Date(dateFrom + "T00:00:00.000Z");
        if (!isNaN(from.getTime())) {
          conditions.push(gte(prayers.createdAt, from));
        }
      }
      if (dateTo && typeof dateTo === "string") {
        const to = new Date(dateTo + "T23:59:59.999Z");
        if (!isNaN(to.getTime())) {
          conditions.push(lte(prayers.createdAt, to));
        }
      }
      const allPrayers = await db.select().from(prayers)
        .where(and(...conditions))
        .orderBy(desc(prayers.createdAt));
      const cats = await db
        .select()
        .from(prayerCategories)
        .where(eq(prayerCategories.userId, userId));
      const catMap = new Map(cats.map(c => [c.id, c.name]));

      const showBody = includeBody !== "false";
      const headerCols = ["title"];
      if (showBody) headerCols.push("body");
      headerCols.push("status", "categoryName", "createdAt", "answeredAt", "archivedAt", "answerNote", "officialIds");
      const header = headerCols.join(",");

      const csvEscape = (s: string | null | undefined) => {
        if (s == null) return "";
        const str = String(s).replace(/"/g, '""');
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
      };
      const rows = allPrayers.map(p => {
        const cols: string[] = [csvEscape(p.title)];
        if (showBody) cols.push(csvEscape(p.body));
        cols.push(
          p.status,
          csvEscape(catMap.get(p.categoryId ?? "") ?? ""),
          p.createdAt?.toISOString() ?? "",
          p.answeredAt?.toISOString() ?? "",
          p.archivedAt?.toISOString() ?? "",
          csvEscape(p.answerNote),
          csvEscape((p.officialIds as string[] || []).join(";")),
        );
        return cols.join(",");
      });
      const csv = [header, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=prayers-export.csv");
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/prayers/needs-attention", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const allOpen = await db.select().from(prayers)
        .where(and(eq(prayers.userId, userId), eq(prayers.status, "OPEN")));

      const needsAttention = allOpen.filter(p =>
        p.lastPrayedAt === null || p.lastPrayedAt < fourteenDaysAgo
      );

      const sorted = needsAttention.sort((a, b) => {
        const aTime = a.lastPrayedAt?.getTime() ?? 0;
        const bTime = b.lastPrayedAt?.getTime() ?? 0;
        if (aTime !== bTime) return aTime - bTime;
        return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
      });

      const result = sorted.slice(0, 5);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/prayers/recently-answered", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const result = await db.select().from(prayers)
        .where(and(eq(prayers.userId, userId), eq(prayers.status, "ANSWERED")))
        .orderBy(desc(prayers.answeredAt))
        .limit(5);

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/prayers/grouped", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { status, groupBy } = req.query;
      const conditions: any[] = [eq(prayers.userId, userId)];
      if (status && status !== "ALL") {
        conditions.push(eq(prayers.status, status as "OPEN" | "ANSWERED" | "ARCHIVED"));
      }

      const allPrayers = await db.select().from(prayers)
        .where(and(...conditions));

      if (groupBy === "officials") {
        const officialCounts = new Map<string, number>();
        for (const p of allPrayers) {
          const ids = (p.officialIds as string[]) || [];
          if (ids.length === 0) {
            officialCounts.set("__none__", (officialCounts.get("__none__") || 0) + 1);
          } else {
            for (const oid of ids) {
              officialCounts.set(oid, (officialCounts.get(oid) || 0) + 1);
            }
          }
        }
        const groups = Array.from(officialCounts.entries()).map(([id, count]) => ({
          id,
          name: id === "__none__" ? "No Official" : id,
          count,
        }));
        groups.sort((a, b) => b.count - a.count);
        return res.json({ groupBy: "officials", groups });
      }

      if (groupBy === "categories") {
        const cats = await db
          .select()
          .from(prayerCategories)
          .where(eq(prayerCategories.userId, userId));
        const catMap = new Map(cats.map(c => [c.id, c.name]));
        const categoryCounts = new Map<string, number>();
        for (const p of allPrayers) {
          const key = p.categoryId || "__uncategorized__";
          categoryCounts.set(key, (categoryCounts.get(key) || 0) + 1);
        }
        const groups = Array.from(categoryCounts.entries()).map(([id, count]) => ({
          id,
          name: id === "__uncategorized__" ? "Uncategorized" : (catMap.get(id) || id),
          count,
        }));
        groups.sort((a, b) => b.count - a.count);
        return res.json({ groupBy: "categories", groups });
      }

      res.status(400).json({ error: "groupBy must be 'officials' or 'categories'" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/prayers/upcoming", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const result = await db.select().from(prayers)
        .where(and(
          eq(prayers.userId, userId),
          eq(prayers.status, "OPEN"),
          not(isNull(prayers.eventDate)),
        ))
        .orderBy(asc(prayers.eventDate))
        .limit(10);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/prayers/:id", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const [prayer] = await db
        .select()
        .from(prayers)
        .where(and(eq(prayers.id, req.params.id), eq(prayers.userId, userId)))
        .limit(1);
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/prayers/:id", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const parsed = updatePrayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues });
      }
      const updates: any = { ...parsed.data, updatedAt: new Date() };
      if (updates.lastPrayedAt && typeof updates.lastPrayedAt === 'string') {
        updates.lastPrayedAt = new Date(updates.lastPrayedAt);
      }
      if (updates.eventDate !== undefined) {
        updates.eventDate = updates.eventDate ? new Date(updates.eventDate) : null;
      }
      const [prayer] = await db
        .update(prayers)
        .set(updates)
        .where(and(eq(prayers.id, req.params.id), eq(prayers.userId, userId)))
        .returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/prayers/:id", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const [prayer] = await db
        .delete(prayers)
        .where(and(eq(prayers.id, req.params.id), eq(prayers.userId, userId)))
        .returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Status Transitions ──

  app.post("/api/prayers/:id/answer", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { answerNote } = req.body || {};
      const [prayer] = await db.update(prayers).set({
        status: "ANSWERED",
        answeredAt: new Date(),
        answerNote: answerNote ?? null,
        archivedAt: null,
        updatedAt: new Date(),
      }).where(and(eq(prayers.id, req.params.id), eq(prayers.userId, userId))).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/prayers/:id/reopen", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const [prayer] = await db.update(prayers).set({
        status: "OPEN",
        answeredAt: null,
        archivedAt: null,
        updatedAt: new Date(),
      }).where(and(eq(prayers.id, req.params.id), eq(prayers.userId, userId))).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/prayers/:id/archive", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const [prayer] = await db.update(prayers).set({
        status: "ARCHIVED",
        archivedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(prayers.id, req.params.id), eq(prayers.userId, userId))).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/prayers/:id/unarchive", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const [prayer] = await db.update(prayers).set({
        status: "OPEN",
        archivedAt: null,
        answeredAt: null,
        updatedAt: new Date(),
      }).where(and(eq(prayers.id, req.params.id), eq(prayers.userId, userId))).returning();
      if (!prayer) return res.status(404).json({ error: "Prayer not found" });
      res.json(prayer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Bulk Actions ──

  app.post("/api/prayers/bulk", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { action, prayerIds, answerNote } = req.body;
      if (!action || !Array.isArray(prayerIds) || prayerIds.length === 0) {
        return res.status(400).json({ error: "action and prayerIds[] required" });
      }
      const validActions = ["answer", "archive", "reopen", "unarchive"];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` });
      }

      const now = new Date();
      let updates: any;
      switch (action) {
        case "answer":
          updates = { status: "ANSWERED" as const, answeredAt: now, answerNote: answerNote ?? null, archivedAt: null, updatedAt: now };
          break;
        case "archive":
          updates = { status: "ARCHIVED" as const, archivedAt: now, updatedAt: now };
          break;
        case "reopen":
          updates = { status: "OPEN" as const, answeredAt: null, archivedAt: null, updatedAt: now };
          break;
        case "unarchive":
          updates = { status: "OPEN" as const, archivedAt: null, answeredAt: null, updatedAt: now };
          break;
      }

      const result = await db
        .update(prayers)
        .set(updates)
        .where(and(eq(prayers.userId, userId), inArray(prayers.id, prayerIds)))
        .returning();
      res.json({ updated: result.length, prayers: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Daily Prayer Picks ──

  app.get("/api/daily-prayer-picks", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const todayKey = getTodayDateKey();
      const forceRegenerate = req.query.forceRegenerate === "true";

      if (forceRegenerate) {
        await db
          .delete(dailyPrayerPicks)
          .where(and(
            eq(dailyPrayerPicks.userId, userId),
            eq(dailyPrayerPicks.dateKey, todayKey),
          ));
      }

      if (!forceRegenerate) {
        const existing = await db
          .select()
          .from(dailyPrayerPicks)
          .where(and(
            eq(dailyPrayerPicks.userId, userId),
            eq(dailyPrayerPicks.dateKey, todayKey),
          ))
          .limit(1);
        if (existing.length > 0) {
          const ids = existing[0].prayerIds as string[];
          const prayerList = ids.length > 0
            ? await db
                .select()
                .from(prayers)
                .where(and(eq(prayers.userId, userId), inArray(prayers.id, ids)))
            : [];
          const ordered = ids.map(id => prayerList.find(p => p.id === id)).filter(Boolean);
          return res.json({ dateKey: todayKey, prayers: ordered, generatedAt: existing[0].generatedAt });
        }
      }

      const yesterdayKey = getDateKeyNDaysAgo(1);
      const twoDaysAgoKey = getDateKeyNDaysAgo(2);

      const recentPickRows = await db
        .select()
        .from(dailyPrayerPicks)
        .where(and(
          eq(dailyPrayerPicks.userId, userId),
          inArray(dailyPrayerPicks.dateKey, [yesterdayKey, twoDaysAgoKey]),
        ));

      const yesterdayIds: string[] = [];
      const twoDaysAgoIds: string[] = [];
      for (const row of recentPickRows) {
        if (row.dateKey === yesterdayKey) yesterdayIds.push(...(row.prayerIds as string[]));
        if (row.dateKey === twoDaysAgoKey) twoDaysAgoIds.push(...(row.prayerIds as string[]));
      }
      const recentIds = new Set([...yesterdayIds, ...twoDaysAgoIds]);

      const openPrayers = await db.select().from(prayers)
        .where(and(eq(prayers.userId, userId), eq(prayers.status, "OPEN")))
        .orderBy(asc(prayers.lastShownAt));

      const picks: Prayer[] = [];

      const pinned = openPrayers.filter(p => p.pinnedDaily);
      const pinnedSorted = pinned.sort((a, b) => {
        const aTime = a.lastShownAt?.getTime() ?? 0;
        const bTime = b.lastShownAt?.getTime() ?? 0;
        return aTime - bTime;
      });
      for (const p of pinnedSorted) {
        if (picks.length >= 3) break;
        picks.push(p);
      }

      if (picks.length < 3) {
        const pickedIds = new Set(picks.map(p => p.id));

        const strictEligible = openPrayers.filter(p => !pickedIds.has(p.id) && !recentIds.has(p.id));

        const yesterdayOnlyEligible = openPrayers.filter(p =>
          !pickedIds.has(p.id) && !yesterdayIds.includes(p.id)
        );

        const allEligible = openPrayers.filter(p => !pickedIds.has(p.id));

        let pool: typeof openPrayers;
        const needed = 3 - picks.length;

        if (strictEligible.length >= needed) {
          pool = strictEligible;
        } else if (yesterdayOnlyEligible.length >= needed) {
          pool = yesterdayOnlyEligible;
        } else {
          pool = allEligible;
        }

        if (pool.length > 0) {
          const weighted = pool.map(p => {
            let weight = 1;
            if (p.lastShownAt === null) weight += 5;
            else {
              const daysSince = (Date.now() - p.lastShownAt.getTime()) / (1000 * 60 * 60 * 24);
              weight += Math.min(daysSince, 10);
            }
            if (p.priority === 1) weight *= 2;
            if (recentIds.has(p.id)) weight *= 0.3;
            weight += Math.random() * 2;
            return { prayer: p, weight };
          });
          weighted.sort((a, b) => b.weight - a.weight);

          for (const w of weighted) {
            if (picks.length >= 3) break;
            picks.push(w.prayer);
          }
        }
      }

      const pickIds = picks.map(p => p.id);

      if (pickIds.length > 0) {
        await db.update(prayers)
          .set({ lastShownAt: new Date() })
          .where(and(eq(prayers.userId, userId), inArray(prayers.id, pickIds)));
      }

      await db.insert(dailyPrayerPicks).values({
        userId,
        dateKey: todayKey,
        prayerIds: pickIds,
      }).onConflictDoNothing();

      res.json({ dateKey: todayKey, prayers: picks, generatedAt: new Date() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Streak Tracking ──

  app.get("/api/prayer-streak", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      await ensureStreakRow(userId);
      const [streak] = await db
        .select()
        .from(prayerStreak)
        .where(eq(prayerStreak.userId, userId))
        .limit(1);
      res.json(streak);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/prayer-streak/complete-today", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      await ensureStreakRow(userId);
      const todayKey = getTodayDateKey();
      const yesterdayKey = getYesterdayDateKey();
      const [streak] = await db
        .select()
        .from(prayerStreak)
        .where(eq(prayerStreak.userId, userId))
        .limit(1);

      if (streak.lastCompletedDateKey === todayKey) {
        return res.json(streak);
      }

      let newStreak: number;
      if (streak.lastCompletedDateKey === yesterdayKey) {
        newStreak = streak.currentStreak + 1;
      } else {
        newStreak = 1;
      }

      const newLongest = Math.max(streak.longestStreak, newStreak);
      const [updated] = await db.update(prayerStreak).set({
        currentStreak: newStreak,
        lastCompletedDateKey: todayKey,
        longestStreak: newLongest,
      }).where(eq(prayerStreak.id, streak.id)).returning();

      try {
        const todayPicks = await db
          .select()
          .from(dailyPrayerPicks)
          .where(and(
            eq(dailyPrayerPicks.userId, userId),
            eq(dailyPrayerPicks.dateKey, todayKey),
          ))
          .limit(1);
        if (todayPicks.length > 0) {
          const pickIds = todayPicks[0].prayerIds as string[];
          if (pickIds.length > 0) {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            await db.update(prayers)
              .set({ lastPrayedAt: new Date(), updatedAt: new Date() })
              .where(and(
                eq(prayers.userId, userId),
                inArray(prayers.id, pickIds),
                or(
                  isNull(prayers.lastPrayedAt),
                  lte(prayers.lastPrayedAt, todayStart)
                )
              ));
          }
        }
      } catch (_) {}

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Auto-Archive Settings ──
  // App-wide settings (currently shared across all users for backward compat).
  // Mutations require an authenticated user so anonymous callers cannot
  // tamper with the global toggle.

  app.get("/api/settings/auto-archive", requireUser, async (_req: Request, res: Response) => {
    try {
      const rows = await db.select().from(appSettings)
        .where(inArray(appSettings.key, ["autoArchiveEnabled", "autoArchiveDays"]));
      let enabled = true;
      let days = 90;
      for (const row of rows) {
        if (row.key === "autoArchiveEnabled") enabled = row.value === "true";
        if (row.key === "autoArchiveDays") days = parseInt(row.value, 10) || 90;
      }
      res.json({ enabled, days });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/settings/auto-archive", requireUser, async (req: Request, res: Response) => {
    try {
      const { enabled, days } = req.body;
      const now = new Date();

      await db.insert(appSettings).values({
        key: "autoArchiveEnabled",
        value: String(enabled ?? true),
        updatedAt: now,
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(enabled ?? true), updatedAt: now },
      });

      await db.insert(appSettings).values({
        key: "autoArchiveDays",
        value: String(days ?? 90),
        updatedAt: now,
      }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(days ?? 90), updatedAt: now },
      });

      res.json({ enabled: enabled ?? true, days: days ?? 90 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Official Prayer Counts ──

  app.get("/api/officials/:id/prayer-counts", requireUser, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { id: officialId } = req.params;
      const allPrayers = await db
        .select()
        .from(prayers)
        .where(eq(prayers.userId, userId));

      let open = 0;
      let answered = 0;
      let archived = 0;

      for (const prayer of allPrayers) {
        const officialIds = prayer.officialIds as string[] | null;
        if (!officialIds || !officialIds.includes(officialId)) continue;

        switch (prayer.status) {
          case "OPEN":
            open++;
            break;
          case "ANSWERED":
            answered++;
            break;
          case "ARCHIVED":
            archived++;
            break;
        }
      }

      res.json({ open, answered, archived });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

}
