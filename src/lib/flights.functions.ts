import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";

const __load_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/flights-push.server")> =>
    import("@/lib/flights-push.server"),
  )
  .client((): Promise<typeof import("@/lib/flights-push.server")> =>
    Promise.resolve({} as unknown as typeof import("@/lib/flights-push.server")),
  );

export type FlightLocationId = "tollnes" | "hytta";

export const FLIGHT_LOCATIONS: Record<
  FlightLocationId,
  { id: FlightLocationId; label: string; lat: number; lon: number; settingsKey: string }
> = {
  tollnes: {
    id: "tollnes",
    label: "Tollnes, Skien",
    lat: 59.1789,
    lon: 9.5732,
    settingsKey: "flight_push",
  },
  hytta: {
    id: "hytta",
    label: "Hytta, Flesberg",
    lat: 59.8733,
    lon: 9.4297,
    settingsKey: "flight_push_hytta",
  },
};

// Backwards-compat alias used andre steder i koden
export const TOLLNES = { lat: FLIGHT_LOCATIONS.tollnes.lat, lon: FLIGHT_LOCATIONS.tollnes.lon };
export const SEARCH_RADIUS_KM = 50;

export type Flight = {
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  longitude: number;
  latitude: number;
  baroAltitudeM: number | null;
  geoAltitudeM: number | null;
  onGround: boolean;
  velocityMs: number | null;
  trueTrack: number | null;
  verticalRateMs: number | null;
  squawk: string | null;
  // derived
  distanceKm: number;
  bearingDeg: number;
};

export type FlightsResult =
  | { ok: false; error: string }
  | { ok: true; flights: Flight[]; fetchedAt: string; source: string };

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const toDeg = (x: number) => (x * 180) / Math.PI;
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bboxFor(center: { lat: number; lon: number }) {
  const dLat = SEARCH_RADIUS_KM / 111;
  const dLon = SEARCH_RADIUS_KM / (111 * Math.cos((center.lat * Math.PI) / 180));
  return {
    lamin: center.lat - dLat,
    lamax: center.lat + dLat,
    lomin: center.lon - dLon,
    lomax: center.lon + dLon,
  };
}

async function fetchFromOpenSky(center: { lat: number; lon: number }): Promise<Flight[]> {
  const b = bboxFor(center);
  const url = `https://opensky-network.org/api/states/all?lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "house-riis-pettersen/1.0" },
  });
  if (!res.ok) throw new Error(`OpenSky ${res.status}`);
  const json = (await res.json()) as { states?: unknown[][] | null };
  const states = json.states ?? [];
  const out: Flight[] = [];
  for (const s of states) {
    const icao24 = s[0] as string | null;
    const lon = s[5] as number | null;
    const lat = s[6] as number | null;
    if (!icao24 || lon == null || lat == null) continue;
    const distanceKm = haversineKm(center, { lat, lon });
    if (distanceKm > SEARCH_RADIUS_KM) continue;
    out.push({
      icao24,
      callsign: ((s[1] as string | null) ?? "").trim() || null,
      originCountry: (s[2] as string | null) ?? null,
      longitude: lon,
      latitude: lat,
      baroAltitudeM: (s[7] as number | null) ?? null,
      onGround: (s[8] as boolean | null) ?? false,
      velocityMs: (s[9] as number | null) ?? null,
      trueTrack: (s[10] as number | null) ?? null,
      verticalRateMs: (s[11] as number | null) ?? null,
      geoAltitudeM: (s[13] as number | null) ?? null,
      squawk: (s[14] as string | null) ?? null,
      distanceKm,
      bearingDeg: bearingDeg(center, { lat, lon }),
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out;
}

async function fetchFromAdsbLol(center: { lat: number; lon: number }): Promise<Flight[]> {
  const radiusNm = Math.round(SEARCH_RADIUS_KM / 1.852);
  const url = `https://api.adsb.lol/v2/lat/${center.lat}/lon/${center.lon}/dist/${radiusNm}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "house-riis-pettersen/1.0" },
  });
  if (!res.ok) throw new Error(`adsb.lol ${res.status}`);
  const json = (await res.json()) as { ac?: any[] };
  const ac = json.ac ?? [];
  const out: Flight[] = [];
  for (const a of ac) {
    const lat = typeof a.lat === "number" ? a.lat : null;
    const lon = typeof a.lon === "number" ? a.lon : null;
    if (lat == null || lon == null) continue;
    const distanceKm = haversineKm(center, { lat, lon });
    if (distanceKm > SEARCH_RADIUS_KM) continue;
    const altFt = typeof a.alt_baro === "number" ? a.alt_baro : (typeof a.alt_geom === "number" ? a.alt_geom : null);
    const spdKt = typeof a.gs === "number" ? a.gs : null;
    out.push({
      icao24: String(a.hex ?? "").toLowerCase(),
      callsign: ((a.flight as string | undefined) ?? "").trim() || null,
      originCountry: (a.r as string | undefined) ?? null,
      longitude: lon,
      latitude: lat,
      baroAltitudeM: altFt != null ? Math.round(altFt * 0.3048) : null,
      geoAltitudeM: null,
      onGround: a.alt_baro === "ground",
      velocityMs: spdKt != null ? Math.round(spdKt * 0.514444) : null,
      trueTrack: typeof a.track === "number" ? a.track : null,
      verticalRateMs: typeof a.baro_rate === "number" ? Math.round((a.baro_rate / 60) * 0.3048) : null,
      squawk: (a.squawk as string | undefined) ?? null,
      distanceKm,
      bearingDeg: bearingDeg(center, { lat, lon }),
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out;
}

export const getNearbyFlights = createServerFn({ method: "GET" })
  .inputValidator((data: { location?: FlightLocationId } | undefined) => ({
    location: (data?.location ?? "tollnes") as FlightLocationId,
  }))
  .handler(async ({ data }): Promise<FlightsResult> => {
    const center = FLIGHT_LOCATIONS[data.location];
    try {
      const flights = await fetchFromOpenSky(center);
      return { ok: true, flights, fetchedAt: new Date().toISOString(), source: "opensky" };
    } catch (e1) {
      try {
        const flights = await fetchFromAdsbLol(center);
        return { ok: true, flights, fetchedAt: new Date().toISOString(), source: "adsb.lol" };
      } catch (e2: any) {
        return { ok: false, error: `OpenSky: ${(e1 as Error).message}. adsb.lol: ${e2?.message ?? "ukjent"}` };
      }
    }
  });

// ----- Push settings -----

export type FlightPushSettings = {
  enabled: boolean;
  recipient: string;
  maxDistanceKm: number;
  maxAltitudeM: number; // 0 = ingen grense
  cooldownMinutes: number;
};

const DEFAULT_SETTINGS: FlightPushSettings = {
  enabled: false,
  recipient: "Alle",
  maxDistanceKm: 25,
  maxAltitudeM: 5000,
  cooldownMinutes: 60,
};

export const getFlightPushSettings = createServerFn({ method: "GET" })
  .inputValidator((data: { location?: FlightLocationId } | undefined) => ({
    location: (data?.location ?? "tollnes") as FlightLocationId,
  }))
  .handler(async ({ data }): Promise<FlightPushSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = FLIGHT_LOCATIONS[data.location].settingsKey;
    const { data: row } = await supabaseAdmin
      .from("notification_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const v = (row?.value as Partial<FlightPushSettings> | null) ?? null;
    return { ...DEFAULT_SETTINGS, ...(v ?? {}) };
  });

export const saveFlightPushSettings = createServerFn({ method: "POST" })
  .inputValidator((data: { location?: FlightLocationId; settings: FlightPushSettings }) => ({
    location: (data.location ?? "tollnes") as FlightLocationId,
    settings: data.settings,
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = FLIGHT_LOCATIONS[data.location].settingsKey;
    await supabaseAdmin
      .from("notification_settings")
      .upsert(
        { key, value: data.settings as any, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    return { ok: true };
  });

export const sendFlightPushManual = createServerFn({ method: "POST" })
  .inputValidator((data: { icao24: string; recipient: string; location?: FlightLocationId }) => ({
    icao24: data.icao24,
    recipient: data.recipient,
    location: (data.location ?? "tollnes") as FlightLocationId,
  }))
  .handler(async ({ data }): Promise<{ sent: number; errors: number; message: string }> => {
    const mod = await __load_push_server();
    return mod.sendManualFlightPush(data.icao24, data.recipient, data.location);
  });
