/**
 * Sender push-varsel hvis Tibber daglig snapshot mangler for i går
 * (eller eldre, opp til 7 dager). Styres av notification_settings.tibber_missing.
 * Kjøres av agenda-push cron-hooken.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";

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

const LOCATIONS = ["tollnes", "hytta"] as const;

function osloDay(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

function osloHourMinute(): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { hour: get("hour") % 24, minute: get("minute") };
}

export async function processTibberNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  // Hent innstilling
  const { data: setting } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", "tibber_missing")
    .maybeSingle();

  const value = (setting?.value ?? {}) as {
    enabled?: boolean;
    hour?: number;
    minute?: number;
    recipient?: string;
  };
  if (!value.enabled) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  const targetHour = typeof value.hour === "number" ? value.hour : 9;
  const targetMinute = typeof value.minute === "number" ? value.minute : 0;
  const recipient = value.recipient || "Alle";

  const { hour, minute } = osloHourMinute();
  const nowMin = hour * 60 + minute;
  const targetMin = targetHour * 60 + targetMinute;
  // Vindu: opptil 65 min etter ønsket klokkeslett (cron kjører ofte)
  if (nowMin < targetMin || nowMin > targetMin + 65) {
    return { checked: 0, sent: 0, errors: 0, skipped: 0 };
  }

  const yesterday = osloDay(-1);

  // Sjekk hvilke lokasjoner som mangler i går
  const { data: rows } = await supabaseAdmin
    .from("tibber_daily_kwh")
    .select("location, day")
    .eq("day", yesterday);
  const have = new Set((rows ?? []).map((r: any) => r.location));
  const missing = LOCATIONS.filter((l) => !have.has(l));
  if (missing.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  // Allerede varslet?
  const { data: logged } = await supabaseAdmin
    .from("tibber_notification_log")
    .select("location")
    .eq("notified_for_date", yesterday)
    .in("location", missing as unknown as string[]);
  const alreadyNotified = new Set((logged ?? []).map((r: any) => r.location));
  const toNotify = missing.filter((l) => !alreadyNotified.has(l));
  if (toNotify.length === 0) return { checked: missing.length, sent: 0, errors: 0, skipped: missing.length };

  ensureVapid();

  let subQuery = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  const orFilter = buildSubscriptionWhoOr(recipient);
  if (orFilter) subQuery = subQuery.or(orFilter);
  const { data: subs } = await subQuery;

  let sent = 0;
  let errors = 0;

  for (const loc of toNotify) {
    const payload = JSON.stringify({
      title: `⚡ Tibber-data mangler`,
      body: `Ingen kWh-snapshot for ${loc === "tollnes" ? "Tollnes" : "Hytta"} for ${yesterday}. Sjekk Tibber Pulse.`,
      tag: `tibber-missing-${loc}-${yesterday}`,
      url: "/push-varslinger",
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
          payload,
        );
        sent++;
        void logPushSend({
          feature: "tibber-missing",
          recipient: (sub as any).who || recipient,
          ok: true,
          endpoint: sub.endpoint as string,
          title: `Tibber mangler ${loc}`,
        });
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint as string);
        }
        errors++;
        void logPushSend({
          feature: "tibber-missing",
          recipient: (sub as any).who || recipient,
          ok: false,
          endpoint: sub.endpoint as string,
          status_code: e.statusCode ?? null,
          error_message: e.message ?? null,
          title: `Tibber mangler ${loc}`,
        });
      }
    }

    await supabaseAdmin
      .from("tibber_notification_log")
      .insert({ notified_for_date: yesterday, location: loc });
  }

  return { checked: missing.length, sent, errors, skipped: 0 };
}
