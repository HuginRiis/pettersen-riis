import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";

const loadApiLog = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> =>
    import("@/lib/api-call-log.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/api-call-log.server")> =>
      Promise.resolve({
        withApiLog: (_g: string, _n: string, fn: any) => fn,
      } as unknown as typeof import("@/lib/api-call-log.server")),
  );
const loadTokenStore = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/netatmo-token-store.server")> =>
    import("@/lib/netatmo-token-store.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/netatmo-token-store.server")> =>
      Promise.resolve({
        loadStoredRefreshToken: async () => null,
        loadStoredToken: async () => null,
        saveStoredRefreshToken: async () => {},
        saveStoredToken: async () => {},
      } as unknown as typeof import("@/lib/netatmo-token-store.server")),
  );
const loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { withApiLog } = await loadApiLog();
const { loadStoredToken, saveStoredToken } = await loadTokenStore();
const { supabaseAdmin } = await loadAdmin();

const REFRESH_TOKEN_KEY = "netatmo_ws_refresh_token";
const RAW_DEVICES_DB_KEY = "netatmo_ws_devices_raw";

const NETATMO_BASE = "https://api.netatmo.com";

type TokenCache = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
let tokenInFlight: Promise<string> | null = null;
// Når Netatmo svarer 429 på /oauth2/token (code 29 "Access temporarily
// restricted") må vi backe av — ellers blir vi straffet enda lengre. Vi
// holder en cooldown der vi enten serverer eksisterende tokenCache eller
// kaster en pen feil i stedet for å hamre token-endepunktet.
let tokenCooldownUntil = 0;

async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.NETATMO_WS_CLIENT_ID;
  const clientSecret = process.env.NETATMO_WS_CLIENT_SECRET;
  const initialRefresh = process.env.NETATMO_WS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !initialRefresh) {
    throw new Error("NETATMO_WS_CLIENT_ID/SECRET/REFRESH_TOKEN mangler");
  }

  // Foretrekk lagret token fra DB (overlever cold start), så cache,
  // så initialToken fra env (kun første gang).
  const stored = await loadStoredToken(REFRESH_TOKEN_KEY);
  // Hvis DB allerede har en gyldig access_token (>60s igjen), bruk den
  // direkte og hopp over /oauth2/token-kallet.
  if (stored?.access_token && stored.expires_at && stored.expires_at - Date.now() > 60_000) {
    tokenCache = {
      accessToken: stored.access_token,
      refreshToken: stored.refresh_token,
      expiresAt: stored.expires_at,
    };
    return tokenCache.accessToken;
  }

  const refreshToken = tokenCache?.refreshToken ?? stored?.refresh_token ?? initialRefresh;

  const res = await fetch(`${NETATMO_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      // Netatmo: vent minst 10 min før vi prøver igjen.
      tokenCooldownUntil = Date.now() + 10 * 60_000;
    }
    throw new Error(`Netatmo WS token-feil (${res.status}): ${text.slice(0, 200)}`);
  }

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
  };

  // Persistér både ny refresh-token OG access-token + utløp, slik at andre
  // cold-start workers gjenbruker access-tokenen istedenfor å refreshe.
  await saveStoredToken(REFRESH_TOKEN_KEY, {
    access_token: tokenCache.accessToken,
    refresh_token: tokenCache.refreshToken,
    expires_at: tokenCache.expiresAt,
  });

  return tokenCache.accessToken;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) {
    return tokenCache.accessToken;
  }
  // Singleflight — parallelle kallere venter på samme refresh.
  if (tokenInFlight) return tokenInFlight;

  // Respekter cooldown etter 429
  if (Date.now() < tokenCooldownUntil) {
    if (tokenCache?.accessToken) return tokenCache.accessToken;
    // Forsøk DB direkte uten å treffe token-endepunktet
    const stored = await loadStoredToken(REFRESH_TOKEN_KEY);
    if (stored?.access_token && stored.expires_at && stored.expires_at - Date.now() > 60_000) {
      tokenCache = {
        accessToken: stored.access_token,
        refreshToken: stored.refresh_token,
        expiresAt: stored.expires_at,
      };
      return tokenCache.accessToken;
    }
    throw new Error(
      `Netatmo WS token-cooldown: prøver igjen om ${Math.ceil((tokenCooldownUntil - Date.now()) / 1000)}s`,
    );
  }

  tokenInFlight = refreshAccessToken().finally(() => {
    tokenInFlight = null;
  });
  return tokenInFlight;
}

export type WeatherModule = {
  id: string;
  type: string; // NAMain, NAModule1 (outdoor), NAModule2 (wind), NAModule3 (rain), NAModule4 (indoor)
  name: string;
  battery?: number; // percent
  reachable: boolean;
  lastSeen?: string; // ISO
  metrics: {
    temperature?: number;
    minTemp?: number;
    maxTemp?: number;
    humidity?: number;
    co2?: number;
    pressure?: number;
    absolutePressure?: number;
    noise?: number;
    rain?: number; // mm "now" (live rate)
    rainHour?: number; // mm last hour (sum_rain_1)
    rainDay?: number;
    windStrength?: number; // km/h
    windAngle?: number;
    gustStrength?: number;
    gustAngle?: number;
  };
};

export type WeatherStationResult =
  | { ok: false; error: string }
  | {
      ok: true;
      stationName: string;
      modules: WeatherModule[];
      fetchedAt: string;
      availableStations: string[];
      cached?: boolean;
    };

function moduleLabel(type: string, name: string): string {
  switch (type) {
    case "NAMain":
      return name || "Hovedmodul (inne)";
    case "NAModule1":
      return name || "Utemodul";
    case "NAModule2":
      return name || "Vindmåler";
    case "NAModule3":
      return name || "Regnmåler";
    case "NAModule4":
      return name || "Innemodul";
    default:
      return name || type;
  }
}

function mapDevice(device: any): WeatherModule[] {
  const allRaw = [device, ...(device.modules ?? [])];
  return allRaw.map((m: any) => {
    const dd = m.dashboard_data ?? {};
    const lastSeen = m.last_message ?? m.last_seen ?? m.last_status_store;
    return {
      id: m._id,
      type: m.type,
      name: moduleLabel(m.type, m.module_name ?? m.station_name ?? ""),
      battery: m.battery_percent,
      reachable: m.reachable !== false,
      lastSeen: lastSeen ? new Date(lastSeen * 1000).toISOString() : undefined,
      metrics: {
        temperature: dd.Temperature,
        minTemp: dd.min_temp,
        maxTemp: dd.max_temp,
        humidity: dd.Humidity,
        co2: dd.CO2,
        pressure: dd.Pressure,
        absolutePressure: dd.AbsolutePressure,
        noise: dd.Noise,
        rain: dd.Rain,
        rainHour: dd.sum_rain_1,
        rainDay: dd.sum_rain_24,
        windStrength: dd.WindStrength,
        windAngle: dd.WindAngle,
        gustStrength: dd.GustStrength,
        gustAngle: dd.GustAngle,
      },
    };
  });
}

// ===== Delt cache for RÅ getstationsdata-respons =====
// Netatmo oppdaterer stasjonene hvert 10. min. Ett enkelt /getstationsdata-kall
// returnerer ALLE devices på kontoen, så vi cacher det rå svaret én gang og
// filtrerer per stationMatch i minnet. Dette unngår dobbelt forbruk når både
// "tollnes" og "hytta" spørres samtidig (tidligere → 2 API-kall).
//
// Tre nivåer:
//   1) In-memory (per worker-isolat) — raskest, 10 min TTL
//   2) Singleflight — concurrent forespørsler deler én pågående fetch
//   3) DB-snapshot i public.netatmo_climate_snapshot — overlever cold starts
//      og brukes som fallback ved 429/feil
const RAW_TTL_MS = 10 * 60_000;
const RAW_STALE_FALLBACK_MS = 60 * 60_000; // ved 429 — server inntil 1 t gammelt
let rawDevicesCache: { at: number; devices: any[] } | null = null;
let rawDevicesInFlight: Promise<any[]> | null = null;

async function loadRawDevicesFromDb(): Promise<{ at: number; devices: any[] } | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data } = await supabaseAdmin
      .from("netatmo_climate_snapshot" as any)
      .select("data, updated_at")
      .eq("cache_key", RAW_DEVICES_DB_KEY)
      .maybeSingle();
    if (!data) return null;
    const payload = (data as any).data;
    const updatedAt = (data as any).updated_at;
    if (payload && Array.isArray(payload.devices) && updatedAt) {
      return { at: Date.parse(updatedAt), devices: payload.devices };
    }
    return null;
  } catch {
    return null;
  }
}

async function saveRawDevicesToDb(devices: any[]): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin
      .from("netatmo_climate_snapshot" as any)
      .upsert(
        {
          cache_key: RAW_DEVICES_DB_KEY,
          data: { devices } as any,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "cache_key" },
      );
  } catch {
    /* best effort */
  }
}

async function fetchStationsRaw(token: string): Promise<Response> {
  return fetch(`${NETATMO_BASE}/api/getstationsdata?get_favorites=false`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/**
 * Returnerer ferske devices fra Netatmo, eller fra DB hvis det er <10 min siden.
 * Singleflight: parallelle kall deler én pågående henting.
 */
async function getDevices(): Promise<{ devices: any[]; fromCache: boolean }> {
  // 1) In-memory fresh?
  if (rawDevicesCache && Date.now() - rawDevicesCache.at < RAW_TTL_MS) {
    return { devices: rawDevicesCache.devices, fromCache: true };
  }
  // 2) Pågående fetch? Del den.
  if (rawDevicesInFlight) {
    const devices = await rawDevicesInFlight;
    return { devices, fromCache: true };
  }
  // 3) DB-snapshot fersk nok?
  const dbSnap = await loadRawDevicesFromDb();
  if (dbSnap && Date.now() - dbSnap.at < RAW_TTL_MS) {
    rawDevicesCache = dbSnap;
    return { devices: dbSnap.devices, fromCache: true };
  }

  // 4) Fetch fra Netatmo (singleflight)
  rawDevicesInFlight = (async () => {
    try {
      let token = await getAccessToken();
      let res = await fetchStationsRaw(token);
      if (res.status === 401 || res.status === 403) {
        tokenCache = null;
        token = await getAccessToken();
        res = await fetchStationsRaw(token);
      }
      if (!res.ok) {
        const text = await res.text();
        // 429 / annen feil — bruk siste DB-snapshot hvis tilgjengelig (selv om stale)
        if (dbSnap && Date.now() - dbSnap.at < RAW_STALE_FALLBACK_MS) {
          rawDevicesCache = dbSnap;
          return dbSnap.devices;
        }
        if (rawDevicesCache && Date.now() - rawDevicesCache.at < RAW_STALE_FALLBACK_MS) {
          return rawDevicesCache.devices;
        }
        throw new Error(`getstationsdata feilet (${res.status}): ${text.slice(0, 160)}`);
      }
      const json = (await res.json()) as any;
      const devices: any[] = json?.body?.devices ?? [];
      rawDevicesCache = { at: Date.now(), devices };
      // Persistér til DB (best effort) så cold-start workers slipper å re-fetche.
      void saveRawDevicesToDb(devices);
      return devices;
    } finally {
      rawDevicesInFlight = null;
    }
  })();

  const devices = await rawDevicesInFlight;
  return { devices, fromCache: false };
}

export const getNetatmoWeatherStation = createServerFn({ method: "GET" })
  .inputValidator((data: { stationMatch?: string }) => data ?? {})
  .handler(withApiLog("netatmo", "getNetatmoWeatherStation", async ({ data }: { data: { stationMatch?: string } }): Promise<WeatherStationResult> => {
    try {
      const { devices, fromCache } = await getDevices();
      if (devices.length === 0) {
        return { ok: false, error: "Fant ingen værstasjoner på kontoen" };
      }

      const availableStations = devices.map(
        (d: any) => d.station_name ?? d.module_name ?? "Ukjent",
      );

      const match = data?.stationMatch?.toLowerCase().trim();
      const matched = match
        ? devices.filter((d: any) => {
            const sn = (d.station_name ?? "").toLowerCase();
            const mn = (d.module_name ?? "").toLowerCase();
            return sn.includes(match) || mn.includes(match);
          })
        : [devices[0]];
      if (matched.length === 0) matched.push(devices[0]);
      const device = matched[0];

      const stationName: string = device.station_name ?? device.module_name ?? "Værstasjonen";
      const seen = new Set<string>();
      const modules: WeatherModule[] = [];
      for (const dev of matched) {
        for (const mod of mapDevice(dev)) {
          if (seen.has(mod.id)) continue;
          seen.add(mod.id);
          modules.push(mod);
        }
      }

      const out: WeatherStationResult = {
        ok: true,
        stationName,
        modules,
        fetchedAt: rawDevicesCache ? new Date(rawDevicesCache.at).toISOString() : new Date().toISOString(),
        availableStations,
        cached: fromCache,
      };
      return out;
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil" };
    }
  }));
