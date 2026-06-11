/**
 * Shared helpers for the integration test suites.
 *
 * IMPORTANT: this module (and everything that imports server/db.ts) must only
 * be imported AFTER run.ts has pointed DATABASE_URL at the test database.
 */
import express, { type Express } from "express";
import http from "http";
import { db, pool } from "../../db";

// ── assertion harness (same style as legislativeJobs.test.ts) ──
let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentSuite = "";

export function beginSuite(name: string): void {
  currentSuite = name;
  console.log(`\n━━━ ${name} ━━━`);
}

export function section(name: string): void {
  console.log(`\n[test] ${name}`);
}

export function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
    failures.push(`${currentSuite} → ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(
    actual === expected,
    `${message} (got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`,
  );
}

export function getResults(): {
  passed: number;
  failed: number;
  failures: string[];
} {
  return { passed, failed, failures };
}

// ── database helpers ──

/** Truncate every table in the public schema (test DB only!). */
export async function truncateAll(): Promise<void> {
  const res = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const names = res.rows
    .map((r: { tablename: string }) => `"${r.tablename}"`)
    .join(", ");
  if (names) {
    await pool.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  }
}

/**
 * Install a BEFORE INSERT trigger that makes every insert into `table` fail.
 * Used to simulate a crash mid-transaction and verify rollback behavior.
 */
export async function installFailTrigger(table: string): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION test_induced_failure() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'test-induced failure on %', TG_TABLE_NAME;
    END
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(
    `CREATE TRIGGER test_fail_trg BEFORE INSERT ON "${table}"
     FOR EACH ROW EXECUTE FUNCTION test_induced_failure()`,
  );
}

export async function removeFailTrigger(table: string): Promise<void> {
  await pool.query(`DROP TRIGGER IF EXISTS test_fail_trg ON "${table}"`);
}

/**
 * Count SQL statements issued through the shared pg pool (both pool.query and
 * promise-style checked-out client.query calls). Used to verify batching /
 * N+1 fixes. Callback-style connect (used internally by pool.query) is passed
 * through untouched — those statements are already counted via pool.query.
 */
const wrappedClients = new WeakSet<object>();
let activeCounter: { n: number } | null = null;

export function instrumentPool(): {
  count: () => number;
  restore: () => void;
} {
  const counter = { n: 0 };
  activeCounter = counter;
  const poolAny = pool as unknown as {
    query: (...args: unknown[]) => unknown;
    connect: (...args: unknown[]) => unknown;
  };
  const origQuery = poolAny.query.bind(pool);
  const origConnect = poolAny.connect.bind(pool);

  poolAny.query = (...args: unknown[]) => {
    counter.n++;
    return origQuery(...args);
  };
  poolAny.connect = (...args: unknown[]) => {
    if (typeof args[0] === "function") {
      // Callback style — pg's own pool.query path; already counted above.
      return origConnect(...args);
    }
    return (async () => {
      const client = (await origConnect()) as {
        query: (...a: unknown[]) => unknown;
      };
      if (!wrappedClients.has(client)) {
        wrappedClients.add(client);
        const origClientQuery = client.query.bind(client);
        client.query = (...a: unknown[]) => {
          if (activeCounter) activeCounter.n++;
          return origClientQuery(...a);
        };
      }
      return client;
    })();
  };

  return {
    count: () => counter.n,
    restore: () => {
      activeCounter = null;
      poolAny.query = origQuery;
      poolAny.connect = origConnect;
    },
  };
}

// ── HTTP helpers ──

/** Reference to the real fetch, captured before any suite patches the global. */
export const realFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

/** Start an Express app composed from the given route registrars. */
export async function startApp(
  ...registrars: Array<(app: Express) => void | Promise<void>>
): Promise<TestServer> {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  for (const r of registrars) await r(app);
  return listen(http.createServer(app));
}

/** Start a raw node http server with a custom handler (for mock upstreams). */
export async function startMockServer(
  handler: http.RequestListener,
): Promise<TestServer> {
  return listen(http.createServer(handler));
}

async function listen(server: http.Server): Promise<TestServer> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  body: unknown;
  text: string;
}

/** Call a test server endpoint. Always uses the unpatched fetch. */
export async function api(
  baseUrl: string,
  method: string,
  path: string,
  opts: {
    body?: unknown;
    userToken?: string;
    adminToken?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.userToken) headers["Authorization"] = `Bearer ${opts.userToken}`;
  if (opts.adminToken !== undefined) headers["x-admin-token"] = opts.adminToken;

  const res = await realFetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body, text };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export { db, pool };
