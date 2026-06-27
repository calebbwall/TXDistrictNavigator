import * as fs from "node:fs";
import * as path from "node:path";

export interface GeoJSONFeature {
  type: "Feature";
  properties: {
    district: number;
    name: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

const EMPTY: GeoJSONCollection = { type: "FeatureCollection", features: [] };

function findGeoJSONPath(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), "server", "data", "geojson", filename),
    path.join(process.cwd(), "data", "geojson", filename),
    path.resolve("server", "data", "geojson", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function loadGeoJSONAsync(filename: string): Promise<GeoJSONCollection> {
  try {
    const filePath = findGeoJSONPath(filename);
    if (!filePath) {
      console.error(
        `[GeoJSON] File not found: ${filename} (cwd=${process.cwd()})`,
      );
      return EMPTY;
    }
    console.log(`[GeoJSON] Loading ${filename} from: ${filePath}`);
    const data = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(data) as GeoJSONCollection;
    if (!parsed || !Array.isArray(parsed.features)) {
      console.error(
        `[GeoJSON] Invalid structure in ${filename}: missing "features" array`,
      );
      return EMPTY;
    }
    console.log(
      `[GeoJSON] Successfully loaded ${filename}: ${parsed.features.length} features`,
    );
    return parsed;
  } catch (err) {
    console.error(`[GeoJSON] Error loading ${filename}:`, err);
    return EMPTY;
  }
}

// Exported as `let` so the live binding is updated once files are read.
// Starts as empty — populated asynchronously before any real request arrives.
// Simplified files are small and are read on every map interaction (overlay
// rendering, point-in-district lookup, draw-to-search), so load them eagerly.
export let txSenateGeoJSON: GeoJSONCollection = EMPTY;
export let txHouseGeoJSON: GeoJSONCollection = EMPTY;
export let usCongressGeoJSON: GeoJSONCollection = EMPTY;

// Load the three simplified files concurrently in the background.
// Non-blocking — the HTTP server can start and pass health checks while
// this runs.  By the time any real API request arrives the files will
// already be populated (typical async I/O finishes in <500 ms).
//
// A request that lands in that <500 ms boot window used to receive an EMPTY
// FeatureCollection, which the map client treats as "validation failed" and
// escalates to the ~69 MB full file. To close that race, route handlers can
// await `whenSimplifiedReady()` before responding so a boot-window request
// gets real data instead of an empty collection.
let simplifiedReady = false;
const simplifiedReadyPromise: Promise<void> = (async () => {
  const [senate, house, congress] = await Promise.all([
    loadGeoJSONAsync("tx_senate_simplified.geojson"),
    loadGeoJSONAsync("tx_house_simplified.geojson"),
    loadGeoJSONAsync("us_congress_simplified.geojson"),
  ]);
  txSenateGeoJSON = senate;
  txHouseGeoJSON = house;
  usCongressGeoJSON = congress;
  simplifiedReady = true;
})();

/** Resolves once the simplified GeoJSON files have finished loading (or failed
 *  and fallen back to EMPTY). Always resolves — never rejects. */
export function whenSimplifiedReady(): Promise<void> {
  return simplifiedReadyPromise;
}

/** True once the simplified files have been read into the live bindings. */
export function isSimplifiedReady(): boolean {
  return simplifiedReady;
}

// Full-resolution files are large (~69 MB combined) and are ONLY served by the
// /api/geojson/*_full fallback endpoints, which the client requests rarely
// (only when simplified validation fails on-device). Loading them at boot
// wasted memory and slowed startup, so load each lazily on first request and
// cache the parsed result for subsequent calls.
const fullCache: Record<string, GeoJSONCollection> = {};
const fullLoading: Record<string, Promise<GeoJSONCollection>> = {};

function loadFullOnce(
  key: string,
  filename: string,
): Promise<GeoJSONCollection> {
  if (fullCache[key]) return Promise.resolve(fullCache[key]);
  if (!fullLoading[key]) {
    fullLoading[key] = loadGeoJSONAsync(filename).then((data) => {
      fullCache[key] = data;
      delete fullLoading[key];
      return data;
    });
  }
  return fullLoading[key];
}

export function getTxSenateGeoJSONFull(): Promise<GeoJSONCollection> {
  return loadFullOnce("tx_senate", "tx_senate.geojson");
}
export function getTxHouseGeoJSONFull(): Promise<GeoJSONCollection> {
  return loadFullOnce("tx_house", "tx_house.geojson");
}
export function getUsCongressGeoJSONFull(): Promise<GeoJSONCollection> {
  return loadFullOnce("us_congress", "us_congress.geojson");
}
