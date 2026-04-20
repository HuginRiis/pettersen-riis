import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { getTibberMonthly, type MonthlyKwh } from "@/server/tibber";

const MONTHS_NB = [
  "jan",
  "feb",
  "mar",
  "apr",
  "mai",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "des",
];

function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS_NB[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

export function PulseMonthlyChart() {
  const fetchMonthly = useServerFn(getTibberMonthly);
  const [data, setData] = useState<MonthlyKwh[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMonthly()
      .then((res) => {
        if (cancelled) return;
        setData(res.months);
        setError(res.error ?? null);
      })
      .catch((err) => {
        console.error("[PulseMonthlyChart] failed", err);
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMonthly]);

  const chartData = data.map((m) => ({
    month: formatMonth(m.month),
    Hytta: m.hytta_kwh,
    Tollnes: m.tollnes_kwh,
  }));

  return (
    <article className="panel rounded-lg p-4 sm:p-5">
      <div className="mb-3">
        <div className="text-[10px] tracking-[0.3em] uppercase text-primary">
          Strømforbruk · måned
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          kWh per måned fra Tibber — Hytta og Tollnes
        </div>
        {error && (
          <div className="text-[11px] text-destructive mt-1">Tibber: {error}</div>
        )}
      </div>

      <div className="h-64 w-full">
        {loading && chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Laster…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-4">
            Ingen månedsdata fra Tibber ennå.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                width={48}
                unit=" kWh"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [`${v} kWh`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Hytta" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tollnes" fill="hsl(var(--gold, var(--accent)))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}
