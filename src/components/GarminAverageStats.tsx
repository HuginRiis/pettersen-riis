import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Footprints, Heart, Flame, Moon, BedDouble, Loader2, Scale, Activity, Thermometer } from "lucide-react";
import { getGarminOverview } from "@/server/garmin.functions";

type Daily = {
  day: string;
  steps: number | null;
  resting_heart_rate: number | null;
  total_kilocalories: number | null;
  weight_kg: number | null;
};
type Sleep = {
  day: string;
  total_seconds: number | null;
  deep_seconds: number | null;
  light_seconds: number | null;
  rem_seconds: number | null;
  awake_seconds: number | null;
};

type Intraday = { day: string; hour: number; heart_rate_avg: number | null };
type SkinTemp = { day: string; deviation_c: number | null };

type Period = "week" | "month";

function avg(nums: Array<number | null | undefined>): number | null {
  const v = nums.filter((n): n is number => typeof n === "number" && n > 0);
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function fmt(n: number | null, digits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("nb-NO", { maximumFractionDigits: digits });
}

export function GarminAverageStats() {
  const fetchOverview = useServerFn(getGarminOverview);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [sleep, setSleep] = useState<Sleep[]>([]);
  const [intraday, setIntraday] = useState<Intraday[]>([]);
  const [skinTemp, setSkinTemp] = useState<SkinTemp[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = (await fetchOverview()) as { daily: Daily[]; sleep: Sleep[]; intraday?: Intraday[]; skinTemp?: SkinTemp[] };
        if (!alive) return;
        setDaily(r.daily ?? []);
        setSleep(r.sleep ?? []);
        setIntraday(r.intraday ?? []);
        setSkinTemp(r.skinTemp ?? []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchOverview]);

  const stats = useMemo(() => {
    const days = period === "week" ? 7 : 30;
    const d = daily.slice(-days);
    const s = sleep.slice(-days);
    const avgRhr = avg(d.map((x) => x.resting_heart_rate));
    const avgSteps = avg(d.map((x) => x.steps));
    const avgKcal = avg(d.map((x) => x.total_kilocalories));
    const avgSleepSec = avg(s.map((x) => x.total_seconds));
    const avgDeep = avg(s.map((x) => x.deep_seconds));
    const avgLight = avg(s.map((x) => x.light_seconds));
    const avgRem = avg(s.map((x) => x.rem_seconds));
    const ws = d.map((x) => x.weight_kg).filter((n): n is number => typeof n === "number" && n > 0);
    const avgWeight = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
    const wTrend = ws.length >= 2 ? ws[ws.length - 1] - ws[0] : null;
    const wMin = ws.length ? Math.min(...ws) : null;
    const wMax = ws.length ? Math.max(...ws) : null;
    // Score: stability rewards low variance; trend penalizes big swings.
    let weightScore: number | null = null;
    if (avgWeight && ws.length >= 2 && wMin != null && wMax != null) {
      const range = wMax - wMin;
      const stability = Math.max(0, 100 - (range / avgWeight) * 1000); // ~1% spread → -10
      const trendPenalty = Math.min(40, Math.abs((wTrend ?? 0) / avgWeight) * 1000);
      weightScore = Math.round(Math.max(0, Math.min(100, stability - trendPenalty / 2)));
    }

    // Puls gjennom dagen: gjennomsnitt av timesvis HR (siste 7 dager intraday, men begrenset av periode)
    const intraDays = intraday.slice().reduce((acc: Record<string, Intraday[]>, x) => {
      (acc[x.day] ||= []).push(x);
      return acc;
    }, {});
    const intraDayKeys = Object.keys(intraDays).sort().slice(-days);
    const todayKey = intraDayKeys[intraDayKeys.length - 1] ?? null;
    const hrVals = intraDayKeys.flatMap((k) => intraDays[k].map((x) => x.heart_rate_avg));
    const avgDayHr = avg(hrVals);
    const todayHrVals = todayKey ? intraDays[todayKey].map((x) => x.heart_rate_avg).filter((n): n is number => typeof n === "number" && n > 0) : [];
    const todayHrMax = todayHrVals.length ? Math.max(...todayHrVals) : null;
    const todayHrMin = todayHrVals.length ? Math.min(...todayHrVals) : null;

    // Hudtemperatur: avvik fra baseline i °C
    const st = skinTemp.slice(-days);
    const avgSkin = avg(st.map((x) => x.deviation_c));
    const lastSkin = st.length ? st[st.length - 1].deviation_c : null;

    return { avgRhr, avgSteps, avgKcal, avgSleepSec, avgDeep, avgLight, avgRem, avgWeight, wTrend, weightScore, avgDayHr, todayHrMin, todayHrMax, avgSkin, lastSkin };
  }, [daily, sleep, intraday, skinTemp, period]);


  const sleepHours = stats.avgSleepSec ? stats.avgSleepSec / 3600 : null;
  const total = (stats.avgDeep ?? 0) + (stats.avgLight ?? 0) + (stats.avgRem ?? 0);
  const pct = (n: number | null) => (n && total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="panel rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
          Gjennomsnittlig data for Arne
        </h3>
        <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-xs">
          <button
            onClick={() => setPeriod("week")}
            className={`px-3 py-1 ${period === "week" ? "bg-primary/20 text-primary" : "hover:bg-muted/40"}`}
          >
            Siste uke
          </button>
          <button
            onClick={() => setPeriod("month")}
            className={`px-3 py-1 border-l border-border/60 ${period === "month" ? "bg-primary/20 text-primary" : "hover:bg-muted/40"}`}
          >
            Siste måned
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Laster…
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Box icon={<Heart size={14} />} label="Hvilepuls" value={stats.avgRhr ? `${fmt(stats.avgRhr, 0)} bpm` : "—"} />
          <Box icon={<Footprints size={14} />} label="Skritt" value={fmt(stats.avgSteps)} />
          <Box
            icon={<Moon size={14} />}
            label="Søvn"
            value={sleepHours ? `${sleepHours.toFixed(1)} t` : "—"}
          />
          <Box
            icon={<BedDouble size={14} />}
            label="Søvntype"
            value={total > 0 ? `D ${pct(stats.avgDeep)}%` : "—"}
            sub={total > 0 ? `Lett ${pct(stats.avgLight)}% · REM ${pct(stats.avgRem)}%` : undefined}
          />
          <Box icon={<Flame size={14} />} label="Kalorier" value={fmt(stats.avgKcal)} />
          <Box
            icon={<Scale size={14} />}
            label="Vekt"
            value={stats.avgWeight ? `${stats.avgWeight.toFixed(1)} kg` : "—"}
            sub={
              stats.weightScore != null
                ? `Score ${stats.weightScore}${stats.wTrend != null ? ` · ${stats.wTrend > 0 ? "+" : ""}${stats.wTrend.toFixed(1)} kg` : ""}`
                : "ingen veiing"
            }
          />
        </div>
      )}
    </div>
  );
}

function Box({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
