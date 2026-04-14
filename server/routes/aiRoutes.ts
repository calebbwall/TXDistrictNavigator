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
import { eq, ilike, or, and, gte, lte, asc, desc, inArray, sql } from "drizzle-orm";

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

      // Resolve party code from entity
      const partyCode = entities.party
        ? entities.party.toLowerCase().startsWith("r") ? "R"
          : entities.party.toLowerCase().startsWith("d") ? "D" : null
        : null;

      // Resolve source/chamber from entity
      const sourceMap: Record<string, string> = {
        "TX House": "TX_HOUSE",
        "TX Senate": "TX_SENATE",
        "US House": "US_HOUSE",
      };
      const sourceCode = entities.chamber ? sourceMap[entities.chamber] ?? null : null;

      if (intent === "officials" || intent === "committees") {
        // Build query filters for officials
        const conditions: any[] = [eq(officialPublic.active, true)];
        if (partyCode) conditions.push(eq(officialPublic.party, partyCode));
        if (sourceCode) conditions.push(eq(officialPublic.source, sourceCode as any));

        if (entities.names?.length) {
          const nameConditions = entities.names.map(n => ilike(officialPublic.fullName, `%${n}%`));
          conditions.push(or(...nameConditions)!);
        }

        if (entities.committeeKeywords?.length) {
          // Find committees matching keywords, then get their member officials
          const cmteConditions = entities.committeeKeywords.map(kw => ilike(committees.name, `%${kw}%`));
          const matchingCommittees = await db
            .select({ id: committees.id, name: committees.name, chamber: committees.chamber })
            .from(committees)
            .where(or(...cmteConditions)!)
            .limit(5);

          if (matchingCommittees.length > 0) {
            const cmteIds = matchingCommittees.map(c => c.id);
            const memberships = await db
              .select({
                officialId: committeeMemberships.officialPublicId,
                roleTitle: committeeMemberships.roleTitle,
                memberName: committeeMemberships.memberName,
                committeeName: committees.name,
              })
              .from(committeeMemberships)
              .innerJoin(committees, eq(committeeMemberships.committeeId, committees.id))
              .where(inArray(committeeMemberships.committeeId, cmteIds))
              .limit(80);

            if (memberships.length > 0) {
              const memberIds = [...new Set(memberships.map(m => m.officialId).filter(Boolean) as string[])];

              // Fetch officials, applying party/chamber filters
              const officialConditions: any[] = [inArray(officialPublic.id, memberIds.slice(0, 60))];
              if (partyCode) officialConditions.push(eq(officialPublic.party, partyCode));
              if (sourceCode) officialConditions.push(eq(officialPublic.source, sourceCode as any));

              const officialsData = await db
                .select({ id: officialPublic.id, fullName: officialPublic.fullName, party: officialPublic.party, source: officialPublic.source, district: officialPublic.district })
                .from(officialPublic)
                .where(and(...officialConditions))
                .limit(60);

              const memberMap = new Map(memberships.map(m => [m.officialId, { roleTitle: m.roleTitle, committee: m.committeeName, memberName: m.memberName }]));
              const lines = officialsData.map(o => {
                const membership = memberMap.get(o.id);
                const party = o.party === "R" ? "Republican" : o.party === "D" ? "Democrat" : o.party ?? "Unknown";
                const role = membership?.roleTitle ? ` [${membership.roleTitle}]` : "";
                return `${o.fullName} (${party}, ${o.source.replace(/_/g, " ")}, District ${o.district}) — ${membership?.committee ?? ""}${role}`;
              });

              // Also include members who weren't linked to an official record
              const linkedIds = new Set(officialsData.map(o => o.id));
              const unlinkedMembers = memberships.filter(m => !m.officialId || !linkedIds.has(m.officialId));
              if (unlinkedMembers.length > 0 && !partyCode && !sourceCode) {
                for (const m of unlinkedMembers) {
                  const role = m.roleTitle ? ` [${m.roleTitle}]` : "";
                  lines.push(`${m.memberName} — ${m.committeeName}${role}`);
                }
              }

              const cmteNames = matchingCommittees.map(c => c.name).join(", ");
              const partyLabel = partyCode ? (partyCode === "R" ? "Republican " : "Democrat ") : "";
              dataContext = lines.length > 0
                ? `${partyLabel}members of ${cmteNames} (${lines.length} found):\n${lines.join("\n")}`
                : `No ${partyLabel.toLowerCase()}members found for ${cmteNames}.`;
            }
          }
        }

        if (!dataContext) {
          const officials = await db
            .select({ id: officialPublic.id, fullName: officialPublic.fullName, party: officialPublic.party, source: officialPublic.source, district: officialPublic.district, roleTitle: officialPublic.roleTitle, searchCities: officialPublic.searchCities })
            .from(officialPublic)
            .where(and(...conditions))
            .orderBy(asc(officialPublic.source), asc(officialPublic.district))
            .limit(50);

          const lines = officials.map(o => {
            const party = o.party === "R" ? "Republican" : o.party === "D" ? "Democrat" : o.party ?? "Unknown";
            const role = o.roleTitle ? ` (${o.roleTitle})` : "";
            const cities = o.searchCities ? ` [cities: ${o.searchCities}]` : "";
            return `${o.fullName}${role} — ${party}, ${o.source.replace(/_/g, " ")}, District ${o.district}${cities}`;
          });
          dataContext = officials.length > 0
            ? `Legislators (${officials.length} found):\n${lines.join("\n")}`
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

          // Also check if any of these bills appear on upcoming hearing agendas
          const upcomingAgenda = await db
            .select({
              billNumber: hearingAgendaItems.billNumber,
              hearingTitle: legislativeEvents.title,
              hearingDate: legislativeEvents.startsAt,
            })
            .from(hearingAgendaItems)
            .innerJoin(legislativeEvents, eq(hearingAgendaItems.eventId, legislativeEvents.id))
            .where(and(
              inArray(hearingAgendaItems.billId, billIds),
              gte(legislativeEvents.startsAt, new Date()),
            ))
            .limit(20);

          const hearingByBill = new Map<string, string>();
          for (const a of upcomingAgenda) {
            if (a.billNumber && !hearingByBill.has(a.billNumber)) {
              const dateStr = a.hearingDate ? a.hearingDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }) : "TBD";
              hearingByBill.set(a.billNumber, `${a.hearingTitle} on ${dateStr}`);
            }
          }

          const lines = billsData.map(b => {
            const actions = actionsByBill.get(b.id) ?? [];
            const actionStr = actions.length > 0 ? `\n  Recent actions: ${actions.slice(0, 3).join("; ")}` : "";
            const hearingStr = hearingByBill.has(b.billNumber) ? `\n  Upcoming hearing: ${hearingByBill.get(b.billNumber)}` : "";
            return `${b.billNumber} (Session ${b.legSession}): ${b.caption ?? "No caption"}${actionStr}${hearingStr}`;
          });
          dataContext = `Bills:\n${lines.join("\n\n")}`;
        } else {
          dataContext = "No matching bills found in the database.";
        }

      } else if (intent === "hearings") {
        const now = new Date();
        const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        // Build hearing query conditions
        const hearingConditions: any[] = [
          eq(legislativeEvents.eventType, "COMMITTEE_HEARING"),
          gte(legislativeEvents.startsAt, now),
          lte(legislativeEvents.startsAt, twoWeeksOut),
        ];

        // Filter by committee name if keywords provided
        let committeeFilter: string[] | null = null;
        if (entities.committeeKeywords?.length) {
          const cmteConditions = entities.committeeKeywords.map(kw => ilike(committees.name, `%${kw}%`));
          const matchingCmtes = await db
            .select({ id: committees.id, name: committees.name })
            .from(committees)
            .where(or(...cmteConditions)!)
            .limit(5);
          if (matchingCmtes.length > 0) {
            committeeFilter = matchingCmtes.map(c => c.id);
            hearingConditions.push(inArray(legislativeEvents.committeeId, committeeFilter));
          }
        }

        // Filter by chamber if specified
        if (sourceCode) {
          hearingConditions.push(eq(legislativeEvents.chamber, sourceCode));
        }

        const events = await db
          .select({
            id: legislativeEvents.id,
            title: legislativeEvents.title,
            startsAt: legislativeEvents.startsAt,
            location: legislativeEvents.location,
            chamber: legislativeEvents.chamber,
            status: legislativeEvents.status,
            committeeName: committees.name,
            witnessCount: hearingDetails.witnessCount,
            meetingType: hearingDetails.meetingType,
          })
          .from(legislativeEvents)
          .leftJoin(committees, eq(committees.id, legislativeEvents.committeeId))
          .leftJoin(hearingDetails, eq(hearingDetails.eventId, legislativeEvents.id))
          .where(and(...hearingConditions))
          .orderBy(asc(legislativeEvents.startsAt))
          .limit(20);

        if (events.length > 0) {
          const eventIds = events.map(e => e.id);

          // Get agenda items and bill counts per event
          const agendaItems = await db
            .select({ eventId: hearingAgendaItems.eventId, billNumber: hearingAgendaItems.billNumber, itemText: hearingAgendaItems.itemText })
            .from(hearingAgendaItems)
            .where(inArray(hearingAgendaItems.eventId, eventIds))
            .orderBy(asc(hearingAgendaItems.sortOrder))
            .limit(100);

          const agendaByEvent = new Map<string, string[]>();
          const billCountByEvent = new Map<string, number>();
          for (const item of agendaItems) {
            const existing = agendaByEvent.get(item.eventId) ?? [];
            existing.push(item.billNumber ? `${item.billNumber}: ${item.itemText}` : item.itemText);
            agendaByEvent.set(item.eventId, existing);
            billCountByEvent.set(item.eventId, (billCountByEvent.get(item.eventId) ?? 0) + 1);
          }

          const lines = events.map(e => {
            const dateStr = e.startsAt
              ? e.startsAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago" })
              : "TBD";
            const chamberStr = e.chamber === "TX_HOUSE" ? "House" : e.chamber === "TX_SENATE" ? "Senate" : "";
            const billCount = billCountByEvent.get(e.id) ?? 0;
            const witnessStr = e.witnessCount ? `${e.witnessCount} witnesses` : "";
            const billStr = billCount > 0 ? `${billCount} bills` : "";
            const stats = [billStr, witnessStr].filter(Boolean).join(", ");
            const agenda = agendaByEvent.get(e.id) ?? [];
            const agendaStr = agenda.length > 0 ? `\n  Agenda: ${agenda.slice(0, 6).join("; ")}` : "";
            return `${chamberStr ? `[${chamberStr}] ` : ""}${e.committeeName ?? e.title} — ${dateStr}${e.location ? `, ${e.location}` : ""} (${e.status})${stats ? `\n  ${stats}` : ""}${agendaStr}`;
          });
          dataContext = `Upcoming hearings (next 14 days, ${events.length} found):\n${lines.join("\n\n")}`;
        } else {
          dataContext = "No upcoming hearings found in the next 14 days.";
        }

      } else {
        // General: fetch summary stats + next 5 hearings with details
        const [txHouseCount, txSenateCount, usHouseCount, otherTxCount, cmteCount] = await Promise.all([
          db.select({ cnt: sql<number>`count(*)` }).from(officialPublic).where(and(eq(officialPublic.source, "TX_HOUSE"), eq(officialPublic.active, true))),
          db.select({ cnt: sql<number>`count(*)` }).from(officialPublic).where(and(eq(officialPublic.source, "TX_SENATE"), eq(officialPublic.active, true))),
          db.select({ cnt: sql<number>`count(*)` }).from(officialPublic).where(and(eq(officialPublic.source, "US_HOUSE"), eq(officialPublic.active, true))),
          db.select({ cnt: sql<number>`count(*)` }).from(officialPublic).where(and(eq(officialPublic.source, "OTHER_TX"), eq(officialPublic.active, true))),
          db.select({ cnt: sql<number>`count(*)` }).from(committees),
        ]);

        const now = new Date();
        const nextHearings = await db
          .select({
            title: legislativeEvents.title,
            startsAt: legislativeEvents.startsAt,
            chamber: legislativeEvents.chamber,
            committeeName: committees.name,
          })
          .from(legislativeEvents)
          .leftJoin(committees, eq(committees.id, legislativeEvents.committeeId))
          .where(and(eq(legislativeEvents.eventType, "COMMITTEE_HEARING"), gte(legislativeEvents.startsAt, now)))
          .orderBy(asc(legislativeEvents.startsAt))
          .limit(5);

        const hearingLines = nextHearings.map(h => {
          const dateStr = h.startsAt ? h.startsAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago" }) : "TBD";
          const chamberStr = h.chamber === "TX_HOUSE" ? "House" : h.chamber === "TX_SENATE" ? "Senate" : "";
          return `[${chamberStr}] ${h.committeeName ?? h.title} — ${dateStr}`;
        });

        dataContext = `Texas Legislature overview:
TX House members: ${txHouseCount[0]?.cnt ?? 0}
TX Senate members: ${txSenateCount[0]?.cnt ?? 0}
US House members (TX delegation): ${usHouseCount[0]?.cnt ?? 0}
Other statewide officials: ${otherTxCount[0]?.cnt ?? 0}
Committees tracked: ${cmteCount[0]?.cnt ?? 0}
${nextHearings.length > 0 ? `\nNext ${nextHearings.length} upcoming hearings:\n${hearingLines.join("\n")}` : "No upcoming hearings."}`;
      }

      const answer = await answerQuestion(question as string, dataContext);
      res.json({ answer });
    } catch (err) {
      console.error("[/api/ai/ask] error:", err);
      res.status(500).json({ error: "Failed to process your question. Please try again." });
    }
  });
}
