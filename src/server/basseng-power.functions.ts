import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getValidConnection, getHomeyRawSnapshot } from "@/lib/homey.functions";

const STORAGE_KEY = "basseng_automation";

async function getConfiguredSensorId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("notification_settings")
    .select("value")
    .eq("key", STORAGE_KEY)
    .maybeSingle();
  const v = (data?.value ?? {}) as any;
  return (v.wattSensorId ?? v.bassengSwitchId ?? null) as string | null;
}

function integrateKwh(rows: { ts: string; watts: number }[]): number {
  if (rows.length < 2) return 0;
  let wh = 0;
  for (let i = 1; i < rows.length; i++) {
    const dt = (new Date(rows[i].ts).getTime() - new Date(rows[i - 1].ts).getTime()) / 1000;
    if (dt <= 0 || dt > 15 * 60) continue; // hopp over hull > 15 min
    const avg = (Number(rows[i].watts) + Number(rows[i - 1].watts)) / 2;
    wh += (avg * dt) / 3600;
  }
  return wh / 1000;
}

export const getBassengPowerStats = createServerFn({ method: "GET" }).handler(
  async () => {
    const deviceId = await getConfiguredSensorId();
    if (!deviceId) {
      return {
        ok: false as const,
        deviceId: null,
        deviceName: null,
        liveWatts: null as number | null,
        isOn: null as boolean | null,
        lastMotion: null as { ts: string; deviceName: string; zone: string | null } | null,
        kwh24h: 0,
        kwh7d: 0,
        kwhTotal: 0,
        sampleCount: 0,
      };
    }

    // Live watt + on/off fra Homey-snapshot (cachet)
    let liveWatts: number | null = null;
    let deviceName: string | null = null;
    let isOn: boolean | null = null;
    try {
      const conn = await getValidConnection();
      if (conn) {
        const raw = await getHomeyRawSnapshot(conn);
        const d = (raw?.devicesRaw ?? []).find((x: any) => String(x?.id) === deviceId);
        if (d) {
          deviceName = String((d as any)?.name ?? "");
          const caps = (d as any)?.capabilitiesObj ?? (d as any)?.capabilities_obj ?? {};
          const v = caps?.["measure_power"]?.value;
          if (typeof v === "number") liveWatts = v;
          const on = caps?.["onoff"]?.value;
          if (typeof on === "boolean") isOn = on;
        }
      }
    } catch {
      // ignorer
    }

    // Siste bevegelse fra hvilken som helst motion-sensor
    let lastMotion: { ts: string; deviceName: string; zone: string | null } | null = null;
    try {
      const { data: m } = await supabaseAdmin
        .from("homey_sensor_events")
        .select("ts, device_name, zone")
        .eq("kind", "motion")
        .eq("event_type", "motion_on")
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (m) {
        lastMotion = {
          ts: String(m.ts),
          deviceName: String(m.device_name ?? ""),
          zone: (m.zone as string | null) ?? null,
        };
      }
    } catch {
      // ignorer
    }

    // Hent samples for 7 dager (brukes til både 24t og 7d)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: weekRows } = await supabaseAdmin
      .from("device_power_samples")
      .select("ts, watts")
      .eq("device_id", deviceId)
      .gte("ts", sevenDaysAgo)
      .order("ts", { ascending: true });

    const week = (weekRows ?? []) as { ts: string; watts: number }[];
    const dayCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const day = week.filter((r) => new Date(r.ts).getTime() >= dayCutoff);

    const kwh24h = integrateKwh(day);
    const kwh7d = integrateKwh(week);

    // Total: hent alt (kan være mye etterhvert; her er det greit)
    const { data: allRows, count } = await supabaseAdmin
      .from("device_power_samples")
      .select("ts, watts", { count: "exact" })
      .eq("device_id", deviceId)
      .order("ts", { ascending: true });

    const kwhTotal = integrateKwh((allRows ?? []) as { ts: string; watts: number }[]);

    return {
      ok: true as const,
      deviceId,
      deviceName,
      liveWatts,
      isOn,
      lastMotion,
      kwh24h,
      kwh7d,
      kwhTotal,
      sampleCount: count ?? (allRows?.length ?? 0),
    };
  },
);
