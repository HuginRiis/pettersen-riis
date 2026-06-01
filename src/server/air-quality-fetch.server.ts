// Server-side fetch for AirQualityPanel + UvCloudPanel.
// Bruker loggedFetch slik at kallene havner i api_call_log med samme
// kreditering ("air-quality") som push-prosessorene.
//
// Open-Meteo air-quality API har strenge rate limits (429 ved hyppige kall),
// så vi cacher i 30 minutter pr. (lat,lon). Alle samtidige kall deduplikeres
// via in-flight promise. Cachen lever i Worker-instansen — én fetch pr.
// instans pr. 30 min er nok til at API-loggen viser et regelmessig mønster.

import { loggedFetch } from "./api-call-log.server";

const TTL_MS = 30 * 60 * 1000; // 30 minutter

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

async function withCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const value = await loader();
      cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    } catch (e) {
      // Serve stale-on-error hvis vi har noe — bedre enn å vise 429 til brukeren
      if (hit) return hit.value;
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

const HOURLY_FIELDS = [
  "pm10",
  "pm2_5",
  "carbon_monoxide",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "dust",
  "uv_index",
  "uv_index_clear_sky",
  "european_aqi",
].join(",");

const CURRENT_FIELDS = [
  "european_aqi",
  "us_aqi",
  "pm10",
  "pm2_5",
  "carbon_monoxide",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "dust",
  "uv_index",
  "uv_index_clear_sky",
].join(",");

export async function fetchAirQualityPanelData(lat: number, lon: number) {
  const key = `aq:${lat.toFixed(3)},${lon.toFixed(3)}`;
  return withCache(key, async () => {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=${HOURLY_FIELDS}&current=${CURRENT_FIELDS}` +
      `&timezone=Europe%2FOslo&forecast_days=2`;
    const res = await loggedFetch("air-quality", "open-meteo:panel", url);
    if (!res.ok) throw new Error(`Open-Meteo air-quality ${res.status}`);
    const j = await res.json();
    return { hourly: j.hourly, current: j.current };
  });
}

export async function fetchUvCloudPanelData(lat: number, lon: number) {
  const key = `uvcloud:${lat.toFixed(3)},${lon.toFixed(3)}`;
  return withCache(key, async () => {
    const aqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=uv_index,uv_index_clear_sky&timezone=Europe%2FOslo&forecast_days=3`;
    const fcUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=cloud_cover&timezone=Europe%2FOslo&forecast_days=3`;
    const [aqRes, fcRes] = await Promise.all([
      loggedFetch("air-quality", "open-meteo:uv-cloud:aq", aqUrl),
      loggedFetch("air-quality", "open-meteo:uv-cloud:forecast", fcUrl),
    ]);
    if (!aqRes.ok || !fcRes.ok) {
      throw new Error(`Open-Meteo UV/cloud ${aqRes.status}/${fcRes.status}`);
    }
    const aq = await aqRes.json();
    const fc = await fcRes.json();
    return {
      aq: { hourly: aq.hourly },
      fc: { hourly: fc.hourly },
    };
  });
}
