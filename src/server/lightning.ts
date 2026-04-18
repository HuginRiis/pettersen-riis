import { createServerFn } from "@tanstack/react-start";

export type LightningStrike = {
  /** ISO timestamp */
  time: string;
  lat: number;
  lon: number;
  /** Peak current in kA (signed) */
  current: number;
  /** Distance in km from center */
  distanceKm: number;
};

export type LightningResult =
  | { ok: false; error: string }
  | {
      ok: true;
      center: { lat: number; lon: number };
      radiusKm: number;
      strikes: LightningStrike[];
      fetchedAt: string;
    };

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Met.no lightning API — siste ~60 min lynnedslag i Norge.
 * Returnerer plain text, en linje per nedslag i UALF-format.
 * Felt-indeks (de viktigste):
 *   0  version
 *   1  year
 *   2  month
 *   3  day
 *   4  hour
 *   5  min
 *   6  sec
 *   7  nanosec
 *   8  lat
 *   9  lon
 *   10 peak current (kA, signed)
 */
async function fetchMetLightning(): Promise<LightningStrike[]> {
  const url = "https://api.met.no/weatherapi/lightning/2.0/?";
  const res = await fetch(url, {
    headers: {
      // Met.no krever en identifiserende User-Agent
      "User-Agent": "house-riis-pettersen/1.0 (https://riis.cc)",
      Accept: "text/plain",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Met.no lyn-API feilet (${res.status}): ${text.slice(0, 120)}`);
  }
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const strikes: Omit<LightningStrike, "distanceKm">[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) continue;
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    const hour = Number(parts[4]);
    const min = Number(parts[5]);
    const sec = Number(parts[6]);
    const lat = Number(parts[8]);
    const lon = Number(parts[9]);
    const current = Number(parts[10]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const dt = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
    strikes.push({
      time: dt.toISOString(),
      lat,
      lon,
      current,
      // distance fylles inn av kallende kode
      ...({} as { distanceKm: number }),
    });
  }
  return strikes as LightningStrike[];
}

export const getLightningNearTollnes = createServerFn({ method: "GET" }).handler(
  async (): Promise<LightningResult> => {
    const center = { lat: 59.1789, lon: 9.5732 }; // Tollnes
    const radiusKm = 150;
    try {
      const all = await fetchMetLightning();
      const within: LightningStrike[] = [];
      for (const s of all) {
        const d = haversineKm(center.lat, center.lon, s.lat, s.lon);
        if (d <= radiusKm) {
          within.push({ ...s, distanceKm: d });
        }
      }
      within.sort((a, b) => (a.time < b.time ? 1 : -1));
      return {
        ok: true,
        center,
        radiusKm,
        strikes: within,
        fetchedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil" };
    }
  },
);
