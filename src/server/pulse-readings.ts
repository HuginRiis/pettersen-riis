import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getHomeySnapshot } from "./homey";

export type PulseLocation = "hytta" | "tollnes";

/* ---------- Server functions for UI ---------- */

export type PulseReading = {
  recorded_at: string;
  watt: number | null;
  kwh_today: number | null;
};

/** Lagre én sanntidsavlesning fra Tibber Pulse WebSocket. Kalles fra klienten. */
export const recordPulseSample = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      location: PulseLocation;
      watt: number | null;
      kwh_today: number | null;
    }) => input,
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (data.location !== "hytta" && data.location !== "tollnes") {
      return { ok: false };
    }
    const { error } = await supabaseAdmin.from("pulse_readings").insert({
      location: data.location,
      watt: data.watt,
      kwh_today: data.kwh_today,
      device_name: "tibber-ws",
    });
    if (error) {
      console.error("[pulse] insert (ws) failed", error);
      return { ok: false };
    }
    return { ok: true };
  });

export type PulseHistoryPoint = {
  t: string; // ISO
  watt: number | null;
  kwh_today: number | null;
};

/** Hent watt-historikk siste N timer for ett hjem. */
export const getPulseHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { location: PulseLocation; hours: number }) => input)
  .handler(
    async ({ data }): Promise<{ points: PulseHistoryPoint[] }> => {
      const since = new Date(Date.now() - data.hours * 60 * 60 * 1000).toISOString();
      const { data: rows, error } = await supabaseAdmin
        .from("pulse_readings")
        .select("recorded_at, watt, kwh_today")
        .eq("location", data.location)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .limit(2000);
      if (error || !rows) return { points: [] };
      return {
        points: (rows as any[]).map((r) => ({
          t: r.recorded_at,
          watt: r.watt,
          kwh_today: r.kwh_today,
        })),
      };
    },
  );

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
  month: string;
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

    type Key = string;
    const dailyMax = new Map<Key, number>();
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

/* ---------- Live + 24h-graf for Pulse (henter direkte fra Homey) ---------- */

export type HourlyPoint = {
  hour: string; // "HH:00"
  from: string; // ISO
  kwh: number;
  isToday: boolean;
};

export type PulseLiveResult = {
  watt: number | null;
  kwhToday: number | null;
  hours: HourlyPoint[];
  updatedAt: string;
  source: "homey" | "homey+db";
  error?: string;
};

function readPulseFromSnapshot(
  devices: any[],
  location: PulseLocation,
): { watt: number | null; kwh_today: number | null; name: string | null } {
  const candidates = devices.filter((d) => {
    const n = (d.name ?? "").toLowerCase();
    const isPulse =
      n.includes("pulse") ||
      n.includes("tibber") ||
      n.includes("bjørkeset") ||
      n.includes("bjorkeset");
    if (!isPulse) return false;
    if (location === "hytta") {
      return n.includes("bjørkeset") || n.includes("bjorkeset") || n.includes("hytt");
    }
    return n.includes("tollnes") || (!n.includes("hytt") && !n.includes("bjørkeset") && !n.includes("bjorkeset"));
  });
  const dev = candidates[0];
  if (!dev) return { watt: null, kwh_today: null, name: null };

  const readNum = (id: string): number | null => {
    const v = dev.capabilities[id]?.value;
    return typeof v === "number" ? v : null;
  };
  const findFirst = (pred: (id: string) => boolean): number | null => {
    for (const [id, cap] of Object.entries(dev.capabilities) as [string, any][]) {
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

  return { watt, kwh_today, name: dev.name };
}

/** Bygger 24t timesgraf fra pulse_readings i DB.
 *  meter_power-verdier er kumulative og nullstilles ved midnatt → diff per time.
 */
async function buildHourlyFromDb(location: PulseLocation): Promise<HourlyPoint[]> {
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabaseAdmin
    .from("pulse_readings")
    .select("recorded_at, kwh_today")
    .eq("location", location)
    .gte("recorded_at", since)
    .not("kwh_today", "is", null)
    .order("recorded_at", { ascending: true });
  if (!rows || rows.length < 2) return [];

  // Grupper avlesninger per time-bucket (Oslo-tid). For hver time:
  // kWh = max(kwh_today) - min(kwh_today) i den timen, men hvis verdiene
  // synker (midnatt-nullstilling) bruker vi bare max innenfor timen
  // som "forbruk så langt", som ikke er perfekt — bedre: diff mellom
  // siste avlesning i forrige time og siste i denne timen.
  const sorted = rows as Array<{ recorded_at: string; kwh_today: number }>;

  // Lag timesnøkkel "YYYY-MM-DD HH" i Oslo-tid
  const hourKey = (d: Date) => {
    const parts = d
      .toLocaleString("sv-SE", { timeZone: "Europe/Oslo" })
      .slice(0, 13); // "YYYY-MM-DD HH"
    return parts;
  };

  const lastInHour = new Map<string, { at: Date; kwh: number }>();
  for (const r of sorted) {
    const at = new Date(r.recorded_at);
    const k = hourKey(at);
    const cur = lastInHour.get(k);
    if (!cur || at > cur.at) lastInHour.set(k, { at, kwh: r.kwh_today });
  }

  const keys = Array.from(lastInHour.keys()).sort();
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const points: HourlyPoint[] = [];

  for (let i = 1; i < keys.length; i++) {
    const prev = lastInHour.get(keys[i - 1])!;
    const cur = lastInHour.get(keys[i])!;
    let kwh = cur.kwh - prev.kwh;
    if (kwh < 0) {
      // Midnatt-nullstilling — denne timens forbruk er ≈ cur.kwh
      kwh = cur.kwh;
    }
    if (kwh < 0) kwh = 0;
    const dKey = cur.at.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
    const hh = cur.at
      .toLocaleString("sv-SE", { timeZone: "Europe/Oslo", hour: "2-digit" })
      .padStart(2, "0");
    points.push({
      hour: `${hh}:00`,
      from: cur.at.toISOString(),
      kwh: Math.round(kwh * 1000) / 1000,
      isToday: dKey === todayKey,
    });
  }

  return points.slice(-24);
}

/** Live wattage + dagens kWh (fra Homey) + 24t graf (fra DB hvis vi har data). */
export const getPulseLive = createServerFn({ method: "GET" })
  .inputValidator((input: { location: PulseLocation }) => input)
  .handler(async ({ data }): Promise<PulseLiveResult> => {
    const snap = await getHomeySnapshot();
    if (!snap.ok) {
      return {
        watt: null,
        kwhToday: null,
        hours: [],
        updatedAt: new Date().toISOString(),
        source: "homey",
        error: snap.error ?? "Homey ikke tilgjengelig",
      };
    }
    const live = readPulseFromSnapshot(snap.devices as any[], data.location);
    const hours = await buildHourlyFromDb(data.location);
    return {
      watt: live.watt,
      kwhToday: live.kwh_today,
      hours,
      updatedAt: new Date().toISOString(),
      source: hours.length > 0 ? "homey+db" : "homey",
    };
  });

