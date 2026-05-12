import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { listMonthlyRange, type MonthlyAgg } from "@/server/skatt.functions";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];
const fmt = (n: number) => new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(n));

const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6"];

export function SkattCharts({ currentYear, refreshKey, profile }: { currentYear: number; refreshKey?: number; profile: "arne" | "rebekka" }) {
  const fnRange = useServerFn(listMonthlyRange);
  const years = useMemo(() => [currentYear - 2, currentYear - 1, currentYear], [currentYear]);
  const [data, setData] = useState<MonthlyAgg[]>([]);

  useEffect(() => {
    fnRange({ data: { years, profile } }).then(setData).catch(() => setData([]));
  }, [fnRange, years.join(","), refreshKey, profile]);

  const series = useMemo(() => {
    const rows = MONTHS.map((name, i) => {
      const row: any = { month: name };
      for (const y of years) {
        const found = data.find((d) => d.year === y && d.month === i + 1);
        row[`lonn_${y}`] = found ? found.lonn : null;
        row[`skatt_${y}`] = found ? found.skatt + found.ekstra : null;
        row[`utbetalt_${y}`] = found ? found.lonn - found.skatt - found.ekstra : null;
      }
      return row;
    });
    return rows;
  }, [data, years]);

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Måned for måned — siste 3 år</h2>
        <p className="text-xs text-muted-foreground">Sammenligning av lønn, skatt trukket og utbetalt.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartBlock title="Bruttolønn" data={series} years={years} prefix="lonn" />
        <ChartBlock title="Skatt trukket (inkl. ekstra)" data={series} years={years} prefix="skatt" />
        <ChartBlock title="Utbetalt" data={series} years={years} prefix="utbetalt" />
      </div>
    </Card>
  );
}

function ChartBlock({ title, data, years, prefix }: { title: string; data: any[]; years: number[]; prefix: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#7dd3fc" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#fef08a" }} stroke="#7dd3fc" />
            <YAxis tick={{ fontSize: 11, fill: "#fef08a" }} stroke="#7dd3fc" tickFormatter={(v) => fmt(v / 1000) + "k"} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--background))", border: "1px solid #7dd3fc", fontSize: 12, color: "#7dd3fc" }}
              formatter={(v: any) => fmt(Number(v)) + " kr"}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#7dd3fc" }} />
            {years.map((y, i) => (
              <Line
                key={y}
                type="monotone"
                dataKey={`${prefix}_${y}`}
                name={String(y)}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
