import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";

const __load_push_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/flights-push.server")> =>
    import("@/lib/flights-push.server"),
  )
  .client((): Promise<typeof import("@/lib/flights-push.server")> =>
    Promise.resolve({} as unknown as typeof import("@/lib/flights-push.server")),
  );

const __load_api_call_log_server = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> =>
    import("@/lib/api-call-log.server"),
  )
  .client((): Promise<typeof import("@/lib/api-call-log.server")> =>
    Promise.resolve({} as unknown as typeof import("@/lib/api-call-log.server")),
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
    label: "Hytta, Lyngdal i Numedal",
    lat: 59.9543,
    lon: 9.4899,
    settingsKey: "flight_push_hytta",
  },
};

// Backwards-compat alias used andre steder i koden
export const TOLLNES = { lat: FLIGHT_LOCATIONS.tollnes.lat, lon: FLIGHT_LOCATIONS.tollnes.lon };
export const DEFAULT_SEARCH_RADIUS_KM = 50;
export const MAX_SEARCH_RADIUS_KM = 250;
/** @deprecated bruk innstillinger per lokasjon (searchRadiusKm) */
export const SEARCH_RADIUS_KM = DEFAULT_SEARCH_RADIUS_KM;

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
  registration: string | null;
  aircraftType: string | null;
  description: string | null;
  operator: string | null;
  category: string | null;
  emergency: string | null;
  // berikende metadata (best-effort)
  manufacturer: string | null;
  typeFull: string | null;
  ownerCountry: string | null;
  firstFlightDate: string | null; // ISO dato, første gang flydd
  built: string | null; // byggeår
  routeFromIcao: string | null;
  routeFromName: string | null;
  routeToIcao: string | null;
  routeToName: string | null;
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

function bboxFor(center: { lat: number; lon: number }, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
  return {
    lamin: center.lat - dLat,
    lamax: center.lat + dLat,
    lomin: center.lon - dLon,
    lomax: center.lon + dLon,
  };
}

async function fetchFromOpenSky(center: { lat: number; lon: number }, radiusKm: number): Promise<Flight[]> {
  const b = bboxFor(center, radiusKm);
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
    if (distanceKm > radiusKm) continue;
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
      registration: null,
      aircraftType: null,
      description: null,
      operator: null,
      category: (s[17] as string | null) ?? null,
      emergency: null,
      manufacturer: null,
      typeFull: null,
      ownerCountry: null,
      firstFlightDate: null,
      built: null,
      routeFromIcao: null,
      routeFromName: null,
      routeToIcao: null,
      routeToName: null,
      distanceKm,
      bearingDeg: bearingDeg(center, { lat, lon }),
    });

  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out;
}

async function fetchFromAdsbLol(center: { lat: number; lon: number }, radiusKm: number): Promise<Flight[]> {
  const radiusNm = Math.max(1, Math.round(radiusKm / 1.852));
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
    if (distanceKm > radiusKm) continue;
    const altFt = typeof a.alt_baro === "number" ? a.alt_baro : (typeof a.alt_geom === "number" ? a.alt_geom : null);
    const spdKt = typeof a.gs === "number" ? a.gs : null;
    out.push({
      icao24: String(a.hex ?? "").toLowerCase(),
      callsign: ((a.flight as string | undefined) ?? "").trim() || null,
      originCountry: null,
      longitude: lon,
      latitude: lat,
      baroAltitudeM: altFt != null ? Math.round(altFt * 0.3048) : null,
      geoAltitudeM: null,
      onGround: a.alt_baro === "ground",
      velocityMs: spdKt != null ? Math.round(spdKt * 0.514444) : null,
      trueTrack: typeof a.track === "number" ? a.track : null,
      verticalRateMs: typeof a.baro_rate === "number" ? Math.round((a.baro_rate / 60) * 0.3048) : null,
      squawk: (a.squawk as string | undefined) ?? null,
      registration: ((a.r as string | undefined) ?? "").trim() || null,
      aircraftType: ((a.t as string | undefined) ?? "").trim() || null,
      description: ((a.desc as string | undefined) ?? "").trim() || null,
      operator: ((a.ownOp as string | undefined) ?? (a.owner as string | undefined) ?? "").trim() || null,
      category: ((a.category as string | undefined) ?? "").trim() || null,
      emergency: ((a.emergency as string | undefined) ?? "").trim() || null,
      manufacturer: null,
      typeFull: null,
      ownerCountry: null,
      firstFlightDate: null,
      built: null,
      routeFromIcao: null,
      routeFromName: null,
      routeToIcao: null,
      routeToName: null,
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
    const { withApiLog } = await __load_api_call_log_server();
    return withApiLog("flights", `getNearbyFlights[${data.location}]`, async (): Promise<FlightsResult> => {
      const center = FLIGHT_LOCATIONS[data.location];
      // Les ut konfigurert synlig radius for denne lokasjonen (default 50 km)
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin
        .from("notification_settings")
        .select("value")
        .eq("key", FLIGHT_LOCATIONS[data.location].settingsKey)
        .maybeSingle();
      const raw = (row?.value as Partial<FlightPushSettings> | null)?.searchRadiusKm;
      const radiusKm = Math.min(
        MAX_SEARCH_RADIUS_KM,
        Math.max(1, typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_SEARCH_RADIUS_KM),
      );
      // Hent fra begge kilder parallelt og slå sammen — adsb.lol har rik metadata,
      // OpenSky fanger ofte små fly / GA som adsb.lol mangler (og motsatt).
      const [adsbRes, openskyRes] = await Promise.allSettled([
        fetchFromAdsbLol(center, radiusKm),
        fetchFromOpenSky(center, radiusKm),
      ]);
      const adsb = adsbRes.status === "fulfilled" ? adsbRes.value : [];
      const opensky = openskyRes.status === "fulfilled" ? openskyRes.value : [];

      if (adsb.length === 0 && opensky.length === 0) {
        const e1 = adsbRes.status === "rejected" ? (adsbRes.reason as Error)?.message ?? "ukjent" : "ingen treff";
        const e2 = openskyRes.status === "rejected" ? (openskyRes.reason as Error)?.message ?? "ukjent" : "ingen treff";
        if (adsbRes.status === "rejected" && openskyRes.status === "rejected") {
          return { ok: false, error: `adsb.lol: ${e1}. OpenSky: ${e2}` };
        }
      }

      // Slå sammen, foretrekk adsb.lol-record (rikere felter), men fyll inn manglende felter fra OpenSky.
      const byIcao = new Map<string, Flight>();
      for (const f of adsb) byIcao.set(f.icao24.toLowerCase(), f);
      for (const f of opensky) {
        const key = f.icao24.toLowerCase();
        const existing = byIcao.get(key);
        if (!existing) {
          byIcao.set(key, f);
        } else {
          // Fyll inn felter som mangler på adsb.lol-record (særlig originCountry)
          if (!existing.originCountry && f.originCountry) existing.originCountry = f.originCountry;
          if (existing.callsign == null && f.callsign) existing.callsign = f.callsign;
          if (existing.baroAltitudeM == null && f.baroAltitudeM != null) existing.baroAltitudeM = f.baroAltitudeM;
          if (existing.velocityMs == null && f.velocityMs != null) existing.velocityMs = f.velocityMs;
          if (existing.trueTrack == null && f.trueTrack != null) existing.trueTrack = f.trueTrack;
          if (existing.verticalRateMs == null && f.verticalRateMs != null) existing.verticalRateMs = f.verticalRateMs;
          if (!existing.squawk && f.squawk) existing.squawk = f.squawk;
        }
      }
      const flights = Array.from(byIcao.values()).sort((a, b) => a.distanceKm - b.distanceKm);

      // Berik fly med ekstra metadata fra hexdb.io og adsbdb.com (gratis, ingen nøkkel).
      // Tar med små fly (LN-…) som ofte bare dukker opp via OpenSky.
      const toEnrich = flights.slice(0, 15);
      if (toEnrich.length > 0) {
        await Promise.allSettled(
          toEnrich.map(async (f) => {
            // hexdb.io
            try {
              const r = await fetch(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(f.icao24)}`, {
                headers: { Accept: "application/json", "User-Agent": "house-riis-pettersen/1.0" },
                signal: AbortSignal.timeout(2500),
              });
              if (r.ok) {
                const j = (await r.json()) as {
                  Registration?: string;
                  ICAOTypeCode?: string;
                  Manufacturer?: string;
                  Type?: string;
                  RegisteredOwners?: string;
                };
                if (!f.registration && j.Registration) f.registration = j.Registration.trim();
                if (!f.aircraftType && j.ICAOTypeCode) f.aircraftType = j.ICAOTypeCode.trim();
                if (!f.manufacturer && j.Manufacturer) f.manufacturer = j.Manufacturer.trim();
                if (!f.typeFull && j.Type) f.typeFull = j.Type.trim();
                if (!f.description && (j.Manufacturer || j.Type)) {
                  f.description = [j.Manufacturer, j.Type].filter(Boolean).join(" ").trim() || null;
                }
                if (!f.operator && j.RegisteredOwners) f.operator = j.RegisteredOwners.trim();
              }
            } catch { /* best effort */ }
            // adsbdb.com — ofte rikere "type" + eierland
            try {
              const r = await fetch(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(f.icao24)}`, {
                headers: { Accept: "application/json", "User-Agent": "house-riis-pettersen/1.0" },
                signal: AbortSignal.timeout(2500),
              });
              if (r.ok) {
                const j = (await r.json()) as {
                  response?: {
                    aircraft?: {
                      type?: string;
                      icao_type?: string;
                      manufacturer?: string;
                      registration?: string;
                      registered_owner?: string;
                      registered_owner_country_name?: string;
                    };
                  };
                };
                const a = j.response?.aircraft;
                if (a) {
                  if (!f.registration && a.registration) f.registration = a.registration.trim();
                  if (!f.aircraftType && a.icao_type) f.aircraftType = a.icao_type.trim();
                  if (!f.manufacturer && a.manufacturer) f.manufacturer = a.manufacturer.trim();
                  if (!f.typeFull && a.type) f.typeFull = a.type.trim();
                  if (!f.operator && a.registered_owner) f.operator = a.registered_owner.trim();
                  if (!f.ownerCountry && a.registered_owner_country_name) f.ownerCountry = a.registered_owner_country_name.trim();
                }
              }
            } catch { /* best effort */ }
            // OpenSky aircraft metadata — første flight-dato + byggeår
            try {
              const r = await fetch(`https://opensky-network.org/api/metadata/aircraft/icao/${encodeURIComponent(f.icao24)}`, {
                headers: { Accept: "application/json", "User-Agent": "house-riis-pettersen/1.0" },
                signal: AbortSignal.timeout(2500),
              });
              if (r.ok) {
                const j = (await r.json()) as {
                  firstFlightDate?: string;
                  built?: string;
                  manufacturerName?: string;
                  model?: string;
                  registration?: string;
                  operator?: string;
                  owner?: string;
                };
                if (!f.firstFlightDate && j.firstFlightDate) f.firstFlightDate = j.firstFlightDate.trim();
                if (!f.built && j.built) f.built = j.built.trim();
                if (!f.manufacturer && j.manufacturerName) f.manufacturer = j.manufacturerName.trim();
                if (!f.typeFull && j.model) f.typeFull = j.model.trim();
                if (!f.registration && j.registration) f.registration = j.registration.trim();
                if (!f.operator && (j.operator || j.owner)) f.operator = (j.operator || j.owner)!.trim();
              }
            } catch { /* best effort */ }
            // adsbdb.com /callsign — rutetabell (avgang/ankomst-flyplass)
            if (f.callsign) {
              try {
                const cs = f.callsign.replace(/\s+/g, "");
                const r = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`, {
                  headers: { Accept: "application/json", "User-Agent": "house-riis-pettersen/1.0" },
                  signal: AbortSignal.timeout(2500),
                });
                if (r.ok) {
                  const j = (await r.json()) as {
                    response?: {
                      flightroute?: {
                        origin?: { icao_code?: string; iata_code?: string; name?: string; municipality?: string; country_name?: string };
                        destination?: { icao_code?: string; iata_code?: string; name?: string; municipality?: string; country_name?: string };
                      };
                    };
                  };
                  const fr = j.response?.flightroute;
                  const fmt = (p?: { icao_code?: string; iata_code?: string; name?: string; municipality?: string; country_name?: string }) => {
                    if (!p) return null;
                    const place = [p.name, p.municipality].filter(Boolean).join(", ");
                    const codes = [p.iata_code, p.icao_code].filter(Boolean).join("/");
                    return [place || p.country_name, codes ? `(${codes})` : null].filter(Boolean).join(" ").trim() || null;
                  };
                  if (fr?.origin) {
                    f.routeFromIcao = fr.origin.icao_code ?? null;
                    f.routeFromName = fmt(fr.origin);
                  }
                  if (fr?.destination) {
                    f.routeToIcao = fr.destination.icao_code ?? null;
                    f.routeToName = fmt(fr.destination);
                  }
                }
              } catch { /* best effort */ }
            }
          }),
        );
      }



      const source = adsb.length && opensky.length ? "adsb.lol+opensky+hexdb" : adsb.length ? "adsb.lol+hexdb" : "opensky+hexdb";
      return { ok: true, flights, fetchedAt: new Date().toISOString(), source };
    })();
  });


// ----- Push settings -----

export const PUSH_FIELD_KEYS = [
  "distance",
  "direction",
  "altitude",
  "speed",
  "verticalRate",
  "origin",
  "registration",
  "registrationCountry",
  "type",
  "typeFriendly",
  "description",
  "operator",
  "airline",
  "squawk",
  "squawkExplained",
  "category",
  "emergency",
  "routeFrom",
  "routeTo",
] as const;
export type PushFieldKey = typeof PUSH_FIELD_KEYS[number];

export const PUSH_FIELD_LABELS: Record<PushFieldKey, string> = {
  distance: "Avstand",
  direction: "Retning",
  altitude: "Høyde",
  speed: "Fart",
  verticalRate: "Stig-/synkrate",
  origin: "Opprinnelsesland",
  registration: "Registrering",
  registrationCountry: "Reg → land (oversatt)",
  type: "Flytype (ICAO)",
  typeFriendly: "Flytype (oversatt navn)",
  description: "Beskrivelse",
  operator: "Operatør/flyselskap",
  airline: "Flyselskap (callsign-oversatt)",
  squawk: "Squawk",
  squawkExplained: "Squawk (oversatt)",
  category: "Kategori",
  emergency: "Nødstatus",
  routeFrom: "Rute: fra (avgangsflyplass)",
  routeTo: "Rute: til (ankomstflyplass)",
};

export type FlightPushSettings = {
  enabled: boolean;
  recipient: string;
  searchRadiusKm: number; // synlig radius på fly-siden
  maxDistanceKm: number;
  maxAltitudeM: number; // 0 = ingen grense
  cooldownMinutes: number;
  // Tidsvindu (Europe/Oslo, HH:MM) når push KAN sendes. Like verdier = alltid på.
  // Hvis allowEnd < allowStart håndteres det som over midnatt (f.eks. 22:00–07:00).
  allowStart: string;
  allowEnd: string;
  fields: PushFieldKey[];
};

const DEFAULT_SETTINGS: FlightPushSettings = {
  enabled: false,
  recipient: "Alle",
  searchRadiusKm: DEFAULT_SEARCH_RADIUS_KM,
  maxDistanceKm: 25,
  maxAltitudeM: 5000,
  cooldownMinutes: 60,
  allowStart: "07:00",
  allowEnd: "22:00",
  fields: ["distance", "direction", "altitude", "speed", "origin", "registration", "registrationCountry", "type", "typeFriendly", "operator"],
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
    const merged = { ...DEFAULT_SETTINGS, ...(v ?? {}) };
    if (!Array.isArray(merged.fields) || merged.fields.length === 0) merged.fields = DEFAULT_SETTINGS.fields;
    return merged;
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
