import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LastUpdated } from "@/components/LastUpdated";
import { ChartZoom } from "@/components/ChartZoom";
import { fetchAirQualityPanel } from "@/server/air-quality-fetch.functions";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Props = {
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
};

type Hourly = {
  time: string[];
  pm10: number[];
  pm2_5: number[];
  carbon_monoxide: number[];
  nitrogen_dioxide: number[];
  sulphur_dioxide: number[];
  ozone: number[];
  dust: number[];
  aerosol_optical_depth: number[];
  uv_index: number[];
  uv_index_clear_sky: number[];
  european_aqi: number[];
};

type Current = {
  time: string;
  pm10: number;
  pm2_5: number;
  carbon_monoxide: number;
  nitrogen_dioxide: number;
  sulphur_dioxide: number;
  ozone: number;
  dust: number;
  uv_index: number;
  european_aqi: number;
};

type Data = { hourly: Hourly; current: Current };

const HOURLY_FIELDS = [
  "pm10",
  "pm2_5",
  "carbon_monoxide",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "dust",
  "aerosol_optical_depth",
  "uv_index",
  "uv_index_clear_sky",
  "european_aqi",
].join(",");

const CURRENT_FIELDS = [
  "european_aqi",
  "pm10",
  "pm2_5",
  "carbon_monoxide",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
  "dust",
  "uv_index",
].join(",");

function osloHourNow(): number {
  const s = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(s, 10) % 24;
}

// European AQI thresholds (https://open-meteo.com/en/docs/air-quality-api)
function aqiLevel(v: number): { label: string; color: string } {
  if (v <= 20) return { label: "Veldig god", color: "oklch(0.72 0.16 150)" };
  if (v <= 40) return { label: "God", color: "oklch(0.74 0.15 140)" };
  if (v <= 60) return { label: "Moderat", color: "oklch(0.78 0.15 80)" };
  if (v <= 80) return { label: "Dårlig", color: "oklch(0.70 0.18 40)" };
  if (v <= 100) return { label: "Veldig dårlig", color: "oklch(0.60 0.22 25)" };
  return { label: "Ekstremt dårlig", color: "oklch(0.50 0.25 15)" };
}

function uvLevel(v: number): { label: string; color: string } {
  if (v < 3) return { label: "Lav", color: "#299501" };
  if (v < 6) return { label: "Moderat", color: "#F7E401" };
  if (v < 8) return { label: "Høy", color: "#F95901" };
  if (v < 11) return { label: "Veldig høy", color: "#D90011" };
  return { label: "Ekstrem", color: "#6846A2" };
}

// Generic "by max in WHO/EU reference" pollutant level
function pollutantLevel(
  pollutant: "pm2_5" | "pm10" | "no2" | "so2" | "o3" | "co" | "dust",
  v: number,
): { label: string; color: string } {
  let t: { mod: number; high: number; vhigh: number };
  switch (pollutant) {
    case "pm2_5":
      t = { mod: 10, high: 25, vhigh: 50 }; // WHO 2021
      break;
    case "pm10":
      t = { mod: 20, high: 50, vhigh: 100 };
      break;
    case "no2":
      t = { mod: 25, high: 50, vhigh: 100 };
      break;
    case "so2":
      t = { mod: 40, high: 100, vhigh: 200 };
      break;
    case "o3":
      t = { mod: 60, high: 120, vhigh: 180 };
      break;
    case "co":
      t = { mod: 4000, high: 10000, vhigh: 30000 };
      break;
    case "dust":
      t = { mod: 50, high: 200, vhigh: 500 };
      break;
  }
  if (v >= t.vhigh) return { label: "Veldig høy", color: "oklch(0.55 0.25 15)" };
  if (v >= t.high) return { label: "Høy", color: "oklch(0.65 0.20 25)" };
  if (v >= t.mod) return { label: "Moderat", color: "oklch(0.78 0.15 70)" };
  return { label: "Lav", color: "oklch(0.72 0.15 140)" };
}

export function AirQualityPanel({ lat, lon, title, subtitle }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAq = useServerFn(fetchAirQualityPanel);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const j = await fetchAq({ data: { lat, lon } });
        if (cancelled) return;
        setData({ hourly: j.hourly, current: j.current });
        setUpdated(j.cachedAt ? new Date(j.cachedAt) : null);
        setError(null);
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

  }, [lat, lon, fetchAq]);

  return (
    <article className="panel rounded-lg p-6 glow-on-hover">
      <header className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <h3 className="text-display text-lg text-primary tracking-wider uppercase">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <LastUpdated label="Open-Meteo" timestamp={updated} />
      </header>

      {loading && !data && (
        <p className="text-sm text-muted-foreground italic">Henter luftmålinger…</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="space-y-5">
          <AqiNow current={data.current} />
          <PollutantGrid current={data.current} />
          <UvAndAqiHourly hourly={data.hourly} />
        </div>
      )}
    </article>
  );
}

function AqiNow({ current }: { current: Current }) {
  const lvl = aqiLevel(current.european_aqi);
  const uv = uvLevel(current.uv_index);
  return (
    <div
      className="rounded-md border-2 p-4 flex items-center justify-between gap-4"
      style={{
        borderColor: lvl.color,
        backgroundColor: `color-mix(in oklab, ${lvl.color} 12%, transparent)`,
      }}
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Europeisk AQI · Nå
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-display text-3xl" style={{ color: lvl.color }}>
            {Math.round(current.european_aqi)}
          </span>
          <span
            className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded border"
            style={{ borderColor: lvl.color, color: lvl.color }}
          >
            {lvl.label}
          </span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          UV-indeks · Nå
        </div>
        <div className="flex items-baseline gap-2 justify-end mt-1">
          <span className="text-display text-2xl" style={{ color: uv.color }}>
            {current.uv_index?.toFixed(1) ?? "—"}
          </span>
          <span
            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
            style={{ borderColor: uv.color, color: uv.color }}
          >
            {uv.label}
          </span>
        </div>
      </div>
    </div>
  );
}

function PollutantGrid({ current }: { current: Current }) {
  const items: {
    label: string;
    value: number;
    unit: string;
    lvl: { label: string; color: string };
    hint: string;
  }[] = [
    {
      label: "PM2.5",
      value: current.pm2_5,
      unit: "µg/m³",
      lvl: pollutantLevel("pm2_5", current.pm2_5),
      hint: "Fine svevestøv",
    },
    {
      label: "PM10",
      value: current.pm10,
      unit: "µg/m³",
      lvl: pollutantLevel("pm10", current.pm10),
      hint: "Grovt svevestøv",
    },
    {
      label: "NO₂",
      value: current.nitrogen_dioxide,
      unit: "µg/m³",
      lvl: pollutantLevel("no2", current.nitrogen_dioxide),
      hint: "Nitrogendioksid",
    },
    {
      label: "O₃",
      value: current.ozone,
      unit: "µg/m³",
      lvl: pollutantLevel("o3", current.ozone),
      hint: "Bakkenært ozon",
    },
    {
      label: "SO₂",
      value: current.sulphur_dioxide,
      unit: "µg/m³",
      lvl: pollutantLevel("so2", current.sulphur_dioxide),
      hint: "Svoveldioksid",
    },
    {
      label: "CO",
      value: current.carbon_monoxide,
      unit: "µg/m³",
      lvl: pollutantLevel("co", current.carbon_monoxide),
      hint: "Karbonmonoksid",
    },
    {
      label: "Støv",
      value: current.dust,
      unit: "µg/m³",
      lvl: pollutantLevel("dust", current.dust),
      hint: "Mineralstøv (Sahara o.l.)",
    },
  ];

  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-primary mb-2">
        Forurensning og gasser · Nå
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map((p) => (
          <div
            key={p.label}
            className="rounded-md border border-border/60 bg-background/40 p-2.5"
            title={p.hint}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-xs text-muted-foreground">{p.label}</span>
              <span
                className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded border"
                style={{ borderColor: p.lvl.color, color: p.lvl.color }}
              >
                {p.lvl.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span
                className="text-display text-lg leading-none"
                style={{ color: p.lvl.color }}
              >
                {p.value != null ? p.value.toFixed(p.value < 10 ? 1 : 0) : "—"}
              </span>
              <span className="text-[9px] text-muted-foreground">{p.unit}</span>
            </div>
            <div className="text-[9px] text-muted-foreground/70 mt-0.5 truncate">{p.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UvAndAqiHourly({ hourly }: { hourly: Hourly }) {
  const nowHour = osloHourNow();
  // Show 24h from current hour
  const times = hourly.time;
  // Find index of "now" (round down to hour)
  const todayIdx = times.findIndex((t) => {
    const h = parseInt(t.slice(11, 13), 10);
    return h === nowHour;
  });
  const startIdx = todayIdx >= 0 ? todayIdx : 0;
  const range = 24;
  const slice = (arr: number[]) => arr.slice(startIdx, startIdx + range);
  const t = times.slice(startIdx, startIdx + range);
  const uv = slice(hourly.uv_index);
  const aqi = slice(hourly.european_aqi);
  const pm25 = slice(hourly.pm2_5);

  const uvMax = Math.max(3, ...uv);
  const aqiMax = Math.max(40, ...aqi);

  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-primary mb-3">
        Time-for-time · Neste 24 timer
      </div>
      <MiniChart label="UV-indeks" values={uv} max={uvMax} times={t} color="oklch(0.78 0.16 55)" />
      <div className="mt-3">
        <MiniChart label="AQI (EU)" values={aqi} max={aqiMax} times={t} color="oklch(0.65 0.20 25)" />
      </div>
      <div className="mt-3">
        <MiniChart
          label="PM2.5 (µg/m³)"
          values={pm25}
          max={Math.max(15, ...pm25)}
          times={t}
          color="oklch(0.70 0.14 280)"
        />
      </div>
    </div>
  );
}

function MiniChart({
  label,
  values,
  max,
  times,
  color,
}: {
  label: string;
  values: number[];
  max: number;
  times: string[];
  color: string;
}) {
  if (!values.length) return null;
  const W = 100;
  const H = 24;
  const step = W / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(H - (v / max) * H).toFixed(2)}`)
    .join(" ");
  const area = `M0,${H} L${points} L${W},${H} Z`;
  const peak = Math.max(...values);
  const peakIdx = values.indexOf(peak);
  const peakHour = times[peakIdx]?.slice(11, 16) ?? "";
  return (
    <ChartZoom
      title={label}
      subtitle={`Time-for-time · 24 timer · Topp ${peak.toFixed(1)} kl. ${peakHour}`}
      detail={<DetailHourlyChart label={label} values={values} times={times} color={color} />}
    >
      <div>
        <div className="flex items-baseline justify-between text-[10px]">
          <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
          <span className="text-muted-foreground">
            Topp <span style={{ color }}>{peak.toFixed(1)}</span> kl. {peakHour}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-10 mt-1">
          <defs>
            <linearGradient id={`g-${label}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#g-${label})`} />
          <path
            d={`M${points}`}
            fill="none"
            stroke={color}
            strokeWidth="0.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <div className="flex justify-between text-[9px] text-muted-foreground/70">
          <span>{times[0]?.slice(11, 13)}</span>
          <span>{times[Math.floor(times.length / 2)]?.slice(11, 13)}</span>
          <span>{times[times.length - 1]?.slice(11, 13)}</span>
        </div>
      </div>
    </ChartZoom>
  );
}

function DetailHourlyChart({
  label,
  values,
  times,
  color,
}: {
  label: string;
  values: number[];
  times: string[];
  color: string;
}) {
  const data = values.map((v, i) => ({
    label: times[i]?.slice(11, 16) ?? "",
    value: v,
  }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={`detail-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.2} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#cbd5e1" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#cbd5e1" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <ReferenceLine y={0} stroke="#94a3b8" strokeOpacity={0.3} />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: `1px solid ${color}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#cbd5e1", fontSize: 11 }}
            formatter={(v: any) => [Number(v).toFixed(1), label]}
          />
          <Area
            type="monotone"
            dataKey="value"
            name={label}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#detail-${label})`}
            dot={{ r: 2, fill: color }}
            activeDot={{ r: 5, stroke: "#0f172a", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
