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

export const mockDistricts: District[] = [
  { id: "s-1", districtType: "senate", districtNumber: 1, name: "Bryan Hughes" },
  { id: "s-2", districtType: "senate", districtNumber: 2, name: "Bob Hall" },
  { id: "s-3", districtType: "senate", districtNumber: 3, name: "Robert Nichols" },
  { id: "s-4", districtType: "senate", districtNumber: 4, name: "Brandon Creighton" },
  { id: "s-5", districtType: "senate", districtNumber: 5, name: "Charles Schwertner" },
  { id: "s-6", districtType: "senate", districtNumber: 6, name: "Carol Alvarado" },
  { id: "s-7", districtType: "senate", districtNumber: 7, name: "Paul Bettencourt" },
  { id: "s-8", districtType: "senate", districtNumber: 8, name: "Angela Paxton" },
  { id: "h-1", districtType: "house", districtNumber: 1, name: "Gary VanDeaver" },
  { id: "h-2", districtType: "house", districtNumber: 2, name: "Bryan Slaton" },
  { id: "h-3", districtType: "house", districtNumber: 3, name: "Cecil Bell Jr." },
  { id: "h-4", districtType: "house", districtNumber: 4, name: "Keith Bell" },
  { id: "h-5", districtType: "house", districtNumber: 5, name: "Cole Hefner" },
  { id: "h-6", districtType: "house", districtNumber: 6, name: "Matt Schaefer" },
  { id: "h-7", districtType: "house", districtNumber: 7, name: "Jay Dean" },
  { id: "h-8", districtType: "house", districtNumber: 8, name: "Cody Harris" },
  { id: "c-1", districtType: "congress", districtNumber: 1, name: "Nathaniel Moran" },
  { id: "c-2", districtType: "congress", districtNumber: 2, name: "Dan Crenshaw" },
  { id: "c-3", districtType: "congress", districtNumber: 3, name: "Keith Self" },
  { id: "c-4", districtType: "congress", districtNumber: 4, name: "Pat Fallon" },
  { id: "c-5", districtType: "congress", districtNumber: 5, name: "Lance Gooden" },
  { id: "c-6", districtType: "congress", districtNumber: 6, name: "Jake Ellzey" },
  { id: "c-7", districtType: "congress", districtNumber: 7, name: "Lizzie Fletcher" },
  { id: "c-8", districtType: "congress", districtNumber: 8, name: "Morgan Luttrell" },
];

export const mockOfficials: Official[] = [
  {
    id: "off-1",
    fullName: "Bryan Hughes",
    officeType: "tx_senate",
    districtId: "s-1",
    photoUrl: null,
    city: "Mineola",
    occupation: "Attorney",
    offices: [
      { id: "o-1", officeKind: "capitol", address: "P.O. Box 12068, Capitol Station, Austin, TX 78711", phone: "(512) 463-0101" },
      { id: "o-2", officeKind: "district", address: "110 N. College Avenue, Suite 207, Tyler, TX 75702", phone: "(903) 581-1776" },
    ],
    staff: [
      { id: "st-1", name: "John Smith", role: "Chief of Staff" },
      { id: "st-2", name: "Jane Doe", role: "Legislative Director" },
    ],
  },
  {
    id: "off-2",
    fullName: "Bob Hall",
    officeType: "tx_senate",
    districtId: "s-2",
    photoUrl: null,
    city: "Edgewood",
    occupation: "Retired Military",
    offices: [
      { id: "o-3", officeKind: "capitol", address: "P.O. Box 12068, Capitol Station, Austin, TX 78711", phone: "(512) 463-0102" },
      { id: "o-4", officeKind: "district", address: "6537 Horizon Rd., Suite A, Rockwall, TX 75032", phone: "(972) 722-0081" },
    ],
    staff: [
      { id: "st-3", name: "Michael Brown", role: "Chief of Staff" },
    ],
  },
  {
    id: "off-3",
    fullName: "Gary VanDeaver",
    officeType: "tx_house",
    districtId: "h-1",
    photoUrl: null,
    city: "New Boston",
    occupation: "Educator",
    offices: [
      { id: "o-5", officeKind: "capitol", address: "P.O. Box 2910, Austin, TX 78768", phone: "(512) 463-0692" },
      { id: "o-6", officeKind: "district", address: "301 Main Street, Suite 101, Texarkana, TX 75501", phone: "(903) 628-0361" },
    ],
    staff: [
      { id: "st-4", name: "Sarah Wilson", role: "District Director" },
    ],
  },
  {
    id: "off-4",
    fullName: "Nathaniel Moran",
    officeType: "us_house",
    districtId: "c-1",
    photoUrl: null,
    city: "Tyler",
    occupation: "Attorney",
    offices: [
      { id: "o-7", officeKind: "capitol", address: "1541 Longworth HOB, Washington, DC 20515", phone: "(202) 225-3035" },
      { id: "o-8", officeKind: "district", address: "420 Shelley Dr, Suite 200, Tyler, TX 75701", phone: "(903) 561-6349" },
    ],
    staff: [
      { id: "st-5", name: "David Anderson", role: "Chief of Staff" },
      { id: "st-6", name: "Lisa Thompson", role: "Communications Director" },
    ],
  },
  {
    id: "off-5",
    fullName: "Dan Crenshaw",
    officeType: "us_house",
    districtId: "c-2",
    photoUrl: null,
    city: "Houston",
    occupation: "Former Navy SEAL",
    offices: [
      { id: "o-9", officeKind: "capitol", address: "413 Cannon HOB, Washington, DC 20515", phone: "(202) 225-6565" },
      { id: "o-10", officeKind: "district", address: "9720 Cypresswood Dr., Suite 206, Houston, TX 77070", phone: "(281) 640-7720" },
    ],
    staff: [
      { id: "st-7", name: "Justin Hollis", role: "Chief of Staff" },
    ],
  },
  {
    id: "off-6",
    fullName: "Carol Alvarado",
    officeType: "tx_senate",
    districtId: "s-6",
    photoUrl: null,
    city: "Houston",
    occupation: "Businesswoman",
    offices: [
      { id: "o-11", officeKind: "capitol", address: "P.O. Box 12068, Capitol Station, Austin, TX 78711", phone: "(512) 463-0106" },
      { id: "o-12", officeKind: "district", address: "4802 Travis St., Suite 201, Houston, TX 77002", phone: "(713) 864-2521" },
    ],
    staff: [
      { id: "st-8", name: "Maria Garcia", role: "Chief of Staff" },
    ],
  },
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
