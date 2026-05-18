/**
 * Sender push-varsler for planter:
 *  - Vanning: når dager siden last_watered_at >= watering_days_interval
 *  - Gjødsling: når uker siden last_fertilized_at >= fertilize_weeks_interval
 *  - Sesong: dagen sesongen starter (season_start_month)
 *  - Sensor: hvis Mi Flora-verdier er utenfor terskel
 *
 * Trigget fra agenda-push cron-hooken (hvert minutt). Bruker plant_notification_log
 * for å unngå dobbeltvarsling (én gang per dag per (plant_id, kind)).
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";
import { getValidConnection, getHomeyRawSnapshot } from "./homey";

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

type Plant = {
  id: string;
  name: string;
  watering_days_interval: number | null;
  fertilize_weeks_interval: number | null;
  season_start_month: number | null;
  miflora_device_id: string | null;
  soil_moisture_min: number | null;
  light_lux_min: number | null;
  temp_min: number | null;
  temp_max: number | null;
  fertility_min: number | null;
  notify_watering: boolean;
  notify_fertilize: boolean;
  notify_sensor: boolean;
  notify_season: boolean;
  notify_recipient: string;
  last_watered_at: string | null;
  last_fertilized_at: string | null;
};

function osloDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function osloMonth(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", month: "2-digit" }).format(new Date()),
    10,
  );
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

async function alreadyNotifiedToday(plantId: string, kind: string): Promise<boolean> {
  const day = osloDayKey();
  const { data } = await supabaseAdmin
    .from("plant_notification_log")
    .select("notified_at")
    .eq("plant_id", plantId)
    .eq("kind", kind)
    .gte("notified_at", `${day}T00:00:00Z`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function markNotified(plantId: string, kind: string, detail?: string) {
  await supabaseAdmin.from("plant_notification_log").insert({
    plant_id: plantId,
    kind,
    detail: detail ?? null,
  });
}

async function getMiFloraReading(deviceId: string) {
  const conn = await getValidConnection().catch(() => null);
  if (!conn) return null;
  const raw = await getHomeyRawSnapshot(conn).catch(() => null);
  if (!raw) return null;
  const d = (raw.devicesRaw as any[]).find((x) => (x.id ?? x._id) === deviceId);
  if (!d) return null;
  const caps = d.capabilitiesObj ?? d.capabilities_obj ?? {};
  const v = (k: string) => {
    const c = caps[k] as { value?: unknown } | undefined;
    return typeof c?.value === "number" ? (c.value as number) : null;
  };
  return {
    soilMoisture: v("measure_humidity") ?? v("measure_water"),
    light: v("measure_luminance"),
    temperature: v("measure_temperature"),
    fertility: v("measure_conductivity") ?? v("measure_fertility"),
  };
}

async function sendPush(targetWho: string, title: string, body: string, tag: string, url: string) {
  ensureConfigured();
  let subQuery = supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, who");
  if (targetWho && targetWho !== "Alle") {
    const orFilter = buildSubscriptionWhoOr(targetWho);
    if (orFilter) subQuery = subQuery.or(orFilter);
  }
  const { data: subs } = await subQuery;
  let sent = 0;
  let errors = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: (sub as any).endpoint,
          keys: { p256dh: (sub as any).p256dh, auth: (sub as any).auth },
        },
        JSON.stringify({ title, body, tag, url }),
      );
      void logPushSend({
        feature: "plants",
        recipient: targetWho || "Alle",
        ok: true,
        endpoint: (sub as any).endpoint,
        title,
      });
      sent++;
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", (sub as any).endpoint);
      }
      void logPushSend({
        feature: "plants",
        recipient: targetWho || "Alle",
        ok: false,
        endpoint: (sub as any).endpoint,
        status_code: e.statusCode ?? null,
        error_message: e.message ?? null,
        title,
      });
      errors++;
    }
  }
  return { sent, errors };
}

export async function processPlantsNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  const { data: plants, error } = await supabaseAdmin
    .from("plants")
    .select(
      "id,name,watering_days_interval,fertilize_weeks_interval,season_start_month,miflora_device_id,soil_moisture_min,light_lux_min,temp_min,temp_max,fertility_min,notify_watering,notify_fertilize,notify_sensor,notify_season,notify_recipient,last_watered_at,last_fertilized_at",
    );
  if (error) throw error;
  const list = (plants ?? []) as Plant[];

  let checked = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;
  const month = osloMonth();

  for (const p of list) {
    const who = p.notify_recipient || "Alle";

    // Vanning
    if (p.notify_watering && p.watering_days_interval && p.watering_days_interval > 0) {
      checked++;
      const d = daysSince(p.last_watered_at);
      if (d != null && d >= p.watering_days_interval) {
        if (!(await alreadyNotifiedToday(p.id, "watering"))) {
          const r = await sendPush(
            who,
            `💧 ${p.name} trenger vann`,
            `Sist vannet for ${d} dag${d === 1 ? "" : "er"} siden (intervall ${p.watering_days_interval} dager).`,
            `plant-water-${p.id}`,
            "/planter",
          );
          sent += r.sent;
          errors += r.errors;
          await markNotified(p.id, "watering", `days=${d}`);
        } else skipped++;
      }
    }

    // Gjødsling
    if (p.notify_fertilize && p.fertilize_weeks_interval && p.fertilize_weeks_interval > 0) {
      checked++;
      const d = daysSince(p.last_fertilized_at);
      const need = p.fertilize_weeks_interval * 7;
      if (d != null && d >= need) {
        if (!(await alreadyNotifiedToday(p.id, "fertilize"))) {
          const weeks = Math.floor(d / 7);
          const r = await sendPush(
            who,
            `🌿 ${p.name} trenger gjødsel`,
            `Sist gjødslet for ${weeks} uke${weeks === 1 ? "" : "r"} siden (intervall ${p.fertilize_weeks_interval} uker).`,
            `plant-fert-${p.id}`,
            "/planter",
          );
          sent += r.sent;
          errors += r.errors;
          await markNotified(p.id, "fertilize", `days=${d}`);
        } else skipped++;
      }
    }

    // Sesong (én gang per år når måneden begynner)
    if (p.notify_season && p.season_start_month && p.season_start_month === month) {
      checked++;
      const dayOfMonth = parseInt(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", day: "2-digit" }).format(new Date()),
        10,
      );
      if (dayOfMonth <= 3) {
        const tag = `season-${p.id}-${new Date().getUTCFullYear()}`;
        const { data: existing } = await supabaseAdmin
          .from("plant_notification_log")
          .select("id")
          .eq("plant_id", p.id)
          .eq("kind", "season")
          .gte("notified_at", `${new Date().getUTCFullYear()}-01-01T00:00:00Z`)
          .limit(1)
          .maybeSingle();
        if (!existing) {
          const r = await sendPush(
            who,
            `🍂 ${p.name} — sesong starter`,
            `Sesongen for ${p.name} begynner nå. Sjekk høsting og stell.`,
            tag,
            "/planter",
          );
          sent += r.sent;
          errors += r.errors;
          await markNotified(p.id, "season");
        } else skipped++;
      }
    }

    // Sensor (Mi Flora)
    if (p.notify_sensor && p.miflora_device_id) {
      checked++;
      const reading = await getMiFloraReading(p.miflora_device_id);
      if (reading) {
        const issues: string[] = [];
        if (p.soil_moisture_min != null && reading.soilMoisture != null && reading.soilMoisture < p.soil_moisture_min) {
          issues.push(`jord ${reading.soilMoisture}% < ${p.soil_moisture_min}%`);
        }
        if (p.light_lux_min != null && reading.light != null && reading.light < p.light_lux_min) {
          issues.push(`lys ${reading.light} lux < ${p.light_lux_min}`);
        }
        if (p.temp_min != null && reading.temperature != null && reading.temperature < p.temp_min) {
          issues.push(`temp ${reading.temperature}°C < ${p.temp_min}°C`);
        }
        if (p.temp_max != null && reading.temperature != null && reading.temperature > p.temp_max) {
          issues.push(`temp ${reading.temperature}°C > ${p.temp_max}°C`);
        }
        if (p.fertility_min != null && reading.fertility != null && reading.fertility < p.fertility_min) {
          issues.push(`næring ${reading.fertility} < ${p.fertility_min}`);
        }
        if (issues.length > 0) {
          if (!(await alreadyNotifiedToday(p.id, "sensor"))) {
            const r = await sendPush(
              who,
              `⚠️ ${p.name} — sensor utenfor terskel`,
              issues.join(", "),
              `plant-sensor-${p.id}`,
              "/planter",
            );
            sent += r.sent;
            errors += r.errors;
            await markNotified(p.id, "sensor", issues.join("; "));
          } else skipped++;
        }
      }
    }
  }

  return { checked, sent, errors, skipped };
}
