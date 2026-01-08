import type { DistrictType } from "./mockData";

export interface DistrictPolygon {
  id: string;
  districtType: DistrictType;
  districtNumber: number;
  coordinates: { latitude: number; longitude: number }[];
  center: { latitude: number; longitude: number };
}

const TEXAS_CENTER = { latitude: 31.0, longitude: -99.5 };

function generateDistrictGrid(
  type: DistrictType,
  prefix: string,
  count: number
): DistrictPolygon[] {
  const districts: DistrictPolygon[] = [];
  const rows = 4;
  const cols = 6;
  const latStart = 34.0;
  const latEnd = 26.0;
  const lonStart = -106.5;
  const lonEnd = -93.5;
  const latStep = (latStart - latEnd) / rows;
  const lonStep = (lonEnd - lonStart) / cols;
  const padding = 0.05;

  for (let i = 0; i < count && i < rows * cols; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const latTop = latStart - row * latStep;
    const latBottom = latTop - latStep;
    const lonLeft = lonStart + col * lonStep;
    const lonRight = lonLeft + lonStep;
    const centerLat = (latTop + latBottom) / 2;
    const centerLon = (lonLeft + lonRight) / 2;

    districts.push({
      id: `${prefix}-${i + 1}`,
      districtType: type,
      districtNumber: i + 1,
      center: { latitude: centerLat, longitude: centerLon },
      coordinates: [
        { latitude: latTop - padding, longitude: lonLeft + padding },
        { latitude: latTop - padding, longitude: lonRight - padding },
        { latitude: latBottom + padding, longitude: lonRight - padding },
        { latitude: latBottom + padding, longitude: lonLeft + padding },
      ],
    });
  }
  return districts;
}

export const senatePolygons: DistrictPolygon[] = generateDistrictGrid("senate", "s", 24);
export const housePolygons: DistrictPolygon[] = generateDistrictGrid("house", "h", 24);
export const congressPolygons: DistrictPolygon[] = generateDistrictGrid("congress", "c", 24);

export function getPolygonsByType(type: DistrictType): DistrictPolygon[] {
  switch (type) {
    case "senate":
      return senatePolygons;
    case "house":
      return housePolygons;
    case "congress":
      return congressPolygons;
  }
}

export function getPolygonById(id: string): DistrictPolygon | undefined {
  return [...senatePolygons, ...housePolygons, ...congressPolygons].find(
    (p) => p.id === id
  );
}

export { TEXAS_CENTER };
