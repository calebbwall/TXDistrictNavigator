---
name: Performance & server architecture notes
description: Non-obvious server/data decisions for the Texas Districts app (DB sizing, res.json wrapping, public vs admin map endpoints).
---

## Official directory tables are tiny
`official_public` and `official_private` hold ~247 rows each (Texas legislators + a handful of statewide officials).
**Why:** At this size Postgres seq-scans are optimal and the planner ignores most indexes anyway.
**How to apply:** Do NOT add composite/secondary indexes to these tables for "performance" — it's noise. Spend effort on payload size and caching instead. (Legislative tables like bills/alerts CAN grow and already have indexes.)

## res.json is wrapped by multiple middlewares
In `server/index.ts`, both request-logging and the gzip compression middleware override `res.json`.
**Why:** Each middleware reassigns `res.json` at request time; the LAST one registered runs last and becomes the active wrapper. Compression is registered AFTER logging on purpose so it is the outermost wrapper.
**How to apply:** When adding anything that wraps `res.json`/`res.send`, mind ordering. Note the gzip path calls `res.end(buffer)` directly for large payloads, so it intentionally bypasses the logger's JSON body capture (big responses are not echoed in logs). Small/sub-threshold payloads fall through to the logger + Express json normally.

## Map hometown dots require a PUBLIC city-level endpoint
The map's purple dots are populated by `GET /api/officials/hometowns` (public, returns city/region only via a sanitizer).
**Why:** The older `/api/officials/with-addresses` is admin-guarded (`requireAdminToken`); with no `ADMIN_REFRESH_TOKEN` set it returns 401/503 to the app, which silently zeroed out the dots. Also, per threat_model.md (Information Disclosure) the public surface must never expose street-level personal addresses — hence the city/region downgrade.
**How to apply:** Keep map/dot data on the public city-level route. Never point client map code at admin routes, and never widen the public route to return street-level addresses.
