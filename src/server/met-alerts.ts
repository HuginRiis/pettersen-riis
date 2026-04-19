import { createServerFn } from "@tanstack/react-start";

/**
 * Henter aktive farevarsler fra Met.no for Sør- og Østlandet.
 * Cacher i 15 minutter på server (Worker-instans).
 *
 * Dekker fylker: Oslo, Akershus, Østfold, Buskerud, Vestfold, Telemark,
 * Innlandet (sørlige deler), Agder, og delvis Rogaland (sørøst).
 */

export type TelemarkAlert = {
  id: string;
  event: string;
  eventAwarenessName: string | null;
  severity: string | null;
  riskMatrixColor: string | null;
  area: string | null;
  description: string | null;
  instruction: string | null;
  consequences: string | null;
  start: string | null;
  end: string | null;
};

// Fylkesnummer som dekker Sør- og Østlandet
// Nye fylker (2024) + gamle som fortsatt dukker opp i datasett
const SOR_OST_COUNTIES = new Set<string>([
  "03", // Oslo
  "30", // Viken (gammelt — Akershus/Buskerud/Østfold)
  "31", // Østfold
  "32", // Akershus
  "33", // Buskerud
  "34", // Innlandet
  "38", // Vestfold og Telemark (gammelt)
  "39", // Vestfold
  "40", // Telemark
  "42", // Agder
]);

const SOR_OST_KEYWORDS = [
  // Telemark
  "telemark", "skien", "porsgrunn", "notodden", "bamble", "kragerø",
  "drangedal", "siljan", "nome", "midt-telemark", "tinn", "hjartdal",
  "seljord", "kviteseid", "tokke", "vinje", "fyresdal", "nissedal",
  "rjukan", "bø", "grenland",
  // Vestfold
  "vestfold", "tønsberg", "sandefjord", "larvik", "horten", "holmestrand",
  // Oslo / Akershus / Østfold / Buskerud
  "oslo", "akershus", "østfold", "buskerud", "fredrikstad", "sarpsborg",
  "moss", "halden", "askim", "drammen", "kongsberg", "ringerike", "hønefoss",
  "asker", "bærum", "lillestrøm", "follo", "nordre follo", "ski",
  "hadeland", "hallingdal", "numedal",
  // Innlandet (sørlige deler)
  "hamar", "lillehammer", "gjøvik", "elverum", "kongsvinger",
  "hedmark", "oppland", "valdres", "gudbrandsdal",
  // Agder
  "agder", "kristiansand", "arendal", "grimstad", "mandal", "lillesand",
  "farsund", "flekkefjord", "setesdal",
  // Generelle regionnavn
  "østlandet", "sørlandet", "sør-norge", "sørøst-norge", "østafjells",
];

type CacheEntry = { ts: number; data: TelemarkAlert[] };
let cache: CacheEntry | null = null;
const TTL_MS = 15 * 60 * 1000;

async function fetchAlerts(): Promise<TelemarkAlert[]> {
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
    const matchesCounty = counties.some((c) => SOR_OST_COUNTIES.has(c));
    const matchesKeyword = SOR_OST_KEYWORDS.some((k) => text.includes(k));
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
    const data = await fetchAlerts();
    cache = { ts: now, data };
    return { alerts: data, fetchedAt: now, cached: false };
  } catch (err) {
    console.error("Sør-/Østlandet alerts fetch failed:", err);
    if (cache) {
      return { alerts: cache.data, fetchedAt: cache.ts, cached: true, stale: true };
    }
    return { alerts: [], fetchedAt: now, cached: false, error: String(err) };
  }
});
