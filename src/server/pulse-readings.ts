import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getHomeySnapshot } from "./homey";

export type PulseLocation = "hytta" | "tollnes";

type PulseDevice = {
  location: PulseLocation;
  device_name: string;
  watt: number | null;
  kwh_today: number | null;
};

/** Finn Pulse-enheter og skill mellom hytta og tollnes basert på navn. */
function findPulseDevices(
  devices: { id: string; name: string; capabilities: Record<string, { value: any }> }[],
): PulseDevice[] {
  const out: PulseDevice[] = [];
  for (const d of devices) {
    const n = (d.name ?? "").toLowerCase();
    const isPulse =
      n.includes("pulse") || n.includes("tibber") || n.includes("bjørkeset") || n.includes("bjorkeset");
    if (!isPulse) continue;

    let location: PulseLocation | null = null;
    if (n.includes("bjørkeset") || n.includes("bjorkeset") || n.includes("hytt")) {
      location = "hytta";
    } else if (n.includes("tollnes")) {
      location = "tollnes";
    }
    if (!location) continue;

    // les watt
    const readNum = (id: string): number | null => {
      const v = d.capabilities[id]?.value;
      return typeof v === "number" ? v : null;
    };
    const findFirst = (pred: (id: string) => boolean): number | null => {
      for (const [id, cap] of Object.entries(d.capabilities)) {
        if (pred(id.toLowerCase()) && typeof cap.value === "number") return cap.value as number;
      }
      return null;
    };

    const watt =
      readNum("measure_power") ??
      readNum("measure_power.consumed") ??
      readNum("measure_power.delivered") ??
      findFirst((id) => id.startsWith("measure_power")) ??
      findFirst((id) => id.includes("power") && !id.includes("meter"));

    const kwh_today =
      readNum("meter_power") ??
      readNum("meter_power.consumed") ??
      readNum("meter_power.today") ??
      findFirst((id) => id.startsWith("meter_power"));

    out.push({ location, device_name: d.name, watt, kwh_today });
  }
  return out;
}

/** Logg dagens Pulse-avlesninger til DB. Kalles av cron hvert 5. min. */
export async function logPulseReadings(): Promise<{ inserted: number; devices: PulseDevice[] }> {
  const snap = await getHomeySnapshot();
  if (!snap.ok) return { inserted: 0, devices: [] };
  const devices = findPulseDevices(snap.devices);
  if (devices.length === 0) return { inserted: 0, devices: [] };

  const rows = devices.map((d) => ({
    location: d.location,
    watt: d.watt,
    kwh_today: d.kwh_today,
    device_name: d.device_name,
  }));
  const { error } = await supabaseAdmin.from("pulse_readings").insert(rows);
  if (error) {
    console.error("[pulse] insert failed", error);
    return { inserted: 0, devices };
  }
  return { inserted: rows.length, devices };
}

/* ---------- Server functions for UI ---------- */

export type PulseReading = {
  recorded_at: string;
  watt: number | null;
  kwh_today: number | null;
};

/** Hent watt-avlesninger siste N minutter for én lokasjon. */
export const getPulseRecent = createServerFn({ method: "GET" })
  .inputValidator((input: { location: PulseLocation; minutes: number }) => input)
  .handler(async ({ data }): Promise<{ readings: PulseReading[] }> => {
    const since = new Date(Date.now() - data.minutes * 60 * 1000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("pulse_readings")
      .select("recorded_at, watt, kwh_today")
      .eq("location", data.location)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true });
    if (error || !rows) return { readings: [] };
    return { readings: rows as PulseReading[] };
  });

export type MonthlyKwh = {
  month: string; // YYYY-MM
  hytta_kwh: number;
  tollnes_kwh: number;
};

/** Aggregert kWh per måned for begge lokasjoner.
 *  Bruker maks(kwh_today) per dag som proxy (Tibber nullstiller daglig). */
export const getPulseMonthly = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ months: MonthlyKwh[] }> => {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const { data: rows, error } = await supabaseAdmin
      .from("pulse_readings")
      .select("recorded_at, location, kwh_today")
      .gte("recorded_at", since.toISOString())
      .not("kwh_today", "is", null)
      .order("recorded_at", { ascending: true });
    if (error || !rows) return { months: [] };

    // For hver lokasjon: max(kwh_today) per dag → sum per måned
    type Key = string;
    const dailyMax = new Map<Key, number>(); // key: loc|YYYY-MM-DD → max kwh
    for (const r of rows as Array<{
      recorded_at: string;
      location: string;
      kwh_today: number;
    }>) {
      const d = new Date(r.recorded_at);
      const day = d.toISOString().slice(0, 10);
      const k = `${r.location}|${day}`;
      const cur = dailyMax.get(k) ?? 0;
      if (r.kwh_today > cur) dailyMax.set(k, r.kwh_today);
    }

    const monthly = new Map<string, { hytta: number; tollnes: number }>();
    for (const [k, v] of dailyMax.entries()) {
      const [loc, day] = k.split("|");
      const month = day.slice(0, 7);
      const cur = monthly.get(month) ?? { hytta: 0, tollnes: 0 };
      if (loc === "hytta") cur.hytta += v;
      else if (loc === "tollnes") cur.tollnes += v;
      monthly.set(month, cur);
    }

    const months: MonthlyKwh[] = Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        hytta_kwh: Math.round(v.hytta * 10) / 10,
        tollnes_kwh: Math.round(v.tollnes * 10) / 10,
      }));

    return { months };
  },
);
