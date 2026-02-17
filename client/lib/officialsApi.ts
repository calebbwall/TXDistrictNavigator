import { getApiUrl } from "./query-client";

export type DistrictType = "tx_senate" | "tx_house" | "us_congress";

export interface OfficialPublic {
  id: string;
  source: "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX";
  sourceMemberId: string;
  chamber: string;
  district: string;
  fullName: string;
  roleTitle?: string | null; // For statewide officials (e.g., "Governor", "Chief Justice of the Texas Supreme Court")
  party: string | null;
  photoUrl: string | null;
  capitolAddress: string | null;
  capitolPhone: string | null;
  // Capitol room/office number scraped from TLO (e.g., "E2.406")
  // Format: Building code + room number, parsed from "EXT E2.406" format
  capitolRoom: string | null;
  districtAddresses: string[] | null;
  districtPhones: string[] | null;
  website: string | null;
  email: string | null;
  active: boolean;
  lastRefreshedAt: string;
}

export interface OfficialPrivate {
  personalPhone?: string | null;
  personalAddress?: string | null;
  spouseName?: string | null;
  childrenNames?: string[] | null;
  birthday?: string | null;
  anniversary?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  updatedAt?: string;
  addressSource?: string | null;
}

export interface MergedOfficial extends OfficialPublic {
  private?: OfficialPrivate | null;
  isVacant?: boolean;
}

export interface OfficialsResponse {
  officials: MergedOfficial[];
  count: number;
  vacancyCount?: number;
}

export interface OfficialResponse {
  official: MergedOfficial;
}

export async function fetchOfficials(districtType?: DistrictType, search?: string): Promise<MergedOfficial[]> {
  try {
    const url = new URL("/api/officials", getApiUrl());
    if (districtType) {
      url.searchParams.set("district_type", districtType);
    }
    if (search) {
      url.searchParams.set("search", search);
    }
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch officials: ${response.statusText}`);
    }
    
    const data: OfficialsResponse = await response.json();
    return data.officials;
  } catch (error) {
    console.error("Error fetching officials:", error);
    return [];
  }
}

export async function fetchOfficialById(id: string): Promise<MergedOfficial | null> {
  try {
    const url = new URL(`/api/officials/${id}`, getApiUrl());
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch official: ${response.statusText}`);
    }
    
    const data: OfficialResponse = await response.json();
    return data.official;
  } catch (error) {
    console.error("Error fetching official:", error);
    return null;
  }
}

export async function fetchOfficialByDistrict(
  districtType: DistrictType,
  districtNumber: number
): Promise<MergedOfficial | null> {
  try {
    const url = new URL("/api/officials/by-district", getApiUrl());
    url.searchParams.set("district_type", districtType);
    url.searchParams.set("district_number", String(districtNumber));
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch official: ${response.statusText}`);
    }
    
    const data: OfficialResponse = await response.json();
    return data.official;
  } catch (error) {
    console.error("Error fetching official by district:", error);
    return null;
  }
}

export async function updateOfficialPrivate(
  id: string,
  privateData: Partial<OfficialPrivate>
): Promise<MergedOfficial | null> {
  try {
    const url = new URL(`/api/officials/${id}/private`, getApiUrl());
    const response = await fetch(url.toString(), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(privateData),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update private data: ${response.statusText}`);
    }
    
    const data: OfficialResponse = await response.json();
    return data.official;
  } catch (error) {
    console.error("Error updating private data:", error);
    return null;
  }
}

export function getDistrictTypeFromSource(source: MergedOfficial["source"]): DistrictType {
  switch (source) {
    case "TX_HOUSE": return "tx_house";
    case "TX_SENATE": return "tx_senate";
    case "US_HOUSE": return "us_congress";
    case "OTHER_TX": 
    default:
      return "tx_senate"; // Default fallback for non-district officials
  }
}

export function getDistrictTypeLabel(districtType: DistrictType): string {
  switch (districtType) {
    case "tx_house": return "TX House";
    case "tx_senate": return "TX Senate";
    case "us_congress": return "US Congress";
  }
}

export function getSourceLabel(source: MergedOfficial["source"]): string {
  switch (source) {
    case "TX_HOUSE": return "Texas House";
    case "TX_SENATE": return "Texas Senate";
    case "US_HOUSE": return "US House";
    case "OTHER_TX": return "Texas Statewide";
    default: return "Texas Official";
  }
}

export function getPartyLabel(party: string | null): string {
  switch (party) {
    case "R": return "Republican";
    case "D": return "Democrat";
    case "I": return "Independent";
    default: return "Unknown";
  }
}

export function getPartyColor(party: string | null): string {
  switch (party) {
    case "R": return "#E94B3C";
    case "D": return "#4A90E2";
    default: return "#888888";
  }
}
