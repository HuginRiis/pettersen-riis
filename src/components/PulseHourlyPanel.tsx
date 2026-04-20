import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { getTibberHourly, type TibberHourlyResult } from "@/server/tibber";

export function PulseHourlyPanel({
  location,
  title,
  subtitle,
}: {
  location: "hytta" | "tollnes";
  title: string;
  subtitle?: string;
}) {
  const fetchHourly = useServerFn(getTibberHourly);
  const [state, setState] = useState<TibberHourlyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchHourly({ data: { location } });
        if (cancelled) return;
        setState(res);
        setUpdated(new Date());
      } catch (err) {
        console.error("[PulseHourlyPanel] failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 60_000); // hvert minutt
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchHourly, location]);

  const hours = state?.hours ?? [];
  const error = state?.error ?? null;

  // Vis siste 24 timer (data kommer som kronologisk liste, siste først? Sortér just in case)
  const sorted = [...hours].sort((a, b) => a.from.localeCompare(b.from));
  const last24 = sorted.slice(-24);

  // Marker timene som tilhører "i dag" (Oslo)
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
  const chartData = last24.map((h) => {
    const dKey = new Date(h.from).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
    return {
      hour: h.hour,
      kwh: h.kwh,
      isToday: dKey === todayKey,
    };
  });

  const todayKwh = state?.todayKwh ?? 0;
  const latestKwh = state?.latestHourKwh ?? null;
  const latestWatt = latestKwh != null ? Math.round(latestKwh * 1000) : null;
  const todayCost = state?.todayCost ?? null;
  const updatedLabel = updated
    ? updated.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <article className="panel rounded-lg p-4 sm:p-5">
      <div className="mb-4">
        <div className="text-[10px] tracking-[0.3em] uppercase text-primary">{title}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        )}
        {error && (
          <div className="text-[11px] text-destructive mt-1">Tibber: {error}</div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr,200px] gap-4">
        {/* Graf */}
        <div className="h-56 w-full order-2 lg:order-1">
          {loading && chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Laster…
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-4">
              Ingen timesdata fra Tibber.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={20}
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
                  formatter={(v: number) => [`${v} kWh`, "Forbruk"]}
                />
                <Bar dataKey="kwh" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.isToday ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.5)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Live-boks */}
        <div className="order-1 lg:order-2 panel rounded-md p-4 bg-background/40 border border-border/40 flex flex-col justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              Siste time
            </div>
            <div className="text-2xl font-semibold text-foreground tabular-nums mt-1">
              {latestKwh != null ? `${latestKwh.toFixed(2)} kWh` : "—"}
            </div>
            {latestWatt != null && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                ≈ {latestWatt} W snitt
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              I dag
            </div>
            <div className="text-xl font-semibold text-primary tabular-nums mt-1">
              {todayKwh.toFixed(1)} kWh
            </div>
            {todayCost != null && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {todayCost.toFixed(2).replace(".", ",")} kr
              </div>
            )}
          </div>

          <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground/70">
            Oppdatert {updatedLabel}
          </div>
        </div>
      </div>
    </article>
  );
}