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

/**
 * Returnerer UTC-tidspunktet for et gitt YYYY-MM-DD + HH:mm i Europe/Oslo.
 * Bruker tilnærming via Intl for å finne offset.
 */
function osloLocalToUtc(dateStr: string, timeStr: string): Date {
  // Lag et "naivt" UTC-tidspunkt og finn forskjellen mellom hvordan det vises i Oslo vs UTC.
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  // Først anta det er UTC
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Hva blir denne tiden i Oslo? Da finner vi offset.
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
  const offsetMs = osloAsUtc - naive; // hvor mye Oslo ligger foran UTC
  // Korriger: ekte UTC = naive - offset
  return new Date(naive - offsetMs);
}

function formatOsloTime(date: string, time: string): string {
  return `${time}`;
}

export async function processAgendaNotifications(): Promise<{ checked: number; sent: number; errors: number }> {
  ensureConfigured();
  const now = new Date();
  const lookAheadMin = 65; // hent alt med klokkeslett innenfor neste ~time
  const lookBackMin = 5; // toleranse for forsinket cron

  const todayIso = new Date(now.getTime() - 1000 * 60 * lookBackMin)
    .toISOString()
    .slice(0, 10);
  const tomorrowIso = new Date(now.getTime() + 1000 * 60 * 60 * 24)
    .toISOString()
    .slice(0, 10);

  // Hent ikke-varslede oppføringer med klokkeslett og notify_minutes_before
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
    const eventTime = (item.event_time as string).slice(0, 5); // "HH:mm"
    const minsBefore = item.notify_minutes_before as number;

    const eventUtc = osloLocalToUtc(eventDate, eventTime);
    const notifyAt = new Date(eventUtc.getTime() - minsBefore * 60 * 1000);
    const diffMin = (now.getTime() - notifyAt.getTime()) / 60000;

    // Skal varsles hvis vi er innenfor [0, lookAheadMin] fra notifyAt, og ikke allerede sendt
    if (diffMin < -0.5 || diffMin > lookAheadMin) continue;

    // Finn abonnenter: alle som matcher who (Alle = treffer alle, ellers eksakt match eller "Alle")
    const targetWho = item.who as string;
    const { data: subs, error: subErr } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .or(targetWho === "Alle" ? `who.neq.__none__` : `who.eq.${targetWho},who.eq.Alle`);

    if (subErr) {
      errors++;
      console.error("[agenda-push] sub fetch error", subErr);
      continue;
    }
    if (!subs || subs.length === 0) {
      // marker som varslet for å unngå retry uendelig
      await supabaseAdmin.from("agenda_messages").update({ notified_at: new Date().toISOString() }).eq("id", item.id);
      continue;
    }

    const timeLabel = formatOsloTime(eventDate, eventTime);
    const whenLabel =
      minsBefore === 0
        ? `nå (${timeLabel})`
        : `om ${minsBefore} min (${timeLabel})`;

    const payload = JSON.stringify({
      title: `📜 ${item.subject}`,
      body: `For ${targetWho} • ${whenLabel}${item.body ? ` — ${item.body}` : ""}`,
      tag: `agenda-${item.id}`,
      url: "/agenda",
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
          },
          payload
        );
        sent++;
      } catch (e: unknown) {
        errors++;
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          // Død subscription — slett
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint as string);
        } else {
          console.error("[agenda-push] send error", e);
        }
      }
    }

    await supabaseAdmin
      .from("agenda_messages")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  return { checked: items.length, sent, errors };
}
