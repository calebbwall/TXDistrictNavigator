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

function findGeoJSONPath(filename: string): string | null {
  const possiblePaths = [
    path.join(__dirname, "geojson", filename),
    path.join(process.cwd(), "server", "data", "geojson", filename),
    path.join(process.cwd(), "data", "geojson", filename),
    path.resolve("server", "data", "geojson", filename),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function loadGeoJSON(filename: string): GeoJSONCollection {
  try {
    const filePath = findGeoJSONPath(filename);
    
    if (!filePath) {
      console.error(`[GeoJSON] File not found: ${filename}`);
      console.log(`[GeoJSON] __dirname is: ${__dirname}`);
      console.log(`[GeoJSON] process.cwd() is: ${process.cwd()}`);
      
      const checkDir = path.join(__dirname, "geojson");
      if (fs.existsSync(checkDir)) {
        console.log(`[GeoJSON] Contents of ${checkDir}:`, fs.readdirSync(checkDir));
      } else {
        console.log(`[GeoJSON] Directory does not exist: ${checkDir}`);
        if (fs.existsSync(__dirname)) {
          console.log(`[GeoJSON] Contents of __dirname:`, fs.readdirSync(__dirname));
        }
      }
      return { type: "FeatureCollection", features: [] };
    }
    
    console.log(`[GeoJSON] Loading ${filename} from: ${filePath}`);
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

export const txSenateGeoJSONFull = loadGeoJSON("tx_senate.geojson");
export const txHouseGeoJSONFull = loadGeoJSON("tx_house.geojson");
export const usCongressGeoJSONFull = loadGeoJSON("us_congress.geojson");
