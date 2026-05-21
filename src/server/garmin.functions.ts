import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { GARMIN_OWNERS, type GarminOwner } from "./garmin.shared";

const ownerSchema = z.object({ owner: z.enum(["arne", "rebekka"]).default("arne") });

const DAILY_LITE_COLS = "day, steps, step_goal, floors_climbed, floors_goal, resting_heart_rate, average_heart_rate, weight_kg, total_kilocalories, active_kilocalories, distance_meters, moderate_intensity_minutes, vigorous_intensity_minutes, intensity_minutes_goal, body_battery_high, body_battery_low, stress_average, vo2max_running, vo2max_cycling, endurance_score, fitness_age, training_status, training_load_focus, endurance_contributors";
const SLEEP_LITE_COLS = "day, total_seconds, deep_seconds, light_seconds, rem_seconds, awake_seconds, sleep_score, average_spo2, average_respiration, hrv_avg, sleep_start, sleep_end";
const GARMIN_CACHE_TTL_MS = 60_000;

const garminCache = new Map<string, { expires: number; value: unknown }>();

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = garminCache.get(key);
  if (hit && hit.expires > now) return await (hit.value as T | Promise<T>);
  const pending = loader();
  garminCache.set(key, { expires: now + GARMIN_CACHE_TTL_MS, value: pending });
  try {
    const value = await pending;
    garminCache.set(key, { expires: Date.now() + GARMIN_CACHE_TTL_MS, value });
    return value;
  } catch (error) {
    garminCache.delete(key);
    throw error;
  }
}

function clearGarminCache(owner?: GarminOwner | null) {
  for (const key of garminCache.keys()) {
    if (!owner || key.includes(`:${owner}:`) || key.endsWith(`:${owner}`)) garminCache.delete(key);
  }
}

async function loadStatus(owner: GarminOwner) {
  const { data } = await supabaseAdmin
    .from("garmin_tokens")
    .select("username, oauth2_expires_at, last_login_at, oauth1_token, pending_mfa, device_name, device_image_url")
    .eq("owner", owner)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    connected: !!data?.oauth1_token,
    username: data?.username ?? null,
    expires_at: data?.oauth2_expires_at ?? null,
    last_login_at: data?.last_login_at ?? null,
    mfa_pending: !!(data as { pending_mfa?: unknown } | null)?.pending_mfa,
    device_name: (data as any)?.device_name ?? null,
    device_image_url: (data as any)?.device_image_url ?? null,
  };
}

async function loadDaily(owner: GarminOwner, sinceIso: string, withRaw = true) {
  const cols = withRaw ? `${DAILY_LITE_COLS}, raw` : DAILY_LITE_COLS;
  const { data: dailyRows } = await supabaseAdmin
    .from("garmin_daily_stats")
    .select(cols)
    .eq("owner", owner)
    .gte("day", sinceIso)
    .order("day", { ascending: true });

  if (!withRaw) return (dailyRows ?? []) as any[];

  return (dailyRows ?? []).map((row) => {
    const r: any = (row as any).raw ?? {};
    const { raw: _raw, ...rest } = row as any;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      ...rest,
      max_heart_rate: num(r.maxHeartRate),
      max_avg_heart_rate: num(r.maxAvgHeartRate),
      bmr_kilocalories: num(r.bmrKilocalories),
      consumed_kilocalories: num(r.consumedKilocalories),
      remaining_kilocalories: num(r.remainingKilocalories),
      floors_ascended: num(r.floorsAscended),
      floors_descended: num(r.floorsDescended),
      floors_ascended_meters: num(r.floorsAscendedInMeters),
      floors_descended_meters: num(r.floorsDescendedInMeters),
      avg_altitude_meters: num(r.averageMonitoringEnvironmentAltitude),
      highly_active_seconds: num(r.highlyActiveSeconds),
      active_seconds: num(r.activeSeconds),
      sedentary_seconds: num(r.sedentarySeconds),
      sleeping_seconds: num(r.sleepingSeconds),
      max_stress: num(r.maxStressLevel),
      high_stress_seconds: num(r.highStressDuration),
      medium_stress_seconds: num(r.mediumStressDuration),
      low_stress_seconds: num(r.lowStressDuration),
      rest_stress_seconds: num(r.restStressDuration),
      activity_stress_seconds: num(r.activityStressDuration),
      abnormal_hr_alerts: num(r.abnormalHeartRateAlertsCount),
      latest_spo2: num(r.latestSpo2),
      lowest_spo2: num(r.lowestSpo2),
      latest_respiration: num(r.latestRespirationValue),
      highest_respiration: num(r.highestRespirationValue),
      lowest_respiration: num(r.lowestRespirationValue),
      body_battery_charged: num(r.bodyBatteryChargedValue),
      body_battery_at_wake: num(r.bodyBatteryAtWakeTime),
      body_battery_recent: num(r.bodyBatteryMostRecentValue),
      body_battery_during_sleep: num(r.bodyBatteryDuringSleep),
      last_7d_avg_rhr: num(r.lastSevenDaysAvgRestingHeartRate),
    };
  });
}

async function loadSleep(owner: GarminOwner, sinceIso: string, withRaw = true) {
  const cols = withRaw ? `${SLEEP_LITE_COLS}, raw` : SLEEP_LITE_COLS;
  const { data: sleepRows } = await supabaseAdmin
    .from("garmin_sleep")
    .select(cols)
    .eq("owner", owner)
    .gte("day", sinceIso)
    .order("day", { ascending: true });

  if (!withRaw) return (sleepRows ?? []) as any[];

  return (sleepRows ?? []).map((s) => {
    const r: any = (s as any).raw ?? {};
    const dto: any = r.dailySleepDTO ?? {};
    const scores: any = dto.sleepScores ?? {};
    const need: any = dto.sleepNeed ?? {};
    const align: any = dto.sleepAlignment ?? {};
    const { raw: _raw, ...rest } = s as any;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const str = (v: unknown) => (typeof v === "string" && v.length ? v : null);
    return {
      ...rest,
      skin_temp_dev_c: num(r.avgSkinTempDeviationC),
      skin_temp_dev_f: num(r.avgSkinTempDeviationF),
      skin_temp_calibration_days: num(r.skinTempCalibrationDays),
      avg_overnight_hrv: num(r.avgOvernightHrv),
      hrv_status: str(r.hrvStatus),
      avg_sleep_stress: num(dto.avgSleepStress),
      nap_time_seconds: num(dto.napTimeSeconds),
      awake_count: num(dto.awakeCount),
      sleep_avg_hr: num(dto.avgHeartRate),
      sleep_score_qualifier: str(scores?.overall?.qualifierKey),
      sleep_need_actual_min: num(need.actual),
      sleep_need_baseline_min: num(need.baseline),
      sleep_need_feedback: str(need.feedback),
      sleep_history_adjustment: str(need.sleepHistoryAdjustment),
      hrv_adjustment: str(need.hrvAdjustment),
      nap_adjustment: str(need.napAdjustment),
      recommended_bedtime_start_mins: num(need.recommendedBedtimeStartMins),
      recommended_bedtime_end_mins: num(need.recommendedBedtimeEndMins),
      sleep_alignment_status: str(align.status),
      rem_pct: num(scores?.remPercentage?.value),
      deep_pct: num(scores?.deepPercentage?.value),
      light_pct: num(scores?.lightPercentage?.value),
      lowest_spo2_value: num(dto.lowestSpO2Value),
      highest_spo2_value: num(dto.highestSpO2Value),
    };
  });
}

async function loadLastSync(owner: GarminOwner) {
  const { data: lastSync } = await supabaseAdmin
    .from("garmin_sync_log")
    .select("ran_at, ok, daily_count, activities_count, sleep_count, error")
    .eq("owner", owner)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return lastSync;
}

async function loadActivities(owner: GarminOwner) {
  const { data: activities } = await supabaseAdmin
    .from("garmin_activities")
    .select("garmin_activity_id, activity_type, activity_name, start_time_local, duration_seconds, distance_meters, calories, average_hr, max_hr, elevation_gain")
    .eq("owner", owner)
    .order("start_time_local", { ascending: false })
    .limit(20);
  return activities ?? [];
}

async function loadIntraday(owner: GarminOwner) {
  const intradaySince = new Date();
  intradaySince.setDate(intradaySince.getDate() - 7);
  const { data: intraday } = await supabaseAdmin
    .from("garmin_intraday")
    .select("day, hour, heart_rate_avg, heart_rate_max, stress_avg, body_battery")
    .eq("owner", owner)
    .gte("day", intradaySince.toISOString().slice(0, 10))
    .order("day", { ascending: true })
    .order("hour", { ascending: true });
  return intraday ?? [];
}

export const getGarminOverview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const owner = data.owner as GarminOwner;
    const mod = await import("./garmin.server");
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString().slice(0, 10);

    const [status, daily, sleep, activities, intraday, lastSync] = await Promise.all([
      mod.getGarminStatus(owner),
      loadDaily(owner, sinceIso),
      loadSleep(owner, sinceIso),
      loadActivities(owner),
      loadIntraday(owner),
      loadLastSync(owner),
    ]);

    return { owner, status, daily, activities, sleep, intraday, lastSync };
  });

// Fase 1: rask kjerne — kun hovedtall (uten raw-projeksjoner, aktiviteter, intraday).
export const getGarminCore = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const owner = data.owner as GarminOwner;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString().slice(0, 10);

    return cached(`core:${owner}:${sinceIso}`, async () => {
      const [status, daily, sleep, lastSync] = await Promise.all([
        loadStatus(owner),
        loadDaily(owner, sinceIso, false),
        loadSleep(owner, sinceIso, false),
        loadLastSync(owner),
      ]);

      return { owner, status, daily, sleep, lastSync };
    });
  });

// Fase 2a: detaljer — full daily/sleep med raw-projeksjoner (hentes når brukeren åpner "Vis detaljer").
export const getGarminDetails = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const owner = data.owner as GarminOwner;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceIso = since.toISOString().slice(0, 10);
    return cached(`details:${owner}:${sinceIso}`, async () => {
      const [daily, sleep] = await Promise.all([
        loadDaily(owner, sinceIso, true),
        loadSleep(owner, sinceIso, true),
      ]);
      return { owner, daily, sleep };
    });
  });

// Fase 2: tunge ekstra-data — aktiviteter og intraday-puls.
export const getGarminExtras = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const owner = data.owner as GarminOwner;
    return cached(`extras:${owner}`, async () => {
      const [activities, intraday] = await Promise.all([
        loadActivities(owner),
        loadIntraday(owner),
      ]);
      return { owner, activities, intraday };
    });
  });


export const garminLoginNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const mod = await import("./garmin.server");
    const owner = data.owner as GarminOwner;
    const result = await mod.garminLogin(owner);
    clearGarminCache(owner);
    return result;
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
    const result = await mod.garminSubmitMfa(data.owner, data.code);
    clearGarminCache(data.owner);
    return result;
  });

export const garminSyncNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = (d ?? {}) as { owner?: string };
    return { owner: (x.owner === "rebekka" || x.owner === "arne") ? (x.owner as GarminOwner) : null };
  })
  .handler(async ({ data }) => {
    const mod = await import("./garmin-sync.server");
    if (data.owner) {
      const result = await mod.syncOne(data.owner, "manual");
      clearGarminCache(data.owner);
      return result;
    }
    const result = await mod.syncAll("manual");
    clearGarminCache();
    return result;
  });

export type GarminSyncSchedule = {
  interval_minutes: number;
  first_local_hour: number;
  last_local_hour: number;
  extra_sync_enabled: boolean;
  extra_sync_time: string; // HH:MM in Europe/Oslo
};

// Nattevindu sperret hardt 21:00–05:59 i agenda-cron. Default: hver time 06–20.
const DEFAULT_SCHEDULE: GarminSyncSchedule = {
  interval_minutes: 60,
  first_local_hour: 6,
  last_local_hour: 20,
  extra_sync_enabled: false,
  extra_sync_time: "12:00",
};

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
      extra_sync_enabled: !!v?.extra_sync_enabled,
      extra_sync_time: typeof v?.extra_sync_time === "string" && /^\d{2}:\d{2}$/.test(v.extra_sync_time)
        ? v.extra_sync_time
        : DEFAULT_SCHEDULE.extra_sync_time,
    } as GarminSyncSchedule;
  });

export const saveGarminSyncSchedule = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = d as Partial<GarminSyncSchedule> & { owner?: string };
    const interval = Math.max(15, Math.min(1440, Number(x?.interval_minutes ?? 60)));
    const first = Math.max(6, Math.min(20, Number(x?.first_local_hour ?? 6)));
    const last = Math.max(6, Math.min(20, Number(x?.last_local_hour ?? 20)));
    const owner = (x?.owner === "rebekka" ? "rebekka" : "arne") as GarminOwner;
    const extraEnabled = !!x?.extra_sync_enabled;
    const extraTimeRaw = typeof x?.extra_sync_time === "string" ? x.extra_sync_time : "12:00";
    const extraTime = /^\d{2}:\d{2}$/.test(extraTimeRaw) ? extraTimeRaw : "12:00";
    return {
      owner,
      interval_minutes: interval,
      first_local_hour: first,
      last_local_hour: last,
      extra_sync_enabled: extraEnabled,
      extra_sync_time: extraTime,
    };
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

export const ensureGarminDeviceHero = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const x = (d ?? {}) as { owner?: string; generate?: boolean; force?: boolean };
    const owner = (x.owner === "rebekka" ? "rebekka" : "arne") as GarminOwner;
    return { owner, generate: !!x.generate, force: !!x.force };
  })
  .handler(async ({ data }) => {
    const { owner, generate, force } = data;
    // Hent default-klokken
    const { data: dev } = await supabaseAdmin
      .from("garmin_devices")
      .select("id, name, image_transparent_url")
      .eq("owner", owner)
      .eq("is_default", true)
      .maybeSingle();
    if (!dev) return { url: null as string | null };
    const row = dev as { id: string; name: string; image_transparent_url: string | null };
    if (row.image_transparent_url && !force) return { url: row.image_transparent_url };
    if (!generate) return { url: null as string | null };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const isScale = /scale/i.test(row.name);
    const deviceKind = isScale ? "smart bathroom scale" : "smartwatch";
    const styleForOwner =
      owner === "rebekka"
        ? `with a LIGHT/WHITE silicone strap and a polished GOLD bezel ring around the watch face, elegant feminine styling`
        : `with a dark/graphite strap and a brushed steel bezel`;
    // Solid bakgrunn som matcher husets banner-farge — unngår transparent/sjakkbrett
    const bgDescription =
      owner === "rebekka"
        ? "a deep dark crimson/burgundy background (#4c0519), smoothly fading to near-black at the edges"
        : "a deep dark slate background (#0f172a), smoothly fading to near-black at the edges";
    const prompt = `A high-quality, photo-realistic product render of a Garmin "${row.name}" ${deviceKind}${
      isScale ? "" : `, ${styleForOwner}`
    }, centered, front-facing, on ${bgDescription}. The background must be a SOLID painted gradient (NOT transparent, NOT a checkerboard pattern). The product is positioned slightly to the right side of the frame so the left side has more empty background space. No text, no logos overlay, soft studio lighting, sharp detail, cinematic dark moody atmosphere.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI image error (${aiRes.status}): ${t.slice(0, 200)}`);
    }
    const json = await aiRes.json();
    const dataUrl: string | undefined =
      json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl || !dataUrl.startsWith("data:")) {
      throw new Error("AI returnerte ingen bilde-data");
    }
    const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) throw new Error("Ugyldig bilde-data");
    const mime = m[1];
    const ext = mime.split("/")[1] ?? "png";
    const buf = Buffer.from(m[2], "base64");
    const path = `${owner}/${row.id}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("garmin-devices")
      .upload(path, buf, { contentType: mime, upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabaseAdmin.storage.from("garmin-devices").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    await supabaseAdmin
      .from("garmin_devices")
      .update({ image_transparent_url: url } as never)
      .eq("id", row.id);
    return { url };
  });

export { GARMIN_OWNERS };
export type { GarminOwner };
