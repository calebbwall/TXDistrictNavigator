/**
 * Named timeout constants for all outbound HTTP requests.
 *
 * Every `fetch()` in server code must carry an AbortSignal — an unbounded
 * fetch can pin a request handler (or wedge a background job) indefinitely
 * when an upstream stalls. The static audit in
 * server/__tests__/timeouts.test.ts enforces this.
 */

/** Interactive request-path lookups (geonames place search). */
export const FETCH_TIMEOUT_LOOKUP_MS = 10_000;

/** Image proxying on the request path (photo-proxy). */
export const FETCH_TIMEOUT_PROXY_MS = 15_000;

/** Third-party page scrapes (Texas Tribune directory, Expo push API). */
export const FETCH_TIMEOUT_EXTERNAL_MS = 15_000;

/** Background scraping jobs (TLO pages, RSS feeds, officials rosters). */
export const FETCH_TIMEOUT_SCRAPE_MS = 20_000;

/** Large-payload sources (court rosters, ArcGIS metadata). */
export const FETCH_TIMEOUT_LARGE_MS = 30_000;

/** Full GeoJSON district downloads — tens of MB from ArcGIS. */
export const FETCH_TIMEOUT_GEOJSON_MS = 120_000;

/** Groq chat completions (SDK-level timeout). */
export const GROQ_TIMEOUT_MS = 30_000;

/** Supplementary Google web search — never worth blocking a request for. */
export const WEB_SEARCH_TIMEOUT_MS = 10_000;
