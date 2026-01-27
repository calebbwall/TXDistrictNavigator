import type { MergedOfficial } from "@shared/schema";

export type OfficialBranch = "executive" | "commission" | "judiciary";
export type OfficialGroup = "Statewide Executive" | "Boards & Commissions" | "Statewide Judiciary";
export type OfficialSubgroup = 
  | "Executive Officers"
  | "Railroad Commission" 
  | "Texas Supreme Court" 
  | "Texas Court of Criminal Appeals";

export type RoleModifier = 
  | "Governor" 
  | "Lieutenant Governor" 
  | "Chief Justice" 
  | "Presiding Judge" 
  | null;

export interface NormalizedOfficial extends MergedOfficial {
  branch: OfficialBranch;
  group: OfficialGroup;
  subgroup: OfficialSubgroup;
  placeNumber: number | null;
  roleModifier: RoleModifier;
  sortPriority: number;
}

export interface OfficialSection {
  key: string;
  title: string;
  description: string;
  data: NormalizedOfficial[];
}

const EXECUTIVE_PRIORITY: Record<string, number> = {
  "Governor": 1,
  "Lieutenant Governor": 2,
  "Attorney General": 3,
  "Comptroller of Public Accounts": 4,
  "Commissioner of the General Land Office": 5,
  "Commissioner of Agriculture": 6,
  "Secretary of State": 7,
};

function detectRoleModifier(roleTitle: string): RoleModifier {
  if (roleTitle === "Governor") return "Governor";
  if (roleTitle === "Lieutenant Governor") return "Lieutenant Governor";
  if (roleTitle.includes("Chief Justice")) return "Chief Justice";
  if (roleTitle.includes("Presiding Judge")) return "Presiding Judge";
  return null;
}

function extractPlaceNumber(roleTitle: string, placeNum?: number): number | null {
  if (placeNum !== undefined && placeNum !== null) return placeNum;
  const match = roleTitle.match(/Place\s+(\d+)/i);
  if (match) return parseInt(match[1], 10);
  if (roleTitle.includes("Chief Justice")) return 1;
  if (roleTitle.includes("Presiding Judge")) return 1;
  return null;
}

function categorizeOfficial(official: MergedOfficial): {
  branch: OfficialBranch;
  group: OfficialGroup;
  subgroup: OfficialSubgroup;
} {
  const role = official.roleTitle || "";
  
  if (role.includes("Railroad Commissioner") || role === "Railroad Commissioner") {
    return {
      branch: "commission",
      group: "Boards & Commissions",
      subgroup: "Railroad Commission",
    };
  }
  
  if (role.includes("Supreme Court") || role.includes("Chief Justice of the Texas Supreme")) {
    return {
      branch: "judiciary",
      group: "Statewide Judiciary",
      subgroup: "Texas Supreme Court",
    };
  }
  
  if (role.includes("Criminal Appeals") || role.includes("Presiding Judge of the Texas Court")) {
    return {
      branch: "judiciary",
      group: "Statewide Judiciary",
      subgroup: "Texas Court of Criminal Appeals",
    };
  }
  
  return {
    branch: "executive",
    group: "Statewide Executive",
    subgroup: "Executive Officers",
  };
}

function calculateSortPriority(
  roleTitle: string,
  roleModifier: RoleModifier,
  placeNumber: number | null,
  subgroup: OfficialSubgroup
): number {
  if (subgroup === "Executive Officers") {
    const basePriority = EXECUTIVE_PRIORITY[roleTitle];
    if (basePriority) return basePriority;
    return 100;
  }
  
  if (subgroup === "Railroad Commission") {
    return placeNumber ?? 99;
  }
  
  if (subgroup === "Texas Supreme Court") {
    if (roleModifier === "Chief Justice") return 0;
    return placeNumber ?? 99;
  }
  
  if (subgroup === "Texas Court of Criminal Appeals") {
    if (roleModifier === "Presiding Judge") return 0;
    return placeNumber ?? 99;
  }
  
  return 999;
}

export function normalizeOfficial(official: MergedOfficial): NormalizedOfficial {
  const { branch, group, subgroup } = categorizeOfficial(official);
  const roleModifier = detectRoleModifier(official.roleTitle || "");
  const districtNum = official.district ? parseInt(official.district, 10) : undefined;
  const placeNumber = extractPlaceNumber(official.roleTitle || "", isNaN(districtNum as number) ? undefined : districtNum);
  const sortPriority = calculateSortPriority(official.roleTitle || "", roleModifier, placeNumber, subgroup);
  
  return {
    ...official,
    branch,
    group,
    subgroup,
    placeNumber,
    roleModifier,
    sortPriority,
  };
}

export function normalizeAndGroupOfficials(officials: MergedOfficial[]): OfficialSection[] {
  const normalized = officials.map(normalizeOfficial);
  
  const seen = new Set<string>();
  const unique = normalized.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  
  const executive: NormalizedOfficial[] = [];
  const railroad: NormalizedOfficial[] = [];
  const supremeCourt: NormalizedOfficial[] = [];
  const criminalAppeals: NormalizedOfficial[] = [];
  
  for (const official of unique) {
    switch (official.subgroup) {
      case "Executive Officers":
        executive.push(official);
        break;
      case "Railroad Commission":
        railroad.push(official);
        break;
      case "Texas Supreme Court":
        supremeCourt.push(official);
        break;
      case "Texas Court of Criminal Appeals":
        criminalAppeals.push(official);
        break;
    }
  }
  
  const sortByPriority = (a: NormalizedOfficial, b: NormalizedOfficial) => {
    if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
    return (a.fullName || "").localeCompare(b.fullName || "");
  };
  
  executive.sort(sortByPriority);
  railroad.sort(sortByPriority);
  supremeCourt.sort(sortByPriority);
  criminalAppeals.sort(sortByPriority);
  
  const sections: OfficialSection[] = [];
  
  if (executive.length > 0) {
    sections.push({
      key: "executive",
      title: "Statewide Executive",
      description: "Elected officials serving in the executive branch of Texas government",
      data: executive,
    });
  }
  
  if (railroad.length > 0) {
    sections.push({
      key: "railroad",
      title: "Boards & Commissions",
      description: "Members of the Texas Railroad Commission",
      data: railroad,
    });
  }
  
  if (supremeCourt.length > 0 || criminalAppeals.length > 0) {
    const judiciaryData: NormalizedOfficial[] = [];
    
    if (supremeCourt.length > 0) {
      judiciaryData.push(...supremeCourt);
    }
    
    if (criminalAppeals.length > 0) {
      judiciaryData.push(...criminalAppeals);
    }
    
    sections.push({
      key: "judiciary",
      title: "Statewide Judiciary",
      description: "Justices and judges of Texas appellate courts",
      data: judiciaryData,
    });
  }
  
  return sections;
}

export function getSubgroupLabel(official: NormalizedOfficial): string | null {
  if (official.subgroup === "Texas Supreme Court") {
    return "Texas Supreme Court";
  }
  if (official.subgroup === "Texas Court of Criminal Appeals") {
    return "Court of Criminal Appeals";
  }
  if (official.subgroup === "Railroad Commission") {
    return "Railroad Commission";
  }
  return null;
}
