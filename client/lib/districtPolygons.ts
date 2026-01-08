import type { DistrictType } from "./mockData";

export interface DistrictPolygon {
  id: string;
  districtType: DistrictType;
  districtNumber: number;
  coordinates: { latitude: number; longitude: number }[];
  center: { latitude: number; longitude: number };
}

const TEXAS_CENTER = { latitude: 31.0, longitude: -99.5 };

export const senatePolygons: DistrictPolygon[] = [
  {
    id: "s-1",
    districtType: "senate",
    districtNumber: 1,
    center: { latitude: 32.8, longitude: -95.3 },
    coordinates: [
      { latitude: 33.4, longitude: -94.0 },
      { latitude: 33.4, longitude: -96.0 },
      { latitude: 32.2, longitude: -96.0 },
      { latitude: 32.2, longitude: -94.0 },
    ],
  },
  {
    id: "s-2",
    districtType: "senate",
    districtNumber: 2,
    center: { latitude: 32.9, longitude: -96.3 },
    coordinates: [
      { latitude: 33.5, longitude: -96.0 },
      { latitude: 33.5, longitude: -97.0 },
      { latitude: 32.3, longitude: -97.0 },
      { latitude: 32.3, longitude: -96.0 },
    ],
  },
  {
    id: "s-3",
    districtType: "senate",
    districtNumber: 3,
    center: { latitude: 31.5, longitude: -94.5 },
    coordinates: [
      { latitude: 32.2, longitude: -93.8 },
      { latitude: 32.2, longitude: -95.2 },
      { latitude: 30.8, longitude: -95.2 },
      { latitude: 30.8, longitude: -93.8 },
    ],
  },
  {
    id: "s-4",
    districtType: "senate",
    districtNumber: 4,
    center: { latitude: 30.2, longitude: -95.0 },
    coordinates: [
      { latitude: 30.8, longitude: -94.3 },
      { latitude: 30.8, longitude: -95.7 },
      { latitude: 29.6, longitude: -95.7 },
      { latitude: 29.6, longitude: -94.3 },
    ],
  },
  {
    id: "s-5",
    districtType: "senate",
    districtNumber: 5,
    center: { latitude: 30.8, longitude: -97.0 },
    coordinates: [
      { latitude: 31.5, longitude: -96.3 },
      { latitude: 31.5, longitude: -97.7 },
      { latitude: 30.1, longitude: -97.7 },
      { latitude: 30.1, longitude: -96.3 },
    ],
  },
  {
    id: "s-6",
    districtType: "senate",
    districtNumber: 6,
    center: { latitude: 29.76, longitude: -95.36 },
    coordinates: [
      { latitude: 30.0, longitude: -95.0 },
      { latitude: 30.0, longitude: -95.7 },
      { latitude: 29.5, longitude: -95.7 },
      { latitude: 29.5, longitude: -95.0 },
    ],
  },
  {
    id: "s-7",
    districtType: "senate",
    districtNumber: 7,
    center: { latitude: 29.9, longitude: -95.5 },
    coordinates: [
      { latitude: 30.2, longitude: -95.1 },
      { latitude: 30.2, longitude: -96.0 },
      { latitude: 29.6, longitude: -96.0 },
      { latitude: 29.6, longitude: -95.1 },
    ],
  },
  {
    id: "s-8",
    districtType: "senate",
    districtNumber: 8,
    center: { latitude: 33.0, longitude: -96.7 },
    coordinates: [
      { latitude: 33.3, longitude: -96.3 },
      { latitude: 33.3, longitude: -97.1 },
      { latitude: 32.7, longitude: -97.1 },
      { latitude: 32.7, longitude: -96.3 },
    ],
  },
];

export const housePolygons: DistrictPolygon[] = [
  {
    id: "h-1",
    districtType: "house",
    districtNumber: 1,
    center: { latitude: 33.4, longitude: -94.3 },
    coordinates: [
      { latitude: 33.8, longitude: -93.8 },
      { latitude: 33.8, longitude: -94.8 },
      { latitude: 33.0, longitude: -94.8 },
      { latitude: 33.0, longitude: -93.8 },
    ],
  },
  {
    id: "h-2",
    districtType: "house",
    districtNumber: 2,
    center: { latitude: 32.6, longitude: -95.8 },
    coordinates: [
      { latitude: 33.0, longitude: -95.4 },
      { latitude: 33.0, longitude: -96.2 },
      { latitude: 32.2, longitude: -96.2 },
      { latitude: 32.2, longitude: -95.4 },
    ],
  },
  {
    id: "h-3",
    districtType: "house",
    districtNumber: 3,
    center: { latitude: 30.3, longitude: -95.9 },
    coordinates: [
      { latitude: 30.6, longitude: -95.5 },
      { latitude: 30.6, longitude: -96.3 },
      { latitude: 30.0, longitude: -96.3 },
      { latitude: 30.0, longitude: -95.5 },
    ],
  },
  {
    id: "h-4",
    districtType: "house",
    districtNumber: 4,
    center: { latitude: 32.5, longitude: -96.7 },
    coordinates: [
      { latitude: 32.8, longitude: -96.4 },
      { latitude: 32.8, longitude: -97.0 },
      { latitude: 32.2, longitude: -97.0 },
      { latitude: 32.2, longitude: -96.4 },
    ],
  },
  {
    id: "h-5",
    districtType: "house",
    districtNumber: 5,
    center: { latitude: 32.4, longitude: -95.2 },
    coordinates: [
      { latitude: 32.7, longitude: -94.9 },
      { latitude: 32.7, longitude: -95.5 },
      { latitude: 32.1, longitude: -95.5 },
      { latitude: 32.1, longitude: -94.9 },
    ],
  },
  {
    id: "h-6",
    districtType: "house",
    districtNumber: 6,
    center: { latitude: 32.3, longitude: -95.0 },
    coordinates: [
      { latitude: 32.6, longitude: -94.7 },
      { latitude: 32.6, longitude: -95.3 },
      { latitude: 32.0, longitude: -95.3 },
      { latitude: 32.0, longitude: -94.7 },
    ],
  },
  {
    id: "h-7",
    districtType: "house",
    districtNumber: 7,
    center: { latitude: 32.5, longitude: -94.2 },
    coordinates: [
      { latitude: 32.8, longitude: -93.9 },
      { latitude: 32.8, longitude: -94.5 },
      { latitude: 32.2, longitude: -94.5 },
      { latitude: 32.2, longitude: -93.9 },
    ],
  },
  {
    id: "h-8",
    districtType: "house",
    districtNumber: 8,
    center: { latitude: 31.5, longitude: -96.5 },
    coordinates: [
      { latitude: 31.8, longitude: -96.2 },
      { latitude: 31.8, longitude: -96.8 },
      { latitude: 31.2, longitude: -96.8 },
      { latitude: 31.2, longitude: -96.2 },
    ],
  },
];

export const congressPolygons: DistrictPolygon[] = [
  {
    id: "c-1",
    districtType: "congress",
    districtNumber: 1,
    center: { latitude: 32.3, longitude: -95.0 },
    coordinates: [
      { latitude: 33.5, longitude: -93.8 },
      { latitude: 33.5, longitude: -96.2 },
      { latitude: 31.1, longitude: -96.2 },
      { latitude: 31.1, longitude: -93.8 },
    ],
  },
  {
    id: "c-2",
    districtType: "congress",
    districtNumber: 2,
    center: { latitude: 29.95, longitude: -95.4 },
    coordinates: [
      { latitude: 30.4, longitude: -94.8 },
      { latitude: 30.4, longitude: -96.0 },
      { latitude: 29.5, longitude: -96.0 },
      { latitude: 29.5, longitude: -94.8 },
    ],
  },
  {
    id: "c-3",
    districtType: "congress",
    districtNumber: 3,
    center: { latitude: 33.0, longitude: -96.7 },
    coordinates: [
      { latitude: 33.3, longitude: -96.4 },
      { latitude: 33.3, longitude: -97.0 },
      { latitude: 32.7, longitude: -97.0 },
      { latitude: 32.7, longitude: -96.4 },
    ],
  },
  {
    id: "c-4",
    districtType: "congress",
    districtNumber: 4,
    center: { latitude: 33.5, longitude: -96.0 },
    coordinates: [
      { latitude: 33.9, longitude: -95.3 },
      { latitude: 33.9, longitude: -96.7 },
      { latitude: 33.1, longitude: -96.7 },
      { latitude: 33.1, longitude: -95.3 },
    ],
  },
  {
    id: "c-5",
    districtType: "congress",
    districtNumber: 5,
    center: { latitude: 32.7, longitude: -96.5 },
    coordinates: [
      { latitude: 33.0, longitude: -96.2 },
      { latitude: 33.0, longitude: -96.8 },
      { latitude: 32.4, longitude: -96.8 },
      { latitude: 32.4, longitude: -96.2 },
    ],
  },
  {
    id: "c-6",
    districtType: "congress",
    districtNumber: 6,
    center: { latitude: 32.5, longitude: -97.2 },
    coordinates: [
      { latitude: 32.9, longitude: -96.8 },
      { latitude: 32.9, longitude: -97.6 },
      { latitude: 32.1, longitude: -97.6 },
      { latitude: 32.1, longitude: -96.8 },
    ],
  },
  {
    id: "c-7",
    districtType: "congress",
    districtNumber: 7,
    center: { latitude: 29.8, longitude: -95.5 },
    coordinates: [
      { latitude: 30.1, longitude: -95.2 },
      { latitude: 30.1, longitude: -95.8 },
      { latitude: 29.5, longitude: -95.8 },
      { latitude: 29.5, longitude: -95.2 },
    ],
  },
  {
    id: "c-8",
    districtType: "congress",
    districtNumber: 8,
    center: { latitude: 30.5, longitude: -95.6 },
    coordinates: [
      { latitude: 31.1, longitude: -94.8 },
      { latitude: 31.1, longitude: -96.4 },
      { latitude: 29.9, longitude: -96.4 },
      { latitude: 29.9, longitude: -94.8 },
    ],
  },
];

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
