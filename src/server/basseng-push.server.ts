/**
 * Basseng-push: leser basseng-temperatur fra Homey-snapshot og sender push
 * når temperaturen har endret seg minst `delta` grader siden sist varsel.
 * Bare aktiv innenfor `active_from`–`active_to` (Europe/Oslo).
 *
 * Mottaker kan settes individuelt for retning "opp" og "ned".
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
  label: string;
  device_match: string;
  enabled: boolean;
  delta: number;
  notify_up: boolean;
  notify_down: boolean;
  recipient_up: string;
  recipient_down: string;
  active_from: string; // HH:MM
  active_to: string;   // HH:MM
  last_value: number | null;
  last_notified_value: number | null;
  last_notified_at: string | null;
  last_direction: string | null;
};

function osloHHMM(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // en-GB gives "HH:MM"
  return fmt.format(d);
}

function withinWindow(now: string, from: string, to: string): boolean {
  // Supports overnight windows (e.g. 22:00 → 06:00).
  if (from === to) return true;
  if (from < to) return now >= from && now <= to;
  return now >= from || now <= to;
}

async function readBassengTemp(deviceMatch: string): Promise<{ temp: number | null; deviceName: string | null }> {
  const { getHomeySnapshot } = await import("./homey");
  const snap = await (getHomeySnapshot as any)({});
  if (!snap?.ok) return { temp: null, deviceName: null };
  const match = (deviceMatch || "basseng").toLowerCase();
  const zones = new Map<string, string>();
  for (const z of snap.zones ?? []) zones.set(z.id, z.name);
  let best: { temp: number; name: string } | null = null;
  for (const d of snap.devices ?? []) {
    const zoneName = d.zone ? zones.get(d.zone) ?? "" : "";
    const combined = `${d.name ?? ""} ${zoneName}`.toLowerCase();
    if (!combined.includes(match)) continue;
    const t = d?.capabilities?.measure_temperature?.value;
    if (typeof t !== "number") continue;
    best = { temp: t, name: d.name };
    break;
  }
  return best ? { temp: best.temp, deviceName: best.name } : { temp: null, deviceName: null };
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
      feature: "basseng",
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
      feature: "basseng",
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
  const names = Array.from(new Set(expandRecipient(recipient)));
  let subs: Array<{ endpoint: string; p256dh: string; auth: string; who: string }> = [];
  if (names.includes("Alle")) {
    const { data } = await supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
    subs = (data ?? []) as typeof subs;
  } else {
    const { data } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, who")
      .in("who", names);
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

export async function processBassengNotifications(force = false): Promise<{
  checked: number;
  triggered: number;
  sent: number;
  errors: number;
  details: Array<{ prefId: string; label: string; temp: number | null; direction: "up" | "down" | null; sent?: number; errors?: number; skipped?: string }>;
}> {
  const { data, error } = await supabaseAdmin.from("basseng_notification_prefs" as any).select("*");
  if (error) throw error;
  const prefs = (data ?? []) as Pref[];
  const details: any[] = [];
  let triggered = 0;
  let sent = 0;
  let errors = 0;
  const nowHHMM = osloHHMM();

  for (const pref of prefs) {
    if (!force && !pref.enabled) {
      details.push({ prefId: pref.id, label: pref.label, temp: null, direction: null, skipped: "disabled" });
      continue;
    }
    const { temp } = await readBassengTemp(pref.device_match);
    const update: Record<string, unknown> = {
      last_checked_at: new Date().toISOString(),
      last_value: temp,
    };
    if (temp == null) {
      await supabaseAdmin.from("basseng_notification_prefs" as any).update(update as any).eq("id", pref.id);
      details.push({ prefId: pref.id, label: pref.label, temp: null, direction: null, skipped: "no-temp" });
      continue;
    }

    if (!force && !withinWindow(nowHHMM, pref.active_from, pref.active_to)) {
      await supabaseAdmin.from("basseng_notification_prefs" as any).update(update as any).eq("id", pref.id);
      details.push({ prefId: pref.id, label: pref.label, temp, direction: null, skipped: "outside-window" });
      continue;
    }

    // Etabler baseline hvis vi ikke har sendt før
    if (pref.last_notified_value == null) {
      update.last_notified_value = temp;
      update.last_notified_at = new Date().toISOString();
      update.last_direction = null;
      await supabaseAdmin.from("basseng_notification_prefs" as any).update(update as any).eq("id", pref.id);
      details.push({ prefId: pref.id, label: pref.label, temp, direction: null, skipped: "baseline" });
      continue;
    }

    const diff = temp - pref.last_notified_value;
    const direction: "up" | "down" | null =
      diff >= pref.delta ? "up" : diff <= -pref.delta ? "down" : null;

    if (!direction) {
      await supabaseAdmin.from("basseng_notification_prefs" as any).update(update as any).eq("id", pref.id);
      details.push({ prefId: pref.id, label: pref.label, temp, direction: null });
      continue;
    }

    if ((direction === "up" && !pref.notify_up) || (direction === "down" && !pref.notify_down)) {
      // Oppdater baseline så vi ikke trigger igjen for samme bevegelse
      update.last_notified_value = temp;
      update.last_notified_at = new Date().toISOString();
      update.last_direction = direction;
      await supabaseAdmin.from("basseng_notification_prefs" as any).update(update as any).eq("id", pref.id);
      details.push({ prefId: pref.id, label: pref.label, temp, direction, skipped: "direction-off" });
      continue;
    }

    const arrow = direction === "up" ? "↑" : "↓";
    const emoji = direction === "up" ? "🔼" : "🔽";
    const title = `${emoji} ${pref.label}: ${arrow} ${Math.abs(diff).toFixed(1)}°`;
    const body = `Nå ${temp.toFixed(1)}° (forrige varsel ${pref.last_notified_value.toFixed(1)}°).`;
    const recipient = direction === "up" ? pref.recipient_up : pref.recipient_down;
    const payload = JSON.stringify({
      title,
      body,
      tag: `basseng-${direction}-${Date.now()}`,
      url: "/smarthus",
    });
    const r = await sendToRecipient(recipient, payload, title);
    triggered++;
    sent += r.sent;
    errors += r.errors;

    update.last_notified_value = temp;
    update.last_notified_at = new Date().toISOString();
    update.last_direction = direction;
    await supabaseAdmin.from("basseng_notification_prefs" as any).update(update as any).eq("id", pref.id);
    details.push({ prefId: pref.id, label: pref.label, temp, direction, sent: r.sent, errors: r.errors });
  }

  return { checked: prefs.length, triggered, sent, errors, details };
}

export async function sendBassengTestPush(prefId: string): Promise<{
  sent: number;
  errors: number;
  total: number;
  temp: number | null;
  label: string;
}> {
  const { data, error } = await supabaseAdmin
    .from("basseng_notification_prefs" as any)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Fant ikke basseng-preferansen");
  const pref = data as Pref;
  const { temp } = await readBassengTemp(pref.device_match);
  const title = `🏊 Test: ${pref.label}`;
  const body =
    temp != null
      ? `Test-varsling. Bassenget er ${temp.toFixed(1)}° nå (terskel ±${pref.delta}°).`
      : `Test-varsling. Klarte ikke hente temperatur akkurat nå.`;
  const payload = JSON.stringify({
    title,
    body,
    tag: `basseng-test-${pref.id}-${Date.now()}`,
    url: "/smarthus",
  });
  // Test sender til BEGGE retningers mottakere (union)
  const recipients = Array.from(new Set([pref.recipient_up, pref.recipient_down]));
  let sent = 0, errors = 0, total = 0;
  for (const rcpt of recipients) {
    const r = await sendToRecipient(rcpt, payload, title);
    sent += r.sent; errors += r.errors; total += r.total;
  }
  return { sent, errors, total, temp, label: pref.label };
}
