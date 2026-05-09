import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getGarminOverview = createServerFn({ method: "GET" }).handler(async () => {
  const mod = await import("./garmin.server");
  const status = await mod.getGarminStatus();

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data: daily } = await supabaseAdmin
    .from("garmin_daily_stats")
    .select("day, steps, step_goal, floors_climbed, floors_goal, resting_heart_rate, average_heart_rate, weight_kg, total_kilocalories, active_kilocalories, distance_meters, moderate_intensity_minutes, vigorous_intensity_minutes, intensity_minutes_goal, body_battery_high, body_battery_low, stress_average")
    .gte("day", sinceIso)
    .order("day", { ascending: true });

  const { data: activities } = await supabaseAdmin
    .from("garmin_activities")
    .select("garmin_activity_id, activity_type, activity_name, start_time_local, duration_seconds, distance_meters, calories, average_hr, max_hr, elevation_gain")
    .order("start_time_local", { ascending: false })
    .limit(20);

  const { data: sleep } = await supabaseAdmin
    .from("garmin_sleep")
    .select("day, total_seconds, deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score, average_spo2, average_respiration, hrv_avg")
    .gte("day", sinceIso)
    .order("day", { ascending: true });

  const { data: lastSync } = await supabaseAdmin
    .from("garmin_sync_log")
    .select("ran_at, ok, daily_count, activities_count, sleep_count, error")
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    status,
    daily: daily ?? [],
    activities: activities ?? [],
    sleep: sleep ?? [],
    lastSync,
  };
});

export const garminLoginNow = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await import("./garmin.server");
  return mod.garminLogin();
});

export const garminSubmitMfaCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const code = String((d as { code?: string })?.code ?? "").trim();
    if (!/^\d{4,8}$/.test(code)) throw new Error("Sikkerhetskoden må være 4–8 siffer.");
    return { code };
  })
  .handler(async ({ data }) => {
    const mod = await import("./garmin.server");
    return mod.garminSubmitMfa(data.code);
  });

export const garminSyncNow = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await import("./garmin-sync.server");
  return mod.syncAll("manual");
});

export type GarminSyncSchedule = {
  interval_minutes: number;
  first_local_hour: number;
  last_local_hour: number;
};

const DEFAULT_SCHEDULE: GarminSyncSchedule = {
  interval_minutes: 1440,
  first_local_hour: 6,
  last_local_hour: 23,
};

export const getGarminSyncSchedule = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", "garmin_sync_schedule")
    .maybeSingle();
  const v = (data?.value as Partial<GarminSyncSchedule> | null) ?? null;
  return {
    interval_minutes: v?.interval_minutes ?? DEFAULT_SCHEDULE.interval_minutes,
    first_local_hour: v?.first_local_hour ?? DEFAULT_SCHEDULE.first_local_hour,
    last_local_hour: v?.last_local_hour ?? DEFAULT_SCHEDULE.last_local_hour,
  } as GarminSyncSchedule;
});

export const saveGarminSyncSchedule = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as Partial<GarminSyncSchedule>;
    const interval = Math.max(15, Math.min(1440, Number(x?.interval_minutes ?? 1440)));
    const first = Math.max(0, Math.min(23, Number(x?.first_local_hour ?? 6)));
    const last = Math.max(0, Math.min(23, Number(x?.last_local_hour ?? 23)));
    return { interval_minutes: interval, first_local_hour: first, last_local_hour: last };
  })
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("notification_settings")
      .upsert(
        [{ key: "garmin_sync_schedule", value: data, updated_at: new Date().toISOString() }],
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return data;
  });
