import { createServerFn } from "@tanstack/react-start";
import { getHomeySnapshot, type HomeyDeviceSnapshot } from "./homey";

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
    costToday?: number;
    costYesterday?: number;
    costThisMonth?: number;
    costLastMonth?: number;
    costThisYear?: number;
    energyToday?: number; // kWh
    energyYesterday?: number;
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
const ADDRESS_HYTTA = "Øvre Bjørkesetvegen 222";

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
        value: c.value,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const num = (id: string): number | undefined => {
    const v = device.capabilities[id]?.value;
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  return {
    matchedDeviceName: device.name,
    found: true,
    capabilities: caps,
    highlights: buildHighlights(num),
  };
}

const FALLBACK_RATE = 0.5; // kr/kWh — brukes når Power-by-the-Hour ikke har egne kostnader

function buildHighlights(
  num: (id: string) => number | undefined,
): PbthHomeData["highlights"] {
  const energyToday = num("meter_kwh_this_day") ?? num("meter_consumption_today");
  const energyYesterday = num("meter_kwh_yesterday") ?? num("meter_consumption_yesterday");
  const energyThisMonth = num("meter_kwh_this_month") ?? num("meter_consumption_this_month");
  const energyLastMonth = num("meter_kwh_last_month") ?? num("meter_consumption_last_month");
  const energyThisYear = num("meter_kwh_this_year") ?? num("meter_consumption_this_year");

  const priceNow = num("meter_price_incl_vat") ?? num("meter_price_now");

  const derive = (kwh?: number) =>
    kwh != null ? Math.round(kwh * FALLBACK_RATE * 100) / 100 : undefined;

  return {
    priceNow,
    consumptionNow: num("meter_consumption") ?? num("meter_power") ?? num("measure_power"),
    costToday: num("meter_cost_today") ?? derive(energyToday),
    costYesterday: num("meter_cost_yesterday") ?? derive(energyYesterday),
    costThisMonth: num("meter_cost_this_month") ?? derive(energyThisMonth),
    costLastMonth: num("meter_cost_last_month") ?? derive(energyLastMonth),
    costThisYear: num("meter_cost_this_year") ?? derive(energyThisYear),
    energyToday,
    energyYesterday,
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
