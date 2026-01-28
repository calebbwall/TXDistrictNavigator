import https from "https";

interface PartyData {
  district: number;
  party: string;
  name: string;
}

async function fetchLRLPage(chamber: "H" | "S"): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://lrl.texas.gov/legeLeaders/members/membersearch.cfm?leg=89&chamber=${chamber}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function parsePartyData(html: string): Map<number, string> {
  const partyMap = new Map<number, string>();
  
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const memberRows = rows.filter((r) => r.includes("memberID="));
  
  for (const row of memberRows) {
    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (cells.length >= 6) {
      const districtText = cells[1].replace(/<[^>]*>/g, "").trim();
      const partyText = cells[5].replace(/<[^>]*>/g, "").trim();
      
      const district = parseInt(districtText, 10);
      if (!isNaN(district) && (partyText === "R" || partyText === "D")) {
        partyMap.set(district, partyText);
      }
    }
  }
  
  return partyMap;
}

export async function fetchTexasHouseParties(): Promise<Map<number, string>> {
  try {
    const html = await fetchLRLPage("H");
    const partyMap = parsePartyData(html);
    console.log(`[PartyLookup] Fetched TX House parties: ${partyMap.size} districts`);
    
    const rCount = [...partyMap.values()].filter((p) => p === "R").length;
    const dCount = [...partyMap.values()].filter((p) => p === "D").length;
    console.log(`[PartyLookup] TX House: R=${rCount}, D=${dCount}`);
    
    return partyMap;
  } catch (err) {
    console.error("[PartyLookup] Failed to fetch TX House parties:", err);
    return new Map();
  }
}

export async function fetchTexasSenateParties(): Promise<Map<number, string>> {
  try {
    const html = await fetchLRLPage("S");
    const partyMap = parsePartyData(html);
    console.log(`[PartyLookup] Fetched TX Senate parties: ${partyMap.size} districts`);
    
    const rCount = [...partyMap.values()].filter((p) => p === "R").length;
    const dCount = [...partyMap.values()].filter((p) => p === "D").length;
    console.log(`[PartyLookup] TX Senate: R=${rCount}, D=${dCount}`);
    
    return partyMap;
  } catch (err) {
    console.error("[PartyLookup] Failed to fetch TX Senate parties:", err);
    return new Map();
  }
}
