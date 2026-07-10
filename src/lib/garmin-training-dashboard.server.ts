// Bygger et "trenings-dashboard" fra Garmin-data i samme form som
// runStravaDashboard tidligere returnerte, slik at /trening kan vise samme
// UI uten å røre Strava-integrasjonen. Strava-tokens beholdes; kun datakilden
// er byttet.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { GarminOwner } from "@/lib/garmin-shared";

type SportBucket = "run" | "ride" | "swim" | "hike" | "ski" | "other";

function bucketSport(type: string | null | undefined): SportBucket {
  const t = (type ?? "").toLowerCase();
  if (t.includes("run")) return "run";
  if (t.includes("cycl") || t.includes("ride") || t.includes("bike")) return "ride";
  if (t.includes("swim")) return "swim";
  if (t.includes("hike") || t.includes("walk")) return "hike";
  if (t.includes("ski") || t.includes("snow")) return "ski";
  return "other";
}


type GAct = {
  garmin_activity_id: number;
  activity_type: string | null;
  activity_name: string | null;
  start_time_local: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  calories: number | null;
  average_hr: number | null;
  max_hr: number | null;
  elevation_gain: number | null;
  average_speed: number | null;
};

type Slim = {
  id: number;
  name: string;
  type: string;
  distance: number;
  movingTime: number;
  elevation: number;
  startDate: string;
  avgHeartrate: number | null;
  maxHeartrate: number | null;
  avgSpeed: number | null;
  maxSpeed: number | null;
  polyline: string | null;
  kudos: number;
  achievements: number;
};

type TotalBlock = { count: number; distance: number; moving_time: number; elevation_gain: number };

function slim(a: GAct | null): Slim | null {
  if (!a) return null;
  return {
    id: a.garmin_activity_id,
    name: a.activity_name || a.activity_type || "Økt",
    type: a.activity_type || "other",
    distance: Number(a.distance_meters ?? 0),
    movingTime: Number(a.duration_seconds ?? 0),
    elevation: Number(a.elevation_gain ?? 0),
    startDate: a.start_time_local,
    avgHeartrate: a.average_hr ?? null,
    maxHeartrate: a.max_hr ?? null,
    avgSpeed: a.average_speed != null ? Number(a.average_speed) : null,
    maxSpeed: null,
    polyline: null,
    kudos: 0,
    achievements: 0,
  };
}

function displayName(owner: GarminOwner): string {
  return owner === "rebekka" ? "Rebekka" : "Arne";
}

export async function runGarminTrainingDashboard(owner: GarminOwner) {
  // Hent alle aktiviteter for eieren (vi har tak i historikk siden 2021).
  const { data: all, error } = await supabaseAdmin
    .from("garmin_activities")
    .select(
      "garmin_activity_id, activity_type, activity_name, start_time_local, duration_seconds, distance_meters, calories, average_hr, max_hr, elevation_gain, average_speed",
    )
    .eq("owner", owner)
    .order("start_time_local", { ascending: false })
    .limit(500);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  const activities = (all ?? []) as GAct[];

  if (activities.length === 0) {
    return { ok: false as const, error: "Ingen Garmin-aktiviteter enda" };
  }

  const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);

  // Ukens statistikk (mandag → nå)
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - diffToMonday);

  const weekActs = activities.filter((a) => new Date(a.start_time_local) >= weekStart);
  const weekStats = weekActs.reduce(
    (acc, a) => {
      const t = num(a.duration_seconds);
      acc.count += 1;
      acc.distance += num(a.distance_meters);
      acc.movingTime += t;
      acc.elevation += num(a.elevation_gain);
      if (a.average_hr && t > 0) {
        acc.hrSum += a.average_hr * t;
        acc.hrTime += t;
      }
      return acc;
    },
    { count: 0, distance: 0, movingTime: 0, elevation: 0, hrSum: 0, hrTime: 0 },
  );

  type PeriodBucket = {
    key: string;
    label: string;
    count: number;
    distanceMeters: number;
    movingSeconds: number;
    elevationMeters: number;
    avgHeartrate: number | null;
  };
  const buildBucket = (key: string, label: string, list: GAct[]): PeriodBucket => {
    let dist = 0,
      time = 0,
      elev = 0,
      hrSum = 0,
      hrTime = 0;
    for (const a of list) {
      const t = num(a.duration_seconds);
      dist += num(a.distance_meters);
      time += t;
      elev += num(a.elevation_gain);
      if (a.average_hr && t > 0) {
        hrSum += a.average_hr * t;
        hrTime += t;
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

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekActs = activities.filter((a) => {
    const d = new Date(a.start_time_local);
    return d >= prevWeekStart && d < weekStart;
  });
  const lastWeekBucket = buildBucket("last-week", "Forrige uke", prevWeekActs);

  const MONTH_LABELS = [
    "Januar",
    "Februar",
    "Mars",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const monthMap = new Map<string, GAct[]>();
  const yearMap = new Map<string, GAct[]>();
  for (const a of activities) {
    const d = new Date(a.start_time_local);
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

  // 4 siste ukers trend
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
      const d = new Date(a.start_time_local);
      return d >= ws && d < we;
    });
    const sum = inWk.reduce(
      (acc, a) => {
        acc.dist += num(a.distance_meters);
        acc.time += num(a.duration_seconds);
        acc.elev += num(a.elevation_gain);
        acc.kcal += num(a.calories);
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
      calories: Math.round(sum.kcal),
    });
  }

  // Sportsfordeling
  const sportMap = new Map<
    string,
    { count: number; distance: number; movingTime: number; elevation: number }
  >();
  for (const a of activities) {
    const key = bucketSport(a.activity_type);
    const cur = sportMap.get(key) ?? { count: 0, distance: 0, movingTime: 0, elevation: 0 };
    cur.count += 1;
    cur.distance += num(a.distance_meters);
    cur.movingTime += num(a.duration_seconds);
    cur.elevation += num(a.elevation_gain);
    sportMap.set(key, cur);
  }
  const sportBreakdown = Array.from(sportMap.entries())
    .map(([sport, v]) => ({ sport, ...v }))
    .sort((a, b) => b.distance - a.distance);

  const walkHikeActivities = activities.filter((a) => bucketSport(a.activity_type) === "hike");

  const runActivities = activities.filter((a) => bucketSport(a.activity_type) === "run");
  const rideActivities = activities.filter((a) => bucketSport(a.activity_type) === "ride");


  const bestByNum = (list: GAct[], key: keyof GAct): GAct | null =>
    list.reduce<GAct | null>(
      (best, a) => (!best || num(a[key]) > num(best[key]) ? a : best),
      null,
    );

  const records = {
    longestDistance: bestByNum(activities, "distance_meters"),
    longestTime: bestByNum(activities, "duration_seconds"),
    mostElevation: bestByNum(activities, "elevation_gain"),
    maxHr: bestByNum(activities, "max_hr"),
    avgHr: activities.reduce<GAct | null>(
      (best, a) =>
        a.average_hr && (!best || num(a.average_hr) > num(best?.average_hr))
          ? a
          : best,
      null,
    ),
    maxSpeed: bestByNum(activities, "average_speed"),
    avgSpeed: bestByNum(activities, "average_speed"),
    mostKudos: null as GAct | null,
    mostAchievements: null as GAct | null,
    longestWalk: bestByNum(walkHikeActivities, "distance_meters"),
    longestRun: bestByNum(runActivities, "distance_meters"),
    longestRide: bestByNum(rideActivities, "distance_meters"),
    fastestRide: bestByNum(rideActivities, "average_speed"),
    fastestWalk: bestByNum(walkHikeActivities, "average_speed"),

  };

  const sumBlock = (acts: GAct[]): TotalBlock =>
    acts.reduce(
      (acc, a) => {
        acc.count += 1;
        acc.distance += num(a.distance_meters);
        acc.moving_time += num(a.duration_seconds);
        acc.elevation_gain += num(a.elevation_gain);
        return acc;
      },
      { count: 0, distance: 0, moving_time: 0, elevation_gain: 0 },
    );

  const walkHikeTotals = sumBlock(walkHikeActivities);

  // Siste 4 uker
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const inLast4Weeks = activities.filter((a) => new Date(a.start_time_local) >= fourWeeksAgo);
  const recentRunLocal = sumBlock(inLast4Weeks.filter((a) => bucketSport(a.activity_type) === "run"));
  const recentRideLocal = sumBlock(inLast4Weeks.filter((a) => bucketSport(a.activity_type) === "ride"));
  const recentSwimLocal = sumBlock(inLast4Weeks.filter((a) => bucketSport(a.activity_type) === "swim"));
  const recentWalkHikeLocal = sumBlock(inLast4Weeks.filter((a) => bucketSport(a.activity_type) === "hike"));



  // YTD og "alltid"
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const ytdActs = activities.filter((a) => new Date(a.start_time_local) >= yearStart);
  const ytdRun = sumBlock(ytdActs.filter((a) => bucketSport(a.activity_type) === "run"));
  const ytdRide = sumBlock(ytdActs.filter((a) => bucketSport(a.activity_type) === "ride"));
  const ytdSwim = sumBlock(ytdActs.filter((a) => bucketSport(a.activity_type) === "swim"));
  const ytdWalkHike = sumBlock(ytdActs.filter((a) => bucketSport(a.activity_type) === "hike"));

  const allRun = sumBlock(runActivities);
  const allRide = sumBlock(rideActivities);
  const allSwim = sumBlock(activities.filter((a) => bucketSport(a.activity_type) === "swim"));
  const allWalkHike = sumBlock(walkHikeActivities);


  const biggestRide = rideActivities.reduce(
    (m, a) => Math.max(m, num(a.distance_meters)),
    0,
  );
  const biggestClimb = activities.reduce((m, a) => Math.max(m, num(a.elevation_gain)), 0);

  return {
    ok: true as const,
    source: "garmin" as const,
    athleteName: displayName(owner),
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
      mostKudos: null,
      mostAchievements: null,
      longestWalk: slim(records.longestWalk),
      longestRun: slim(records.longestRun),
      longestRide: slim(records.longestRide),
      fastestRide: slim(records.fastestRide),
      fastestWalk: slim(records.fastestWalk),
    },
    walkRecent: {
      count: walkHikeTotals.count,
      distance: walkHikeTotals.distance,
      movingTime: walkHikeTotals.moving_time,
      elevation: walkHikeTotals.elevation_gain,
    },
    totals: {
      recentRun: recentRunLocal,
      recentRide: recentRideLocal,
      recentSwim: recentSwimLocal,
      recentWalk: recentWalkHikeLocal,
      ytdRun: ytdRun.count > 0 ? ytdRun : null,
      ytdRide: ytdRide.count > 0 ? ytdRide : null,
      ytdSwim: ytdSwim.count > 0 ? ytdSwim : null,
      ytdWalk: ytdWalkHike.count > 0 ? ytdWalkHike : null,
      allRun: allRun.count > 0 ? allRun : null,
      allRide: allRide.count > 0 ? allRide : null,
      allSwim: allSwim.count > 0 ? allSwim : null,
      allWalk: allWalkHike.count > 0 ? allWalkHike : null,
      biggestRide: biggestRide > 0 ? biggestRide : null,
      biggestClimb: biggestClimb > 0 ? biggestClimb : null,
    },
    activities: activities.slice(0, 30).map((a) => slim(a)!),
  };
}

