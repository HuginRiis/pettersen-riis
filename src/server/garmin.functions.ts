import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { GARMIN_OWNERS, type GarminOwner } from "./garmin.shared";

const ownerSchema = z.object({ owner: z.enum(["arne", "rebekka"]).default("arne") });

export const getGarminOverview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const owner = data.owner as GarminOwner;
    const mod = await import("./garmin.server");
    const status = await mod.getGarminStatus(owner);

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString().slice(0, 10);

    const { data: daily } = await supabaseAdmin
      .from("garmin_daily_stats")
      .select("day, steps, step_goal, floors_climbed, floors_goal, resting_heart_rate, average_heart_rate, weight_kg, total_kilocalories, active_kilocalories, distance_meters, moderate_intensity_minutes, vigorous_intensity_minutes, intensity_minutes_goal, body_battery_high, body_battery_low, stress_average, vo2max_running, vo2max_cycling, endurance_score, fitness_age, training_status, training_load_focus, endurance_contributors")
      .eq("owner", owner)
      .gte("day", sinceIso)
      .order("day", { ascending: true });

    const { data: activities } = await supabaseAdmin
      .from("garmin_activities")
      .select("garmin_activity_id, activity_type, activity_name, start_time_local, duration_seconds, distance_meters, calories, average_hr, max_hr, elevation_gain")
      .eq("owner", owner)
      .order("start_time_local", { ascending: false })
      .limit(20);

    const { data: sleep } = await supabaseAdmin
      .from("garmin_sleep")
      .select("day, total_seconds, deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score, average_spo2, average_respiration, hrv_avg")
      .eq("owner", owner)
      .gte("day", sinceIso)
      .order("day", { ascending: true });

    const intradaySince = new Date();
    intradaySince.setDate(intradaySince.getDate() - 7);
    const { data: intraday } = await supabaseAdmin
      .from("garmin_intraday")
      .select("day, hour, heart_rate_avg, heart_rate_max, stress_avg, body_battery")
      .eq("owner", owner)
      .gte("day", intradaySince.toISOString().slice(0, 10))
      .order("day", { ascending: true })
      .order("hour", { ascending: true });

    const { data: lastSync } = await supabaseAdmin
      .from("garmin_sync_log")
      .select("ran_at, ok, daily_count, activities_count, sleep_count, error")
      .eq("owner", owner)
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { owner, status, daily: daily ?? [], activities: activities ?? [], sleep: sleep ?? [], intraday: intraday ?? [], lastSync };
  });

export const garminLoginNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const mod = await import("./garmin.server");
    return mod.garminLogin(data.owner as GarminOwner);
  });

export const garminSubmitMfaCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as { code?: string; owner?: string };
    const code = String(x?.code ?? "").trim();
    if (!/^\d{4,8}$/.test(code)) throw new Error("Sikkerhetskoden må være 4–8 siffer.");
    const owner = (x?.owner === "rebekka" ? "rebekka" : "arne") as GarminOwner;
    return { code, owner };
  })
  .handler(async ({ data }) => {
    const mod = await import("./garmin.server");
    return mod.garminSubmitMfa(data.owner, data.code);
  });

export const garminSyncNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = (d ?? {}) as { owner?: string };
    return { owner: (x.owner === "rebekka" || x.owner === "arne") ? (x.owner as GarminOwner) : null };
  })
  .handler(async ({ data }) => {
    const mod = await import("./garmin-sync.server");
    if (data.owner) return mod.syncOne(data.owner, "manual");
    return mod.syncAll("manual");
  });

export type GarminSyncSchedule = {
  interval_minutes: number;
  first_local_hour: number;
  last_local_hour: number;
};

// Nattevindu sperret hardt 21:00–05:59 i agenda-cron. Default: hver time 06–20.
const DEFAULT_SCHEDULE: GarminSyncSchedule = { interval_minutes: 60, first_local_hour: 6, last_local_hour: 20 };

function scheduleKey(owner: GarminOwner): string {
  return `garmin_sync_schedule_${owner}`;
}

export const getGarminSyncSchedule = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const owner = data.owner as GarminOwner;
    // Try owner-specific key first, then legacy "garmin_sync_schedule" for arne fallback
    const keys = owner === "arne"
      ? [scheduleKey(owner), "garmin_sync_schedule"]
      : [scheduleKey(owner)];
    const { data: rows } = await supabaseAdmin
      .from("notification_settings")
      .select("key, value")
      .in("key", keys);
    const byKey = new Map<string, Partial<GarminSyncSchedule>>();
    for (const r of (rows ?? []) as Array<{ key: string; value: Partial<GarminSyncSchedule> | null }>) {
      if (r.value) byKey.set(r.key, r.value);
    }
    const v = byKey.get(scheduleKey(owner)) ?? byKey.get("garmin_sync_schedule") ?? null;
    return {
      interval_minutes: v?.interval_minutes ?? DEFAULT_SCHEDULE.interval_minutes,
      first_local_hour: v?.first_local_hour ?? DEFAULT_SCHEDULE.first_local_hour,
      last_local_hour: v?.last_local_hour ?? DEFAULT_SCHEDULE.last_local_hour,
    } as GarminSyncSchedule;
  });

export const saveGarminSyncSchedule = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as Partial<GarminSyncSchedule> & { owner?: string };
    const interval = Math.max(15, Math.min(1440, Number(x?.interval_minutes ?? 60)));
    const first = Math.max(6, Math.min(20, Number(x?.first_local_hour ?? 6)));
    const last = Math.max(6, Math.min(20, Number(x?.last_local_hour ?? 20)));
    const owner = (x?.owner === "rebekka" ? "rebekka" : "arne") as GarminOwner;
    return { owner, interval_minutes: interval, first_local_hour: first, last_local_hour: last };
  })
  .handler(async ({ data }) => {
    const { owner, ...sched } = data;
    const { error } = await supabaseAdmin
      .from("notification_settings")
      .upsert([{ key: scheduleKey(owner), value: sched, updated_at: new Date().toISOString() }], { onConflict: "key" });
    if (error) throw new Error(error.message);
    return sched;
  });

export const listGarminDevices = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const owner = data.owner as GarminOwner;
    const { data: rows, error } = await supabaseAdmin
      .from("garmin_devices")
      .select("id, product_id, name, image_url, is_default, last_used_at, register_date")
      .eq("owner", owner)
      .order("last_used_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return { devices: rows ?? [] };
  });

export const setDefaultGarminDevice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as { owner?: string; deviceId?: string };
    const owner = (x?.owner === "rebekka" ? "rebekka" : "arne") as GarminOwner;
    const deviceId = String(x?.deviceId ?? "").trim();
    if (!deviceId) throw new Error("deviceId mangler");
    return { owner, deviceId };
  })
  .handler(async ({ data }) => {
    const { owner, deviceId } = data;
    const { error: e1 } = await supabaseAdmin
      .from("garmin_devices")
      .update({ is_default: false } as never)
      .eq("owner", owner);
    if (e1) throw new Error(e1.message);
    const { data: row, error: e2 } = await supabaseAdmin
      .from("garmin_devices")
      .update({ is_default: true } as never)
      .eq("id", deviceId)
      .eq("owner", owner)
      .select("name, product_id, image_url")
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    if (!row) throw new Error("Klokken finnes ikke");

    const { data: tok } = await supabaseAdmin
      .from("garmin_tokens")
      .select("id")
      .eq("owner", owner)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tok) {
      await supabaseAdmin.from("garmin_tokens").update({
        device_name: (row as any).name,
        device_product_id: (row as any).product_id,
        device_image_url: (row as any).image_url,
        device_updated_at: new Date().toISOString(),
      } as never).eq("id", (tok as any).id);
    }
    return { ok: true };
  });

export { GARMIN_OWNERS };
export type { GarminOwner };
