import type { Express } from "express";
import fs from "fs";
import path from "path";
import { txHouseGeoJSON, txSenateGeoJSON, usCongressGeoJSON, txHouseGeoJSONFull, txSenateGeoJSONFull, usCongressGeoJSONFull } from "../data/geojson";
import * as turf from "@turf/turf";
import booleanIntersects from "@turf/boolean-intersects";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { lookupPlace, lookupPlaceCandidates, getCacheStats } from "../geonames";

type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX";

const mapHtml = fs.readFileSync(path.resolve(process.cwd(), "server", "templates", "map.html"), "utf-8");

const cachedGeoJSON: {
  tx_house: FeatureCollection | null;
  tx_senate: FeatureCollection | null;
  us_congress: FeatureCollection | null;
} = { tx_house: null, tx_senate: null, us_congress: null };

function getGeoJSONForOverlay(overlayType: string): FeatureCollection | null {
  if (overlayType === "house" || overlayType === "tx_house") {
    if (!cachedGeoJSON.tx_house) {
      cachedGeoJSON.tx_house = txHouseGeoJSON as unknown as FeatureCollection;
    }
    return cachedGeoJSON.tx_house;
  }
  if (overlayType === "senate" || overlayType === "tx_senate") {
    if (!cachedGeoJSON.tx_senate) {
      cachedGeoJSON.tx_senate = txSenateGeoJSON as unknown as FeatureCollection;
    }
    return cachedGeoJSON.tx_senate;
  }
  if (overlayType === "congress" || overlayType === "us_congress") {
    if (!cachedGeoJSON.us_congress) {
      cachedGeoJSON.us_congress = usCongressGeoJSON as unknown as FeatureCollection;
    }
    return cachedGeoJSON.us_congress;
  }
  return null;
}

function getSourceFromOverlay(overlay: string): SourceType {
  if (overlay === "house" || overlay === "tx_house") return "TX_HOUSE";
  if (overlay === "senate" || overlay === "tx_senate") return "TX_SENATE";
  return "US_HOUSE";
}

function getDistrictNumber(feature: Feature): number | null {
  const props = feature.properties || {};
  const districtNum = props.district || props.SLDUST || props.SLDLST || props.CD;
  return districtNum ? parseInt(String(districtNum)) : null;
}

export function registerMapRoutes(app: Express): void {
  app.get("/api/geojson/tx_house", (_req, res) => {
    res.json(txHouseGeoJSON);
  });

  app.get("/api/geojson/tx_senate", (_req, res) => {
    res.json(txSenateGeoJSON);
  });

  app.get("/api/geojson/us_congress", (_req, res) => {
    res.json(usCongressGeoJSON);
  });

  app.get("/api/geojson/tx_house_full", (_req, res) => {
    res.json(txHouseGeoJSONFull);
  });

  app.get("/api/geojson/tx_senate_full", (_req, res) => {
    res.json(txSenateGeoJSONFull);
  });

  app.get("/api/geojson/us_congress_full", (_req, res) => {
    res.json(usCongressGeoJSONFull);
  });

  app.get("/api/map.html", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(mapHtml);
  });

  app.get("/api/lookup/place", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();

      if (q.length < 2) {
        return res.status(400).json({ error: "Query too short (min 2 characters)" });
      }

      const { result, fromCache, error } = await lookupPlace(q);

      if (error) {
        console.log(`[Lookup] Place error: ${error}`);
        return res.status(500).json({ error });
      }

      if (!result) {
        console.log(`[Lookup] No Texas place found for "${q}"`);
        return res.status(404).json({ message: "No Texas place found" });
      }

      console.log(`[Lookup] Place: "${q}" → ${result.name} (${result.lat}, ${result.lng}) [cache=${fromCache}]`);
      res.json({ ...result, fromCache });
    } catch (err) {
      console.error("[Lookup] Place error:", err);
      res.status(500).json({ error: "Place lookup failed" });
    }
  });

  app.get("/api/lookup/place/candidates", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const maxResults = Math.min(parseInt(String(req.query.max || "5"), 10) || 5, 10);

      if (q.length < 2) {
        return res.status(400).json({ error: "Query too short (min 2 characters)" });
      }

      const { results, fromCache, error } = await lookupPlaceCandidates(q, maxResults);

      if (error) {
        console.log(`[Lookup] Place candidates error: ${error}`);
        return res.status(500).json({ error });
      }

      console.log(`[Lookup] Place candidates: "${q}" → ${results.length} results [cache=${fromCache}]`);
      res.json({ results, fromCache });
    } catch (err) {
      console.error("[Lookup] Place candidates error:", err);
      res.status(500).json({ error: "Place lookup failed" });
    }
  });

  app.post("/api/lookup/districts-at-point", (req, res) => {
    try {
      const { lat, lng } = req.body;

      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ error: "lat and lng (numbers) are required" });
      }

      console.log(`[Lookup] Districts at point: (${lat}, ${lng})`);

      const point = turf.point([lng, lat]);
      const hits: { source: SourceType; districtNumber: number }[] = [];

      const overlayMappings: Array<{ overlay: "house" | "senate" | "congress"; source: SourceType }> = [
        { overlay: "house", source: "TX_HOUSE" },
        { overlay: "senate", source: "TX_SENATE" },
        { overlay: "congress", source: "US_HOUSE" },
      ];

      for (const { overlay, source } of overlayMappings) {
        const featureCollection = getGeoJSONForOverlay(overlay);
        if (!featureCollection || !featureCollection.features) continue;

        for (const feature of featureCollection.features) {
          try {
            if (turf.booleanPointInPolygon(point, feature as Feature<Polygon>)) {
              const districtNumber = getDistrictNumber(feature as Feature);
              if (districtNumber !== null) {
                hits.push({ source, districtNumber });
                break;
              }
            }
          } catch {
          }
        }
      }

      console.log(`[Lookup] Districts found: ${hits.map(h => `${h.source}:${h.districtNumber}`).join(", ") || "none"}`);
      res.json({ hits, lat, lng });
    } catch (err) {
      console.error("[Lookup] Districts-at-point error:", err);
      res.status(500).json({ error: "Failed to find districts at point" });
    }
  });

  app.get("/api/lookup/cache-stats", (_req, res) => {
    res.json(getCacheStats());
  });

  app.post("/api/map/area-hits", (req, res) => {
    try {
      const { geometry, overlays } = req.body;

      if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
        return res.status(400).json({ error: "Invalid geometry: must be a Polygon" });
      }

      if (!overlays || typeof overlays !== "object") {
        return res.status(400).json({ error: "overlays object is required" });
      }

      console.log("[API] /api/map/area-hits - geometry points:", geometry.coordinates[0]?.length);
      console.log("[API] /api/map/area-hits - overlays:", JSON.stringify(overlays));

      const drawnPolygon = turf.polygon(geometry.coordinates);
      const hits: { source: SourceType; districtNumber: number }[] = [];
      const hitDebug: Record<string, number> = {};

      const overlayTypes = ["house", "senate", "congress"] as const;

      for (const overlayType of overlayTypes) {
        if (!overlays[overlayType]) continue;

        const featureCollection = getGeoJSONForOverlay(overlayType);
        if (!featureCollection || !featureCollection.features) {
          console.log(`[API] No GeoJSON for overlay: ${overlayType}`);
          continue;
        }

        let hitCount = 0;
        for (const feature of featureCollection.features) {
          try {
            if (booleanIntersects(drawnPolygon, feature as Feature)) {
              const districtNumber = getDistrictNumber(feature as Feature);
              if (districtNumber !== null) {
                const source = getSourceFromOverlay(overlayType);
                const alreadyExists = hits.some(
                  (h) => h.source === source && h.districtNumber === districtNumber
                );
                if (!alreadyExists) {
                  hits.push({ source, districtNumber });
                  hitCount++;
                }
              }
            }
          } catch {
            // Skip invalid geometries
          }
        }
        hitDebug[overlayType] = hitCount;
      }

      console.log("[API] /api/map/area-hits - hits per overlay:", JSON.stringify(hitDebug));
      console.log("[API] /api/map/area-hits - total hits:", hits.length);

      res.json({ hits });
    } catch (err) {
      console.error("[API] Error in /api/map/area-hits:", err);
      res.status(500).json({ error: "Failed to compute area hits" });
    }
  });

  app.get("/api/photo-proxy", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: "Missing url parameter" });
      }

      const allowedDomains = [
        "directory.texastribune.org",
        "www.congress.gov",
        "congress.gov",
        "bioguide.congress.gov",
      ];

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }

      if (!allowedDomains.includes(parsedUrl.hostname)) {
        return res.status(403).json({ error: "Domain not allowed" });
      }

      const imageResponse = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": `https://${parsedUrl.hostname}/`,
        },
      });

      if (!imageResponse.ok) {
        return res.status(imageResponse.status).json({ error: "Failed to fetch image" });
      }

      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await imageResponse.arrayBuffer());

      res.set({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
        "Content-Length": String(buffer.length),
      });
      res.send(buffer);
    } catch (error) {
      console.error("[API] Photo proxy error:", error);
      res.status(500).json({ error: "Photo proxy failed" });
    }
  });
}
