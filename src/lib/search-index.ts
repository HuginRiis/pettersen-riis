// Søkeindeks over alle sider/funksjoner i borgen.
// Brukes av SmartSearch på hjemskjermen — både for vanlig søk og som
// kontekst til AI-søket.

export type SearchEntry = {
  title: string;
  path: string;
  section: string;
  description: string;
  keywords: string[];
};

export const SEARCH_INDEX: SearchEntry[] = [
  // Hjem & oversikt
  {
    title: "Hjem / Borgen",
    path: "/",
    section: "Hjem",
    description: "Hovedinngangen til House Pettersen-Riis med menyen og oversikten.",
    keywords: ["hjem", "borgen", "forsiden", "menyen", "saler", "pettersen", "riis"],
  },
  // Vær
  {
    title: "Vær & varsel",
    path: "/var",
    section: "Vær",
    description: "Værmelding for Tollnes og Hytta, time- og dagvarsel, Netatmo.",
    keywords: ["vær", "tollnes", "skien", "yr", "met", "værmelding", "temperatur", "regn", "vind", "varsel"],
  },
  {
    title: "Pollen",
    path: "/pollen",
    section: "Vær",
    description: "Pollenvarsel for Tollnes med dag- og ukeprognose.",
    keywords: ["pollen", "bjørk", "gress", "or", "hassel", "allergi"],
  },
  {
    title: "Met-alerts / Farevarsler",
    path: "/varsler",
    section: "Vær",
    description: "Met.no farevarsler med kart over Norge.",
    keywords: ["farevarsel", "met", "varsel", "obs", "uvær", "storm", "kart"],
  },
  // Hytta og turer
  {
    title: "Hytta",
    path: "/hytta",
    section: "Hytta",
    description: "Hytta i Flesberg — aurora, vær, sjekkliste, Indre Sal.",
    keywords: ["hytta", "flesberg", "aurora", "nordlys", "sjekkliste", "blefjell"],
  },
  {
    title: "Oppussing hytta",
    path: "/oppussing-hytta",
    section: "Hytta",
    description: "Oppussingsprosjekter for hytta i Flesberg.",
    keywords: ["oppussing", "hytte", "renovering", "prosjekt", "flesberg"],
  },
  {
    title: "Turer",
    path: "/turer",
    section: "Aktivitet",
    description: "Strava-turer, kart over løp og sykling.",
    keywords: ["turer", "strava", "løp", "sykling", "kart", "aktiviteter"],
  },
  {
    title: "Trening / Garmin",
    path: "/trening",
    section: "Aktivitet",
    description: "Garmin Connect — skritt, søvn, treningsstatus, VO2, body battery.",
    keywords: ["trening", "garmin", "skritt", "søvn", "puls", "vo2", "body battery", "rhr"],
  },
  // Hjemmet
  {
    title: "Smarthus",
    path: "/smarthus",
    section: "Hjemmet",
    description: "Homey-enheter, rom og scener.",
    keywords: ["smarthus", "homey", "enheter", "scener", "rom"],
  },
  {
    title: "Lys / Scener",
    path: "/lys",
    section: "Hjemmet",
    description: "Lysscener og kontroll via Homey.",
    keywords: ["lys", "scener", "homey", "philips hue", "ikea"],
  },
  {
    title: "Gressklipper (Gardena)",
    path: "/gressklipper",
    section: "Hjemmet",
    description: "Gardena smart robotgressklipper — status, batteri, signal, kart.",
    keywords: ["gardena", "gressklipper", "robot", "klipper", "plen", "husqvarna", "sileno"],
  },
  {
    title: "Støvsugeren",
    path: "/stovsugeren",
    section: "Hjemmet",
    description: "Roborock støvsuger — status, kart, oppgaver.",
    keywords: ["roborock", "støvsuger", "robot", "renhold", "vacuum"],
  },
  {
    title: "Roborock detaljer",
    path: "/roborock",
    section: "Hjemmet",
    description: "Detaljert oversikt og MQTT-debug for Roborock.",
    keywords: ["roborock", "mqtt", "debug", "støvsuger"],
  },
  {
    title: "Planter",
    path: "/planter",
    section: "Hjemmet",
    description: "Plante-database med vanning, stell, giftighet og fakta.",
    keywords: ["planter", "blomster", "tre", "vanning", "stell", "giftig", "spiselig"],
  },
  {
    title: "Hundene",
    path: "/hundene",
    section: "Hjemmet",
    description: "Profiler for husets hunder.",
    keywords: ["hunder", "hundene", "dyr", "kjæledyr"],
  },
  // Økonomi
  {
    title: "Økonomi",
    path: "/okonomi",
    section: "Økonomi",
    description: "Husholdningsøkonomi, kontoer, transaksjoner og budsjett.",
    keywords: ["økonomi", "budsjett", "transaksjoner", "kontoer", "penger", "saldo", "nordea", "dnb"],
  },
  {
    title: "Strøm / Tibber",
    path: "/stromkroniken",
    section: "Økonomi",
    description: "Tibber strømpriser, pulse, døgnforbruk.",
    keywords: ["strøm", "tibber", "pulse", "spotpris", "kwh", "kraft"],
  },
  {
    title: "Kvitteringer",
    path: "/kvitteringer",
    section: "Økonomi",
    description: "Kvitteringer og lønnsslipper.",
    keywords: ["kvitteringer", "lønnsslipp", "payslip", "kvittering", "regning"],
  },
  {
    title: "Skatte-utregningen",
    path: "/skatte-utregningen",
    section: "Økonomi",
    description: "Skattekalkulator og prognoser.",
    keywords: ["skatt", "skattekalkulator", "selvangivelse", "trekk"],
  },
  // Borgen
  {
    title: "Oppussing Borgen",
    path: "/oppussing-borgen",
    section: "Borgen",
    description: "Oppussingsprosjekter for huset i Skien.",
    keywords: ["oppussing", "renovering", "borgen", "prosjekt", "hjem"],
  },
  {
    title: "Matvarer",
    path: "/matvarer",
    section: "Borgen",
    description: "Handleliste og favoritter (Kassalapp).",
    keywords: ["mat", "handleliste", "matvarer", "kassal", "kassalapp", "favoritter"],
  },
  {
    title: "Agenda",
    path: "/agenda",
    section: "Borgen",
    description: "Familieagenda, varsler og meldinger.",
    keywords: ["agenda", "kalender", "varsler", "meldinger", "familien"],
  },
  // Vakttårnet
  {
    title: "Vakttårnet",
    path: "/vakttarnet",
    section: "Vakttårnet",
    description: "Adminpanel — besøkende, statistikk, API, database, cron, AI-budsjett.",
    keywords: ["vakttårn", "admin", "besøkende", "statistikk", "api", "cron", "database", "logg", "ai"],
  },
  {
    title: "Push-varslinger",
    path: "/push-varslinger",
    section: "Vakttårnet",
    description: "Innstillinger for alle push-varsler.",
    keywords: ["push", "varslinger", "notifikasjoner", "varsler"],
  },
  {
    title: "Steintavlen",
    path: "/steintavle",
    section: "Vakttårnet",
    description: "Brodering / stein-tavle.",
    keywords: ["steintavle", "brodering", "pes"],
  },
  {
    title: "GoT-Saga",
    path: "/got-saga",
    section: "Vakttårnet",
    description: "Krøniken om huset.",
    keywords: ["got", "saga", "krønike", "historie"],
  },
  {
    title: "Decibel",
    path: "/decibel",
    section: "Vakttårnet",
    description: "Decibel-måler / lyd.",
    keywords: ["decibel", "lyd", "støy"],
  },
];

// Enkel scoring: navn/keyword-match veier mest, beskrivelse mindre.
export function searchIndex(query: string, limit = 10): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored = SEARCH_INDEX.map((entry) => {
    const title = entry.title.toLowerCase();
    const desc = entry.description.toLowerCase();
    const kws = entry.keywords.map((k) => k.toLowerCase());
    const section = entry.section.toLowerCase();

    let score = 0;
    for (const t of tokens) {
      if (title === t) score += 100;
      else if (title.startsWith(t)) score += 50;
      else if (title.includes(t)) score += 30;
      if (kws.some((k) => k === t)) score += 40;
      else if (kws.some((k) => k.startsWith(t))) score += 20;
      else if (kws.some((k) => k.includes(t))) score += 10;
      if (section.includes(t)) score += 8;
      if (desc.includes(t)) score += 5;
    }
    return { entry, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);

  return scored;
}
