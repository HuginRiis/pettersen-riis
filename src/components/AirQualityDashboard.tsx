import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAirQualityHistory } from "@/lib/air-quality-history.functions";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Wind, Droplets, Thermometer, CloudRain } from "lucide-react";

type Row = {
  ts: string;
  pm10: number | null;
  pm25: number | null;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
  european_aqi: number | null;
  temperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  wind_speed: number | null;
};

type Props = {
  locationKey: string;
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
};

type RangeKey = "7d" | "30d" | "90d" | "1y" | "5y";
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "7 dager", days: 7 },
  { key: "30d", label: "30 dager", days: 30 },
  { key: "90d", label: "90 dager", days: 90 },
  { key: "1y", label: "1 år", days: 365 },
  { key: "5y", label: "5 år", days: 1825 },
];

type PollutantKey = "pm25" | "pm10" | "no2" | "o3" | "so2" | "co";
const POLLUTANTS: {
  key: PollutantKey;
  label: string;
  color: string;
  unit: string;
  whoLimit: number;
  euLimit: number;
  hint: string;
}[] = [
  { key: "pm25", label: "PM2.5", color: "oklch(0.70 0.14 280)", unit: "µg/m³", whoLimit: 15, euLimit: 25, hint: "Fint svevestøv — trenger dypt ned i lungene." },
  { key: "pm10", label: "PM10", color: "oklch(0.72 0.16 50)", unit: "µg/m³", whoLimit: 45, euLimit: 50, hint: "Grovt svevestøv — irriterer luftveiene." },
  { key: "no2", label: "NO₂", color: "oklch(0.65 0.20 25)", unit: "µg/m³", whoLimit: 25, euLimit: 40, hint: "Nitrogendioksid — fra biltrafikk og forbrenning." },
  { key: "o3", label: "O₃", color: "oklch(0.78 0.16 140)", unit: "µg/m³", whoLimit: 100, euLimit: 120, hint: "Bakkenært ozon — dannes i solskinn." },
  { key: "so2", label: "SO₂", color: "oklch(0.72 0.18 90)", unit: "µg/m³", whoLimit: 40, euLimit: 125, hint: "Svoveldioksid — fra industri og fossile brensler." },
  { key: "co", label: "CO", color: "oklch(0.65 0.10 30)", unit: "µg/m³", whoLimit: 4000, euLimit: 10000, hint: "Karbonmonoksid — fra ufullstendig forbrenning." },
];

const AQI_BANDS = [
  { max: 20, label: "Veldig god", color: "#16a34a" },
  { max: 40, label: "God", color: "#65a30d" },
  { max: 60, label: "Moderat", color: "#ca8a04" },
  { max: 80, label: "Dårlig", color: "#ea580c" },
  { max: 100, label: "Veldig dårlig", color: "#dc2626" },
  { max: 9999, label: "Ekstremt dårlig", color: "#7e22ce" },
];
function aqiBand(v: number) {
  return AQI_BANDS.find((b) => v <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toFixed(digits);
}

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function movingAvg(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  let count = 0;
  const q: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    q.push(v);
    if (v != null) {
      sum += v;
      count++;
    }
    if (q.length > window) {
      const old = q.shift();
      if (old != null) {
        sum -= old;
        count--;
      }
    }
    out.push(count > 0 ? sum / count : null);
  }
  return out;
}

export function AirQualityDashboard({ locationKey, lat, lon, title, subtitle }: Props) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [pollutant, setPollutant] = useState<PollutantKey>("pm25");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ backfilled: number; latest: string | null } | null>(null);

  const fetchHistory = useServerFn(getAirQualityHistory);

  const days = RANGES.find((r) => r.key === range)?.days ?? 30;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistory({ data: { locationKey, lat, lon, days } })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows as Row[]);
        setMeta({ backfilled: r.backfilled, latest: r.latest });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Ukjent feil"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchHistory, locationKey, lat, lon, days]);

  // Aggregate to daily averages for long ranges (smoother charts)
  const aggregated = useMemo(() => aggregateRows(rows, days), [rows, days]);

  const stats = useMemo(() => computeStats(rows), [rows]);
  const aqiBuckets = useMemo(() => bucketAqi(rows), [rows]);
  const monthly = useMemo(() => monthlyAverages(rows), [rows]);
  const yearOverYear = useMemo(() => yearOverYearMonthly(rows, pollutant), [rows, pollutant]);
  const bestWorst = useMemo(() => bestWorstDays(rows), [rows]);
  const weatherCorr = useMemo(() => buildWeatherCorr(rows, pollutant), [rows, pollutant]);
  const hourlyHeat = useMemo(() => hourlyDayOfWeek(rows, pollutant), [rows, pollutant]);

  return (
    <article className="panel rounded-lg p-4 md:p-6 glow-on-hover space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border/40 pb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary">Komplett analyse</div>
          <h3 className="text-display text-xl md:text-2xl text-foreground tracking-wider uppercase mt-1">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border transition ${
                range === r.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => exportCsv(rows, `${locationKey}-${range}.csv`)}
            className="ml-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground flex items-center gap-1"
            title="Last ned som CSV"
          >
            <Download size={11} /> CSV
          </button>
        </div>
      </header>

      {loading && rows.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground italic">
          Henter historikk… (første lasting kan ta opp til et minutt — vi backfiller flere år)
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Ingen data enda for valgt periode.</p>
      )}

      {rows.length > 0 && (
        <>
          {/* Stat cards */}
          <section>
            <div className="text-[10px] uppercase tracking-[0.3em] text-primary mb-2">Statistikk · {RANGES.find(r=>r.key===range)?.label}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {POLLUTANTS.slice(0, 4).map((p) => {
                const s = stats[p.key];
                if (!s) return null;
                return (
                  <StatCard
                    key={p.key}
                    label={p.label}
                    unit={p.unit}
                    color={p.color}
                    avg={s.avg}
                    p95={s.p95}
                    max={s.max}
                    whoExceedPct={s.whoExceedPct(p.whoLimit)}
                  />
                );
              })}
            </div>
          </section>

          {/* Pollutant selector */}
          <section>
            <div className="flex flex-wrap gap-1 items-center mb-2">
              <span className="text-[10px] uppercase tracking-[0.3em] text-primary mr-2">Stoff i fokus</span>
              {POLLUTANTS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPollutant(p.key)}
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border transition ${
                    pollutant === p.key
                      ? "border-current"
                      : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                  style={pollutant === p.key ? { color: p.color, borderColor: p.color } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* Main trend chart with moving average */}
          <ChartCard
            title={`${POLLUTANTS.find((p) => p.key === pollutant)?.label} · trend med glidende gjennomsnitt`}
            subtitle={`${POLLUTANTS.find((p) => p.key === pollutant)?.hint} WHO: ${POLLUTANTS.find((p) => p.key === pollutant)?.whoLimit} µg/m³ · EU: ${POLLUTANTS.find((p) => p.key === pollutant)?.euLimit} µg/m³`}
          >
            <TrendChart rows={aggregated} pollutant={pollutant} />
          </ChartCard>

          {/* AQI hourly */}
          <ChartCard
            title="AQI-utvikling"
            subtitle="Europeisk AQI med fargekoder for kategori"
          >
            <AqiTimeline rows={aggregated} />
          </ChartCard>

          {/* Multi-pollutant overview */}
          <ChartCard
            title="Alle stoffer samtidig"
            subtitle="Normalisert mot WHO-grense (1.0 = grensen)"
          >
            <MultiPollutantChart rows={aggregated} />
          </ChartCard>

          {/* AQI category distribution */}
          <div className="grid md:grid-cols-2 gap-4">
            <ChartCard title="Tid per AQI-kategori" subtitle="Hvor mange timer i hver helsekategori">
              <AqiBucketsChart buckets={aqiBuckets} />
            </ChartCard>
            <ChartCard title="WHO/EU-overskridelser" subtitle="Andel av timer over hver grense">
              <ExceedanceChart stats={stats} />
            </ChartCard>
          </div>

          {/* Calendar heatmap */}
          <ChartCard
            title="Kalenderkart · daglig gjennomsnitt"
            subtitle="Hver rute er en dag. Farge viser daglig AQI."
          >
            <CalendarHeatmap rows={rows} days={Math.min(days, 365)} />
          </ChartCard>

          {/* Monthly seasonal */}
          <ChartCard
            title="Sesongmønster"
            subtitle="Gjennomsnitt per måned over hele perioden"
          >
            <MonthlyBarChart monthly={monthly} pollutant={pollutant} />
          </ChartCard>

          {/* Year-over-year */}
          {days >= 365 && (
            <ChartCard
              title="År-over-år · samme måned"
              subtitle={`${POLLUTANTS.find((p) => p.key === pollutant)?.label} per måned sammenlignet mellom år`}
            >
              <YearOverYearChart data={yearOverYear as any} pollutant={pollutant} />
            </ChartCard>
          )}

          {/* Hour x weekday heatmap */}
          <ChartCard
            title="Time × ukedag"
            subtitle={`Når på døgnet er ${POLLUTANTS.find((p) => p.key === pollutant)?.label} høyest?`}
          >
            <HourWeekdayHeatmap data={hourlyHeat} pollutant={pollutant} />
          </ChartCard>

          {/* Weather correlation */}
          <div className="grid md:grid-cols-2 gap-4">
            <ChartCard
              title="Vær × forurensning · scatter"
              subtitle={`Hvert punkt er én dag. Korrelasjon: ${weatherCorr.tempR.toFixed(2)} (temp), ${weatherCorr.windR.toFixed(2)} (vind)`}
            >
              <ScatterPair data={weatherCorr.daily} pollutant={pollutant} />
            </ChartCard>
            <ChartCard title="Værpåvirkning over tid" subtitle="Temperatur, vind og nedbør på samme tidsakse">
              <WeatherCombo rows={aggregated} pollutant={pollutant} />
            </ChartCard>
          </div>

          {/* Best/worst days */}
          <div className="grid md:grid-cols-2 gap-4">
            <RankList title="Beste dager" icon={<TrendingDown size={14} className="text-emerald-500" />} items={bestWorst.best} />
            <RankList title="Verste dager" icon={<TrendingUp size={14} className="text-red-500" />} items={bestWorst.worst} />
          </div>

          {/* Records */}
          <ChartCard title="Rekorder og percentiler" subtitle="Hele perioden — for alle hovedstoffer">
            <RecordsTable stats={stats} />
          </ChartCard>

          {/* Sources/health */}
          <section className="rounded-md border border-border/40 bg-background/40 p-4 text-xs leading-relaxed text-muted-foreground space-y-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-primary">Helse og kilder</div>
            <p>
              <strong className="text-foreground">PM2.5</strong> kommer hovedsakelig fra vedfyring, biltrafikk (særlig
              piggdekk) og industri. Lange perioder over WHO sin grense (15 µg/m³) gir økt risiko for hjerte-/karsykdom,
              astma og redusert lungefunksjon hos barn.
            </p>
            <p>
              <strong className="text-foreground">NO₂</strong> kommer nesten utelukkende fra forbrenningsmotorer. Topper
              følger ofte rushtidene på dagene. Lav vind og inversjon gir kraftigere oppbygging.
            </p>
            <p>
              <strong className="text-foreground">O₃</strong> dannes fotokjemisk på solrike sommerdager. Høyere ute på
              landet enn i sentrum, og topper på ettermiddagen.
            </p>
            <p className="text-[11px] opacity-70">
              Data: Open-Meteo Air Quality Archive (CAMS) og ERA5 reanalyse. Oppdateres daglig kl 04:15.{" "}
              {meta?.latest && (
                <>Siste innslag: {new Date(meta.latest).toLocaleDateString("no-NO")}.</>
              )}
            </p>
          </section>
        </>
      )}
    </article>
  );
}

// ============================================================
// Helpers / sub-components
// ============================================================

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border/50 bg-background/40 p-3 md:p-4">
      <header className="mb-2">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </header>
      <div className="w-full">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  unit,
  color,
  avg,
  p95,
  max,
  whoExceedPct,
}: {
  label: string;
  unit: string;
  color: string;
  avg: number | null;
  p95: number | null;
  max: number | null;
  whoExceedPct: number;
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: `color-mix(in oklab, ${color} 40%, transparent)`, background: `color-mix(in oklab, ${color} 8%, transparent)` }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-[9px] text-muted-foreground">{unit}</span>
      </div>
      <div className="text-display text-2xl mt-1" style={{ color }}>{fmt(avg)}</div>
      <div className="text-[10px] text-muted-foreground mt-1 grid grid-cols-2 gap-x-2">
        <span>P95: <span style={{ color }}>{fmt(p95)}</span></span>
        <span>Maks: <span style={{ color }}>{fmt(max)}</span></span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        {whoExceedPct.toFixed(0)}% over WHO
      </div>
    </div>
  );
}

function TrendChart({ rows, pollutant }: { rows: Row[]; pollutant: PollutantKey }) {
  const meta = POLLUTANTS.find((p) => p.key === pollutant)!;
  const values = rows.map((r) => r[pollutant]);
  const ma = movingAvg(values, Math.max(3, Math.floor(rows.length / 30)));
  const data = rows.map((r, i) => ({
    label: r.ts.slice(0, 16).replace("T", " "),
    value: r[pollutant],
    ma: ma[i],
  }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${pollutant}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={meta.color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={meta.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} width={32} />
          <ReferenceLine y={meta.whoLimit} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "WHO", fontSize: 9, fill: "#22c55e", position: "right" }} />
          <ReferenceLine y={meta.euLimit} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "EU", fontSize: 9, fill: "#ef4444", position: "right" }} />
          <Tooltip contentStyle={{ background: "#0f172a", border: `1px solid ${meta.color}`, borderRadius: 8, fontSize: 11 }} />
          <Area type="monotone" dataKey="value" stroke={meta.color} fill={`url(#g-${pollutant})`} strokeWidth={1.5} dot={false} name={meta.label} />
          <Line type="monotone" dataKey="ma" stroke="#fff" strokeWidth={1.8} dot={false} strokeDasharray="4 2" name="Glidende snitt" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function AqiTimeline({ rows }: { rows: Row[] }) {
  const data = rows.map((r) => ({
    label: r.ts.slice(0, 10),
    aqi: r.european_aqi,
  }));
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="g-aqi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dc2626" stopOpacity={0.4} />
              <stop offset="50%" stopColor="#ca8a04" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} width={32} />
          {AQI_BANDS.slice(0, -1).map((b) => (
            <ReferenceLine key={b.label} y={b.max} stroke={b.color} strokeOpacity={0.4} strokeDasharray="2 4" />
          ))}
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }} />
          <Area type="monotone" dataKey="aqi" stroke="#f59e0b" fill="url(#g-aqi)" strokeWidth={1.5} dot={false} name="AQI" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MultiPollutantChart({ rows }: { rows: Row[] }) {
  const data = rows.map((r) => {
    const out: any = { label: r.ts.slice(0, 10) };
    POLLUTANTS.forEach((p) => {
      const v = r[p.key];
      out[p.key] = v != null ? v / p.whoLimit : null;
    });
    return out;
  });
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} width={32} />
          <ReferenceLine y={1} stroke="#fff" strokeDasharray="4 2" label={{ value: "WHO", fontSize: 9, fill: "#fff", position: "right" }} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => Number(v).toFixed(2)} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {POLLUTANTS.map((p) => (
            <Line key={p.key} type="monotone" dataKey={p.key} stroke={p.color} strokeWidth={1.2} dot={false} name={p.label} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AqiBucketsChart({ buckets }: { buckets: { label: string; value: number; color: string }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={buckets} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={42} outerRadius={80} paddingAngle={2}>
            {buckets.map((b, i) => (
              <Cell key={i} fill={b.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }} formatter={(v: any, n: any) => [`${v} timer`, n]} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExceedanceChart({ stats }: { stats: Record<PollutantKey, any> }) {
  const data = POLLUTANTS.map((p) => ({
    label: p.label,
    who: stats[p.key]?.whoExceedPct(p.whoLimit) ?? 0,
    eu: stats[p.key]?.whoExceedPct(p.euLimit) ?? 0,
    color: p.color,
  }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} unit="%" width={36} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="who" fill="#22c55e" name="Over WHO" />
          <Bar dataKey="eu" fill="#ef4444" name="Over EU" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CalendarHeatmap({ rows, days }: { rows: Row[]; days: number }) {
  // Aggregate by day
  const byDay = new Map<string, number[]>();
  rows.forEach((r) => {
    if (r.european_aqi == null) return;
    const d = r.ts.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(r.european_aqi);
  });
  const today = new Date();
  const cells: { date: string; aqi: number | null }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    const vals = byDay.get(key);
    cells.push({ date: key, aqi: vals && vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null });
  }
  const cols = Math.ceil(cells.length / 7);
  return (
    <div className="overflow-x-auto">
      <div
        className="grid grid-flow-col gap-[2px]"
        style={{ gridTemplateRows: "repeat(7, 1fr)", gridAutoColumns: "minmax(10px, 14px)" }}
      >
        {cells.map((c) => {
          const band = c.aqi != null ? aqiBand(c.aqi) : null;
          return (
            <div
              key={c.date}
              title={`${c.date}: ${c.aqi != null ? c.aqi.toFixed(0) : "—"}`}
              className="aspect-square rounded-[2px] border border-background/40"
              style={{ background: band ? band.color : "color-mix(in oklab, var(--muted) 40%, transparent)" }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-muted-foreground">
        {AQI_BANDS.slice(0, -1).map((b) => (
          <span key={b.label} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: b.color }} /> {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MonthlyBarChart({ monthly, pollutant }: { monthly: { month: string; [k: string]: any }[]; pollutant: PollutantKey }) {
  const meta = POLLUTANTS.find((p) => p.key === pollutant)!;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={monthly} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} width={36} />
          <Tooltip contentStyle={{ background: "#0f172a", border: `1px solid ${meta.color}`, borderRadius: 8, fontSize: 11 }} />
          <ReferenceLine y={meta.whoLimit} stroke="#22c55e" strokeDasharray="3 3" />
          <Bar dataKey={pollutant} fill={meta.color} name={meta.label} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function YearOverYearChart({ data, pollutant }: { data: { month: string; [year: string]: any }[]; pollutant: PollutantKey }) {
  const meta = POLLUTANTS.find((p) => p.key === pollutant)!;
  const years = new Set<string>();
  data.forEach((d) => Object.keys(d).forEach((k) => k !== "month" && years.add(k)));
  const yearArr = [...years].sort();
  const palette = ["#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fbbf24"];
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} width={36} />
          <Tooltip contentStyle={{ background: "#0f172a", border: `1px solid ${meta.color}`, borderRadius: 8, fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {yearArr.map((y, i) => (
            <Line key={y} type="monotone" dataKey={y} stroke={palette[i % palette.length]} strokeWidth={1.6} dot={{ r: 2 }} name={y} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HourWeekdayHeatmap({ data, pollutant }: { data: number[][]; pollutant: PollutantKey }) {
  const meta = POLLUTANTS.find((p) => p.key === pollutant)!;
  let max = 0;
  data.forEach((row) => row.forEach((v) => { if (v > max) max = v; }));
  const days = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `auto repeat(24, minmax(12px, 18px))` }}>
        <div></div>
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="text-[8px] text-muted-foreground text-center">{h % 3 === 0 ? h : ""}</div>
        ))}
        {data.map((row, d) => (
          <Fragment key={`r${d}`}>
            <div className="text-[9px] text-muted-foreground pr-1 self-center">{days[d]}</div>
            {row.map((v, h) => {
              const alpha = max > 0 ? v / max : 0;
              return (
                <div
                  key={`${d}-${h}`}
                  title={`${days[d]} kl ${h}: ${v.toFixed(1)} ${meta.unit}`}
                  className="aspect-square rounded-[2px]"
                  style={{ background: `color-mix(in oklab, ${meta.color} ${(alpha * 100).toFixed(0)}%, transparent)` }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function ScatterPair({ data, pollutant }: { data: { temp: number; wind: number; v: number }[]; pollutant: PollutantKey }) {
  const meta = POLLUTANTS.find((p) => p.key === pollutant)!;
  return (
    <div className="h-56 grid grid-cols-2 gap-2">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} />
          <XAxis dataKey="temp" name="Temp" unit="°" tick={{ fontSize: 9, fill: "#94a3b8" }} />
          <YAxis dataKey="v" name={meta.label} tick={{ fontSize: 9, fill: "#94a3b8" }} width={28} />
          <Tooltip contentStyle={{ background: "#0f172a", border: `1px solid ${meta.color}`, borderRadius: 8, fontSize: 11 }} />
          <Scatter data={data} fill={meta.color} fillOpacity={0.6} />
        </ScatterChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} />
          <XAxis dataKey="wind" name="Vind" unit=" m/s" tick={{ fontSize: 9, fill: "#94a3b8" }} />
          <YAxis dataKey="v" name={meta.label} tick={{ fontSize: 9, fill: "#94a3b8" }} width={28} />
          <Tooltip contentStyle={{ background: "#0f172a", border: `1px solid ${meta.color}`, borderRadius: 8, fontSize: 11 }} />
          <Scatter data={data} fill={meta.color} fillOpacity={0.6} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeatherCombo({ rows, pollutant }: { rows: Row[]; pollutant: PollutantKey }) {
  const meta = POLLUTANTS.find((p) => p.key === pollutant)!;
  const data = rows.map((r) => ({
    label: r.ts.slice(0, 10),
    pollutant: r[pollutant],
    temp: r.temperature,
    wind: r.wind_speed,
    precip: r.precipitation,
  }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#64748b" strokeOpacity={0.18} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} width={32} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#cbd5e1" }} tickLine={false} axisLine={false} width={32} />
          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar yAxisId="r" dataKey="precip" fill="#3b82f6" fillOpacity={0.5} name="Nedbør (mm)" />
          <Line yAxisId="r" type="monotone" dataKey="temp" stroke="#f97316" strokeWidth={1.5} dot={false} name="Temp (°C)" />
          <Line yAxisId="r" type="monotone" dataKey="wind" stroke="#10b981" strokeWidth={1.5} dot={false} name="Vind (m/s)" />
          <Area yAxisId="l" type="monotone" dataKey="pollutant" stroke={meta.color} fill={meta.color} fillOpacity={0.25} strokeWidth={1.5} name={meta.label} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankList({ title, icon, items }: { title: string; icon: React.ReactNode; items: { date: string; aqi: number }[] }) {
  return (
    <section className="rounded-md border border-border/50 bg-background/40 p-3">
      <header className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-sm font-medium">{title}</h4>
      </header>
      <ul className="space-y-1">
        {items.map((i) => {
          const band = aqiBand(i.aqi);
          return (
            <li key={i.date} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{i.date}</span>
              <span className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: `color-mix(in oklab, ${band.color} 25%, transparent)`, color: band.color }}>
                  {band.label}
                </span>
                <span className="text-display tabular-nums" style={{ color: band.color }}>{i.aqi.toFixed(0)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecordsTable({ stats }: { stats: Record<PollutantKey, any> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
            <th className="text-left py-2">Stoff</th>
            <th className="text-right py-2">Snitt</th>
            <th className="text-right py-2">Median</th>
            <th className="text-right py-2">P95</th>
            <th className="text-right py-2">P99</th>
            <th className="text-right py-2">Maks</th>
            <th className="text-right py-2">Min</th>
            <th className="text-right py-2">WHO</th>
            <th className="text-right py-2">EU</th>
          </tr>
        </thead>
        <tbody>
          {POLLUTANTS.map((p) => {
            const s = stats[p.key];
            if (!s) return null;
            return (
              <tr key={p.key} className="border-b border-border/20">
                <td className="py-1.5 font-medium" style={{ color: p.color }}>{p.label}</td>
                <td className="text-right tabular-nums">{fmt(s.avg)}</td>
                <td className="text-right tabular-nums">{fmt(s.p50)}</td>
                <td className="text-right tabular-nums">{fmt(s.p95)}</td>
                <td className="text-right tabular-nums">{fmt(s.p99)}</td>
                <td className="text-right tabular-nums">{fmt(s.max)}</td>
                <td className="text-right tabular-nums">{fmt(s.min)}</td>
                <td className="text-right tabular-nums text-emerald-500">{p.whoLimit}</td>
                <td className="text-right tabular-nums text-red-500">{p.euLimit}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Pure data helpers
// ============================================================

function aggregateRows(rows: Row[], days: number): Row[] {
  if (rows.length === 0) return rows;
  // Bucket size
  let bucketHours = 1;
  if (days > 7) bucketHours = 6;
  if (days > 30) bucketHours = 24;
  if (days > 365) bucketHours = 24 * 7;
  if (bucketHours === 1) return rows;
  const ms = bucketHours * 3600_000;
  const buckets = new Map<number, Row[]>();
  for (const r of rows) {
    const t = new Date(r.ts).getTime();
    const key = Math.floor(t / ms) * ms;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  const fields: (keyof Row)[] = ["pm10", "pm25", "no2", "o3", "so2", "co", "european_aqi", "temperature", "humidity", "precipitation", "wind_speed"];
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, group]) => {
    const out: any = { ts: new Date(k).toISOString() };
    for (const f of fields) {
      const vals = group.map((g) => g[f] as number | null).filter((v): v is number => v != null);
      out[f] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return out as Row;
  });
}

function computeStats(rows: Row[]): Record<PollutantKey, any> {
  const out = {} as Record<PollutantKey, any>;
  for (const p of POLLUTANTS) {
    const vals = rows.map((r) => r[p.key]).filter((v): v is number => v != null);
    const sum = vals.reduce((a, b) => a + b, 0);
    out[p.key] = {
      avg: vals.length ? sum / vals.length : null,
      p50: percentile(vals, 50),
      p95: percentile(vals, 95),
      p99: percentile(vals, 99),
      max: vals.length ? Math.max(...vals) : null,
      min: vals.length ? Math.min(...vals) : null,
      whoExceedPct: (limit: number) => (vals.length ? (vals.filter((v) => v > limit).length / vals.length) * 100 : 0),
    };
  }
  return out;
}

function bucketAqi(rows: Row[]) {
  const counts = AQI_BANDS.map((b) => ({ label: b.label, value: 0, color: b.color }));
  rows.forEach((r) => {
    if (r.european_aqi == null) return;
    const idx = AQI_BANDS.findIndex((b) => r.european_aqi! <= b.max);
    if (idx >= 0) counts[idx].value++;
  });
  return counts.filter((c) => c.value > 0);
}

function monthlyAverages(rows: Row[]) {
  const months = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];
  const acc = new Map<number, Record<string, number[]>>();
  rows.forEach((r) => {
    const m = new Date(r.ts).getMonth();
    if (!acc.has(m)) acc.set(m, {});
    const obj = acc.get(m)!;
    POLLUTANTS.forEach((p) => {
      const v = r[p.key];
      if (v != null) {
        obj[p.key] = obj[p.key] ?? [];
        obj[p.key].push(v);
      }
    });
  });
  return months.map((label, i) => {
    const obj = acc.get(i) ?? {};
    const row: any = { month: label };
    POLLUTANTS.forEach((p) => {
      const vs = obj[p.key] ?? [];
      row[p.key] = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    });
    return row;
  });
}

function yearOverYearMonthly(rows: Row[], pollutant: PollutantKey) {
  const months = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];
  const data = months.map((m) => ({ month: m } as Record<string, any>));
  const acc = new Map<string, number[]>();
  rows.forEach((r) => {
    const d = new Date(r.ts);
    const y = d.getFullYear();
    const m = d.getMonth();
    const v = r[pollutant];
    if (v == null) return;
    const k = `${y}_${m}`;
    if (!acc.has(k)) acc.set(k, []);
    acc.get(k)!.push(v);
  });
  acc.forEach((vs, k) => {
    const [y, m] = k.split("_");
    const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
    data[Number(m)][y] = Number(avg.toFixed(2));
  });
  return data;
}

function bestWorstDays(rows: Row[]) {
  const byDay = new Map<string, number[]>();
  rows.forEach((r) => {
    if (r.european_aqi == null) return;
    const d = r.ts.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(r.european_aqi);
  });
  const daily = [...byDay.entries()].map(([date, vs]) => ({
    date,
    aqi: vs.reduce((a, b) => a + b, 0) / vs.length,
  }));
  const sorted = [...daily].sort((a, b) => a.aqi - b.aqi);
  return {
    best: sorted.slice(0, 5),
    worst: sorted.slice(-5).reverse(),
  };
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length < 3) return 0;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

function buildWeatherCorr(rows: Row[], pollutant: PollutantKey) {
  // Aggregate to daily averages
  const byDay = new Map<string, { vs: number[]; ts: number[]; ws: number[] }>();
  rows.forEach((r) => {
    const v = r[pollutant], t = r.temperature, w = r.wind_speed;
    if (v == null) return;
    const d = r.ts.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, { vs: [], ts: [], ws: [] });
    const obj = byDay.get(d)!;
    obj.vs.push(v);
    if (t != null) obj.ts.push(t);
    if (w != null) obj.ws.push(w);
  });
  const daily = [...byDay.entries()].map(([_d, o]) => ({
    v: o.vs.reduce((a, b) => a + b, 0) / o.vs.length,
    temp: o.ts.length ? o.ts.reduce((a, b) => a + b, 0) / o.ts.length : 0,
    wind: o.ws.length ? o.ws.reduce((a, b) => a + b, 0) / o.ws.length : 0,
  })).filter((d) => isFinite(d.temp) && isFinite(d.wind));
  return {
    daily,
    tempR: pearson(daily.map((d) => d.temp), daily.map((d) => d.v)),
    windR: pearson(daily.map((d) => d.wind), daily.map((d) => d.v)),
  };
}

function hourlyDayOfWeek(rows: Row[], pollutant: PollutantKey): number[][] {
  const sum: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const cnt: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  rows.forEach((r) => {
    const v = r[pollutant];
    if (v == null) return;
    const d = new Date(r.ts);
    const dow = d.getDay();
    const h = d.getHours();
    sum[dow][h] += v;
    cnt[dow][h] += 1;
  });
  return sum.map((row, d) => row.map((s, h) => (cnt[d][h] > 0 ? s / cnt[d][h] : 0)));
}

function exportCsv(rows: Row[], filename: string) {
  const headers = ["ts", "pm25", "pm10", "no2", "o3", "so2", "co", "european_aqi", "temperature", "humidity", "precipitation", "wind_speed"];
  const lines = [headers.join(",")];
  rows.forEach((r) => {
    lines.push(headers.map((h) => {
      const v = (r as any)[h];
      return v == null ? "" : v;
    }).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
