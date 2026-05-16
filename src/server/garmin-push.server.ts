/**
 * Garmin push-varsler:
 *  - Daglig sammendrag (skritt, søvn, hvilepuls, kalorier) sendt på valgt klokkeslett
 *  - Terskel-varsler: skritt-mål nådd, lav søvn, høy hvilepuls
 *
 * Triggeres fra agenda-push-hooken hvert minutt. Vi bruker `notified_keys`
 * på preferansen for å garantere maks ett varsel per (dato, type).
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:agenda@riis.cc";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

type Pref = {
  id: string;
  recipient: string;
  sender_label: string;
  enabled: boolean;
  notify_daily: boolean;
  daily_time: string; // 'HH:MM:SS'
  notify_step_goal: boolean;
  notify_low_sleep: boolean;
  low_sleep_hours: number;
  notify_high_resting_hr: boolean;
  high_rhr_bpm: number;
  notified_keys: string[];
  garmin_owner: "arne" | "rebekka";
  notify_compare: boolean;
  compare_time: string;
  daily_show_both: boolean;
  daily_fields: string[];
  compare_fields: string[];
};

function osloDateKey(d = new Date()): string {
  // YYYY-MM-DD i Europe/Oslo
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(d);
}
function osloHm(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false });
  return fmt.format(d); // HH:MM
}

async function fetchSubs(recipient: string) {
  const orFilter = buildSubscriptionWhoOr(recipient);
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  if (orFilter) q = q.or(orFilter);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { recipient: string; title: string },
) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({ feature: "garmin", recipient: ctx.recipient || sub.who || "Alle", ok: true, endpoint: sub.endpoint, title: ctx.title });
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({ feature: "garmin", recipient: ctx.recipient, ok: false, endpoint: sub.endpoint, status_code: e.statusCode ?? null, error_message: e.message ?? null, title: ctx.title });
    return false;
  }
}

async function sendToRecipient(pref: Pref, title: string, body: string) {
  const subs = await fetchSubs(pref.recipient);
  if (subs.length === 0) return { sent: 0, errors: 0 };
  const payload = JSON.stringify({ title: `[${pref.sender_label}] ${title}`, body, tag: `garmin-${pref.id}`, url: "/trening" });
  let sent = 0, errors = 0;
  for (const s of subs) {
    const ok = await sendOne(s, payload, { recipient: pref.recipient, title });
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}

async function getTodayDaily(owner: "arne" | "rebekka"): Promise<{ steps: number | null; step_goal: number | null; resting_heart_rate: number | null; total_kilocalories: number | null; active_kilocalories: number | null; floors_climbed: number | null; moderate_intensity_minutes: number | null; vigorous_intensity_minutes: number | null; stress_average: number | null; body_battery_high: number | null } | null> {
  const today = osloDateKey();
  const { data } = await supabaseAdmin
    .from("garmin_daily_stats")
    .select("steps, step_goal, resting_heart_rate, total_kilocalories, active_kilocalories, floors_climbed, moderate_intensity_minutes, vigorous_intensity_minutes, stress_average, body_battery_high")
    .eq("owner", owner)
    .eq("day", today)
    .maybeSingle();
  return data ?? null;
}
async function getLastSleep(owner: "arne" | "rebekka"): Promise<{ total_seconds: number | null; deep_seconds: number | null; rem_seconds: number | null; sleep_score: number | null; hrv_avg: number | null; average_spo2: number | null } | null> {
  const { data } = await supabaseAdmin
    .from("garmin_sleep")
    .select("total_seconds, deep_seconds, rem_seconds, sleep_score, hrv_avg, average_spo2, day")
    .eq("owner", owner)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

const OWNER_LABEL = { arne: "Arne", rebekka: "Rebekka" } as const;

function formatDailyParts(
  fields: string[],
  daily: Awaited<ReturnType<typeof getTodayDaily>>,
  sleep: Awaited<ReturnType<typeof getLastSleep>>,
): string {
  const f = new Set(fields?.length ? fields : ["steps", "sleep", "rhr", "calories"]);
  const parts: string[] = [];
  if (f.has("steps") && daily?.steps != null) parts.push(`${daily.steps.toLocaleString("nb-NO")} skritt`);
  if (f.has("sleep") && sleep?.total_seconds) parts.push(`${(sleep.total_seconds / 3600).toFixed(1)}t søvn`);
  if (f.has("rhr") && daily?.resting_heart_rate) parts.push(`hvilepuls ${daily.resting_heart_rate}`);
  if (f.has("calories") && daily?.total_kilocalories) parts.push(`${daily.total_kilocalories.toLocaleString("nb-NO")} kcal`);
  if (f.has("helse")) {
    const helse: string[] = [];
    if (daily?.stress_average != null) helse.push(`stress ${daily.stress_average}`);
    if (daily?.body_battery_high != null) helse.push(`BB ${daily.body_battery_high}`);
    if (helse.length) parts.push(helse.join("/"));
  }
  return parts.join(" · ");
}

type CompareCmp = "higher" | "lower";
const COMPARE_FIELDS: Array<{ key: string; label: string; cmp: CompareCmp; get: (d: Awaited<ReturnType<typeof getTodayDaily>>, s: Awaited<ReturnType<typeof getLastSleep>>) => number | null }> = [
  { key: "steps", label: "skritt", cmp: "higher", get: (d) => d?.steps ?? null },
  { key: "sleep", label: "søvn", cmp: "higher", get: (_d, s) => (s?.total_seconds ? s.total_seconds / 3600 : null) },
  { key: "deep_sleep", label: "dyp søvn", cmp: "higher", get: (_d, s) => (s?.deep_seconds ? s.deep_seconds / 60 : null) },
  { key: "rem_sleep", label: "REM-søvn", cmp: "higher", get: (_d, s) => (s?.rem_seconds ? s.rem_seconds / 60 : null) },
  { key: "sleep_score", label: "søvnscore", cmp: "higher", get: (_d, s) => s?.sleep_score ?? null },
  { key: "rhr", label: "hvilepuls", cmp: "lower", get: (d) => d?.resting_heart_rate ?? null },
  { key: "hrv", label: "pulsvariasjon", cmp: "higher", get: (_d, s) => (s?.hrv_avg != null ? Number(s.hrv_avg) : null) },
  { key: "spo2", label: "SpO₂", cmp: "higher", get: (_d, s) => (s?.average_spo2 != null ? Number(s.average_spo2) : null) },
  { key: "calories", label: "kalorier", cmp: "higher", get: (d) => d?.total_kilocalories ?? null },
  { key: "active_kcal", label: "aktive kcal", cmp: "higher", get: (d) => d?.active_kilocalories ?? null },
  { key: "helse", label: "body battery", cmp: "higher", get: (d) => d?.body_battery_high ?? null },
  { key: "stress", label: "stress", cmp: "lower", get: (d) => d?.stress_average ?? null },
  { key: "intensity", label: "intensitetsminutter", cmp: "higher", get: (d) => d ? ((d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0)) || null : null },
  { key: "floors", label: "trapper", cmp: "higher", get: (d) => (d?.floors_climbed != null ? Number(d.floors_climbed) : null) },
];


async function markNotified(pref: Pref, key: string) {
  const updated = Array.from(new Set([...(pref.notified_keys ?? []), key])).slice(-200);
  await supabaseAdmin
    .from("garmin_notification_prefs" as never)
    .update({ notified_keys: updated } as never)
    .eq("id", pref.id);
}

export async function processGarminNotifications(): Promise<{ checked: number; sent: number; errors: number; skipped: number }> {
  ensureConfigured();
  const { data: prefsRaw, error } = await supabaseAdmin
    .from("garmin_notification_prefs" as never)
    .select("*")
    .eq("enabled", true);
  if (error) throw error;
  const prefs = (prefsRaw ?? []) as unknown as Pref[];
  if (prefs.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  const today = osloDateKey();
  const nowHm = osloHm();
  // Cache per owner for å unngå dobbel-spørring
  const dailyCache = new Map<string, Awaited<ReturnType<typeof getTodayDaily>>>();
  const sleepCache = new Map<string, Awaited<ReturnType<typeof getLastSleep>>>();

  let checked = 0, sent = 0, errors = 0, skipped = 0;

  for (const p of prefs) {
    checked++;
    const owner = (p.garmin_owner === "rebekka" ? "rebekka" : "arne") as "arne" | "rebekka";
    if (!dailyCache.has(owner)) dailyCache.set(owner, await getTodayDaily(owner));
    if (!sleepCache.has(owner)) sleepCache.set(owner, await getLastSleep(owner));
    const daily = dailyCache.get(owner) ?? null;
    const sleep = sleepCache.get(owner) ?? null;
    const already = new Set(p.notified_keys ?? []);

    // Daglig sammendrag
    if (p.notify_daily) {
      const wantHm = (p.daily_time || "07:30").slice(0, 5);
      const key = `daily:${today}`;
      if (nowHm >= wantHm && !already.has(key)) {
        const fields = p.daily_fields ?? ["steps", "sleep", "rhr", "calories"];
        let body: string;
        if (p.daily_show_both) {
          const lines: string[] = [];
          for (const o of ["arne", "rebekka"] as const) {
            if (!dailyCache.has(o)) dailyCache.set(o, await getTodayDaily(o));
            if (!sleepCache.has(o)) sleepCache.set(o, await getLastSleep(o));
            const part = formatDailyParts(fields, dailyCache.get(o) ?? null, sleepCache.get(o) ?? null);
            if (part) lines.push(`${OWNER_LABEL[o]}: ${part}`);
          }
          body = lines.length ? lines.join("\n") : "Ingen Garmin-data registrert ennå.";
        } else {
          const part = formatDailyParts(fields, daily, sleep);
          body = part || "Ingen Garmin-data registrert ennå.";
        }
        const r = await sendToRecipient(p, "Daglig oppsummering", body);
        sent += r.sent; errors += r.errors;
        await markNotified(p, key);
      } else if (already.has(key)) skipped++;
    }

    // Sammenligning Arne vs Rebekka
    if (p.notify_compare) {
      const wantHm = (p.compare_time || "20:00").slice(0, 5);
      const key = `compare:${today}`;
      if (nowHm >= wantHm && !already.has(key)) {
        for (const o of ["arne", "rebekka"] as const) {
          if (!dailyCache.has(o)) dailyCache.set(o, await getTodayDaily(o));
          if (!sleepCache.has(o)) sleepCache.set(o, await getLastSleep(o));
        }
        const aD = dailyCache.get("arne") ?? null;
        const aS = sleepCache.get("arne") ?? null;
        const rD = dailyCache.get("rebekka") ?? null;
        const rS = sleepCache.get("rebekka") ?? null;
        const wins = { arne: 0, rebekka: 0, tie: 0 };
        const lines: string[] = [];
        const enabled = new Set(p.compare_fields?.length ? p.compare_fields : ["steps","sleep","rhr","calories","helse"]);
        for (const f of COMPARE_FIELDS) {
          if (!enabled.has(f.key)) continue;
          const a = f.get(aD, aS);
          const b = f.get(rD, rS);
          if (a == null || b == null) continue;
          let winner: "arne" | "rebekka" | "tie";
          if (a === b) winner = "tie";
          else if (f.cmp === "higher") winner = a > b ? "arne" : "rebekka";
          else winner = a < b ? "arne" : "rebekka";
          wins[winner]++;
          const fmt = (v: number) => f.key === "sleep" ? `${v.toFixed(1)}t` : v.toLocaleString("nb-NO");
          const flag = winner === "tie" ? "⚖️" : winner === "arne" ? "🐺 Arne" : "🐉 Rebekka";
          lines.push(`${f.label}: ${fmt(a)} vs ${fmt(b)} → ${flag}`);
        }
        let header = "Uavgjort i dag ⚖️";
        if (wins.arne > wins.rebekka) header = `🐺 Arne vant ${wins.arne}–${wins.rebekka}`;
        else if (wins.rebekka > wins.arne) header = `🐉 Rebekka vant ${wins.rebekka}–${wins.arne}`;
        const body = lines.length ? `${header}\n${lines.join("\n")}` : "Ingen sammenlignbare data ennå.";
        const r = await sendToRecipient(p, "Dagens duell", body);
        sent += r.sent; errors += r.errors;
        await markNotified(p, key);
      } else if (already.has(key)) skipped++;
    }

    // Skritt-mål nådd
    if (p.notify_step_goal && daily?.steps && daily?.step_goal && daily.steps >= daily.step_goal) {
      const key = `goal:${today}`;
      if (!already.has(key)) {
        const r = await sendToRecipient(p, "Skritt-mål nådd 🎯", `${daily.steps.toLocaleString("nb-NO")} skritt — målet på ${daily.step_goal.toLocaleString("nb-NO")} er passert.`);
        sent += r.sent; errors += r.errors;
        await markNotified(p, key);
      } else skipped++;
    }

    // Lav søvn (siste natt)
    if (p.notify_low_sleep && sleep?.total_seconds) {
      const hours = sleep.total_seconds / 3600;
      const key = `lowsleep:${today}`;
      if (hours < p.low_sleep_hours && !already.has(key) && nowHm >= "08:00") {
        const r = await sendToRecipient(p, "Lite søvn 😴", `Du sov bare ${hours.toFixed(1)} timer (under ${p.low_sleep_hours}t-grensa).`);
        sent += r.sent; errors += r.errors;
        await markNotified(p, key);
      }
    }

    // Høy hvilepuls
    if (p.notify_high_resting_hr && daily?.resting_heart_rate && daily.resting_heart_rate >= p.high_rhr_bpm) {
      const key = `highrhr:${today}`;
      if (!already.has(key) && nowHm >= "09:00") {
        const r = await sendToRecipient(p, "Høy hvilepuls ❤️", `Hvilepulsen i dag er ${daily.resting_heart_rate} bpm (over ${p.high_rhr_bpm}).`);
        sent += r.sent; errors += r.errors;
        await markNotified(p, key);
      }
    }
  }

  return { checked, sent, errors, skipped };
}

export async function sendGarminTestNotification(prefId: string): Promise<{ sent: number; errors: number }> {
  ensureConfigured();
  const { data, error } = await supabaseAdmin
    .from("garmin_notification_prefs" as never)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Regel finnes ikke");
  const pref = data as unknown as Pref;
  const ownerLabel = pref.garmin_owner === "rebekka" ? "Rebekka" : "Arne";
  return sendToRecipient(pref, `Test fra Garmin (${ownerLabel})`, "Slik ser et Garmin-varsel ut. ✓");
}
