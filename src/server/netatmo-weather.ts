import { createServerFn } from "@tanstack/react-start";
import { withApiLog } from "./api-call-log.server";
import { loadStoredRefreshToken, saveStoredRefreshToken } from "./netatmo-token-store.server";

const REFRESH_TOKEN_KEY = "netatmo_ws_refresh_token";

const NETATMO_BASE = "https://api.netatmo.com";

type TokenCache = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.NETATMO_WS_CLIENT_ID;
  const clientSecret = process.env.NETATMO_WS_CLIENT_SECRET;
  const initialRefresh = process.env.NETATMO_WS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !initialRefresh) {
    throw new Error("NETATMO_WS_CLIENT_ID/SECRET/REFRESH_TOKEN mangler");
  }

  if (tokenCache && tokenCache.expiresAt - Date.now() > 60_000) {
    return tokenCache.accessToken;
  }

  // Netatmo roterer refresh_token ved hver bruk. Foretrekk lagret token fra DB
  // (overlever cold start), så cache, så initialToken fra env (kun første gang).
  const stored = await loadStoredRefreshToken(REFRESH_TOKEN_KEY);
  const refreshToken = tokenCache?.refreshToken ?? stored ?? initialRefresh;

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

  // Persister den roterte refresh-tokenen så neste cold start ikke faller tilbake
  // til en utgått env-token.
  await saveStoredRefreshToken(REFRESH_TOKEN_KEY, tok.refresh_token);

  return tokenCache.accessToken;
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
    rain?: number; // mm last hour
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
        rainDay: dd.sum_rain_24,
        windStrength: dd.WindStrength,
        windAngle: dd.WindAngle,
        gustStrength: dd.GustStrength,
        gustAngle: dd.GustAngle,
      },
    };
  });
}

// Delt server-cache per stationMatch — Netatmo oppdaterer kun hvert 10. min,
// så vi serverer samme svar til alle klienter (forsiden + Steintavlen + iPad)
// i 10 minutter. Klient-"refresh" og manuelle besøk bypasser IKKE denne TTL —
// vi treffer aldri api.netatmo.com oftere enn hvert 10. minutt per stasjon.
const WEATHER_TTL_MS = 10 * 60_000;
const weatherCache = new Map<string, { at: number; data: WeatherStationResult }>();

export const getNetatmoWeatherStation = createServerFn({ method: "GET" })
  .inputValidator((data: { stationMatch?: string }) => data ?? {})
  .handler(withApiLog("netatmo", "getNetatmoWeatherStation", async ({ data }: { data: { stationMatch?: string } }): Promise<WeatherStationResult> => {
    const cacheKey = (data?.stationMatch ?? "").toLowerCase().trim() || "__default";
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.at < WEATHER_TTL_MS && cached.data.ok) {
      return { ...cached.data, cached: true } as WeatherStationResult;
    }

    try {
      const token = await getAccessToken();

      const res = await fetch(`${NETATMO_BASE}/api/getstationsdata?get_favorites=false`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (!res.ok) {
        const text = await res.text();
        // 429 → server forrige cache litt lenger om vi har den
        if (res.status === 429 && cached?.data.ok) {
          weatherCache.set(cacheKey, { at: Date.now() - WEATHER_TTL_MS + 60_000, data: cached.data });
          return { ...cached.data, cached: true } as WeatherStationResult;
        }
        return {
          ok: false,
          error: `getstationsdata feilet (${res.status}): ${text.slice(0, 160)}`,
        };
      }

      const json = (await res.json()) as any;
      const devices: any[] = json?.body?.devices ?? [];
      if (devices.length === 0) {
        return { ok: false, error: "Fant ingen værstasjoner på kontoen" };
      }

      const availableStations = devices.map(
        (d: any) => d.station_name ?? d.module_name ?? "Ukjent",
      );

      const match = data?.stationMatch?.toLowerCase().trim();
      // Samle ALLE devices som matcher stedet — Tollnes/Borgen har flere
      // base-stasjoner, og utemodulen (NAModule1) + noen rom (NAModule4) kan
      // ligge på en annen device enn hovedmodulen vi traff på først.
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
      // Slå sammen moduler fra alle matchende devices. Dedupliser på _id slik
      // at hovedmodulen ikke kommer dobbelt om flere devices deler samme oppsett.
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
        fetchedAt: new Date().toISOString(),
        availableStations,
      };
      weatherCache.set(cacheKey, { at: Date.now(), data: out });
      return out;
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil" };
    }
  }));

