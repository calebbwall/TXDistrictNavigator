export type DistrictType = "senate" | "house" | "congress";

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

const senateNames = [
  "Bryan Hughes", "Bob Hall", "Robert Nichols", "Brandon Creighton",
  "Charles Schwertner", "Carol Alvarado", "Paul Bettencourt", "Angela Paxton",
  "Kelly Hancock", "Phil King", "Larry Taylor", "Jane Nelson",
  "Borris Miles", "Sarah Eckhardt", "John Whitmire", "Nathan Johnson",
  "Joan Huffman", "Lois Kolkhorst", "Roland Gutierrez", "Juan Hinojosa",
  "Judith Zaffirini", "Brian Birdwell", "Royce West", "Drew Springer"
];

const houseNames = [
  "Gary VanDeaver", "Bryan Slaton", "Cecil Bell Jr.", "Keith Bell",
  "Cole Hefner", "Matt Schaefer", "Jay Dean", "Cody Harris",
  "Chris Paddie", "Travis Clardy", "Kyle Kacal", "Ben Leman",
  "Trent Ashby", "James White", "Steve Toth", "Will Metcalf",
  "John Cyrier", "Ernest Bailes", "James Frank", "Terry Wilson",
  "Dade Phelan", "Mayes Middleton", "Briscoe Cain", "Greg Bonnen"
];

const congressNames = [
  "Nathaniel Moran", "Dan Crenshaw", "Keith Self", "Pat Fallon",
  "Lance Gooden", "Jake Ellzey", "Lizzie Fletcher", "Morgan Luttrell",
  "Al Green", "Michael McCaul", "August Pfluger", "Kay Granger",
  "Ronny Jackson", "Randy Weber", "Monica De La Cruz", "Veronica Escobar",
  "Pete Sessions", "Sheila Jackson Lee", "Jodey Arrington", "Joaquin Castro",
  "Chip Roy", "Troy Nehls", "Tony Gonzales", "Henry Cuellar"
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
  ...generateDistricts("senate", senateNames),
  ...generateDistricts("house", houseNames),
  ...generateDistricts("congress", congressNames),
];

function generateOfficial(
  index: number,
  fullName: string,
  officeType: "tx_senate" | "tx_house" | "us_house",
  districtId: string,
  city: string,
  occupation: string
): Official {
  const prefix = officeType === "tx_senate" ? "sen" : officeType === "tx_house" ? "rep" : "cong";
  return {
    id: `off-${prefix}-${index}`,
    fullName,
    officeType,
    districtId,
    photoUrl: null,
    city,
    occupation,
    offices: [
      {
        id: `o-${prefix}-${index}-1`,
        officeKind: "capitol",
        address: officeType === "us_house"
          ? "Washington, DC 20515"
          : "P.O. Box 12068, Capitol Station, Austin, TX 78711",
        phone: `(512) 463-0${100 + index}`,
      },
      {
        id: `o-${prefix}-${index}-2`,
        officeKind: "district",
        address: `${city}, TX`,
        phone: `(512) 555-${String(1000 + index).slice(-4)}`,
      },
    ],
    staff: [
      { id: `st-${prefix}-${index}-1`, name: "Staff Member", role: "Chief of Staff" },
    ],
  };
}

const senateCities = [
  "Mineola", "Edgewood", "Jacksonville", "Conroe", "Georgetown",
  "Houston", "Houston", "McKinney", "North Richland Hills", "Weatherford",
  "Friendswood", "Flower Mound", "Houston", "Austin", "Houston",
  "Dallas", "Houston", "Brenham", "San Antonio", "McAllen",
  "Laredo", "Granbury", "Dallas", "Muenster"
];

const houseCities = [
  "New Boston", "Royse City", "Magnolia", "Forney", "Gilmer",
  "Tyler", "Longview", "Palestine", "Marshall", "Nacogdoches",
  "College Station", "Brenham", "Lufkin", "Hillister", "The Woodlands",
  "Conroe", "Lockhart", "Shepherd", "Wichita Falls", "Marble Falls",
  "Beaumont", "Galveston", "Deer Park", "Friendswood"
];

const congressCities = [
  "Tyler", "Houston", "McKinney", "Sherman", "Terrell",
  "Waxahachie", "Houston", "Conroe", "Houston", "Austin",
  "San Angelo", "Fort Worth", "Amarillo", "Friendswood", "Edinburg",
  "El Paso", "Waco", "Houston", "Lubbock", "San Antonio",
  "San Antonio", "Richmond", "San Antonio", "Laredo"
];

const occupations = [
  "Attorney", "Business Owner", "Educator", "Engineer", "Retired Military",
  "Rancher", "Real Estate", "Healthcare", "Finance", "Public Service"
];

export const mockOfficials: Official[] = [
  ...senateNames.map((name, i) =>
    generateOfficial(i + 1, name, "tx_senate", `s-${i + 1}`, senateCities[i] || "Austin", occupations[i % occupations.length])
  ),
  ...houseNames.map((name, i) =>
    generateOfficial(i + 1, name, "tx_house", `h-${i + 1}`, houseCities[i] || "Austin", occupations[i % occupations.length])
  ),
  ...congressNames.map((name, i) =>
    generateOfficial(i + 1, name, "us_house", `c-${i + 1}`, congressCities[i] || "Austin", occupations[i % occupations.length])
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
