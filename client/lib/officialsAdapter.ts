import type { MergedOfficial } from "./officialsApi";
import { normalizeOfficial, type Official, type SourceType, type DistrictType } from "./officials";
import type { Official as MockOfficial } from "./mockData";

export function apiOfficialToNormalized(apiOfficial: MergedOfficial): Official {
  return normalizeOfficial(apiOfficial as unknown as Record<string, unknown>);
}

function parseCityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const match = address.match(/([A-Za-z\s]+),\s*TX\b/i);
  if (match) {
    const city = match[1].trim();
    if (city.length >= 2 && city.length < 50 && !city.match(/^P\.?O\.?\s*Box$/i)) {
      return city;
    }
  }
  return "";
}

function parseRoomFromCapitolAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const roomMatch = address.match(/Room\s*([A-Z0-9]+\.?[A-Z0-9]*)/i);
  if (roomMatch) return roomMatch[1];
  const extMatch = address.match(/Extension\s*([A-Z0-9]+\.?[A-Z0-9]*)/i);
  if (extMatch) return `E${extMatch[1]}`;
  const genericMatch = address.match(/\b([A-Z]\d+\.\d+)\b/);
  if (genericMatch) return genericMatch[1];
  return null;
}

export function apiOfficialsToNormalized(apiOfficials: MergedOfficial[]): Official[] {
  return apiOfficials.map(apiOfficialToNormalized);
}

export function mockOfficialToNormalized(mockOfficial: MockOfficial): Official {
  return normalizeOfficial({
    id: mockOfficial.id,
    source: mockOfficial.officeType === "tx_house" ? "TX_HOUSE" : mockOfficial.officeType === "tx_senate" ? "TX_SENATE" : "US_HOUSE",
    district: mockOfficial.districtId?.split("-")[1] || "1",
    fullName: mockOfficial.fullName,
    party: null,
    photoUrl: mockOfficial.photoUrl,
    capitolPhone: mockOfficial.offices?.[0]?.phone || null,
    capitolAddress: mockOfficial.offices?.[0]?.address || null,
    website: null,
    email: null,
    isVacant: mockOfficial.isVacant || false,
  });
}

export function mockOfficialsToNormalized(mockOfficials: MockOfficial[]): Official[] {
  return mockOfficials.map(mockOfficialToNormalized);
}

export function getDistrictTypeFromApiSource(source: SourceType): DistrictType {
  switch (source) {
    case "TX_HOUSE": return "tx_house";
    case "TX_SENATE": return "tx_senate";
    case "US_HOUSE": return "us_congress";
    case "OTHER_TX":
    default:
      return "tx_senate"; // Default fallback for statewide officials
  }
}

export function getApiSourceFromDistrictType(districtType: DistrictType): SourceType {
  switch (districtType) {
    case "tx_house": return "TX_HOUSE";
    case "tx_senate": return "TX_SENATE";
    case "us_congress": return "US_HOUSE";
  }
}

export function apiOfficialToLegacy(apiOfficial: MergedOfficial): MockOfficial {
  const officeType = apiOfficial.source === "TX_HOUSE" 
    ? "tx_house" 
    : apiOfficial.source === "TX_SENATE" 
      ? "tx_senate" 
      : apiOfficial.source === "OTHER_TX"
        ? "statewide"
        : "us_house";

  const districtPrefix = officeType === "tx_senate" ? "s" : officeType === "tx_house" ? "h" : officeType === "statewide" ? "sw" : "c";
  const districtId = `${districtPrefix}-${apiOfficial.district}`;

  const offices = [];
  
  const capitolRoom = apiOfficial.capitolRoom || parseRoomFromCapitolAddress(apiOfficial.capitolAddress);
  
  if (apiOfficial.capitolAddress || apiOfficial.capitolPhone) {
    offices.push({
      id: `o-${apiOfficial.id}-capitol`,
      officeKind: "capitol" as const,
      address: apiOfficial.capitolAddress || "Capitol Office",
      phone: apiOfficial.capitolPhone || "",
      room: capitolRoom || undefined,
    });
  }

  if (apiOfficial.districtAddresses?.length || apiOfficial.districtPhones?.length) {
    offices.push({
      id: `o-${apiOfficial.id}-district`,
      officeKind: "district" as const,
      address: apiOfficial.districtAddresses?.[0] || "District Office",
      phone: apiOfficial.districtPhones?.[0] || "",
    });
  }

  if (offices.length === 0) {
    offices.push({
      id: `o-${apiOfficial.id}-default`,
      officeKind: "capitol" as const,
      address: apiOfficial.source === "US_HOUSE" ? "Washington, DC 20515" : "Austin, TX",
      phone: "",
    });
  }

  const districtCity = parseCityFromAddress(apiOfficial.districtAddresses?.[0]);

  return {
    id: apiOfficial.id,
    fullName: apiOfficial.fullName,
    officeType,
    districtId,
    photoUrl: apiOfficial.photoUrl,
    city: districtCity,
    party: getPartyLabel(apiOfficial.party),
    offices,
    staff: [],
    isVacant: apiOfficial.isVacant || false,
    source: apiOfficial.source,
    districtNumber: parseInt(String(apiOfficial.district || "0"), 10),
    roleTitle: apiOfficial.roleTitle || undefined,
    privateNotes: apiOfficial.private ? {
      personalPhone: apiOfficial.private.personalPhone || undefined,
      personalAddress: apiOfficial.private.personalAddress || undefined,
      spouse: apiOfficial.private.spouseName || undefined,
      children: apiOfficial.private.childrenNames?.join(", ") || undefined,
      birthday: apiOfficial.private.birthday || undefined,
      anniversary: apiOfficial.private.anniversary || undefined,
      notes: apiOfficial.private.notes || undefined,
    } : undefined,
  };
}

function getPartyLabel(party: string | null): string {
  switch (party) {
    case "R": return "Republican";
    case "D": return "Democrat";
    case "I": return "Independent";
    default: return "Public Servant";
  }
}
