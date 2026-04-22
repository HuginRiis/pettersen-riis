import { createServerFn } from "@tanstack/react-start";

/**
 * Henter dagens spotpriser fra hvakosterstrommen.no (data fra Nord Pool).
 * Begge adressene (Nordre Lensmannsveg 17, Skien & Øvre Bjørkesetvegen 222, Bø)
 * ligger i prisområde NO2 (Sør-Norge).
 *
 * API: https://www.hvakosterstrommen.no/strompris-api
 *   /api/v1/prices/YYYY/MM-DD_NO2.json
 *
 * Returnerer pris i NOK/kWh ekskl. mva og avgifter.
 */

const ZONE = "NO2";
const VAT_RATE = 1.25; // 25% mva — adresser i Sør-Norge har full mva på strøm

export type SpotPriceHour = {
  /** ISO 8601 timestamp for timens START (lokal tid Oslo) */
  start: string;
  /** Pris ekskl. mva, NOK per kWh */
  priceExclVat: number;
  /** Pris inkl. mva, NOK per kWh */
  priceInclVat: number;
};

export type SpotPriceResult =
  | { ok: false; error: string }
  | {
      ok: true;
      zone: string;
      fetchedAt: string;
      /** Timesprisene i dag */
      today: SpotPriceHour[];
      /** Pris akkurat nå (inkl. mva) i NOK/kWh */
      priceNow: number | null;
      /** Snittpris i dag (inkl. mva) */
      priceAvg: number | null;
      priceMin: number | null;
      priceMax: number | null;
    };

type RawHour = {
  NOK_per_kWh: number;
  EUR_per_kWh: number;
  EXR: number;
  time_start: string; // ISO med tz
  time_end: string;
};

function todayPath(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}-${day}`;
}

export const getSpotPrices = createServerFn({ method: "GET" }).handler(
  async (): Promise<SpotPriceResult> => {
    try {
      const url = `https://www.hvakosterstrommen.no/api/v1/prices/${todayPath()}_${ZONE}.json`;
      const res = await fetch(url, {
        headers: { "User-Agent": "house-pettersen-riis/1.0 (lovable)" },
      });
      if (!res.ok) {
        return { ok: false, error: `Spotpris-API ga ${res.status}` };
      }
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
        ok: true,
        zone: ZONE,
        fetchedAt: new Date().toISOString(),
        today,
        priceNow: currentHour?.priceInclVat ?? null,
        priceAvg: priceAvg != null ? Math.round(priceAvg * 10000) / 10000 : null,
        priceMin,
        priceMax,
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
);
