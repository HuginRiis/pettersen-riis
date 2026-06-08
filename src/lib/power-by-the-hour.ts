import { createServerFn } from "@tanstack/react-start";
import { getHomeySnapshot, type HomeyDeviceSnapshot } from "@/lib/homey.functions";

export type PbthCapability = {
  id: string;
  label: string;
  value: number | string | boolean | null;
  unit?: string;
};

export type PbthHomeData = {
  matchedDeviceName: string | null;
  found: boolean;
  /** Alle numeriske capabilities, sortert etter id. */
  capabilities: PbthCapability[];
  /** Utvalgte snarveier — undefined hvis ikke tilstede. */
  highlights: {
    priceNow?: number;
    consumptionNow?: number; // W
    /** Topp-effekt registrert i dag (W). */
    peakPowerToday?: number;
    /** Snitt-effekt over siste 7 dager (W). */
    avgPowerWeek?: number;
    /** Snitt-effekt over inneværende måned (W). */
    avgPowerThisMonth?: number;
    /** Topp-effekt inneværende måned (W). */
    peakPowerThisMonth?: number;
    costToday?: number;
    costYesterday?: number;
    costThisMonth?: number;
    costLastMonth?: number;
    costThisYear?: number;
    energyToday?: number; // kWh
    energyYesterday?: number;
    energyThisWeek?: number;
    energyLastWeek?: number;
    energyThisMonth?: number;
    energyLastMonth?: number;
    energyThisYear?: number;
    priceAvgToday?: number;
    priceMinToday?: number;
    priceMaxToday?: number;
    /** Estimert kr/kWh brukt for å regne kostnader fra kWh (fallback). */
    derivedRate?: number;
  };
};

export type PbthResult =
  | { ok: false; error: string; needsConnect?: boolean }
  | {
      ok: true;
      borgen: PbthHomeData;
      hytta: PbthHomeData;
      fetchedAt: string;
    };

const ADDRESS_BORGEN = "Pbth Nordre Lensmannsveg 17";
const ADDRESS_HYTTA = "Pbth Øvre Bjørkesetvegen 222";

// Power-by-the-Hour-app brukernavn på enheter inneholder typisk adressen.
// Vi matcher fuzzy: alle tokens (lowercase) må være med i enhetsnavnet.
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function nameContainsAll(name: string, tokens: string[]): boolean {
  const n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return tokens.every((t) => n.includes(t));
}

function findDevice(
  devices: HomeyDeviceSnapshot[],
  address: string,
): HomeyDeviceSnapshot | null {
  const tokens = tokenize(address);
  // Plukk gjerne strict match først (hele adressen forekommer)
  const exact = devices.find((d) =>
    d.name?.toLowerCase().includes(address.toLowerCase()),
  );
  if (exact) return exact;
  return devices.find((d) => nameContainsAll(d.name ?? "", tokens)) ?? null;
}

// Pene labels for kjente Power-by-the-Hour-capabilities.
const CAP_LABELS: Record<string, { label: string; unit?: string }> = {
  meter_price_excl_vat: { label: "Pris uten mva", unit: "kr/kWh" },
  meter_price_incl_vat: { label: "Pris med mva", unit: "kr/kWh" },
  meter_price_now: { label: "Pris nå", unit: "kr/kWh" },
  meter_price_avg: { label: "Snittpris", unit: "kr/kWh" },
  meter_price_lowest: { label: "Laveste pris", unit: "kr/kWh" },
  meter_price_highest: { label: "Høyeste pris", unit: "kr/kWh" },
  meter_price_h0: { label: "Pris time 0", unit: "kr/kWh" },
  meter_consumption: { label: "Forbruk nå", unit: "W" },
  meter_power: { label: "Effekt nå", unit: "W" },
  measure_power: { label: "Effekt", unit: "W" },
  meter_cost_today: { label: "Kostnad i dag", unit: "kr" },
  meter_cost_yesterday: { label: "Kostnad i går", unit: "kr" },
  meter_cost_this_month: { label: "Kostnad denne måneden", unit: "kr" },
  meter_cost_last_month: { label: "Kostnad forrige måned", unit: "kr" },
  meter_cost_this_year: { label: "Kostnad i år", unit: "kr" },
  meter_cost_last_year: { label: "Kostnad i fjor", unit: "kr" },
  meter_cost_last_hour: { label: "Kostnad siste time", unit: "kr" },
  meter_consumption_today: { label: "Forbruk i dag", unit: "kWh" },
  meter_consumption_yesterday: { label: "Forbruk i går", unit: "kWh" },
  meter_consumption_this_month: { label: "Forbruk denne måneden", unit: "kWh" },
  meter_consumption_last_month: { label: "Forbruk forrige måned", unit: "kWh" },
  meter_consumption_this_year: { label: "Forbruk i år", unit: "kWh" },
  meter_consumption_last_year: { label: "Forbruk i fjor", unit: "kWh" },
  meter_consumption_last_hour: { label: "Forbruk siste time", unit: "kWh" },
  meter_consumption_hour: { label: "Forbruk denne timen", unit: "kWh" },
  meter_kwh_this_day: { label: "kWh i dag", unit: "kWh" },
  meter_kwh_yesterday: { label: "kWh i går", unit: "kWh" },
  meter_kwh_this_month: { label: "kWh denne måneden", unit: "kWh" },
  meter_kwh_last_month: { label: "kWh forrige måned", unit: "kWh" },
  meter_kwh_this_year: { label: "kWh i år", unit: "kWh" },
  meter_kwh_last_year: { label: "kWh i fjor", unit: "kWh" },
  meter_kwh_last_hour: { label: "kWh siste time", unit: "kWh" },
  meter_kwh_this_hour: { label: "kWh denne timen", unit: "kWh" },
  meter_power_max_this_month: { label: "Toppeffekt denne måneden", unit: "kW" },
  meter_power_avg_this_month: { label: "Snitteffekt denne måneden", unit: "kW" },
  meter_grid_capacity: { label: "Nettleietrinn", unit: "kr" },
  meter_grid_capacity_level: { label: "Nettleienivå" },
  meter_grid_consumption: { label: "Nettleieforbruk", unit: "kr" },
  meter_grid_cost: { label: "Nettleiekostnad", unit: "kr" },
};

function labelFor(id: string): { label: string; unit?: string } {
  if (CAP_LABELS[id]) return CAP_LABELS[id];
  // Auto-pene labels for ukjente caps
  const pretty = id
    .replace(/^meter_/, "")
    .replace(/^measure_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  let unit: string | undefined;
  if (id.includes("price") || id.includes("cost")) unit = "kr";
  else if (id.includes("consumption") || id.includes("energy")) unit = "kWh";
  else if (id.includes("power")) unit = "W";
  return { label: pretty, unit };
}

function buildHomeData(device: HomeyDeviceSnapshot | null): PbthHomeData {
  if (!device) {
    return {
      matchedDeviceName: null,
      found: false,
      capabilities: [],
      highlights: {},
    };
  }

  const caps: PbthCapability[] = Object.entries(device.capabilities)
    .map(([id, c]) => {
      const meta = labelFor(id);
      return {
        id,
        label: meta.label,
        unit: meta.unit,
        value: (c as { value: number | string | boolean | null }).value,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const num = (id: string): number | undefined => {
    const v = device.capabilities[id]?.value;
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  // Defensive lookup: prøv flere id-er, returner første gyldige tall.
  const firstNum = (...ids: string[]): number | undefined => {
    for (const id of ids) {
      const v = num(id);
      if (v != null) return v;
    }
    return undefined;
  };

  // Fallback: scan etter capability-id som matcher gitt regex.
  const matchNum = (re: RegExp): number | undefined => {
    for (const id of Object.keys(device.capabilities)) {
      if (re.test(id)) {
        const v = num(id);
        if (v != null) return v;
      }
    }
    return undefined;
  };

  return {
    matchedDeviceName: device.name,
    found: true,
    capabilities: caps,
    highlights: buildHighlights(num, firstNum, matchNum),
  };
}

const FALLBACK_RATE = 0.5; // kr/kWh — brukes når Power-by-the-Hour ikke har egne kostnader

function buildHighlights(
  num: (id: string) => number | undefined,
  firstNum: (...ids: string[]) => number | undefined,
  matchNum: (re: RegExp) => number | undefined,
): PbthHomeData["highlights"] {
  const energyToday = num("meter_kwh_this_day") ?? num("meter_consumption_today");
  const energyYesterday = num("meter_kwh_yesterday") ?? num("meter_consumption_yesterday");
  const energyThisWeek = firstNum(
    "meter_kwh_this_week",
    "meter_consumption_this_week",
  );
  const energyLastWeek = firstNum(
    "meter_kwh_last_week",
    "meter_consumption_last_week",
  );
  const energyThisMonth = num("meter_kwh_this_month") ?? num("meter_consumption_this_month");
  const energyLastMonth = num("meter_kwh_last_month") ?? num("meter_consumption_last_month");
  const energyThisYear = num("meter_kwh_this_year") ?? num("meter_consumption_this_year");

  const priceNow = num("meter_price_incl_vat") ?? num("meter_price_now");

  // Topp-effekt i dag — PBTH bruker forskjellige navn. Verdi kan komme i W eller kW;
  // vi normaliserer til W ved å sjekke størrelse.
  const rawPeakToday = firstNum(
    "meter_power_max_this_day",
    "meter_power_max_today",
    "meter_power_peak_today",
    "meter_power_peak_this_day",
    "meter_power.peak",
  ) ?? matchNum(/^meter_power.*(max|peak).*(today|this_day|day)$/i);
  const peakPowerToday =
    rawPeakToday != null ? (rawPeakToday > 200 ? rawPeakToday : rawPeakToday * 1000) : undefined;

  const rawPeakMonth = firstNum(
    "meter_power_max_this_month",
    "meter_power_peak_this_month",
  ) ?? matchNum(/^meter_power.*(max|peak).*this_month$/i);
  const peakPowerThisMonth =
    rawPeakMonth != null ? (rawPeakMonth > 200 ? rawPeakMonth : rawPeakMonth * 1000) : undefined;

  const rawAvgMonth = firstNum(
    "meter_power_avg_this_month",
  ) ?? matchNum(/^meter_power.*avg.*this_month$/i);
  const avgPowerThisMonth =
    rawAvgMonth != null ? (rawAvgMonth > 200 ? rawAvgMonth : rawAvgMonth * 1000) : undefined;

  // Snitt-effekt siste uke: prøv egen capability, ellers regn ut fra kWh.
  // NB: bruk forrige hele uke når den finnes, ellers regn snitt over faktisk
  // forløpte timer av denne uka (mandag 00:00 → nå) — ikke 168 timer, for da
  // blir tallet sterkt undervurdert tidlig i uka.
  const rawAvgWeek = firstNum(
    "meter_power_avg_this_week",
    "meter_power_avg_last_week",
  ) ?? matchNum(/^meter_power.*avg.*week$/i);
  let avgPowerWeek: number | undefined =
    rawAvgWeek != null ? (rawAvgWeek > 200 ? rawAvgWeek : rawAvgWeek * 1000) : undefined;
  if (avgPowerWeek == null && energyLastWeek != null && energyLastWeek > 0) {
    avgPowerWeek = Math.round((energyLastWeek * 1000) / (7 * 24));
  } else if (avgPowerWeek == null && energyThisWeek != null && energyThisWeek > 0) {
    const now = new Date();
    const dowMon = (now.getDay() + 6) % 7; // mandag=0
    const elapsedH = dowMon * 24 + now.getHours() + now.getMinutes() / 60;
    avgPowerWeek = Math.round((energyThisWeek * 1000) / Math.max(1, elapsedH));
  }

  const derive = (kwh?: number) =>
    kwh != null ? Math.round(kwh * FALLBACK_RATE * 100) / 100 : undefined;

  return {
    priceNow,
    consumptionNow: num("meter_consumption") ?? num("meter_power") ?? num("measure_power"),
    peakPowerToday,
    peakPowerThisMonth,
    avgPowerWeek,
    avgPowerThisMonth,
    costToday: num("meter_cost_today") ?? derive(energyToday),
    costYesterday: num("meter_cost_yesterday") ?? derive(energyYesterday),
    costThisMonth: num("meter_cost_this_month") ?? derive(energyThisMonth),
    costLastMonth: num("meter_cost_last_month") ?? derive(energyLastMonth),
    costThisYear: num("meter_cost_this_year") ?? derive(energyThisYear),
    energyToday,
    energyYesterday,
    energyThisWeek,
    energyLastWeek,
    energyThisMonth,
    energyLastMonth,
    energyThisYear,
    priceAvgToday: num("meter_price_avg"),
    priceMinToday: num("meter_price_lowest"),
    priceMaxToday: num("meter_price_highest"),
    derivedRate: FALLBACK_RATE,
  };
}

export const getPowerByTheHour = createServerFn({ method: "GET" }).handler(
  async (): Promise<PbthResult> => {
    const snap = await getHomeySnapshot();
    if (!snap.ok) {
      if ((snap as any).needsConnect) {
        return { ok: false, needsConnect: true, error: "Homey er ikke koblet til." };
      }
      return { ok: false, error: snap.error || "Klarte ikke hente Homey-data" };
    }

    const borgenDev = findDevice(snap.devices, ADDRESS_BORGEN);
    const hyttaDev = findDevice(snap.devices, ADDRESS_HYTTA);

    return {
      ok: true,
      borgen: buildHomeData(borgenDev),
      hytta: buildHomeData(hyttaDev),
      fetchedAt: new Date().toISOString(),
    };
  },
);
