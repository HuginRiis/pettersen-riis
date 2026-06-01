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
  ReferenceLine,
} from "recharts";
import { Sun, Cloud } from "lucide-react";
import { LastUpdated } from "@/components/LastUpdated";
import { ChartZoom } from "@/components/ChartZoom";
import { fetchUvCloudPanel } from "@/server/air-quality-fetch.functions";

type Props = {
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
};

type Row = {
  time: string;
  label: string;
  short: string;
  uv: number;
  uvClear: number;
  cloud: number;
};

const C_UV = "#f97316"; // orange — faktisk UV (med skyer)
const C_UV_CLEAR = "#fbbf24"; // amber — klar himmel
const C_CLOUD = "#94a3b8"; // slate — skydekke

function uvLevel(uv: number): { label: string; color: string } {
  if (uv < 3) return { label: "Lav", color: "#299501" };
  if (uv < 6) return { label: "Moderat", color: "#F7E401" };
  if (uv < 8) return { label: "Høy", color: "#F95901" };
  if (uv < 11) return { label: "Veldig høy", color: "#D90011" };
  return { label: "Ekstrem", color: "#6846A2" };
}

export function UvCloudPanel({ lat, lon, title, subtitle }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUvCloud = useServerFn(fetchUvCloudPanel);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const { aq, fc } = await fetchUvCloud({ data: { lat, lon } });

        const times: string[] = aq.hourly.time;
        const uv: number[] = aq.hourly.uv_index;
        const uvClear: number[] = aq.hourly.uv_index_clear_sky;
        // Build map for cloud cover by time
        const cloudByTime = new Map<string, number>();
        const fcTimes: string[] = fc.hourly.time;
        const cc: number[] = fc.hourly.cloud_cover;
        for (let i = 0; i < fcTimes.length; i++) cloudByTime.set(fcTimes[i], cc[i]);

        // Start fra "nå" — 48 timer fram
        const nowMs = Date.now();
        let startIdx = 0;
        for (let i = 0; i < times.length; i++) {
          // times come without timezone (local). Compare as Oslo local.
          const t = new Date(times[i]).getTime();
          if (t >= nowMs - 60 * 60 * 1000) {
            startIdx = i;
            break;
          }
        }
        const range = Math.min(48, times.length - startIdx);
        const data: Row[] = [];
        for (let i = startIdx; i < startIdx + range; i++) {
          const t = times[i];
          const hourLabel = t.slice(11, 16);
          const dayLabel = new Date(t).toLocaleDateString("nb-NO", {
            weekday: "short",
            day: "2-digit",
          });
          data.push({
            time: t,
            label: `${dayLabel} ${hourLabel}`,
            short: hourLabel,
            uv: uv[i] ?? 0,
            uvClear: uvClear[i] ?? 0,
            cloud: cloudByTime.get(t) ?? 0,
          });
        }

        if (!cancelled) {
          setRows(data);
          setUpdated(new Date());
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ukjent feil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };

  }, [lat, lon, fetchUvCloud]);

  const stats = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const now = rows[0];
    let peak = rows[0];
    for (const r of rows.slice(0, 24)) if (r.uv > peak.uv) peak = r;
    let peakClear = rows[0];
    for (const r of rows.slice(0, 24)) if (r.uvClear > peakClear.uvClear) peakClear = r;
    const avgCloud =
      rows.slice(0, 24).reduce((s, r) => s + r.cloud, 0) / Math.max(1, Math.min(24, rows.length));
    const savedByClouds =
      rows.slice(0, 24).reduce((s, r) => s + Math.max(0, r.uvClear - r.uv), 0) /
      Math.max(1, Math.min(24, rows.length));
    return { now, peak, peakClear, avgCloud, savedByClouds };
  }, [rows]);

  return (
    <article className="panel rounded-lg p-6 glow-on-hover">
      <header className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <h3 className="text-display text-lg text-primary tracking-wider uppercase flex items-center gap-2">
            <Sun size={16} className="text-[var(--gold)]" />
            UV med &amp; uten skydekke
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {title}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
        <LastUpdated label="Open-Meteo" timestamp={updated} />
      </header>

      {loading && !rows && (
        <p className="text-sm text-muted-foreground italic">Henter UV og skydekke…</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {rows && stats && (
        <div className="space-y-4">
          {/* Stat-pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label="UV nå"
              value={stats.now.uv.toFixed(1)}
              sub={uvLevel(stats.now.uv).label}
              color={uvLevel(stats.now.uv).color}
            />
            <Stat
              label="Klar himmel nå"
              value={stats.now.uvClear.toFixed(1)}
              sub={`Skyer ${stats.now.cloud}%`}
              color={C_UV_CLEAR}
            />
            <Stat
              label="Topp i dag"
              value={stats.peak.uv.toFixed(1)}
              sub={`kl. ${stats.peak.short}`}
              color={uvLevel(stats.peak.uv).color}
            />
            <Stat
              label="Skyer demper"
              value={`-${stats.savedByClouds.toFixed(1)}`}
              sub={`Ø ${Math.round(stats.avgCloud)}% skyer`}
              color={C_CLOUD}
            />
          </div>

          <ChartZoom
            title="UV-indeks med og uten skydekke"
            subtitle={`${title} · neste 48 timer · Open-Meteo`}
            detail={<UvCloudChart rows={rows} height={420} showAllTicks />}
            footer={
              <span>
                Oransje linje = faktisk UV (med skyer). Gul stiplet = klar himmel
                (uten skyer). Grått felt = skydekke i prosent på høyre akse.
                Differansen viser hvor mye skyene faktisk demper UV-en.
              </span>
            }
          >
            <UvCloudChart rows={rows} height={240} />
          </ChartZoom>
        </div>
      )}
    </article>
  );
}

function UvCloudChart({
  rows,
  height,
  showAllTicks,
}: {
  rows: Row[];
  height: number;
  showAllTicks?: boolean;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="cloudFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C_CLOUD} stopOpacity={0.5} />
              <stop offset="100%" stopColor={C_CLOUD} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="uvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C_UV} stopOpacity={0.4} />
              <stop offset="100%" stopColor={C_UV} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.2} vertical={false} />
          <XAxis
            dataKey={showAllTicks ? "label" : "short"}
            tick={{ fontSize: 10, fill: "#cbd5e1" }}
            tickLine={false}
            axisLine={false}
            minTickGap={showAllTicks ? 24 : 28}
          />
          <YAxis
            yAxisId="uv"
            domain={[0, (dataMax: number) => Math.max(6, Math.ceil(dataMax + 1))]}
            tick={{ fontSize: 10, fill: "#cbd5e1" }}
            tickLine={false}
            axisLine={false}
            width={28}
            label={{
              value: "UV",
              angle: -90,
              position: "insideLeft",
              fill: "#94a3b8",
              fontSize: 10,
              dx: 14,
            }}
          />
          <YAxis
            yAxisId="cloud"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={32}
            unit="%"
          />
          <ReferenceLine yAxisId="uv" y={3} stroke="#F7E401" strokeOpacity={0.35} strokeDasharray="2 3" />
          <ReferenceLine yAxisId="uv" y={6} stroke="#F95901" strokeOpacity={0.35} strokeDasharray="2 3" />
          <ReferenceLine yAxisId="uv" y={8} stroke="#D90011" strokeOpacity={0.35} strokeDasharray="2 3" />
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
              if (name === "Skydekke") return [`${Math.round(Number(value))} %`, name];
              return [Number(value).toFixed(1), name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" />
          <Area
            yAxisId="cloud"
            type="monotone"
            dataKey="cloud"
            name="Skydekke"
            stroke={C_CLOUD}
            strokeWidth={1}
            fill="url(#cloudFill)"
            dot={false}
          />
          <Area
            yAxisId="uv"
            type="monotone"
            dataKey="uv"
            name="UV (med skyer)"
            stroke={C_UV}
            strokeWidth={2.5}
            fill="url(#uvFill)"
            dot={false}
            activeDot={{ r: 4, stroke: "#0f172a", strokeWidth: 2 }}
          />
          <Line
            yAxisId="uv"
            type="monotone"
            dataKey="uvClear"
            name="UV klar himmel"
            stroke={C_UV_CLEAR}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Cloud size={10} className="opacity-40" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-display text-xl leading-none mt-1 tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">{sub}</div>
    </div>
  );
}
