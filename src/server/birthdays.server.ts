/**
 * Server-side: bursdag-varsler (kjøres av samme cron-hook som agenda).
 * Sender push kl 08:00 Europe/Oslo til valgte mottakere på selve bursdagen,
 * og markerer notified_year for å unngå dobbeltsending samme år.
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

function getOsloParts(): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { feature: string; recipient?: string; title?: string } = { feature: "birthday" },
): Promise<boolean> {
  try {
    ensureConfigured();
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({
      feature: ctx.feature,
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
    console.error("[birthday-push] send error", e?.statusCode, e?.message);
    void logPushSend({
      feature: ctx.feature,
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

export async function sendBirthdayPushNow(
  id: string,
  row: {
    name: string;
    title: string | null;
    words: string | null;
    birth_date: string;
    notify_recipients: string[] | null;
  },
): Promise<{ sent: number; errors: number; total: number }> {
  ensureConfigured();
  const today = getOsloParts();
  const [by] = row.birth_date.split("-").map(Number);
  const age = today.year - by;
  const rawRecipients = row.notify_recipients && row.notify_recipients.length > 0 ? row.notify_recipients : ["Alle"];
  const recipients = Array.from(new Set((rawRecipients as string[]).flatMap((r) => expandRecipient(r))));

  let subs: Array<{ endpoint: string; p256dh: string; auth: string }> = [];
  if (recipients.includes("Alle")) {
    const { data } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");
    subs = (data ?? []) as typeof subs;
  } else {
    const { data } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("who", recipients);
    subs = (data ?? []) as typeof subs;
  }

  const titleLabel = row.title ? ` (${row.title})` : "";
  const payload = JSON.stringify({
    title: `🎂 Test: Gratulerer ${row.name}!`,
    body: `${row.name}${titleLabel} fyller ${age} år i dag.${row.words ? ` — "${row.words}"` : ""}`,
    tag: `birthday-test-${id}-${Date.now()}`,
    url: "/agenda",
  });

  let sent = 0;
  let errors = 0;
  for (const s of subs) {
    const ok = await sendPush(s, payload, { feature: "birthday-test", title: row.name });
    if (ok) sent++;
    else errors++;
  }
  return { sent, errors, total: subs.length };
}

export async function processBirthdayNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
}> {
  const today = getOsloParts();
  // Hent globalt klokkeslett for bursdager (default 08:00)
  const { data: setting } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", "birthday_time")
    .maybeSingle();
  const cfg = (setting?.value ?? {}) as { hour?: number; minute?: number };
  const targetHour = typeof cfg.hour === "number" ? cfg.hour : 8;
  const targetMinute = typeof cfg.minute === "number" ? cfg.minute : 0;
  const nowMin = today.hour * 60 + today.minute;
  const targetMin = targetHour * 60 + targetMinute;
  // Vindu: opp til 65 min etter ønsket tid (cron kan kjøre med litt jitter)
  if (nowMin < targetMin || nowMin > targetMin + 65) {
    return { checked: 0, sent: 0, errors: 0 };
  }

  const { data: rows, error } = await supabaseAdmin
    .from("birthdays")
    .select("id, name, birth_date, title, words, notify_enabled, notify_recipients, notified_year");
  if (error) throw error;
  if (!rows || rows.length === 0) return { checked: 0, sent: 0, errors: 0 };

  const todayMM = today.month;
  const todayDD = today.day;
  let sent = 0;
  let errors = 0;
  let checked = 0;

  for (const r of rows as Array<{
    id: string;
    name: string;
    birth_date: string;
    title: string | null;
    words: string | null;
    notify_enabled: boolean;
    notify_recipients: string[] | null;
    notified_year: number | null;
  }>) {
    if (!r.notify_enabled) continue;
    const [by, bm, bd] = r.birth_date.split("-").map(Number);
    if (bm !== todayMM || bd !== todayDD) continue;
    if (r.notified_year === today.year) continue;
    checked++;

    const rawRecipients = (r.notify_recipients && r.notify_recipients.length > 0)
      ? r.notify_recipients
      : ["Alle"];
    const recipients = Array.from(new Set(rawRecipients.flatMap((x) => expandRecipient(x))));

    // Hent abonnementer som matcher (Alle = alle, ellers union av valgte personer + Alle)
    let subs: Array<{ endpoint: string; p256dh: string; auth: string; who: string }> = [];
    if (recipients.includes("Alle")) {
      const { data, error: subErr } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth, who");
      if (subErr) {
        errors++;
        continue;
      }
      subs = (data ?? []) as typeof subs;
    } else {
      const { data, error: subErr } = await supabaseAdmin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth, who")
        .in("who", recipients);
      if (subErr) {
        errors++;
        continue;
      }
      subs = (data ?? []) as typeof subs;
    }

    if (subs.length === 0) {
      // Marker likevel som behandlet for å unngå retries
      await supabaseAdmin
        .from("birthdays")
        .update({ notified_year: today.year })
        .eq("id", r.id);
      continue;
    }

    const age = today.year - by;
    const titleLabel = r.title ? ` (${r.title})` : "";
    const payload = JSON.stringify({
      title: `🎂 Gratulerer med dagen, ${r.name}!`,
      body: `${r.name}${titleLabel} fyller ${age} år i dag.${r.words ? ` — "${r.words}"` : ""}`,
      tag: `birthday-${r.id}-${today.year}`,
      url: "/agenda",
    });

    let any = false;
    for (const s of subs) {
      const ok = await sendPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, who: s.who },
        payload,
        { feature: "birthday", title: r.name },
      );
      if (ok) {
        sent++;
        any = true;
      } else errors++;
    }

    if (any) {
      await supabaseAdmin
        .from("birthdays")
        .update({ notified_year: today.year })
        .eq("id", r.id);
    }
  }

  return { checked, sent, errors };
}
