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

      // Dedup: fetch existing event timestamps in window for this device
      const { data: existing } = await supabaseAdmin
        .from("homey_sensor_events")
        .select("ts, event_type")
        .eq("device_id", s.device_id)
        .gte("ts", new Date(windowStart).toISOString());
      const existingKeys = new Set(
        (existing ?? []).map((e) => `${e.ts}|${e.event_type}`),
      );
      const fresh = events.filter((e) => !existingKeys.has(`${e.ts}|${e.event_type}`));
      if (fresh.length === 0) continue;

      const { error: insErr } = await supabaseAdmin.from("homey_sensor_events").insert(fresh);
      if (insErr) {
        errors++;
        console.error("[homey-backfill] insert", insErr.message);
      } else {
        inserted += fresh.length;
      }
    } catch (e: any) {
      errors++;
      console.error("[homey-backfill]", s.device_name, e?.message ?? e);
    }
  }

  return { ok: true, sensorsProcessed: sensors.length, eventsInserted: inserted, errors };
}
