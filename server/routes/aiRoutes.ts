import type { Express, Request, Response } from "express";
import {
  parseNaturalLanguageSearch,
  summarizeBill,
  type BillSummaryContext,
} from "../services/groqService";

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
}
