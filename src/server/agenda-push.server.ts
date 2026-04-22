/**
 * Server-side push utility: finn agenda-oppføringer som skal varsles
 * og send Web Push til riktige abonnenter.
 *
 * Tidssone: alle hendelser tolkes som Europe/Oslo lokaltid.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:agenda@riis.cc";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    throw new Error("VAPID keys missing");
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC;
}

function formatPushError(error: unknown): { message: string; statusCode?: number } {
  const err = error as {
    message?: string;
    body?: string;
    statusCode?: number;
  };
  const parts = [err?.message || String(error)];
  if (err?.statusCode) parts.push(`status ${err.statusCode}`);
  if (typeof err?.body === "string" && err.body.trim()) {
    parts.push(err.body.trim().slice(0, 240));
  }
  return {
    message: parts.join(" — "),
    statusCode: err?.statusCode,
  };
}

async function sendPushToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<{ ok: true } | { ok: false; statusCode?: number; error: string }> {
  try {
    ensureConfigured();
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payload,
    );
    return { ok: true };
  } catch (error) {
    const formatted = formatPushError(error);
    if (formatted.statusCode === 404 || formatted.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    console.error("[agenda-push] send error", {
      endpoint: sub.endpoint,
      statusCode: formatted.statusCode,
      error: formatted.message,
    });
    return { ok: false, statusCode: formatted.statusCode, error: formatted.message };
  }
}

/**
 * Returnerer UTC-tidspunktet for et gitt YYYY-MM-DD + HH:mm i Europe/Oslo.
 * Bruker tilnærming via Intl for å finne offset.
 */
function osloLocalToUtc(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
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

function formatOsloTime(_date: string, time: string): string {
  return `${time}`;
}

export async function sendAgendaTestPushByEndpoint(data: { endpoint: string; who: string }) {
  const { data: sub, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, who")
    .eq("endpoint", data.endpoint)
    .maybeSingle();

  if (error) throw error;
  if (!sub) {
    throw new Error("Fant ikke abonnementet på denne enheten. Slå push av og på igjen.");
  }

  const sentAt = new Date().toISOString();
  const timeLabel = new Date(sentAt).toLocaleTimeString("nb-NO", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
  });

  const payload = JSON.stringify({
    title: "🧪 Test av agenda-push",
    body: `Til ${data.who} • sendt ${timeLabel} • Hvis du ser denne virker push på mobilen.`,
    tag: `agenda-test-${Date.now()}`,
    url: "/agenda",
  });

  const result = await sendPushToSubscription(
    {
      endpoint: sub.endpoint as string,
      p256dh: sub.p256dh as string,
      auth: sub.auth as string,
    },
    payload,
  );

  if (!result.ok) {
    if (result.statusCode === 400 || result.statusCode === 403) {
      throw new Error("Push-abonnementet ble avvist. Slå push av og på igjen på mobilen, og prøv test-knappen på nytt.");
    }
    throw new Error(result.error);
  }

  await supabaseAdmin
    .from("push_subscriptions")
    .update({ last_used_at: sentAt })
    .eq("endpoint", data.endpoint);

  return { ok: true, sentAt };
}

export async function sendHyttaChecklistPush(data: { title: string; body: string; url?: string }) {
  ensureConfigured();

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");

  if (error) throw error;
  if (!subs || subs.length === 0) {
    return { sent: 0, errors: 0, total: 0 };
  }

  const payload = JSON.stringify({
    title: data.title,
    body: data.body,
    tag: `hytta-checklist-${Date.now()}`,
    url: data.url || "/hytta",
  });

  let sent = 0;
  let errors = 0;
  for (const sub of subs) {
    const result = await sendPushToSubscription(
      {
        endpoint: sub.endpoint as string,
        p256dh: sub.p256dh as string,
        auth: sub.auth as string,
      },
      payload,
    );
    if (result.ok) sent++;
    else errors++;
  }

  return { sent, errors, total: subs.length };
}

/**
 * Behandler planlagte huskeliste-varsler: finner punkter der notify_at har passert
 * og notified_at fortsatt er NULL, og sender push til alle abonnenter.
 */
export async function processHyttaChecklistNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
}> {
  ensureConfigured();
  const now = new Date();
  const lookBackMin = 10;
  const fromIso = new Date(now.getTime() - lookBackMin * 60 * 1000).toISOString();
  const toIso = now.toISOString();

  const { data: items, error } = await supabaseAdmin
    .from("hytta_checklist")
    .select("id, label, added_by, notify_at")
    .is("notified_at", null)
    .not("notify_at", "is", null)
    .gte("notify_at", fromIso)
    .lte("notify_at", toIso);

  if (error) throw error;
  if (!items || items.length === 0) return { checked: 0, sent: 0, errors: 0 };

  const { data: subs, error: subErr } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");

  if (subErr) throw subErr;
  if (!subs || subs.length === 0) {
    // Marker som varslet uansett, så vi ikke prøver igjen
    await supabaseAdmin
      .from("hytta_checklist")
      .update({ notified_at: new Date().toISOString() })
      .in("id", items.map((i) => i.id as string));
    return { checked: items.length, sent: 0, errors: 0 };
  }

  let sent = 0;
  let errors = 0;

  for (const item of items) {
    const timeLabel = new Date(item.notify_at as string).toLocaleTimeString("nb-NO", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
    });
    const payload = JSON.stringify({
      title: "📜 Påminnelse: Huskeliste til hytta",
      body: `${item.label} • lagt inn av ${item.added_by} • ${timeLabel}`,
      tag: `hytta-checklist-${item.id}`,
      url: "/hytta",
    });

    let sentForItem = 0;
    for (const sub of subs) {
      const result = await sendPushToSubscription(
        {
          endpoint: sub.endpoint as string,
          p256dh: sub.p256dh as string,
          auth: sub.auth as string,
        },
        payload,
      );
      if (result.ok) {
        sent++;
        sentForItem++;
      } else {
        errors++;
      }
    }

    if (sentForItem > 0) {
      await supabaseAdmin
        .from("hytta_checklist")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", item.id);
    }
  }

  return { checked: items.length, sent, errors };
}

export async function processAgendaNotifications(): Promise<{ checked: number; sent: number; errors: number }> {
  ensureConfigured();
  const now = new Date();
  const lookAheadMin = 65;
  const lookBackMin = 5;

  const todayIso = new Date(now.getTime() - 1000 * 60 * lookBackMin).toISOString().slice(0, 10);
  const tomorrowIso = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString().slice(0, 10);

  const { data: items, error } = await supabaseAdmin
    .from("agenda_messages")
    .select("id, subject, body, event_date, event_time, who, notify_minutes_before, notified_at")
    .is("notified_at", null)
    .not("event_time", "is", null)
    .not("notify_minutes_before", "is", null)
    .gte("event_date", todayIso)
    .lte("event_date", tomorrowIso);

  if (error) throw error;
  if (!items || items.length === 0) return { checked: 0, sent: 0, errors: 0 };

  let sent = 0;
  let errors = 0;

  for (const item of items) {
    const eventDate = item.event_date as string;
    const eventTime = (item.event_time as string).slice(0, 5);
    const minsBefore = item.notify_minutes_before as number;

    const eventUtc = osloLocalToUtc(eventDate, eventTime);
    const notifyAt = new Date(eventUtc.getTime() - minsBefore * 60 * 1000);
    const diffMin = (now.getTime() - notifyAt.getTime()) / 60000;

    if (diffMin < -0.5 || diffMin > lookAheadMin) continue;

    const targetWho = item.who as string;
    const { data: subs, error: subErr } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .or(targetWho === "Alle" ? `who.neq.__none__` : `who.eq.${targetWho},who.eq.Alle`);

    if (subErr) {
      errors++;
      console.error("[agenda-push] sub fetch error", subErr);
      continue;
    }
    if (!subs || subs.length === 0) continue;

    const timeLabel = formatOsloTime(eventDate, eventTime);
    const whenLabel = minsBefore === 0 ? `nå (${timeLabel})` : `om ${minsBefore} min (${timeLabel})`;

    const payload = JSON.stringify({
      title: `📜 ${item.subject}`,
      body: `For ${targetWho} • ${whenLabel}${item.body ? ` — ${item.body}` : ""}`,
      tag: `agenda-${item.id}`,
      url: "/agenda",
    });

    let sentForItem = 0;
    for (const sub of subs) {
      const result = await sendPushToSubscription(
        {
          endpoint: sub.endpoint as string,
          p256dh: sub.p256dh as string,
          auth: sub.auth as string,
        },
        payload,
      );
      if (result.ok) {
        sent++;
        sentForItem++;
      } else {
        errors++;
      }
    }

    if (sentForItem > 0) {
      await supabaseAdmin
        .from("agenda_messages")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", item.id);
    }
  }

  return { checked: items.length, sent, errors };
}