import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// OpenSky Network — gratis, ingen API-nøkkel.
// Returnerer array av tilstander; vi mapper til vårt eget format.
// Doc: https://openskynetwork.github.io/opensky-api/rest.html

export type FlightState = {
  icao24: string;
  callsign: string | null;
  origin_country: string;
  time_position: number | null;
  last_contact: number;
  longitude: number | null;
  latitude: number | null;
  baro_altitude_m: number | null;
  on_ground: boolean;
  velocity_ms: number | null;
  true_track: number | null;
  vertical_rate_ms: number | null;
  geo_altitude_m: number | null;
  squawk: string | null;
  spi: boolean;
};

type CacheEntry = { at: number; value: FlightState[] };
let cache: CacheEntry | null = null;
const CACHE_MS = 25_000;

const bboxSchema = z.object({
  lamin: z.number().min(-90).max(90).optional(),
  lomin: z.number().min(-180).max(180).optional(),
  lamax: z.number().min(-90).max(90).optional(),
  lomax: z.number().min(-180).max(180).optional(),
});

// Norge-bbox som default
const NORWAY = { lamin: 57.5, lomin: 3.0, lamax: 71.6, lomax: 31.6 };

export const fetchFlightStates = createServerFn({ method: "GET" })
  .inputValidator((d) => bboxSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_MS) {
      return { states: cache.value, cachedAgeMs: now - cache.at, source: "opensky" as const };
    }
    const b = {
      lamin: data.lamin ?? NORWAY.lamin,
      lomin: data.lomin ?? NORWAY.lomin,
      lamax: data.lamax ?? NORWAY.lamax,
      lomax: data.lomax ?? NORWAY.lomax,
    };
    const url = `https://opensky-network.org/api/states/all?lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "borgen-flyradar/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        return { states: cache?.value ?? [], cachedAgeMs: 0, source: "opensky" as const, error: `OpenSky ${res.status}` };
      }
      const json = (await res.json()) as { states: unknown[][] | null };
      const arr = (json.states ?? []).map(toFlightState).filter((s) => s.latitude !== null && s.longitude !== null);
      cache = { at: now, value: arr };
      return { states: arr, cachedAgeMs: 0, source: "opensky" as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return { states: cache?.value ?? [], cachedAgeMs: cache ? now - cache.at : 0, source: "opensky" as const, error: msg };
    }
  });

function toFlightState(row: unknown[]): FlightState {
  return {
    icao24: String(row[0] ?? ""),
    callsign: row[1] ? String(row[1]).trim() : null,
    origin_country: String(row[2] ?? ""),
    time_position: typeof row[3] === "number" ? row[3] : null,
    last_contact: typeof row[4] === "number" ? row[4] : 0,
    longitude: typeof row[5] === "number" ? row[5] : null,
    latitude: typeof row[6] === "number" ? row[6] : null,
    baro_altitude_m: typeof row[7] === "number" ? row[7] : null,
    on_ground: Boolean(row[8]),
    velocity_ms: typeof row[9] === "number" ? row[9] : null,
    true_track: typeof row[10] === "number" ? row[10] : null,
    vertical_rate_ms: typeof row[11] === "number" ? row[11] : null,
    geo_altitude_m: typeof row[13] === "number" ? row[13] : null,
    squawk: row[14] ? String(row[14]) : null,
    spi: Boolean(row[15]),
  };
}

// -------- Alert prefs --------

export type FlightAlertPrefs = {
  id: string | null;
  airports: string[];
  notify_arrivals: boolean;
  notify_departures: boolean;
  radius_center_lat: number | null;
  radius_center_lon: number | null;
  radius_km: number;
  notify_radius: boolean;
  min_altitude_m: number;
};

const DEFAULT_PREFS: FlightAlertPrefs = {
  id: null,
  airports: [],
  notify_arrivals: true,
  notify_departures: true,
  radius_center_lat: null,
  radius_center_lon: null,
  radius_km: 25,
  notify_radius: false,
  min_altitude_m: 0,
};

export const getFlightAlertPrefs = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("flight_alert_prefs")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_PREFS;
  return {
    id: data.id,
    airports: (data.airports as string[]) ?? [],
    notify_arrivals: data.notify_arrivals,
    notify_departures: data.notify_departures,
    radius_center_lat: data.radius_center_lat != null ? Number(data.radius_center_lat) : null,
    radius_center_lon: data.radius_center_lon != null ? Number(data.radius_center_lon) : null,
    radius_km: data.radius_km,
    notify_radius: data.notify_radius,
    min_altitude_m: data.min_altitude_m,
  } satisfies FlightAlertPrefs;
});

const saveSchema = z.object({
  airports: z.array(z.string().min(1).max(8)).max(40),
  notify_arrivals: z.boolean(),
  notify_departures: z.boolean(),
  radius_center_lat: z.number().min(-90).max(90).nullable(),
  radius_center_lon: z.number().min(-180).max(180).nullable(),
  radius_km: z.number().int().min(1).max(500),
  notify_radius: z.boolean(),
  min_altitude_m: z.number().int().min(0).max(20000),
});

export const saveFlightAlertPrefs = createServerFn({ method: "POST" })
  .inputValidator((d) => saveSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("flight_alert_prefs")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("flight_alert_prefs")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: existing.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("flight_alert_prefs")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins.id };
  });
