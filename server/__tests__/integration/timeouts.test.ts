/**
 * Section 5 — Resource cleanup & timeout verification.
 *
 * Uses a local mock upstream with deliberately slow responses, and a patched
 * globalThis.fetch that rewrites the allowlisted production hostnames to the
 * mock — the real route code (and its AbortSignal wiring) runs unmodified.
 *
 * NOTE: this suite intentionally waits out real timeouts (~100s total).
 */
import fs from "fs";
import path from "path";
import {
  beginSuite,
  section,
  assert,
  assertEqual,
  startApp,
  startMockServer,
  api,
  realFetch,
  sleep,
  type TestServer,
} from "./helpers";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function patchFetchRewrite(hosts: string[], targetUrl: string): () => void {
  const original = globalThis.fetch;
  const target = new URL(targetUrl);
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const parsed = new URL(urlStr);
    if (hosts.includes(parsed.hostname)) {
      parsed.protocol = target.protocol;
      parsed.host = target.host;
      return realFetch(parsed.toString(), init);
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function buildMockUpstream(): Promise<TestServer> {
  return startMockServer((req, res) => {
    const respond = (
      delayMs: number,
      status: number,
      headers: Record<string, string>,
      body: Buffer | string,
    ) => {
      setTimeout(() => {
        if (res.writableEnded || res.destroyed) return;
        try {
          res.writeHead(status, headers);
          res.end(body);
        } catch {
          // client already aborted — expected for timeout tests
        }
      }, delayMs);
    };

    const url = req.url ?? "/";
    if (url.startsWith("/slow-image")) {
      respond(20_000, 200, { "Content-Type": "image/png" }, PNG_BYTES);
    } else if (url.startsWith("/hop1")) {
      respond(
        8_000,
        302,
        { Location: "https://www.congress.gov/hop2" },
        "redirecting",
      );
    } else if (url.startsWith("/hop2")) {
      respond(8_000, 200, { "Content-Type": "image/png" }, PNG_BYTES);
    } else if (url.includes("/chat/completions")) {
      respond(
        40_000,
        200,
        { "Content-Type": "application/json" },
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
      );
    } else if (url.startsWith("/customsearch")) {
      respond(
        12_000,
        200,
        { "Content-Type": "application/json" },
        JSON.stringify({ items: [] }),
      );
    } else {
      respond(0, 404, {}, "not found");
    }
  });
}

async function testPhotoProxyTimeouts(upstream: TestServer): Promise<void> {
  const { registerMapRoutes } = await import("../../routes/mapRoutes");
  const server = await startApp(registerMapRoutes);
  const unpatch = patchFetchRewrite(
    ["www.congress.gov", "congress.gov", "directory.texastribune.org"],
    upstream.url,
  );

  try {
    section("photo-proxy — 20s upstream hits the 15s timeout and aborts");
    let t0 = Date.now();
    const slow = await api(
      server.url,
      "GET",
      `/api/photo-proxy?url=${encodeURIComponent("https://www.congress.gov/slow-image")}`,
    );
    let elapsed = (Date.now() - t0) / 1000;
    console.log(
      `  ℹ slow upstream: ${slow.status} after ${elapsed.toFixed(1)}s`,
    );
    assertEqual(slow.status, 500, "timed-out proxy request → 500, not a hang");
    assert(
      elapsed >= 14 && elapsed <= 19,
      `request aborted at ~15s (took ${elapsed.toFixed(1)}s)`,
    );

    section("photo-proxy — timeout applies per request, not cumulatively");
    t0 = Date.now();
    const redirected = await api(
      server.url,
      "GET",
      `/api/photo-proxy?url=${encodeURIComponent("https://www.congress.gov/hop1")}`,
    );
    elapsed = (Date.now() - t0) / 1000;
    console.log(
      `  ℹ redirect chain (8s + 8s hops): ${redirected.status} after ${elapsed.toFixed(1)}s`,
    );
    assertEqual(
      redirected.status,
      200,
      "8s + 8s redirect chain succeeds (16s total > 15s single budget)",
    );
    assert(
      elapsed > 15,
      `total time ${elapsed.toFixed(1)}s exceeds one 15s budget — proves per-request timeout`,
    );
    assert(
      (redirected.headers.get("content-type") ?? "").includes("image/png"),
      "redirected image content-type passed through",
    );
  } finally {
    unpatch();
    await server.close();
  }
}

async function testGroqTimeout(upstream: TestServer): Promise<void> {
  section("groq — 40s upstream hits the 30s SDK timeout (1 retry)");

  process.env.GROQ_API_KEY = "test-key-not-real";
  process.env.GROQ_BASE_URL = upstream.url;

  const { parseNaturalLanguageSearch } = await import(
    "../../services/groqService"
  );

  const t0 = Date.now();
  let rejected = false;
  let message = "";
  try {
    await parseNaturalLanguageSearch("who represents Austin?");
  } catch (err) {
    rejected = true;
    message = err instanceof Error ? err.message : String(err);
  }
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`  ℹ groq call failed after ${elapsed.toFixed(1)}s: ${message}`);

  assert(rejected, "slow Groq response rejects instead of hanging");
  assert(
    /timeout|timed out|abort/i.test(message),
    `error identifies the timeout (${message})`,
  );
  // 30s timeout + 1 SDK retry + backoff ≈ 60–65s; far below the 80s mock delay×2.
  assert(
    elapsed >= 28 && elapsed <= 80,
    `bounded by SDK timeout+retry, not the 40s upstream delay (took ${elapsed.toFixed(1)}s)`,
  );

  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_BASE_URL;
}

async function testWebSearchTimeout(upstream: TestServer): Promise<void> {
  section(
    "searchWeb — 12s Google response hits the 10s timeout, degrades to ''",
  );

  process.env.GOOGLE_SEARCH_API_KEY = "test";
  process.env.GOOGLE_SEARCH_CX = "test";
  const unpatch = patchFetchRewrite(["www.googleapis.com"], upstream.url);

  try {
    const { searchWeb } = await import("../../services/groqService");
    const t0 = Date.now();
    const result = await searchWeb("texas hb 1");
    const elapsed = (Date.now() - t0) / 1000;
    console.log(`  ℹ searchWeb returned after ${elapsed.toFixed(1)}s`);
    assertEqual(result, "", "timeout degrades gracefully to empty context");
    assert(
      elapsed >= 9 && elapsed <= 12,
      `bounded at ~10s (took ${elapsed.toFixed(1)}s)`,
    );
  } finally {
    unpatch();
    delete process.env.GOOGLE_SEARCH_API_KEY;
    delete process.env.GOOGLE_SEARCH_CX;
  }
}

function testFetchTimeoutAudit(): void {
  section("static audit — every outbound fetch call site carries a timeout");

  const serverDir = path.resolve(__dirname, "../..");
  const offenders: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const src = fs.readFileSync(full, "utf-8");
      const usesFetch = /\bawait fetch\(|= fetch\(|return fetch\(/.test(src);
      if (!usesFetch) continue;
      const hasBound =
        src.includes("AbortSignal.timeout") ||
        src.includes("controller.signal") ||
        /timeout:\s*\w+/.test(src);
      if (!hasBound) offenders.push(path.relative(serverDir, full));
    }
  })(serverDir);

  assertEqual(
    offenders.length,
    0,
    `fetch call sites without a timeout bound: [${offenders.join(", ")}]`,
  );
}

export async function run(): Promise<void> {
  beginSuite("Section 5 — Timeouts & resource cleanup (slow suite)");

  const upstream = await buildMockUpstream();
  try {
    await testPhotoProxyTimeouts(upstream);
    await testWebSearchTimeout(upstream);
    await testGroqTimeout(upstream);
    testFetchTimeoutAudit();
    // Let any stray aborted-socket callbacks settle before the runner's
    // unhandled-rejection check.
    await sleep(250);
  } finally {
    await upstream.close();
  }
}
