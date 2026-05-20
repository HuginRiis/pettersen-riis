import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchHomeyInsightsLog } from "./homey";

type Kind = "motion" | "door" | "lock" | "window" | "contact";

function eventTypeFor(kind: Kind, value: boolean): string {
  if (kind === "motion") return value ? "motion_on" : "motion_off";
  if (kind === "lock") return value ? "locked" : "unlocked";
  if (kind === "window") return value ? "window_open" : "window_close";
  if (kind === "door") return value ? "door_open" : "door_close";
  return value ? "open" : "close";
}

function coerceBool(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return null;
}

const RESOLUTION_MS: Record<string, number> = {
  lastHour: 60 * 60 * 1000,
  last6Hours: 6 * 60 * 60 * 1000,
  last24Hours: 24 * 60 * 60 * 1000,
  last7Days: 7 * 24 * 60 * 60 * 1000,
  last31Days: 31 * 24 * 60 * 60 * 1000,
};

export type HomeySensorHistorySettings = {
  enabled: boolean;
  resolution: "lastHour" | "last6Hours" | "last24Hours" | "last7Days" | "last31Days";
  interval_hours: number;
  last_run_at: string | null;
};

const HISTORY_KEY = "homey_sensor_history_cron";
const HISTORY_DEFAULT: HomeySensorHistorySettings = {
  enabled: false,
  resolution: "last24Hours",
  interval_hours: 6,
  last_run_at: null,
};

export async function loadHomeySensorHistorySettings(): Promise<HomeySensorHistorySettings> {
  const { data } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", HISTORY_KEY)
    .maybeSingle();
  const v = (data?.value as Partial<HomeySensorHistorySettings>) ?? {};
  return {
    enabled: v.enabled === true,
    resolution: typeof v.resolution === "string" && v.resolution in RESOLUTION_MS ? v.resolution as HomeySensorHistorySettings["resolution"] : HISTORY_DEFAULT.resolution,
    interval_hours: typeof v.interval_hours === "number" ? Math.max(1, Math.min(24, Math.round(v.interval_hours))) : HISTORY_DEFAULT.interval_hours,
    last_run_at: typeof v.last_run_at === "string" ? v.last_run_at : null,
  };
}

export async function saveHomeySensorHistorySettings(
  patch: Partial<HomeySensorHistorySettings>,
): Promise<HomeySensorHistorySettings> {
  const current = await loadHomeySensorHistorySettings();
  const next: HomeySensorHistorySettings = {
    ...current,
    ...patch,
    resolution: patch.resolution && patch.resolution in RESOLUTION_MS ? patch.resolution : current.resolution,
    interval_hours: patch.interval_hours == null ? current.interval_hours : Math.max(1, Math.min(24, Math.round(patch.interval_hours))),
  };
  const { data: existing } = await supabaseAdmin
    .from("notification_settings")
    .select("id")
    .eq("key", HISTORY_KEY)
    .maybeSingle();
  if (existing) {
    await supabaseAdmin
      .from("notification_settings")
      .update({ value: next as any, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("notification_settings").insert({ key: HISTORY_KEY, value: next as any });
  }
  return next;
}

export async function backfillHomeySensorHistory(resolution: string): Promise<{
  ok: boolean;
  sensorsProcessed: number;
  eventsInserted: number;
  errors: number;
  error?: string;
}> {
  const { data: sensors } = await supabaseAdmin
    .from("homey_sensor_state")
    .select("device_id, device_name, zone, kind, capability_id");

  if (!sensors || sensors.length === 0) {
    return { ok: false, sensorsProcessed: 0, eventsInserted: 0, errors: 0, error: "ingen sensorer i state" };
  }

  const windowMs = RESOLUTION_MS[resolution] ?? RESOLUTION_MS.last7Days;
  const windowStart = Date.now() - windowMs;

  let inserted = 0;
  let errors = 0;

  for (const s of sensors) {
    try {
      const log: any = await fetchHomeyInsightsLog(s.device_id, s.capability_id, resolution);
      if (!log || log.__error) { errors++; continue; }
      const values: any[] = log?.values ?? log?.data ?? [];
      if (!Array.isArray(values) || values.length === 0) continue;

      // Sort ascending by time
      const points = values
        .map((p) => ({ t: p?.t ?? p?.time ?? p?.timestamp, v: coerceBool(p?.v ?? p?.value) }))
        .filter((p) => p.t && p.v !== null)
        .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

      // Build transition events
      const events: any[] = [];
      let prev: boolean | null = null;
      for (const p of points) {
        const ts = new Date(p.t).getTime();
        if (ts < windowStart) { prev = p.v; continue; }
        if (prev !== null && p.v !== prev) {
          events.push({
            ts: new Date(p.t).toISOString(),
            device_id: s.device_id,
            device_name: s.device_name,
            zone: s.zone,
            kind: s.kind,
            capability_id: s.capability_id,
            event_type: eventTypeFor(s.kind as Kind, p.v as boolean),
            value: p.v ? "true" : "false",
          });
        }
        prev = p.v;
      }

      if (events.length === 0) continue;

      // Dedup via unique constraint (device_id, ts, event_type)
      const { error: insErr, count } = await supabaseAdmin
        .from("homey_sensor_events")
        .upsert(events, { onConflict: "device_id,ts,event_type", ignoreDuplicates: true, count: "exact" });
      if (insErr) {
        errors++;
        console.error("[homey-backfill] upsert", insErr.message);
      } else {
        inserted += count ?? 0;
      }
    } catch (e: any) {
      errors++;
      console.error("[homey-backfill]", s.device_name, e?.message ?? e);
    }
  }

  return { ok: true, sensorsProcessed: sensors.length, eventsInserted: inserted, errors };
}

export async function processHomeySensorHistoryCron(): Promise<{
  checked: number;
  ran: boolean;
  skipped: number;
  result?: Awaited<ReturnType<typeof backfillHomeySensorHistory>>;
}> {
  const cfg = await loadHomeySensorHistorySettings();
  if (!cfg.enabled) return { checked: 1, ran: false, skipped: 1 };
  const lastRun = cfg.last_run_at ? new Date(cfg.last_run_at).getTime() : 0;
  const dueAt = lastRun + cfg.interval_hours * 60 * 60_000;
  if (lastRun > 0 && Date.now() < dueAt) return { checked: 1, ran: false, skipped: 1 };
  const result = await backfillHomeySensorHistory(cfg.resolution);
  await saveHomeySensorHistorySettings({ last_run_at: new Date().toISOString() });
  return { checked: 1, ran: true, skipped: 0, result };
}
