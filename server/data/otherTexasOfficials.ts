/**
 * Static data for Other Texas Officials (statewide offices).
 * 
 * These positions are manually maintained since they don't have
 * a consistent API source and change infrequently (elections every 4 years).
 * 
 * Last updated: January 2026
 * 
 * Sources:
 * - Texas Governor: https://gov.texas.gov
 * - Texas Secretary of State: https://www.sos.texas.gov
 * - Texas Comptroller: https://comptroller.texas.gov
 * - Texas Attorney General: https://www.texasattorneygeneral.gov
 * - Texas Land Office: https://www.glo.texas.gov
 * - Texas Agriculture: https://www.texasagriculture.gov
 * - Railroad Commission: https://www.rrc.texas.gov
 */

export interface OtherTexasOfficialData {
  roleTitle: string;
  fullName: string;
  party?: string;
  photoUrl?: string;
  capitolAddress?: string;
  capitolPhone?: string;
  website?: string;
  email?: string;
  termStart?: string;
  termEnd?: string;
}

export const OTHER_TEXAS_OFFICIALS: OtherTexasOfficialData[] = [
  {
    roleTitle: "Governor",
    fullName: "Greg Abbott",
    party: "R",
    photoUrl: "https://gov.texas.gov/uploads/images/gov-abbott-2023-official-portrait.jpg",
    capitolAddress: "Office of the Governor, P.O. Box 12428, Austin, TX 78711",
    capitolPhone: "(512) 463-2000",
    website: "https://gov.texas.gov",
    email: "constituent.affairs@gov.texas.gov",
    termStart: "2015-01-20",
    termEnd: "2027-01-19",
  },
  {
    roleTitle: "Lieutenant Governor",
    fullName: "Dan Patrick",
    party: "R",
    photoUrl: "https://www.ltgov.texas.gov/wp-content/uploads/2023/01/DanPatrick-Official.jpg",
    capitolAddress: "Capitol Station, P.O. Box 12068, Austin, TX 78711",
    capitolPhone: "(512) 463-0001",
    website: "https://www.ltgov.texas.gov",
    termStart: "2015-01-20",
    termEnd: "2027-01-19",
  },
  {
    roleTitle: "Attorney General",
    fullName: "Ken Paxton",
    party: "R",
    photoUrl: "https://www.texasattorneygeneral.gov/sites/default/files/images/global/paxton-official.jpg",
    capitolAddress: "P.O. Box 12548, Austin, TX 78711",
    capitolPhone: "(512) 463-2100",
    website: "https://www.texasattorneygeneral.gov",
    termStart: "2015-01-05",
    termEnd: "2027-01-04",
  },
  {
    roleTitle: "Comptroller of Public Accounts",
    fullName: "Glenn Hegar",
    party: "R",
    photoUrl: "https://comptroller.texas.gov/about/media/photos/hegar-headshot.jpg",
    capitolAddress: "P.O. Box 13528, Austin, TX 78711",
    capitolPhone: "(512) 463-4000",
    website: "https://comptroller.texas.gov",
    termStart: "2015-01-02",
    termEnd: "2027-01-01",
  },
  {
    roleTitle: "Commissioner of the General Land Office",
    fullName: "Dawn Buckingham",
    party: "R",
    photoUrl: "https://www.glo.texas.gov/the-glo/about/commissioner/images/buckingham-official.jpg",
    capitolAddress: "1700 N. Congress Ave., Austin, TX 78701",
    capitolPhone: "(512) 463-5256",
    website: "https://www.glo.texas.gov",
    termStart: "2023-01-10",
    termEnd: "2027-01-09",
  },
  {
    roleTitle: "Commissioner of Agriculture",
    fullName: "Sid Miller",
    party: "R",
    photoUrl: "https://www.texasagriculture.gov/portals/0/Images/commissioner/sid-miller-official.jpg",
    capitolAddress: "P.O. Box 12847, Austin, TX 78711",
    capitolPhone: "(512) 463-7476",
    website: "https://www.texasagriculture.gov",
    termStart: "2015-01-02",
    termEnd: "2027-01-01",
  },
  {
    roleTitle: "Railroad Commissioner",
    fullName: "Christi Craddick",
    party: "R",
    capitolAddress: "P.O. Box 12967, Austin, TX 78711",
    capitolPhone: "(512) 463-7140",
    website: "https://www.rrc.texas.gov",
    termStart: "2013-01-07",
    termEnd: "2027-01-06",
  },
  {
    roleTitle: "Railroad Commissioner",
    fullName: "Wayne Christian",
    party: "R",
    capitolAddress: "P.O. Box 12967, Austin, TX 78711",
    capitolPhone: "(512) 463-7140",
    website: "https://www.rrc.texas.gov",
    termStart: "2017-01-09",
    termEnd: "2029-01-08",
  },
  {
    roleTitle: "Railroad Commissioner",
    fullName: "Jim Wright",
    party: "R",
    capitolAddress: "P.O. Box 12967, Austin, TX 78711",
    capitolPhone: "(512) 463-7140",
    website: "https://www.rrc.texas.gov",
    termStart: "2021-01-11",
    termEnd: "2027-01-10",
  },
  {
    roleTitle: "Secretary of State",
    fullName: "Jane Nelson",
    party: "R",
    capitolAddress: "P.O. Box 12887, Austin, TX 78711",
    capitolPhone: "(512) 463-5770",
    website: "https://www.sos.texas.gov",
    termStart: "2023-01-10",
  },
  {
    roleTitle: "Chief Justice of the Texas Supreme Court",
    fullName: "Nathan Hecht",
    party: "R",
    capitolAddress: "Supreme Court of Texas, P.O. Box 12248, Austin, TX 78711",
    capitolPhone: "(512) 463-1312",
    website: "https://www.txcourts.gov/supreme",
    termStart: "2013-01-01",
    termEnd: "2027-12-31",
  },
  {
    roleTitle: "Presiding Judge of the Texas Court of Criminal Appeals",
    fullName: "Sharon Keller",
    party: "R",
    capitolAddress: "Court of Criminal Appeals, P.O. Box 12308, Austin, TX 78711",
    capitolPhone: "(512) 463-1551",
    website: "https://www.txcourts.gov/cca",
    termStart: "2001-01-01",
    termEnd: "2027-12-31",
  },
];

/**
 * Generate a unique source member ID for an Other TX official.
 * Format: OTHER_TX_<role-slug>_<name-slug>
 */
export function generateOtherTxSourceMemberId(roleTitle: string, fullName: string): string {
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
