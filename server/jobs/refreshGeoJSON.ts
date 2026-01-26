import * as crypto from "crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db";
import { sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type GeoJSONSourceType = "TX_HOUSE_GEOJSON" | "TX_SENATE_GEOJSON" | "US_HOUSE_TX_GEOJSON";

const GEOJSON_SOURCES: Record<GeoJSONSourceType, { url: string; localFile: string; simplifiedFile: string }> = {
  TX_HOUSE_GEOJSON: {
    url: "https://maps.dot.state.tx.us/arcgis/rest/services/Boundaries/MapServer/8/query?where=1%3D1&outFields=*&outSR=4326&f=geojson",
    localFile: "tx_house.geojson",
    simplifiedFile: "tx_house_simplified.geojson",
  },
  TX_SENATE_GEOJSON: {
    url: "https://maps.dot.state.tx.us/arcgis/rest/services/Boundaries/MapServer/7/query?where=1%3D1&outFields=*&outSR=4326&f=geojson",
    localFile: "tx_senate.geojson",
    simplifiedFile: "tx_senate_simplified.geojson",
  },
  US_HOUSE_TX_GEOJSON: {
    url: "https://maps.dot.state.tx.us/arcgis/rest/services/Boundaries/MapServer/6/query?where=1%3D1&outFields=*&outSR=4326&f=geojson",
    localFile: "us_congress.geojson",
    simplifiedFile: "us_congress_simplified.geojson",
  },
};

const GEOJSON_DIR = path.join(__dirname, "..", "data", "geojson");

async function ensureGeoJSONRefreshTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS geojson_refresh_state (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      source VARCHAR NOT NULL UNIQUE,
      fingerprint TEXT,
      last_checked_at TIMESTAMP,
      last_changed_at TIMESTAMP,
      last_refreshed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )
  `);
}

function computeFingerprint(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TexasDistrictsApp/1.0 (GeoJSON Sync)",
          "Accept": "application/json",
        },
      });
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

interface GeoJSONRefreshStateRow {
  [key: string]: unknown;
  id: string;
  source: string;
  fingerprint: string | null;
  last_checked_at: Date | null;
  last_changed_at: Date | null;
  last_refreshed_at: Date | null;
}

async function getGeoJSONRefreshState(source: string): Promise<{
  fingerprint: string | null;
  lastCheckedAt: Date | null;
  lastChangedAt: Date | null;
} | null> {
  await ensureGeoJSONRefreshTable();
  
  const result = await db.execute<GeoJSONRefreshStateRow>(
    sql`SELECT * FROM geojson_refresh_state WHERE source = ${source} LIMIT 1`
  );
  
  if (!result.rows || result.rows.length === 0) return null;
  
  const row = result.rows[0];
  return {
    fingerprint: row.fingerprint,
    lastCheckedAt: row.last_checked_at,
    lastChangedAt: row.last_changed_at,
  };
}

async function updateGeoJSONRefreshState(source: string, fingerprint: string, changed: boolean): Promise<void> {
  await ensureGeoJSONRefreshTable();
  
  const now = new Date();
  
  const existing = await db.execute<GeoJSONRefreshStateRow>(
    sql`SELECT * FROM geojson_refresh_state WHERE source = ${source} LIMIT 1`
  );
  
  if (existing.rows && existing.rows.length > 0) {
    const row = existing.rows[0];
    await db.execute(sql`
      UPDATE geojson_refresh_state SET
        fingerprint = ${fingerprint},
        last_checked_at = ${now},
        last_changed_at = ${changed ? now : row.last_changed_at},
        last_refreshed_at = ${changed ? now : row.last_refreshed_at},
        updated_at = ${now}
      WHERE id = ${row.id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO geojson_refresh_state (source, fingerprint, last_checked_at, last_changed_at, last_refreshed_at)
      VALUES (${source}, ${fingerprint}, ${now}, ${changed ? now : null}, ${changed ? now : null})
    `);
  }
}

async function markGeoJSONCheckedOnly(source: string): Promise<void> {
  await ensureGeoJSONRefreshTable();
  
  const now = new Date();
  
  const existing = await db.execute<GeoJSONRefreshStateRow>(
    sql`SELECT * FROM geojson_refresh_state WHERE source = ${source} LIMIT 1`
  );
  
  if (existing.rows && existing.rows.length > 0) {
    await db.execute(sql`
      UPDATE geojson_refresh_state SET
        last_checked_at = ${now},
        updated_at = ${now}
      WHERE source = ${source}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO geojson_refresh_state (source, last_checked_at)
      VALUES (${source}, ${now})
    `);
  }
}

interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

interface NormalizeResult {
  collection: GeoJSONCollection | null;
  error?: string;
  samplePropertyKeys?: string[];
}

const EXPECTED_COUNTS: Record<GeoJSONSourceType, number> = {
  TX_HOUSE_GEOJSON: 150,
  TX_SENATE_GEOJSON: 31,
  US_HOUSE_TX_GEOJSON: 38,
};

function extractDistrictNumber(props: Record<string, unknown>, source: GeoJSONSourceType): number | null {
  let value: unknown;
  
  if (source === "TX_HOUSE_GEOJSON") {
    value = props.TX_HOUSE_DIST_NBR ?? props.TX_REP_DIST_NBR ?? props.DIST_NBR ?? props.SLDLST ?? props.district;
  } else if (source === "TX_SENATE_GEOJSON") {
    value = props.TX_SEN_DIST_NBR ?? props.DIST_NBR ?? props.SLDUST ?? props.district;
  } else {
    value = props.TX_US_HOUSE_DIST_NBR ?? props.CD ?? props.CONG_DIST ?? props.district;
  }
  
  if (value === undefined || value === null) return null;
  
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeGeoJSON(raw: GeoJSONCollection, source: GeoJSONSourceType): NormalizeResult {
  const sampleProps = raw.features[0]?.properties;
  const samplePropertyKeys = sampleProps ? Object.keys(sampleProps) : [];
  
  const features: GeoJSONFeature[] = [];
  const districtsSeen = new Set<number>();
  let fallbackCount = 0;
  
  for (let idx = 0; idx < raw.features.length; idx++) {
    const feature = raw.features[idx];
    const props = feature.properties || {};
    
    const district = extractDistrictNumber(props, source);
    
    if (district === null) {
      fallbackCount++;
      console.error(`[RefreshGeoJSON] ${source}: Feature ${idx} has no valid district number. Props: ${JSON.stringify(Object.keys(props))}`);
      continue;
    }
    
    if (districtsSeen.has(district)) {
      console.warn(`[RefreshGeoJSON] ${source}: Duplicate district ${district} at feature ${idx}`);
    }
    districtsSeen.add(district);
    
    let name: string;
    if (source === "TX_HOUSE_GEOJSON") {
      name = String(props.TX_HOUSE_DIST_NM || props.TX_REP_DIST_NM || props.name || `TX House District ${district}`);
    } else if (source === "TX_SENATE_GEOJSON") {
      name = String(props.TX_SEN_DIST_NM || props.name || `TX Senate District ${district}`);
    } else {
      name = String(props.NAMELSAD || props.name || `US Congress District ${district}`);
    }
    
    features.push({
      type: "Feature",
      properties: { district, name },
      geometry: feature.geometry,
    });
  }
  
  features.sort((a, b) => a.properties.district as number - (b.properties.district as number));
  
  const expectedCount = EXPECTED_COUNTS[source];
  const actualCount = features.length;
  
  if (fallbackCount > 0) {
    return {
      collection: null,
      error: `${fallbackCount} features had no valid district number. Sample props: ${samplePropertyKeys.join(", ")}`,
      samplePropertyKeys,
    };
  }
  
  if (actualCount === 0) {
    return {
      collection: null,
      error: `No valid features extracted. Sample props: ${samplePropertyKeys.join(", ")}`,
      samplePropertyKeys,
    };
  }
  
  if (actualCount !== expectedCount) {
    console.warn(`[RefreshGeoJSON] ${source}: Expected ${expectedCount} districts but got ${actualCount}`);
  }
  
  const duplicateCount = raw.features.length - districtsSeen.size;
  if (duplicateCount > 1) {
    return {
      collection: null,
      error: `Too many duplicate districts (${duplicateCount}). Sample props: ${samplePropertyKeys.join(", ")}`,
      samplePropertyKeys,
    };
  }
  
  return {
    collection: {
      type: "FeatureCollection",
      features,
    },
    samplePropertyKeys,
  };
}

function coordsEqual(a: number[], b: number[]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function isRingClosed(ring: number[][]): boolean {
  if (ring.length < 2) return false;
  return coordsEqual(ring[0], ring[ring.length - 1]);
}

function douglasPeuckerSimplify(coords: number[][], tolerance: number): number[][] {
  if (coords.length <= 2) return coords;
  
  let maxDist = 0;
  let maxIdx = 0;
  const first = coords[0];
  const last = coords[coords.length - 1];
  
  for (let i = 1; i < coords.length - 1; i++) {
    const dist = perpendicularDistance(coords[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  
  if (maxDist > tolerance) {
    const left = douglasPeuckerSimplify(coords.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeuckerSimplify(coords.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  
  return [first, last];
}

function simplifyRing(ring: number[][], tolerance: number): number[][] {
  const wasClosed = isRingClosed(ring);
  
  if (wasClosed) {
    const openRing = ring.slice(0, -1);
    
    if (openRing.length < 3) {
      return ring;
    }
    
    const simplified = douglasPeuckerSimplify(openRing, tolerance);
    
    if (simplified.length < 3) {
      console.warn(`[RefreshGeoJSON] Ring simplified to ${simplified.length} points, using original`);
      return ring;
    }
    
    const closedRing = [...simplified, simplified[0]];
    
    if (closedRing.length < 4) {
      console.warn(`[RefreshGeoJSON] Closed ring has ${closedRing.length} points, using original`);
      return ring;
    }
    
    return closedRing;
  } else {
    return douglasPeuckerSimplify(ring, tolerance);
  }
}

function perpendicularDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  
  if (dx === 0 && dy === 0) {
    return Math.sqrt(Math.pow(point[0] - lineStart[0], 2) + Math.pow(point[1] - lineStart[1], 2));
  }
  
  const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (dx * dx + dy * dy);
  const nearestX = lineStart[0] + t * dx;
  const nearestY = lineStart[1] + t * dy;
  
  return Math.sqrt(Math.pow(point[0] - nearestX, 2) + Math.pow(point[1] - nearestY, 2));
}

interface GeometryValidationResult {
  valid: boolean;
  errors: string[];
}

function validateGeometry(geometry: GeoJSONFeature["geometry"], district: number): GeometryValidationResult {
  const errors: string[] = [];
  
  const validateRing = (ring: number[][], ringType: string) => {
    if (ring.length < 4) {
      errors.push(`${ringType} has only ${ring.length} points (min 4)`);
    }
    if (!isRingClosed(ring)) {
      errors.push(`${ringType} is not closed`);
    }
  };
  
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    coords.forEach((ring, i) => {
      validateRing(ring, `District ${district} Polygon ring ${i}`);
    });
  } else if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates as number[][][][];
    coords.forEach((polygon, p) => {
      polygon.forEach((ring, r) => {
        validateRing(ring, `District ${district} MultiPolygon[${p}] ring ${r}`);
      });
    });
  }
  
  return { valid: errors.length === 0, errors };
}

function simplifyGeometry(geometry: GeoJSONFeature["geometry"], tolerance = 0.001): GeoJSONFeature["geometry"] {
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    return {
      type: "Polygon",
      coordinates: coords.map(ring => simplifyRing(ring, tolerance)),
    };
  } else if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates as number[][][][];
    return {
      type: "MultiPolygon",
      coordinates: coords.map(polygon => 
        polygon.map(ring => simplifyRing(ring, tolerance))
      ),
    };
  }
  return geometry;
}

interface SimplifiedGeoJSONResult {
  collection: GeoJSONCollection | null;
  errors: string[];
}

function createSimplifiedGeoJSON(geojson: GeoJSONCollection): SimplifiedGeoJSONResult {
  const allErrors: string[] = [];
  
  const features = geojson.features.map(feature => {
    const district = feature.properties.district as number;
    const simplifiedGeometry = simplifyGeometry(feature.geometry);
    
    const validation = validateGeometry(simplifiedGeometry, district);
    if (!validation.valid) {
      allErrors.push(...validation.errors);
    }
    
    return {
      ...feature,
      geometry: simplifiedGeometry,
    };
  });
  
  if (allErrors.length > 0) {
    console.error(`[RefreshGeoJSON] Geometry validation errors: ${allErrors.slice(0, 5).join("; ")}${allErrors.length > 5 ? ` ... and ${allErrors.length - 5} more` : ""}`);
    return {
      collection: null,
      errors: allErrors,
    };
  }
  
  return {
    collection: {
      type: "FeatureCollection",
      features,
    },
    errors: [],
  };
}

async function writeGeoJSONFile(filename: string, data: GeoJSONCollection): Promise<void> {
  const filePath = path.join(GEOJSON_DIR, filename);
  const tempPath = filePath + ".tmp";
  
  await fs.promises.writeFile(tempPath, JSON.stringify(data), "utf8");
  await fs.promises.rename(tempPath, filePath);
}

export interface GeoJSONCheckResult {
  source: GeoJSONSourceType;
  changed: boolean;
  previousFingerprint: string | null;
  newFingerprint: string;
  featureCount?: number;
  error?: string;
}

export async function checkGeoJSONSourceForChanges(source: GeoJSONSourceType): Promise<GeoJSONCheckResult> {
  console.log(`[RefreshGeoJSON] Checking ${source} for changes...`);
  
  try {
    const config = GEOJSON_SOURCES[source];
    const response = await fetchWithRetry(config.url);
    const rawText = await response.text();
    
    const newFingerprint = computeFingerprint(rawText);
    const state = await getGeoJSONRefreshState(source);
    const previousFingerprint = state?.fingerprint || null;
    const changed = previousFingerprint !== newFingerprint;
    
    let featureCount: number | undefined;
    try {
      const parsed = JSON.parse(rawText) as GeoJSONCollection;
      featureCount = parsed.features?.length;
    } catch {
      featureCount = undefined;
    }
    
    console.log(`[RefreshGeoJSON] ${source}: fingerprint=${newFingerprint.slice(0, 12)}... changed=${changed} features=${featureCount ?? "?"}`);
    
    return {
      source,
      changed,
      previousFingerprint,
      newFingerprint,
      featureCount,
    };
  } catch (err) {
    console.error(`[RefreshGeoJSON] Error checking ${source}:`, err);
    return {
      source,
      changed: false,
      previousFingerprint: null,
      newFingerprint: "",
      error: String(err),
    };
  }
}

export interface GeoJSONRefreshResult {
  source: GeoJSONSourceType;
  success: boolean;
  featureCount: number;
  error?: string;
}

async function refreshGeoJSONSource(source: GeoJSONSourceType): Promise<GeoJSONRefreshResult> {
  console.log(`[RefreshGeoJSON] Refreshing ${source}...`);
  
  try {
    const config = GEOJSON_SOURCES[source];
    const response = await fetchWithRetry(config.url);
    const rawText = await response.text();
    const rawData = JSON.parse(rawText) as GeoJSONCollection;
    
    if (!rawData.features || rawData.features.length === 0) {
      throw new Error("No features in response");
    }
    
    const normalizeResult = normalizeGeoJSON(rawData, source);
    
    if (!normalizeResult.collection) {
      console.error(`[RefreshGeoJSON] ${source}: Normalization failed - ${normalizeResult.error}`);
      console.error(`[RefreshGeoJSON] ${source}: Sample property keys: ${normalizeResult.samplePropertyKeys?.join(", ")}`);
      return {
        source,
        success: false,
        featureCount: 0,
        error: `Validation failed: ${normalizeResult.error}`,
      };
    }
    
    const normalized = normalizeResult.collection;
    const simplifiedResult = createSimplifiedGeoJSON(normalized);
    
    if (!simplifiedResult.collection) {
      console.error(`[RefreshGeoJSON] ${source}: Simplified geometry validation failed`);
      return {
        source,
        success: false,
        featureCount: 0,
        error: `Geometry validation failed: ${simplifiedResult.errors.slice(0, 3).join("; ")}`,
      };
    }
    
    await writeGeoJSONFile(config.localFile, normalized);
    await writeGeoJSONFile(config.simplifiedFile, simplifiedResult.collection);
    
    console.log(`[RefreshGeoJSON] ${source}: Wrote ${normalized.features.length} features to ${config.localFile} and ${config.simplifiedFile}`);
    
    const newFingerprint = computeFingerprint(rawText);
    await updateGeoJSONRefreshState(source, newFingerprint, true);
    
    return {
      source,
      success: true,
      featureCount: normalized.features.length,
    };
  } catch (err) {
    console.error(`[RefreshGeoJSON] Error refreshing ${source}:`, err);
    return {
      source,
      success: false,
      featureCount: 0,
      error: String(err),
    };
  }
}

let isRefreshingGeoJSON = false;

export function getIsRefreshingGeoJSON(): boolean {
  return isRefreshingGeoJSON;
}

export interface SmartGeoJSONRefreshResult {
  sourcesChecked: GeoJSONSourceType[];
  sourcesChanged: GeoJSONSourceType[];
  sourcesRefreshed: GeoJSONSourceType[];
  errors: { source: GeoJSONSourceType; error: string }[];
  durationMs: number;
}

export async function checkAndRefreshGeoJSONIfChanged(force = false): Promise<SmartGeoJSONRefreshResult> {
  if (isRefreshingGeoJSON) {
    console.log("[RefreshGeoJSON] Refresh already in progress, skipping");
    return {
      sourcesChecked: [],
      sourcesChanged: [],
      sourcesRefreshed: [],
      errors: [{ source: "TX_HOUSE_GEOJSON", error: "Refresh already in progress" }],
      durationMs: 0,
    };
  }
  
  isRefreshingGeoJSON = true;
  const startTime = Date.now();
  const result: SmartGeoJSONRefreshResult = {
    sourcesChecked: [],
    sourcesChanged: [],
    sourcesRefreshed: [],
    errors: [],
    durationMs: 0,
  };
  
  console.log(`[RefreshGeoJSON] Starting smart check-and-refresh (force=${force})`);
  
  try {
    const sources: GeoJSONSourceType[] = ["TX_HOUSE_GEOJSON", "TX_SENATE_GEOJSON", "US_HOUSE_TX_GEOJSON"];
    
    for (const source of sources) {
      result.sourcesChecked.push(source);
      
      const checkResult = await checkGeoJSONSourceForChanges(source);
      
      if (checkResult.error) {
        result.errors.push({ source, error: checkResult.error });
        continue;
      }
      
      if (!checkResult.changed && !force) {
        console.log(`[RefreshGeoJSON] ${source}: No changes detected, skipping refresh`);
        await markGeoJSONCheckedOnly(source);
        continue;
      }
      
      result.sourcesChanged.push(source);
      console.log(`[RefreshGeoJSON] ${source}: Changes detected, running refresh...`);
      
      const refreshResult = await refreshGeoJSONSource(source);
      
      if (refreshResult.success) {
        result.sourcesRefreshed.push(source);
      } else if (refreshResult.error) {
        result.errors.push({ source, error: refreshResult.error });
      }
      
      await new Promise(r => setTimeout(r, 500));
    }
    
  } finally {
    isRefreshingGeoJSON = false;
    result.durationMs = Date.now() - startTime;
  }
  
  console.log(`[RefreshGeoJSON] Smart refresh completed: checked=${result.sourcesChecked.length}, changed=${result.sourcesChanged.length}, refreshed=${result.sourcesRefreshed.length}, errors=${result.errors.length} in ${result.durationMs}ms`);
  
  return result;
}

export async function wasGeoJSONCheckedThisWeek(): Promise<boolean> {
  const sources: GeoJSONSourceType[] = ["TX_HOUSE_GEOJSON", "TX_SENATE_GEOJSON", "US_HOUSE_TX_GEOJSON"];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  for (const source of sources) {
    const state = await getGeoJSONRefreshState(source);
    if (!state?.lastCheckedAt || state.lastCheckedAt < oneWeekAgo) {
      return false;
    }
  }
  
  return true;
}

export async function getGeoJSONRefreshStates(): Promise<Array<{
  source: string;
  fingerprint: string | null;
  lastCheckedAt: Date | null;
  lastChangedAt: Date | null;
  lastRefreshedAt: Date | null;
}>> {
  await ensureGeoJSONRefreshTable();
  
  const result = await db.execute<GeoJSONRefreshStateRow>(
    sql`SELECT * FROM geojson_refresh_state`
  );
  
  return (result.rows || []).map(row => ({
    source: row.source,
    fingerprint: row.fingerprint,
    lastCheckedAt: row.last_checked_at,
    lastChangedAt: row.last_changed_at,
    lastRefreshedAt: row.last_refreshed_at,
  }));
}
