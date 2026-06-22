// Server-side fetch for AirQualityPanel + UvCloudPanel.
//
// VIKTIG: Disse panel-leserne er CACHE-ONLY. De gjør ALDRI nye kall mot
// Open-Meteo når en bruker åpner/refresher siden. Cachen holdes varm av
// cron-jobben i src/routes/api/public/hooks/open-meteo-warm.ts som kjører
// hvert 30. minutt for alle lokasjoner med aktive air-quality/UV-push.

import { loggedFetch } from "./api-call-log.server";
import { readCacheOnly, withCache, fetchWithBackoff, getCached, setCached } from "./open-meteo-cache.server";

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

const POLLEN_FIELDS = [
  "alder_pollen",
  "birch_pollen",
  "grass_pollen",
  "mugwort_pollen",
  "olive_pollen",
  "ragweed_pollen",
].join(",");

const CORE_HOURLY_FIELDS = `${HOURLY_FIELDS},${POLLEN_FIELDS}`;

export type AqPanelData = { hourly: any; current: any };
export type UvCloudData = {
  aq: { hourly: any };
  fc: { hourly: any };
};
export type OpenMeteoPollenData = { hourly: any };
type OpenMeteoCoreData = { hourly: any; current: any };

const NOT_WARM_ERR = "Cache er ikke fylt enda — neste oppdatering kommer fra cron-jobben";
const CACHE_TTL_MS = 15 * 60 * 1000;

// Paid Open-Meteo API. Når OPEN_METEO_API_KEY er satt bruker vi
// customer-*.open-meteo.com med apikey-param (egen kvote, ingen IP-rate-limit).
function aqApiBase(): string {
  return process.env.OPEN_METEO_API_KEY
    ? "https://customer-air-quality-api.open-meteo.com"
    : "https://air-quality-api.open-meteo.com";
}
function apiKeyParam(): string {
  const k = process.env.OPEN_METEO_API_KEY;
  return k ? `&apikey=${encodeURIComponent(k)}` : "";
}

function aqKey(lat: number, lon: number) {
  return `aq:${lat.toFixed(3)},${lon.toFixed(3)}`;
}
function uvKey(lat: number, lon: number) {
  return `uvcloud:${lat.toFixed(3)},${lon.toFixed(3)}`;
}
function pollenKey(lat: number, lon: number) {
  return `pollen:${lat.toFixed(3)},${lon.toFixed(3)}`;
}
function coreKey(lat: number, lon: number) {
  return `core:${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function pickFields(source: any, fields: string[]): any {
  const out: any = {};
  if (source?.time !== undefined) out.time = source.time;
  for (const f of fields) {
    if (source?.[f] !== undefined) out[f] = source[f];
  }
  return out;
}

/** Når ble cachen sist fylt av cron-jobben (expiresAt - TTL). */
function cachedAtISO(expiresAt: number): string {
  return new Date(expiresAt - CACHE_TTL_MS).toISOString();
}

export async function fetchAirQualityPanelData(lat: number, lon: number): Promise<AqPanelData & { cachedAt: string }> {
  const hit = await readCacheOnly<AqPanelData>(aqKey(lat, lon));
  if (hit) return { ...hit.value, cachedAt: cachedAtISO(hit.expiresAt) };
  // On-demand warm når brukeren søker opp et nytt sted som cron ikke kjenner.
  await warmAirQualityPanel(lat, lon);
  const hit2 = await readCacheOnly<AqPanelData>(aqKey(lat, lon));
  if (hit2) return { ...hit2.value, cachedAt: cachedAtISO(hit2.expiresAt) };
  throw new Error(NOT_WARM_ERR);
}

export async function fetchUvCloudPanelData(lat: number, lon: number): Promise<UvCloudData & { cachedAt: string }> {
  const hit = await readCacheOnly<UvCloudData>(uvKey(lat, lon));
  if (hit) return { ...hit.value, cachedAt: cachedAtISO(hit.expiresAt) };
  await warmUvCloudPanel(lat, lon);
  const hit2 = await readCacheOnly<UvCloudData>(uvKey(lat, lon));
  if (hit2) return { ...hit2.value, cachedAt: cachedAtISO(hit2.expiresAt) };
  throw new Error(NOT_WARM_ERR);
}

export async function fetchOpenMeteoPollenData(lat: number, lon: number): Promise<OpenMeteoPollenData & { cachedAt: string }> {
  const hit = await readCacheOnly<OpenMeteoPollenData>(pollenKey(lat, lon));
  if (hit) return { ...hit.value, cachedAt: cachedAtISO(hit.expiresAt) };
  await warmOpenMeteoPollen(lat, lon);
  const hit2 = await readCacheOnly<OpenMeteoPollenData>(pollenKey(lat, lon));
  if (hit2) return { ...hit2.value, cachedAt: cachedAtISO(hit2.expiresAt) };
  throw new Error(NOT_WARM_ERR);
}

// ---------------------------------------------------------------------------
// Warm-funksjoner: KUN kalt fra cron (api/public/hooks/open-meteo-warm).
// Disse gjør de faktiske Open-Meteo-kallene og fyller cachen.
// ---------------------------------------------------------------------------

/**
 * Ett enkelt Open-Meteo-kall for FLERE lokasjoner samtidig (multi-coord).
 * Drastisk lavere risiko for 429 enn N separate kall — vi treffer API-et
 * én gang per cron-tikk i stedet for én per lokasjon.
 * Seeder per-lokasjon-cachen slik at etterfølgende warmOpenMeteoCore(lat,lon)
 * blir cache-hit uten nye API-kall.
 */
export async function warmOpenMeteoCoreMulti(
  locs: Array<{ lat: number; lon: number }>,
): Promise<void> {
  if (locs.length === 0) return;
  const lats = locs.map((l) => l.lat).join(",");
  const lons = locs.map((l) => l.lon).join(",");
  const url =
    `${aqApiBase()}/v1/air-quality?latitude=${lats}&longitude=${lons}` +
    `&hourly=${CORE_HOURLY_FIELDS}&current=${CURRENT_FIELDS}` +
    `&timezone=Europe%2FOslo&forecast_days=4${apiKeyParam()}`;
  const res = await fetchWithBackoff("open-meteo", "open-meteo:core", url);
  if (!res) throw new Error("Open-Meteo core er pauset eller i 429-backoff");
  if (!res.ok) throw new Error(`Open-Meteo core ${res.status}`);
  const body = await res.json();
  // Multi-coord returnerer en array; single-coord returnerer et objekt.
  const arr: any[] = Array.isArray(body) ? body : [body];
  await Promise.all(
    locs.map(async (loc, i) => {
      const item = arr[i];
      if (!item || !item.hourly) return;
      const value: OpenMeteoCoreData = { hourly: item.hourly, current: item.current };
      await setCached<OpenMeteoCoreData>(coreKey(loc.lat, loc.lon), value);
    }),
  );
}

async function warmOpenMeteoCore(lat: number, lon: number): Promise<OpenMeteoCoreData> {
  const key = coreKey(lat, lon);
  return withCache<OpenMeteoCoreData>(key, async () => {
    const url =
      `${aqApiBase()}/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=${CORE_HOURLY_FIELDS}&current=${CURRENT_FIELDS}` +
      `&timezone=Europe%2FOslo&forecast_days=4${apiKeyParam()}`;
    const res = await fetchWithBackoff("open-meteo", "open-meteo:core", url);
    if (!res) {
      const stale = getCached<OpenMeteoCoreData>(key);
      if (stale) return stale;
      throw new Error("Open-Meteo core er pauset eller i 429-backoff");
    }
    if (!res.ok) throw new Error(`Open-Meteo core ${res.status}`);
    const j = (await res.json()) as OpenMeteoCoreData;
    return { hourly: j.hourly, current: j.current };
  });
}

// Standard UV-skydempingsformel (samme prinsipp som yr/MET):
//   UV = UV_clear * (1 - 0.75 * (cloud/100)^3.4)
// Open-Meteo air-quality sitt uv_index demper for hardt og gir ofte
// urealistisk lave verdier (f.eks. 1.1 når reell UV er ~3). Vi regner
// derfor UV på nytt fra uv_index_clear_sky + MET sitt skydekke.
function uvAttenuated(clear: number, cloudPct: number | null | undefined): number {
  if (typeof clear !== "number" || !isFinite(clear)) return clear;
  if (typeof cloudPct !== "number" || !isFinite(cloudPct)) return clear;
  const c = Math.max(0, Math.min(100, cloudPct)) / 100;
  return clear * (1 - 0.75 * Math.pow(c, 3.4));
}

function buildCloudMap(fc: { time: string[]; cloud_cover: number[] }): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < fc.time.length; i++) {
    m.set(fc.time[i].slice(0, 13), fc.cloud_cover[i]);
  }
  return m;
}

function applyUvCorrection(hourly: any, current: any, cloudMap: Map<string, number>) {
  const times: string[] = hourly?.time ?? [];
  const clear: number[] = hourly?.uv_index_clear_sky ?? [];
  if (times.length && clear.length) {
    hourly.uv_index = times.map((t: string, i: number) => {
      const cloud = cloudMap.get(t.slice(0, 13));
      return uvAttenuated(clear[i], cloud ?? null);
    });
  }
  if (current && typeof current.uv_index_clear_sky === "number") {
    const key = String(current.time ?? "").slice(0, 13);
    const cloud = cloudMap.get(key);
    current.uv_index = uvAttenuated(current.uv_index_clear_sky, cloud ?? null);
  }
}

// Skydekke fra Open-Meteo forecast API — all data på luftkvalitet/UV-panelene
// kommer dermed fra Open-Meteo (ingen MET-avhengighet for UV-beregning).
async function fetchOpenMeteoCloudHourly(
  lat: number,
  lon: number,
): Promise<{ time: string[]; cloud_cover: number[]; precipitation: number[]; weather_code: number[] }> {
  const base = process.env.OPEN_METEO_API_KEY
    ? "https://customer-api.open-meteo.com"
    : "https://api.open-meteo.com";
  const url =
    `${base}/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=cloud_cover,precipitation,weather_code&timezone=Europe%2FOslo&forecast_days=4${apiKeyParam()}`;
  const res = await fetchWithBackoff("open-meteo", "open-meteo:cloud", url);
  if (!res || !res.ok) return { time: [], cloud_cover: [], precipitation: [], weather_code: [] };
  const json = (await res.json()) as {
    hourly?: { time?: string[]; cloud_cover?: number[]; precipitation?: number[]; weather_code?: number[] };
  };
  return {
    time: json.hourly?.time ?? [],
    cloud_cover: json.hourly?.cloud_cover ?? [],
    precipitation: json.hourly?.precipitation ?? [],
    weather_code: json.hourly?.weather_code ?? [],
  };
}

export async function warmAirQualityPanel(lat: number, lon: number): Promise<void> {
  let core: OpenMeteoCoreData;
  try {
    core = await warmOpenMeteoCore(lat, lon);
  } catch (err) {
    const [aqHit, pollenHit] = await Promise.all([
      readCacheOnly<AqPanelData>(aqKey(lat, lon)),
      readCacheOnly<OpenMeteoPollenData>(pollenKey(lat, lon)),
    ]);
    if (aqHit || pollenHit) {
      console.warn("[open-meteo warm] core feilet, beholder forrige cache:", String((err as any)?.message ?? err));
      return;
    }
    throw err;
  }
  const fc = await fetchOpenMeteoCloudHourly(lat, lon).catch(() => ({ time: [], cloud_cover: [], precipitation: [], weather_code: [] }));
  const cloudMap = buildCloudMap(fc);
  const hourly = pickFields(core.hourly, HOURLY_FIELDS.split(","));
  const current = { ...core.current };
  applyUvCorrection(hourly, current, cloudMap);
  await Promise.all([
    setCached<AqPanelData>(aqKey(lat, lon), { hourly, current }),
    setCached<OpenMeteoPollenData>(pollenKey(lat, lon), {
      hourly: pickFields(core.hourly, POLLEN_FIELDS.split(",")),
    }),
  ]);
}

export async function warmUvCloudPanel(lat: number, lon: number): Promise<void> {
  const key = uvKey(lat, lon);
  await withCache<UvCloudData>(key, async () => {
    const core = await warmOpenMeteoCore(lat, lon);
    const aqHourly = pickFields(core.hourly, ["uv_index", "uv_index_clear_sky"]);
    const fcHourly = await fetchOpenMeteoCloudHourly(lat, lon).catch(() => ({ time: [], cloud_cover: [], precipitation: [], weather_code: [] }));
    const cloudMap = buildCloudMap(fcHourly);
    applyUvCorrection(aqHourly, null, cloudMap);
    return { aq: { hourly: aqHourly }, fc: { hourly: fcHourly } };
  });
}

export async function warmOpenMeteoPollen(lat: number, lon: number): Promise<void> {
  const core = await warmOpenMeteoCore(lat, lon);
  await setCached<OpenMeteoPollenData>(pollenKey(lat, lon), {
    hourly: pickFields(core.hourly, POLLEN_FIELDS.split(",")),
  });
}
