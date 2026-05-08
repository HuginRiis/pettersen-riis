/**
 * Synker daglige stats, aktiviteter og søvn fra Garmin → Supabase.
 * Idempotent — kan kjøres flere ganger om dagen.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { garminGet } from "./garmin.server";

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

type DailySummary = {
  calendarDate?: string;
  totalSteps?: number;
  dailyStepGoal?: number;
  floorsAscended?: number;
  userFloorsAscendedGoal?: number;
  restingHeartRate?: number;
  totalKilocalories?: number;
  activeKilocalories?: number;
  totalDistanceMeters?: number;
  moderateIntensityMinutes?: number;
  vigorousIntensityMinutes?: number;
  intensityMinutesGoal?: number;
  bodyBatteryHighestValue?: number;
  bodyBatteryLowestValue?: number;
  averageStressLevel?: number;
};

export async function syncDaily(daysBack = 30): Promise<number> {
  let count = 0;
  for (let i = 0; i <= daysBack; i++) {
    const day = daysAgo(i);
    try {
      const ds = await garminGet<DailySummary>(
        `/usersummary-service/usersummary/daily/?calendarDate=${day}`,
      );
      if (!ds) continue;
      const row = {
        day,
        steps: ds.totalSteps ?? null,
        step_goal: ds.dailyStepGoal ?? null,
        floors_climbed: ds.floorsAscended ?? null,
        floors_goal: ds.userFloorsAscendedGoal ?? null,
        resting_heart_rate: ds.restingHeartRate ?? null,
        total_kilocalories: ds.totalKilocalories ? Math.round(ds.totalKilocalories) : null,
        active_kilocalories: ds.activeKilocalories ? Math.round(ds.activeKilocalories) : null,
        distance_meters: ds.totalDistanceMeters ? Math.round(ds.totalDistanceMeters) : null,
        moderate_intensity_minutes: ds.moderateIntensityMinutes ?? null,
        vigorous_intensity_minutes: ds.vigorousIntensityMinutes ?? null,
        intensity_minutes_goal: ds.intensityMinutesGoal ?? null,
        body_battery_high: ds.bodyBatteryHighestValue ?? null,
        body_battery_low: ds.bodyBatteryLowestValue ?? null,
        stress_average: ds.averageStressLevel ?? null,
        raw: ds as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      };
      await supabaseAdmin.from("garmin_daily_stats").upsert([row], { onConflict: "day" });
      count++;
    } catch (e) {
      console.error("[garmin-sync] daily failed", day, e);
    }
  }
  return count;
}

type ActivityRow = {
  activityId: number;
  activityName?: string;
  activityType?: { typeKey?: string };
  startTimeLocal?: string;
  duration?: number;
  distance?: number;
  calories?: number;
  averageHR?: number;
  maxHR?: number;
  elevationGain?: number;
  averageSpeed?: number;
};

export async function syncActivities(limit = 50): Promise<number> {
  const list = await garminGet<ActivityRow[]>(
    `/activitylist-service/activities/search/activities?limit=${limit}&start=0`,
  );
  let count = 0;
  for (const a of list ?? []) {
    if (!a.activityId || !a.startTimeLocal) continue;
    await supabaseAdmin
      .from("garmin_activities")
      .upsert([{
        garmin_activity_id: a.activityId,
        activity_type: a.activityType?.typeKey ?? null,
        activity_name: a.activityName ?? null,
        start_time_local: new Date(a.startTimeLocal.replace(" ", "T")).toISOString(),
        duration_seconds: a.duration ?? null,
        distance_meters: a.distance ?? null,
        calories: a.calories ? Math.round(a.calories) : null,
        average_hr: a.averageHR ? Math.round(a.averageHR) : null,
        max_hr: a.maxHR ? Math.round(a.maxHR) : null,
        elevation_gain: a.elevationGain ?? null,
        average_speed: a.averageSpeed ?? null,
        raw: a as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }], { onConflict: "garmin_activity_id" });
    count++;
  }
  return count;
}

type SleepDto = {
  dailySleepDTO?: {
    calendarDate?: string;
    sleepStartTimestampLocal?: number;
    sleepEndTimestampLocal?: number;
    sleepTimeSeconds?: number;
    deepSleepSeconds?: number;
    lightSleepSeconds?: number;
    remSleepSeconds?: number;
    awakeSleepSeconds?: number;
    averageSpO2Value?: number;
    averageRespirationValue?: number;
    sleepScores?: { overall?: { value?: number } };
  };
};

export async function syncSleep(daysBack = 14): Promise<number> {
  let count = 0;
  for (let i = 0; i <= daysBack; i++) {
    const day = daysAgo(i);
    try {
      const s = await garminGet<SleepDto>(`/wellness-service/wellness/dailySleepData?date=${day}`);
      const d = s?.dailySleepDTO;
      if (!d || !d.calendarDate) continue;
      await supabaseAdmin.from("garmin_sleep").upsert([{
        day: d.calendarDate,
        sleep_start: d.sleepStartTimestampLocal ? new Date(d.sleepStartTimestampLocal).toISOString() : null,
        sleep_end: d.sleepEndTimestampLocal ? new Date(d.sleepEndTimestampLocal).toISOString() : null,
        total_seconds: d.sleepTimeSeconds ?? null,
        deep_seconds: d.deepSleepSeconds ?? null,
        light_seconds: d.lightSleepSeconds ?? null,
        rem_seconds: d.remSleepSeconds ?? null,
        awake_seconds: d.awakeSleepSeconds ?? null,
        average_spo2: d.averageSpO2Value ?? null,
        average_respiration: d.averageRespirationValue ?? null,
        sleep_score: d.sleepScores?.overall?.value ?? null,
        raw: s as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }], { onConflict: "day" });
      count++;
    } catch (e) {
      console.error("[garmin-sync] sleep failed", day, e);
    }
  }
  return count;
}

export async function syncAll(trigger: string): Promise<{
  ok: boolean;
  daily: number;
  activities: number;
  sleep: number;
  duration_ms: number;
  error?: string;
}> {
  const t0 = Date.now();
  let daily = 0, activities = 0, sleep = 0;
  let error: string | undefined;
  try {
    daily = await syncDaily(30);
    activities = await syncActivities(50);
    sleep = await syncSleep(14);
  } catch (e) {
    error = (e as Error).message;
  }
  const duration_ms = Date.now() - t0;
  await supabaseAdmin.from("garmin_sync_log").insert({
    trigger, ok: !error, daily_count: daily, activities_count: activities,
    sleep_count: sleep, duration_ms, error: error ?? null,
  });
  return { ok: !error, daily, activities, sleep, duration_ms, error };
}
