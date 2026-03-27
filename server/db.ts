import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  max: 10,
});

// Prevent unhandled 'error' events (e.g. DB connection terminated by admin)
// from crashing the Node.js process. pg emits these on idle clients.
pool.on("error", (err) => {
  console.error("[DB Pool] Idle client error (connection will be replaced):", err.message);
});

export const db = drizzle(pool, { schema });
export { pool };
