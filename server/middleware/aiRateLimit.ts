/**
 * In-memory sliding-window rate limiter for metered AI endpoints.
 *
 * Two overlapping windows are enforced per key (IP address by default):
 *   - Burst  : MAX_BURST  requests per BURST_WINDOW_MS   (short window)
 *   - Hourly : MAX_HOURLY requests per HOURLY_WINDOW_MS  (longer window)
 *
 * Both must pass; whichever is exhausted first returns 429.
 *
 * The store is a plain Map with O(1) amortised cleanup — old timestamps are
 * dropped lazily on each access so the map never grows without bound.
 *
 * This is intentionally dependency-free so it does not require any package
 * installation.  For a multi-process / clustered deployment the store would
 * need to move to Redis; in the current single-process Replit setup this is
 * sufficient.
 */

import type { Request, Response, NextFunction } from "express";

const BURST_WINDOW_MS = 60 * 1000;
const MAX_BURST = 20;

const HOURLY_WINDOW_MS = 60 * 60 * 1000;
const MAX_HOURLY = 100;

interface WindowStore {
  burst: number[];
  hourly: number[];
}

const store = new Map<string, WindowStore>();

function getKey(req: Request): string {
  // Prefer the authenticated userId (set by requireUser middleware), which is
  // HMAC-verified and cannot be spoofed via headers.  Fall back to the Express
  // trust-proxy-normalised req.ip only when userId is unexpectedly absent (e.g.
  // future routes that skip auth middleware).
  return req.userId ?? req.ip ?? "unknown";
}

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  const idx = timestamps.findIndex((t) => t >= cutoff);
  return idx === -1 ? [] : timestamps.slice(idx);
}

export function aiRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = getKey(req);
  const now = Date.now();

  const entry = store.get(key) ?? { burst: [], hourly: [] };

  entry.burst = prune(entry.burst, BURST_WINDOW_MS, now);
  entry.hourly = prune(entry.hourly, HOURLY_WINDOW_MS, now);

  if (entry.burst.length >= MAX_BURST) {
    const oldestBurst = entry.burst[0];
    const retryAfterMs = Math.ceil(BURST_WINDOW_MS - (now - oldestBurst));
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    res.status(429).json({
      error: "Too many requests. Please wait before trying again.",
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    });
    return;
  }

  if (entry.hourly.length >= MAX_HOURLY) {
    const oldestHourly = entry.hourly[0];
    const retryAfterMs = Math.ceil(HOURLY_WINDOW_MS - (now - oldestHourly));
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    res.status(429).json({
      error: "Hourly AI request limit reached. Please try again later.",
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    });
    return;
  }

  entry.burst.push(now);
  entry.hourly.push(now);
  store.set(key, entry);

  next();
}

/** Purge entries that have fully expired from both windows (call periodically). */
function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    const burst = prune(entry.burst, BURST_WINDOW_MS, now);
    const hourly = prune(entry.hourly, HOURLY_WINDOW_MS, now);
    if (burst.length === 0 && hourly.length === 0) {
      store.delete(key);
    } else {
      store.set(key, { burst, hourly });
    }
  }
}

setInterval(purgeExpired, HOURLY_WINDOW_MS).unref();
