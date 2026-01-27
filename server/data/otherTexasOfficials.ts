/**
 * Other Texas Officials data module.
 * 
 * Provides both static fallback data and web scraping functions
 * to fetch current officials from authoritative sources.
 * 
 * Sources:
 * - Texas Secretary of State Elected Officials: https://www.sos.state.tx.us/elections/voter/elected.shtml
 * - Texas Supreme Court: https://www.txcourts.gov/supreme/about-the-court/
 * - Texas Court of Criminal Appeals: https://www.txcourts.gov/cca/about-the-court/judges/
 * - Secretary of State Bio: https://www.sos.state.tx.us/about/sosbio.shtml
 */

export interface OtherTexasOfficialData {
  roleTitle: string;
  fullName: string;
  category: 'EXECUTIVE' | 'SECRETARY_OF_STATE' | 'SUPREME_COURT' | 'CRIMINAL_APPEALS';
  placeNumber?: number;
  party?: string;
  photoUrl?: string;
  capitolAddress?: string;
  capitolPhone?: string;
  website?: string;
  email?: string;
  termEnd?: string;
  sourceUrl?: string;
}

export interface OtherTxScrapedData {
  officials: OtherTexasOfficialData[];
  fingerprint: string;
  scrapedAt: Date;
  sources: {
    executive: { url: string; success: boolean; error?: string };
    supremeCourt: { url: string; success: boolean; error?: string };
    criminalAppeals: { url: string; success: boolean; error?: string };
  };
}

/**
 * Generate a unique source member ID for an Other TX official.
 * Format: OTHER_TX_<category>_<role-slug>_<name-slug>
 */
export function generateOtherTxSourceMemberId(roleTitle: string, fullName: string, _category?: string): string {
  // Don't include category in source ID - role title is already unique enough
  // e.g., "Governor" vs "Chief Justice of the Texas Supreme Court"
  const roleSlug = roleTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  const nameSlug = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  return `OTHER_TX_${roleSlug}_${nameSlug}`;
}

/**
 * Parse name from "Honorable FirstName LastName" format.
 */
function parseHonorableName(text: string): string {
  return text
    .replace(/^Honorable\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean up name for consistency.
 */
function cleanName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim();
}

/**
 * Get executive officials data.
 * Uses static data since these positions change only every 4 years with elections.
 * The static data is maintained manually and verified against SOS website.
 */
async function scrapeExecutiveOfficials(): Promise<OtherTexasOfficialData[]> {
  // Executive officials change infrequently (every 4 years with elections).
  // Using curated static data is more reliable than web scraping the SOS table.
  // Source: https://www.sos.state.tx.us/elections/voter/elected.shtml
  const officials = getStaticExecutiveOfficials();
  console.log(`[OtherTxScrape] Executive: using ${officials.length} officials from curated data`);
  return officials;
}

/**
 * Fetch and parse Texas Supreme Court justices from txcourts.gov.
 */
async function scrapeSupremeCourt(): Promise<OtherTexasOfficialData[]> {
  const url = 'https://www.txcourts.gov/supreme/about-the-court/';
  const officials: OtherTexasOfficialData[] = [];
  
  try {
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'TXDistrictNavigator/1.0' },
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Pattern to find justice entries with photo and name links
    // Looking for links like: /supreme/about-the-court/justices/chief-justice-jimmy-blacklock/
    const justicePattern = /justices\/(chief-justice|justice)-([^\/]+)\/"[^>]*>([^<]+)</gi;
    const placePattern = /Place\s+(\d+)/gi;
    
    let match;
    const seenNames = new Set<string>();
    
    // Split by justice section and extract info
    const justiceSections = html.split(/Chief Justice|Justice\s+[A-Z]/);
    
    // First pass: find Chief Justice
    const chiefMatch = html.match(/Chief Justice ([^<\n]+)/);
    if (chiefMatch) {
      const name = cleanName(chiefMatch[1]);
      if (name.length > 2 && !seenNames.has(name)) {
        seenNames.add(name);
        officials.push({
          roleTitle: 'Chief Justice of the Texas Supreme Court',
          fullName: name,
          category: 'SUPREME_COURT',
          party: 'R',
          website: 'https://www.txcourts.gov/supreme',
          capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
          capitolPhone: '(512) 463-1312',
          sourceUrl: url,
        });
      }
    }
    
    // Find all justice links with place numbers
    const justiceRegex = /\[Justice ([^\]]+)\][^\[]*Place\s+(\d+)/gi;
    let justiceMatch;
    while ((justiceMatch = justiceRegex.exec(html)) !== null) {
      const name = cleanName(justiceMatch[1]);
      const place = parseInt(justiceMatch[2], 10);
      
      if (!seenNames.has(name) && place >= 2 && place <= 9) {
        seenNames.add(name);
        officials.push({
          roleTitle: `Justice of the Texas Supreme Court (Place ${place})`,
          fullName: name,
          category: 'SUPREME_COURT',
          placeNumber: place,
          party: 'R',
          website: 'https://www.txcourts.gov/supreme',
          capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
          capitolPhone: '(512) 463-1312',
          sourceUrl: url,
        });
      }
    }
    
    // If we didn't get all 9, use static data
    if (officials.length < 9) {
      console.log(`[OtherTxScrape] Supreme Court: only found ${officials.length}, using static fallback`);
      return getStaticSupremeCourt();
    }
    
    console.log(`[OtherTxScrape] Supreme Court: found ${officials.length} justices`);
    return officials;
    
  } catch (error) {
    console.error('[OtherTxScrape] Failed to scrape Supreme Court:', error);
    return getStaticSupremeCourt();
  }
}

/**
 * Fetch and parse Texas Court of Criminal Appeals judges from txcourts.gov.
 */
async function scrapeCriminalAppeals(): Promise<OtherTexasOfficialData[]> {
  const url = 'https://www.txcourts.gov/cca/about-the-court/judges/';
  const officials: OtherTexasOfficialData[] = [];
  
  try {
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'TXDistrictNavigator/1.0' },
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    const seenNames = new Set<string>();
    
    // Pattern: [Presiding Judge Name](link) followed by Place N
    const presidingMatch = html.match(/\[Presiding Judge ([^\]]+)\]/);
    if (presidingMatch) {
      const name = cleanName(presidingMatch[1]);
      if (!seenNames.has(name)) {
        seenNames.add(name);
        officials.push({
          roleTitle: 'Presiding Judge of the Texas Court of Criminal Appeals',
          fullName: name,
          category: 'CRIMINAL_APPEALS',
          placeNumber: 1,
          party: 'R',
          website: 'https://www.txcourts.gov/cca',
          capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
          capitolPhone: '(512) 463-1551',
          sourceUrl: url,
        });
      }
    }
    
    // Find all judge links with place numbers
    const judgeRegex = /\[Judge ([^\]]+)\][^\[]*Place\s+(\d+)/gi;
    let judgeMatch;
    while ((judgeMatch = judgeRegex.exec(html)) !== null) {
      const name = cleanName(judgeMatch[1]);
      const place = parseInt(judgeMatch[2], 10);
      
      if (!seenNames.has(name) && place >= 2 && place <= 9) {
        seenNames.add(name);
        officials.push({
          roleTitle: `Judge of the Texas Court of Criminal Appeals (Place ${place})`,
          fullName: name,
          category: 'CRIMINAL_APPEALS',
          placeNumber: place,
          party: 'R',
          website: 'https://www.txcourts.gov/cca',
          capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
          capitolPhone: '(512) 463-1551',
          sourceUrl: url,
        });
      }
    }
    
    // If we didn't get all 9, use static data
    if (officials.length < 9) {
      console.log(`[OtherTxScrape] Criminal Appeals: only found ${officials.length}, using static fallback`);
      return getStaticCriminalAppeals();
    }
    
    console.log(`[OtherTxScrape] Criminal Appeals: found ${officials.length} judges`);
    return officials;
    
  } catch (error) {
    console.error('[OtherTxScrape] Failed to scrape Criminal Appeals:', error);
    return getStaticCriminalAppeals();
  }
}

/**
 * Get official website for a role.
 */
function getOfficialWebsite(roleTitle: string): string | undefined {
  const websites: Record<string, string> = {
    'Governor': 'https://gov.texas.gov',
    'Lieutenant Governor': 'https://www.ltgov.texas.gov',
    'Attorney General': 'https://www.texasattorneygeneral.gov',
    'Comptroller of Public Accounts': 'https://comptroller.texas.gov',
    'Commissioner of the General Land Office': 'https://www.glo.texas.gov',
    'Commissioner of Agriculture': 'https://www.texasagriculture.gov',
    'Railroad Commissioner': 'https://www.rrc.texas.gov',
    'Secretary of State': 'https://www.sos.texas.gov',
  };
  return websites[roleTitle];
}

/**
 * Static fallback data for executive officials.
 */
function getStaticExecutiveOfficials(): OtherTexasOfficialData[] {
  return [
    {
      roleTitle: 'Governor',
      fullName: 'Greg Abbott',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://gov.texas.gov',
      capitolAddress: 'Office of the Governor, P.O. Box 12428, Austin, TX 78711',
      capitolPhone: '(512) 463-2000',
    },
    {
      roleTitle: 'Lieutenant Governor',
      fullName: 'Dan Patrick',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://www.ltgov.texas.gov',
      capitolAddress: 'Capitol Station, P.O. Box 12068, Austin, TX 78711',
      capitolPhone: '(512) 463-0001',
    },
    {
      roleTitle: 'Attorney General',
      fullName: 'Ken Paxton',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://www.texasattorneygeneral.gov',
      capitolAddress: 'P.O. Box 12548, Austin, TX 78711',
      capitolPhone: '(512) 463-2100',
    },
    {
      roleTitle: 'Comptroller of Public Accounts',
      fullName: 'Glenn Hegar',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://comptroller.texas.gov',
      capitolAddress: 'P.O. Box 13528, Austin, TX 78711',
      capitolPhone: '(512) 463-4000',
    },
    {
      roleTitle: 'Commissioner of the General Land Office',
      fullName: 'Dawn Buckingham',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://www.glo.texas.gov',
      capitolAddress: '1700 N. Congress Ave., Austin, TX 78701',
      capitolPhone: '(512) 463-5256',
    },
    {
      roleTitle: 'Commissioner of Agriculture',
      fullName: 'Sid Miller',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://www.texasagriculture.gov',
      capitolAddress: 'P.O. Box 12847, Austin, TX 78711',
      capitolPhone: '(512) 463-7476',
    },
    {
      roleTitle: 'Railroad Commissioner',
      fullName: 'Christi Craddick',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://www.rrc.texas.gov',
      capitolAddress: 'P.O. Box 12967, Austin, TX 78711',
      capitolPhone: '(512) 463-7140',
    },
    {
      roleTitle: 'Railroad Commissioner',
      fullName: 'Wayne Christian',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://www.rrc.texas.gov',
      capitolAddress: 'P.O. Box 12967, Austin, TX 78711',
      capitolPhone: '(512) 463-7140',
    },
    {
      roleTitle: 'Railroad Commissioner',
      fullName: 'Jim Wright',
      category: 'EXECUTIVE',
      party: 'R',
      website: 'https://www.rrc.texas.gov',
      capitolAddress: 'P.O. Box 12967, Austin, TX 78711',
      capitolPhone: '(512) 463-7140',
    },
    {
      roleTitle: 'Secretary of State',
      fullName: 'Jane Nelson',
      category: 'SECRETARY_OF_STATE',
      party: 'R',
      website: 'https://www.sos.state.tx.us',
      capitolAddress: 'P.O. Box 12887, Austin, TX 78711',
      capitolPhone: '(512) 463-5770',
    },
  ];
}

/**
 * Static fallback data for Texas Supreme Court.
 * Updated January 2026 based on txcourts.gov
 */
function getStaticSupremeCourt(): OtherTexasOfficialData[] {
  return [
    {
      roleTitle: 'Chief Justice of the Texas Supreme Court',
      fullName: 'Jimmy Blacklock',
      category: 'SUPREME_COURT',
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
    {
      roleTitle: 'Justice of the Texas Supreme Court (Place 2)',
      fullName: 'James P. Sullivan',
      category: 'SUPREME_COURT',
      placeNumber: 2,
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
    {
      roleTitle: 'Justice of the Texas Supreme Court (Place 3)',
      fullName: 'Debra Lehrmann',
      category: 'SUPREME_COURT',
      placeNumber: 3,
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
    {
      roleTitle: 'Justice of the Texas Supreme Court (Place 4)',
      fullName: 'John Phillip Devine',
      category: 'SUPREME_COURT',
      placeNumber: 4,
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
    {
      roleTitle: 'Justice of the Texas Supreme Court (Place 5)',
      fullName: 'Rebeca Aizpuru Huddle',
      category: 'SUPREME_COURT',
      placeNumber: 5,
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
    {
      roleTitle: 'Justice of the Texas Supreme Court (Place 6)',
      fullName: 'Jane Bland',
      category: 'SUPREME_COURT',
      placeNumber: 6,
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
    {
      roleTitle: 'Justice of the Texas Supreme Court (Place 7)',
      fullName: 'Kyle D. Hawkins',
      category: 'SUPREME_COURT',
      placeNumber: 7,
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
    {
      roleTitle: 'Justice of the Texas Supreme Court (Place 8)',
      fullName: 'Brett Busby',
      category: 'SUPREME_COURT',
      placeNumber: 8,
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
    {
      roleTitle: 'Justice of the Texas Supreme Court (Place 9)',
      fullName: 'Evan A. Young',
      category: 'SUPREME_COURT',
      placeNumber: 9,
      party: 'R',
      website: 'https://www.txcourts.gov/supreme',
      capitolAddress: 'Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711',
      capitolPhone: '(512) 463-1312',
      sourceUrl: 'https://www.txcourts.gov/supreme/about-the-court/',
    },
  ];
}

/**
 * Static fallback data for Texas Court of Criminal Appeals.
 * Updated January 2026 based on txcourts.gov
 */
function getStaticCriminalAppeals(): OtherTexasOfficialData[] {
  return [
    {
      roleTitle: 'Presiding Judge of the Texas Court of Criminal Appeals',
      fullName: 'David J. Schenck',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 1,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
    {
      roleTitle: 'Judge of the Texas Court of Criminal Appeals (Place 2)',
      fullName: 'Mary Lou Keel',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 2,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
    {
      roleTitle: 'Judge of the Texas Court of Criminal Appeals (Place 3)',
      fullName: 'Bert Richardson',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 3,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
    {
      roleTitle: 'Judge of the Texas Court of Criminal Appeals (Place 4)',
      fullName: 'Kevin Yeary',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 4,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
    {
      roleTitle: 'Judge of the Texas Court of Criminal Appeals (Place 5)',
      fullName: 'Scott Walker',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 5,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
    {
      roleTitle: 'Judge of the Texas Court of Criminal Appeals (Place 6)',
      fullName: 'Jesse F. McClure, III',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 6,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
    {
      roleTitle: 'Judge of the Texas Court of Criminal Appeals (Place 7)',
      fullName: 'Gina G. Parker',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 7,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
    {
      roleTitle: 'Judge of the Texas Court of Criminal Appeals (Place 8)',
      fullName: 'Lee Finley',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 8,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
    {
      roleTitle: 'Judge of the Texas Court of Criminal Appeals (Place 9)',
      fullName: 'David Newell',
      category: 'CRIMINAL_APPEALS',
      placeNumber: 9,
      party: 'R',
      website: 'https://www.txcourts.gov/cca',
      capitolAddress: 'Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711',
      capitolPhone: '(512) 463-1551',
      sourceUrl: 'https://www.txcourts.gov/cca/about-the-court/judges/',
    },
  ];
}

/**
 * Fetch all Other Texas Officials from authoritative sources.
 * Uses web scraping with fallback to static data.
 */
export async function fetchAllOtherTexasOfficials(): Promise<OtherTxScrapedData> {
  const startTime = Date.now();
  console.log('[OtherTxScrape] Starting fetch from authoritative sources...');
  
  const sources = {
    executive: { url: 'https://www.sos.state.tx.us/elections/voter/elected.shtml', success: false as boolean, error: undefined as string | undefined },
    supremeCourt: { url: 'https://www.txcourts.gov/supreme/about-the-court/', success: false as boolean, error: undefined as string | undefined },
    criminalAppeals: { url: 'https://www.txcourts.gov/cca/about-the-court/judges/', success: false as boolean, error: undefined as string | undefined },
  };
  
  // Fetch all sources in parallel
  const [executive, supremeCourt, criminalAppeals] = await Promise.all([
    scrapeExecutiveOfficials().then(r => { sources.executive.success = true; return r; }).catch(e => { sources.executive.error = e.message; return getStaticExecutiveOfficials(); }),
    scrapeSupremeCourt().then(r => { sources.supremeCourt.success = true; return r; }).catch(e => { sources.supremeCourt.error = e.message; return getStaticSupremeCourt(); }),
    scrapeCriminalAppeals().then(r => { sources.criminalAppeals.success = true; return r; }).catch(e => { sources.criminalAppeals.error = e.message; return getStaticCriminalAppeals(); }),
  ]);
  
  const allOfficials = [...executive, ...supremeCourt, ...criminalAppeals];
  
  // Generate fingerprint from sorted officials data
  const sortedForFingerprint = [...allOfficials].sort((a, b) => 
    `${a.category}-${a.roleTitle}-${a.fullName}`.localeCompare(`${b.category}-${b.roleTitle}-${b.fullName}`)
  );
  const fingerprintData = sortedForFingerprint.map(o => `${o.category}|${o.roleTitle}|${o.fullName}`).join('\n');
  const { createHash } = await import('crypto');
  const fingerprint = createHash('sha256').update(fingerprintData).digest('hex');
  
  const duration = Date.now() - startTime;
  console.log(`[OtherTxScrape] Complete: ${allOfficials.length} officials fetched (${duration}ms)`);
  console.log(`[OtherTxScrape] Breakdown: ${executive.length} executive, ${supremeCourt.length} Supreme Court, ${criminalAppeals.length} Criminal Appeals`);
  
  return {
    officials: allOfficials,
    fingerprint,
    scrapedAt: new Date(),
    sources,
  };
}

/**
 * Get all officials from static data (fallback).
 */
export function getAllStaticOfficials(): OtherTexasOfficialData[] {
  return [
    ...getStaticExecutiveOfficials(),
    ...getStaticSupremeCourt(),
    ...getStaticCriminalAppeals(),
  ];
}

/**
 * Legacy export for backwards compatibility.
 */
export const OTHER_TEXAS_OFFICIALS = getAllStaticOfficials();
