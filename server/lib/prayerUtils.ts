import { db } from "../db";
import { prayers } from "@shared/schema";
import { eq, and, not } from "drizzle-orm";

export async function processEventDateActions(): Promise<void> {
  try {
    const now = new Date();
    const openWithEvents = await db
      .select()
      .from(prayers)
      .where(and(eq(prayers.status, "OPEN"), not(eq(prayers.autoAfterEventAction, "none"))));

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
            .where(eq(prayers.id, prayer.id));
        } else if (prayer.autoAfterEventAction === "archive") {
          await db
            .update(prayers)
            .set({ status: "ARCHIVED", archivedAt: now, updatedAt: now })
            .where(eq(prayers.id, prayer.id));
        }
      }
    }
  } catch (_) {}
}
