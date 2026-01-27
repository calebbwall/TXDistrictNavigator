export type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX";
export type DistrictType = "tx_house" | "tx_senate" | "us_congress";

export interface Official {
  id: string;
  source: SourceType;
  districtNumber: number;
  fullName: string;
  roleTitle?: string | null; // For statewide officials (e.g., "Governor", "Chief Justice")
  party: string | null;
  photoUrl: string | null;
  capitolPhone: string | null;
  capitolAddress: string | null;
  website: string | null;
  email: string | null;
  districtAddresses: string[];
  districtPhones: string[];
  isVacant: boolean;
  officeType: "tx_senate" | "tx_house" | "us_house" | "statewide";
  districtId: string;
  city: string;
  private?: {
    personalPhone?: string | null;
    personalAddress?: string | null;
    spouseName?: string | null;
    childrenNames?: string[] | null;
    birthday?: string | null;
    anniversary?: string | null;
    notes?: string | null;
    tags?: string[] | null;
  };
}

export interface DistrictHit {
  source: SourceType;
  districtNumber: number;
}

const sourceToOfficeType: Record<SourceType, "tx_senate" | "tx_house" | "us_house" | "statewide"> = {
  TX_HOUSE: "tx_house",
  TX_SENATE: "tx_senate",
  US_HOUSE: "us_house",
  OTHER_TX: "statewide",
};

const districtTypeToSource: Record<DistrictType, SourceType> = {
  tx_house: "TX_HOUSE",
  tx_senate: "TX_SENATE",
  us_congress: "US_HOUSE",
};

export function districtTypeToSourceType(districtType: DistrictType): SourceType {
  return districtTypeToSource[districtType];
}

export function sourceTypeToDistrictType(source: SourceType): DistrictType {
  switch (source) {
    case "TX_HOUSE": return "tx_house";
    case "TX_SENATE": return "tx_senate";
    case "US_HOUSE": return "us_congress";
    case "OTHER_TX": 
    default:
      return "tx_senate"; // Default fallback for statewide officials
  }
}

export function getOfficeTypeLabel(officeType: string, roleTitle?: string | null): string {
  switch (officeType) {
    case "tx_senate": return "TX Senate";
    case "tx_house": return "TX House";
    case "us_house": return "US Congress";
    case "statewide": return roleTitle || "Texas Statewide";
    default: return officeType;
  }
}

export function normalizeOfficial(raw: Record<string, unknown>): Official {
  const source = (raw.source as SourceType) || "TX_HOUSE";
  const districtNumber = parseInt(String(raw.district || raw.districtNumber || 0), 10);
  const isVacant = raw.isVacant === true || raw.fullName === undefined || raw.fullName === null;
  
  const officeType = sourceToOfficeType[source] || "tx_house";
  const districtId = `${officeType.replace("tx_", "").replace("us_", "")}-${districtNumber}`;
  
  const fullName = isVacant 
    ? `Vacant District ${districtNumber}` 
    : String(raw.fullName || raw.full_name || "Unknown");
  
  const rawPrivate = raw.private as Record<string, unknown> | undefined;
  
  return {
    id: String(raw.id || `vacant-${source}-${districtNumber}`),
    source,
    districtNumber,
    fullName,
    party: raw.party ? String(raw.party) : null,
    photoUrl: raw.photoUrl ? String(raw.photoUrl) : (raw.photo_url ? String(raw.photo_url) : null),
    capitolPhone: raw.capitolPhone ? String(raw.capitolPhone) : (raw.capitol_phone ? String(raw.capitol_phone) : null),
    capitolAddress: raw.capitolAddress ? String(raw.capitolAddress) : (raw.capitol_address ? String(raw.capitol_address) : null),
    website: raw.website ? String(raw.website) : null,
    email: raw.email ? String(raw.email) : null,
    districtAddresses: Array.isArray(raw.districtAddresses) 
      ? raw.districtAddresses 
      : (Array.isArray(raw.district_addresses) ? raw.district_addresses : []),
    districtPhones: Array.isArray(raw.districtPhones) 
      ? raw.districtPhones 
      : (Array.isArray(raw.district_phones) ? raw.district_phones : []),
    isVacant,
    officeType,
    districtId,
    city: raw.city ? String(raw.city) : "",
    private: rawPrivate ? {
      personalPhone: rawPrivate.personalPhone as string | null,
      personalAddress: rawPrivate.personalAddress as string | null,
      spouseName: rawPrivate.spouseName as string | null,
      childrenNames: rawPrivate.childrenNames as string[] | null,
      birthday: rawPrivate.birthday as string | null,
      anniversary: rawPrivate.anniversary as string | null,
      notes: rawPrivate.notes as string | null,
      tags: rawPrivate.tags as string[] | null,
    } : undefined,
  };
}

export function createVacantOfficial(source: SourceType, districtNumber: number): Official {
  return normalizeOfficial({
    id: `vacant-${source}-${districtNumber}`,
    source,
    district: districtNumber,
    isVacant: true,
  });
}
