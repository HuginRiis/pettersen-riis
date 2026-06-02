import { createServerFn } from "@tanstack/react-start";
const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/server/api-call-log.server")> => import("@/server/api-call-log.server"))
  .client((): Promise<typeof import("@/server/api-call-log.server")> => Promise.resolve({} as unknown as typeof import("@/server/api-call-log.server")));
const { withApiLog } = await __load_api_call_log_server();
/**
 * Henter dagens spotpriser fra hvakosterstrommen.no (data fra Nord Pool).
 *
 * Adresser og soner:
 *  - Borgen: Nordre Lensmannsveg 17, Skien → NO2 (Sør-Norge)
 *  - Hytta:  Øvre Bjerkesetvegen 222, Lyngdal i Numedal → NO1 (Øst-Norge)
 *
 * API: https://www.hvakosterstrommen.no/strompris-api
 *   /api/v1/prices/YYYY/MM-DD_<ZONE>.json
 *
 * Returnerer pris i NOK/kWh ekskl. og inkl. mva.
 */

const VAT_RATE = 1.25; // 25% mva på strøm i Sør-Norge (NO1, NO2, NO5)

export type SpotZone = "NO1" | "NO2" | "NO3" | "NO4" | "NO5";

export type SpotPriceHour = {
  start: string;
  priceExclVat: number;
  priceInclVat: number;
};

export type SpotPriceZoneData = {
  zone: SpotZone;
  today: SpotPriceHour[];
  priceNow: number | null;
  priceAvg: number | null;
  priceMin: number | null;
  priceMax: number | null;
};

export type SpotPriceResult =
  | { ok: false; error: string }
  | {
      ok: true;
      fetchedAt: string;
      /** Pris-data per sone (NO1 for hytta, NO2 for borgen). */
      zones: Partial<Record<SpotZone, SpotPriceZoneData>>;
    };

type RawHour = {
  NOK_per_kWh: number;
  EUR_per_kWh: number;
  EXR: number;
  time_start: string;
  time_end: string;
};

function todayPath(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}-${day}`;
}

async function fetchZone(zone: SpotZone): Promise<SpotPriceZoneData | null> {
  const url = `https://www.hvakosterstrommen.no/api/v1/prices/${todayPath()}_${zone}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "house-pettersen-riis/1.0 (lovable)" },
  });
  if (!res.ok) return null;
  const raw = (await res.json()) as RawHour[];

  const today: SpotPriceHour[] = raw.map((h) => ({
    start: h.time_start,
    priceExclVat: Math.round(h.NOK_per_kWh * 10000) / 10000,
    priceInclVat: Math.round(h.NOK_per_kWh * VAT_RATE * 10000) / 10000,
  }));

  const now = new Date();
  const currentHour = today.find((h) => {
    const start = new Date(h.start);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return now >= start && now < end;
  });

  const prices = today.map((h) => h.priceInclVat);
  const priceAvg =
    prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const priceMin = prices.length > 0 ? Math.min(...prices) : null;
  const priceMax = prices.length > 0 ? Math.max(...prices) : null;

  return {
    zone,
    today,
    priceNow: currentHour?.priceInclVat ?? null,
    priceAvg: priceAvg != null ? Math.round(priceAvg * 10000) / 10000 : null,
    priceMin,
    priceMax,
  };
}

export const getSpotPrices = createServerFn({ method: "GET" }).handler(
  withApiLog("spot", "getSpotPrices", async (): Promise<SpotPriceResult> => {
    try {
      const wanted: SpotZone[] = ["NO1", "NO2"];
      const results = await Promise.all(wanted.map((z) => fetchZone(z)));
      const zones: Partial<Record<SpotZone, SpotPriceZoneData>> = {};
      results.forEach((r, i) => {
        if (r) zones[wanted[i]] = r;
      });
      if (Object.keys(zones).length === 0) {
        return { ok: false, error: "Ingen spotpris-data tilgjengelig" };
      }
      return {
        ok: true,
        fetchedAt: new Date().toISOString(),
        zones,
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }),
);
