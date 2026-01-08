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

const parties: Record<number, "R" | "D"> = {
  7: "D", 8: "D", 9: "D", 18: "D", 20: "D", 28: "D", 29: "D", 30: "D", 32: "D", 33: "D", 34: "D", 35: "D", 37: "D"
};

function generateOfficials(names: string[], chamber: DistrictType): Official[] {
  const capitolAddress = chamber === "us_congress" 
    ? "Washington, DC 20515" 
    : "P.O. Box 12068, Capitol Station, Austin, TX 78711";
  
  return names.map((name, i) => ({
    id: `${chamber}-${i + 1}`,
    name,
    chamber,
    districtNumber: i + 1,
    photoUrl: null,
    party: parties[i + 1] || "R",
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
  }));
}

export const txHouseOfficials = generateOfficials(txHouseNames, "tx_house");
export const txSenateOfficials = generateOfficials(txSenateNames, "tx_senate");
export const usCongressOfficials = generateOfficials(usCongressNames, "us_congress");

export const allOfficials = [...txHouseOfficials, ...txSenateOfficials, ...usCongressOfficials];

export function getOfficialsByDistrict(chamber: DistrictType, districtNumber: number): Official | undefined {
  return allOfficials.find(o => o.chamber === chamber && o.districtNumber === districtNumber);
}

export function getOfficialsByChamber(chamber: DistrictType): Official[] {
  return allOfficials.filter(o => o.chamber === chamber);
}
