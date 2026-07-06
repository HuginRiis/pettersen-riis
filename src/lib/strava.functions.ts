import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { isStravaOwner, STRAVA_OWNERS, type StravaOwner } from "@/lib/strava-shared";

const __loadApiLog = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/api-call-log.server")> =>
    import("@/lib/api-call-log.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/api-call-log.server")> =>
      Promise.resolve({
        loggedFetch: ((_s: any, _n: any, url: any, init: any) => fetch(url, init)) as any,
        withApiLog: ((_s: any, _n: any, fn: any) => fn) as any,
      } as unknown as typeof import("@/lib/api-call-log.server")),
  );

const __loadStravaConn = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/strava-connection.server")> =>
    import("@/lib/strava-connection.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/strava-connection.server")> =>
      Promise.resolve({} as unknown as typeof import("@/lib/strava-connection.server")),
  );

const __loadGarminDash = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/garmin-training-dashboard.server")> =>
    import("@/lib/garmin-training-dashboard.server"),
  )
  .client(
    (): Promise<typeof import("@/lib/garmin-training-dashboard.server")> =>
      Promise.resolve({} as unknown as typeof import("@/lib/garmin-training-dashboard.server")),
  );


const STRAVA_API = "https://www.strava.com/api/v3";

function parseOwner(input: unknown): StravaOwner {
  if (isStravaOwner(input)) return input;
  return "arne";
}

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate?: boolean;
  map?: { summary_polyline?: string | null; polyline?: string | null };
  kudos_count?: number;
  achievement_count?: number;
  kilojoules?: number;
};

// Estimerer kalorier (kcal) for en aktivitet. Strava gir kilojoules kun for
// sykkel (1 kJ ≈ 1 kcal i praksis siden kroppens effektivitet ~24 %). For
// andre sporter bruker vi MET × tid × antatt vekt (80 kg).
const ASSUMED_WEIGHT_KG = 80;
function estimateCalories(a: StravaActivity): number {
  if (a.kilojoules && a.kilojoules > 0) return Math.round(a.kilojoules);
  const sport = (a.sport_type || a.type || "").toLowerCase();
  const hours = (a.moving_time || 0) / 3600;
  if (hours <= 0) return 0;
  let met = 5;
  if (sport.includes("run")) met = 9.8;
  else if (sport.includes("ride") || sport.includes("cycl") || sport.includes("bike")) met = 7.5;
  else if (sport.includes("swim")) met = 8.0;
  else if (sport.includes("hike")) met = 6.0;
  else if (sport.includes("walk")) met = 3.8;
  else if (sport.includes("ski") || sport.includes("snow")) met = 7.0;
  else if (sport.includes("row")) met = 7.0;
  else if (sport.includes("workout") || sport.includes("weight") || sport.includes("strength")) met = 5.0;
  return Math.round(met * ASSUMED_WEIGHT_KG * hours);
}

async function stravaFetch<T>(path: string, accessToken: string): Promise<T> {
  // Logg kun ekte Strava-HTTP-kall (ikke cache-treff i runStravaDashboard).
  const { loggedFetch } = await __loadApiLog();
  const res = await loggedFetch("strava", path, `${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava ${path} feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const getStravaStatus = createServerFn({ method: "GET" })
  .inputValidator((input: { owner?: StravaOwner } | undefined) => ({
    owner: parseOwner(input?.owner),
  }))
  .handler(async ({ data }) => {
    const { getStravaConnection } = await __loadStravaConn();
    const conn = await getStravaConnection(data.owner);
    if (!conn) return { connected: false as const, owner: data.owner };
    return {
      connected: true as const,
      owner: data.owner,
      athleteName: conn.athlete_name,
      athleteId: conn.athlete_id,
      scope: conn.scope,
    };
  });

export const getAllStravaStatuses = createServerFn({ method: "GET" }).handler(async () => {
  const { getStravaConnection } = await __loadStravaConn();
  const results = await Promise.all(
    STRAVA_OWNERS.map(async (owner) => {
      const conn = await getStravaConnection(owner);
      if (!conn) return { owner, connected: false as const };
      return {
        owner,
        connected: true as const,
        athleteName: conn.athlete_name,
        athleteId: conn.athlete_id,
        scope: conn.scope,
      };
    }),
  );
  return { statuses: results };
});

export const disconnectStrava = createServerFn({ method: "POST" })
  .inputValidator((input: { owner?: StravaOwner } | undefined) => ({
    owner: parseOwner(input?.owner),
  }))
  .handler(async ({ data }) => {
    const { deleteStravaConnection } = await __loadStravaConn();
    await deleteStravaConnection(data.owner);
    return { ok: true };
  });

type StreamSet = Record<string, { data: number[]; series_type?: string; original_size?: number }>;

function downsample(arr: number[], target: number): number[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    out.push(arr[Math.floor(i * step)]);
  }
  return out;
}

export const getActivityStreams = createServerFn({ method: "GET" })
  .inputValidator((input: { activityId: number; owner?: StravaOwner }) => ({
    activityId: input.activityId,
    owner: parseOwner(input.owner),
  }))
  .handler(async ({ data }) => {
    const { getValidStravaAccessToken } = await __loadStravaConn();
    const auth = await getValidStravaAccessToken(data.owner);
    if (!auth) {
      return { ok: false as const, error: "Ikke koblet til Strava" };
    }
    try {
      const streams = await stravaFetch<StreamSet>(
        `/activities/${data.activityId}/streams?keys=altitude,heartrate,distance,velocity_smooth&key_by_type=true`,
        auth.accessToken,
      );
      const altitude = streams.altitude?.data ?? null;
      const heartrate = streams.heartrate?.data ?? null;
      const velocity = streams.velocity_smooth?.data ?? null;
      // Convert m/s -> km/h for display
      const speedKmh = velocity ? velocity.map((v) => v * 3.6) : null;
      return {
        ok: true as const,
        altitude: altitude ? downsample(altitude, 60) : null,
        heartrate: heartrate ? downsample(heartrate, 60) : null,
        speed: speedKmh ? downsample(speedKmh, 60) : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukjent feil";
      return { ok: false as const, error: message };
    }
  });


type AthleteStats = {
  recent_run_totals?: TotalBlock;
  recent_ride_totals?: TotalBlock;
  recent_swim_totals?: TotalBlock;
  ytd_run_totals?: TotalBlock;
  ytd_ride_totals?: TotalBlock;
  ytd_swim_totals?: TotalBlock;
  all_run_totals?: TotalBlock;
  all_ride_totals?: TotalBlock;
  all_swim_totals?: TotalBlock;
  biggest_ride_distance?: number;
  biggest_climb_elevation_gain?: number;
};
type TotalBlock = {
  count: number;
  distance: number;
  moving_time: number;
  elevation_gain: number;
};

function bucketSport(type: string): "run" | "ride" | "swim" | "hike" | "ski" | "walk" | "other" {
  const t = type.toLowerCase();
  if (t.includes("run")) return "run";
  if (t.includes("ride") || t.includes("cycl") || t.includes("bike")) return "ride";
  if (t.includes("swim")) return "swim";
  if (t.includes("hike")) return "hike";
  if (t.includes("walk")) return "walk";
  if (t.includes("ski") || t.includes("snow")) return "ski";
  return "other";
}

// Selve dashboard-logikken som hentes både fra serverFn og fra refresh-knappen
// i Vakttårnet. withApiLog påføres kun i server-only kallveier (se
// api-call-log.functions.ts og getStravaDashboard.handler under) — vi importerer
// ikke api-call-log.server her, fordi denne filen også brukes fra klient-ruter
// (trening.tsx) via RPC-stubs.

// In-memory cache per eier. Vi henter kun én gang per time for å holde oss
// godt innenfor Stravas daglige grense. Manuell "Oppdater"-knapp kan
// invalidere cachen for å tvinge nytt kall.
const DASHBOARD_TTL_MS = 60 * 60 * 1000;
function currentTtlMs(): number {
  return DASHBOARD_TTL_MS;
}
const dashboardCache = new Map<StravaOwner, { at: number; data: any }>();

// Sikkerhetsbrems: hvis vi nærmer oss daglig grense, server stale data fra cache
// (selv etter TTL) i stedet for å fyre flere kall mot Strava.
const DAILY_SAFE_LIMIT = 800; // hvert dashboard = 2 strava-kall
const dailyCounter = { day: "", calls: 0 };
function bumpDailyCounter(n = 2): number {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.day !== today) {
    dailyCounter.day = today;
    dailyCounter.calls = 0;
  }
  dailyCounter.calls += n;
  return dailyCounter.calls;
}

async function loadPersistentCache(owner: StravaOwner): Promise<{ at: number; data: any } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin.from("strava_dashboard_cache") as any)
      .select("data, fetched_at")
      .eq("owner", owner)
      .maybeSingle();
    if (error || !data) return null;
    return { at: new Date(data.fetched_at).getTime(), data: data.data };
  } catch {
    return null;
  }
}

async function savePersistentCache(owner: StravaOwner, data: any): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin.from("strava_dashboard_cache") as any).upsert({
      owner,
      data,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[strava] persistent cache write failed", err);
  }
}

function withStaleMarker(data: any, fetchedAt: number) {
  if (!data || typeof data !== "object") return data;
  return {
    ...data,
    stale: true,
    cachedAt: new Date(fetchedAt).toISOString(),
  };
}

export const runStravaDashboard = async (owner: StravaOwner, _opts?: { force?: boolean }) => {
  // MIGRERT: /trening henter nå trenings-dashbordet fra Garmin i stedet for
  // Strava (Strava krever nå betalt API-tilgang). Strava-koblingene beholdes
  // for framtiden, men vi kaller ingen Strava-endepunkter herfra lenger.
  const mod = await __loadGarminDash();
  if (!mod?.runGarminTrainingDashboard) {
    return { ok: false as const, error: "Garmin-dashbord ikke tilgjengelig i klienten" };
  }
  return mod.runGarminTrainingDashboard(owner);
};

export const getStravaDashboard = createServerFn({ method: "GET" })
  .inputValidator((input: { owner?: StravaOwner } | undefined) => ({
    owner: parseOwner(input?.owner),
  }))
  .handler(async ({ data }) => {
    return runStravaDashboard(data.owner);
  });
