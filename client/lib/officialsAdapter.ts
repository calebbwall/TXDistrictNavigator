import type { MergedOfficial } from "./officialsApi";
import type { Official, District, DistrictType } from "./mockData";

export function apiOfficialToLegacy(apiOfficial: MergedOfficial): Official {
  const officeType = apiOfficial.source === "TX_HOUSE" 
    ? "tx_house" 
    : apiOfficial.source === "TX_SENATE" 
      ? "tx_senate" 
      : "us_house";

  const districtPrefix = officeType === "tx_senate" ? "s" : officeType === "tx_house" ? "h" : "c";
  const districtId = `${districtPrefix}-${apiOfficial.district}`;

  const offices = [];
  
  if (apiOfficial.capitolAddress || apiOfficial.capitolPhone) {
    offices.push({
      id: `o-${apiOfficial.id}-capitol`,
      officeKind: "capitol" as const,
      address: apiOfficial.capitolAddress || "Capitol Office",
      phone: apiOfficial.capitolPhone || "",
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

  return {
    id: apiOfficial.id,
    fullName: apiOfficial.fullName,
    officeType,
    districtId,
    photoUrl: apiOfficial.photoUrl,
    city: "Texas",
    occupation: getPartyLabel(apiOfficial.party),
    offices,
    staff: [],
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

export function apiOfficialsToLegacy(apiOfficials: MergedOfficial[]): Official[] {
  return apiOfficials.map(apiOfficialToLegacy);
}

export function apiOfficialToDistrict(apiOfficial: MergedOfficial): District {
  const districtType: DistrictType = apiOfficial.source === "TX_HOUSE" 
    ? "house" 
    : apiOfficial.source === "TX_SENATE" 
      ? "senate" 
      : "congress";
  
  const prefix = districtType === "senate" ? "s" : districtType === "house" ? "h" : "c";
  
  return {
    id: `${prefix}-${apiOfficial.district}`,
    districtType,
    districtNumber: parseInt(apiOfficial.district, 10),
    name: apiOfficial.fullName,
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

export function getDistrictTypeFromApiSource(source: MergedOfficial["source"]): DistrictType {
  switch (source) {
    case "TX_HOUSE": return "house";
    case "TX_SENATE": return "senate";
    case "US_HOUSE": return "congress";
  }
}
