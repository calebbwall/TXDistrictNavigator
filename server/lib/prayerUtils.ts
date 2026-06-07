import { db } from "../db";
import { prayers } from "@shared/schema";
import { eq, and, not, sql } from "drizzle-orm";

/**
 * Trusted background sweep — iterates every distinct userId and runs the
 * per-user event-date processor for each. Only call from server-side
 * schedulers, never from a request handler.
 */
export async function processEventDateActionsForAllUsers(): Promise<void> {
  try {
    const rows = await db
      .selectDistinct({ userId: prayers.userId })
      .from(prayers);
    for (const row of rows) {
      if (!row.userId) continue;
      await processEventDateActions(row.userId);
    }
  } catch (err) {
    console.error("[processEventDateActionsForAllUsers] failed:", err);
  }
}

/**
 * Process pending event-date auto-actions (mark answered / archive).
 *
 * MUST be called with a userId so one user's `GET /api/prayers` cannot
 * trigger state mutations on another user's rows. Every SELECT and UPDATE
 * is filtered by `prayers.userId`.
 */
export async function processEventDateActions(userId: string): Promise<void> {
  try {
    if (!userId) return;
    const now = new Date();
    const openWithEvents = await db
      .select()
      .from(prayers)
      .where(and(
        eq(prayers.userId, userId),
        eq(prayers.status, "OPEN"),
        not(eq(prayers.autoAfterEventAction, "none")),
      ));

    for (const prayer of openWithEvents) {
      if (!prayer.eventDate) continue;
      const triggerDate = new Date(prayer.eventDate);
      triggerDate.setDate(triggerDate.getDate() + (prayer.autoAfterEventDaysOffset || 0));
      if (now >= triggerDate) {
        if (prayer.autoAfterEventAction === "markAnswered") {
          await db
            .update(prayers)
            .set({
              status: "ANSWERED",
              answeredAt: now,
              answerNote: "Auto-marked answered after event date",
              updatedAt: now,
            })
            .where(and(eq(prayers.id, prayer.id), eq(prayers.userId, userId)));
        } else if (prayer.autoAfterEventAction === "archive") {
          await db
            .update(prayers)
            .set({ status: "ARCHIVED", archivedAt: now, updatedAt: now })
            .where(and(eq(prayers.id, prayer.id), eq(prayers.userId, userId)));
        }
      }
    }
  } catch (err) {
    console.error("[processEventDateActions] error:", err);
  }
}
