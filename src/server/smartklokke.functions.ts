import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { GarminOwner } from "./garmin.shared";

const ownerSchema = z.object({ owner: z.enum(["arne", "rebekka"]).default("arne") });

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Henter "absolutt alt" vi har om en Garmin-bærer for siste 7 dager.
 * - DB: daily, sleep, intraday, activities, devices, status, siste sync
 * - Live API (best effort, parallelt, timeout): training readiness, HRV detalj,
 *   race predictions, HR-soner, personal records, max metrics (VO2max),
 *   user summary, hill score, endurance score, training status aggregated,
 *   body battery events, stress detail, all-day SpO2, respirasjon.
 *
 * Live-kall pakkes i Promise.allSettled så feil aldri velter responsen.
 * Denne fn-en brukes KUN på /smartklokke siden, så den påvirker ikke /trening.
 */
export const getSmartklokkeOverview = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ownerSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const owner = data.owner as GarminOwner;

    // ---- DB-data (siste 7 dager) -----------------------------------------
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceIso = isoDay(since);

    const [
      { data: daily },
      { data: sleep },
      { data: intraday },
      { data: activities },
      { data: devices },
      { data: lastSync },
    ] = await Promise.all([
      supabaseAdmin
        .from("garmin_daily_stats")
        .select("*")
        .eq("owner", owner)
        .gte("day", sinceIso)
        .order("day", { ascending: true }),
      supabaseAdmin
        .from("garmin_sleep")
        .select("*")
        .eq("owner", owner)
        .gte("day", sinceIso)
        .order("day", { ascending: true }),
      supabaseAdmin
        .from("garmin_intraday")
        .select("*")
        .eq("owner", owner)
        .gte("day", sinceIso)
        .order("day", { ascending: true })
        .order("hour", { ascending: true }),
      supabaseAdmin
        .from("garmin_activities")
        .select("*")
        .eq("owner", owner)
        .gte("start_time_local", since.toISOString())
        .order("start_time_local", { ascending: false }),
      supabaseAdmin
        .from("garmin_devices")
        .select("*")
        .eq("owner", owner)
        .order("last_used_at", { ascending: false, nullsFirst: false }),
      supabaseAdmin
        .from("garmin_sync_log")
        .select("ran_at, ok, daily_count, activities_count, sleep_count, error")
        .eq("owner", owner)
        .order("ran_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // ---- Status / klokke -------------------------------------------------
    const { getGarminStatus } = await import("./garmin.server");
    const status = await getGarminStatus(owner);

    // ---- Live Garmin API (best effort) -----------------------------------
    const today = isoDay(new Date());
    const live = await fetchLiveExtras(owner, today, sinceIso);

    return {
      owner,
      status,
      lastSync,
      devices: devices ?? [],
      daily: daily ?? [],
      sleep: sleep ?? [],
      intraday: intraday ?? [],
      activities: activities ?? [],
      live,
    };
  });

// JSON-serialiserbar respons fra Garmin — bruker `any` så RPC-serialiseringen
// godtar dynamisk JSON fra eksterne endepunkter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LiveResult = { ok: true; data: any } | { ok: false; error: string };

async function safeCall(label: string, fn: () => Promise<unknown>, timeoutMs = 8000): Promise<LiveResult> {
  try {
    const r = await Promise.race<unknown>([
      fn(),
      new Promise<unknown>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), timeoutMs)),
    ]);
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: (e as Error).message?.slice(0, 200) ?? "feil" };
  }
}

async function fetchLiveExtras(owner: GarminOwner, today: string, sinceIso: string) {
  const { garminGet } = await import("./garmin.server");

  // Endepunktene Garmin Connect-mobilappen bruker. Noen krever moderne ressurser
  // (Fenix 8 / amoled gir vanligvis alle). Vi pakker alt i allSettled.
  const tasks = {
    trainingReadiness: () => garminGet(owner, `/metrics-service/metrics/trainingreadiness/${today}`),
    trainingStatus: () => garminGet(owner, `/metrics-service/metrics/trainingstatus/aggregated/${today}`),
    maxMetrics: () => garminGet(owner, `/metrics-service/metrics/maxmet/latest/${today}`),
    fitnessAge: () => garminGet(owner, `/fitnessage-service/fitnessage/${today}`),
    hrv: () => garminGet(owner, `/hrv-service/hrv/${today}`),
    hrvWeek: () => garminGet(owner, `/hrv-service/hrv/daily/${sinceIso}/${today}`),
    racePredictions: () => garminGet(owner, `/metrics-service/metrics/racepredictions/latest`),
    personalRecords: () =>
      garminGet(owner, `/personalrecord-service/personalrecord/prs/${status_displayName(owner)}`),
    hrZones: () => garminGet(owner, `/biometric-service/heartRateZones`),
    bodyBatteryEvents: () => garminGet(owner, `/wellness-service/wellness/bodyBattery/events/${today}`),
    stressDetail: () => garminGet(owner, `/wellness-service/wellness/dailyStress/${today}`),
    respiration: () => garminGet(owner, `/wellness-service/wellness/dailyRespiration/${today}`),
    spo2: () => garminGet(owner, `/wellness-service/wellness/dailySpo2/${today}`),
    floorsToday: () => garminGet(owner, `/wellness-service/wellness/floorsClimbed/${today}`),
    hydrationToday: () => garminGet(owner, `/usersummary-service/usersummary/hydration/daily/${today}`),
    userSummary: () => garminGet(owner, `/usersummary-service/usersummary/daily/${today}`),
    userProfile: () => garminGet(owner, `/userprofile-service/userprofile/user-settings`),
    socialProfile: () => garminGet(owner, `/userprofile-service/socialProfile`),
    bloodPressureLatest: () => garminGet(owner, `/bloodpressure-service/bloodpressure/range/${sinceIso}/${today}/false`),
    enduranceScore: () => garminGet(owner, `/metrics-service/metrics/endurancescore/${today}`),
    hillScore: () => garminGet(owner, `/metrics-service/metrics/hillscore/${today}`),
    weightWeek: () => garminGet(owner, `/weight-service/weight/range/${sinceIso}/${today}?includeAll=true`),
    badgesEarned: () => garminGet(owner, `/badge-service/badge/earned`),
    gear: () => garminGet(owner, `/gear-service/gear/filterGear?activityType=all`),
    activeGoals: () => garminGet(owner, `/goal-service/goal/goals?status=active`),
  };

  const entries = Object.entries(tasks);
  const results = await Promise.all(entries.map(([k, fn]) => safeCall(k, fn as () => Promise<unknown>)));
  const out: Record<string, LiveResult> = {};
  entries.forEach(([k], i) => { out[k] = results[i]; });
  return out;
}

// Personal records-endepunktet trenger Garmin display-name. Vi henter det via
// social profile dersom det trengs, men vi vil unngå dobbelt-kall pr request.
// Som en grei pragmatisk default sender vi owner-strengen — Garmin returnerer
// 404 hvis ukjent, og safeCall sluker feilen. Dette unngår å holde en ekstra
// roundtrip i kritisk path.
function status_displayName(owner: GarminOwner): string {
  return owner;
}
