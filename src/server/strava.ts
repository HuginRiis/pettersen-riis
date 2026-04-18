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

export const getStravaDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await getValidStravaAccessToken();
  if (!auth) {
    return { ok: false as const, error: "Ikke koblet til Strava" };
  }

  try {
    // Hent siste 30 aktiviteter (nok for ukestats + liste)
    const activities = await stravaFetch<StravaActivity[]>(
      `/athlete/activities?per_page=30`,
      auth.accessToken,
    );

    // Ukens stats (mandag 00:00 lokal → nå)
    const now = new Date();
    const day = now.getDay(); // 0=søn..6=lør
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
      activities: activities.slice(0, 7).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.sport_type || a.type,
        distance: a.distance,
        movingTime: a.moving_time,
        elevation: a.total_elevation_gain,
        startDate: a.start_date_local,
        avgHeartrate: a.average_heartrate ?? null,
        maxHeartrate: a.max_heartrate ?? null,
        polyline: a.map?.summary_polyline ?? a.map?.polyline ?? null,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return { ok: false as const, error: message };
  }
});
