// Server-side fetch + cache of historical air quality + weather for the
// luftkvalitet dashboard. Uses Open-Meteo Air Quality Archive +
// ERA5/Archive weather. Data is stored hourly in public.air_quality_history
// keyed by `location_key`.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loggedFetch } from "./api-call-log.server";

export type HistoryRow = {
  ts: string;
  pm10: number | null;
  pm25: number | null;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
  european_aqi: number | null;
  temperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  wind_speed: number | null;
};

const AQ_HOURLY = [
  "pm10",
  "pm2_5",
  "carbon_monoxide",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "european_aqi",
].join(",");

const WX_HOURLY = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "wind_speed_10m",
].join(",");

function aqBase() {
  return process.env.OPEN_METEO_API_KEY
    ? "https://customer-air-quality-api.open-meteo.com"
    : "https://air-quality-api.open-meteo.com";
}

function wxBase() {
  return process.env.OPEN_METEO_API_KEY
    ? "https://customer-archive-api.open-meteo.com"
    : "https://archive-api.open-meteo.com";
}

function apiKeyParam() {
  const k = process.env.OPEN_METEO_API_KEY;
  return k ? `&apikey=${encodeURIComponent(k)}` : "";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

async function fetchAqRange(
  lat: number,
  lon: number,
  start: string,
  end: string,
): Promise<any> {
  const url =
    `${aqBase()}/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=${AQ_HOURLY}&timezone=Europe%2FOslo` +
    `&start_date=${start}&end_date=${end}${apiKeyParam()}`;
  const res = await loggedFetch("air-quality", "air-quality:archive", url);
  if (!res.ok) throw new Error(`AQ archive ${res.status}`);
  return res.json();
}

async function fetchWxRange(
  lat: number,
  lon: number,
  start: string,
  end: string,
): Promise<any> {
  const url =
    `${wxBase()}/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&hourly=${WX_HOURLY}&timezone=Europe%2FOslo` +
    `&start_date=${start}&end_date=${end}${apiKeyParam()}`;
  const res = await loggedFetch("open-meteo", "open-meteo:archive", url);
  if (!res.ok) throw new Error(`WX archive ${res.status}`);
  return res.json();
}

/** Merge AQ + WX hourly arrays by time index. */
function buildRows(aq: any, wx: any): Omit<HistoryRow, never>[] {
  const aqH = aq?.hourly ?? {};
  const wxH = wx?.hourly ?? {};
  const times: string[] = aqH.time ?? [];
  const wxTimes: string[] = wxH.time ?? [];
  const wxIdx = new Map<string, number>();
  wxTimes.forEach((t, i) => wxIdx.set(t, i));

  return times.map((t, i) => {
    const wi = wxIdx.get(t);
    return {
      ts: new Date(t).toISOString(),
      pm10: num(aqH.pm10?.[i]),
      pm25: num(aqH.pm2_5?.[i]),
      no2: num(aqH.nitrogen_dioxide?.[i]),
      o3: num(aqH.ozone?.[i]),
      so2: num(aqH.sulphur_dioxide?.[i]),
      co: num(aqH.carbon_monoxide?.[i]),
      european_aqi: num(aqH.european_aqi?.[i]),
      temperature: wi != null ? num(wxH.temperature_2m?.[wi]) : null,
      humidity: wi != null ? num(wxH.relative_humidity_2m?.[wi]) : null,
      precipitation: wi != null ? num(wxH.precipitation?.[wi]) : null,
      wind_speed: wi != null ? num(wxH.wind_speed_10m?.[wi]) : null,
    };
  });
}

async function upsertRows(locationKey: string, rows: HistoryRow[]) {
  if (rows.length === 0) return 0;
  // Chunk to avoid huge payloads
  const CHUNK = 1000;
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({
      location_key: locationKey,
      ...r,
    }));
    const { error } = await supabaseAdmin
      .from("air_quality_history" as any)
      .upsert(chunk as any, { onConflict: "location_key,ts" });
    if (error) throw new Error(error.message);
    total += chunk.length;
  }
  return total;
}

/** Backfill a date range (inclusive). End date defaults to yesterday. */
export async function backfillHistory(
  locationKey: string,
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<number> {
  const [aq, wx] = await Promise.all([
    fetchAqRange(lat, lon, startDate, endDate),
    fetchWxRange(lat, lon, startDate, endDate).catch(() => ({ hourly: {} })),
  ]);
  const rows = buildRows(aq, wx);
  return upsertRows(locationKey, rows as HistoryRow[]);
}

/**
 * Ensure we have history for the last `years` years. On first call this
 * backfills the full range; subsequent calls only fetch missing tail.
 */
export async function ensureHistory(
  locationKey: string,
  lat: number,
  lon: number,
  years: number,
): Promise<{ backfilled: number; latest: string | null }> {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400_000);
  const endDate = isoDate(yesterday);

  // Find latest existing ts
  const { data: latestRow } = await supabaseAdmin
    .from("air_quality_history" as any)
    .select("ts")
    .eq("location_key", locationKey)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  const desiredStart = new Date(today);
  desiredStart.setUTCFullYear(desiredStart.getUTCFullYear() - years);
  const desiredStartIso = isoDate(desiredStart);

  let startDate: string;
  if (!latestRow) {
    startDate = desiredStartIso;
  } else {
    const latestDate = new Date((latestRow as any).ts);
    const nextDay = new Date(latestDate.getTime() + 86400_000);
    startDate = isoDate(nextDay);
    if (startDate > endDate) return { backfilled: 0, latest: (latestRow as any).ts };
  }

  // If full backfill needed, chunk by year to keep responses smaller
  const startD = new Date(startDate);
  const endD = new Date(endDate);
  let total = 0;
  let cursor = startD;
  while (cursor <= endD) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCFullYear(chunkEnd.getUTCFullYear() + 1);
    if (chunkEnd > endD) chunkEnd.setTime(endD.getTime());
    total += await backfillHistory(
      locationKey,
      lat,
      lon,
      isoDate(cursor),
      isoDate(chunkEnd),
    );
    cursor = new Date(chunkEnd.getTime() + 86400_000);
  }

  return { backfilled: total, latest: endDate };
}

/** Fetch rows from DB within a window (UTC ISO strings). */
export async function getHistoryRange(
  locationKey: string,
  startIso: string,
  endIso: string,
): Promise<HistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from("air_quality_history" as any)
    .select("ts,pm10,pm25,no2,o3,so2,co,european_aqi,temperature,humidity,precipitation,wind_speed")
    .eq("location_key", locationKey)
    .gte("ts", startIso)
    .lte("ts", endIso)
    .order("ts", { ascending: true })
    .limit(60000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((r) => ({
    ts: String(r.ts),
    pm10: num(r.pm10),
    pm25: num(r.pm25),
    no2: num(r.no2),
    o3: num(r.o3),
    so2: num(r.so2),
    co: num(r.co),
    european_aqi: num(r.european_aqi),
    temperature: num(r.temperature),
    humidity: num(r.humidity),
    precipitation: num(r.precipitation),
    wind_speed: num(r.wind_speed),
  }));
}
