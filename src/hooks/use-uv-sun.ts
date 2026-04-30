import { useEffect, useState } from "react";

export type UvHour = { time: string; uv: number };

export type UvSunData = {
  uvNow: number | null;
  uvMaxToday: number | null;
  uvMaxTimeToday: string | null;
  hours: UvHour[]; // next 24h
  sunrise: string | null; // ISO
  sunset: string | null; // ISO
  loading: boolean;
  error: string | null;
};

const cache = new Map<string, { ts: number; data: Omit<UvSunData, "loading" | "error"> }>();
const TTL = 15 * 60 * 1000; // 15 min

/**
 * Henter UV-indeks (fra MET locationforecast) + soloppgang/-nedgang (MET sunrise 3.0)
 * for et koordinatpunkt. Cacher per koordinat i 15 min.
 */
export function useUvSun(lat: number, lon: number): UvSunData {
  const [state, setState] = useState<UvSunData>({
    uvNow: null,
    uvMaxToday: null,
    uvMaxTimeToday: null,
    hours: [],
    sunrise: null,
    sunset: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const key = `${lat.toFixed(3)}|${lon.toFixed(3)}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < TTL) {
      setState({ ...cached.data, loading: false, error: null });
      return;
    }
    (async () => {
      try {
        setState((s) => ({ ...s, loading: true, error: null }));
        const today = new Date().toISOString().slice(0, 10);
        const [forecastRes, sunRes] = await Promise.all([
          fetch(
            `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`,
            { headers: { Accept: "application/json" } },
          ),
          fetch(
            `https://api.met.no/weatherapi/sunrise/3.0/sun?lat=${lat}&lon=${lon}&date=${today}&offset=+01:00`,
            { headers: { Accept: "application/json" } },
          ),
        ]);
        if (!forecastRes.ok) throw new Error("Kunne ikke hente UV");
        const fc = await forecastRes.json();
        const series: any[] = fc?.properties?.timeseries ?? [];
        const hours: UvHour[] = [];
        const todayKey = new Date().toISOString().slice(0, 10);
        let uvMaxToday = 0;
        let uvMaxTimeToday: string | null = null;
        for (const e of series.slice(0, 192)) {
          const uv = e?.data?.instant?.details?.ultraviolet_index_clear_sky;
          if (typeof uv !== "number") continue;
          hours.push({ time: e.time, uv });
          if (e.time.slice(0, 10) === todayKey && uv > uvMaxToday) {
            uvMaxToday = uv;
            uvMaxTimeToday = e.time;
          }
        }
        // Closest hour to "now" for current UV
        const now = Date.now();
        let uvNow: number | null = null;
        let bestDiff = Infinity;
        for (const h of hours.slice(0, 24)) {
          const diff = Math.abs(new Date(h.time).getTime() - now);
          if (diff < bestDiff) {
            bestDiff = diff;
            uvNow = h.uv;
          }
        }

        let sunrise: string | null = null;
        let sunset: string | null = null;
        if (sunRes.ok) {
          const sj = await sunRes.json();
          sunrise = sj?.properties?.sunrise?.time ?? null;
          sunset = sj?.properties?.sunset?.time ?? null;
        }

        const data = {
          uvNow,
          uvMaxToday: uvMaxToday > 0 ? uvMaxToday : null,
          uvMaxTimeToday,
          hours,
          sunrise,
          sunset,
        };
        cache.set(key, { ts: Date.now(), data });
        if (!cancelled) setState({ ...data, loading: false, error: null });
      } catch (e) {
        if (!cancelled)
          setState((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e.message : "Ukjent feil",
          }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return state;
}

export function uvLevel(uv: number): { label: string; color: string } {
  if (uv < 3) return { label: "Lav", color: "oklch(0.72 0.16 150)" };
  if (uv < 6) return { label: "Moderat", color: "oklch(0.78 0.16 95)" };
  if (uv < 8) return { label: "Høy", color: "oklch(0.72 0.18 55)" };
  if (uv < 11) return { label: "Veldig høy", color: "oklch(0.65 0.22 25)" };
  return { label: "Ekstrem", color: "oklch(0.55 0.25 320)" };
}
