/**
 * "Lys på uten bevegelse"-varsler.
 *
 * For hvert rom (Homey-zone) der det finnes både lys og bevegelsessensor,
 * kan en regel sette to terskler:
 *  - lights_on_minutes: lysene må ha vært på lenger enn dette
 *  - no_motion_minutes: bevegelsessensor må ikke ha trigget på dette
 *
 * Når begge oppfylles, sendes push (med cooldown_minutes mellom hver gang).
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
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

type Pref = {
  id: string;
  homey_zone_id: string;
  zone_name: string;
  recipient: string;
  lights_on_minutes: number;
  no_motion_minutes: number;
  enabled: boolean;
  cooldown_minutes: number;
  last_notified_at: string | null;
};

function pickTs(cap: any): number | null {
  const t = cap?.lastUpdated ?? cap?.last_updated ?? cap?.lastChanged;
  if (!t) return null;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * For hver zone, finn:
 *  - tente lys (onoff=true) og når sist en av dem ble slått PÅ
 *  - bevegelsessensorer og siste alarm_motion-trigger
 */
export type ZoneStatus = {
  zoneId: string;
  zoneName: string;
  litLights: number;
  totalLights: number;
  motionSensors: number;
  /** Eldste tidspunkt en lampe i sonen ble slått på (gir lengste "på"-tid). */
  lightsOnSinceMs: number | null;
  /** Siste gang bevegelsessensor i sonen rapporterte aktivitet. */
  lastMotionMs: number | null;
};

async function buildZoneStatuses(): Promise<Map<string, ZoneStatus>> {
  const conn = await getValidConnection();
  if (!conn) return new Map();
  const raw = await getHomeyRawSnapshot(conn);
  if (!raw) return new Map();

  const zoneById = new Map<string, string>();
  for (const z of raw.zonesRaw) zoneById.set(z.id ?? z._id, z.name ?? "Ukjent");

  const out = new Map<string, ZoneStatus>();
  for (const d of raw.devicesRaw) {
    const caps = d.capabilitiesObj ?? d.capabilities_obj ?? {};
    if (!caps || typeof caps !== "object") continue;
    const zoneId = d.zone;
    if (!zoneId) continue;

    const isLight =
      (d.class === "light" || d.virtualClass === "light") && "onoff" in caps;
    const hasMotion = "alarm_motion" in caps;
    if (!isLight && !hasMotion) continue;

    let zs = out.get(zoneId);
    if (!zs) {
      zs = {
        zoneId,
        zoneName: zoneById.get(zoneId) ?? "Ukjent rom",
        litLights: 0,
        totalLights: 0,
        motionSensors: 0,
        lightsOnSinceMs: null,
        lastMotionMs: null,
      };
      out.set(zoneId, zs);
    }

    if (isLight) {
      zs.totalLights++;
      const onoff = caps.onoff;
      if (onoff?.value === true) {
        zs.litLights++;
        const ts = pickTs(onoff);
        if (ts !== null) {
          // Den ELDSTE påslag-tiden vinner — det gir hvor lenge minst én lampe har vært på.
          if (zs.lightsOnSinceMs === null || ts < zs.lightsOnSinceMs) {
            zs.lightsOnSinceMs = ts;
          }
        }
      }
    }
    if (hasMotion) {
      zs.motionSensors++;
      const motion = caps.alarm_motion;
      const ts = pickTs(motion);
      // Hvis sensoren AKKURAT NÅ rapporterer bevegelse, regn det som "nå"
      if (motion?.value === true) {
        zs.lastMotionMs = Date.now();
      } else if (ts !== null) {
        if (zs.lastMotionMs === null || ts > zs.lastMotionMs) {
          zs.lastMotionMs = ts;
        }
      }
    }
  }
  return out;
}

/**
 * Liste over rom i Homey som har BÅDE lys og bevegelsessensor.
 * Brukes av UI-en for å fylle dropdown av valgbare rom.
 */
export async function listLightAndMotionZones(): Promise<
  Array<{ zoneId: string; zoneName: string; lights: number; motionSensors: number }>
> {
  const statuses = await buildZoneStatuses();
  const arr: Array<{ zoneId: string; zoneName: string; lights: number; motionSensors: number }> = [];
  for (const z of statuses.values()) {
    if (z.totalLights > 0 && z.motionSensors > 0) {
      arr.push({
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        lights: z.totalLights,
        motionSensors: z.motionSensors,
      });
    }
  }
  arr.sort((a, b) => a.zoneName.localeCompare(b.zoneName, "nb"));
  return arr;
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { recipient: string; title: string; feature?: string },
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    void logPushSend({
      feature: ctx.feature || "light-idle",
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
    console.error("[light-idle-push] send error", e.statusCode, e.message);
    void logPushSend({
      feature: ctx.feature || "light-idle",
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

async function pushToRecipient(
  recipient: string,
  payload: string,
  title: string,
  feature: string,
): Promise<{ sent: number; errors: number }> {
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  if (recipient !== "Alle") q = q.or(`who.eq.${recipient},who.eq.Alle`);
  const { data: subs, error } = await q;
  if (error) return { sent: 0, errors: 1 };
  let sent = 0;
  let errors = 0;
  for (const s of subs ?? []) {
    const ok = await sendOne(
      {
        endpoint: s.endpoint as string,
        p256dh: s.p256dh as string,
        auth: s.auth as string,
        who: (s as any).who ?? null,
      },
      payload,
      { recipient, title, feature },
    );
    if (ok) sent++;
    else errors++;
  }
  return { sent, errors };
}

function fmtMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} t` : `${h} t ${m} min`;
}

export async function processLightIdleNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
}> {
  ensureConfigured();

  const { data: prefs, error } = await supabaseAdmin
    .from("light_idle_notification_prefs" as never)
    .select("*")
    .eq("enabled", true);
  if (error) throw error;
  if (!prefs || prefs.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0 };

  let statuses: Map<string, ZoneStatus>;
  try {
    statuses = await buildZoneStatuses();
  } catch (err) {
    console.error("[light-idle-push] kunne ikke hente Homey-snapshot", err);
    return { checked: 0, sent: 0, errors: 1, skipped: 0 };
  }

  const now = Date.now();
  let checked = 0;
  let sent = 0;
  let errors = 0;
  let skipped = 0;

  for (const p of prefs as Pref[]) {
    checked++;
    const zone = statuses.get(p.homey_zone_id);
    if (!zone) {
      skipped++;
      continue;
    }
    if (zone.litLights === 0 || zone.lightsOnSinceMs === null) {
      skipped++;
      continue;
    }

    const lightsOnMs = now - zone.lightsOnSinceMs;
    if (lightsOnMs < p.lights_on_minutes * 60_000) {
      skipped++;
      continue;
    }

    // Ingen bevegelse på minst no_motion_minutes
    if (zone.lastMotionMs !== null) {
      const sinceMotionMs = now - zone.lastMotionMs;
      if (sinceMotionMs < p.no_motion_minutes * 60_000) {
        skipped++;
        continue;
      }
    }

    // Cooldown
    if (p.last_notified_at) {
      const lastMs = new Date(p.last_notified_at).getTime();
      if (now - lastMs < p.cooldown_minutes * 60_000) {
        skipped++;
        continue;
      }
    }

    const recipient = p.recipient || "Alle";
    const title = `💡 Lys på i ${zone.zoneName}`;
    const lightsOnMin = Math.round(lightsOnMs / 60_000);
    const motionTxt = zone.lastMotionMs
      ? `ingen bevegelse på ${fmtMin(Math.round((now - zone.lastMotionMs) / 60_000))}`
      : `ingen bevegelse registrert`;
    const body =
      `${zone.litLights} ${zone.litLights === 1 ? "lampe har" : "lamper har"} stått på i ${fmtMin(lightsOnMin)} — ${motionTxt}. Vurder å slukke.`;

    const payload = JSON.stringify({
      title,
      body,
      tag: `light-idle-${p.id}`,
      url: "/smarthus",
    });

    const r = await pushToRecipient(recipient, payload, title, "light-idle");
    sent += r.sent;
    errors += r.errors;

    await supabaseAdmin
      .from("light_idle_notification_prefs" as never)
      .update({ last_notified_at: new Date(now).toISOString() } as never)
      .eq("id", p.id);
  }

  return { checked, sent, errors, skipped };
}

/** Test-push uavhengig av faktiske forhold — sender alltid hvis pref finnes. */
export async function sendLightIdleTest(prefId: string): Promise<{ sent: number; errors: number }> {
  ensureConfigured();
  const { data: pref, error } = await supabaseAdmin
    .from("light_idle_notification_prefs" as never)
    .select("*")
    .eq("id", prefId)
    .maybeSingle();
  if (error) throw error;
  if (!pref) throw new Error("Fant ikke regel");
  const p = pref as unknown as Pref;
  const recipient = p.recipient || "Alle";
  const title = `🧪 TEST · 💡 Lys på i ${p.zone_name}`;
  const body = `Test: dette er hva du ville fått hvis lysene hadde vært på i ${fmtMin(p.lights_on_minutes)} uten bevegelse på ${fmtMin(p.no_motion_minutes)}.`;
  const payload = JSON.stringify({
    title,
    body,
    tag: `light-idle-test-${p.id}-${Date.now()}`,
    url: "/smarthus",
  });
  return pushToRecipient(recipient, payload, title, "light-idle-test");
}
