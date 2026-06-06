import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  LineChart,
  Line,
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
} from "@/lib/netatmo-history";

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

function compareText(now: number | null, ref: number | null, unit: string): { color: string; text: string } {
  if (now == null || ref == null) return { color: "var(--muted-foreground)", text: "–" };
  const d = now - ref;
  if (Math.abs(d) < 0.2) return { color: "var(--muted-foreground)", text: "lik nå" };
  const abs = Math.abs(d).toFixed(1);
  if (d > 0) return { color: "#fb923c", text: `${abs}${unit} høyere enn nå` };
  return { color: "#7dd3fc", text: `${abs}${unit} lavere enn nå` };
}

function trendRateText(perHour: number | null | undefined, unit: string): { color: string; text: string } {
  if (perHour == null) return { color: "var(--muted-foreground)", text: "–" };
  const abs = Math.abs(perHour).toFixed(2);
  if (Math.abs(perHour) < 0.05) return { color: "var(--muted-foreground)", text: "stabil" };
  if (perHour > 0) return { color: "#fb923c", text: `stiger ${abs}${unit}/t` };
  return { color: "#7dd3fc", text: `synker ${abs}${unit}/t` };
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
  const t = compareText(current, refValue, unit);
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
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-display tabular-nums text-2xl text-[var(--gold)]">
          {fmt(current, unit)}
        </span>
        <span
          className="text-[11px] tabular-nums"
          style={{ color: t.color }}
        >
          {t.text}
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
  at,
  prevValue,
}: {
  label: string;
  value: number | null;
  unit: string;
  trendPerHour?: number | null;
  hint?: string;
  Icon: typeof Thermometer;
  at?: number | null;
  prevValue?: number | null;
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
  } else if (prevValue !== undefined) {
    const t = trendArrow(value, prevValue ?? null);
    trendNode = (
      <span
        className="inline-flex items-center gap-0.5 text-[11px] tabular-nums"
        style={{ color: t.color }}
        title={`Forrige døgn: ${fmt(prevValue ?? null, unit)}`}
      >
        <t.Icon size={11} />
        {t.deltaTxt}{unit}
      </span>
    );
  }
  const atTxt = at != null && Number.isFinite(at) ? timeLabel(at) : null;
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
      {atTxt && (
        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums flex items-center gap-1">
          <Clock size={9} /> kl. {atTxt}
        </div>
      )}
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

const AXIS_TICK = { fontSize: 10, fill: "#cbd5e1" } as const;

function timeLabel(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function dateLabel(ds: string) {
  const d = new Date(ds);
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

// Bruker samme CSS-variabler som recharts-linjene (se styles.css), så pills matcher graf-fargene.
function seriesColor(i: number) { return `var(--chart-series-${(i % 15) + 1})`; }
function roomColor(i: number) { return seriesColor(i + 2); }

function TogglePill({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] tracking-wide uppercase px-2 py-1 rounded-full transition-opacity"
      style={{
        background: active ? `color-mix(in oklab, ${color} 22%, transparent)` : "transparent",
        border: `1px solid color-mix(in oklab, ${color} ${active ? 60 : 25}%, transparent)`,
        color: active ? color : "var(--muted-foreground)",
        opacity: active ? 1 : 0.7,
      }}
    >
      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: color }} />
      {children}
    </button>
  );
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
  const [tempOff, setTempOff] = useState<Set<string>>(new Set());
  const [humOff, setHumOff] = useState<Set<string>>(new Set());
  const toggleTemp = (k: string) => setTempOff((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleHum = (k: string) => setHumOff((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const isTempOn = (k: string) => !tempOff.has(k);
  const isHumOn = (k: string) => !humOff.has(k);
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
    const rooms = data.rooms ?? [];
    return data.points24h.map((p) => {
      const row: any = {
        t: p.t,
        time: timeLabel(p.t),
        inT: p.inT,
        outT: p.outT,
        hum: p.hum,
        co2: p.co2,
      };
      for (const r of rooms) {
        const series = r.series24h ?? [];
        // nærmeste sample innen ±30 min
        let best: { t: number; temp: number | null; hum: number | null } | null = null;
        let bestDiff = Infinity;
        for (const s of series) {
          const d = Math.abs(s.t - p.t);
          if (d < bestDiff) { bestDiff = d; best = s; }
        }
        if (best && bestDiff <= 30 * 60_000) {
          row[`t_${r.id}`] = best.temp;
          row[`h_${r.id}`] = best.hum;
        } else {
          row[`t_${r.id}`] = null;
          row[`h_${r.id}`] = null;
        }
      }
      return row;
    });
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
    type P = { t: number; outT: number | null; inT: number | null };
    const now = Date.now();
    const todayPts = data.points24h as P[];
    const prevPts = (data.points48h as P[]).filter(
      (p) => p.t >= now - 48 * 3600_000 && p.t < now - 24 * 3600_000,
    );
    const pick = (pts: P[], key: "outT" | "inT") =>
      pts
        .map((p) => ({ t: p.t, v: p[key] }))
        .filter((x): x is { t: number; v: number } => x.v != null && Number.isFinite(x.v));

    const stats = (pts: P[], key: "outT" | "inT") => {
      const xs = pick(pts, key);
      if (xs.length === 0) return { min: null, minAt: null, max: null, maxAt: null, avg: null, swing: null };
      let mn = xs[0], mx = xs[0], sum = 0;
      for (const x of xs) {
        if (x.v < mn.v) mn = x;
        if (x.v > mx.v) mx = x;
        sum += x.v;
      }
      return { min: mn.v, minAt: mn.t, max: mx.v, maxAt: mx.t, avg: sum / xs.length, swing: mx.v - mn.v };
    };

    const out24 = stats(todayPts, "outT");
    const in24 = stats(todayPts, "inT");
    const outPrev = stats(prevPts, "outT");
    const inPrev = stats(prevPts, "inT");
    const insulation =
      out24.avg != null && in24.avg != null ? in24.avg - out24.avg : null;
    const insulationPrev =
      outPrev.avg != null && inPrev.avg != null ? inPrev.avg - outPrev.avg : null;
    return { out24, in24, outPrev, inPrev, insulation, insulationPrev };
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

          {/* Sammenlign — Stua (NAMain) */}
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-primary mb-2 flex items-center gap-1.5">
              <Thermometer size={12} className="text-[var(--gold)]" /> Stua — sammenlign nå med…
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CompareBox label="For 1 time siden" icon={Clock} current={current.inT} refValue={oneHourAgo.inT} />
              <CompareBox label="Samme tid i går" icon={Calendar} current={current.inT} refValue={yesterdaySameTime.inT} />
              <CompareBox label="Samme tid sist uke" icon={Calendar} current={current.inT} refValue={lastWeekSameTime.inT} />
              <CompareBox label="Mot normalen" icon={TrendingUp} current={current.inT} refValue={normal.inT} tooltip="30d snitt samme tid på døgnet" />
            </div>
          </div>


          {/* Per-rom sammenligning (NAModule4) */}
          {data.rooms && data.rooms.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {data.rooms.map((room) => (
                <div key={room.id}>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-primary mb-2 flex items-center gap-1.5">
                    <Thermometer size={12} className="text-[var(--gold)]" /> {room.name} — sammenlign nå med…
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <CompareBox label="For 1 time siden" icon={Clock} current={room.current.t} refValue={room.oneHourAgo.t} />
                    <CompareBox label="Samme tid i går" icon={Calendar} current={room.current.t} refValue={room.yesterdaySameTime.t} />
                    <CompareBox label="Samme tid sist uke" icon={Calendar} current={room.current.t} refValue={room.lastWeekSameTime.t} />
                    <CompareBox label="Mot normalen" icon={TrendingUp} current={room.current.t} refValue={room.normal.t} tooltip="Snitt samme time-på-døgnet (siste 48t)" />
                  </div>
                </div>
              ))}
            </div>
          )}


          {/* Linjegraf 24h */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <TogglePill active={isTempOn("inT")} color={seriesColor(0)} onClick={() => toggleTemp("inT")}>Stua</TogglePill>
              <TogglePill active={isTempOn("outT")} color={seriesColor(1)} onClick={() => toggleTemp("outT")}>Ute</TogglePill>
              {(data.rooms ?? []).map((r, i) => (
                <TogglePill key={r.id} active={isTempOn(r.id)} color={roomColor(i)} onClick={() => toggleTemp(r.id)}>
                  {r.name}
                </TogglePill>
              ))}
            </div>
            <ChartShell title="Temperatur siste 24 timer — alle rom">
              <ResponsiveContainer>
                <LineChart data={chart24} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#64748b" />
                  <XAxis dataKey="time" tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={32} />
                  <YAxis tick={AXIS_TICK} width={36} unit="°" />
                  <Tooltip
                    contentStyle={{
                      background: "#1e293b",
                      border: "1px solid color-mix(in oklab, var(--gold) 30%, transparent)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => (typeof v === "number" ? `${v.toFixed(1)}°` : v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {normal.outT != null && isTempOn("outT") && (
                    <ReferenceLine
                      y={normal.outT}
                      stroke="#7dd3fc"
                      strokeDasharray="4 4"
                      label={{ value: `Normal ute ${normal.outT.toFixed(1)}°`, fontSize: 9, fill: "#7dd3fc", position: "insideTopRight" }}
                    />
                  )}
                  {isTempOn("inT") && <Line type="monotone" dataKey="inT" name="Stua" stroke="#fb923c" strokeWidth={2} dot={false} connectNulls />}
                  {isTempOn("outT") && <Line type="monotone" dataKey="outT" name="Ute" stroke="#60a5fa" strokeWidth={2} dot={false} connectNulls />}
                  {(data.rooms ?? []).map((r, i) =>
                    isTempOn(r.id) ? (
                      <Line key={r.id} type="monotone" dataKey={`t_${r.id}`} name={r.name} stroke={roomColor(i)} strokeWidth={1.5} dot={false} connectNulls />
                    ) : null,
                  )}
                </LineChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>

          {/* Sammenlign i dag vs i går (ute) */}
          <ChartShell title="Ute-temp: i dag vs i går (samme klokkeslett)">
            <ResponsiveContainer>
              <LineChart data={chartCompare} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#64748b" />
                <XAxis dataKey="label" tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={32} />
                <YAxis tick={AXIS_TICK} width={36} unit="°" />
                <Tooltip
                  contentStyle={{
                    background: "#1e293b",
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
                <CartesianGrid strokeDasharray="3 3" stroke="#64748b" />
                <XAxis dataKey="label" tick={AXIS_TICK} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={AXIS_TICK} width={36} unit="°" />
                <Tooltip
                  contentStyle={{
                    background: "#1e293b",
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
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <TogglePill active={isHumOn("hum")} color={seriesColor(0)} onClick={() => toggleHum("hum")}>Stua %</TogglePill>
              <TogglePill active={isHumOn("co2")} color={seriesColor(1)} onClick={() => toggleHum("co2")}>CO₂ ppm</TogglePill>
              {(data.rooms ?? []).map((r, i) => (
                <TogglePill key={r.id} active={isHumOn(r.id)} color={roomColor(i)} onClick={() => toggleHum(r.id)}>
                  {r.name} %
                </TogglePill>
              ))}
            </div>
            <ChartShell title="Luftfukt & CO₂ — siste 24 timer">
              <ResponsiveContainer>
                <LineChart data={chart24} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#64748b" />
                  <XAxis dataKey="time" tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={32} />
                  <YAxis yAxisId="hum" tick={AXIS_TICK} width={36} unit="%" />
                  <YAxis yAxisId="co2" orientation="right" tick={AXIS_TICK} width={42} unit=" ppm" />
                  <Tooltip
                    contentStyle={{
                      background: "#1e293b",
                      border: "1px solid color-mix(in oklab, var(--gold) 30%, transparent)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {isHumOn("co2") && (
                    <ReferenceLine yAxisId="co2" y={1000} stroke="#f87171" strokeDasharray="4 4" label={{ value: "Luft! 1000ppm", fontSize: 9, fill: "#f87171", position: "insideTopRight" }} />
                  )}
                  {isHumOn("hum") && <Line yAxisId="hum" type="monotone" dataKey="hum" name="Stua %" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />}
                  {isHumOn("co2") && <Line yAxisId="co2" type="monotone" dataKey="co2" name="CO₂ ppm" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />}
                  {(data.rooms ?? []).map((r, i) =>
                    isHumOn(r.id) ? (
                      <Line key={r.id} yAxisId="hum" type="monotone" dataKey={`h_${r.id}`} name={`${r.name} %`} stroke={roomColor(i)} strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                    ) : null,
                  )}
                </LineChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>

          {/* Ekstra bokser — døgnstatistikk */}
          {extra && (
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-primary mb-2 flex items-center gap-1.5">
                <Activity size={12} className="text-[var(--gold)]" /> Døgnstatistikk siste 24 timer
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricKPI label="Ute min" value={extra.out24.min} at={extra.out24.minAt} prevValue={extra.outPrev.min} unit="°" Icon={Thermometer} />
                <MetricKPI label="Ute maks" value={extra.out24.max} at={extra.out24.maxAt} prevValue={extra.outPrev.max} unit="°" Icon={Thermometer} />
                <MetricKPI label="Ute snitt" value={extra.out24.avg} prevValue={extra.outPrev.avg} unit="°" Icon={Thermometer} />
                <MetricKPI
                  label="Ute-svingning"
                  value={extra.out24.swing}
                  prevValue={extra.outPrev.swing}
                  unit="°"
                  hint="Forskjell maks – min"
                  Icon={TrendingUp}
                />
                <MetricKPI label="Inne min" value={extra.in24.min} at={extra.in24.minAt} prevValue={extra.inPrev.min} unit="°" Icon={Thermometer} />
                <MetricKPI label="Inne maks" value={extra.in24.max} at={extra.in24.maxAt} prevValue={extra.inPrev.max} unit="°" Icon={Thermometer} />
                <MetricKPI label="Inne snitt" value={extra.in24.avg} prevValue={extra.inPrev.avg} unit="°" Icon={Thermometer} />
                <MetricKPI
                  label="Termisk gevinst"
                  value={extra.insulation}
                  prevValue={extra.insulationPrev}
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
