import { createServerFn } from "@tanstack/react-start";
import {
  deleteStravaConnection,
  getStravaConnection,
  getValidStravaAccessToken,
} from "./strava-connection";

const STRAVA_API = "https://www.strava.com/api/v3";

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
};

async function stravaFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava ${path} feilet (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const getStravaStatus = createServerFn({ method: "GET" }).handler(async () => {
  const conn = await getStravaConnection();
  if (!conn) return { connected: false as const };
  return {
    connected: true as const,
    athleteName: conn.athlete_name,
    athleteId: conn.athlete_id,
    scope: conn.scope,
  };
});

export const disconnectStrava = createServerFn({ method: "POST" }).handler(async () => {
  await deleteStravaConnection();
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
  .inputValidator((input: { activityId: number }) => input)
  .handler(async ({ data }) => {
    const auth = await getValidStravaAccessToken();
    if (!auth) {
      return { ok: false as const, error: "Ikke koblet til Strava" };
    }
    try {
      const streams = await stravaFetch<StreamSet>(
        `/activities/${data.activityId}/streams?keys=altitude,heartrate,distance&key_by_type=true`,
        auth.accessToken,
      );
      const altitude = streams.altitude?.data ?? null;
      const heartrate = streams.heartrate?.data ?? null;
      return {
        ok: true as const,
        altitude: altitude ? downsample(altitude, 60) : null,
        heartrate: heartrate ? downsample(heartrate, 60) : null,
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

export const getStravaDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await getValidStravaAccessToken();
  if (!auth) {
    return { ok: false as const, error: "Ikke koblet til Strava" };
  }

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

    // 4 siste ukers trend (mandag-søndag)
    const weeklyTrend: Array<{
      weekStart: string;
      label: string;
      distanceKm: number;
      movingMin: number;
      elevation: number;
      count: number;
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
          return acc;
        },
        { dist: 0, time: 0, elev: 0 },
      );
      weeklyTrend.push({
        weekStart: ws.toISOString(),
        label: i === 0 ? "Denne" : `Uke ${ws.getDate()}/${ws.getMonth() + 1}`,
        distanceKm: sum.dist / 1000,
        movingMin: sum.time / 60,
        elevation: sum.elev,
        count: inWk.length,
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
    const records = {
      longestDistance: activities.reduce<StravaActivity | null>(
        (best, a) => (!best || (a.distance || 0) > (best.distance || 0) ? a : best),
        null,
      ),
      longestTime: activities.reduce<StravaActivity | null>(
        (best, a) => (!best || (a.moving_time || 0) > (best.moving_time || 0) ? a : best),
        null,
      ),
      mostElevation: activities.reduce<StravaActivity | null>(
        (best, a) =>
          !best || (a.total_elevation_gain || 0) > (best.total_elevation_gain || 0) ? a : best,
        null,
      ),
      maxHr: activities.reduce<StravaActivity | null>(
        (best, a) => (!best || (a.max_heartrate || 0) > (best.max_heartrate || 0) ? a : best),
        null,
      ),
      maxSpeed: activities.reduce<StravaActivity | null>(
        (best, a) => (!best || (a.max_speed || 0) > (best.max_speed || 0) ? a : best),
        null,
      ),
    };

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
            maxHeartrate: a.max_heartrate ?? null,
            maxSpeed: a.max_speed ?? null,
          }
        : null;

    return {
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
      sportBreakdown,
      records: {
        longestDistance: slim(records.longestDistance),
        longestTime: slim(records.longestTime),
        mostElevation: slim(records.mostElevation),
        maxHr: slim(records.maxHr),
        maxSpeed: slim(records.maxSpeed),
      },
      totals: stats
        ? {
            recentRun: stats.recent_run_totals ?? null,
            recentRide: stats.recent_ride_totals ?? null,
            recentSwim: stats.recent_swim_totals ?? null,
            ytdRun: stats.ytd_run_totals ?? null,
            ytdRide: stats.ytd_ride_totals ?? null,
            ytdSwim: stats.ytd_swim_totals ?? null,
            allRun: stats.all_run_totals ?? null,
            allRide: stats.all_ride_totals ?? null,
            allSwim: stats.all_swim_totals ?? null,
            biggestRide: stats.biggest_ride_distance ?? null,
            biggestClimb: stats.biggest_climb_elevation_gain ?? null,
          }
        : null,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return { ok: false as const, error: message };
  }
});
