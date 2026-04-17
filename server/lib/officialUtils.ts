import {
  officialPublic,
  officialPrivate,
  DISTRICT_RANGES,
  type MergedOfficial,
  type OfficialPublic,
  type OfficialPrivate,
} from "@shared/schema";

export type SourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE" | "OTHER_TX";
export type DistrictSourceType = "TX_HOUSE" | "TX_SENATE" | "US_HOUSE";
export type DistrictType = "tx_house" | "tx_senate" | "us_congress";

export function sourceFromDistrictType(dt: DistrictType): DistrictSourceType {
  switch (dt) {
    case "tx_house": return "TX_HOUSE";
    case "tx_senate": return "TX_SENATE";
    case "us_congress": return "US_HOUSE";
  }
}

export function mergeOfficial(pub: OfficialPublic, priv: OfficialPrivate | null): MergedOfficial {
  const merged: MergedOfficial = { ...pub };
  if (priv) {
    merged.private = {
      personalPhone: priv.personalPhone,
      personalAddress: priv.personalAddress,
      spouseName: priv.spouseName,
      childrenNames: priv.childrenNames,
      birthday: priv.birthday,
      anniversary: priv.anniversary,
      notes: priv.notes,
      tags: priv.tags,
      updatedAt: priv.updatedAt,
      addressSource: priv.addressSource,
    };
  }
  return merged;
}

export function createVacantOfficial(source: DistrictSourceType, district: number): MergedOfficial {
  const chamber =
    source === "TX_HOUSE" ? "TX House" : source === "TX_SENATE" ? "TX Senate" : "US House";
  const vacantId = `VACANT-${source}-${district}`;
  return {
    id: vacantId,
    personId: null,
    source,
    sourceMemberId: vacantId,
    chamber,
    district: String(district),
    fullName: "Vacant District",
    roleTitle: null,
    party: null,
    photoUrl: null,
    capitolAddress: null,
    capitolPhone: null,
    capitolRoom: null,
    districtAddresses: null,
    districtPhones: null,
    website: null,
    email: null,
    active: true,
    lastRefreshedAt: new Date(),
    searchZips: null,
    searchCities: null,
    isVacant: true,
    private: null,
  };
}

export function fillVacancies(
  officials: MergedOfficial[],
  source: DistrictSourceType
): MergedOfficial[] {
  const range = DISTRICT_RANGES[source];
  const districtMap = new Map<string, MergedOfficial>();
  for (const official of officials) {
    districtMap.set(official.district, { ...official, isVacant: false });
  }
  const result: MergedOfficial[] = [];
  for (let d = range.min; d <= range.max; d++) {
    const districtStr = String(d);
    result.push(districtMap.has(districtStr) ? districtMap.get(districtStr)! : createVacantOfficial(source, d));
  }
  return result;
}
