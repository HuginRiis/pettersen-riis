/**
 * Klima-push: leser cachet Netatmo-data og sender push når et rom blir
 * for varmt eller for kaldt iht. terskler i `climate_notification_prefs`.
 *
 * Anti-spam: én varsling per "retning" (hot/cold) per rom per dag.
 * Sender ny varsling neste dag hvis fortsatt utenfor, etter at temperaturen
 * har vært innenfor minst én sjekk.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { expandRecipient } from "./push-recipients";

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
  room_key: string;
  station_match: string;
  module_match: string | null;
  label: string;
  recipient: string;
  enabled: boolean;
  notify_hot: boolean;
  notify_cold: boolean;
  hot_threshold: number;
  cold_threshold: number;
  cooldown_minutes: number;
  last_notified_hot_at: string | null;
  last_notified_cold_at: string | null;
};

function osloDateIso(d: Date = new Date()): string {
  // YYYY-MM-DD i Europe/Oslo
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

type Snapshot = { temperature: number | null; moduleName: string };

async function readLatestTemp(stationMatch: string, moduleMatch: string | null): Promise<Snapshot | null> {
  // Bruker live henter (cache 10 min på server) — samme funksjon som /varme bruker.
  const { getNetatmoWeatherStation } = await import("./netatmo-weather");
  const res = await (getNetatmoWeatherStation as any)({ data: { stationMatch } });
  if (!res?.ok) return null;
  const modules = res.modules as Array<{ type: string; name: string; metrics: { temperature?: number } }>;
  let mod;
  if (moduleMatch && moduleMatch.trim()) {
    const m = moduleMatch.toLowerCase();
    mod = modules.find((x) => x.name.toLowerCase().includes(m));
  }
  if (!mod) {
    // default: NAMain (innemodul hovedstasjon)
    mod = modules.find((x) => x.type === "NAMain");
  }
  if (!mod) mod = modules[0];
  if (!mod) return null;
  return { temperature: typeof mod.metrics.temperature === "number" ? mod.metrics.temperature : null, moduleName: mod.name };
}

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { recipient: string; title: string },
): Promise<boolean> {
  try {
    ensureConfigured();
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({
      feature: "climate",
      recipient: ctx.recipient || sub.who || "Alle",
      ok: true,
      endpoint: sub.endpoint,
      title: ctx.title,
    });
    return true;
  } catch (err) {
    const e = err as { statusCode?: number; message?: string };
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({
      feature: "climate",
      recipient: ctx.recipient || sub.who || "Alle",
      ok: false,
      endpoint: sub.endpoint,
      status_code: e?.statusCode ?? null,
      error_message: e?.message ?? null,
      title: ctx.title,
    });
    return false;
  }
}

async function sendToRecipient(
  recipient: string,
  payload: string,
  title: string,
): Promise<{ sent: number; errors: number; total: number }> {
  const recipients = Array.from(new Set(expandRecipient(recipient)));
  let subs: Array<{ endpoint: string; p256dh: string; auth: string; who: string }> = [];
  if (recipients.includes("Alle")) {
    const { data } = await supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
    subs = (data ?? []) as typeof subs;
  } else {
    const { data } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, who")
      .in("who", recipients);
    subs = (data ?? []) as typeof subs;
  }
  let sent = 0;
  let errors = 0;
  for (const s of subs) {
    const ok = await sendPush(s, payload, { recipient, title });
    if (ok) sent++;
    else errors++;
  }
  return { sent, errors, total: subs.length };
}

async function evaluatePref(pref: Pref, force = false): Promise<{
  prefId: string;
  label: string;
  temp: number | null;
  triggered: "hot" | "cold" | null;
  skipped?: string;
  sent?: number;
  errors?: number;
}> {
  if (!force && !pref.enabled) return { prefId: pref.id, label: pref.label, temp: null, triggered: null, skipped: "disabled" };

  const snap = await readLatestTemp(pref.station_match, pref.module_match);
  const temp = snap?.temperature ?? null;
  const update: Record<string, unknown> = { last_checked_at: new Date().toISOString(), last_value: temp };

  if (temp == null) {
    await supabaseAdmin.from("climate_notification_prefs").update(update).eq("id", pref.id);
    return { prefId: pref.id, label: pref.label, temp: null, triggered: null, skipped: "no-temp" };
  }

  const todayIso = osloDateIso();
  let triggered: "hot" | "cold" | null = null;
  let title = "";
  let body = "";

  if (pref.notify_hot && temp > pref.hot_threshold) {
    const lastDay = pref.last_notified_hot_at ? osloDateIso(new Date(pref.last_notified_hot_at)) : null;
    if (force || lastDay !== todayIso) {
      triggered = "hot";
      title = `🔥 For varmt i ${pref.label}`;
      body = `Det er ${temp.toFixed(1)}° (grense ${pref.hot_threshold}°).`;
    }
  } else if (pref.notify_cold && temp < pref.cold_threshold) {
    const lastDay = pref.last_notified_cold_at ? osloDateIso(new Date(pref.last_notified_cold_at)) : null;
    if (force || lastDay !== todayIso) {
      triggered = "cold";
      title = `❄️ For kaldt i ${pref.label}`;
      body = `Det er ${temp.toFixed(1)}° (grense ${pref.cold_threshold}°).`;
    }
  }

  if (!triggered) {
    await supabaseAdmin.from("climate_notification_prefs").update(update).eq("id", pref.id);
    return { prefId: pref.id, label: pref.label, temp, triggered: null };
  }

  const payload = JSON.stringify({
    title,
    body,
    tag: `climate-${pref.room_key}-${triggered}-${todayIso}`,
    url: "/varme",
  });
  const r = await sendToRecipient(pref.recipient, payload, title);

  if (r.sent > 0 || force) {
    update[triggered === "hot" ? "last_notified_hot_at" : "last_notified_cold_at"] = new Date().toISOString();
  }
  await supabaseAdmin.from("climate_notification_prefs").update(update).eq("id", pref.id);

  return { prefId: pref.id, label: pref.label, temp, triggered, sent: r.sent, errors: r.errors };
}

export async function processClimateNotifications(): Promise<{
  checked: number;
  triggered: number;
  sent: number;
  errors: number;
  details: Array<{ prefId: string; label: string; temp: number | null; triggered: "hot" | "cold" | null; sent?: number; errors?: number; skipped?: string }>;
}> {
  const { data, error } = await supabaseAdmin.from("climate_notification_prefs").select("*").eq("enabled", true);
  if (error) throw error;
  const prefs = (data ?? []) as Pref[];
  const details = [] as Array<any>;
  let triggered = 0;
  let sent = 0;
  let errors = 0;
  for (const p of prefs) {
    const r = await evaluatePref(p, false);
    details.push(r);
    if (r.triggered) triggered++;
    sent += r.sent ?? 0;
    errors += r.errors ?? 0;
  }
  return { checked: prefs.length, triggered, sent, errors, details };
}

export async function sendClimateTestPush(prefId: string): Promise<{
  sent: number;
  errors: number;
  total: number;
  temp: number | null;
  label: string;
}> {
  const { data, error } = await supabaseAdmin
    .from("climate_notification_prefs")
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Fant ikke klima-preferansen");
  const pref = data as Pref;
  const snap = await readLatestTemp(pref.station_match, pref.module_match);
  const temp = snap?.temperature ?? null;
  const title = `🌡️ Test: ${pref.label}`;
  const body = temp != null
    ? `Test-varsling. Det er ${temp.toFixed(1)}° nå (grenser ${pref.cold_threshold}°–${pref.hot_threshold}°).`
    : `Test-varsling. Klarte ikke å hente temperatur akkurat nå.`;
  const payload = JSON.stringify({
    title,
    body,
    tag: `climate-test-${pref.id}-${Date.now()}`,
    url: "/varme",
  });
  const r = await sendToRecipient(pref.recipient, payload, title);
  return { ...r, temp, label: pref.label };
}
