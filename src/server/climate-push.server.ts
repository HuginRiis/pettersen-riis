/**
 * Inne-klima push: leser ferske Netatmo-temperaturer for Borgen Stua,
 * Borgen Soverommet og Hytta Stua. Sender push når temperatur går over
 * "for varmt" eller under "for kaldt" terskel — med per-rom cooldown så
 * vi ikke spammer. Kjøres hvert 10. min via pg_cron-hook.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";
import { getNetatmoWeatherStation, type WeatherStationResult } from "./netatmo-weather";

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
  enabled: boolean;
  notify_hot: boolean;
  hot_threshold: number;
  notify_cold: boolean;
  cold_threshold: number;
  recipient: string;
  cooldown_minutes: number;
  last_notified_hot_at: string | null;
  last_notified_cold_at: string | null;
};

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { recipient: string; title: string },
): Promise<boolean> {
  try {
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
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({
      feature: "climate",
      recipient: ctx.recipient || sub.who || "Alle",
      ok: false,
      endpoint: sub.endpoint,
      status_code: e.statusCode ?? null,
      error_message: e.message ?? null,
      title: ctx.title,
    });
    return false;
  }
}

async function loadSubs(who: string) {
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const or = buildSubscriptionWhoOr(who);
  if (or) q = q.or(or);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Henter siste innetemperatur for et rom ved å lese Netatmo getstationsdata
 * og plukke modulen som matcher module_match (eller NAMain om null).
 */
async function readRoomTemp(stationMatch: string, moduleMatch: string | null): Promise<number | null> {
  const r: WeatherStationResult = await (getNetatmoWeatherStation as any)({
    data: { stationMatch },
  });
  if (!r.ok) return null;
  const mm = moduleMatch?.toLowerCase().trim() ?? null;
  const mod = mm
    ? r.modules.find((m) => m.name.toLowerCase().includes(mm))
    : r.modules.find((m) => m.type === "NAMain");
  const t = mod?.metrics.temperature;
  return typeof t === "number" ? t : null;
}

export async function processClimateNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
  details: Array<{ room: string; temp: number | null; action: string }>;
}> {
  ensureConfigured();

  const { data: prefs, error } = await supabaseAdmin
    .from("climate_notification_prefs" as never)
    .select("*")
    .eq("enabled", true);
  if (error) throw error;

  const details: Array<{ room: string; temp: number | null; action: string }> = [];
  let checked = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;

  for (const p of (prefs ?? []) as Pref[]) {
    checked++;
    const temp = await readRoomTemp(p.station_match, p.module_match).catch(() => null);
    if (temp == null) {
      skipped++;
      details.push({ room: p.room_key, temp: null, action: "no-reading" });
      continue;
    }

    const now = Date.now();
    const cooldownMs = Math.max(5, p.cooldown_minutes) * 60_000;

    let trigger: "hot" | "cold" | null = null;
    if (p.notify_hot && temp >= p.hot_threshold) {
      const last = p.last_notified_hot_at ? new Date(p.last_notified_hot_at).getTime() : 0;
      if (now - last >= cooldownMs) trigger = "hot";
    } else if (p.notify_cold && temp <= p.cold_threshold) {
      const last = p.last_notified_cold_at ? new Date(p.last_notified_cold_at).getTime() : 0;
      if (now - last >= cooldownMs) trigger = "cold";
    }

    // Alltid oppdater last_value/last_checked_at for debugging
    await supabaseAdmin
      .from("climate_notification_prefs" as never)
      .update({ last_value: temp, last_checked_at: new Date().toISOString() } as never)
      .eq("id", p.id);

    if (!trigger) {
      skipped++;
      details.push({ room: p.room_key, temp, action: "within-range-or-cooldown" });
      continue;
    }

    const title =
      trigger === "hot"
        ? `🔥 For varmt på ${p.label}`
        : `❄️ For kaldt på ${p.label}`;
    const body =
      trigger === "hot"
        ? `${p.label} er nå ${temp.toFixed(1)}° (over ${p.hot_threshold}°). Åpne vindu eller skru ned varmen.`
        : `${p.label} er nå ${temp.toFixed(1)}° (under ${p.cold_threshold}°). Skru opp varmen.`;

    const subs = await loadSubs(p.recipient).catch(() => {
      errors++;
      return [] as Awaited<ReturnType<typeof loadSubs>>;
    });

    const payload = JSON.stringify({
      title,
      body,
      tag: `climate-${p.room_key}-${trigger}`,
      url: "/varme",
    });

    for (const sub of subs) {
      const ok = await sendOne(
        {
          endpoint: sub.endpoint as string,
          p256dh: sub.p256dh as string,
          auth: sub.auth as string,
          who: (sub as any).who ?? null,
        },
        payload,
        { recipient: p.recipient, title },
      );
      if (ok) sent++;
      else errors++;
    }

    const stampCol = trigger === "hot" ? "last_notified_hot_at" : "last_notified_cold_at";
    await supabaseAdmin
      .from("climate_notification_prefs" as never)
      .update({ [stampCol]: new Date().toISOString() } as never)
      .eq("id", p.id);

    details.push({ room: p.room_key, temp, action: `sent-${trigger}` });
  }

  return { checked, sent, errors, skipped, details };
}
