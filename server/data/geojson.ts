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
      console.error(`[GeoJSON] File not found: ${filename} (cwd=${process.cwd()})`);
      return EMPTY;
    }
    console.log(`[GeoJSON] Loading ${filename} from: ${filePath}`);
    const data = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(data) as GeoJSONCollection;
    console.log(`[GeoJSON] Successfully loaded ${filename}: ${parsed.features.length} features`);
    return parsed;
  } catch (err) {
    console.error(`[GeoJSON] Error loading ${filename}:`, err);
    return EMPTY;
  }
}

// Exported as `let` so the live binding is updated once files are read.
// Starts as empty — populated asynchronously before any real request arrives.
export let txSenateGeoJSON: GeoJSONCollection = EMPTY;
export let txHouseGeoJSON: GeoJSONCollection = EMPTY;
export let usCongressGeoJSON: GeoJSONCollection = EMPTY;
export let txSenateGeoJSONFull: GeoJSONCollection = EMPTY;
export let txHouseGeoJSONFull: GeoJSONCollection = EMPTY;
export let usCongressGeoJSONFull: GeoJSONCollection = EMPTY;

// Load all six files concurrently in the background.
// Non-blocking — the HTTP server can start and pass health checks while
// this runs.  By the time any real API request arrives the files will
// already be populated (typical async I/O finishes in <500 ms).
(async () => {
  const [senate, house, congress, senateFull, houseFull, congressFull] =
    await Promise.all([
      loadGeoJSONAsync("tx_senate_simplified.geojson"),
      loadGeoJSONAsync("tx_house_simplified.geojson"),
      loadGeoJSONAsync("us_congress_simplified.geojson"),
      loadGeoJSONAsync("tx_senate.geojson"),
      loadGeoJSONAsync("tx_house.geojson"),
      loadGeoJSONAsync("us_congress.geojson"),
    ]);
  txSenateGeoJSON = senate;
  txHouseGeoJSON = house;
  usCongressGeoJSON = congress;
  txSenateGeoJSONFull = senateFull;
  txHouseGeoJSONFull = houseFull;
  usCongressGeoJSONFull = congressFull;
})();
