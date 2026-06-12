/**
 * Shared timeout constants for outbound HTTP requests.
 *
 * Every fetch leaving this server must carry a bound: interactive request
 * handlers must not pin an Express worker on a hung upstream, and background
 * scrape jobs must not stall a whole refresh cycle on one dead socket.
 */

/** TLO / ArcGIS / RSS scrape requests (background jobs, per attempt). */
export const SCRAPER_FETCH_TIMEOUT_MS = 20_000;

/** Photo-proxy upstream image fetch — applies per request, including the
 *  single manually-followed redirect hop. */
export const PHOTO_PROXY_TIMEOUT_MS = 15_000;

/** Groq chat-completion calls (SDK-level timeout). */
export const GROQ_TIMEOUT_MS = 30_000;

/** Google Custom Search supplement — never allowed to hang an AI answer. */
export const WEB_SEARCH_TIMEOUT_MS = 10_000;

/** GeoNames place lookups (interactive map search). */
export const GEONAMES_TIMEOUT_MS = 10_000;

/** Texas Tribune directory scrapes (hometown/headshot/contact backfills). */
export const TRIBUNE_FETCH_TIMEOUT_MS = 20_000;

/** Expo push API delivery. */
export const EXPO_PUSH_TIMEOUT_MS = 15_000;
