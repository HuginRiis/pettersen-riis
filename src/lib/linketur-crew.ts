// Data for Linketur: hytter, gjengen, PC-er og faste LAN-spill.
// Rediger fritt — dette er ren statisk data.

export type LinketurCabin = {
  id: string;
  name: string;
  place: string;
  code: string;
  /** Hyttenummer på Hydrostranda */
  number: string;
  image: string;
  facts: { label: string; value: string }[];
};

export type CrewMember = {
  name: string;
  role: string;
  pc: string;
  specs: { cpu: string; gpu: string; ram: string; disk: string; skjerm: string };
  note?: string;
};

export type CrewGame = {
  title: string;
  players: string;
  special: string;
  mode: "ekte-lan" | "vpn" | "server" | "online";
};

import hyttaImg from "@/assets/hytta.jpg";
import hyttaAutumn from "@/assets/hytta-autumn.jpg";

export const LINKETUR_CABINS: LinketurCabin[] = [
  {
    id: "var",
    name: "Hyttetur vår",
    place: "Hydrostranda",
    code: "1234",
    number: "",
    image: hyttaImg,
    facts: [
      { label: "Soveplasser", value: "6" },
      { label: "Nett", value: "4G-ruter + eget LAN" },
      { label: "Strøm", value: "2 kurser i stua" },
      { label: "Nøkkelboks", value: "Ved inngangsdøra" },
    ],
  },
  {
    id: "host",
    name: "Hyttetur høst",
    place: "Hydrostranda",
    code: "4321",
    number: "",
    image: hyttaAutumn,
    facts: [
      { label: "Soveplasser", value: "5 + sofa" },
      { label: "Nett", value: "Tregt 4G" },
      { label: "Strøm", value: "1 kurs" },
      { label: "Nøkkelboks", value: "Under trappa" },
    ],
  },
];

export const LINKETUR_CREW: CrewMember[] = [
  {
    name: "Stian",
    role: "Serverkeeper",
    pc: "Egenbygd tower",
    specs: { cpu: "Ryzen 7", gpu: "RTX 4070", ram: "32 GB", disk: "2 TB NVMe", skjerm: '27" 165 Hz' },
    note: "Kjører dedikert server når vi trenger det.",
  },
  {
    name: "Sondre",
    role: "Fragger",
    pc: "Gaming-laptop",
    specs: { cpu: "Intel i7", gpu: "RTX 4060", ram: "16 GB", disk: "1 TB NVMe", skjerm: '16" 144 Hz' },
    note: "Husk strømforsyning — batteriet holder ikke en runde.",
  },
  {
    name: "Thomas",
    role: "Mod-mekker",
    pc: "Egenbygd mini-ITX",
    specs: { cpu: "Ryzen 5", gpu: "RTX 3060 Ti", ram: "32 GB", disk: "1 TB NVMe", skjerm: '24" 144 Hz' },
    note: "Har mappene med mods og maps på minnepenn.",
  },
  {
    name: "Arne",
    role: "Nettverk & strøm",
    pc: "Egenbygd tower",
    specs: { cpu: "Ryzen 7", gpu: "RTX 4080", ram: "64 GB", disk: "4 TB NVMe", skjerm: '32" 165 Hz' },
    note: "Tar med switch, kabler og skjøteledninger.",
  },
  {
    name: "Fatter",
    role: "Veteranen",
    pc: "Stasjonær",
    specs: { cpu: "Intel i5", gpu: "GTX 1660 Super", ram: "16 GB", disk: "512 GB SSD", skjerm: '24" 75 Hz' },
    note: "Eldre rigg — velg spill som ikke krever nyeste maskinvare.",
  },
  {
    name: "John",
    role: "Kaospiloten",
    pc: "Gaming-laptop",
    specs: { cpu: "Intel i9", gpu: "RTX 4070", ram: "32 GB", disk: "2 TB NVMe", skjerm: '17" 165 Hz' },
    note: "Alltid klar for et nytt spill ingen har prøvd.",
  },
];

export const CREW_GAMES: CrewGame[] = [
  {
    title: "Counter-Strike 2",
    players: "6 (3v3)",
    special: "Kjøres på egen server. Klassikeren når alle er varme i fingrene.",
    mode: "server",
  },
  {
    title: "Age of Empires II: DE",
    players: "6 (3v3)",
    special: "Alltid Arabia eller Black Forest. Ingen sender bønder til fienden.",
    mode: "online",
  },
  {
    title: "Trackmania",
    players: "6",
    special: "Perfekt oppvarming — går på alle riggene, også Fatter sin.",
    mode: "online",
  },
  {
    title: "Left 4 Dead 2",
    players: "4 + 4 versus",
    special: "Krever mods-mappa til Thomas for custom-kampanjer.",
    mode: "ekte-lan",
  },
  {
    title: "Rocket League",
    players: "6 (3v3)",
    special: "Privat lobby. Kortere runder når det begynner å bli sent.",
    mode: "online",
  },
  {
    title: "Warcraft III / DotA",
    players: "6",
    special: "Kjøres over VPN eller LAN. Nostalgirunden på lørdagskvelden.",
    mode: "vpn",
  },
];
