import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Flame } from "lucide-react";
import { getGarminOverview } from "@/lib/garmin.functions";

type Daily = {
  day: string;
  steps: number | null;
  resting_heart_rate: number | null;
  active_kilocalories: number | null;
  floors_climbed: number | null;
  moderate_intensity_minutes: number | null;
  vigorous_intensity_minutes: number | null;
  body_battery_high: number | null;
  stress_average: number | null;
};
type Sleep = {
  day: string;
  total_seconds: number | null;
  deep_seconds: number | null;
  rem_seconds: number | null;
  sleep_score: number | null;
  hrv_avg: number | null;
  average_spo2: number | null;
  average_respiration: number | null;
};
type Overview = { daily: Daily[]; sleep: Sleep[] };

function osloDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function osloYesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return osloDateKey(d);
}

function pickDay<T extends { day: string }>(arr: T[] | undefined, day: string): T | undefined {
  return arr?.find((x) => x.day === day);
}

type Metric = { a: number | null | undefined; r: number | null | undefined; higherIsBetter: boolean };

function countWins(arne: Overview | null, rebekka: Overview | null, day: string): { arne: number; rebekka: number } {
  if (!arne || !rebekka) return { arne: 0, rebekka: 0 };
  const aD = pickDay(arne.daily, day);
  const rD = pickDay(rebekka.daily, day);
  const aS = pickDay(arne.sleep, day);
  const rS = pickDay(rebekka.sleep, day);
  const intensity = (d?: Daily) =>
    d ? (d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0) : null;

  const metrics: Metric[] = [
    { a: aD?.steps, r: rD?.steps, higherIsBetter: true },
    { a: aS?.total_seconds, r: rS?.total_seconds, higherIsBetter: true },
    { a: aS?.deep_seconds, r: rS?.deep_seconds, higherIsBetter: true },
    { a: aS?.rem_seconds, r: rS?.rem_seconds, higherIsBetter: true },
    { a: aS?.sleep_score, r: rS?.sleep_score, higherIsBetter: true },
    { a: aD?.resting_heart_rate, r: rD?.resting_heart_rate, higherIsBetter: false },
    { a: aS?.hrv_avg, r: rS?.hrv_avg, higherIsBetter: true },
    { a: aS?.average_spo2, r: rS?.average_spo2, higherIsBetter: true },
    { a: aD?.body_battery_high, r: rD?.body_battery_high, higherIsBetter: true },
    { a: aD?.stress_average, r: rD?.stress_average, higherIsBetter: false },
    { a: intensity(aD), r: intensity(rD), higherIsBetter: true },
    { a: aD?.active_kilocalories, r: rD?.active_kilocalories, higherIsBetter: true },
    { a: aD?.floors_climbed, r: rD?.floors_climbed, higherIsBetter: true },
  ];

  let arneW = 0;
  let rebekkaW = 0;
  for (const m of metrics) {
    if (m.a == null || m.r == null || m.a === m.r) continue;
    const arneWins = m.higherIsBetter ? m.a > m.r : m.a < m.r;
    if (arneWins) arneW++;
    else rebekkaW++;
  }
  return { arne: arneW, rebekka: rebekkaW };
}

export function GarminHouseScore() {
  const fetchOverview = useServerFn(getGarminOverview);
  const [arne, setArne] = useState<Overview | null>(null);
  const [rebekka, setRebekka] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, r] = await Promise.all([
          fetchOverview({ data: { owner: "arne" } }),
          fetchOverview({ data: { owner: "rebekka" } }),
        ]);
        if (cancelled) return;
        setArne(a as Overview);
        setRebekka(r as Overview);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOverview]);

  const wins = countWins(arne, rebekka);
  const arneLeads = wins.arne > wins.rebekka;
  const rebekkaLeads = wins.rebekka > wins.arne;
  const display = "var(--font-display)";

  return (
    <div className="grid grid-cols-2 gap-2">
      <div
        className={`rounded border bg-gradient-to-r from-slate-700/60 to-slate-900/80 px-3 py-2 flex items-center gap-2 transition ${
          arneLeads
            ? "border-slate-200/80 shadow-[0_0_22px_rgba(226,232,240,0.45)] ring-1 ring-slate-200/40"
            : "border-slate-500/30"
        }`}
      >
        <Crown className={`h-4 w-4 ${arneLeads ? "text-slate-50" : "text-slate-200"}`} />
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.2em] text-slate-300"
            style={{ fontFamily: display }}
          >
            House Stark
          </div>
          <div className={`font-semibold ${arneLeads ? "text-white" : "text-slate-100"}`}>Arne</div>
        </div>
        <div
          className={`text-2xl tabular-nums ${arneLeads ? "text-white drop-shadow-[0_0_8px_rgba(226,232,240,0.65)]" : "text-slate-100"}`}
          style={{ fontFamily: display, fontWeight: 700 }}
        >
          {wins.arne}
        </div>
      </div>

      <div
        className={`rounded border bg-gradient-to-r from-rose-900/70 to-black/80 px-3 py-2 flex items-center gap-2 transition ${
          rebekkaLeads
            ? "border-rose-200/80 shadow-[0_0_22px_rgba(244,114,182,0.55)] ring-1 ring-rose-300/50"
            : "border-rose-500/30"
        }`}
      >
        <Flame className={`h-4 w-4 ${rebekkaLeads ? "text-rose-50" : "text-rose-200"}`} />
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.2em] text-rose-200"
            style={{ fontFamily: display }}
          >
            House Targaryen
          </div>
          <div className={`font-semibold ${rebekkaLeads ? "text-white" : "text-rose-100"}`}>
            Rebekka
          </div>
        </div>
        <div
          className={`text-2xl tabular-nums ${rebekkaLeads ? "text-white drop-shadow-[0_0_8px_rgba(244,114,182,0.7)]" : "text-rose-100"}`}
          style={{ fontFamily: display, fontWeight: 700 }}
        >
          {wins.rebekka}
        </div>
      </div>
    </div>
  );
}
