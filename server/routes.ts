import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { txHouseGeoJSON, txSenateGeoJSON, usCongressGeoJSON } from "./data/geojson";
import { 
  allOfficials, 
  getOfficialsByDistrict, 
  getOfficialsByChamber,
  type DistrictType 
} from "./data/officials";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/geojson/tx_house", (_req, res) => {
    res.json(txHouseGeoJSON);
  });

  app.get("/api/geojson/tx_senate", (_req, res) => {
    res.json(txSenateGeoJSON);
  });

  app.get("/api/geojson/us_congress", (_req, res) => {
    res.json(usCongressGeoJSON);
  });

  app.get("/api/officials", (req, res) => {
    const { district_type } = req.query;
    
    if (district_type && typeof district_type === "string") {
      const validTypes: DistrictType[] = ["tx_house", "tx_senate", "us_congress"];
      if (validTypes.includes(district_type as DistrictType)) {
        const officials = getOfficialsByChamber(district_type as DistrictType);
        return res.json({ officials, count: officials.length });
      }
      return res.status(400).json({ error: "Invalid district_type" });
    }
    
    res.json({ officials: allOfficials, count: allOfficials.length });
  });

  app.get("/api/officials/by-district", (req, res) => {
    const { district_type, district_number } = req.query;
    
    if (!district_type || !district_number) {
      return res.status(400).json({ error: "district_type and district_number are required" });
    }
    
    const validTypes: DistrictType[] = ["tx_house", "tx_senate", "us_congress"];
    if (!validTypes.includes(district_type as DistrictType)) {
      return res.status(400).json({ error: "Invalid district_type" });
    }
    
    const num = parseInt(district_number as string, 10);
    if (isNaN(num)) {
      return res.status(400).json({ error: "Invalid district_number" });
    }
    
    const official = getOfficialsByDistrict(district_type as DistrictType, num);
    if (!official) {
      return res.status(404).json({ error: "Official not found" });
    }
    
    res.json({ official });
  });

  app.get("/api/stats", (_req, res) => {
    res.json({
      tx_house: 150,
      tx_senate: 31,
      us_congress: 38,
      total: 219,
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
