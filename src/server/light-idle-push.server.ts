/**
 * "Lys på uten bevegelse"-varsler.
 *
 * To typer regler:
 *  - scope='zone' : Per rom. Krever lights_on_minutes + no_motion_minutes.
 *  - scope='global': Alle innendørs rom. Bruker bare no_motion_minutes — varsler
 *    summen av tente lys i rom (ikke ute) der bevegelsessensor ikke har trigget
 *    på X minutter.
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
  scope: "zone" | "global";
  homey_zone_id: string | null;
  zone_name: string | null;
  recipient: string;
  lights_on_minutes: number | null;
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

/** Heuristikk: et rom som er "ute" (terrasse, hage, garasje, fasade osv). */
function isOutdoorZoneName(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes("ute") ||
    n.includes("uteplass") ||
    n.includes("hage") ||
    n.includes("terrasse") ||
    n.includes("balkong") ||
    n.includes("veranda") ||
    n.includes("garasje") ||
    n.includes("carport") ||
    n.includes("fasade") ||
    n.includes("inngang") ||
    n.includes("oppkjørsel") ||
    n.includes("oppkjorsel") ||
    n.includes("uthus") ||
    n.includes("plen")
  );
}

export type ZoneStatus = {
  zoneId: string;
  zoneName: string;
  litLights: number;
  totalLights: number;
  motionSensors: number;
  lightsOnSinceMs: number | null;
  lastMotionMs: number | null;
  isOutdoor: boolean;
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
      const name = zoneById.get(zoneId) ?? "Ukjent rom";
      zs = {
        zoneId,
        zoneName: name,
        litLights: 0,
        totalLights: 0,
        motionSensors: 0,
        lightsOnSinceMs: null,
        lastMotionMs: null,
        isOutdoor: isOutdoorZoneName(name),
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

/** Liste rom med BÅDE lys og bevegelsessensor (per-rom-regler). */
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

export type LightIdleZoneStatusRow = {
  zoneId: string;
  zoneName: string;
  hasMotionSensor: boolean;
  motionSensors: number;
  litLights: number;
  /** Tidspunkt (ms epoch) for siste bevegelse i sonen. null hvis aldri/ukjent. */
  lastMotionMs: number | null;
  /** Tidspunkt (ms epoch) eldste tente lampe slo seg på. null hvis ingen tent. */
  lightsOnSinceMs: number | null;
  isOutdoor: boolean;
  /** Regler som gjelder denne zonen, både zone-spesifikke og global. */
  rules: Array<{
    id: string;
    scope: "zone" | "global";
    enabled: boolean;
    no_motion_minutes: number;
    lights_on_minutes: number | null;
    cooldown_minutes: number;
    last_notified_at: string | null;
  }>;
};

/**
 * Bygger per-rom status for "lys uten bevegelse"-varsler.
 * Returnerer KUN rom som har minst én tent lampe (der varsel er relevant).
 */
export async function getLightIdleZoneStatuses(): Promise<LightIdleZoneStatusRow[]> {
  const statuses = await buildZoneStatuses();

  const { data: prefs } = await supabaseAdmin
    .from("light_idle_notification_prefs" as never)
    .select("*");
  const allPrefs = (prefs ?? []) as Array<{
    id: string;
    scope: "zone" | "global";
    homey_zone_id: string | null;
    enabled: boolean;
    no_motion_minutes: number;
    lights_on_minutes: number | null;
    cooldown_minutes: number;
    last_notified_at: string | null;
  }>;

  const out: LightIdleZoneStatusRow[] = [];
  for (const z of statuses.values()) {
    // Inkluder alle rom der det enten brenner lys, eller (innendørs) finnes en
    // bevegelsessensor — sånn at klienten kan beregne både per-rom-status og
    // globalt "siste bevegelse"-tidspunkt på tvers av alle innendørs sensorer.
    const include =
      z.litLights > 0 || (!z.isOutdoor && z.motionSensors > 0);
    if (!include) continue;
    const rules = allPrefs.filter((p) => {
      if (p.scope === "zone") return p.homey_zone_id === z.zoneId;
      // Global regel kobles til alle innendørs rom med tente lys (de som telles
      // når varsel går av). Bevegelsesvinduet beregnes på tvers av ALLE
      // innendørs sensorer separat på klienten/serveren.
      if (p.scope === "global") return !z.isOutdoor && z.litLights > 0;
      return false;
    });
    out.push({
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      hasMotionSensor: z.motionSensors > 0,
      motionSensors: z.motionSensors,
      litLights: z.litLights,
      lastMotionMs: z.lastMotionMs,
      lightsOnSinceMs: z.lightsOnSinceMs,
      isOutdoor: z.isOutdoor,
      rules: rules.map((r) => ({
        id: r.id,
        scope: r.scope,
        enabled: r.enabled,
        no_motion_minutes: r.no_motion_minutes,
        lights_on_minutes: r.lights_on_minutes,
        cooldown_minutes: r.cooldown_minutes,
        last_notified_at: r.last_notified_at,
      })),
    });
  }
  return out;
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

    // Cooldown gjelder begge typer
    if (p.last_notified_at) {
      const lastMs = new Date(p.last_notified_at).getTime();
      if (now - lastMs < p.cooldown_minutes * 60_000) {
        skipped++;
        continue;
      }
    }

    if (p.scope === "global") {
      // Globalt: finn siste bevegelse på tvers av ALLE innendørs sensorer (ett tidsstempel).
      // Når det har gått minst no_motion_minutes siden DEN siste bevegelsen, varsle om
      // ALLE tente lys i innendørs rom — også rom uten sensor. Ute er ekskludert.
      let latestMotionMs: number | null = null;
      for (const z of statuses.values()) {
        if (z.isOutdoor) continue;
        if (z.motionSensors === 0) continue;
        if (z.lastMotionMs == null) continue;
        if (latestMotionMs == null || z.lastMotionMs > latestMotionMs) {
          latestMotionMs = z.lastMotionMs;
        }
      }
      // Hvis vi ikke har noen bevegelsesdata i det hele tatt, hopp over (tryggere enn å spamme).
      if (latestMotionMs == null) {
        skipped++;
        continue;
      }
      const sinceMotionMs = now - latestMotionMs;
      if (sinceMotionMs < p.no_motion_minutes * 60_000) {
        skipped++;
        continue;
      }

      // Samle tente lys i alle innendørs rom (uavhengig av om rommet har sensor)
      const idleRooms: Array<{ name: string; lit: number }> = [];
      let totalLit = 0;
      for (const z of statuses.values()) {
        if (z.isOutdoor) continue;
        if (z.litLights === 0) continue;
        idleRooms.push({ name: z.zoneName, lit: z.litLights });
        totalLit += z.litLights;
      }

      if (totalLit === 0) {
        skipped++;
        continue;
      }

      const recipient = p.recipient || "Alle";
      const title = `💡 ${totalLit} ${totalLit === 1 ? "lampe står" : "lamper står"} på uten folk`;
      const roomsTxt = idleRooms
        .sort((a, b) => b.lit - a.lit)
        .map((r) => `${r.name} (${r.lit})`)
        .join(", ");
      const body = `Ingen bevegelse på minst ${fmtMin(p.no_motion_minutes)}: ${roomsTxt}`;
      const payload = JSON.stringify({
        title,
        body,
        tag: `light-idle-global-${p.id}`,
        url: "/smarthus",
      });
      const r = await pushToRecipient(recipient, payload, title, "light-idle-global");
      sent += r.sent;
      errors += r.errors;
      await supabaseAdmin
        .from("light_idle_notification_prefs" as never)
        .update({ last_notified_at: new Date(now).toISOString() } as never)
        .eq("id", p.id);
      continue;
    }

    // scope === 'zone'
    if (!p.homey_zone_id) {
      skipped++;
      continue;
    }
    const zone = statuses.get(p.homey_zone_id);
    if (!zone) {
      skipped++;
      continue;
    }
    if (zone.litLights === 0 || zone.lightsOnSinceMs === null) {
      skipped++;
      continue;
    }

    const lightsOnMin = p.lights_on_minutes ?? 30;
    const lightsOnMs = now - zone.lightsOnSinceMs;
    if (lightsOnMs < lightsOnMin * 60_000) {
      skipped++;
      continue;
    }

    if (zone.lastMotionMs !== null) {
      const sinceMotionMs = now - zone.lastMotionMs;
      if (sinceMotionMs < p.no_motion_minutes * 60_000) {
        skipped++;
        continue;
      }
    }

    const recipient = p.recipient || "Alle";
    const title = `💡 Lys på i ${zone.zoneName}`;
    const lightsOnMinReal = Math.round(lightsOnMs / 60_000);
    const motionTxt = zone.lastMotionMs
      ? `ingen bevegelse på ${fmtMin(Math.round((now - zone.lastMotionMs) / 60_000))}`
      : `ingen bevegelse registrert`;
    const body = `${zone.litLights} ${zone.litLights === 1 ? "lampe har" : "lamper har"} stått på i ${fmtMin(lightsOnMinReal)} — ${motionTxt}. Vurder å slukke.`;
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

/** Test-push uavhengig av faktiske forhold. */
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
  const isGlobal = p.scope === "global";
  const title = isGlobal
    ? `🧪 TEST · 💡 Lys på uten folk (alle rom)`
    : `🧪 TEST · 💡 Lys på i ${p.zone_name ?? "rom"}`;
  const body = isGlobal
    ? `Test: dette er hva du ville fått hvis det hadde vært tente lys i innendørs rom uten bevegelse på ${fmtMin(p.no_motion_minutes)}.`
    : `Test: dette er hva du ville fått hvis lysene hadde vært på i ${fmtMin(p.lights_on_minutes ?? 30)} uten bevegelse på ${fmtMin(p.no_motion_minutes)}.`;
  const payload = JSON.stringify({
    title,
    body,
    tag: `light-idle-test-${p.id}-${Date.now()}`,
    url: "/smarthus",
  });
  return pushToRecipient(recipient, payload, title, "light-idle-test");
}
