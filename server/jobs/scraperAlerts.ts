import { db } from "../db";
import { scraperAlerts, type ScraperAlert } from "@shared/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export type ScraperAlertKind =
  | "SAFETY_ABORT"
  | "ZERO_PARSED"
  | "JOB_FAILED"
  | "SANITY_ABORT";

export type ScraperAlertSeverity = "warning" | "critical";

const RATE_LIMIT_MS = 6 * 60 * 60 * 1000;

interface RecordOpts {
  source: string;
  kind: ScraperAlertKind;
  message: string;
  severity?: ScraperAlertSeverity;
  details?: Record<string, unknown>;
}

export async function recordScraperAlert(opts: RecordOpts): Promise<void> {
  const { source, kind, message, severity = "warning", details } = opts;
  const now = new Date();

  try {
    const [existing] = await db
      .select()
      .from(scraperAlerts)
      .where(
        and(
          eq(scraperAlerts.source, source),
          eq(scraperAlerts.kind, kind),
          isNull(scraperAlerts.resolvedAt),
        ),
      )
      .orderBy(desc(scraperAlerts.lastSeenAt))
      .limit(1);

    if (existing) {
      const sinceLastSeen = now.getTime() - existing.lastSeenAt.getTime();
      const suppressed = sinceLastSeen < RATE_LIMIT_MS;

      await db
        .update(scraperAlerts)
        .set({
          lastSeenAt: now,
          occurrenceCount: sql`${scraperAlerts.occurrenceCount} + 1`,
          message,
          details: details ?? existing.details,
          severity,
        })
        .where(eq(scraperAlerts.id, existing.id));

      if (suppressed) {
        console.log(
          `[ScraperAlert] ${source}/${kind} suppressed (rate-limited; ${existing.occurrenceCount + 1} occurrences)`,
        );
      } else {
        console.error(
          `[ScraperAlert] ${source}/${kind} re-fired after ${(sinceLastSeen / 1000 / 60).toFixed(0)} min: ${message}`,
        );
      }
      return;
    }

    await db.insert(scraperAlerts).values({
      source,
      kind,
      severity,
      message,
      details,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
    });
    console.error(`[ScraperAlert] NEW ${severity} ${source}/${kind}: ${message}`);
  } catch (err) {
    console.error(`[ScraperAlert] Failed to record alert ${source}/${kind}:`, err);
  }
}

export interface ListAlertsOptions {
  includeResolved?: boolean;
  limit?: number;
}

export async function listScraperAlerts(
  opts: ListAlertsOptions = {},
): Promise<ScraperAlert[]> {
  const { includeResolved = false, limit = 100 } = opts;
  const query = db.select().from(scraperAlerts);
  const rows = includeResolved
    ? await query.orderBy(desc(scraperAlerts.lastSeenAt)).limit(limit)
    : await query
        .where(isNull(scraperAlerts.resolvedAt))
        .orderBy(desc(scraperAlerts.lastSeenAt))
        .limit(limit);
  return rows;
}

export async function countActiveScraperAlerts(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scraperAlerts)
    .where(isNull(scraperAlerts.resolvedAt));
  return count;
}

export async function resolveScraperAlert(id: string): Promise<boolean> {
  const result = await db
    .update(scraperAlerts)
    .set({ resolvedAt: new Date() })
    .where(and(eq(scraperAlerts.id, id), isNull(scraperAlerts.resolvedAt)))
    .returning({ id: scraperAlerts.id });
  return result.length > 0;
}
