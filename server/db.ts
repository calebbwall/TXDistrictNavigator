import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("[DB] DATABASE_URL is not set — database queries will fail. Add it to your Replit Secrets.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  max: 3,
});

// Prevent unhandled 'error' events on idle clients (pool-level handler).
pool.on("error", (err) => {
  console.error("[DB Pool] Idle client error (connection will be replaced):", err.message);
});

// Prevent unhandled 'error' events on active (checked-out) clients.
// pg only attaches the pool-level handler to idle clients; when a connection
// is terminated while a query is in-flight (e.g. db:push sends an "administrator
// command" that kills connections), the active client emits 'error' with no
// listener, which Node.js converts to an uncaught exception (exit code 1).
// Registering a listener on every new client via 'connect' prevents this crash.
pool.on("connect", (client) => {
  client.on("error", (err) => {
    console.error("[DB Pool] Active client error (connection will be replaced):", err.message);
  });
});

export const db = drizzle(pool, { schema });
export { pool };
