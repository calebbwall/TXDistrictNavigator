/**
 * Section 3 — Admin auth hardening & fail-closed verification.
 *
 * Exercises the x-admin-token gate on every admin endpoint:
 *   - ADMIN_REFRESH_TOKEN unset      → fail closed (non-2xx), never executes
 *   - ADMIN_REFRESH_TOKEN set to ""  → fail closed
 *   - invalid token                  → 401
 *   - valid token                    → success (only asserted for endpoints
 *     that don't reach external services)
 *
 * Also audits the codebase for loose admin-token comparisons and takes a
 * coarse constant-time measurement of secureCompare.
 */
import fs from "fs";
import path from "path";
import {
  beginSuite,
  section,
  assert,
  assertEqual,
  truncateAll,
  startApp,
  api,
  type TestServer,
} from "./helpers";
import { registerAdminRoutes } from "../../routes/adminRoutes";
import { registerOfficialsRoutes } from "../../routes/officialsRoutes";
import { secureCompare } from "../../lib/secureCompare";

const ADMIN_TOKEN = "integration-admin-token-123";

interface AdminEndpoint {
  method: string;
  path: string;
  body?: unknown;
  /** Expected status with a valid token; undefined = skip (hits external services). */
  successStatus?: number;
}

// Every admin-gated endpoint that exists in the codebase. (The Phase 2 brief
// lists /admin/refresh/officials/backfill-missing, /admin/refresh/hearing-notice,
// /admin/refresh/groq-fields and /admin/seed/reset-prayer-themes — none of
// those routes exist; the real surface is below.)
const ENDPOINTS: AdminEndpoint[] = [
  { method: "POST", path: "/api/refresh" },
  { method: "POST", path: "/admin/refresh/officials" },
  { method: "GET", path: "/admin/refresh/status", successStatus: 200 },
  { method: "POST", path: "/admin/refresh/geojson" },
  { method: "GET", path: "/api/admin/geojson/source-debug" },
  { method: "GET", path: "/api/admin/officials-counts", successStatus: 200 },
  { method: "POST", path: "/admin/refresh/committees" },
  {
    method: "POST",
    path: "/admin/refresh/committees/reset",
    successStatus: 200,
  },
  {
    method: "POST",
    path: "/admin/refresh/committees/backfill-missing",
    successStatus: 200,
  },
  { method: "POST", path: "/admin/refresh/other-tx-officials" },
  { method: "POST", path: "/admin/backfill/capitol-contact" },
  {
    method: "POST",
    path: "/admin/person/link",
    body: {},
    successStatus: 400, // auth passes, then body validation rejects
  },
  { method: "GET", path: "/admin/status", successStatus: 200 },
  { method: "GET", path: "/admin/scraper-alerts", successStatus: 200 },
  {
    method: "POST",
    path: "/admin/scraper-alerts/nonexistent-id/resolve",
    successStatus: 404, // auth passes, alert id not found
  },
  {
    method: "POST",
    path: "/api/officials/batch-backfill",
    body: { officialIds: [] },
    successStatus: 200,
  },
  { method: "GET", path: "/api/officials/backfill-audit", successStatus: 200 },
  { method: "GET", path: "/api/officials/with-addresses", successStatus: 200 },
];

async function authMatrix(server: TestServer): Promise<void> {
  section("admin endpoints — missing env var fails closed");
  delete process.env.ADMIN_REFRESH_TOKEN;
  for (const ep of ENDPOINTS) {
    const res = await api(server.url, ep.method, ep.path, {
      adminToken: ADMIN_TOKEN, // even a "correct-looking" token must fail
      body: ep.body,
    });
    assert(
      res.status >= 400,
      `${ep.method} ${ep.path}: unconfigured → ${res.status} (fail closed)`,
    );
  }

  section("admin endpoints — empty-string env var fails closed");
  process.env.ADMIN_REFRESH_TOKEN = "";
  for (const ep of ENDPOINTS) {
    const res = await api(server.url, ep.method, ep.path, {
      adminToken: "",
      body: ep.body,
    });
    assert(
      res.status >= 400,
      `${ep.method} ${ep.path}: empty secret + empty token → ${res.status}`,
    );
  }

  section("admin endpoints — invalid token rejected");
  process.env.ADMIN_REFRESH_TOKEN = ADMIN_TOKEN;
  for (const ep of ENDPOINTS) {
    const res = await api(server.url, ep.method, ep.path, {
      adminToken: "wrong-token-wrong-token-wrng",
      body: ep.body,
    });
    assertEqual(
      res.status,
      401,
      `${ep.method} ${ep.path}: invalid token → 401`,
    );
  }

  section("admin endpoints — missing header rejected");
  for (const ep of ENDPOINTS) {
    const res = await api(server.url, ep.method, ep.path, { body: ep.body });
    assertEqual(res.status, 401, `${ep.method} ${ep.path}: no token → 401`);
  }

  section("admin endpoints — valid token succeeds (DB-only endpoints)");
  for (const ep of ENDPOINTS) {
    if (ep.successStatus === undefined) continue;
    const res = await api(server.url, ep.method, ep.path, {
      adminToken: ADMIN_TOKEN,
      body: ep.body,
    });
    assertEqual(
      res.status,
      ep.successStatus,
      `${ep.method} ${ep.path}: valid token → ${ep.successStatus}`,
    );
  }
}

function auditTokenComparisons(): void {
  section("static audit — every admin token comparison uses secureCompare");

  const serverDir = path.resolve(__dirname, "../..");
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  })(serverDir);

  let headerReads = 0;
  let secureCompareCalls = 0;
  const looseComparisons: string[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf-8");
    headerReads += (src.match(/x-admin-token/g) ?? []).length;
    secureCompareCalls += (src.match(/secureCompare\(/g) ?? []).length;
    const loose = src.match(
      /[!=]==?\s*(adminToken|process\.env\.ADMIN_REFRESH_TOKEN)\b/g,
    );
    if (loose) looseComparisons.push(`${file}: ${loose.join(", ")}`);
  }

  console.log(
    `  ℹ ${headerReads} x-admin-token reads, ${secureCompareCalls} secureCompare calls across server/`,
  );
  assertEqual(
    looseComparisons.length,
    0,
    `no loose ===/!== admin token comparisons (${looseComparisons.join("; ")})`,
  );
  assert(
    secureCompareCalls >= headerReads,
    "at least one secureCompare call per x-admin-token read",
  );
}

function timingMeasurement(): void {
  section("secureCompare — coarse constant-time measurement");

  const expected = ADMIN_TOKEN;
  const valid = ADMIN_TOKEN;
  const wrongSameLen = "x".repeat(expected.length);
  const wrongDiffLen = "short";

  const median = (provided: string): number => {
    const samples: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const t0 = process.hrtime.bigint();
      secureCompare(provided, expected);
      samples.push(Number(process.hrtime.bigint() - t0));
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)];
  };

  // Warm up the JIT before measuring.
  median(valid);
  const tValid = median(valid);
  const tWrongSame = median(wrongSameLen);
  const tWrongDiff = median(wrongDiffLen);

  console.log(
    `  ℹ median ns — valid: ${tValid}, wrong(same len): ${tWrongSame}, wrong(diff len): ${tWrongDiff}`,
  );
  const ratio =
    Math.max(tValid, tWrongSame, tWrongDiff) /
    Math.max(1, Math.min(tValid, tWrongSame, tWrongDiff));
  assert(
    ratio < 10,
    `no gross timing divergence between valid/invalid paths (max/min ratio ${ratio.toFixed(2)})`,
  );
}

export async function run(): Promise<void> {
  beginSuite("Section 3 — Admin auth hardening");
  await truncateAll();

  const savedToken = process.env.ADMIN_REFRESH_TOKEN;
  const server = await startApp(registerAdminRoutes, registerOfficialsRoutes);
  try {
    await authMatrix(server);
    auditTokenComparisons();
    timingMeasurement();
  } finally {
    if (savedToken === undefined) delete process.env.ADMIN_REFRESH_TOKEN;
    else process.env.ADMIN_REFRESH_TOKEN = savedToken;
    await server.close();
  }
}
