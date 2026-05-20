import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidConnection, getHomeyRawSnapshot } from "./homey";

type Kind = "motion" | "door" | "window" | "lock" | "contact";

function classify(name: string, caps: Record<string, any>): Kind | null {
  const n = (name || "").toLowerCase();
  if ("alarm_motion" in caps) return "motion";
  if ("locked" in caps) return "lock";
  if ("alarm_contact" in caps) {
    if (/vindu|window/.test(n)) return "window";
    if (/dør|dor|door|port/.test(n)) return "door";
    return "contact";
  }
  return null;
}

function eventTypeFor(kind: Kind, value: boolean | null): string {
  if (kind === "motion") return value ? "motion_on" : "motion_off";
  if (kind === "lock") return value ? "locked" : "unlocked";
  if (kind === "window") return value ? "window_open" : "window_close";
  if (kind === "door") return value ? "door_open" : "door_close";
  return value ? "open" : "close";
}

export async function pollHomeySensors(): Promise<{
  ok: boolean;
  scanned: number;
  events: number;
  error?: string;
}> {
  const conn = await getValidConnection();
  if (!conn) return { ok: false, scanned: 0, events: 0, error: "no homey connection" };

  const raw = await getHomeyRawSnapshot(conn, { force: false });
  if (!raw) return { ok: false, scanned: 0, events: 0, error: "snapshot failed" };

  const zonesById: Record<string, string> = {};
  for (const z of raw.zonesRaw ?? []) {
    zonesById[String((z as any)?.id ?? "")] = String((z as any)?.name ?? "");
  }

  // Build current sensor list
  type Current = {
    device_id: string;
    device_name: string;
    zone: string | null;
    kind: Kind;
    capability_id: string;
    value: boolean | null;
  };
  const currents: Current[] = [];

  for (const d of raw.devicesRaw ?? []) {
    const id = String((d as any)?.id ?? "");
    const name = String((d as any)?.name ?? "");
    const zoneId = String((d as any)?.zone ?? "");
    const capsObj = (d as any)?.capabilitiesObj ?? (d as any)?.capabilities_obj ?? {};
    const kind = classify(name, capsObj);
    if (!kind || !id) continue;
    const capId =
      kind === "motion"
        ? "alarm_motion"
        : kind === "lock"
        ? "locked"
        : "alarm_contact";
    const raw = capsObj?.[capId]?.value;
    const value = typeof raw === "boolean" ? raw : raw == null ? null : Boolean(raw);
    currents.push({
      device_id: id,
      device_name: name,
      zone: zonesById[zoneId] ?? null,
      kind,
      capability_id: capId,
      value,
    });
  }

  if (currents.length === 0) return { ok: true, scanned: 0, events: 0 };

  // Fetch previous state
  const ids = currents.map((c) => c.device_id);
  const { data: prevRows } = await supabaseAdmin
    .from("homey_sensor_state")
    .select("device_id, capability_id, last_value")
    .in("device_id", ids);

  const prevMap = new Map<string, string | null>();
  for (const r of prevRows ?? []) {
    prevMap.set(`${r.device_id}:${r.capability_id}`, r.last_value as string | null);
  }

  const events: any[] = [];
  const stateRows: any[] = [];
  const nowIso = new Date().toISOString();

  for (const c of currents) {
    const key = `${c.device_id}:${c.capability_id}`;
    const prev = prevMap.get(key);
    const curStr = c.value == null ? null : c.value ? "true" : "false";
    const isTransition = prev !== undefined && prev !== curStr && curStr != null;
    if (isTransition) {
      events.push({
        ts: nowIso,
        device_id: c.device_id,
        device_name: c.device_name,
        zone: c.zone,
        kind: c.kind,
        capability_id: c.capability_id,
        event_type: eventTypeFor(c.kind, c.value),
        value: curStr,
      });
    }
    stateRows.push({
      device_id: c.device_id,
      capability_id: c.capability_id,
      device_name: c.device_name,
      zone: c.zone,
      kind: c.kind,
      last_value: curStr,
      last_ts: isTransition ? nowIso : undefined,
      last_seen: nowIso,
    });
  }

  if (events.length > 0) {
    await supabaseAdmin.from("homey_sensor_events").insert(events);
  }
  // Upsert state
  await supabaseAdmin
    .from("homey_sensor_state")
    .upsert(stateRows.map((r) => ({ ...r, last_ts: r.last_ts ?? nowIso })), {
      onConflict: "device_id,capability_id",
    });

  return { ok: true, scanned: currents.length, events: events.length };
}
