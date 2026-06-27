/**
 * Resource cleanup & timeout tests (Phase 2 debug pass, section 5).
 *
 * - AbortSignal.timeout semantics against a real slow/stalling local server
 *   (the same mechanism photo-proxy, geonames, and all scrape jobs now use).
 * - Per-request (not cumulative) timeout budgets across sequential fetches,
 *   mirroring photo-proxy's initial-request + one-redirect flow.
 * - photo-proxy validation paths: missing/invalid url, SSRF domain allowlist.
 * - Static audit: every `await fetch(` call site in server code carries an
 *   abort signal, and the Groq client is constructed with an SDK timeout.
 *
 * No DB or external network required.
 * Run with: npx tsx server/__tests__/timeouts.test.ts
 */
import express from "express";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import type { Server } from "http";

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

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

async function testAbortSignalTimeout(): Promise<void> {
  console.log("\n[test] AbortSignal.timeout fires and aborts cleanly");

  // Server that never responds within the test budget (simulates a 20s+ stall)
  const sockets = new Set<import("net").Socket>();
  const slow = http.createServer((_req, res) => {
    setTimeout(() => res.end("too late"), 60_000).unref();
  });
  slow.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  const port = await listen(slow);

  const TIMEOUT_MS = 500;
  const t0 = Date.now();
  let aborted = false;
  let errName = "";
  try {
    await fetch(`http://127.0.0.1:${port}/photo.jpg`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    aborted = true;
    errName = (err as Error).name;
  }
  const elapsed = Date.now() - t0;

  assert(aborted, "stalled request rejects instead of hanging");
  assert(
    errName === "TimeoutError" || errName === "AbortError",
    `rejection is a timeout abort (got ${errName})`,
  );
  assert(
    elapsed >= TIMEOUT_MS - 50 && elapsed < TIMEOUT_MS + 1_500,
    `abort fired near the configured budget (${elapsed}ms for ${TIMEOUT_MS}ms timeout)`,
  );

  // The aborted request's socket is torn down immediately; undici also holds
  // a pooled keep-alive connection that expires at its 4s default. Assert no
  // socket outlives that window (i.e. nothing leaks indefinitely).
  const deadline = Date.now() + 6_000;
  while (sockets.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assertEqual(
    sockets.size,
    0,
    "all client sockets closed after abort (incl. pooled keep-alive)",
  );

  // Body reads are bounded too: headers arrive instantly, body stalls.
  const stallBody = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.write("partial");
    // never end()
  });
  const port2 = await listen(stallBody);
  let bodyAborted = false;
  const t1 = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${port2}/stall.jpg`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await res.arrayBuffer();
  } catch {
    bodyAborted = true;
  }
  assert(
    bodyAborted && Date.now() - t1 < TIMEOUT_MS + 1_500,
    "stalled BODY read is also aborted by the same signal",
  );

  slow.close();
  stallBody.close();
}

async function testPerRequestTimeoutBudget(): Promise<void> {
  console.log(
    "\n[test] sequential requests get fresh budgets (per-request, not cumulative)",
  );

  // Each request takes ~60% of the budget. A cumulative budget would fail the
  // second hop; per-request budgets (a fresh AbortSignal.timeout per fetch,
  // as photo-proxy does for the initial request and its one redirect) pass.
  const BUDGET_MS = 600;
  const slowish = http.createServer((_req, res) => {
    setTimeout(() => res.end("ok"), Math.floor(BUDGET_MS * 0.6)).unref();
  });
  const port = await listen(slowish);

  const t0 = Date.now();
  let bothSucceeded = true;
  try {
    const first = await fetch(`http://127.0.0.1:${port}/hop1`, {
      signal: AbortSignal.timeout(BUDGET_MS),
    });
    await first.text();
    const second = await fetch(`http://127.0.0.1:${port}/hop2`, {
      signal: AbortSignal.timeout(BUDGET_MS),
    });
    await second.text();
  } catch {
    bothSucceeded = false;
  }
  const total = Date.now() - t0;
  assert(
    bothSucceeded,
    `two sequential ~${Math.floor(BUDGET_MS * 0.6)}ms hops succeed with per-request ${BUDGET_MS}ms budgets (total ${total}ms > single budget)`,
  );
  assert(
    total > BUDGET_MS,
    "combined time exceeded a single budget — proves budgets are per-request",
  );

  slowish.close();
}

let proxyBaseUrl = "";

async function testPhotoProxyValidation(): Promise<void> {
  console.log("\n[test] photo-proxy — validation and SSRF guards");

  const get = async (qs: string) => {
    const res = await fetch(`${proxyBaseUrl}/api/photo-proxy${qs}`);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* binary/none */
    }
    return { status: res.status, body };
  };

  assertEqual((await get("")).status, 400, "missing url → 400");
  assertEqual(
    (await get("?url=not-a-url")).status,
    400,
    "unparseable url → 400",
  );
  assertEqual(
    (await get("?url=http://127.0.0.1:8081/internal")).status,
    403,
    "loopback target → 403 (SSRF allowlist)",
  );
  assertEqual(
    (await get("?url=https://evil.example.com/x.jpg")).status,
    403,
    "non-allowlisted domain → 403",
  );
  assertEqual(
    (await get("?url=https://directory.texastribune.org.evil.com/x.jpg"))
      .status,
    403,
    "allowlisted-domain prefix trick → 403 (exact hostname match)",
  );
  assertEqual(
    (await get("?url=ftp://directory.texastribune.org/x.jpg")).status,
    403,
    "non-http scheme on allowlisted host → handled without crash",
  );
}

function findFetchCallSites(src: string): { line: number; window: string }[] {
  const lines = src.split("\n");
  const sites: { line: number; window: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Direct fetch invocations (global fetch or node-fetch). Helper wrappers
    // like fetchWithRetry/conditionalFetch are themselves audited where they
    // call fetch, so call sites of the wrappers don't need their own signal.
    if (/await fetch\(|= fetch\(|return fetch\(/.test(lines[i])) {
      sites.push({
        line: i + 1,
        window: lines.slice(i, Math.min(i + 14, lines.length)).join("\n"),
      });
    }
  }
  return sites;
}

function testStaticFetchTimeoutAudit(): void {
  console.log(
    "\n[test] static audit — every server fetch() call site carries an abort signal",
  );

  const serverDir = path.join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) files.push(full);
    }
  };
  walk(serverDir);

  let totalSites = 0;
  let missing = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf-8");
    const sites = findFetchCallSites(src);
    for (const site of sites) {
      totalSites++;
      const hasSignal =
        /signal\s*:/.test(site.window) ||
        /controller\.signal/.test(site.window);
      if (!hasSignal) {
        missing++;
        console.error(
          `    missing signal: ${path.relative(serverDir, file)}:${site.line}`,
        );
      }
    }
  }
  console.log(`  ℹ ${totalSites} fetch call sites audited across server/`);
  assert(
    totalSites >= 18,
    `audit found the expected breadth (${totalSites} ≥ 18 sites)`,
  );
  assertEqual(missing, 0, "every fetch call site has an abort signal");

  // Groq SDK client must carry an explicit timeout (its default is 60s + 2
  // retries, which can pin interactive handlers for minutes).
  const groqSrc = fs.readFileSync(
    path.join(serverDir, "services", "groqService.ts"),
    "utf-8",
  );
  assert(
    /timeout:\s*GROQ_TIMEOUT_MS/.test(groqSrc),
    "Groq client constructed with timeout: GROQ_TIMEOUT_MS",
  );
  assert(/maxRetries:\s*1/.test(groqSrc), "Groq client limited to 1 retry");
  assert(
    /AbortSignal\.timeout\(WEB_SEARCH_TIMEOUT_MS\)/.test(groqSrc),
    "Google web search fetch bounded by WEB_SEARCH_TIMEOUT_MS",
  );
}

// ── main ──
async function main(): Promise<void> {
  console.log("==========================================");
  console.log("Timeouts — Abort Semantics & Fetch Audit");
  console.log("==========================================");

  const { registerMapRoutes } = await import("../routes/mapRoutes");
  const app = express();
  app.use(express.json());
  registerMapRoutes(app);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  proxyBaseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await testAbortSignalTimeout();
    await testPerRequestTimeoutBudget();
    await testPhotoProxyValidation();
    testStaticFetchTimeoutAudit();
  } finally {
    server.close();
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
