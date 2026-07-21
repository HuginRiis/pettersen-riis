/**
 * Batteri-oversikt for hele huset.
 *
 * Kilder:
 *  - Homey (measure_battery-capability på alle enheter)
 *  - Netatmo værstasjon (battery_percent på uteenheter)
 *  - Gardena (batteryLevel på klippere og sensorer)
 *
 * Verdier caches i minnet i 2 timer for å skåne APIene.
 */
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logPushSend } from "./push-log.server";
import { buildSubscriptionWhoOr } from "./push-recipients";
import { getValidConnection, getHomeyRawSnapshot } from "@/lib/homey.functions";

const CACHE_TTL_MS = 2 * 60 * 60_000; // 2 timer
const SETTINGS_KEY = "battery_push";
const DEFAULT_THRESHOLD = 20;

export type BatterySource = "homey" | "netatmo" | "gardena";

export type BatteryItem = {
  id: string;
  source: BatterySource;
  name: string;
  zone: string | null;
  batteryPct: number;
  batteryState: string | null;
  reachable: boolean;
  kind: string | null; // f.eks. "lock", "motion", "mower", "sensor", "outdoor-module"
  lastSeen: string | null;
};

export type BatteryOverview = {
  fetchedAt: string;
  cached: boolean;
  items: BatteryItem[];
  errors: string[];
};

type CacheEntry = { at: number; data: BatteryOverview };
let cache: CacheEntry | null = null;

function fromCache(): BatteryOverview | null {
  if (!cache) return null;
  if (Date.now() - cache.at > CACHE_TTL_MS) return null;
  return { ...cache.data, cached: true };
}

function inferKind(caps: Record<string, unknown> | null, cls: string | undefined, name: string): string | null {
  if (!caps) return cls ?? null;
  if ("locked" in caps) return "lock";
  if ("alarm_contact" in caps) {
    const n = (name || "").toLowerCase();
    if (/vindu|window/.test(n)) return "vindu";
    return "dør";
  }
  if ("alarm_motion" in caps) return "bevegelse";
  if ("alarm_smoke" in caps) return "røyk";
  if ("alarm_water" in caps) return "vann";
  if ("measure_temperature" in caps) return "temperatur";
  return cls ?? null;
}

async function collectHomey(items: BatteryItem[], errors: string[]) {
  try {
    const conn = await getValidConnection();
    if (!conn) return;
    const raw = await getHomeyRawSnapshot(conn);
    if (!raw) return;
    const zoneById = new Map<string, string>();
    for (const z of raw.zonesRaw) zoneById.set(z.id ?? z._id, z.name ?? "Ukjent sal");
    for (const d of raw.devicesRaw) {
      const caps = (d as any).capabilitiesObj ?? (d as any).capabilities_obj;
      if (!caps || typeof caps !== "object") continue;
      const battCap = (caps as any).measure_battery;
      const v = battCap?.value;
      if (typeof v !== "number") continue;
      const alarmBatt = (caps as any).alarm_battery?.value;
      items.push({
        id: `homey:${d.id ?? d._id}`,
        source: "homey",
        name: String(d.name ?? "Ukjent enhet"),
        zone: zoneById.get(d.zone) ?? null,
        batteryPct: Math.max(0, Math.min(100, Math.round(v))),
        batteryState: alarmBatt === true ? "low" : null,
        reachable: (d as any).available !== false,
        kind: inferKind(caps as any, (d as any).class, String(d.name ?? "")),
        lastSeen: battCap?.lastUpdated ?? battCap?.last_updated ?? null,
      });
    }
  } catch (err) {
    errors.push(`homey: ${(err as Error).message ?? String(err)}`);
  }
}

function netatmoTypeLabel(type: string): string {
  switch (type) {
    case "NAMain": return "hovedmodul";
    case "NAModule1": return "utemodul";
    case "NAModule2": return "vindmåler";
    case "NAModule3": return "regnmåler";
    case "NAModule4": return "innemodul";
    default: return type;
  }
}

async function collectNetatmo(items: BatteryItem[], errors: string[]) {
  try {
    const { data } = await supabaseAdmin
      .from("netatmo_climate_snapshot" as any)
      .select("data")
      .limit(20);
    if (!data) return;
    const seen = new Set<string>();
    for (const row of data as any[]) {
      const devices = row?.data?.devices;
      if (!Array.isArray(devices)) continue;
      for (const dev of devices) {
        const all = [dev, ...(dev.modules ?? [])];
        for (const m of all) {
          if (!m || typeof m._id !== "string") continue;
          if (typeof m.battery_percent !== "number") continue;
          if (seen.has(m._id)) continue;
          seen.add(m._id);
          const lastSeen = m.last_message ?? m.last_seen ?? m.last_status_store;
          items.push({
            id: `netatmo:${m._id}`,
            source: "netatmo",
            name: m.module_name ?? m.station_name ?? netatmoTypeLabel(m.type ?? ""),
            zone: dev.station_name ?? "Netatmo",
            batteryPct: Math.max(0, Math.min(100, Math.round(m.battery_percent))),
            batteryState: null,
            reachable: m.reachable !== false,
            kind: netatmoTypeLabel(m.type ?? ""),
            lastSeen: typeof lastSeen === "number" ? new Date(lastSeen * 1000).toISOString() : null,
          });
        }
      }
    }
  } catch (err) {
    errors.push(`netatmo: ${(err as Error).message ?? String(err)}`);
  }
}

async function collectGardena(items: BatteryItem[], errors: string[]) {
  try {
    const { fetchGardenaSnapshot } = await import("@/lib/gardena.server");
    const snap = await fetchGardenaSnapshot();
    if (!snap.ok) return;
    for (const m of snap.mowers) {
      if (typeof m.battery !== "number") continue;
      items.push({
        id: `gardena:mower:${m.id}`,
        source: "gardena",
        name: m.name,
        zone: m.locationName ?? "Gardena",
        batteryPct: Math.max(0, Math.min(100, Math.round(m.battery))),
        batteryState: m.batteryState,
        reachable: true,
        kind: "gressklipper",
        lastSeen: null,
      });
    }
    for (const s of snap.sensors) {
      if (typeof s.battery !== "number") continue;
      items.push({
        id: `gardena:sensor:${s.id}`,
        source: "gardena",
        name: s.name,
        zone: "Gardena",
        batteryPct: Math.max(0, Math.min(100, Math.round(s.battery))),
        batteryState: s.batteryState,
        reachable: true,
        kind: "hage-sensor",
        lastSeen: null,
      });
    }
  } catch (err) {
    errors.push(`gardena: ${(err as Error).message ?? String(err)}`);
  }
}

export async function getBatteryOverviewCached(opts?: { force?: boolean }): Promise<BatteryOverview> {
  if (!opts?.force) {
    const c = fromCache();
    if (c) return c;
  }
  const items: BatteryItem[] = [];
  const errors: string[] = [];
  await Promise.all([
    collectHomey(items, errors),
    collectNetatmo(items, errors),
    collectGardena(items, errors),
  ]);
  items.sort((a, b) => a.batteryPct - b.batteryPct);
  const data: BatteryOverview = {
    fetchedAt: new Date().toISOString(),
    cached: false,
    items,
    errors,
  };
  cache = { at: Date.now(), data };
  return data;
}

// -------------------- push-innstillinger --------------------

export type BatterySettings = {
  enabled: boolean;
  threshold: number; // %
  recipient: string; // "Alle" | "Arne" | ...
  notified: Record<string, string>; // deviceId → siste varsel-dato (ISO-dag)
};

const DEFAULT_SETTINGS: BatterySettings = {
  enabled: true,
  threshold: DEFAULT_THRESHOLD,
  recipient: "Alle",
  notified: {},
};

export async function loadBatterySettings(): Promise<BatterySettings> {
  const { data } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<BatterySettings>;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_SETTINGS.enabled,
    threshold: typeof v.threshold === "number" ? v.threshold : DEFAULT_SETTINGS.threshold,
    recipient: typeof v.recipient === "string" ? v.recipient : DEFAULT_SETTINGS.recipient,
    notified: (v.notified && typeof v.notified === "object" ? v.notified : {}) as Record<string, string>,
  };
}

export async function saveBatterySettings(patch: Partial<BatterySettings>): Promise<BatterySettings> {
  const cur = await loadBatterySettings();
  const next: BatterySettings = { ...cur, ...patch };
  await supabaseAdmin
    .from("notification_settings")
    .upsert({ key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return next;
}

// -------------------- push-sending --------------------

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

function osloDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string; who?: string | null },
  payload: string,
  ctx: { feature: string; recipient?: string; title?: string },
): Promise<boolean> {
  try {
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
    if (e.statusCode === 404 || e.statusCode === 410) {
      await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    }
    void logPushSend({
      feature: ctx.feature,
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

async function fetchSubs(recipient: string) {
  let q = supabaseAdmin.from("push_subscriptions").select("endpoint, p256dh, auth, who");
  if (recipient && recipient !== "Alle") {
    const or = buildSubscriptionWhoOr(recipient);
    if (or) q = q.or(or);
  }
  const { data } = await q;
  return data ?? [];
}

export async function processBatteryNotifications(): Promise<{
  checked: number;
  sent: number;
  errors: number;
  skipped: number;
  low: number;
}> {
  const settings = await loadBatterySettings();
  if (!settings.enabled) return { checked: 0, sent: 0, errors: 0, skipped: 1, low: 0 };

  const overview = await getBatteryOverviewCached();
  const today = osloDayKey();
  const low = overview.items.filter((i) => i.batteryPct <= settings.threshold);
  if (low.length === 0) return { checked: 0, sent: 0, errors: 0, skipped: 0, low: 0 };

  ensureConfigured();
  const subs = await fetchSubs(settings.recipient);
  if (subs.length === 0) {
    return { checked: low.length, sent: 0, errors: 0, skipped: low.length, low: low.length };
  }

  let sent = 0;
  let errors = 0;
  let skipped = 0;
  const nextNotified = { ...settings.notified };
  for (const item of low) {
    if (nextNotified[item.id] === today) {
      skipped++;
      continue;
    }
    const title = `🔋 Lavt batteri — ${item.name}`;
    const zone = item.zone ? ` (${item.zone})` : "";
    const body = `${item.name}${zone} har ${item.batteryPct}% igjen. Kilde: ${item.source}.`;
    const payload = JSON.stringify({
      title,
      body,
      tag: `battery-${item.id}-${today}`,
      url: "/batterier",
    });
    for (const s of subs) {
      const ok = await sendOne(
        {
          endpoint: (s as any).endpoint,
          p256dh: (s as any).p256dh,
          auth: (s as any).auth,
          who: (s as any).who ?? null,
        },
        payload,
        { feature: "batteries", recipient: settings.recipient, title: item.name },
      );
      if (ok) sent++;
      else errors++;
    }
    nextNotified[item.id] = today;
  }

  // Rydd bort gamle merker (over 30 dager gamle) for å ikke vokse ubegrenset
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  for (const k of Object.keys(nextNotified)) {
    if (nextNotified[k] < cutoff) delete nextNotified[k];
  }
  await saveBatterySettings({ notified: nextNotified });

  return { checked: low.length, sent, errors, skipped, low: low.length };
}

export async function sendBatteryTestPush(): Promise<{ sent: number; errors: number }> {
  ensureConfigured();
  const settings = await loadBatterySettings();
  const subs = await fetchSubs(settings.recipient);
  const overview = await getBatteryOverviewCached();
  const lowest = overview.items[0];
  const payload = JSON.stringify({
    title: `🧪 TEST: 🔋 Batteri-varsel`,
    body: lowest
      ? `Laveste akkurat nå: ${lowest.name} (${lowest.batteryPct}%). Terskel: ${settings.threshold}%.`
      : `Ingen batteridata funnet. Terskel: ${settings.threshold}%.`,
    tag: `battery-test-${Date.now()}`,
    url: "/batterier",
  });
  let sent = 0;
  let errors = 0;
  for (const s of subs) {
    const ok = await sendOne(
      {
        endpoint: (s as any).endpoint,
        p256dh: (s as any).p256dh,
        auth: (s as any).auth,
        who: (s as any).who ?? null,
      },
      payload,
      { feature: "batteries-test", recipient: settings.recipient, title: "Batteri-test" },
    );
    if (ok) sent++;
    else errors++;
  }
  return { sent, errors };
}
