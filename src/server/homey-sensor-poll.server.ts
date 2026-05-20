import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidConnection, getHomeyRawSnapshot, fetchHomeyInsightsLog } from "./homey";


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

function pickCapTimestamp(capObj: any): string | null {
  const t = capObj?.lastUpdated ?? capObj?.last_updated ?? capObj?.lastChanged;
  if (!t) return null;
  if (typeof t === "string") return t;
  if (typeof t === "number") return new Date(t).toISOString();
  return null;
}

export async function pollHomeySensors(): Promise<{
  ok: boolean;
  scanned: number;
  events: number;
  error?: string;
}> {
  const conn = await getValidConnection();
  if (!conn) return { ok: false, scanned: 0, events: 0, error: "no homey connection" };

  // Cron må hente fersk Homey-snapshot hver gang. Cache på flere minutter gjør
  // at korte bevegelser (typisk baderomssensorer) kan bli borte mellom poll.
  const raw = await getHomeyRawSnapshot(conn, { force: true });
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
    changed_at: string | null;
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
    const cap = capsObj?.[capId];
    const rawValue = cap?.value;
    const value = typeof rawValue === "boolean" ? rawValue : rawValue == null ? null : Boolean(rawValue);
    currents.push({
      device_id: id,
      device_name: name,
      zone: zonesById[zoneId] ?? null,
      kind,
      capability_id: capId,
      value,
      changed_at: pickCapTimestamp(cap),
    });
  }

  if (currents.length === 0) return { ok: true, scanned: 0, events: 0 };

  // Fetch previous state
  const ids = currents.map((c) => c.device_id);
  const { data: prevRows } = await supabaseAdmin
    .from("homey_sensor_state")
    .select("device_id, capability_id, last_value, last_ts")
    .in("device_id", ids);

  const prevMap = new Map<string, { value: string | null; lastTs: string | null }>();
  for (const r of prevRows ?? []) {
    prevMap.set(`${r.device_id}:${r.capability_id}`, {
      value: r.last_value as string | null,
      lastTs: (r.last_ts as string | null) ?? null,
    });
  }

  const events: any[] = [];
  const stateRows: any[] = [];
  const nowIso = new Date().toISOString();

  for (const c of currents) {
    const key = `${c.device_id}:${c.capability_id}`;
    const prev = prevMap.get(key);
    const curStr = c.value == null ? null : c.value ? "true" : "false";
    const isTransition = prev !== undefined && prev.value !== curStr && curStr != null;
    const transitionTs = c.changed_at ?? nowIso;
    if (isTransition) {
      events.push({
        ts: transitionTs,
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
      last_ts: isTransition ? transitionTs : (prev?.lastTs ?? nowIso),
      last_seen: nowIso,
    });
  }

  if (events.length > 0) {
    await supabaseAdmin
      .from("homey_sensor_events")
      .upsert(events, { onConflict: "device_id,ts,event_type", ignoreDuplicates: true });
  }
  // Upsert state
  await supabaseAdmin
    .from("homey_sensor_state")
    .upsert(stateRows.map((r) => ({ ...r, last_ts: r.last_ts ?? nowIso })), {
      onConflict: "device_id,capability_id",
    });

  // Mini-backfill via Homey Insights for lock/door/window — fanger transisjoner
  // som skjer mellom poll-intervaller (typisk: dør åpnet+lukket på 30 sek).
  const insightsKinds: Kind[] = ["lock", "door", "window", "contact"];
  const insightsTargets = currents.filter((c) => insightsKinds.includes(c.kind));
  let backfilledCount = 0;
  if (insightsTargets.length > 0) {
    const sinceMs = Date.now() - 65 * 60_000; // litt mer enn 1 time
    for (const t of insightsTargets) {
      try {
        const log: any = await fetchHomeyInsightsLog(t.device_id, t.capability_id, "lastHour");
        if (!log || log.__error) continue;
        const values: any[] = log?.values ?? log?.data ?? [];
        if (!Array.isArray(values) || values.length === 0) continue;
        const points = values
          .map((p) => ({
            t: p?.t ?? p?.time ?? p?.timestamp,
            v: typeof (p?.v ?? p?.value) === "boolean"
              ? (p.v ?? p.value)
              : (p?.v === 1 || p?.value === 1 || p?.v === "true" || p?.value === "true")
                ? true
                : (p?.v === 0 || p?.value === 0 || p?.v === "false" || p?.value === "false")
                  ? false
                  : null,
          }))
          .filter((p) => p.t && p.v !== null)
          .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
        const transitions: any[] = [];
        let prev: boolean | null = null;
        for (const p of points) {
          const ts = new Date(p.t).getTime();
          if (ts < sinceMs) { prev = p.v as boolean; continue; }
          if (prev !== null && p.v !== prev) {
            transitions.push({
              ts: new Date(p.t).toISOString(),
              device_id: t.device_id,
              device_name: t.device_name,
              zone: t.zone,
              kind: t.kind,
              capability_id: t.capability_id,
              event_type: eventTypeFor(t.kind, p.v as boolean),
              value: p.v ? "true" : "false",
            });
          }
          prev = p.v as boolean;
        }
        if (transitions.length === 0) continue;
        const { error: upErr } = await supabaseAdmin
          .from("homey_sensor_events")
          .upsert(transitions, { onConflict: "device_id,ts,event_type", ignoreDuplicates: true });
        if (!upErr) backfilledCount += transitions.length;
      } catch {
        // ignorer per-device feil
      }
    }
  }

  return { ok: true, scanned: currents.length, events: events.length + backfilledCount };
}

