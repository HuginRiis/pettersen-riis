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

export async function fetchAirQualityPanelData(lat: number, lon: number): Promise<AqPanelData> {
  const hit = await readCacheOnly<AqPanelData>(aqKey(lat, lon));
  if (hit) return hit.value;
  throw new Error(NOT_WARM_ERR);
}

export async function fetchUvCloudPanelData(lat: number, lon: number): Promise<UvCloudData> {
  const hit = await readCacheOnly<UvCloudData>(uvKey(lat, lon));
  if (hit) return hit.value;
  throw new Error(NOT_WARM_ERR);
}

export async function fetchOpenMeteoPollenData(lat: number, lon: number): Promise<OpenMeteoPollenData> {
  const hit = await readCacheOnly<OpenMeteoPollenData>(pollenKey(lat, lon));
  if (hit) return hit.value;
  throw new Error(NOT_WARM_ERR);
}

// ---------------------------------------------------------------------------
// Warm-funksjoner: KUN kalt fra cron (api/public/hooks/open-meteo-warm).
// Disse gjør de faktiske Open-Meteo-kallene og fyller cachen.
// ---------------------------------------------------------------------------

async function warmOpenMeteoCore(lat: number, lon: number): Promise<OpenMeteoCoreData> {
  const key = coreKey(lat, lon);
  return withCache<OpenMeteoCoreData>(key, async () => {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=${CORE_HOURLY_FIELDS}&current=${CURRENT_FIELDS}` +
      `&timezone=Europe%2FOslo&forecast_days=4`;
    const res = await fetchWithBackoff("open-meteo", "open-meteo:core", url);
    if (!res) {
      const stale = getCached<OpenMeteoCoreData>(key);
      if (stale) return stale;
      throw new Error("Open-Meteo core er pauset eller i 429-backoff");
    }
    if (!res.ok) throw new Error(`Open-Meteo core ${res.status}`);
    const j = (await res.json()) as OpenMeteoCoreData;
    const core = { hourly: j.hourly, current: j.current };
    await Promise.all([
      setCached<AqPanelData>(aqKey(lat, lon), {
        hourly: pickFields(core.hourly, HOURLY_FIELDS.split(",")),
        current: core.current,
      }),
      setCached<OpenMeteoPollenData>(pollenKey(lat, lon), {
        hourly: pickFields(core.hourly, POLLEN_FIELDS.split(",")),
      }),
    ]);
    return core;
  });
}

export async function warmAirQualityPanel(lat: number, lon: number): Promise<void> {
  await warmOpenMeteoCore(lat, lon);
}

export async function warmUvCloudPanel(lat: number, lon: number): Promise<void> {
  const key = uvKey(lat, lon);
  await withCache<UvCloudData>(key, async () => {
    const core = await warmOpenMeteoCore(lat, lon);
    const fcUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=cloud_cover&timezone=Europe%2FOslo&forecast_days=3`;
    const fcRes = await fetchWithBackoff("open-meteo", "open-meteo:forecast-cloud", fcUrl);
    const aqHourly = pickFields(core.hourly, ["uv_index", "uv_index_clear_sky"]);
    let fcHourly: UvCloudData["fc"]["hourly"] = { time: [], cloud_cover: [] } as any;
    if (fcRes && fcRes.ok) {
      const fc = (await fcRes.json()) as { hourly: UvCloudData["fc"]["hourly"] };
      fcHourly = fc.hourly;
    } else {
      console.warn(
        `[air-quality-fetch] forecast (cloud_cover) utilgjengelig (${fcRes?.status ?? "backoff"}), warmer UV uten skydekke`,
      );
    }
    return { aq: { hourly: aqHourly }, fc: { hourly: fcHourly } };
  });
}

export async function warmOpenMeteoPollen(lat: number, lon: number): Promise<void> {
  await warmOpenMeteoCore(lat, lon);
}
