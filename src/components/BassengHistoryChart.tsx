import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Waves, Thermometer, Zap } from "lucide-react";
import {
  getBassengHistory,
  type BassengHistoryPoint,
} from "@/server/basseng-history.functions";

type Range = 24 | 72 | 168;
const RANGES: { v: Range; label: string }[] = [
  { v: 24, label: "24t" },
  { v: 72, label: "3d" },
  { v: 168, label: "7d" },
];

function fmtClock(ts: string, range: Range): string {
  const d = new Date(ts);
  if (range === 24) {
    return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
  });
}

export function BassengHistoryChart() {
  const fetchHistory = useServerFn(getBassengHistory);
  const [range, setRange] = useState<Range>(72);
  const [points, setPoints] = useState<BassengHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHistory({ data: { hours: range } })
      .then((r) => {
        if (!cancelled) setPoints(r.points);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchHistory, range]);

  const data = useMemo(
    () =>
      points.map((p) => ({
        ts: p.ts,
        label: fmtClock(p.ts, range),
        pool: p.pool_temp,
        outdoor: p.outdoor_temp,
        watts: p.watts,
      })),
    [points, range],
  );

  const tempDomain = useMemo(() => {
    const vals: number[] = [];
    for (const p of points) {
      if (p.pool_temp != null) vals.push(p.pool_temp);
      if (p.outdoor_temp != null) vals.push(p.outdoor_temp);
    }
    if (vals.length === 0) return [0, 40] as [number, number];
    const lo = Math.floor(Math.min(...vals) - 1);
    const hi = Math.ceil(Math.max(...vals) + 1);
    return [lo, hi] as [number, number];
  }, [points]);

  const wattMax = useMemo(() => {
    const vals = points.map((p) => p.watts ?? 0);
    const m = vals.length === 0 ? 1000 : Math.max(...vals, 100);
    return Math.ceil(m / 100) * 100;
  }, [points]);

  const hasData = points.some(
    (p) => p.pool_temp != null || p.outdoor_temp != null || p.watts != null,
  );

  return (
    <section className="container mx-auto px-4 pt-3 sm:pt-4">
      <div className="panel rounded-lg p-4 sm:p-5 bg-gradient-to-br from-sky-500/10 to-transparent">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-muted-foreground uppercase mb-0.5">
              Krønikens linjer
            </div>
            <h3 className="text-display text-primary text-sm sm:text-lg tracking-[0.2em] sm:tracking-[0.25em] uppercase flex items-center gap-2">
              <Waves size={14} className="text-[var(--gold)]" />
              Basseng — forløp
            </h3>
            <div className="hidden sm:flex items-center gap-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground/70 mt-1">
              <span className="flex items-center gap-1">
                <Thermometer size={10} className="text-sky-300" /> Vann
              </span>
              <span className="flex items-center gap-1">
                <Thermometer size={10} className="text-emerald-300" /> Ute
              </span>
              <span className="flex items-center gap-1">
                <Zap size={10} className="text-amber-300" /> Effekt
              </span>
            </div>
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.v}
                onClick={() => setRange(r.v)}
                className={`px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase rounded border transition ${
                  range === r.v
                    ? "border-[var(--gold)]/60 bg-[var(--gold)]/10 text-[var(--gold)]"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64 sm:h-80">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
              Maesteren leser i rullene…
            </div>
          ) : !hasData ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic px-4 text-center">
              Ingen målinger ennå — grafen fylles etter hvert som Homey-pollen samler data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 5, right: 8, left: -10, bottom: 0 }}
              >
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.25} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  yAxisId="temp"
                  domain={tempDomain}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  unit="°"
                />
                <YAxis
                  yAxisId="watt"
                  orientation="right"
                  domain={[0, wattMax]}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                  unit="W"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  formatter={(value: any, name: any) => {
                    if (value == null) return ["—", name];
                    if (name === "Effekt") return [`${Math.round(value)} W`, name];
                    return [`${Number(value).toFixed(1)} °C`, name];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  iconType="line"
                />
                <Area
                  yAxisId="watt"
                  type="monotone"
                  dataKey="watts"
                  name="Effekt"
                  stroke="#fbbf24"
                  strokeWidth={1.5}
                  fill="#fbbf24"
                  fillOpacity={0.18}
                  connectNulls
                  dot={false}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="pool"
                  name="Vann"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="outdoor"
                  name="Ute"
                  stroke="#34d399"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <p className="text-[10px] sm:text-xs italic text-muted-foreground/80 mt-3">
          Effekt vises mot høyre akse (W). Vann- og utetemperatur deler venstre akse (°C). Maesteren bøker en måling per Homey-poll.
        </p>
      </div>
    </section>
  );
}
