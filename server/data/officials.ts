import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type DistrictType = "tx_house" | "tx_senate" | "us_congress";

export interface Office {
  type: "capitol" | "district";
  address: string;
  phone: string;
}

export interface Official {
  id: string;
  name: string;
  chamber: DistrictType;
  districtNumber: number;
  photoUrl: string | null;
  party: "R" | "D";
  offices: Office[];
}

interface GeoJSONFeature {
  properties: { district: number; name: string };
}

interface GeoJSONCollection {
  features: GeoJSONFeature[];
}

function loadNamesFromGeoJSON(filename: string): Map<number, string> {
  try {
    const filePath = path.join(__dirname, "geojson", filename);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as GeoJSONCollection;
    const map = new Map<number, string>();
    data.features.forEach(f => {
      map.set(f.properties.district, f.properties.name);
    });
    return map;
  } catch {
    return new Map();
  }
}

const txHouseNamesMap = loadNamesFromGeoJSON("tx_house_simplified.geojson");
const txSenateNamesMap = loadNamesFromGeoJSON("tx_senate_simplified.geojson");
const usCongressNamesMap = loadNamesFromGeoJSON("us_congress_simplified.geojson");

const txHouseDemocrats = new Set([
  "Alma Allen", "Rafael Anchía", "Diego Bernal", "Salman Bhojani", "Rhetta Bowers",
  "John Bryant", "John H. Bucy III", "John Bucy", "Liz Campos", "Terry Canales",
  "Sheryl Cole", "Nicole Collier", "Philip Cortez", "Aicha Davis", "Yvonne Davis",
  "Harold V. Dutton, Jr.", "Harold Dutton", "Lulu Flores", "Erin Elizabeth Gámez", "Erin Gamez",
  "Josey Garcia", "Linda Garcia", "Cassandra Garcia Hernandez", "Barbara Gervin-Hawkins",
  "Jessica González", "Jessica Gonzalez", "Mary González", "Mary Gonzalez", "Vikki Goodwin",
  "R.D. 'Bobby' Guerra", "Bobby Guerra", "Ana Hernandez", "Gina Hinojosa", "Donna Howard",
  "Ann Johnson", "Jolanda Jones", "Venton Jones", "Suleman Lalani", "Oscar Longoria",
  "Ray López", "Ray Lopez", "Christian Manuel", "Armando Martinez", "Trey Martinez Fischer",
  "Terry Meza", "Joe Moody", "Christina Morales", "Eddie Morales", "Penny Morales Shaw",
  "Sergio Muñoz, Jr.", "Sergio Munoz", "Claudia Ordaz", "Mary Ann Perez", "Vince Perez",
  "Mihaela Plesa", "Richard Peña Raymond", "Richard Raymond", "Ron Reynolds",
  "Ana-María Rodríguez Ramos", "Ramon Romero, Jr.", "Ramon Romero", "Toni Rose", "Jon Rosenthal",
  "Lauren A. Simmons", "Lauren Simmons", "James Talarico", "Senfronia Thompson", "Chris Turner",
  "Hubert Vo", "Armando Walle", "Charlene Ward Johnson", "Gene Wu", "Erin Zwiener"
]);

const txSenateDemocrats = new Set([
  "Carol Alvarado", "Cesar Blanco", "Sarah Eckhardt", "Roland Gutierrez", "Juan Hinojosa",
  "Nathan Johnson", "Jose Menendez", "Borris Miles", "Royce West", "John Whitmire",
  "Judith Zaffirini", "Morgan LaMantia"
]);

const usCongressDemocrats = new Set([
  "Lizzie Fletcher", "Al Green", "Veronica Escobar", "Sheila Jackson Lee", "Joaquin Castro",
  "Lloyd Doggett", "Colin Allred", "Vicente Gonzalez", "Greg Casar", "Sylvia Garcia",
  "Marc Veasey", "Jasmine Crockett", "Henry Cuellar"
]);

function getParty(name: string, democratsSet: Set<string>): "R" | "D" {
  const normalized = name.trim();
  for (const dem of democratsSet) {
    if (normalized.includes(dem) || dem.includes(normalized) ||
        normalized.toLowerCase().includes(dem.toLowerCase()) ||
        dem.toLowerCase().includes(normalized.toLowerCase())) {
      return "D";
    }
  }
  const firstLast = normalized.split(",")[0].trim();
  for (const dem of democratsSet) {
    const demFirstLast = dem.split(",")[0].trim();
    if (firstLast === demFirstLast) return "D";
    const nameParts = firstLast.split(" ").filter(p => p.length > 2);
    const demParts = demFirstLast.split(" ").filter(p => p.length > 2);
    if (nameParts.length >= 2 && demParts.length >= 2) {
      if (nameParts[nameParts.length - 1] === demParts[demParts.length - 1] &&
          nameParts[0] === demParts[0]) {
        return "D";
      }
    }
  }
  return "R";
}

function generateOfficials(
  namesMap: Map<number, string>,
  count: number,
  chamber: DistrictType,
  democratsSet: Set<string>
): Official[] {
  const capitolAddress = chamber === "us_congress"
    ? "Washington, DC 20515"
    : "P.O. Box 12068, Capitol Station, Austin, TX 78711";

  const officials: Official[] = [];
  for (let i = 1; i <= count; i++) {
    const name = namesMap.get(i) || `District ${i} Representative`;
    officials.push({
      id: `${chamber}-${i}`,
      name,
      chamber,
      districtNumber: i,
      photoUrl: null,
      party: getParty(name, democratsSet),
      offices: [
        {
          type: "capitol",
          address: capitolAddress,
          phone: `(512) 463-${String(100 + i).padStart(4, "0")}`,
        },
        {
          type: "district",
          address: "District Office, TX",
          phone: `(512) 555-${String(1000 + i).slice(-4)}`,
        },
      ],
    });
  }
  return officials;
}

export const txHouseOfficials = generateOfficials(txHouseNamesMap, 150, "tx_house", txHouseDemocrats);
export const txSenateOfficials = generateOfficials(txSenateNamesMap, 31, "tx_senate", txSenateDemocrats);
export const usCongressOfficials = generateOfficials(usCongressNamesMap, 38, "us_congress", usCongressDemocrats);

export const allOfficials = [...txHouseOfficials, ...txSenateOfficials, ...usCongressOfficials];

export function getOfficialsByDistrict(chamber: DistrictType, districtNumber: number): Official | undefined {
  return allOfficials.find(o => o.chamber === chamber && o.districtNumber === districtNumber);
}

export function getOfficialsByChamber(chamber: DistrictType): Official[] {
  return allOfficials.filter(o => o.chamber === chamber);
}
