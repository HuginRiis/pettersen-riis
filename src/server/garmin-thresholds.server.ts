/**
 * Egendefinerte Garmin terskel-varsler (per bruker).
 *
 * Bruker fyrer av når en valgt verdi (stress, body battery, hvilepuls, søvn …)
 * krysser en grense. For å unngå spam fyrer vi kun når forrige måling lå på
 * "trygg" side (eller var ukjent) og dagens måling er på "varsel" side, og
 * minst `cooldown_hours` har gått siden forrige varsel.
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

type Owner = "arne" | "rebekka";

type Pref = {
  id: string;
  garmin_owner: Owner;
  recipient: string;
  sender_label: string;
  enabled: boolean;
  label: string | null;
  metric: string;
  direction: "below" | "above";
  threshold: number;
  cooldown_hours: number;
  last_value: number | null;
  last_notified_at: string | null;
};

export const THRESHOLD_METRICS: Array<{
  key: string;
  label: string;
  unit: string;
  defaultDirection: "below" | "above";
  defaultThreshold: number;
}> = [
  { key: "stress",         label: "Stress (snitt i dag)",      unit: "",     defaultDirection: "above", defaultThreshold: 50 },
  { key: "body_battery",   label: "Body Battery (siste time)", unit: "",     defaultDirection: "below", defaultThreshold: 20 },
  { key: "rhr",            label: "Hvilepuls",                 unit: "bpm",  defaultDirection: "above", defaultThreshold: 65 },
  { key: "intraday_hr",    label: "Puls (siste time, snitt)",  unit: "bpm",  defaultDirection: "above", defaultThreshold: 100 },
  { key: "steps",          label: "Skritt (hittil i dag)",     unit: "",     defaultDirection: "below", defaultThreshold: 3000 },
  { key: "sleep_total",    label: "Søvn (timer)",              unit: "t",    defaultDirection: "below", defaultThreshold: 6 },
  { key: "sleep_score",    label: "Søvnscore",                 unit: "",     defaultDirection: "below", defaultThreshold: 60 },
  { key: "deep_sleep",     label: "Dyp søvn (min)",            unit: "min",  defaultDirection: "below", defaultThreshold: 45 },
  { key: "rem_sleep",      label: "REM-søvn (min)",            unit: "min",  defaultDirection: "below", defaultThreshold: 60 },
  { key: "hrv",            label: "HRV-snitt",                 unit: "ms",   defaultDirection: "below", defaultThreshold: 35 },
  { key: "spo2",           label: "SpO₂",                      unit: "%",    defaultDirection: "below", defaultThreshold: 92 },
  { key: "calories",       label: "Kalorier (totalt)",         unit: "kcal", defaultDirection: "above", defaultThreshold: 3500 },
  { key: "active_kcal",    label: "Aktive kcal",               unit: "kcal", defaultDirection: "below", defaultThreshold: 300 },
  { key: "intensity",      label: "Intensitetsminutter",       unit: "min",  defaultDirection: "below", defaultThreshold: 20 },
  { key: "floors",         label: "Trapper",                   unit: "",     defaultDirection: "below", defaultThreshold: 5 },
];

function metricMeta(key: string) {
  return THRESHOLD_METRICS.find((m) => m.key === key);
}

function osloDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function osloHour(d = new Date()): number {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hour12: false }).format(d), 10);
}

async function getDaily(owner: Owner) {
  const { data } = await supabaseAdmin
    .from("garmin_daily_stats")
    .select("steps, resting_heart_rate, total_kilocalories, active_kilocalories, floors_climbed, moderate_intensity_minutes, vigorous_intensity_minutes, stress_average, body_battery_high, body_battery_low")
    .eq("owner", owner)
    .eq("day", osloDateKey())
    .maybeSingle();
  return data ?? null;
}

async function getSleep(owner: Owner) {
  const { data } = await supabaseAdmin
    .from("garmin_sleep")
    .select("total_seconds, deep_seconds, rem_seconds, sleep_score, hrv_avg, average_spo2")
    .eq("owner", owner)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function getIntradayLatest(owner: Owner) {
  const { data } = await supabaseAdmin
    .from("garmin_intraday")
    .select("hour, heart_rate_avg, stress_avg, body_battery, day")
    .eq("owner", owner)
    .eq("day", osloDateKey())
    .order("hour", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function readMetric(metric: string, owner: Owner): Promise<number | null> {
  if (metric === "body_battery" || metric === "intraday_hr") {
    const intr = await getIntradayLatest(owner);
    if (!intr) return null;
    if (metric === "body_battery") return intr.body_battery != null ? Number(intr.body_battery) : null;
    if (metric === "intraday_hr") return intr.heart_rate_avg != null ? Number(intr.heart_rate_avg) : null;
  }
  if (["stress", "rhr", "steps", "calories", "active_kcal", "intensity", "floors"].includes(metric)) {
    const d = await getDaily(owner);
    if (!d) return null;
    switch (metric) {
      case "stress": return d.stress_average != null ? Number(d.stress_average) : null;
      case "rhr": return d.resting_heart_rate != null ? Number(d.resting_heart_rate) : null;
      case "steps": return d.steps != null ? Number(d.steps) : null;
      case "calories": return d.total_kilocalories != null ? Number(d.total_kilocalories) : null;
      case "active_kcal": return d.active_kilocalories != null ? Number(d.active_kilocalories) : null;
      case "intensity": return ((d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0)) || null;
      case "floors": return d.floors_climbed != null ? Number(d.floors_climbed) : null;
    }
  }
  if (["sleep_total", "sleep_score", "deep_sleep", "rem_sleep", "hrv", "spo2"].includes(metric)) {
    const s = await getSleep(owner);
    if (!s) return null;
    switch (metric) {
      case "sleep_total": return s.total_seconds ? s.total_seconds / 3600 : null;
      case "sleep_score": return s.sleep_score != null ? Number(s.sleep_score) : null;
      case "deep_sleep": return s.deep_seconds ? s.deep_seconds / 60 : null;
      case "rem_sleep": return s.rem_seconds ? s.rem_seconds / 60 : null;
      case "hrv": return s.hrv_avg != null ? Number(s.hrv_avg) : null;
      case "spo2": return s.average_spo2 != null ? Number(s.average_spo2) : null;
    }
  }
  return null;
}

function triggered(value: number, threshold: number, direction: "below" | "above"): boolean {
  return direction === "below" ? value < threshold : value > threshold;
}

async function fetchSubs(recipient: string) {
  const orFilter = buildSubscriptionWhoOr(recipient);
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  if (orFilter) q = q.or(orFilter);
  const { data } = await q;
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
    void logPushSend({ feature: "garmin-threshold", recipient: ctx.recipient || sub.who || "Alle", ok: true, endpoint: sub.endpoint, title: ctx.title });
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({ feature: "garmin-threshold", recipient: ctx.recipient, ok: false, endpoint: sub.endpoint, status_code: e.statusCode ?? null, error_message: e.message ?? null, title: ctx.title });
    return false;
  }
}

function fmtVal(metric: string, v: number): string {
  const m = metricMeta(metric);
  const unit = m?.unit ? ` ${m.unit}` : "";
  if (["sleep_total"].includes(metric)) return `${v.toFixed(1)}${unit}`;
  if (Number.isInteger(v)) return `${v}${unit}`;
  return `${v.toFixed(1)}${unit}`;
}

const OWNER_LABEL: Record<Owner, string> = { arne: "Arne", rebekka: "Rebekka" };

export async function processGarminThresholdNotifications(): Promise<{ checked: number; sent: number; errors: number; skipped: number }> {
  ensureConfigured();
  const { data: rows, error } = await supabaseAdmin
    .from("garmin_threshold_prefs" as never)
    .select("*")
    .eq("enabled", true);
  if (error) throw error;
  const prefs = (rows ?? []) as unknown as Pref[];
  if (prefs.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  // Ikke kjør søvn-baserte før 08:00 Oslo
  const hr = osloHour();
  let checked = 0, sent = 0, errors = 0, skipped = 0;

  for (const p of prefs) {
    checked++;
    const owner: Owner = p.garmin_owner === "rebekka" ? "rebekka" : "arne";
    const sleepMetrics = new Set(["sleep_total", "sleep_score", "deep_sleep", "rem_sleep", "hrv", "spo2"]);
    if (sleepMetrics.has(p.metric) && hr < 8) { skipped++; continue; }

    const value = await readMetric(p.metric, owner);
    if (value == null) { skipped++; continue; }

    const fires = triggered(value, Number(p.threshold), p.direction);
    const prev = p.last_value != null ? Number(p.last_value) : null;
    const prevFired = prev != null ? triggered(prev, Number(p.threshold), p.direction) : false;
    const cooldownMs = Math.max(1, p.cooldown_hours) * 3600_000;
    const lastAt = p.last_notified_at ? new Date(p.last_notified_at).getTime() : 0;
    const cooledDown = Date.now() - lastAt >= cooldownMs;

    // Oppdater siste verdi alltid
    let updated: Record<string, unknown> = { last_value: value };

    // Send kun ved transisjon (eller ved første gang etter cooldown om vi ikke har historikk)
    const shouldFire = fires && cooledDown && (!prevFired || prev == null);
    if (shouldFire) {
      const meta = metricMeta(p.metric);
      const metricLabel = p.label || meta?.label || p.metric;
      const dir = p.direction === "below" ? "under" : "over";
      const title = `${OWNER_LABEL[owner]} ${p.direction === "below" ? "⬇️" : "⬆️"} ${metricLabel}`;
      const body = `${fmtVal(p.metric, value)} — ${dir} grensa ${fmtVal(p.metric, Number(p.threshold))}.`;
      const payload = JSON.stringify({
        title: `[${p.sender_label}] ${title}`,
        body,
        tag: `garmin-threshold-${p.id}`,
        url: "/trening",
      });
      const subs = await fetchSubs(p.recipient);
      for (const s of subs) {
        const ok = await sendOne(s, payload, { recipient: p.recipient, title });
        if (ok) sent++; else errors++;
      }
      updated.last_notified_at = new Date().toISOString();
    } else if (fires) {
      skipped++;
    }

    await supabaseAdmin
      .from("garmin_threshold_prefs" as never)
      .update(updated as never)
      .eq("id", p.id);
  }
  return { checked, sent, errors, skipped };
}

export async function sendGarminThresholdTest(prefId: string): Promise<{ sent: number; errors: number }> {
  ensureConfigured();
  const { data } = await supabaseAdmin
    .from("garmin_threshold_prefs" as never)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (!data) throw new Error("Fant ikke regel");
  const p = data as unknown as Pref;
  const owner: Owner = p.garmin_owner === "rebekka" ? "rebekka" : "arne";
  const meta = metricMeta(p.metric);
  const metricLabel = p.label || meta?.label || p.metric;
  const dir = p.direction === "below" ? "under" : "over";
  const value = await readMetric(p.metric, owner);
  const valueText = value != null ? fmtVal(p.metric, value) : "ingen data";
  const title = `🧪 TEST ${OWNER_LABEL[owner]} ${metricLabel}`;
  const body = `Nåverdi: ${valueText}. Regel: ${dir} ${fmtVal(p.metric, Number(p.threshold))}.`;
  const payload = JSON.stringify({
    title: `[${p.sender_label}] ${title}`,
    body,
    tag: `garmin-threshold-test-${p.id}-${Date.now()}`,
    url: "/trening",
  });
  const subs = await fetchSubs(p.recipient);
  let sent = 0, errors = 0;
  for (const s of subs) {
    const ok = await sendOne(s, payload, { recipient: p.recipient, title });
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}
