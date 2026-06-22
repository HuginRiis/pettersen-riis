import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { Thermometer, Droplet, Sun } from "lucide-react";
import {
  getBassengHistory,
  type BassengHistoryPoint,
} from "@/lib/basseng-history.functions";

const C_POOL = "#38bdf8"; // sky-400 — vann
const C_OUT = "#f97316"; // orange-500 — ute

function fmtHour(ts: string): string {
  return new Date(ts).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BassengHistoryChart() {
  const fetchHistory = useServerFn(getBassengHistory);
  const [points, setPoints] = useState<BassengHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);



  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHistory({ data: { hours: 24 } })
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
  }, [fetchHistory]);

  const data = useMemo(
    () =>
      points.map((p) => ({
        ts: p.ts,
        label: fmtHour(p.ts),
        pool: p.pool_temp,
        out: p.outdoor_temp,
      })),
    [points],
  );

  const stats = useMemo(() => {
    const poolVals = points.map((p) => p.pool_temp).filter((v): v is number => v != null);
    const outVals = points.map((p) => p.outdoor_temp).filter((v): v is number => v != null);
    const minMax = (xs: number[]) =>
      xs.length === 0
        ? { min: null, max: null, last: null }
        : { min: Math.min(...xs), max: Math.max(...xs), last: xs[xs.length - 1] };
    return { pool: minMax(poolVals), out: minMax(outVals) };
  }, [points]);

  const tempDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    for (const p of points) {
      if (p.pool_temp != null) vals.push(p.pool_temp);
      if (p.outdoor_temp != null) vals.push(p.outdoor_temp);
    }
    if (vals.length === 0) return [0, 30];
    const lo = Math.floor(Math.min(...vals) - 1);
    const hi = Math.ceil(Math.max(...vals) + 1);
    return [lo, hi];
  }, [points]);

  const hasData = data.some((d) => d.pool != null || d.out != null);

  return (
    <section className="container mx-auto px-4 pt-3 sm:pt-4">
      <div className="panel rounded-lg p-4 sm:p-5 bg-gradient-to-br from-sky-500/10 via-transparent to-orange-500/10">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-muted-foreground uppercase mb-0.5">
              Siste døgn
            </div>

            <h3 className="text-display text-primary text-sm sm:text-lg tracking-[0.2em] sm:tracking-[0.25em] uppercase flex items-center gap-2">
              <Thermometer size={14} className="text-[var(--gold)]" />
              Basseng — temperatur
            </h3>
          </div>
          <div className="flex gap-3 sm:gap-4 text-right">
            <StatPill
              icon={<Droplet size={11} style={{ color: C_POOL }} />}
              label="Vann nå"
              value={stats.pool.last}
              min={stats.pool.min}
              max={stats.pool.max}
              color={C_POOL}
            />
            <StatPill
              icon={<Sun size={11} style={{ color: C_OUT }} />}
              label="Ute nå"
              value={stats.out.last}
              min={stats.out.min}
              max={stats.out.max}
              color={C_OUT}
            />
          </div>
        </div>

        <div className="h-56 sm:h-72">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
              Henter målinger…
            </div>
          ) : !hasData ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic px-4 text-center">
              Ingen målinger siste døgn ennå.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="poolFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C_POOL} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={C_POOL} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C_OUT} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C_OUT} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#64748b" strokeOpacity={0.2} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#cbd5e1" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  domain={tempDomain}
                  tick={{ fontSize: 10, fill: "#cbd5e1" }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  unit="°"
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeOpacity={0.35} strokeDasharray="2 3" />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #38bdf8",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#cbd5e1", fontSize: 11 }}
                  formatter={(value: any, name: any) => {
                    if (value == null) return ["—", name];
                    return [`${Number(value).toFixed(1)} °C`, name];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                  iconType="circle"
                />
                <Area
                  type="monotone"
                  dataKey="pool"
                  name="Vann"
                  stroke={C_POOL}
                  strokeWidth={2.5}
                  fill="url(#poolFill)"
                  connectNulls
                  dot={false}
                  activeDot={{ r: 4, stroke: "#0f172a", strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="out"
                  name="Ute"
                  stroke={C_OUT}
                  strokeWidth={2}
                  fill="url(#outFill)"
                  connectNulls
                  dot={false}
                  activeDot={{ r: 4, stroke: "#0f172a", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

function StatPill({
  icon,
  label,
  value,
  min,
  max,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  min: number | null;
  max: number | null;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 justify-end text-[9px] sm:text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className="text-xl sm:text-2xl text-display tabular-nums leading-none mt-0.5"
        style={{ color }}
      >
        {value == null ? "—" : `${value.toFixed(1)}°`}
      </div>
      {min != null && max != null && (
        <div className="text-[9px] sm:text-[10px] text-muted-foreground/80 tabular-nums mt-0.5">
          {min.toFixed(1)}° – {max.toFixed(1)}°
        </div>
      )}
    </div>
  );
}
