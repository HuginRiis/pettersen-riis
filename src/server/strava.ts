import { createServerFn } from "@tanstack/react-start";
import { isStravaOwner, STRAVA_OWNERS, type StravaOwner } from "@/lib/strava-shared";


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
  const { loggedFetch } = await import("./api-call-log.server");
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
    const { getStravaConnection } = await import("./strava-connection");
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
  const { getStravaConnection } = await import("./strava-connection");
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
    const { deleteStravaConnection } = await import("./strava-connection");
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

export const runStravaDashboard = async (owner: StravaOwner, opts?: { force?: boolean }) => {
  const ttl = currentTtlMs();
  const force = opts?.force === true;
  // 1) Fersk in-memory cache → returner umiddelbart (hoppes over ved force)
  const cached = dashboardCache.get(owner);
  const nowMs = Date.now();
  if (!force && cached && nowMs - cached.at < ttl) {
    return cached.data;
  }

  // 1b) Last persistent cache (overlever Worker-restart)
  const persisted = !cached ? await loadPersistentCache(owner) : null;
  if (!force && persisted && nowMs - persisted.at < ttl) {
    dashboardCache.set(owner, persisted);
    return persisted.data;
  }

  const fallback = cached ?? persisted;

  // 2) Hard daglig brems — server stale cache hvis vi har det
  if (dailyCounter.calls >= DAILY_SAFE_LIMIT) {
    if (fallback) return withStaleMarker(fallback.data, fallback.at);
    return { ok: false as const, error: "Strava daglig grense nådd — prøv igjen senere" };
  }

  const auth = await getValidStravaAccessToken(owner);
  if (!auth) {
    if (fallback) return withStaleMarker(fallback.data, fallback.at);
    return { ok: false as const, error: "Ikke koblet til Strava" };
  }
  bumpDailyCounter(2);


  try {
    // Hent siste 100 aktiviteter (gir oss ~3 mnd for trender)
    const activities = await stravaFetch<StravaActivity[]>(
      `/athlete/activities?per_page=100`,
      auth.accessToken,
    );

    // Athlete totals (alt-i-alt)
    let stats: AthleteStats | null = null;
    if (auth.athleteId) {
      try {
        stats = await stravaFetch<AthleteStats>(
          `/athletes/${auth.athleteId}/stats`,
          auth.accessToken,
        );
      } catch {
        stats = null;
      }
    }

    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - diffToMonday);

    const weekActs = activities.filter((a) => new Date(a.start_date) >= weekStart);
    const weekStats = weekActs.reduce(
      (acc, a) => {
        acc.count += 1;
        acc.distance += a.distance || 0;
        acc.movingTime += a.moving_time || 0;
        acc.elevation += a.total_elevation_gain || 0;
        if (a.average_heartrate) {
          acc.hrSum += a.average_heartrate * (a.moving_time || 0);
          acc.hrTime += a.moving_time || 0;
        }
        return acc;
      },
      { count: 0, distance: 0, movingTime: 0, elevation: 0, hrSum: 0, hrTime: 0 },
    );

    // Periodbøtter for filter i UI: forrige uke + alle måneder + alle år
    // (basert på siste 100 aktiviteter — det er det vi har fra Strava).
    type PeriodBucket = {
      key: string;
      label: string;
      count: number;
      distanceMeters: number;
      movingSeconds: number;
      elevationMeters: number;
      avgHeartrate: number | null;
    };
    const buildBucket = (key: string, label: string, list: StravaActivity[]): PeriodBucket => {
      let dist = 0, time = 0, elev = 0, hrSum = 0, hrTime = 0;
      for (const a of list) {
        dist += a.distance || 0;
        time += a.moving_time || 0;
        elev += a.total_elevation_gain || 0;
        if (a.average_heartrate) {
          hrSum += a.average_heartrate * (a.moving_time || 0);
          hrTime += a.moving_time || 0;
        }
      }
      return {
        key,
        label,
        count: list.length,
        distanceMeters: dist,
        movingSeconds: time,
        elevationMeters: elev,
        avgHeartrate: hrTime > 0 ? Math.round(hrSum / hrTime) : null,
      };
    };

    // Forrige uke
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekActs = activities.filter((a) => {
      const d = new Date(a.start_date);
      return d >= prevWeekStart && d < weekStart;
    });
    const lastWeekBucket = buildBucket("last-week", "Forrige uke", prevWeekActs);

    // Måned-bøtter
    const monthMap = new Map<string, StravaActivity[]>();
    const yearMap = new Map<string, StravaActivity[]>();
    const MONTH_LABELS = [
      "Januar", "Februar", "Mars", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Desember",
    ];
    for (const a of activities) {
      const d = new Date(a.start_date);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const yKey = String(d.getFullYear());
      if (!monthMap.has(mKey)) monthMap.set(mKey, []);
      monthMap.get(mKey)!.push(a);
      if (!yearMap.has(yKey)) yearMap.set(yKey, []);
      yearMap.get(yKey)!.push(a);
    }
    const monthBuckets: PeriodBucket[] = Array.from(monthMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, list]) => {
        const [y, m] = key.split("-");
        return buildBucket(`month-${key}`, `${MONTH_LABELS[parseInt(m, 10) - 1]} ${y}`, list);
      });
    const yearBuckets: PeriodBucket[] = Array.from(yearMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, list]) => buildBucket(`year-${key}`, key, list));

    // 4 siste ukers trend (mandag-søndag)
    const weeklyTrend: Array<{
      weekStart: string;
      label: string;
      distanceKm: number;
      movingMin: number;
      elevation: number;
      count: number;
      calories: number;
    }> = [];
    for (let i = 3; i >= 0; i--) {
      const ws = new Date(weekStart);
      ws.setDate(ws.getDate() - i * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 7);
      const inWk = activities.filter((a) => {
        const d = new Date(a.start_date);
        return d >= ws && d < we;
      });
      const sum = inWk.reduce(
        (acc, a) => {
          acc.dist += a.distance || 0;
          acc.time += a.moving_time || 0;
          acc.elev += a.total_elevation_gain || 0;
          acc.kcal += estimateCalories(a);
          return acc;
        },
        { dist: 0, time: 0, elev: 0, kcal: 0 },
      );
      weeklyTrend.push({
        weekStart: ws.toISOString(),
        label: i === 0 ? "Denne" : `Uke ${ws.getDate()}/${ws.getMonth() + 1}`,
        distanceKm: sum.dist / 1000,
        movingMin: sum.time / 60,
        elevation: sum.elev,
        count: inWk.length,
        calories: sum.kcal,
      });
    }

    // Sportsfordeling (siste 100)
    const sportMap = new Map<
      string,
      { count: number; distance: number; movingTime: number; elevation: number }
    >();
    for (const a of activities) {
      const key = bucketSport(a.sport_type || a.type);
      const cur = sportMap.get(key) ?? { count: 0, distance: 0, movingTime: 0, elevation: 0 };
      cur.count += 1;
      cur.distance += a.distance || 0;
      cur.movingTime += a.moving_time || 0;
      cur.elevation += a.total_elevation_gain || 0;
      sportMap.set(key, cur);
    }
    const sportBreakdown = Array.from(sportMap.entries())
      .map(([sport, v]) => ({ sport, ...v }))
      .sort((a, b) => b.distance - a.distance);

    // Beste prestasjoner (siste 100)
    const walkActivities = activities.filter(
      (a) => bucketSport(a.sport_type || a.type) === "walk",
    );
    const runActivities = activities.filter(
      (a) => bucketSport(a.sport_type || a.type) === "run",
    );
    const rideActivities = activities.filter(
      (a) => bucketSport(a.sport_type || a.type) === "ride",
    );
    const bestBy = <K extends keyof StravaActivity>(
      list: StravaActivity[],
      key: K,
    ): StravaActivity | null =>
      list.reduce<StravaActivity | null>(
        (best, a) =>
          !best || ((a[key] as number) || 0) > ((best[key] as number) || 0) ? a : best,
        null,
      );
    const records = {
      longestDistance: bestBy(activities, "distance"),
      longestTime: bestBy(activities, "moving_time"),
      mostElevation: bestBy(activities, "total_elevation_gain"),
      maxHr: bestBy(activities, "max_heartrate"),
      avgHr: activities.reduce<StravaActivity | null>(
        (best, a) =>
          a.average_heartrate &&
          (!best || (a.average_heartrate || 0) > (best.average_heartrate || 0))
            ? a
            : best,
        null,
      ),
      maxSpeed: bestBy(activities, "max_speed"),
      avgSpeed: bestBy(activities, "average_speed"),
      mostKudos: bestBy(activities, "kudos_count"),
      mostAchievements: bestBy(activities, "achievement_count"),
      longestWalk: bestBy(walkActivities, "distance"),
      longestRun: bestBy(runActivities, "distance"),
      longestRide: bestBy(rideActivities, "distance"),
      fastestRide: bestBy(rideActivities, "average_speed"),
    };

    // Hjelper: summer aktiviteter til en TotalBlock
    const sumBlock = (acts: StravaActivity[]): TotalBlock => acts.reduce(
      (acc, a) => {
        acc.count += 1;
        acc.distance += a.distance || 0;
        acc.moving_time += a.moving_time || 0;
        acc.elevation_gain += a.total_elevation_gain || 0;
        return acc;
      },
      { count: 0, distance: 0, moving_time: 0, elevation_gain: 0 },
    );

    // Walk-totaler (Strava AthleteStats har ikke gå-totaler — vi regner ut
    // fra de siste 100 aktivitetene).
    const walkTotals = walkActivities.reduce(
      (acc, a) => {
        acc.count += 1;
        acc.distance += a.distance || 0;
        acc.movingTime += a.moving_time || 0;
        acc.elevation += a.total_elevation_gain || 0;
        return acc;
      },
      { count: 0, distance: 0, movingTime: 0, elevation: 0 },
    );

    // Lokale beregninger for de siste 4 ukene (28 dager) per sport — vi stoler
    // ikke fullt på Stravas recent_*_totals fordi de kan henge etter / mangler walk.
    const fourWeeksAgo = new Date(now);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const inLast4Weeks = activities.filter((a) => new Date(a.start_date) >= fourWeeksAgo);
    const runLast4 = inLast4Weeks.filter((a) => bucketSport(a.sport_type || a.type) === "run");
    const rideLast4 = inLast4Weeks.filter((a) => bucketSport(a.sport_type || a.type) === "ride");
    const swimLast4 = inLast4Weeks.filter((a) => bucketSport(a.sport_type || a.type) === "swim");
    const walkLast4 = inLast4Weeks.filter((a) => bucketSport(a.sport_type || a.type) === "walk");
    const recentRunLocal = sumBlock(runLast4);
    const recentRideLocal = sumBlock(rideLast4);
    const recentSwimLocal = sumBlock(swimLast4);
    const recentWalkLocal = sumBlock(walkLast4);

    // Walk-totaler for inneværende år og "alltid" — beregnet fra siste 100
    // aktivitetene, så det er en undergrense (markeres i UI).
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const walkThisYear = walkActivities.filter((a) => new Date(a.start_date) >= yearStart);
    const ytdWalkLocal = sumBlock(walkThisYear);
    const allWalkLocal = sumBlock(walkActivities);


    const slim = (a: StravaActivity | null) =>
      a
        ? {
            id: a.id,
            name: a.name,
            type: a.sport_type || a.type,
            distance: a.distance,
            movingTime: a.moving_time,
            elevation: a.total_elevation_gain,
            startDate: a.start_date_local,
            avgHeartrate: a.average_heartrate ?? null,
            maxHeartrate: a.max_heartrate ?? null,
            avgSpeed: a.average_speed ?? null,
            maxSpeed: a.max_speed ?? null,
            kudos: a.kudos_count ?? 0,
            achievements: a.achievement_count ?? 0,
          }
        : null;

    const result = {
      ok: true as const,
      athleteName: auth.athleteName,
      week: {
        count: weekStats.count,
        distanceMeters: weekStats.distance,
        movingSeconds: weekStats.movingTime,
        elevationMeters: weekStats.elevation,
        avgHeartrate: weekStats.hrTime > 0 ? Math.round(weekStats.hrSum / weekStats.hrTime) : null,
      },
      weeklyTrend,
      periodBuckets: {
        thisWeek: buildBucket("this-week", "Denne uka", weekActs),
        lastWeek: lastWeekBucket,
        months: monthBuckets,
        years: yearBuckets,
      },
      sportBreakdown,
      records: {
        longestDistance: slim(records.longestDistance),
        longestTime: slim(records.longestTime),
        mostElevation: slim(records.mostElevation),
        maxHr: slim(records.maxHr),
        avgHr: slim(records.avgHr),
        maxSpeed: slim(records.maxSpeed),
        avgSpeed: slim(records.avgSpeed),
        mostKudos: slim(records.mostKudos),
        mostAchievements: slim(records.mostAchievements),
        longestWalk: slim(records.longestWalk),
        longestRun: slim(records.longestRun),
        longestRide: slim(records.longestRide),
        fastestRide: slim(records.fastestRide),
      },
      walkRecent: {
        count: walkTotals.count,
        distance: walkTotals.distance,
        movingTime: walkTotals.movingTime,
        elevation: walkTotals.elevation,
      },
      totals: {
        recentRun: recentRunLocal,
        recentRide: recentRideLocal,
        recentSwim: recentSwimLocal,
        recentWalk: recentWalkLocal,
        ytdRun: stats?.ytd_run_totals ?? null,
        ytdRide: stats?.ytd_ride_totals ?? null,
        ytdSwim: stats?.ytd_swim_totals ?? null,
        ytdWalk: ytdWalkLocal.count > 0 ? ytdWalkLocal : null,
        allRun: stats?.all_run_totals ?? null,
        allRide: stats?.all_ride_totals ?? null,
        allSwim: stats?.all_swim_totals ?? null,
        allWalk: allWalkLocal.count > 0 ? allWalkLocal : null,
        biggestRide: stats?.biggest_ride_distance ?? null,
        biggestClimb: stats?.biggest_climb_elevation_gain ?? null,
      },
      activities: activities.slice(0, 30).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.sport_type || a.type,
        distance: a.distance,
        movingTime: a.moving_time,
        elevation: a.total_elevation_gain,
        startDate: a.start_date_local,
        avgHeartrate: a.average_heartrate ?? null,
        maxHeartrate: a.max_heartrate ?? null,
        avgSpeed: a.average_speed ?? null,
        maxSpeed: a.max_speed ?? null,
        polyline: a.map?.summary_polyline ?? a.map?.polyline ?? null,
        kudos: a.kudos_count ?? 0,
        achievements: a.achievement_count ?? 0,
      })),
    };
    dashboardCache.set(owner, { at: Date.now(), data: result });
    // Persistér så vi har siste gode snapshot også etter Worker-restart / feil
    void savePersistentCache(owner, result);
    return result;
  } catch (error) {
    // Ved feil: server siste cache hvis vi har det, ellers returner feil
    if (cached) return withStaleMarker(cached.data, cached.at);
    const persistedOnError = await loadPersistentCache(owner);
    if (persistedOnError) return withStaleMarker(persistedOnError.data, persistedOnError.at);
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return { ok: false as const, error: message };
  }
};



export const getStravaDashboard = createServerFn({ method: "GET" })
  .inputValidator((input: { owner?: StravaOwner } | undefined) => ({
    owner: parseOwner(input?.owner),
  }))
  .handler(async ({ data }) => {
    // Ingen withApiLog her — stravaFetch logger selve Strava-kallene.
    // Cache-treff produserer dermed ingen api_call_log-entry.
    return runStravaDashboard(data.owner);
  });
