/**
 * Henter postleveringsdager fra Posten og sender push-varsel
 * basert på `mail_delivery_prefs`.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSubscriptionWhoOr } from "./push-recipients";
import { logPushSend } from "./push-log.server";
import { loggedFetch } from "./api-call-log.server";

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

export type MailPref = {
  id: string;
  postal_code: string;
  enabled: boolean;
  recipient: string;
  days_before: number;
  notify_hour: number;
  notify_minute: number;
  last_notified_for_date: string | null;
};

export async function fetchDeliveryDays(postalCode: string): Promise<string[]> {
  const url = `https://www.posten.no/levering-av-post_/_/service/no.posten.website/delivery-days?postalCode=${encodeURIComponent(postalCode)}`;
  const res = await fetch(url, { headers: { "User-Agent": "borgen-app/1.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`Posten API ${res.status}`);
  const json = (await res.json()) as { delivery_dates?: string[] };
  return Array.isArray(json.delivery_dates) ? json.delivery_dates : [];
}

function todayInOslo(): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return { y, m, d };
}

function osloLocalToUtc(y: number, m: number, d: number, hh: number, mm: number): Date {
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(naive));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const osloAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), 0);
  const offsetMs = osloAsUtc - naive;
  return new Date(naive - offsetMs);
}

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { recipient: string; title: string },
): Promise<boolean> {
  try {
    ensureVapid();
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({ feature: "mail-delivery", recipient: ctx.recipient, ok: true, endpoint: sub.endpoint, title: ctx.title });
    return true;
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 404 || err.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({
      feature: "mail-delivery",
      recipient: ctx.recipient,
      ok: false,
      endpoint: sub.endpoint,
      status_code: err.statusCode ?? null,
      error_message: err.message ?? null,
      title: ctx.title,
    });
    return false;
  }
}

export async function processMailDeliveryNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  const { data: prefsRaw } = await supabaseAdmin
    .from("mail_delivery_prefs" as never)
    .select("id, postal_code, enabled, recipient, days_before, notify_hour, notify_minute, last_notified_for_date");
  const prefs = (prefsRaw ?? []) as unknown as MailPref[];
  const active = prefs.filter((p) => p.enabled);
  if (active.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  // Cache delivery days per postnummer
  const cache = new Map<string, string[]>();
  const now = new Date();
  const lookBackMin = 65;
  let checked = 0, sent = 0, errors = 0, skipped = 0;

  for (const pref of active) {
    let days = cache.get(pref.postal_code);
    if (!days) {
      try {
        days = await fetchDeliveryDays(pref.postal_code);
        cache.set(pref.postal_code, days);
      } catch (e) {
        console.error("[mail-delivery] fetch failed", pref.postal_code, e);
        errors++;
        continue;
      }
    }

    // Finn neste leveringsdato som matcher days_before
    const today = todayInOslo();
    const todayUtc = Date.UTC(today.y, today.m - 1, today.d);
    let target: string | null = null;
    for (const iso of days) {
      const [y, m, d] = iso.split("-").map(Number);
      const diff = Math.round((Date.UTC(y, m - 1, d) - todayUtc) / 86400000);
      if (diff === pref.days_before) {
        target = iso;
        break;
      }
    }
    if (!target) continue;
    if (pref.last_notified_for_date === target) {
      skipped++;
      continue;
    }

    const notifyAt = osloLocalToUtc(today.y, today.m, today.d, pref.notify_hour, pref.notify_minute);
    const diffMin = (now.getTime() - notifyAt.getTime()) / 60000;
    if (diffMin < 0 || diffMin > lookBackMin) continue;

    checked++;

    const targetWho = pref.recipient || "Alle";
    let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
    const orFilter = buildSubscriptionWhoOr(targetWho);
    if (orFilter) q = q.or(orFilter);
    const { data: subs } = await q;

    const [ty, tm, td] = target.split("-").map(Number);
    const dateLabel = new Date(Date.UTC(ty, tm - 1, td)).toLocaleDateString("nb-NO", {
      timeZone: "Europe/Oslo",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const dayLabel =
      pref.days_before === 0 ? "i dag" :
      pref.days_before === 1 ? "i morgen" :
      `om ${pref.days_before} dager`;

    const payload = JSON.stringify({
      title: `📬 Postlevering ${dayLabel}`,
      body: `Posten kommer ${dateLabel} (postnr ${pref.postal_code}).`,
      tag: `mail-${pref.postal_code}-${target}`,
      url: "/push-varslinger",
    });

    let anyOk = false;
    for (const sub of subs ?? []) {
      const ok = await sendPush(
        { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string, who: (sub as any).who ?? null },
        payload,
        { recipient: targetWho, title: `Postlevering ${pref.postal_code}` },
      );
      if (ok) { sent++; anyOk = true; } else { errors++; }
    }

    if (anyOk || (subs?.length ?? 0) === 0) {
      await supabaseAdmin
        .from("mail_delivery_prefs" as never)
        .update({ last_notified_for_date: target, updated_at: new Date().toISOString() } as never)
        .eq("id", pref.id);
    }
  }

  return { checked, sent, errors, skipped };
}

export async function sendMailDeliveryTestPush(prefId: string): Promise<{ sent: number; errors: number }> {
  const { data: prefRaw } = await supabaseAdmin
    .from("mail_delivery_prefs" as never)
    .select("id, postal_code, recipient")
    .eq("id", prefId)
    .maybeSingle();
  const pref = prefRaw as unknown as { id: string; postal_code: string; recipient: string } | null;
  if (!pref) throw new Error("Fant ikke innstillingen");

  let next = "test";
  try {
    const days = await fetchDeliveryDays(pref.postal_code);
    next = days[0] ?? "test";
  } catch {
    // ignorer
  }

  const targetWho = pref.recipient || "Alle";
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const orFilter = buildSubscriptionWhoOr(targetWho);
  if (orFilter) q = q.or(orFilter);
  const { data: subs } = await q;

  const payload = JSON.stringify({
    title: `🧪 TEST: 📬 Postlevering ${pref.postal_code}`,
    body: `Test-varsel. Neste leveringsdag: ${next}.`,
    tag: `mail-test-${pref.id}-${Date.now()}`,
    url: "/push-varslinger",
  });

  let sent = 0, errors = 0;
  for (const sub of subs ?? []) {
    const ok = await sendPush(
      { endpoint: sub.endpoint as string, p256dh: sub.p256dh as string, auth: sub.auth as string, who: (sub as any).who ?? null },
      payload,
      { recipient: targetWho, title: `TEST Postlevering ${pref.postal_code}` },
    );
    if (ok) sent++; else errors++;
  }
  return { sent, errors };
}

export async function getMailDeliveryOverview(): Promise<{
  prefs: MailPref[];
  deliveryDaysByPostal: Record<string, string[]>;
}> {
  const { data: prefsRaw } = await supabaseAdmin
    .from("mail_delivery_prefs" as never)
    .select("id, postal_code, enabled, recipient, days_before, notify_hour, notify_minute, last_notified_for_date")
    .order("postal_code");
  const prefs = (prefsRaw ?? []) as unknown as MailPref[];
  const map: Record<string, string[]> = {};
  const codes = Array.from(new Set(prefs.map((p) => p.postal_code)));
  await Promise.all(
    codes.map(async (c) => {
      try { map[c] = await fetchDeliveryDays(c); } catch { map[c] = []; }
    }),
  );
  return { prefs, deliveryDaysByPostal: map };
}
