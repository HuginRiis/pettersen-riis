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
