import type { Official } from "./officials";

export interface SearchableOfficial extends Official {
  searchKey: string;
  normalizedName: string;
  normalizedFirstLast: string;
  normalizedLastFirst: string;
  lastName: string;
}

export interface ScoredResult {
  official: SearchableOfficial;
  score: number;
}

const SUFFIX_TOKENS = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const TITLE_TOKENS = new Set(["dr", "hon", "mr", "mrs", "ms", "rep", "sen"]);

function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[.,'\-()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeCommonTokens(tokens: string[]): string[] {
  return tokens.filter(t => !SUFFIX_TOKENS.has(t) && !TITLE_TOKENS.has(t));
}

function extractLastName(fullName: string): string {
  const normalized = normalizeText(fullName);
  const tokens = normalized.split(" ");
  const cleaned = removeCommonTokens(tokens);
  return cleaned[cleaned.length - 1] || "";
}

function extractFirstName(fullName: string): string {
  const normalized = normalizeText(fullName);
  const tokens = normalized.split(" ");
  const cleaned = removeCommonTokens(tokens);
  return cleaned[0] || "";
}

export function buildSearchableOfficial(official: Official): SearchableOfficial {
  const normalizedName = normalizeText(official.fullName);
  const tokens = normalizedName.split(" ");
  const cleanedTokens = removeCommonTokens(tokens);
  
  const firstName = cleanedTokens[0] || "";
  const lastName = cleanedTokens[cleanedTokens.length - 1] || "";
  
  const normalizedFirstLast = cleanedTokens.join(" ");
  const normalizedLastFirst = lastName + " " + cleanedTokens.slice(0, -1).join(" ");
  
  const chamberLabel = official.source === "TX_HOUSE" ? "tx house" 
    : official.source === "TX_SENATE" ? "tx senate" 
    : official.source === "US_HOUSE" ? "us house congress"
    : "";
  
  const partyLabel = official.party?.toLowerCase() || "";
  const districtLabel = `district ${official.districtNumber} ${official.districtNumber}`;
  
  const searchKey = [
    normalizedName,
    normalizedFirstLast,
    normalizedLastFirst,
    chamberLabel,
    partyLabel,
    districtLabel,
  ].join(" ");
  
  return {
    ...official,
    searchKey,
    normalizedName,
    normalizedFirstLast,
    normalizedLastFirst,
    lastName,
  };
}

export function buildSearchIndex(officials: Official[]): SearchableOfficial[] {
  return officials.map(buildSearchableOfficial);
}

function scoreCandidate(candidate: SearchableOfficial, queryTokens: string[], normalizedQuery: string): number {
  let score = 0;
  
  if (candidate.normalizedFirstLast.startsWith(normalizedQuery)) {
    score += 100;
  } else if (candidate.normalizedName.startsWith(normalizedQuery)) {
    score += 95;
  } else if (candidate.normalizedLastFirst.startsWith(normalizedQuery)) {
    score += 90;
  }
  
  const nameTokens = candidate.normalizedFirstLast.split(" ");
  for (const queryToken of queryTokens) {
    let tokenMatched = false;
    
    for (const nameToken of nameTokens) {
      if (nameToken.startsWith(queryToken)) {
        score += 70;
        tokenMatched = true;
        break;
      }
    }
    
    if (!tokenMatched && candidate.searchKey.includes(queryToken)) {
      score += 40;
      tokenMatched = true;
    }
    
    if (tokenMatched) {
      score += 25;
    }
  }
  
  if (candidate.searchKey.includes(normalizedQuery)) {
    score += 30;
  }
  
  const allTokensPresent = queryTokens.every(qt => 
    candidate.searchKey.includes(qt)
  );
  if (!allTokensPresent) {
    return 0;
  }
  
  return score;
}

export function searchOfficials(
  searchIndex: SearchableOfficial[],
  query: string,
  maxResults: number = 20
): ScoredResult[] {
  const normalizedQuery = normalizeText(query);
  
  if (!normalizedQuery) {
    return [];
  }
  
  const queryTokens = normalizedQuery.split(" ").filter(t => t.length > 0);
  
  if (queryTokens.length === 0) {
    return [];
  }
  
  const scored: ScoredResult[] = [];
  
  for (const candidate of searchIndex) {
    const score = scoreCandidate(candidate, queryTokens, normalizedQuery);
    
    if (score > 0) {
      scored.push({ official: candidate, score });
    }
  }
  
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.official.lastName.localeCompare(b.official.lastName);
  });
  
  return scored.slice(0, maxResults);
}

export function isNameSearch(query: string): boolean {
  const normalized = normalizeText(query);
  const startsWithDigit = /^\d/.test(normalized);
  const isZipCode = /^\d{5}$/.test(normalized);
  
  if (startsWithDigit || isZipCode) {
    return false;
  }
  
  const cityIndicators = ["tx", "texas"];
  const tokens = normalized.split(" ");
  if (tokens.some(t => cityIndicators.includes(t))) {
    return false;
  }
  
  return true;
}
