export type DistrictType = "senate" | "house" | "congress";
export type ApiDistrictType = "tx_senate" | "tx_house" | "us_congress";

export interface District {
  id: string;
  districtType: DistrictType;
  districtNumber: number;
  name: string;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
}

export interface Office {
  id: string;
  officeKind: "capitol" | "district";
  address: string;
  phone: string;
}

export interface Official {
  id: string;
  fullName: string;
  officeType: "tx_senate" | "tx_house" | "us_house";
  districtId: string;
  photoUrl: string | null;
  city: string;
  occupation: string;
  offices: Office[];
  staff: Staff[];
  isVacant?: boolean;
  privateNotes?: {
    personalPhone?: string;
    personalAddress?: string;
    spouse?: string;
    children?: string;
    birthday?: string;
    anniversary?: string;
    notes?: string;
  };
}

const txHouseNames = [
  "Gary VanDeaver", "Bryan Slaton", "Cecil Bell Jr.", "Keith Bell", "Cole Hefner",
  "Matt Schaefer", "Jay Dean", "Cody Harris", "Chris Paddie", "Travis Clardy",
  "Kyle Kacal", "Ben Leman", "Trent Ashby", "James White", "Steve Toth",
  "Will Metcalf", "John Cyrier", "Ernest Bailes", "James Frank", "Terry Wilson",
  "Dade Phelan", "Mayes Middleton", "Briscoe Cain", "Greg Bonnen", "Dennis Paul",
  "Jacey Jetton", "Ron Reynolds", "Gary Gates", "Ed Thompson", "Geanie Morrison",
  "Ryan Guillen", "Todd Hunter", "Justin Holland", "Abel Herrero", "Oscar Longoria",
  "Sergio Munoz Jr.", "Alex Dominguez", "Eddie Lucio III", "Armando Martinez", "Terry Canales",
  "Bobby Guerra", "R.D. Bobby Martinez", "J.M. Lozano", "John Kuempel", "Erin Zwiener",
  "Sheryl Cole", "Vikki Goodwin", "Donna Howard", "Gina Hinojosa", "James Talarico",
  "Celia Israel", "Caroline Harris", "Andrew Murr", "Brad Buckley", "Hugh Shine",
  "Charles Doc Anderson", "Trent Ashby II", "DeWayne Burns", "Shelby Slawson", "Glenn Rogers",
  "Mike Lang", "Reggie Smith", "Ben Bumgarner", "Lynn Stucky", "David Cook",
  "Giovanni Capriglione", "Craig Goldman", "Phil King", "Drew Darby", "Brooks Landgraf",
  "Tom Craddick", "Ken King", "Dustin Burrows", "John Frullo", "Four Price",
  "Ken Paxton Jr.", "Jeff Leach", "Matt Shaheen", "Candy Noble", "Scott Sanford",
  "Stephanie Klick", "Tony Tinderholt", "David Cook II", "Charlie Geren", "Nicole Collier",
  "Chris Turner", "Ramon Romero Jr.", "Craig Goldman II", "Ana-Maria Ramos", "Terry Meza",
  "Jessica Gonzalez", "Rafael Anchia", "Rhetta Bowers", "Carl Sherman", "Jasmine Crockett",
  "Yvonne Davis", "Toni Rose", "Lorraine Birabil", "Diego Bernal", "Ina Minjarez",
  "Steve Allison", "Liz Campos", "Philip Cortez", "Ray Lopez", "Barbara Gervin-Hawkins",
  "Leo Pacheco", "Art Fierro", "Claudia Ordaz Perez", "Joe Moody", "Lina Ortega",
  "Mary Gonzalez", "Eddie Morales Jr.", "Tracy King", "Andrew Murr II", "Richard Raymond",
  "Ryan Guillen II", "J.D. Sheffield", "Stan Lambert", "Angie Chen Button", "Morgan Meyer",
  "Linda Koop", "Julie Johnson", "Michelle Beckley", "Jared Patterson", "Jeff Cason",
  "Matt Krause", "Nate Schatzline", "David Spiller", "Charles Schwertner Jr.", "Ben Leman II",
  "Joe Deshotel", "Desiree Venable", "Terri Collins", "Mike Schofield", "Sam Harless",
  "Valoree Swanson", "Tom Oliverson", "Jon Rosenthal", "Penny Morales Shaw", "Christina Morales",
  "Jarvis Johnson", "Senfronia Thompson", "Harold Dutton Jr.", "Jolanda Jones", "Shawn Thierry",
  "Alma Allen", "Ann Johnson", "Lacey Hull", "Briscoe Cain II", "Dennis Bonnen"
];

const txSenateNames = [
  "Bryan Hughes", "Bob Hall", "Robert Nichols", "Brandon Creighton", "Charles Schwertner",
  "Carol Alvarado", "Paul Bettencourt", "Angela Paxton", "Kelly Hancock", "Phil King",
  "Larry Taylor", "Jane Nelson", "Borris Miles", "Sarah Eckhardt", "John Whitmire",
  "Nathan Johnson", "Joan Huffman", "Lois Kolkhorst", "Roland Gutierrez", "Juan Hinojosa",
  "Judith Zaffirini", "Brian Birdwell", "Royce West", "Drew Springer", "Donna Campbell",
  "Jose Menendez", "Eddie Lucio Jr.", "Cesar Blanco", "Kevin Sparks", "Charles Perry",
  "Tan Parker"
];

const usCongressNames = [
  "Nathaniel Moran", "Dan Crenshaw", "Keith Self", "Pat Fallon", "Lance Gooden",
  "Jake Ellzey", "Lizzie Fletcher", "Morgan Luttrell", "Al Green", "Michael McCaul",
  "August Pfluger", "Kay Granger", "Ronny Jackson", "Randy Weber", "Monica De La Cruz",
  "Veronica Escobar", "Pete Sessions", "Sheila Jackson Lee", "Jodey Arrington", "Joaquin Castro",
  "Chip Roy", "Troy Nehls", "Tony Gonzales", "Henry Cuellar", "Roger Williams",
  "Michael Burgess", "Michael Cloud", "John Carter", "Marc Veasey", "Eddie Bernice Johnson",
  "Colin Allred", "Beth Van Duyne", "Brian Babin", "Vicente Gonzalez", "Lloyd Doggett",
  "Greg Casar", "Sylvia Garcia", "Wesley Hunt"
];

function generateDistricts(type: DistrictType, names: string[]): District[] {
  const prefix = type === "senate" ? "s" : type === "house" ? "h" : "c";
  return names.map((name, i) => ({
    id: `${prefix}-${i + 1}`,
    districtType: type,
    districtNumber: i + 1,
    name,
  }));
}

export const mockDistricts: District[] = [
  ...generateDistricts("senate", txSenateNames),
  ...generateDistricts("house", txHouseNames),
  ...generateDistricts("congress", usCongressNames),
];

const occupations = [
  "Attorney", "Business Owner", "Educator", "Engineer", "Retired Military",
  "Rancher", "Real Estate", "Healthcare", "Finance", "Public Service"
];

function generateOfficial(
  index: number,
  fullName: string,
  officeType: "tx_senate" | "tx_house" | "us_house",
  districtId: string
): Official {
  const prefix = officeType === "tx_senate" ? "sen" : officeType === "tx_house" ? "rep" : "cong";
  return {
    id: `off-${prefix}-${index}`,
    fullName,
    officeType,
    districtId,
    photoUrl: null,
    city: "Texas",
    occupation: occupations[index % occupations.length],
    offices: [
      {
        id: `o-${prefix}-${index}-1`,
        officeKind: "capitol",
        address: officeType === "us_house"
          ? "Washington, DC 20515"
          : "P.O. Box 12068, Capitol Station, Austin, TX 78711",
        phone: `(512) 463-${String(100 + index).padStart(4, "0")}`,
      },
      {
        id: `o-${prefix}-${index}-2`,
        officeKind: "district",
        address: "District Office, TX",
        phone: `(512) 555-${String(1000 + index).slice(-4)}`,
      },
    ],
    staff: [
      { id: `st-${prefix}-${index}-1`, name: "Staff Member", role: "Chief of Staff" },
    ],
  };
}

export const mockOfficials: Official[] = [
  ...txSenateNames.map((name, i) =>
    generateOfficial(i + 1, name, "tx_senate", `s-${i + 1}`)
  ),
  ...txHouseNames.map((name, i) =>
    generateOfficial(i + 1, name, "tx_house", `h-${i + 1}`)
  ),
  ...usCongressNames.map((name, i) =>
    generateOfficial(i + 1, name, "us_house", `c-${i + 1}`)
  ),
];

export function getDistrictsByType(type: DistrictType): District[] {
  return mockDistricts.filter((d) => d.districtType === type);
}

export function getOfficialByDistrictId(districtId: string): Official | undefined {
  return mockOfficials.find((o) => o.districtId === districtId);
}

export function getOfficialById(officialId: string): Official | undefined {
  return mockOfficials.find((o) => o.id === officialId);
}

export function getDistrictById(districtId: string): District | undefined {
  return mockDistricts.find((d) => d.id === districtId);
}

export function searchOfficialsByName(query: string): Official[] {
  const lowerQuery = query.toLowerCase();
  return mockOfficials.filter((o) =>
    o.fullName.toLowerCase().includes(lowerQuery)
  );
}

export function getDistrictTypeLabel(type: DistrictType): string {
  switch (type) {
    case "senate":
      return "TX Senate";
    case "house":
      return "TX House";
    case "congress":
      return "US Congress";
  }
}

export function getOfficeTypeLabel(type: Official["officeType"]): string {
  switch (type) {
    case "tx_senate":
      return "Texas Senate";
    case "tx_house":
      return "Texas House";
    case "us_house":
      return "US House";
  }
}

export const DISTRICT_COUNTS = {
  tx_house: 150,
  tx_senate: 31,
  us_congress: 38,
};
