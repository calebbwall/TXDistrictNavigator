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

## Simplified GeoJSON bindings start EMPTY — never serve/cache them during boot
`server/data/geojson.ts` loads the simplified collections in a background async IIFE, so the exported `txHouse/txSenate/usCongressGeoJSON` live bindings are `EMPTY` for the first <500ms. Use `whenSimplifiedReady()` / `isSimplifiedReady()` to gate consumers.
**Why:** A request landing in that boot window used to get `{features:[]}`. The map client treats empty as "validation failed" and escalates to the ~69MB full file (timeouts/blank overlays). The point/area lookup helper also froze the EMPTY object into its module cache, making `districts-at-point`/`area-hits` falsely return "no district" until a process restart.
**How to apply:** Any route/helper that reads these bindings must `await whenSimplifiedReady()` first AND only cache a collection once `features.length > 0`. Serve a 503 (not empty) if still empty after readiness so the client can deliberately retry/fall back. Client + web map.html retry simplified ~3x before ever touching the full file.

## Backfill/hometowns: /api/officials never carries private data
`GET /api/officials` builds rows via `mergeOfficial(pub, null)`, which omits the `private` block entirely — so `official.private?.personalAddress` is always undefined there. The hometown backfill must read `GET /api/officials/hometowns` instead (city-level, public).
**Why:** Pointing backfill at `/api/officials` was a heavy full-roster fetch that filled ZERO hometowns. Private enrichment is intentionally stripped from the public roster (threat_model Information Disclosure).
**How to apply:** For any client feature needing an official's personalAddress/hometown, use the public city-level `/api/officials/hometowns`; never expect private fields from `/api/officials`.

## Map hometown dots require a PUBLIC city-level endpoint
The map's purple dots are populated by `GET /api/officials/hometowns` (public, returns city/region only via a sanitizer).
**Why:** The older `/api/officials/with-addresses` is admin-guarded (`requireAdminToken`); with no `ADMIN_REFRESH_TOKEN` set it returns 401/503 to the app, which silently zeroed out the dots. Also, per threat_model.md (Information Disclosure) the public surface must never expose street-level personal addresses — hence the city/region downgrade.
**How to apply:** Keep map/dot data on the public city-level route. Never point client map code at admin routes, and never widen the public route to return street-level addresses.
