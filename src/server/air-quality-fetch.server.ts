// Server-side fetch for AirQualityPanel + UvCloudPanel.
// Bruker felles cache + 429-backoff (open-meteo-cache.server) slik at
// både panel og push-cron deler kvote og slipper å hamre Open-Meteo.

import { fetchWithBackoff, withCache, getCached } from "./open-meteo-cache.server";

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

type AqPanelData = { hourly: any; current: any };
type UvCloudData = {
  aq: { hourly: any };
  fc: { hourly: any };
};

export async function fetchAirQualityPanelData(lat: number, lon: number): Promise<AqPanelData> {
  const key = `aq:${lat.toFixed(3)},${lon.toFixed(3)}`;
  return withCache<AqPanelData>(key, async () => {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=${HOURLY_FIELDS}&current=${CURRENT_FIELDS}` +
      `&timezone=Europe%2FOslo&forecast_days=2`;
    const res = await fetchWithBackoff("air-quality", "open-meteo:panel", url);
    if (!res) {
      const stale = getCached<AqPanelData>(key);
      if (stale) return stale;
      throw new Error("Open-Meteo air-quality rate-limited (429) – prøv igjen om noen minutter");
    }
    if (!res.ok) throw new Error(`Open-Meteo air-quality ${res.status}`);
    const j = (await res.json()) as AqPanelData;
    return { hourly: j.hourly, current: j.current };
  });
}

export async function fetchUvCloudPanelData(lat: number, lon: number): Promise<UvCloudData> {
  const key = `uvcloud:${lat.toFixed(3)},${lon.toFixed(3)}`;
  return withCache<UvCloudData>(key, async () => {
    const aqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=uv_index,uv_index_clear_sky&timezone=Europe%2FOslo&forecast_days=3`;
    const fcUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=cloud_cover&timezone=Europe%2FOslo&forecast_days=3`;
    const [aqRes, fcRes] = await Promise.all([
      fetchWithBackoff("air-quality", "open-meteo:uv-cloud:aq", aqUrl),
      fetchWithBackoff("air-quality", "open-meteo:uv-cloud:forecast", fcUrl),
    ]);
    if (!aqRes || !fcRes || !aqRes.ok || !fcRes.ok) {
      const stale = getCached<UvCloudData>(key);
      if (stale) return stale;
      throw new Error(
        `Open-Meteo UV/cloud ${aqRes?.status ?? "backoff"}/${fcRes?.status ?? "backoff"}`,
      );
    }
    const aq = (await aqRes.json()) as { hourly: UvCloudData["aq"]["hourly"] };
    const fc = (await fcRes.json()) as { hourly: UvCloudData["fc"]["hourly"] };
    return { aq: { hourly: aq.hourly }, fc: { hourly: fc.hourly } };
  });
}
