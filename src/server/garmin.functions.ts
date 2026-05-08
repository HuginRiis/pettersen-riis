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
    .select("day, total_seconds, deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score, average_spo2")
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
