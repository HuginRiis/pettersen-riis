/**
 * Synker daglige stats, aktiviteter og søvn fra Garmin → Supabase per person (owner).
 * Idempotent — kan kjøres flere ganger om dagen.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { garminGet, GARMIN_OWNERS, type GarminOwner } from "./garmin.server";

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
  averageHeartRate?: number;
  averageHeartRateInBeatsPerMinute?: number;
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

type Vo2Resp = {
  generic?: { vo2MaxValue?: number; fitnessAge?: number };
  cycling?: { vo2MaxValue?: number };
  heatAltitudeAcclimation?: unknown;
};
type EnduranceResp = {
  enduranceScore?: number;
  overallScore?: number;
  classificationValue?: number;
};
type TrainingStatusResp = {
  mostRecentTrainingStatus?: {
    latestTrainingStatusData?: Record<string, { trainingStatusFeedbackPhrase?: string; trainingStatus?: number }>;
  };
  mostRecentTrainingLoadBalance?: {
    metricsTrainingLoadBalanceDTOMap?: Record<string, {
      monthlyLoadAerobicLow?: number;
      monthlyLoadAerobicHigh?: number;
      monthlyLoadAnaerobic?: number;
      trainingBalanceFeedbackPhrase?: string;
      monthlyLoadAerobicLowTargetMin?: number;
      monthlyLoadAerobicLowTargetMax?: number;
      monthlyLoadAerobicHighTargetMin?: number;
      monthlyLoadAerobicHighTargetMax?: number;
      monthlyLoadAnaerobicTargetMin?: number;
      monthlyLoadAnaerobicTargetMax?: number;
    }>;
  };
};

const TRAINING_STATUS_LABELS: Record<number, string> = {
  0: "Ingen status",
  1: "Detrenert",
  2: "Restitusjon",
  3: "Vedlikehold",
  4: "Produktiv",
  5: "Topp",
  6: "Overreaching",
  7: "Ubalansert",
  8: "Ingen status",
  9: "Anstrengende",
};

async function fetchFitnessExtras(owner: GarminOwner, day: string): Promise<{
  vo2max_running: number | null;
  vo2max_cycling: number | null;
  endurance_score: number | null;
  fitness_age: number | null;
  training_status: string | null;
  training_load_focus: Record<string, unknown> | null;
}> {
  const out = {
    vo2max_running: null as number | null,
    vo2max_cycling: null as number | null,
    endurance_score: null as number | null,
    fitness_age: null as number | null,
    training_status: null as string | null,
    training_load_focus: null as Record<string, unknown> | null,
  };
  try {
    // maxmet returnerer enten et objekt eller en liste (latest vs daily-range)
    const vRaw = await garminGet<Vo2Resp | Vo2Resp[]>(owner, `/metrics-service/metrics/maxmet/${day}/${day}`);
    const v: Vo2Resp | undefined = Array.isArray(vRaw) ? vRaw[vRaw.length - 1] : vRaw ?? undefined;
    if (typeof v?.generic?.vo2MaxValue === "number") out.vo2max_running = v.generic.vo2MaxValue;
    if (typeof v?.cycling?.vo2MaxValue === "number") out.vo2max_cycling = v.cycling.vo2MaxValue;
    if (typeof v?.generic?.fitnessAge === "number") out.fitness_age = v.generic.fitnessAge;
  } catch {}
  if (out.fitness_age == null) {
    try {
      const fa = await garminGet<any>(
        owner,
        `/fitnessage-service/fitnessage/${day}`,
      );
      console.log(`[garmin-debug ${owner}] fitnessage:`, JSON.stringify(fa).slice(0, 400));
      if (typeof fa?.fitnessAge === "number") out.fitness_age = fa.fitnessAge;
      else if (typeof fa?.chronologicalAge === "number" && typeof fa?.normalizedAge === "number") {
        out.fitness_age = fa.normalizedAge;
      }
    } catch (e) { console.log(`[garmin-debug ${owner}] fitnessage err:`, (e as Error).message); }
  }
  try {
    const e = await garminGet<any>(owner, `/metrics-service/metrics/endurancescore?calendarDate=${day}`);
    console.log(`[garmin-debug ${owner}] endurance:`, JSON.stringify(e).slice(0, 400));
    const score = e?.overallScore ?? e?.enduranceScore ?? e?.score;
    if (typeof score === "number") out.endurance_score = score;
  } catch (e) { console.log(`[garmin-debug ${owner}] endurance err:`, (e as Error).message); }
  try {
    const t = await garminGet<TrainingStatusResp>(owner, `/metrics-service/metrics/trainingstatus/aggregated/${day}`);
    const stat = t?.mostRecentTrainingStatus?.latestTrainingStatusData;
    if (stat) {
      const first = Object.values(stat)[0];
      if (first?.trainingStatusFeedbackPhrase) {
        out.training_status = first.trainingStatusFeedbackPhrase
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
      } else if (typeof first?.trainingStatus === "number") {
        out.training_status = TRAINING_STATUS_LABELS[first.trainingStatus] ?? `Status ${first.trainingStatus}`;
      }
    }
    const bal = t?.mostRecentTrainingLoadBalance?.metricsTrainingLoadBalanceDTOMap;
    if (bal) {
      const first = Object.values(bal)[0];
      if (first) {
        out.training_load_focus = {
          aerobic_low: first.monthlyLoadAerobicLow ?? null,
          aerobic_high: first.monthlyLoadAerobicHigh ?? null,
          anaerobic: first.monthlyLoadAnaerobic ?? null,
          feedback: first.trainingBalanceFeedbackPhrase ?? null,
          aerobic_low_target: first.monthlyLoadAerobicLowTargetMin != null && first.monthlyLoadAerobicLowTargetMax != null
            ? [first.monthlyLoadAerobicLowTargetMin, first.monthlyLoadAerobicLowTargetMax] : null,
          aerobic_high_target: first.monthlyLoadAerobicHighTargetMin != null && first.monthlyLoadAerobicHighTargetMax != null
            ? [first.monthlyLoadAerobicHighTargetMin, first.monthlyLoadAerobicHighTargetMax] : null,
          anaerobic_target: first.monthlyLoadAnaerobicTargetMin != null && first.monthlyLoadAnaerobicTargetMax != null
            ? [first.monthlyLoadAnaerobicTargetMin, first.monthlyLoadAnaerobicTargetMax] : null,
        };
      }
    }
  } catch {}
  return out;
}

export async function syncDaily(owner: GarminOwner, daysBack = 30): Promise<number> {
  let count = 0;
  // Hent kondisjon/treningsstatus kun for nyeste dag — verdiene endrer seg sjelden og er tunge å hente.
  const todayKey = daysAgo(0);
  const fitnessExtras = await fetchFitnessExtras(owner, todayKey);
  for (let i = 0; i <= daysBack; i++) {
    const day = daysAgo(i);
    try {
      const ds = await garminGet<DailySummary>(owner, `/usersummary-service/usersummary/daily/?calendarDate=${day}`);
      if (!ds) continue;
      let weightKg: number | null = null;
      try {
        const w = await garminGet<{ dateWeightList?: Array<{ weight?: number }>; totalAverage?: { weight?: number } }>(
          owner, `/weight-service/weight/dayview/${day}?includeAll=true`,
        );
        const grams = w?.totalAverage?.weight ?? w?.dateWeightList?.[0]?.weight ?? null;
        if (typeof grams === "number" && grams > 0) weightKg = Math.round((grams / 1000) * 100) / 100;
      } catch {}
      const avgHr = ds.averageHeartRateInBeatsPerMinute ?? ds.averageHeartRate ?? null;
      const isLatest = day === todayKey;
      const row = {
        owner, day,
        steps: ds.totalSteps ?? null,
        step_goal: ds.dailyStepGoal ?? null,
        floors_climbed: ds.floorsAscended ?? null,
        floors_goal: ds.userFloorsAscendedGoal ?? null,
        resting_heart_rate: ds.restingHeartRate ?? null,
        average_heart_rate: avgHr ? Math.round(avgHr) : null,
        weight_kg: weightKg,
        total_kilocalories: ds.totalKilocalories ? Math.round(ds.totalKilocalories) : null,
        active_kilocalories: ds.activeKilocalories ? Math.round(ds.activeKilocalories) : null,
        distance_meters: ds.totalDistanceMeters ? Math.round(ds.totalDistanceMeters) : null,
        moderate_intensity_minutes: ds.moderateIntensityMinutes ?? null,
        vigorous_intensity_minutes: ds.vigorousIntensityMinutes ?? null,
        intensity_minutes_goal: ds.intensityMinutesGoal ?? null,
        body_battery_high: ds.bodyBatteryHighestValue ?? null,
        body_battery_low: ds.bodyBatteryLowestValue ?? null,
        stress_average: ds.averageStressLevel ?? null,
        raw: ds as any,
        updated_at: new Date().toISOString(),
        ...(isLatest ? fitnessExtras : {}),
      };
      await supabaseAdmin.from("garmin_daily_stats").upsert([row as never], { onConflict: "owner,day" });
      count++;
    } catch (e) {
      console.error(`[garmin-sync:${owner}] daily failed`, day, e);
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

export async function syncActivities(owner: GarminOwner, limit = 50): Promise<number> {
  const list = await garminGet<ActivityRow[]>(owner, `/activitylist-service/activities/search/activities?limit=${limit}&start=0`);
  let count = 0;
  for (const a of list ?? []) {
    if (!a.activityId || !a.startTimeLocal) continue;
    await supabaseAdmin
      .from("garmin_activities")
      .upsert([{
        owner,
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
        raw: a as any,
        updated_at: new Date().toISOString(),
      }], { onConflict: "owner,garmin_activity_id" });
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
    avgOvernightHrv?: number;
    sleepScores?: { overall?: { value?: number } };
  };
  avgOvernightHrv?: number;
  hrvData?: { value?: number };
};

export async function syncSleep(owner: GarminOwner, daysBack = 14): Promise<number> {
  let count = 0;
  for (let i = 0; i <= daysBack; i++) {
    const day = daysAgo(i);
    try {
      const s = await garminGet<SleepDto>(owner, `/wellness-service/wellness/dailySleepData?date=${day}`);
      const d = s?.dailySleepDTO;
      if (!d || !d.calendarDate) continue;
      await supabaseAdmin.from("garmin_sleep").upsert([{
        owner,
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
        hrv_avg: d.avgOvernightHrv ?? s?.avgOvernightHrv ?? s?.hrvData?.value ?? null,
        raw: s as any,
        updated_at: new Date().toISOString(),
      }], { onConflict: "owner,day" });
      count++;
    } catch (e) {
      console.error(`[garmin-sync:${owner}] sleep failed`, day, e);
    }
  }
  return count;
}

type IntradayDto = {
  heartRateValues?: Array<[number, number | null]>;
  stressValuesArray?: Array<[number, number | null]>;
  bodyBatteryValuesArray?: Array<[number, ...unknown[]]>;
};

function bucketAvg(buckets: Map<number, { sum: number; n: number; max: number }>, hour: number, val: number) {
  const cur = buckets.get(hour) ?? { sum: 0, n: 0, max: 0 };
  cur.sum += val; cur.n += 1; if (val > cur.max) cur.max = val;
  buckets.set(hour, cur);
}

export async function syncIntraday(owner: GarminOwner, daysBack = 1): Promise<number> {
  let count = 0;
  for (let i = 0; i <= daysBack; i++) {
    const day = daysAgo(i);
    try {
      const hr = await garminGet<IntradayDto>(owner, `/wellness-service/wellness/dailyHeartRate?date=${day}`);
      const stress = await garminGet<IntradayDto>(owner, `/wellness-service/wellness/dailyStress/${day}`);

      const hrBuckets = new Map<number, { sum: number; n: number; max: number }>();
      for (const [ts, v] of hr?.heartRateValues ?? []) {
        if (typeof v !== "number" || v <= 0) continue;
        bucketAvg(hrBuckets, new Date(ts).getHours(), v);
      }
      const stressBuckets = new Map<number, { sum: number; n: number; max: number }>();
      for (const [ts, v] of stress?.stressValuesArray ?? []) {
        if (typeof v !== "number" || v < 0) continue;
        bucketAvg(stressBuckets, new Date(ts).getHours(), v);
      }
      const bbBuckets = new Map<number, { sum: number; n: number; max: number }>();
      for (const row of stress?.bodyBatteryValuesArray ?? []) {
        const ts = row[0] as number;
        const v = (row[2] ?? row[1]) as number | null;
        if (typeof v !== "number" || v <= 0) continue;
        bucketAvg(bbBuckets, new Date(ts).getHours(), v);
      }

      const rows: Array<{ owner: GarminOwner; day: string; hour: number; heart_rate_avg: number | null; heart_rate_max: number | null; stress_avg: number | null; body_battery: number | null; updated_at: string }> = [];
      for (let h = 0; h < 24; h++) {
        const hb = hrBuckets.get(h);
        const sb = stressBuckets.get(h);
        const bb = bbBuckets.get(h);
        if (!hb && !sb && !bb) continue;
        rows.push({
          owner, day, hour: h,
          heart_rate_avg: hb ? Math.round(hb.sum / hb.n) : null,
          heart_rate_max: hb ? Math.round(hb.max) : null,
          stress_avg: sb ? Math.round(sb.sum / sb.n) : null,
          body_battery: bb ? Math.round(bb.sum / bb.n) : null,
          updated_at: new Date().toISOString(),
        });
      }
      if (rows.length > 0) {
        await supabaseAdmin.from("garmin_intraday").upsert(rows, { onConflict: "owner,day,hour" });
        count += rows.length;
      }
    } catch (e) {
      console.error(`[garmin-sync:${owner}] intraday failed`, day, e);
    }
  }
  return count;
}

export async function syncOne(owner: GarminOwner, trigger: string): Promise<{
  ok: boolean; owner: GarminOwner; daily: number; activities: number; sleep: number; intraday: number; duration_ms: number; error?: string;
}> {
  const t0 = Date.now();
  let daily = 0, activities = 0, sleep = 0, intraday = 0;
  let error: string | undefined;
  try {
    daily = await syncDaily(owner, 30);
    activities = await syncActivities(owner, 50);
    sleep = await syncSleep(owner, 14);
    intraday = await syncIntraday(owner, 1);
  } catch (e) {
    error = (e as Error).message;
  }
  const duration_ms = Date.now() - t0;
  await supabaseAdmin.from("garmin_sync_log").insert({
    owner, trigger, ok: !error, daily_count: daily, activities_count: activities,
    sleep_count: sleep, duration_ms, error: error ?? null,
  });
  return { ok: !error, owner, daily, activities, sleep, intraday, duration_ms, error };
}

export async function syncAll(trigger: string): Promise<{
  ok: boolean;
  results: Array<{ ok: boolean; owner: GarminOwner; daily: number; activities: number; sleep: number; intraday: number; duration_ms: number; error?: string }>;
}> {
  const results = [] as Array<Awaited<ReturnType<typeof syncOne>>>;
  for (const owner of GARMIN_OWNERS) {
    try {
      results.push(await syncOne(owner, trigger));
    } catch (e) {
      results.push({ ok: false, owner, daily: 0, activities: 0, sleep: 0, intraday: 0, duration_ms: 0, error: (e as Error).message });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}
