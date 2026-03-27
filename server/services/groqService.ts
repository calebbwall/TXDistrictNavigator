import Groq from "groq-sdk";

let _groq: Groq | null = null;

function getClient(): Groq {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY environment variable is not set");
    _groq = new Groq({ apiKey });
  }
  return _groq;
}

export interface NLSearchFilters {
  party?: string;
  chamber?: string;
  committeeKeyword?: string;
  nameKeyword?: string;
  districtNumber?: number;
}

export async function parseNaturalLanguageSearch(
  query: string
): Promise<NLSearchFilters> {
  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You extract search filters from queries about Texas and US legislators.
Return ONLY valid JSON with these optional keys:
- party: "Republican" | "Democrat" | "Independent"
- chamber: "TX Senate" | "TX House" | "US House"
- committeeKeyword: string (partial committee name)
- nameKeyword: string (person name fragment)
- districtNumber: number
Omit keys that cannot be determined. Never include explanations outside JSON.`,
      },
      { role: "user", content: query },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 150,
  });
  try {
    return JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    return {};
  }
}

export interface BillSummaryContext {
  billNumber: string;
  session: string;
  caption?: string;
  agendaItemText?: string;
  actionHistory?: string[];
  witnessPositions?: { for: number; against: number; on: number };
}

export interface IntentClassification {
  intent: "officials" | "legislation" | "hearings" | "committees" | "general";
  entities: {
    names?: string[];
    billNumbers?: string[];
    committeeKeywords?: string[];
    party?: string;
    chamber?: string;
    keywords?: string[];
  };
}

export async function classifyIntent(question: string): Promise<IntentClassification> {
  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `Classify questions about Texas and US legislators and legislation.
Return ONLY valid JSON with:
- intent: "officials" | "legislation" | "hearings" | "committees" | "general"
- entities: object with optional keys:
  - names: string[] (person name fragments mentioned)
  - billNumbers: string[] (bill numbers like "HB 1234", "SB 5")
  - committeeKeywords: string[] (committee name fragments)
  - party: "Republican" | "Democrat" | "Independent" (if mentioned)
  - chamber: "TX House" | "TX Senate" | "US House" (if mentioned)
  - keywords: string[] (other relevant search terms)
Use "officials" for questions about legislators/people, "committees" for committee membership/chairs, "legislation" for bills/laws, "hearings" for upcoming hearings/calendars, "general" for stats or mixed questions.`,
      },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 200,
  });
  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    return {
      intent: parsed.intent ?? "general",
      entities: parsed.entities ?? {},
    };
  } catch {
    return { intent: "general", entities: {} };
  }
}

export async function answerQuestion(question: string, dataContext: string): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "You are a knowledgeable assistant for TXDistrictNavigator, an app tracking Texas and US legislators and legislation. Answer the user's question using only the provided data context. Be concise and factual. If the data context doesn't contain enough information to answer, say so clearly. Do not make up names, numbers, or facts.",
      },
      {
        role: "user",
        content: `Data context:\n${dataContext}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 400,
  });
  return completion.choices[0].message.content?.trim() ?? "I couldn't generate an answer. Please try again.";
}

export async function summarizeBill(context: BillSummaryContext): Promise<string> {
  const witnessLine = context.witnessPositions
    ? `Registered witnesses: ${context.witnessPositions.for} for, ${context.witnessPositions.against} against, ${context.witnessPositions.on} neutral.`
    : "";
  const actionsLine = context.actionHistory?.length
    ? `Recent actions: ${context.actionHistory.slice(0, 5).join("; ")}.`
    : "";

  const prompt = `Bill: ${context.billNumber} (Session ${context.session})
Caption: ${context.caption ?? "Not provided"}
Agenda description: ${context.agendaItemText ?? "Not provided"}
${actionsLine}
${witnessLine}`;

  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "Explain this Texas or US legislative bill in 2-3 plain English sentences for a general audience. Focus on what the bill would do if passed. Be concise and neutral. Do not start with 'This bill'.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });
  return completion.choices[0].message.content?.trim() ?? "Summary unavailable.";
}
