// Server-side fetch for AirQualityPanel + UvCloudPanel.
// Bruker loggedFetch slik at kallene havner i api_call_log med samme
// kreditering ("air-quality") som push-prosessorene.

import { loggedFetch } from "./api-call-log.server";

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
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY_FIELDS}&current=${CURRENT_FIELDS}` +
    `&timezone=Europe%2FOslo&forecast_days=2`;
  const res = await loggedFetch("air-quality", "open-meteo:panel", url);
  if (!res.ok) throw new Error(`Open-Meteo air-quality ${res.status}`);
  const j = await res.json();
  return { hourly: j.hourly, current: j.current };
}

export async function fetchUvCloudPanelData(lat: number, lon: number) {
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
}
