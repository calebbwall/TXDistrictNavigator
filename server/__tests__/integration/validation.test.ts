/**
 * Section 4 — Input validation & XSS/injection prevention.
 *
 * AI routes are exercised with GROQ_API_KEY unset: requests that pass
 * validation deterministically end at the 503 "not configured" guard, which
 * proves the validation layer accepted them without ever calling the model.
 */
import {
  beginSuite,
  section,
  assert,
  assertEqual,
  truncateAll,
  startApp,
  api,
  instrumentPool,
  db,
  type TestServer,
} from "./helpers";
import { registerAiRoutes } from "../../routes/aiRoutes";
import { registerOfficialsRoutes } from "../../routes/officialsRoutes";
import { registerPrayerRoutes } from "../../routes/prayerRoutes";
import { signUserToken } from "../../middleware/userAuth";
import { officialPublic } from "../../../shared/schema";

const XSS_PAYLOADS = [
  `<script>alert("xss")</script>`,
  `"><img src=x onerror=alert(1)>`,
  `'; DROP TABLE prayers; --`,
  `{{constructor.constructor('return process')().exit()}}`,
];

async function testAiRouteValidation(server: TestServer): Promise<void> {
  const token = signUserToken("validation-user-ai");

  section("POST /api/ai/parse-search — input validation");
  delete process.env.GROQ_API_KEY;

  const oversized = await api(server.url, "POST", "/api/ai/parse-search", {
    userToken: token,
    body: { query: "x".repeat(10_000) },
  });
  assertEqual(oversized.status, 400, "10k-char query → 400 (cap applied)");

  for (const bad of [null, 42, { nested: true }, ["array"]]) {
    const res = await api(server.url, "POST", "/api/ai/parse-search", {
      userToken: token,
      body: { query: bad },
    });
    assertEqual(
      res.status,
      400,
      `non-string query (${JSON.stringify(bad)}) → 400`,
    );
  }

  const missingBody = await api(server.url, "POST", "/api/ai/parse-search", {
    userToken: token,
  });
  assertEqual(missingBody.status, 400, "missing body → 400, no crash");

  const validShape = await api(server.url, "POST", "/api/ai/parse-search", {
    userToken: token,
    body: { query: XSS_PAYLOADS[0] },
  });
  assertEqual(
    validShape.status,
    503,
    "well-formed query reaches the (unconfigured) AI guard — validation passed",
  );

  section("POST /api/ai/summarize-bill — actionHistory sanitization");
  const noBill = await api(server.url, "POST", "/api/ai/summarize-bill", {
    userToken: token,
    body: { session: "89R" },
  });
  assertEqual(noBill.status, 400, "missing billNumber → 400");

  const badHistory = await api(server.url, "POST", "/api/ai/summarize-bill", {
    userToken: token,
    body: { billNumber: "HB1", session: "89R", actionHistory: "not-an-array" },
  });
  assertEqual(badHistory.status, 400, "non-array actionHistory → 400");

  const dirtyHistory = await api(server.url, "POST", "/api/ai/summarize-bill", {
    userToken: token,
    body: {
      billNumber: "HB1",
      session: "89R",
      actionHistory: [42, { role: "user" }, null, "Referred to committee"],
    },
  });
  assertEqual(
    dirtyHistory.status,
    503,
    "mixed-type actionHistory sanitized (reaches unconfigured-AI guard)",
  );

  section("POST /api/ai/ask — input validation");
  const longQ = await api(server.url, "POST", "/api/ai/ask", {
    userToken: token,
    body: { question: "y".repeat(10_000) },
  });
  assertEqual(longQ.status, 400, "10k-char question → 400");

  for (const bad of [null, 7, {}]) {
    const res = await api(server.url, "POST", "/api/ai/ask", {
      userToken: token,
      body: { question: bad },
    });
    assertEqual(
      res.status,
      400,
      `non-string question (${JSON.stringify(bad)}) → 400`,
    );
  }

  const unauthed = await api(server.url, "POST", "/api/ai/ask", {
    body: { question: "who represents Austin?" },
  });
  assertEqual(unauthed.status, 401, "no user token → 401 before any AI work");
}

async function testByDistrictsBatching(server: TestServer): Promise<void> {
  section("POST /api/officials/by-districts — validation & batching");

  // Seed officials for districts 1..250 in TX_HOUSE.
  await db.insert(officialPublic).values(
    Array.from({ length: 250 }, (_, i) => ({
      source: "TX_HOUSE" as const,
      sourceMemberId: `BD${i + 1}`,
      chamber: "House",
      district: String(i + 1),
      fullName: `District Rep ${i + 1}`,
      active: true,
    })),
  );

  const invalidSource = await api(
    server.url,
    "POST",
    "/api/officials/by-districts",
    {
      body: {
        districts: [
          { source: "TX_HOUSE", districtNumber: 1 },
          {
            source: "EVIL'); DROP TABLE official_public; --",
            districtNumber: 2,
          },
          { source: "NOT_A_SOURCE", districtNumber: 3 },
          "not-an-object",
          null,
          { districtNumber: 4 },
        ],
      },
    },
  );
  assertEqual(invalidSource.status, 200, "invalid entries skipped, not 500");
  const officials = (invalidSource.body as { officials: unknown[] }).officials;
  assertEqual(officials.length, 1, "only the valid entry resolved");

  const tooMany = await api(server.url, "POST", "/api/officials/by-districts", {
    body: {
      districts: Array.from({ length: 501 }, (_, i) => ({
        source: "TX_HOUSE",
        districtNumber: i + 1,
      })),
    },
  });
  assertEqual(tooMany.status, 400, "501 districts → 400 (max 500)");

  // 500 districts (250 hits + 250 vacant) must be a constant number of
  // queries, not one per district.
  const meter = instrumentPool();
  const big = await api(server.url, "POST", "/api/officials/by-districts", {
    body: {
      districts: Array.from({ length: 500 }, (_, i) => ({
        source: "TX_HOUSE",
        districtNumber: i + 1,
      })),
    },
  });
  const queries = meter.count();
  meter.restore();

  assertEqual(big.status, 200, "500 districts → 200");
  const bigBody = big.body as {
    officials: { isVacant?: boolean; fullName: string }[];
  };
  assertEqual(bigBody.officials.length, 500, "one result per district");
  assertEqual(
    bigBody.officials.filter((o) => o.isVacant).length,
    250,
    "unseeded districts come back as vacant placeholders",
  );
  console.log(`  ℹ queries for 500 districts: ${queries}`);
  assert(queries <= 3, `batched query count (${queries} ≤ 3), not 500`);
}

async function testPrayerRoundTrip(server: TestServer): Promise<void> {
  section("prayers — customPeopleNames & XSS payload round-trip");

  const token = signUserToken("validation-user-prayer");

  const names = [...XSS_PAYLOADS, "Aunt Carol", ""];
  const created = await api(server.url, "POST", "/api/prayers", {
    userToken: token,
    body: {
      title: XSS_PAYLOADS[0],
      body: XSS_PAYLOADS[1],
      customPeopleNames: names,
    },
  });
  assertEqual(created.status, 201, "prayer with hostile strings created");
  const prayerId = (created.body as { id: string }).id;

  const fetched = await api(server.url, "GET", `/api/prayers/${prayerId}`, {
    userToken: token,
  });
  assertEqual(fetched.status, 200, "prayer retrievable");
  const row = fetched.body as {
    title: string;
    body: string;
    customPeopleNames: string[];
  };
  assertEqual(row.title, XSS_PAYLOADS[0], "title round-trips byte-for-byte");
  assertEqual(row.body, XSS_PAYLOADS[1], "body round-trips byte-for-byte");
  assertEqual(
    JSON.stringify(row.customPeopleNames),
    JSON.stringify(names),
    "customPeopleNames array round-trips exactly",
  );
  assert(
    (fetched.headers.get("content-type") ?? "").includes("application/json"),
    "response is application/json (payload not interpretable as HTML)",
  );

  // The injection string changed nothing: the prayers table still answers.
  const list = await api(server.url, "GET", "/api/prayers", {
    userToken: token,
  });
  assertEqual(list.status, 200, "prayers table intact after injection strings");

  // Empty array round-trip.
  const emptyRes = await api(server.url, "POST", "/api/prayers", {
    userToken: token,
    body: { title: "plain", body: "plain", customPeopleNames: [] },
  });
  const emptyId = (emptyRes.body as { id: string }).id;
  const emptyFetched = await api(server.url, "GET", `/api/prayers/${emptyId}`, {
    userToken: token,
  });
  assertEqual(
    JSON.stringify(
      (emptyFetched.body as { customPeopleNames: string[] }).customPeopleNames,
    ),
    "[]",
    "empty customPeopleNames stays an empty array",
  );

  // Schema rejects non-string members.
  const badNames = await api(server.url, "POST", "/api/prayers", {
    userToken: token,
    body: { title: "t", body: "b", customPeopleNames: [1, { a: 2 }] },
  });
  assertEqual(badNames.status, 400, "non-string customPeopleNames → 400");
}

export async function run(): Promise<void> {
  beginSuite("Section 4 — Input validation & injection prevention");
  await truncateAll();

  const server = await startApp(
    registerAiRoutes,
    registerOfficialsRoutes,
    registerPrayerRoutes,
  );
  try {
    await testAiRouteValidation(server);
    await testByDistrictsBatching(server);
    await testPrayerRoundTrip(server);
  } finally {
    await server.close();
  }
}
