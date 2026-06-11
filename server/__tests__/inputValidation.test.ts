/**
 * Input validation & injection-safety tests (Phase 2 debug pass, section 4).
 *
 * Covers the AI routes (type checks, size caps, actionHistory sanitization,
 * XSS payload safety), POST /api/officials/by-districts (enum validation and
 * single batched query), and the prayers customPeopleNames round-trip.
 *
 * Requires DATABASE_URL for the officials/prayers tests; AI-route validation
 * runs without a DB. GROQ_API_KEY is removed for the run so valid payloads
 * stop at the 503 "not configured" gate instead of calling the model.
 *
 * Run with: npx tsx server/__tests__/inputValidation.test.ts
 */
import express from "express";
import type { Server } from "http";
import { like } from "drizzle-orm";
import { signUserToken } from "../middleware/userAuth";

process.env.USER_TOKEN_SECRET =
  process.env.USER_TOKEN_SECRET ?? "p2-test-user-secret-0123456789abcdef";
delete process.env.GROQ_API_KEY;

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(
    actual === expected,
    `${message} (got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`,
  );
}

let baseUrl = "";
let tokenSeq = 0;

/** Fresh user per call group so the per-user AI rate limit never interferes. */
function freshToken(): string {
  return signUserToken(`p2-test-user-${Date.now()}-${tokenSeq++}`);
}

async function request(
  method: string,
  urlPath: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: any = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body: parsed };
}

const XSS = `<script>alert(document.cookie)</script><img src=x onerror=alert(1)>`;

async function testParseSearchValidation(): Promise<void> {
  console.log("\n[test] POST /api/ai/parse-search — input validation");
  const token = freshToken();

  const unauth = await request("POST", "/api/ai/parse-search", { query: "x" });
  assertEqual(unauth.status, 401, "no user token → 401");

  for (const [label, payload] of [
    ["missing query", {}],
    ["null query", { query: null }],
    ["numeric query", { query: 42 }],
    ["object query", { query: { $ne: 1 } }],
    ["array query", { query: ["a"] }],
    ["whitespace-only query", { query: "   " }],
  ] as const) {
    const r = await request("POST", "/api/ai/parse-search", payload, token);
    assertEqual(r.status, 400, `${label} → 400`);
  }

  const oversized = await request(
    "POST",
    "/api/ai/parse-search",
    { query: "x".repeat(10_001) },
    token,
  );
  assertEqual(oversized.status, 400, "10,001-char query → 400 (cap applied)");

  // A well-formed payload (including an XSS payload — it is data, not code)
  // passes validation and stops at the "not configured" gate: proves the
  // handler neither crashes nor reflects the raw payload.
  const xss = await request(
    "POST",
    "/api/ai/parse-search",
    { query: XSS },
    token,
  );
  assertEqual(
    xss.status,
    503,
    "XSS payload passes type checks → 503 (no Groq)",
  );
  assert(
    !JSON.stringify(xss.body).includes("<script>"),
    "response does not reflect the script payload",
  );
}

async function testSummarizeBillValidation(): Promise<void> {
  console.log("\n[test] POST /api/ai/summarize-bill — input validation");
  const token = freshToken();

  for (const [label, payload] of [
    ["empty body", {}],
    ["missing session", { billNumber: "HB 1" }],
    ["numeric billNumber", { billNumber: 1, session: "89R" }],
    ["null session", { billNumber: "HB 1", session: null }],
  ] as const) {
    const r = await request("POST", "/api/ai/summarize-bill", payload, token);
    assertEqual(r.status, 400, `${label} → 400`);
  }

  const badHistory = await request(
    "POST",
    "/api/ai/summarize-bill",
    { billNumber: "HB 1", session: "89R", actionHistory: "not-an-array" },
    token,
  );
  assertEqual(badHistory.status, 400, "non-array actionHistory → 400");

  const objHistory = await request(
    "POST",
    "/api/ai/summarize-bill",
    { billNumber: "HB 1", session: "89R", actionHistory: { role: "user" } },
    token,
  );
  assertEqual(objHistory.status, 400, "object actionHistory → 400");

  // Mixed-type array entries are sanitized (non-strings dropped), then the
  // handler proceeds to the Groq gate without throwing.
  const mixedHistory = await request(
    "POST",
    "/api/ai/summarize-bill",
    {
      billNumber: "HB 1",
      session: "89R",
      actionHistory: ["Filed", 42, null, { x: 1 }, "Referred to State Affairs"],
    },
    token,
  );
  assertEqual(
    mixedHistory.status,
    503,
    "mixed-type actionHistory sanitized → 503 (no crash before Groq gate)",
  );

  const hugeHistory = await request(
    "POST",
    "/api/ai/summarize-bill",
    {
      billNumber: "HB 1",
      session: "89R",
      actionHistory: Array.from({ length: 500 }, (_, i) => `Action ${i}`),
    },
    token,
  );
  assertEqual(
    hugeHistory.status,
    503,
    "500-entry actionHistory capped (slice 20) → 503, no crash",
  );
}

async function testAskValidation(): Promise<void> {
  console.log("\n[test] POST /api/ai/ask — input validation and rate limit");
  const token = freshToken();

  for (const [label, payload] of [
    ["missing question", {}],
    ["null question", { question: null }],
    ["numeric question", { question: 7 }],
    ["object question", { question: { q: "hi" } }],
  ] as const) {
    const r = await request("POST", "/api/ai/ask", payload, token);
    assertEqual(r.status, 400, `${label} → 400`);
  }

  const oversized = await request(
    "POST",
    "/api/ai/ask",
    { question: "y".repeat(2_001) },
    token,
  );
  assertEqual(oversized.status, 400, "2,001-char question → 400 (cap applied)");

  const xss = await request("POST", "/api/ai/ask", { question: XSS }, token);
  assertEqual(xss.status, 503, "XSS payload → 503 (no Groq), no crash");

  // Burst rate limit: 20/min per user. Requests above count toward it; use a
  // dedicated user and hammer until 429.
  const rlToken = freshToken();
  let got429 = false;
  let firstStatusOk = false;
  for (let i = 0; i < 25; i++) {
    const r = await request(
      "POST",
      "/api/ai/ask",
      { question: `ping ${i}` },
      rlToken,
    );
    if (i === 0) firstStatusOk = r.status === 503;
    if (r.status === 429) {
      got429 = true;
      assert(
        typeof r.body?.retryAfterSeconds === "number",
        "429 response carries retryAfterSeconds",
      );
      break;
    }
  }
  assert(firstStatusOk, "first request passes the rate limiter");
  assert(got429, "burst limit triggers 429 within 25 rapid requests");
}

async function testByDistrictsValidation(): Promise<void> {
  console.log(
    "\n[test] POST /api/officials/by-districts — validation & batching",
  );

  for (const [label, payload] of [
    ["missing districts", {}],
    ["non-array districts", { districts: "TX_HOUSE:1" }],
    ["empty districts", { districts: [] }],
  ] as const) {
    const r = await request("POST", "/api/officials/by-districts", payload);
    assertEqual(r.status, 400, `${label} → 400`);
  }

  const tooMany = await request("POST", "/api/officials/by-districts", {
    districts: Array.from({ length: 501 }, (_, i) => ({
      source: "TX_HOUSE",
      districtNumber: i + 1,
    })),
  });
  assertEqual(tooMany.status, 400, "501 districts → 400 (max 500)");

  // Invalid source enum values and malformed entries are skipped, not crashed on.
  const mixed = await request("POST", "/api/officials/by-districts", {
    districts: [
      { source: "TX_HOUSE", districtNumber: 1 },
      { source: "DROP TABLE official_public", districtNumber: 2 },
      { source: "US_SENATE", districtNumber: 3 },
      null,
      "garbage",
      { districtNumber: 4 },
      { source: "TX_SENATE" },
      { source: "TX_SENATE", districtNumber: 5 },
    ],
  });
  assertEqual(mixed.status, 200, "mixed valid/invalid entries → 200");
  assertEqual(
    mixed.body.officials?.length,
    2,
    "only the 2 valid entries produce results (invalid sources skipped)",
  );

  // 500 districts must run as one batched query, not 500 round-trips.
  const { pool } = await import("../db");
  const realQuery = pool.query.bind(pool);
  let queryCount = 0;
  (pool as { query: typeof pool.query }).query = ((...args: unknown[]) => {
    queryCount++;
    return (realQuery as (...a: unknown[]) => unknown)(...args);
  }) as typeof pool.query;
  let batch: { status: number; body: any };
  try {
    batch = await request("POST", "/api/officials/by-districts", {
      districts: Array.from({ length: 500 }, (_, i) => ({
        source: (["TX_HOUSE", "TX_SENATE", "US_HOUSE"] as const)[i % 3],
        districtNumber: (i % 150) + 1,
      })),
    });
  } finally {
    (pool as { query: typeof pool.query }).query = realQuery;
  }
  assertEqual(batch.status, 200, "500 districts → 200");
  assertEqual(
    batch.body.officials?.length,
    500,
    "every requested district gets a result (official or vacant placeholder)",
  );
  console.log(`  ℹ 500-district request used ${queryCount} DB queries`);
  assert(
    queryCount <= 3,
    `batched lookup uses ≤ 3 queries for 500 districts (got ${queryCount})`,
  );
}

async function testCustomPeopleNamesRoundTrip(): Promise<void> {
  console.log(
    "\n[test] prayers customPeopleNames — client→server→client round-trip",
  );
  const token = freshToken();

  const names = ["Ann Richards", `O'Brien, \"Tex\"`, "李明", XSS];
  const created = await request(
    "POST",
    "/api/prayers",
    {
      title: "P2TEST round-trip prayer",
      body: "test body",
      customPeopleNames: names,
    },
    token,
  );
  assertEqual(created.status, 201, "prayer created");
  assertEqual(
    JSON.stringify(created.body.customPeopleNames),
    JSON.stringify(names),
    "POST response echoes the exact array (incl. quotes, unicode, markup-as-data)",
  );

  const fetched = await request(
    "GET",
    "/api/prayers?limit=50",
    undefined,
    token,
  );
  assertEqual(fetched.status, 200, "GET /api/prayers succeeds");
  const mine = (fetched.body as any[]).find((p) => p.id === created.body.id);
  assert(mine !== undefined, "created prayer is returned to its owner");
  assertEqual(
    JSON.stringify(mine?.customPeopleNames),
    JSON.stringify(names),
    "retrieved customPeopleNames match what was stored, byte for byte",
  );

  // Empty array round-trip and default
  const emptyArr = await request(
    "POST",
    "/api/prayers",
    { title: "P2TEST empty", body: "b", customPeopleNames: [] },
    token,
  );
  assertEqual(emptyArr.status, 201, "empty customPeopleNames accepted");
  assertEqual(
    JSON.stringify(emptyArr.body.customPeopleNames),
    "[]",
    "empty array round-trips as []",
  );

  const omitted = await request(
    "POST",
    "/api/prayers",
    { title: "P2TEST omitted", body: "b" },
    token,
  );
  assertEqual(omitted.status, 201, "omitted customPeopleNames accepted");
  assertEqual(
    JSON.stringify(omitted.body.customPeopleNames),
    "[]",
    "omitted field defaults to []",
  );

  // Another user cannot see these prayers (scoping check)
  const stranger = await request(
    "GET",
    "/api/prayers?limit=50",
    undefined,
    freshToken(),
  );
  assert(
    !(stranger.body as any[]).some((p) => p.id === created.body.id),
    "another user's listing does not include this prayer",
  );
}

// ── main ──
async function main(): Promise<void> {
  console.log("==========================================");
  console.log("Input Validation & Injection Safety");
  console.log("==========================================");

  const app = express();
  app.use(express.json({ limit: "5mb" }));

  const { registerAiRoutes } = await import("../routes/aiRoutes");
  registerAiRoutes(app);

  const hasDb = Boolean(process.env.DATABASE_URL);
  if (hasDb) {
    const { registerOfficialsRoutes } = await import(
      "../routes/officialsRoutes"
    );
    const { registerPrayerRoutes } = await import("../routes/prayerRoutes");
    registerOfficialsRoutes(app);
    registerPrayerRoutes(app);
  }

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await testParseSearchValidation();
    await testSummarizeBillValidation();
    await testAskValidation();
    if (hasDb) {
      await testByDistrictsValidation();
      await testCustomPeopleNamesRoundTrip();
    } else {
      console.log(
        "\nℹ DATABASE_URL not set — skipping by-districts and prayers tests",
      );
    }
  } finally {
    server.close();
    if (hasDb) {
      const { db, pool } = await import("../db");
      const { prayers } = await import("../../shared/schema");
      await db.delete(prayers).where(like(prayers.title, "P2TEST%"));
      await pool.end();
    }
  }

  console.log("\n==========================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==========================================");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
