import { createServerFn } from "@tanstack/react-start";

/**
 * Henter aktive farevarsler fra Met.no for Telemark-området.
 * Cacher i 15 minutter på server (Worker-instans).
 */

export type TelemarkAlert = {
  id: string;
  event: string; // "gale", "rain", "snow", "ice", "forestFire", ...
  eventAwarenessName: string | null; // norsk navn, f.eks "Kuling", "Kraftig regn"
  severity: string | null; // "Minor" | "Moderate" | "Severe" | "Extreme"
  riskMatrixColor: string | null; // "Yellow" | "Orange" | "Red"
  area: string | null;
  description: string | null;
  instruction: string | null;
  consequences: string | null;
  start: string | null;
  end: string | null;
};

const COUNTY_TELEMARK = "40"; // Telemark fylke (fra 2024)
const COUNTY_VESTFOLD_TELEMARK = "38"; // gammelt fylkesnummer, fortsatt brukt av enkelte varsler
const TELEMARK_KEYWORDS = [
  "telemark",
  "skien",
  "porsgrunn",
  "notodden",
  "bamble",
  "kragerø",
  "drangedal",
  "siljan",
  "nome",
  "midt-telemark",
  "tinn",
  "hjartdal",
  "seljord",
  "kviteseid",
  "tokke",
  "vinje",
  "fyresdal",
  "nissedal",
  "rjukan",
  "bø",
  "grenland",
];

type CacheEntry = { ts: number; data: TelemarkAlert[] };
let cache: CacheEntry | null = null;
const TTL_MS = 15 * 60 * 1000;

async function fetchTelemarkAlerts(): Promise<TelemarkAlert[]> {
  const res = await fetch("https://api.met.no/weatherapi/metalerts/2.0/current.json", {
    headers: {
      "User-Agent": "House-RiisPettersen/1.0 (https://arne.riis.cc)",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Met.no metalerts feilet: ${res.status}`);
  }
  const data = (await res.json()) as {
    features?: Array<{
      properties?: {
        id?: string;
        event?: string;
        eventAwarenessName?: string;
        severity?: string;
        riskMatrixColor?: string;
        area?: string;
        description?: string;
        instruction?: string;
        consequences?: string;
        county?: string[];
      };
      when?: { interval?: string[] };
    }>;
  };

  const features = data.features ?? [];
  const filtered: TelemarkAlert[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const counties = Array.isArray(p.county) ? p.county : [];
    const text = `${p.area ?? ""} ${p.description ?? ""}`.toLowerCase();
    const matchesCounty =
      counties.includes(COUNTY_TELEMARK) || counties.includes(COUNTY_VESTFOLD_TELEMARK);
    const matchesKeyword = TELEMARK_KEYWORDS.some((k) => text.includes(k));
    if (!matchesCounty && !matchesKeyword) continue;

    const interval = f.when?.interval ?? [];
    filtered.push({
      id: p.id ?? Math.random().toString(36).slice(2),
      event: p.event ?? "unknown",
      eventAwarenessName: p.eventAwarenessName ?? null,
      severity: p.severity ?? null,
      riskMatrixColor: p.riskMatrixColor ?? null,
      area: p.area ?? null,
      description: p.description ?? null,
      instruction: p.instruction ?? null,
      consequences: p.consequences ?? null,
      start: interval[0] ?? null,
      end: interval[1] ?? null,
    });
  }

  // Sorter: Red > Orange > Yellow > resten
  const colorRank: Record<string, number> = { Red: 0, Orange: 1, Yellow: 2 };
  filtered.sort(
    (a, b) =>
      (colorRank[a.riskMatrixColor ?? ""] ?? 9) - (colorRank[b.riskMatrixColor ?? ""] ?? 9),
  );
  return filtered;
}

export const getTelemarkAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return { alerts: cache.data, fetchedAt: cache.ts, cached: true };
  }
  try {
    const data = await fetchTelemarkAlerts();
    cache = { ts: now, data };
    return { alerts: data, fetchedAt: now, cached: false };
  } catch (err) {
    console.error("Telemark alerts fetch failed:", err);
    if (cache) {
      return { alerts: cache.data, fetchedAt: cache.ts, cached: true, stale: true };
    }
    return { alerts: [], fetchedAt: now, cached: false, error: String(err) };
  }
});
