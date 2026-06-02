import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getHomeySnapshot } from "@/lib/homey.functions";

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
