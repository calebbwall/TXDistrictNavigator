/**
 * Admin auth hardening tests — fail-closed behavior, token validation, and
 * constant-time comparison (Phase 2 debug pass, section 3).
 *
 * Spins up a real Express app with the admin routes registered and exercises
 * the endpoints over HTTP. DB-dependent success paths are skipped when
 * DATABASE_URL is absent.
 *
 * Run with: npx tsx server/__tests__/adminAuth.test.ts
 */
import express from "express";
import * as fs from "fs";
import * as path from "path";
import type { Server } from "http";
import { performance } from "perf_hooks";
import { secureCompare } from "../lib/secureCompare";

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

const VALID_TOKEN = "p2-test-admin-token-0123456789abcdef";

let baseUrl = "";

async function request(
  method: string,
  urlPath: string,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: token !== undefined ? { "x-admin-token": token } : {},
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body };
}

async function testFailClosedWhenUnconfigured(): Promise<void> {
  console.log(
    "\n[test] admin endpoints fail closed when token is unconfigured",
  );

  delete process.env.ADMIN_REFRESH_TOKEN;
  const endpoints: [string, string][] = [
    ["POST", "/api/refresh"],
    ["POST", "/admin/refresh/officials"],
    ["GET", "/admin/refresh/status"],
    ["POST", "/admin/refresh/committees"],
    ["POST", "/admin/refresh/committees/reset"],
    ["POST", "/admin/refresh/committees/backfill-missing"],
    ["POST", "/admin/refresh/other-tx-officials"],
    ["POST", "/admin/backfill/headshots"],
    ["POST", "/admin/backfill/capitol-contact"],
    ["POST", "/admin/person/link"],
    ["GET", "/admin/status"],
    ["GET", "/admin/scraper-alerts"],
    ["GET", "/api/admin/officials-counts"],
  ];
  for (const [method, urlPath] of endpoints) {
    // Even presenting a token must fail when no expected value is configured.
    const { status } = await request(method, urlPath, "any-token");
    assert(
      status === 401 || status === 500 || status === 503,
      `${method} ${urlPath} → ${status} (rejected, never authorized)`,
    );
  }

  // Empty-string env var must behave like unconfigured, not match "".
  process.env.ADMIN_REFRESH_TOKEN = "";
  for (const [method, urlPath] of [
    ["POST", "/admin/refresh/committees/backfill-missing"],
    ["POST", "/admin/refresh/committees/reset"],
    ["GET", "/admin/status"],
  ] as [string, string][]) {
    const { status } = await request(method, urlPath, "");
    assert(
      status === 401 || status === 500 || status === 503,
      `${method} ${urlPath} with ADMIN_REFRESH_TOKEN="" and empty header → ${status}`,
    );
  }
}

async function testTokenValidation(): Promise<void> {
  console.log("\n[test] valid vs invalid token on each guarded endpoint");

  process.env.ADMIN_REFRESH_TOKEN = VALID_TOKEN;

  // Invalid, prefix, and over-long tokens are all rejected.
  for (const bad of [
    "wrong-token",
    VALID_TOKEN.slice(0, -1),
    VALID_TOKEN + "x",
    "",
  ]) {
    const { status } = await request(
      "POST",
      "/admin/refresh/committees/reset",
      bad,
    );
    assertEqual(
      status,
      401,
      `invalid token ${JSON.stringify(bad.slice(0, 12))}… → 401`,
    );
  }
  const missing = await request("POST", "/admin/refresh/committees/reset");
  assertEqual(missing.status, 401, "missing token header → 401");

  // Valid token succeeds on a no-side-effect endpoint.
  const ok = await request(
    "POST",
    "/admin/refresh/committees/reset",
    VALID_TOKEN,
  );
  assertEqual(ok.status, 200, "valid token → 200 on committees/reset");

  if (process.env.DATABASE_URL) {
    const backfill = await request(
      "POST",
      "/admin/refresh/committees/backfill-missing",
      VALID_TOKEN,
    );
    assertEqual(
      backfill.status,
      200,
      "valid token → 200 on backfill-missing (no empty committees: no-op)",
    );
    const status = await request("GET", "/admin/refresh/status", VALID_TOKEN);
    assertEqual(status.status, 200, "valid token → 200 on refresh/status");
  } else {
    console.log("  ℹ DATABASE_URL not set — skipping DB-backed success paths");
  }
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function testConstantTimeComparison(): void {
  console.log("\n[test] secureCompare timing characteristics");

  const expected = VALID_TOKEN;
  const matching = VALID_TOKEN;
  const earlyMismatch = "X" + VALID_TOKEN.slice(1); // differs at byte 0
  const lateMismatch = VALID_TOKEN.slice(0, -1) + "X"; // differs at last byte
  const shortToken = "x";

  const ITER = 20_000;
  const time = (candidate: string) => {
    const samples: number[] = [];
    for (let i = 0; i < ITER; i++) {
      const t0 = performance.now();
      secureCompare(candidate, expected);
      samples.push(performance.now() - t0);
    }
    return median(samples);
  };

  // Warm up JIT before measuring
  for (let i = 0; i < 5_000; i++) secureCompare(matching, expected);

  const tMatch = time(matching);
  const tEarly = time(earlyMismatch);
  const tLate = time(lateMismatch);
  const tShort = time(shortToken);

  console.log(
    `  ℹ medians (µs): match=${(tMatch * 1000).toFixed(3)} earlyMismatch=${(tEarly * 1000).toFixed(3)} lateMismatch=${(tLate * 1000).toFixed(3)} shortToken=${(tShort * 1000).toFixed(3)}`,
  );

  // Both sides are SHA-256 hashed before timingSafeEqual, so mismatch position
  // and candidate length must not produce an order-of-magnitude difference.
  // Generous 3x bound: micro-benchmarks on shared CI hardware are noisy; a
  // genuine early-exit string compare would show far larger relative gaps.
  const all = [tMatch, tEarly, tLate, tShort];
  const ratio = Math.max(...all) / Math.min(...all);
  assert(
    ratio < 3,
    `timing spread across match/early/late/short is bounded (max/min ratio ${ratio.toFixed(2)} < 3)`,
  );

  // Correctness alongside timing
  assertEqual(
    secureCompare(matching, expected),
    true,
    "matching token accepted",
  );
  assertEqual(
    secureCompare(earlyMismatch, expected),
    false,
    "early mismatch rejected",
  );
  assertEqual(
    secureCompare(lateMismatch, expected),
    false,
    "late mismatch rejected",
  );
  assertEqual(
    secureCompare(shortToken, expected),
    false,
    "short token rejected",
  );
}

function testStaticTokenComparisonAudit(): void {
  console.log(
    "\n[test] static audit — every admin token check uses secureCompare",
  );

  const routesDir = path.join(__dirname, "..", "routes");
  const files = fs
    .readdirSync(routesDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(routesDir, f));

  let totalHeaderReads = 0;
  let totalSecureCompares = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf-8");
    const headerReads = (src.match(/x-admin-token/g) ?? []).length;
    const secureCompares = (src.match(/secureCompare\(/g) ?? []).length;
    totalHeaderReads += headerReads;
    totalSecureCompares += secureCompares;

    // No loose equality against admin token material anywhere in routes.
    const loose =
      /(providedToken|provided|adminToken)\s*[!=]==?\s*(providedToken|provided|adminToken)/.exec(
        src,
      );
    assert(
      loose === null,
      `${path.basename(file)}: no loose ===/!== token comparison${loose ? ` (found: ${loose[0]})` : ""}`,
    );

    if (headerReads > 0) {
      assert(
        secureCompares > 0,
        `${path.basename(file)}: reads x-admin-token (${headerReads}×) and uses secureCompare (${secureCompares}×)`,
      );
    }
  }
  console.log(
    `  ℹ ${totalHeaderReads} x-admin-token reads, ${totalSecureCompares} secureCompare calls across routes/`,
  );
  assert(
    totalSecureCompares >= totalHeaderReads - 2,
    "secureCompare call count covers the token-guarded handlers",
  );
}

// ── main ──
async function main(): Promise<void> {
  console.log("==========================================");
  console.log("Admin Auth — Fail-Closed & Constant-Time");
  console.log("==========================================");

  const savedToken = process.env.ADMIN_REFRESH_TOKEN;

  const { registerAdminRoutes } = await import("../routes/adminRoutes");
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await testFailClosedWhenUnconfigured();
    await testTokenValidation();
    testConstantTimeComparison();
    testStaticTokenComparisonAudit();
  } finally {
    if (savedToken === undefined) delete process.env.ADMIN_REFRESH_TOKEN;
    else process.env.ADMIN_REFRESH_TOKEN = savedToken;
    server.close();
    if (process.env.DATABASE_URL) {
      const { pool } = await import("../db");
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
