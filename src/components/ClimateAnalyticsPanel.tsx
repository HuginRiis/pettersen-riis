import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  LineChart,
  Line,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  Thermometer,
  Droplets,
  Wind,
  Activity,
  TrendingUp,
  Calendar,
  Clock,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  getNetatmoClimateHistory,
  type ClimateHistoryResult,
} from "@/server/netatmo-history";

type Ok = Extract<ClimateHistoryResult, { ok: true }>;

function fmt(v: number | null | undefined, unit = "°", digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v.toFixed(digits)}${unit}`;
}

function trendArrow(now: number | null, ref: number | null): { Icon: typeof Minus; color: string; deltaTxt: string } {
  if (now == null || ref == null) return { Icon: Minus, color: "var(--muted-foreground)", deltaTxt: "–" };
  const d = now - ref;
  if (Math.abs(d) < 0.2) return { Icon: Minus, color: "var(--muted-foreground)", deltaTxt: "0.0" };
  if (d > 0) return { Icon: ArrowUp, color: "#fb923c", deltaTxt: `+${d.toFixed(1)}` };
  return { Icon: ArrowDown, color: "#7dd3fc", deltaTxt: d.toFixed(1) };
}

function CompareBox({
  label,
  icon: Icon,
  current,
  refValue,
  unit = "°",
  tooltip,
}: {
  label: string;
  icon: typeof Clock;
  current: number | null;
  refValue: number | null;
  unit?: string;
  tooltip?: string;
}) {
  const t = trendArrow(current, refValue);
  return (
    <div
      className="rounded-xl p-3 backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--background) 50%, transparent)",
        border: "1px solid color-mix(in oklab, var(--gold) 24%, transparent)",
      }}
      title={tooltip}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={11} className="text-[var(--gold)]" />
        <span className="text-[9px] tracking-[0.28em] uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-display tabular-nums text-2xl text-[var(--gold)]">
          {fmt(current, unit)}
        </span>
        <span
          className="inline-flex items-center gap-0.5 text-[11px] tabular-nums"
          style={{ color: t.color }}
        >
          <t.Icon size={11} />
          {t.deltaTxt}{unit}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
        Ref: {fmt(refValue, unit)}
      </div>
    </div>
  );
}

function MetricKPI({
  label,
  value,
  unit,
  trendPerHour,
  hint,
  Icon,
}: {
  label: string;
  value: number | null;
  unit: string;
  trendPerHour?: number | null;
  hint?: string;
  Icon: typeof Thermometer;
}) {
  let trendNode: React.ReactNode = null;
  if (trendPerHour != null) {
    const t = trendArrow(trendPerHour, 0);
    trendNode = (
      <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums" style={{ color: t.color }}>
        <t.Icon size={11} />
        {Math.abs(trendPerHour).toFixed(2)}{unit}/t
      </span>
    );
  }
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "color-mix(in oklab, var(--background) 50%, transparent)",
        border: "1px solid color-mix(in oklab, var(--gold) 28%, transparent)",
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} className="text-[var(--gold)]" />
        <span className="text-[9px] tracking-[0.28em] uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-display tabular-nums text-2xl text-[var(--gold)]">{fmt(value, unit)}</span>
        {trendNode}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function ChartShell({ title, children, height = 220 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "color-mix(in oklab, var(--background) 45%, transparent)",
        border: "1px solid color-mix(in oklab, var(--gold) 22%, transparent)",
      }}
    >
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">{title}</div>
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}

const AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" } as const;

function timeLabel(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dateLabel(ds: string) {
  const d = new Date(ds);
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

export function ClimateAnalyticsPanel({
  stationMatch,
  title,
}: {
  stationMatch: string;
  title: string;
}) {
  const fetchData = useServerFn(getNetatmoClimateHistory);
  const [data, setData] = useState<Ok | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const inFlight = useRef(false);

  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    const load = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const r = await fetchData({ data: { stationMatch } });
        if (r.ok) {
          setData(r);
          setErr(null);
        } else {
          setErr(r.error);
        }
      } catch (e: any) {
        setErr(e?.message ?? "Ukjent feil");
      } finally {
        inFlight.current = false;
      }
    };
    load();
    id = setInterval(load, 10 * 60_000);
    return () => clearInterval(id);
  }, [fetchData, stationMatch]);

  const chart24 = useMemo(() => {
    if (!data) return [];
    return data.points24h.map((p) => ({
      t: p.t,
      time: timeLabel(p.t),
      inT: p.inT,
      outT: p.outT,
      hum: p.hum,
      co2: p.co2,
    }));
  }, [data]);

  const chartCompare = useMemo(() => {
    if (!data) return [];
    // Sammenlign i dag vs i går — bruk siste 24h som "i dag" og forrige 24h som "i går",
    // aligned per time-på-døgnet.
    const today = data.points24h;
    const yesterdayCut = Date.now() - 48 * 3600_000;
    const yest = data.points48h.filter((p) => p.t >= yesterdayCut && p.t < Date.now() - 24 * 3600_000);
    const byHour = new Map<number, { hour: number; today?: number | null; yest?: number | null }>();
    for (const p of today) {
      const h = new Date(p.t).getHours() + new Date(p.t).getMinutes() / 60;
      const k = Math.round(h * 2) / 2;
      const cur = byHour.get(k) ?? { hour: k };
      cur.today = p.outT;
      byHour.set(k, cur);
    }
    for (const p of yest) {
      const h = new Date(p.t).getHours() + new Date(p.t).getMinutes() / 60;
      const k = Math.round(h * 2) / 2;
      const cur = byHour.get(k) ?? { hour: k };
      cur.yest = p.outT;
      byHour.set(k, cur);
    }
    return [...byHour.values()]
      .sort((a, b) => a.hour - b.hour)
      .map((r) => ({
        label: `${String(Math.floor(r.hour)).padStart(2, "0")}:${r.hour % 1 === 0 ? "00" : "30"}`,
        today: r.today,
        yest: r.yest,
      }));
  }, [data]);

  const dailyMinMax = useMemo(() => {
    if (!data) return [];
    return data.daily30d.slice(-14).map((d) => ({
      label: dateLabel(d.date),
      inMin: d.inMin,
      inMax: d.inMax,
      outMin: d.outMin,
      outMax: d.outMax,
    }));
  }, [data]);

  // Beregn ekstra KPI-er
  const extra = useMemo(() => {
    if (!data) return null;
    const outs = data.points24h.map((p) => p.outT).filter((v): v is number => v != null);
    const ins = data.points24h.map((p) => p.inT).filter((v): v is number => v != null);
    const min = (a: number[]) => (a.length ? Math.min(...a) : null);
    const max = (a: number[]) => (a.length ? Math.max(...a) : null);
    const avg = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : null);
    const swing = outs.length ? (Math.max(...outs) - Math.min(...outs)) : null;
    const insulation =
      avg(ins) != null && avg(outs) != null ? (avg(ins) as number) - (avg(outs) as number) : null;
    return {
      out24: { min: min(outs), max: max(outs), avg: avg(outs), swing },
      in24: { min: min(ins), max: max(ins), avg: avg(ins) },
      insulation,
    };
  }, [data]);

  if (err) {
    return (
      <section className="container mx-auto px-4 py-8 scroll-mt-20">
        <div className="ornate-divider mb-4 flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--gold)]" />
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">{title}</span>
        </div>
        <div className="panel rounded-lg p-4 text-sm text-muted-foreground">
          Kunne ikke hente historikk: {err}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="container mx-auto px-4 py-8 scroll-mt-20">
        <div className="ornate-divider mb-4 flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--gold)]" />
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">{title}</span>
        </div>
        <div className="panel rounded-lg p-4 text-sm text-muted-foreground">Laster historikk…</div>
      </section>
    );
  }

  const { current, oneHourAgo, yesterdaySameTime, lastWeekSameTime, normal, trends } = data;

  return (
    <section className="container mx-auto px-4 py-8 scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full ornate-divider mb-6 flex items-center justify-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        aria-expanded={open}
      >
        <Activity size={14} className="text-[var(--gold)]" />
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">{title}</span>
        <ChevronRight
          size={14}
          className="text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div className="space-y-6">
          {/* Hovedmålere — nå + trender */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricKPI
              label="Ute nå"
              value={current.outT}
              unit="°"
              trendPerHour={trends.outDeltaPerHour}
              hint="Endring siste 3t"
              Icon={Thermometer}
            />
            <MetricKPI
              label="Inne nå"
              value={current.inT}
              unit="°"
              trendPerHour={trends.inDeltaPerHour}
              hint="Endring siste 3t"
              Icon={Thermometer}
            />
            <MetricKPI label="Luftfukt inne" value={current.hum} unit="%" Icon={Droplets} />
            <MetricKPI label="CO₂ inne" value={current.co2} unit=" ppm" Icon={Wind} />
          </div>

          {/* Sammenlign — ute */}
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-primary mb-2 flex items-center gap-1.5">
              <Calendar size={12} className="text-[var(--gold)]" /> Ute — sammenlign nå med…
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CompareBox label="For 1 time siden" icon={Clock} current={current.outT} refValue={oneHourAgo.outT} />
              <CompareBox label="Samme tid i går" icon={Calendar} current={current.outT} refValue={yesterdaySameTime.outT} />
              <CompareBox label="Samme tid sist uke" icon={Calendar} current={current.outT} refValue={lastWeekSameTime.outT} />
              <CompareBox label="Mot normalen" icon={TrendingUp} current={current.outT} refValue={normal.outT} tooltip="30d snitt samme tid på døgnet" />
            </div>
          </div>

          {/* Sammenlign — inne */}
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-primary mb-2 flex items-center gap-1.5">
              <Calendar size={12} className="text-[var(--gold)]" /> Inne — sammenlign nå med…
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CompareBox label="For 1 time siden" icon={Clock} current={current.inT} refValue={oneHourAgo.inT} />
              <CompareBox label="Samme tid i går" icon={Calendar} current={current.inT} refValue={yesterdaySameTime.inT} />
              <CompareBox label="Samme tid sist uke" icon={Calendar} current={current.inT} refValue={lastWeekSameTime.inT} />
              <CompareBox label="Mot normalen" icon={TrendingUp} current={current.inT} refValue={normal.inT} tooltip="30d snitt samme tid på døgnet" />
            </div>
          </div>

          {/* Linjegraf 24h */}
          <ChartShell title="Temperatur siste 24 timer — inne vs ute">
            <ResponsiveContainer>
              <LineChart data={chart24} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="time" tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={32} />
                <YAxis tick={AXIS_TICK} width={36} unit="°" />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid color-mix(in oklab, var(--gold) 30%, transparent)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => (typeof v === "number" ? `${v.toFixed(1)}°` : v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {normal.outT != null && (
                  <ReferenceLine
                    y={normal.outT}
                    stroke="#7dd3fc"
                    strokeDasharray="4 4"
                    label={{ value: `Normal ute ${normal.outT.toFixed(1)}°`, fontSize: 9, fill: "#7dd3fc", position: "insideTopRight" }}
                  />
                )}
                <Line type="monotone" dataKey="inT" name="Inne" stroke="#fb923c" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="outT" name="Ute" stroke="#60a5fa" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartShell>

          {/* Sammenlign i dag vs i går (ute) */}
          <ChartShell title="Ute-temp: i dag vs i går (samme klokkeslett)">
            <ResponsiveContainer>
              <LineChart data={chartCompare} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="label" tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={32} />
                <YAxis tick={AXIS_TICK} width={36} unit="°" />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid color-mix(in oklab, var(--gold) 30%, transparent)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => (typeof v === "number" ? `${v.toFixed(1)}°` : v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="yest" name="I går" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="today" name="I dag" stroke="#fb923c" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartShell>

          {/* Daglig min/max siste 14 dager */}
          <ChartShell title="Min/maks siste 14 dager" height={240}>
            <ResponsiveContainer>
              <ComposedChart data={dailyMinMax} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="label" tick={AXIS_TICK} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={AXIS_TICK} width={36} unit="°" />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid color-mix(in oklab, var(--gold) 30%, transparent)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => (typeof v === "number" ? `${v.toFixed(1)}°` : v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="outMax" name="Ute maks" stroke="#fb923c" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="outMin" name="Ute min" stroke="#60a5fa" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="inMax" name="Inne maks" stroke="#f87171" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line type="monotone" dataKey="inMin" name="Inne min" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartShell>

          {/* Luftfukt + CO2 siste 24h */}
          <ChartShell title="Luftfukt & CO₂ inne — siste 24 timer">
            <ResponsiveContainer>
              <LineChart data={chart24} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="time" tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={32} />
                <YAxis yAxisId="hum" tick={AXIS_TICK} width={36} unit="%" />
                <YAxis yAxisId="co2" orientation="right" tick={AXIS_TICK} width={42} unit=" ppm" />
                <Tooltip
                  contentStyle={{
                    background: "var(--background)",
                    border: "1px solid color-mix(in oklab, var(--gold) 30%, transparent)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine yAxisId="co2" y={1000} stroke="#f87171" strokeDasharray="4 4" label={{ value: "Luft! 1000ppm", fontSize: 9, fill: "#f87171", position: "insideTopRight" }} />
                <Line yAxisId="hum" type="monotone" dataKey="hum" name="Luftfukt %" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="co2" type="monotone" dataKey="co2" name="CO₂ ppm" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartShell>

          {/* Ekstra bokser — døgnstatistikk */}
          {extra && (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-primary mb-2 flex items-center gap-1.5">
                <Activity size={12} className="text-[var(--gold)]" /> Døgnstatistikk siste 24 timer
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricKPI label="Ute min" value={extra.out24.min} unit="°" Icon={Thermometer} />
                <MetricKPI label="Ute maks" value={extra.out24.max} unit="°" Icon={Thermometer} />
                <MetricKPI label="Ute snitt" value={extra.out24.avg} unit="°" Icon={Thermometer} />
                <MetricKPI
                  label="Ute-svingning"
                  value={extra.out24.swing}
                  unit="°"
                  hint="Forskjell maks – min"
                  Icon={TrendingUp}
                />
                <MetricKPI label="Inne min" value={extra.in24.min} unit="°" Icon={Thermometer} />
                <MetricKPI label="Inne maks" value={extra.in24.max} unit="°" Icon={Thermometer} />
                <MetricKPI label="Inne snitt" value={extra.in24.avg} unit="°" Icon={Thermometer} />
                <MetricKPI
                  label="Termisk gevinst"
                  value={extra.insulation}
                  unit="°"
                  hint="Snitt inne – ute"
                  Icon={Sparkles}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
