import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    "[DB] DATABASE_URL is not set — database queries will fail. Set it in your environment variables.",
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase (and most managed Postgres) requires SSL in production.
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  // Raised from 3 → 10. The previous value caused "timeout exceeded when
  // trying to checkout client" under normal load — multiple concurrent
  // background jobs (RSS poller, daily refresh, committee refresh, request
  // handlers) routinely needed more than 3 clients at once. Neon and most
  // managed Postgres tiers tolerate 10–20 connections per app instance.
  max: 10,
});

// Prevent unhandled 'error' events on idle clients (pool-level handler).
pool.on("error", (err) => {
  console.error(
    "[DB Pool] Idle client error (connection will be replaced):",
    err.message,
  );
});

// Prevent unhandled 'error' events on active (checked-out) clients.
// pg only attaches the pool-level handler to idle clients; when a connection
// is terminated while a query is in-flight (e.g. db:push sends an "administrator
// command" that kills connections), the active client emits 'error' with no
// listener, which Node.js converts to an uncaught exception (exit code 1).
// Registering a listener on every new client via 'connect' prevents this crash.
pool.on("connect", (client) => {
  client.on("error", (err) => {
    console.error(
      "[DB Pool] Active client error (connection will be replaced):",
      err.message,
    );
  });
});

export const db = drizzle(pool, { schema });
export { pool };

/**
 * Retry helper for transient Postgres errors. Wraps a query function and
 * retries on connection-level failures (pool checkout timeout, terminated
 * connections, auth-handshake timeouts) with exponential backoff.
 *
 * Use this around critical background-job DB calls that should not abort
 * the whole job on a single transient failure.
 */
const TRANSIENT_DB_ERROR_PATTERNS = [
  /timeout exceeded when trying to connect/i,
  /Connection terminated/i,
  /Connection terminated unexpectedly/i,
  /timeout expired/i, // 08P01 / handshake timeouts
  /SASL.*timeout/i,
  /server closed the connection/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
];

function isTransientDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_DB_ERROR_PATTERNS.some((re) => re.test(msg));
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const label = opts.label ?? "withDbRetry";

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries || !isTransientDbError(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[${label}] Transient DB error (attempt ${attempt}/${retries}): ${msg} — retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
