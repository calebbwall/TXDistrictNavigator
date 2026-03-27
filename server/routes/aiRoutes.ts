import type { Express, Request, Response } from "express";
import {
  parseNaturalLanguageSearch,
  summarizeBill,
  classifyIntent,
  answerQuestion,
  type BillSummaryContext,
} from "../services/groqService";
import { db } from "../db";
import {
  officialPublic,
  committeeMemberships,
  committees,
  bills,
  billActions,
  legislativeEvents,
  hearingDetails,
  hearingAgendaItems,
} from "@shared/schema";
import { eq, ilike, or, and, gte, asc, desc, inArray } from "drizzle-orm";

export function registerAiRoutes(app: Express) {
  // POST /api/ai/parse-search
  // Body: { query: string }
  // Returns: NLSearchFilters
  app.post("/api/ai/parse-search", async (req: Request, res: Response) => {
    const { query } = req.body ?? {};
    if (!query?.trim()) {
      return res.status(400).json({ error: "query is required" });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI search is not configured" });
    }
    const filters = await parseNaturalLanguageSearch(query as string);
    res.json(filters);
  });

  // POST /api/ai/summarize-bill
  // Body: BillSummaryContext
  // Returns: { summary: string }
  app.post("/api/ai/summarize-bill", async (req: Request, res: Response) => {
    const context = req.body as BillSummaryContext;
    if (!context?.billNumber || !context?.session) {
      return res.status(400).json({ error: "billNumber and session are required" });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI summarization is not configured" });
    }
    const summary = await summarizeBill(context);
    res.json({ summary });
  });

  // POST /api/ai/ask
  // Body: { question: string }
  // Returns: { answer: string }
  app.post("/api/ai/ask", async (req: Request, res: Response) => {
    const { question } = req.body ?? {};
    if (!question?.trim()) {
      return res.status(400).json({ error: "question is required" });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: "AI is not configured" });
    }

    try {
      const classification = await classifyIntent(question as string);
      const { intent, entities } = classification;
      let dataContext = "";

      if (intent === "officials" || intent === "committees") {
        // Build query filters
        const conditions: any[] = [eq(officialPublic.active, true)];

        if (entities.party) {
          const partyCode = entities.party.toLowerCase().startsWith("r") ? "R"
            : entities.party.toLowerCase().startsWith("d") ? "D" : null;
          if (partyCode) conditions.push(eq(officialPublic.party, partyCode));
        }

        if (entities.chamber) {
          const sourceMap: Record<string, string> = {
            "TX House": "TX_HOUSE",
            "TX Senate": "TX_SENATE",
            "US House": "US_HOUSE",
          };
          const src = sourceMap[entities.chamber];
          if (src) conditions.push(eq(officialPublic.source, src as any));
        }

        if (entities.names?.length) {
          const nameConditions = entities.names.map(n => ilike(officialPublic.fullName, `%${n}%`));
          conditions.push(or(...nameConditions)!);
        }

        if (entities.committeeKeywords?.length) {
          // Find committees matching keywords, then get their member officials
          const cmteConditions = entities.committeeKeywords.map(kw => ilike(committees.name, `%${kw}%`));
          const matchingCommittees = await db
            .select({ id: committees.id, name: committees.name })
            .from(committees)
            .where(or(...cmteConditions)!)
            .limit(5);

          if (matchingCommittees.length > 0) {
            const cmteIds = matchingCommittees.map(c => c.id);
            const memberships = await db
              .select({
                officialId: committeeMemberships.officialPublicId,
                role: committeeMemberships.role,
                committeeName: committees.name,
              })
              .from(committeeMemberships)
              .innerJoin(committees, eq(committeeMemberships.committeeId, committees.id))
              .where(inArray(committeeMemberships.committeeId, cmteIds))
              .limit(60);

            if (memberships.length > 0) {
              const memberIds = [...new Set(memberships.map(m => m.officialId).filter(Boolean) as string[])];
              const officialsData = await db
                .select({ id: officialPublic.id, fullName: officialPublic.fullName, party: officialPublic.party, source: officialPublic.source, district: officialPublic.district, roleTitle: officialPublic.roleTitle })
                .from(officialPublic)
                .where(inArray(officialPublic.id, memberIds.slice(0, 40)))
                .limit(40);

              const memberMap = new Map(memberships.map(m => [m.officialId, { role: m.role, committee: m.committeeName }]));
              const lines = officialsData.map(o => {
                const membership = memberMap.get(o.id);
                const party = o.party === "R" ? "Republican" : o.party === "D" ? "Democrat" : o.party ?? "Unknown";
                return `${o.fullName} (${party}, ${o.source.replace("_", " ")}, District ${o.district})${membership ? ` — ${membership.committee}, ${membership.role}` : ""}`;
              });
              dataContext = `Committee members:\n${lines.join("\n")}`;
            }
          }
        }

        if (!dataContext) {
          const officials = await db
            .select({ id: officialPublic.id, fullName: officialPublic.fullName, party: officialPublic.party, source: officialPublic.source, district: officialPublic.district, roleTitle: officialPublic.roleTitle, searchCities: officialPublic.searchCities })
            .from(officialPublic)
            .where(and(...conditions))
            .orderBy(asc(officialPublic.source), asc(officialPublic.district))
            .limit(40);

          const lines = officials.map(o => {
            const party = o.party === "R" ? "Republican" : o.party === "D" ? "Democrat" : o.party ?? "Unknown";
            const role = o.roleTitle ? ` (${o.roleTitle})` : "";
            const cities = o.searchCities ? ` [cities: ${o.searchCities}]` : "";
            return `${o.fullName}${role} — ${party}, ${o.source.replace("_", " ")}, District ${o.district}${cities}`;
          });
          dataContext = officials.length > 0
            ? `Legislators (${officials.length} total):\n${lines.join("\n")}`
            : "No matching legislators found.";
        }

      } else if (intent === "legislation") {
        const billConditions: any[] = [];

        if (entities.billNumbers?.length) {
          billConditions.push(or(...entities.billNumbers.map(bn => ilike(bills.billNumber, `%${bn.replace(/\s+/g, "")}%`)))!);
        } else if (entities.keywords?.length) {
          billConditions.push(or(...entities.keywords.map(kw => ilike(bills.caption, `%${kw}%`)))!);
        }

        const billsData = await db
          .select({ id: bills.id, billNumber: bills.billNumber, legSession: bills.legSession, caption: bills.caption })
          .from(bills)
          .where(billConditions.length > 0 ? and(...billConditions) : undefined)
          .orderBy(desc(bills.updatedAt))
          .limit(15);

        if (billsData.length > 0) {
          const billIds = billsData.map(b => b.id);
          const actionsData = await db
            .select({ billId: billActions.billId, actionText: billActions.actionText, actionAt: billActions.actionAt })
            .from(billActions)
            .where(inArray(billActions.billId, billIds))
            .orderBy(desc(billActions.actionAt))
            .limit(75);

          const actionsByBill = new Map<string, string[]>();
          for (const a of actionsData) {
            const existing = actionsByBill.get(a.billId) ?? [];
            if (existing.length < 5) {
              existing.push(a.actionText);
              actionsByBill.set(a.billId, existing);
            }
          }

          const lines = billsData.map(b => {
            const actions = actionsByBill.get(b.id) ?? [];
            const actionStr = actions.length > 0 ? `\n  Recent actions: ${actions.slice(0, 3).join("; ")}` : "";
            return `${b.billNumber} (Session ${b.legSession}): ${b.caption ?? "No caption"}${actionStr}`;
          });
          dataContext = `Bills:\n${lines.join("\n\n")}`;
        } else {
          dataContext = "No matching bills found.";
        }

      } else if (intent === "hearings") {
        const now = new Date();
        const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        const events = await db
          .select({
            id: legislativeEvents.id,
            title: legislativeEvents.title,
            startsAt: legislativeEvents.startsAt,
            location: legislativeEvents.location,
            chamber: legislativeEvents.chamber,
          })
          .from(legislativeEvents)
          .where(and(
            eq(legislativeEvents.eventType, "HEARING"),
            gte(legislativeEvents.startsAt, now),
            gte(twoWeeksOut, legislativeEvents.startsAt),
          ))
          .orderBy(asc(legislativeEvents.startsAt))
          .limit(10);

        if (events.length > 0) {
          const eventIds = events.map(e => e.id);
          const agendaItems = await db
            .select({ eventId: hearingAgendaItems.eventId, billNumber: hearingAgendaItems.billNumber, itemText: hearingAgendaItems.itemText })
            .from(hearingAgendaItems)
            .where(inArray(hearingAgendaItems.eventId, eventIds))
            .orderBy(asc(hearingAgendaItems.sortOrder))
            .limit(60);

          const agendaByEvent = new Map<string, string[]>();
          for (const item of agendaItems) {
            const existing = agendaByEvent.get(item.eventId) ?? [];
            existing.push(item.billNumber ? `${item.billNumber}: ${item.itemText}` : item.itemText);
            agendaByEvent.set(item.eventId, existing);
          }

          const lines = events.map(e => {
            const dateStr = e.startsAt ? e.startsAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }) : "TBD";
            const agenda = agendaByEvent.get(e.id) ?? [];
            const agendaStr = agenda.length > 0 ? `\n  Bills: ${agenda.slice(0, 5).join("; ")}` : "";
            return `${e.title} — ${dateStr}${e.location ? ` at ${e.location}` : ""}${agendaStr}`;
          });
          dataContext = `Upcoming hearings (next 14 days):\n${lines.join("\n\n")}`;
        } else {
          dataContext = "No upcoming hearings found in the next 14 days.";
        }

      } else {
        // General: fetch summary stats + next 3 hearings
        const [txHouseCount, txSenateCount, usHouseCount, otherTxCount] = await Promise.all([
          db.select({ count: officialPublic.id }).from(officialPublic).where(and(eq(officialPublic.source, "TX_HOUSE"), eq(officialPublic.active, true))),
          db.select({ count: officialPublic.id }).from(officialPublic).where(and(eq(officialPublic.source, "TX_SENATE"), eq(officialPublic.active, true))),
          db.select({ count: officialPublic.id }).from(officialPublic).where(and(eq(officialPublic.source, "US_HOUSE"), eq(officialPublic.active, true))),
          db.select({ count: officialPublic.id }).from(officialPublic).where(and(eq(officialPublic.source, "OTHER_TX"), eq(officialPublic.active, true))),
        ]);

        const now = new Date();
        const nextHearings = await db
          .select({ title: legislativeEvents.title, startsAt: legislativeEvents.startsAt })
          .from(legislativeEvents)
          .where(and(eq(legislativeEvents.eventType, "HEARING"), gte(legislativeEvents.startsAt, now)))
          .orderBy(asc(legislativeEvents.startsAt))
          .limit(3);

        const hearingLines = nextHearings.map(h => {
          const dateStr = h.startsAt ? h.startsAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }) : "TBD";
          return `${h.title} (${dateStr})`;
        });

        dataContext = `App summary:
TX House members: ${txHouseCount.length}
TX Senate members: ${txSenateCount.length}
US House members (TX): ${usHouseCount.length}
Other TX officials: ${otherTxCount.length}
${nextHearings.length > 0 ? `\nNext hearings:\n${hearingLines.join("\n")}` : "No upcoming hearings."}`;
      }

      const answer = await answerQuestion(question as string, dataContext);
      res.json({ answer });
    } catch (err) {
      console.error("[/api/ai/ask] error:", err);
      res.status(500).json({ error: "Failed to process your question. Please try again." });
    }
  });
}
