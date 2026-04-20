import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { getPulseRecent, type PulseReading } from "@/server/pulse-readings";

export function PulseLiveChart({
  location,
  title,
  subtitle,
}: {
  location: "hytta" | "tollnes";
  title: string;
  subtitle?: string;
}) {
  const fetchRecent = useServerFn(getPulseRecent);
  const [data, setData] = useState<PulseReading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchRecent({ data: { location, minutes: 60 } });
        if (!cancelled) setData(res.readings);
      } catch (err) {
        console.error("[PulseLiveChart] load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchRecent, location]);

  const chartData = data
    .filter((r) => typeof r.watt === "number")
    .map((r) => ({
      t: new Date(r.recorded_at).toLocaleTimeString("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      w: Math.round(r.watt as number),
    }));

  const latest = chartData.length > 0 ? chartData[chartData.length - 1].w : null;

  return (
    <article className="panel rounded-lg p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-primary">{title}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-foreground tabular-nums">
            {latest !== null ? `${latest} W` : "—"}
          </div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            Siste timen
          </div>
        </div>
      </div>

      <div className="h-44 w-full">
        {loading && chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Laster…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-4">
            Ingen avlesninger ennå. Grafen fyller seg etter hvert som loggeren kjører
            (hvert 5. minutt).
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                width={42}
                unit=" W"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                formatter={(v: number) => [`${v} W`, "Effekt"]}
              />
              <Line
                type="monotone"
                dataKey="w"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}
