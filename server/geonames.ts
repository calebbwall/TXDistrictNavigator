const GEONAMES_BASE = "http://api.geonames.org";

interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  geonameId?: number;
  postalCode?: string;
}

interface CacheEntry {
  result: PlaceResult | null;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCached(key: string): PlaceResult | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.result;
}

function setCache(key: string, result: PlaceResult | null): void {
  cache.set(key, { result, timestamp: Date.now() });
}

const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

export async function lookupPlace(query: string): Promise<{ result: PlaceResult | null; fromCache: boolean; error?: string }> {
  const username = process.env.GEONAMES_USERNAME;
  if (!username) {
    return { result: null, fromCache: false, error: "GEONAMES_USERNAME secret is not configured" };
  }

  const normalized = normalizeQuery(query);
  if (normalized.length < 2) {
    return { result: null, fromCache: false, error: "Query too short (min 2 characters)" };
  }

  const cacheKey = `place:${normalized}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) {
    console.log(`[GeoNames] Cache hit for "${normalized}"`);
    return { result: cached, fromCache: true };
  }

  try {
    let result: PlaceResult | null = null;

    if (ZIP_REGEX.test(normalized)) {
      result = await lookupZIP(normalized, username);
    } else {
      result = await lookupCity(normalized, username);
    }

    setCache(cacheKey, result);
    return { result, fromCache: false };
  } catch (err) {
    console.error("[GeoNames] API error:", err);
    return { result: null, fromCache: false, error: "GeoNames API request failed" };
  }
}

async function lookupZIP(zip: string, username: string): Promise<PlaceResult | null> {
  const cleanZip = zip.split("-")[0];
  const url = `${GEONAMES_BASE}/postalCodeSearchJSON?postalcode=${cleanZip}&country=US&maxRows=5&username=${username}`;
  console.log(`[GeoNames] ZIP lookup: ${GEONAMES_BASE}/postalCodeSearchJSON?postalcode=${cleanZip}&country=US&maxRows=5`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GeoNames API returned ${response.status}`);
  }

  const data = await response.json() as { postalCodes?: Array<{ lat: number; lng: number; placeName: string; adminCode1: string; postalCode: string }> };
  
  if (!data.postalCodes || data.postalCodes.length === 0) {
    console.log(`[GeoNames] No results for ZIP ${cleanZip}`);
    return null;
  }

  const texasResult = data.postalCodes.find(p => p.adminCode1 === "TX");
  if (!texasResult) {
    console.log(`[GeoNames] ZIP ${cleanZip} exists but not in Texas`);
    return null;
  }

  const result: PlaceResult = {
    name: `${texasResult.placeName}, Texas ${texasResult.postalCode}`,
    lat: texasResult.lat,
    lng: texasResult.lng,
    postalCode: texasResult.postalCode,
  };

  console.log(`[GeoNames] ZIP resolved: ${result.name} at (${result.lat}, ${result.lng})`);
  return result;
}

async function lookupCity(query: string, username: string): Promise<PlaceResult | null> {
  const url = `${GEONAMES_BASE}/searchJSON?q=${encodeURIComponent(query)}&country=US&adminCode1=TX&featureClass=P&maxRows=5&username=${username}`;
  console.log(`[GeoNames] City lookup: ${GEONAMES_BASE}/searchJSON?q=${encodeURIComponent(query)}&country=US&adminCode1=TX&featureClass=P&maxRows=5`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GeoNames API returned ${response.status}`);
  }

  const data = await response.json() as { geonames?: Array<{ lat: string; lng: string; name: string; adminName1: string; geonameId: number }> };

  if (!data.geonames || data.geonames.length === 0) {
    console.log(`[GeoNames] No Texas places found for "${query}"`);
    return null;
  }

  const exactMatch = data.geonames.find(g => g.name.toLowerCase() === query.toLowerCase());
  const best = exactMatch || data.geonames[0];

  if (best.adminName1 !== "Texas") {
    console.log(`[GeoNames] Result not in Texas: ${best.adminName1}`);
    return null;
  }

  const result: PlaceResult = {
    name: `${best.name}, Texas`,
    lat: parseFloat(best.lat),
    lng: parseFloat(best.lng),
    geonameId: best.geonameId,
  };

  console.log(`[GeoNames] City resolved: ${result.name} at (${result.lat}, ${result.lng})`);
  return result;
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()).slice(0, 20),
  };
}
