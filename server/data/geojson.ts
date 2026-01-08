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

const TEXAS_BOUNDS = {
  minLat: 25.8,
  maxLat: 36.5,
  minLng: -106.6,
  maxLng: -93.5,
};

function generateDistrictPolygon(districtNumber: number, totalDistricts: number): number[][][] {
  const cols = Math.ceil(Math.sqrt(totalDistricts));
  const rows = Math.ceil(totalDistricts / cols);
  
  const col = (districtNumber - 1) % cols;
  const row = Math.floor((districtNumber - 1) / cols);
  
  const latRange = TEXAS_BOUNDS.maxLat - TEXAS_BOUNDS.minLat;
  const lngRange = TEXAS_BOUNDS.maxLng - TEXAS_BOUNDS.minLng;
  
  const cellHeight = latRange / rows;
  const cellWidth = lngRange / cols;
  
  const padding = 0.05;
  
  const minLat = TEXAS_BOUNDS.minLat + row * cellHeight + padding;
  const maxLat = TEXAS_BOUNDS.minLat + (row + 1) * cellHeight - padding;
  const minLng = TEXAS_BOUNDS.minLng + col * cellWidth + padding;
  const maxLng = TEXAS_BOUNDS.minLng + (col + 1) * cellWidth - padding;
  
  return [[
    [minLng, maxLat],
    [maxLng, maxLat],
    [maxLng, minLat],
    [minLng, minLat],
    [minLng, maxLat],
  ]];
}

function generateGeoJSON(totalDistricts: number, chamberName: string): GeoJSONCollection {
  const features: GeoJSONFeature[] = [];
  
  for (let i = 1; i <= totalDistricts; i++) {
    features.push({
      type: "Feature",
      properties: {
        district: i,
        name: `${chamberName} District ${i}`,
      },
      geometry: {
        type: "Polygon",
        coordinates: generateDistrictPolygon(i, totalDistricts),
      },
    });
  }
  
  return {
    type: "FeatureCollection",
    features,
  };
}

export const txHouseGeoJSON = generateGeoJSON(150, "TX House");
export const txSenateGeoJSON = generateGeoJSON(31, "TX Senate");
export const usCongressGeoJSON = generateGeoJSON(38, "US Congress");
