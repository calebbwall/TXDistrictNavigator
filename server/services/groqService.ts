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
  billStatus?: string;
  enacted?: boolean;
  effectiveDate?: string;
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
        content: `You classify questions about Texas state government, its legislators, and legislation.
Return ONLY valid JSON with:
- intent: "officials" | "legislation" | "hearings" | "committees" | "general"
- entities: object with optional keys:
  - names: string[] (person name fragments)
  - billNumbers: string[] (e.g. "HB 1234", "SB 5", "HJR 20")
  - committeeKeywords: string[] (committee name fragments, e.g. "business" from "Business & Commerce")
  - party: "Republican" | "Democrat" (if filtering by party)
  - chamber: "TX House" | "TX Senate" | "US House" (if filtering by chamber)
  - keywords: string[] (city names, area names, topic keywords like "high profile", "important". IMPORTANT: for questions about cities/areas like "who represents Austin" or "officials from Dallas", put the city name in keywords and use "officials" intent)

Intent rules:
- "committees" — who is ON a committee, who chairs it, committee membership questions. Also use when asking about party members on a specific committee (e.g. "which Republicans are on X committee" → committees intent with party + committeeKeywords).
- "officials" — questions about specific legislators by name, district, city/area, or party WITHOUT a committee context. Use for "who represents [city]", "officials from [area]", "legislators in [city]". Put city/area names in keywords.
- "legislation" — questions about specific bills (HB/SB numbers), what a bill does, bill status, or bill topics. Use when user says "describe bill X" or "tell me about HB X".
- "hearings" — questions about upcoming hearings, scheduled meetings, what's on the calendar. Use for "upcoming hearings", "what's being heard this week", "highest profile hearings", or "tell me about the upcoming X committee hearing".
- "general" — broad stats, overview questions, or questions that don't fit the above.

Be precise with committeeKeywords — extract the distinguishing part of committee names (e.g. "Business & Commerce" → ["business", "commerce"], "State Affairs" → ["state affairs"], "Education" → ["education"]).`,
      },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 250,
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

/** Search the web using Google Custom Search API (100 free queries/day). Returns empty string if not configured. */
export async function searchWeb(query: string): Promise<string> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;
  if (!apiKey || !cx) return "";

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: query,
      num: "5",
    });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) return "";

    const data = await res.json();
    const items = (data.items ?? []).slice(0, 5);
    if (items.length === 0) return "";

    const lines = items.map((item: any, i: number) =>
      `${i + 1}. ${item.title}\n   ${item.snippet ?? ""}\n   Source: ${item.link}`
    );
    return `Web search results for "${query}":\n${lines.join("\n\n")}`;
  } catch {
    return "";
  }
}

export async function answerQuestion(question: string, dataContext: string, webContext?: string): Promise<string> {
  const hasWeb = webContext && webContext.length > 0;

  const systemPrompt = `You are a knowledgeable Texas legislative aide embedded in TXDistrictNavigator, an app for tracking Texas state government. Your audience understands how Texas government works (House, Senate, committees, the legislative process) but relies on you to stay current on who's where and what's happening.

Guidelines:
- Answer primarily from the provided app data context. For names, districts, bill numbers, dates, and official facts, rely strictly on the app data — never fabricate these.
- ${hasWeb ? "Web search results are also provided. Use them to supplement your answer with additional background, news context, or explanations the app data doesn't cover. Clearly distinguish app data (authoritative) from web context (supplementary)." : "If the data doesn't contain enough to answer, say so clearly and suggest what the user could ask instead."}
- Be direct and well-organized. Use bullet points for lists of people or hearings.
- For committee membership questions: list members with their party, district, and role (highlight Chair and Vice-Chair at the top).
- For hearing questions: lead with date/time, location, and committee, then summarize the agenda. Note bill count and witness count as indicators of significance.
- For bill questions: explain what the bill does in plain English, note its current status and any upcoming hearings.
- Keep responses concise but complete — don't truncate lists of members or agenda items unless there are many.
- Use "R" and "D" shorthand for party when listing multiple members.
- When asked about "high profile" or "important" hearings, assess based on: number of bills on the agenda, witness count, and committee prominence.`;

  const userContent = hasWeb
    ? `App data:\n${dataContext}\n\n${webContext}\n\nQuestion: ${question}`
    : `Data context:\n${dataContext}\n\nQuestion: ${question}`;

  const completion = await getClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 800,
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

  // Determine lifecycle framing from explicit fields or infer from action history
  const isEnacted =
    context.enacted ??
    context.actionHistory?.some((a) =>
      /signed|enrolled|effective|chaptered/i.test(a)
    ) ??
    false;
  const isPassed =
    !isEnacted &&
    (context.billStatus?.match(/passed|engrossed/i) != null ||
      context.actionHistory?.some((a) => /passed (house|senate)/i.test(a)) ??
      false);

  const lifecycleInstruction = isEnacted
    ? `This bill has been signed into law${context.effectiveDate ? ` (effective ${context.effectiveDate})` : ""}. Describe what it does in present tense — do NOT say "if passed" or "would".`
    : isPassed
    ? "This bill has passed at least one chamber. Describe what it does in present or near-certain future tense."
    : "Describe what this bill proposes to do if passed.";

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
        content: `Explain this Texas or US legislative bill in 2-3 plain English sentences for a general audience. ${lifecycleInstruction} Be concise and neutral. Do not start with 'This bill'.`,
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });
  return completion.choices[0].message.content?.trim() ?? "Summary unavailable.";
}
