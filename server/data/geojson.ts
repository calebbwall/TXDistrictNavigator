import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function loadGeoJSON(filename: string): GeoJSONCollection {
  try {
    const filePath = path.join(__dirname, "geojson", filename);
    console.log(`[GeoJSON] Loading ${filename} from: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`[GeoJSON] File not found: ${filePath}`);
      console.log(`[GeoJSON] __dirname is: ${__dirname}`);
      console.log(`[GeoJSON] Directory contents:`, fs.readdirSync(__dirname));
      return { type: "FeatureCollection", features: [] };
    }
    
    const data = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(data) as GeoJSONCollection;
    console.log(`[GeoJSON] Successfully loaded ${filename}: ${parsed.features.length} features`);
    return parsed;
  } catch (error) {
    console.error(`[GeoJSON] Error loading ${filename}:`, error);
    return { type: "FeatureCollection", features: [] };
  }
}

export const txSenateGeoJSON = loadGeoJSON("tx_senate_simplified.geojson");
export const txHouseGeoJSON = loadGeoJSON("tx_house_simplified.geojson");
export const usCongressGeoJSON = loadGeoJSON("us_congress_simplified.geojson");
