// Husholdnings-sammensetning + referanseforbruk for en typisk norsk familie.
// Tall basert på SSB Forbruksundersøkelsen (par uten barn, ca-tall i NOK/år 2024).
// Skaleres etter OECD-modifisert ekvivalensvekt:
//   1.0 (første voksen) + 0.5 per ekstra voksen + 0.5 per barn over 18 + 0.3 per barn under 18.
// Referansebasen er for 2 voksne (= 1.5 enheter).

export type HouseholdConfig = {
  adults: number;        // antall voksne (>= 1)
  childrenU18: number;   // barn under 18
  childrenO18: number;   // barn over 18 (hjemmeboende)
};

export const HOUSEHOLD_KEY = "budsjett.household.v1";

export const DEFAULT_HOUSEHOLD: HouseholdConfig = {
  adults: 2,
  childrenU18: 0,
  childrenO18: 0,
};

export const loadHousehold = (): HouseholdConfig => {
  try {
    const raw = localStorage.getItem(HOUSEHOLD_KEY);
    if (!raw) return { ...DEFAULT_HOUSEHOLD };
    const parsed = JSON.parse(raw);
    return {
      adults: Math.max(1, Number(parsed.adults) || 2),
      childrenU18: Math.max(0, Number(parsed.childrenU18) || 0),
      childrenO18: Math.max(0, Number(parsed.childrenO18) || 0),
    };
  } catch {
    return { ...DEFAULT_HOUSEHOLD };
  }
};

export const saveHousehold = (h: HouseholdConfig) => {
  try {
    localStorage.setItem(HOUSEHOLD_KEY, JSON.stringify(h));
    window.dispatchEvent(new CustomEvent("household-changed"));
  } catch {
    /* ignore */
  }
};

export const householdUnits = (h: HouseholdConfig): number =>
  1 + 0.5 * Math.max(0, h.adults - 1) + 0.3 * h.childrenU18 + 0.5 * h.childrenO18;

const BASE_UNITS = householdUnits({ adults: 2, childrenU18: 0, childrenO18: 0 }); // 1.5

// Årlig referanseforbruk for 2 voksne (NOK/år)
export const REFERENCE_ANNUAL_BASE: Record<string, number> = {
  "Mat og dagligvarer": 78000,
  "Drivstoff": 18000,
  "Transport": 35000,
  "Restaurant og kafé": 22000,
  "Abonnementer": 8000,
  "Mobil": 7200,
  "Internett": 7200,
  "TV og strømming": 6000,
  "Klær og sko": 18000,
  "Helse og apotek": 10000,
  "Vedlikehold hus": 25000,
  "Bolig": 60000,
  "Husleie/Lån": 180000,
  "Lån og renter": 120000,
  "Strøm": 24000,
  "Kommunale avgifter": 18000,
  "Forsikring": 22000,
  "Fritid": 20000,
  "Ferie": 30000,
  "Sparing": 60000,
  "Penger til barn": 18000,
  "Hjem og hage": 18000,
  "Møbler og innbo": 14000,
  "Gaver": 9000,
  "Overføringer": 12000,
  "Kollekt og veldedighet": 4000,
  "Annet": 30000,
};

// Alias slik at lokale kategorinavn matcher referansenavn (case-insensitiv).
// Lengre/mer spesifikke nøkler bør komme før kortere – sjekkes i rekkefølge.
const CATEGORY_ALIASES: Array<[string, string]> = [
  ["dagligvare", "Mat og dagligvarer"],
  ["matvare", "Mat og dagligvarer"],
  ["mat", "Mat og dagligvarer"],
  ["bensin", "Drivstoff"],
  ["diesel", "Drivstoff"],
  ["drivstoff", "Drivstoff"],
  ["lading", "Drivstoff"],
  ["kollektiv", "Transport"],
  ["bil", "Transport"],
  ["transport", "Transport"],
  ["restaurant", "Restaurant og kafé"],
  ["kafé", "Restaurant og kafé"],
  ["kafe", "Restaurant og kafé"],
  ["takeaway", "Restaurant og kafé"],
  ["mobil", "Mobil"],
  ["telefon", "Mobil"],
  ["internett", "Internett"],
  ["bredbånd", "Internett"],
  ["fiber", "Internett"],
  ["tv", "TV og strømming"],
  ["strømmetjenester", "TV og strømming"],
  ["streaming", "TV og strømming"],
  ["netflix", "TV og strømming"],
  ["spotify", "TV og strømming"],
  ["abonnement", "Abonnementer"],
  ["klær", "Klær og sko"],
  ["sko", "Klær og sko"],
  ["apotek", "Helse og apotek"],
  ["lege", "Helse og apotek"],
  ["tannlege", "Helse og apotek"],
  ["helse", "Helse og apotek"],
  ["vedlikehold", "Vedlikehold hus"],
  ["oppussing", "Vedlikehold hus"],
  ["hus", "Vedlikehold hus"],
  ["husleie", "Husleie/Lån"],
  ["leie", "Husleie/Lån"],
  ["boliglån", "Lån og renter"],
  ["lån", "Lån og renter"],
  ["renter", "Lån og renter"],
  ["bolig", "Bolig"],
  ["strøm", "Strøm"],
  ["elektrisitet", "Strøm"],
  ["kommunal", "Kommunale avgifter"],
  ["renovasjon", "Kommunale avgifter"],
  ["vann og avløp", "Kommunale avgifter"],
  ["vann", "Kommunale avgifter"],
  ["eiendomsskatt", "Kommunale avgifter"],
  ["feieavgift", "Kommunale avgifter"],
  ["forsikring", "Forsikring"],
  ["trening", "Fritid"],
  ["hobby", "Fritid"],
  ["fritid", "Fritid"],
  ["hage", "Hjem og hage"],
  ["hjem og hage", "Hjem og hage"],
  ["møbler", "Møbler og innbo"],
  ["innbo", "Møbler og innbo"],
  ["interiør", "Møbler og innbo"],
  ["gave", "Gaver"],
  ["bursdag", "Gaver"],
  ["jule", "Gaver"],
  ["overføring", "Overføringer"],
  ["vipps", "Overføringer"],
  ["kollekt", "Kollekt og veldedighet"],
  ["veldedighet", "Kollekt og veldedighet"],
  ["donasjon", "Kollekt og veldedighet"],
  ["menighet", "Kollekt og veldedighet"],
  ["ferie", "Ferie"],
  ["reise", "Ferie"],
  ["sparing", "Sparing"],
  ["spar", "Sparing"],
  ["bsu", "Sparing"],
  ["fond", "Sparing"],
  ["barn", "Penger til barn"],
  ["lommepenger", "Penger til barn"],
  ["sfo", "Penger til barn"],
  ["barnehage", "Penger til barn"],
];

// Brukerstyrte overstyringer per kategorinavn (årlig NOK for husholdningsbasen 2 voksne)
export const REFERENCE_OVERRIDES_KEY = "budsjett.referenceOverrides.v1";

export type ReferenceOverrides = Record<string, number>;

export const loadReferenceOverrides = (): ReferenceOverrides => {
  try {
    const raw = localStorage.getItem(REFERENCE_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: ReferenceOverrides = {};
    Object.entries(parsed || {}).forEach(([k, v]) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
    });
    return out;
  } catch {
    return {};
  }
};

export const saveReferenceOverrides = (o: ReferenceOverrides) => {
  try {
    localStorage.setItem(REFERENCE_OVERRIDES_KEY, JSON.stringify(o));
    window.dispatchEvent(new CustomEvent("reference-overrides-changed"));
  } catch {
    /* ignore */
  }
};

export const clearReferenceOverrides = () => {
  try {
    localStorage.removeItem(REFERENCE_OVERRIDES_KEY);
    window.dispatchEvent(new CustomEvent("reference-overrides-changed"));
  } catch {
    /* ignore */
  }
};

export const referenceForCategory = (catName: string): number | null => {
  if (!catName) return null;
  const overrides = loadReferenceOverrides();
  if (overrides[catName] != null) return overrides[catName];
  const direct = REFERENCE_ANNUAL_BASE[catName];
  if (direct != null) return direct;
  const lower = catName.toLowerCase();
  for (const [key, target] of CATEGORY_ALIASES) {
    if (lower.includes(key)) return REFERENCE_ANNUAL_BASE[target] ?? null;
  }
  return null;
};

// Skaler årlig referanse for valgt husholdning
export const scaledAnnualReference = (catName: string, h: HouseholdConfig): number | null => {
  const base = referenceForCategory(catName);
  if (base == null) return null;
  const factor = householdUnits(h) / BASE_UNITS;
  return Math.round(base * factor);
};

// Hent referanse for en gitt periode: hele året, eller jan→måned (1..12) som YTD
export const referenceForPeriod = (
  catName: string,
  h: HouseholdConfig,
  monthsFromJan: number | null, // null = hele året; ellers 1..12
): number | null => {
  const annual = scaledAnnualReference(catName, h);
  if (annual == null) return null;
  if (monthsFromJan == null) return annual;
  const m = Math.max(1, Math.min(12, monthsFromJan));
  return Math.round((annual / 12) * m);
};
