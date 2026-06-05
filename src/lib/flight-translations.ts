// Oversettelser for ICAO-koder, registreringsprefiks og squawk-koder.

const AIRCRAFT_TYPES: Record<string, string> = {
  // Boeing
  B736: "Boeing 737-600",
  B737: "Boeing 737-700",
  B738: "Boeing 737-800",
  B739: "Boeing 737-900",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  B3XM: "Boeing 737 MAX 10",
  B741: "Boeing 747-100",
  B742: "Boeing 747-200",
  B744: "Boeing 747-400",
  B748: "Boeing 747-8",
  B752: "Boeing 757-200",
  B753: "Boeing 757-300",
  B762: "Boeing 767-200",
  B763: "Boeing 767-300",
  B764: "Boeing 767-400",
  B772: "Boeing 777-200",
  B77L: "Boeing 777-200LR / 777F (fraktutgave)",
  B773: "Boeing 777-300",
  B77W: "Boeing 777-300ER",
  B778: "Boeing 777-8",
  B779: "Boeing 777-9",
  B788: "Boeing 787-8 Dreamliner",
  B789: "Boeing 787-9 Dreamliner",
  B78X: "Boeing 787-10 Dreamliner",
  // Airbus
  A19N: "Airbus A319neo",
  A20N: "Airbus A320neo",
  A21N: "Airbus A321neo",
  A318: "Airbus A318",
  A319: "Airbus A319",
  A320: "Airbus A320",
  A321: "Airbus A321",
  A332: "Airbus A330-200",
  A333: "Airbus A330-300",
  A338: "Airbus A330-800neo",
  A339: "Airbus A330-900neo",
  A342: "Airbus A340-200",
  A343: "Airbus A340-300",
  A345: "Airbus A340-500",
  A346: "Airbus A340-600",
  A359: "Airbus A350-900",
  A35K: "Airbus A350-1000",
  A388: "Airbus A380-800",
  // Embraer / Bombardier / ATR
  E170: "Embraer E170",
  E175: "Embraer E175",
  E190: "Embraer E190",
  E195: "Embraer E195",
  E290: "Embraer E190-E2",
  E295: "Embraer E195-E2",
  CRJ2: "Bombardier CRJ-200",
  CRJ7: "Bombardier CRJ-700",
  CRJ9: "Bombardier CRJ-900",
  CRJX: "Bombardier CRJ-1000",
  BCS1: "Airbus A220-100",
  BCS3: "Airbus A220-300",
  DH8D: "Bombardier Dash 8 Q400",
  AT72: "ATR 72",
  AT76: "ATR 72-600",
  AT46: "ATR 42-600",
  // Småfly / militære vanlige
  C172: "Cessna 172 Skyhawk",
  C152: "Cessna 152",
  C208: "Cessna 208 Caravan",
  PC12: "Pilatus PC-12",
  PC24: "Pilatus PC-24",
  TBM9: "Daher TBM 900",
  SR22: "Cirrus SR22",
  P28A: "Piper PA-28 Cherokee",
  EC35: "Airbus H135 (EC135)",
  EC45: "Airbus H145 (EC145)",
  AS50: "Airbus AS350 Écureuil",
  S92: "Sikorsky S-92",
  H60: "Sikorsky UH-60 Black Hawk",
  // Frakt / militær
  C30J: "Lockheed C-130J Hercules",
  A400: "Airbus A400M",
  C17: "Boeing C-17 Globemaster III",
  F35: "Lockheed Martin F-35 Lightning II",
  F16: "F-16 Fighting Falcon",
  EUFI: "Eurofighter Typhoon",
  P8: "Boeing P-8 Poseidon",
};

export function translateAircraftType(code: string | null | undefined): string | null {
  if (!code) return null;
  const k = code.trim().toUpperCase();
  return AIRCRAFT_TYPES[k] ?? null;
}

// Registreringsprefiks → land (sortert lengste først for korrekt match).
const REG_PREFIXES: Array<[string, string]> = [
  // Norden
  ["LN-", "Norge"],
  ["SE-", "Sverige"],
  ["OY-", "Danmark"],
  ["OH-", "Finland"],
  ["TF-", "Island"],
  // Europa
  ["G-", "Storbritannia"],
  ["F-", "Frankrike"],
  ["D-", "Tyskland"],
  ["I-", "Italia"],
  ["EC-", "Spania"],
  ["CS-", "Portugal"],
  ["PH-", "Nederland"],
  ["OO-", "Belgia"],
  ["LX-", "Luxembourg"],
  ["HB-", "Sveits"],
  ["OE-", "Østerrike"],
  ["SP-", "Polen"],
  ["OK-", "Tsjekkia"],
  ["OM-", "Slovakia"],
  ["HA-", "Ungarn"],
  ["YR-", "Romania"],
  ["LZ-", "Bulgaria"],
  ["YU-", "Serbia"],
  ["9A-", "Kroatia"],
  ["S5-", "Slovenia"],
  ["Z3-", "Nord-Makedonia"],
  ["ZA-", "Albania"],
  ["SX-", "Hellas"],
  ["TC-", "Tyrkia"],
  ["EI-", "Irland"],
  ["UR-", "Ukraina"],
  ["EW-", "Hviterussland"],
  ["RA-", "Russland"],
  ["YL-", "Latvia"],
  ["ES-", "Estland"],
  ["LY-", "Litauen"],
  // Amerika
  ["N", "USA"],
  ["C-", "Canada"],
  ["XA-", "Mexico"],
  ["XB-", "Mexico"],
  ["XC-", "Mexico"],
  ["PT-", "Brasil"],
  ["PP-", "Brasil"],
  ["PR-", "Brasil"],
  ["PS-", "Brasil"],
  ["LV-", "Argentina"],
  ["CC-", "Chile"],
  // Midtøsten
  ["A6-", "De forente arabiske emirater"],
  ["A7-", "Qatar"],
  ["A9C-", "Bahrain"],
  ["A40-", "Oman"],
  ["HZ-", "Saudi-Arabia"],
  ["9K-", "Kuwait"],
  ["4X-", "Israel"],
  ["JY-", "Jordan"],
  ["OD-", "Libanon"],
  ["EP-", "Iran"],
  ["YI-", "Irak"],
  // Asia
  ["B-", "Kina/Taiwan/Hongkong"],
  ["JA", "Japan"],
  ["HL", "Sør-Korea"],
  ["VT-", "India"],
  ["AP-", "Pakistan"],
  ["S2-", "Bangladesh"],
  ["VN-", "Vietnam"],
  ["HS-", "Thailand"],
  ["9V-", "Singapore"],
  ["9M-", "Malaysia"],
  ["PK-", "Indonesia"],
  ["RP-", "Filippinene"],
  // Oseania
  ["VH-", "Australia"],
  ["ZK-", "New Zealand"],
  // Afrika
  ["ZS-", "Sør-Afrika"],
  ["SU-", "Egypt"],
  ["7T-", "Algerie"],
  ["CN-", "Marokko"],
  ["TS-", "Tunisia"],
  ["5A-", "Libya"],
  ["ET-", "Etiopia"],
  ["5Y-", "Kenya"],
  ["5N-", "Nigeria"],
];

export function registrationCountry(reg: string | null | undefined): string | null {
  if (!reg) return null;
  const r = reg.trim().toUpperCase();
  for (const [prefix, country] of REG_PREFIXES) {
    if (r.startsWith(prefix)) return country;
  }
  return null;
}

const SQUAWK_SPECIAL: Record<string, string> = {
  "7500": "kapring",
  "7600": "radiosvikt",
  "7700": "nødssituasjon",
  "7000": "VFR (Europa)",
  "1200": "VFR (USA)",
  "2000": "IFR uten tildelt kode",
  "1000": "Mode S enroute",
};

export function explainSquawk(sq: string | null | undefined): string | null {
  if (!sq) return null;
  const s = sq.trim();
  const special = SQUAWK_SPECIAL[s];
  return `transponderkode (squawk) ${s}${special ? ` — ${special}` : ""}`;
}
