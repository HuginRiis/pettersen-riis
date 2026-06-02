/**
 * Dagsoppsummering for Homey-sensorer.
 *
 * Innstillinger lagres i `notification_settings` under key `homey_sensor_summary`:
 *   { enabled, recipient, hour, minute, last_sent_date }
 *
 * Sender én push per dag når lokal Oslo-tid passerer hour:minute (slack 65 min).
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSubscriptionWhoOr } from "./push-recipients";
import { logPushSend } from "./push-log.server";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:agenda@riis.cc";

let configured = false;
function ensureVapid() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

export type SensorSummaryConfig = {
  enabled: boolean;
  recipient: string;
  hour: number;
  minute: number;
  last_sent_date: string | null;
};

const DEFAULT: SensorSummaryConfig = {
  enabled: false,
  recipient: "Alle",
  hour: 21,
  minute: 0,
  last_sent_date: null,
};

const KEY = "homey_sensor_summary";

export async function loadSummaryConfig(): Promise<SensorSummaryConfig> {
  const { data } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  const v = (data?.value as Partial<SensorSummaryConfig>) ?? {};
  return {
    enabled: !!v.enabled,
    recipient: typeof v.recipient === "string" ? v.recipient : DEFAULT.recipient,
    hour: typeof v.hour === "number" ? v.hour : DEFAULT.hour,
    minute: typeof v.minute === "number" ? v.minute : DEFAULT.minute,
    last_sent_date: typeof v.last_sent_date === "string" ? v.last_sent_date : null,
  };
}

export async function saveSummaryConfig(patch: Partial<SensorSummaryConfig>): Promise<SensorSummaryConfig> {
  const cur = await loadSummaryConfig();
  const next = { ...cur, ...patch };
  const { data: existing } = await supabaseAdmin
    .from("notification_settings")
    .select("id")
    .eq("key", KEY)
    .maybeSingle();
  if (existing) {
    await supabaseAdmin
      .from("notification_settings")
      .update({ value: next as any, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("notification_settings").insert({ key: KEY, value: next as any });
  }
  return next;
}

function osloNow(): { date: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: parseInt(get("hour"), 10) % 24,
    minute: parseInt(get("minute"), 10),
  };
}

async function buildSummaryText(): Promise<{ title: string; body: string }> {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const { data: rows } = await supabaseAdmin
    .from("homey_sensor_events")
    .select("zone, kind, event_type")
    .gte("ts", start.toISOString())
    .lte("ts", now.toISOString())
    .limit(10000);
  const events = rows ?? [];

  let motion = 0, doorOpen = 0, windowOpen = 0, unlocked = 0;
  const roomCount = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === "motion_on") motion++;
    else if (e.event_type === "door_open") doorOpen++;
    else if (e.event_type === "window_open") windowOpen++;
    else if (e.event_type === "unlocked") unlocked++;
    const z = e.zone || "Ukjent";
    roomCount.set(z, (roomCount.get(z) ?? 0) + 1);
  }
  let topRoom = "—", topCount = 0;
  for (const [z, n] of roomCount) if (n > topCount) { topRoom = z; topCount = n; }

  const title = "🏠 Dagsoppsummering — sensorer";
  const body = `Bevegelser: ${motion} · Dør: ${doorOpen} · Vindu: ${windowOpen} · Lås opp: ${unlocked} · Mest aktivt: ${topRoom}`;
  return { title, body };
}

async function pushOne(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  ctx: { recipient: string; title: string },
): Promise<boolean> {
  try {
    ensureVapid();
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({ feature: "homey-sensor-summary", recipient: ctx.recipient, ok: true, endpoint: sub.endpoint, title: ctx.title });
    return true;
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 404 || err.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({
      feature: "homey-sensor-summary",
      recipient: ctx.recipient, ok: false, endpoint: sub.endpoint,
      status_code: err.statusCode ?? null, error_message: err.message ?? null, title: ctx.title,
    });
    return false;
  }
}

async function sendToRecipient(recipient: string, title: string, body: string, tagSuffix: string): Promise<{ sent: number; errors: number }> {
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const orFilter = buildSubscriptionWhoOr(recipient);
  if (orFilter) q = q.or(orFilter);
  const { data: subs } = await q;
  const payload = JSON.stringify({
    title, body,
    tag: `homey-sensor-summary-${tagSuffix}`,
    url: "/vakttarnet#vt-sensors",
  });
  let sent = 0, errors = 0;
  for (const sub of subs ?? []) {
    const ok = await pushOne(
      { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string },
      payload,
      { recipient, title },
    );
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}

export async function processHomeySensorSummary(): Promise<{ checked: number; sent: number; errors: number; skipped: number }> {
  const cfg = await loadSummaryConfig();
  if (!cfg.enabled) return { checked: 0, sent: 0, errors: 0, skipped: 1 };
  const oslo = osloNow();
  if (cfg.last_sent_date === oslo.date) return { checked: 1, sent: 0, errors: 0, skipped: 1 };
  const nowMin = oslo.hour * 60 + oslo.minute;
  const targetMin = cfg.hour * 60 + cfg.minute;
  const diff = nowMin - targetMin;
  if (diff < 0 || diff > 65) return { checked: 1, sent: 0, errors: 0, skipped: 1 };

  const { title, body } = await buildSummaryText();
  const { sent, errors } = await sendToRecipient(cfg.recipient, title, body, oslo.date);
  await saveSummaryConfig({ last_sent_date: oslo.date });
  return { checked: 1, sent, errors, skipped: 0 };
}

export async function sendHomeySensorSummaryTest(): Promise<{ sent: number; errors: number }> {
  const cfg = await loadSummaryConfig();
  const { title, body } = await buildSummaryText();
  return sendToRecipient(cfg.recipient, `🧪 TEST: ${title}`, body, `test-${Date.now()}`);
}
