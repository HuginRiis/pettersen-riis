import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getHomeySensorDashboard,
  backfillHomeySensorHistoryFn,
  type HomeySensorDashboard,
  type SensorRange,
} from "@/server/homey-sensor-dashboard.functions";
import {
  Activity, DoorOpen, Lock, Unlock, Sun, Moon, AlertTriangle,
  Sparkles, ChevronDown, MapPin, Clock, TrendingUp, TrendingDown,
  EyeOff, RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";

const RANGES: { key: SensorRange; label: string }[] = [
  { key: "today", label: "I dag" },
  { key: "yesterday", label: "I går" },
  { key: "week", label: "Denne uken" },
  { key: "last7", label: "Siste 7 dager" },
];

const SENSOR_CHART_COLORS = {
  motion: "var(--chart-series-1)",
  door: "var(--chart-series-2)",
  window: "var(--chart-series-3)",
  lock: "var(--chart-series-4)",
} as const;

function ago(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "akkurat nå";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} min siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t siden`;
  return `${Math.floor(h / 24)} d siden`;
}

function Kpi({ icon: Icon, label, value, sub, tone = "primary" }: {
  icon: any; label: string; value: string | number; sub?: string; tone?: "primary" | "success" | "warn" | "danger";
}) {
  const toneCls = {
    primary: "text-primary border-primary/30",
    success: "text-emerald-400 border-emerald-400/30",
    warn: "text-amber-400 border-amber-400/30",
    danger: "text-destructive border-destructive/30",
  }[tone];
  return (
    <div className={`rounded-lg border ${toneCls} bg-card/60 backdrop-blur p-3 flex flex-col gap-1 min-w-0`}>
      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
        <Icon className="h-3 w-3" /> <span className="truncate">{label}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-display tabular-nums ${toneCls.split(" ")[0]}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

export function HomeySensorDashboard() {
  const fetchDash = useServerFn(getHomeySensorDashboard);
  const runBackfill = useServerFn(backfillHomeySensorHistoryFn);

  const [range, setRange] = useState<SensorRange>("today");
  const [data, setData] = useState<HomeySensorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightOpen, setInsightOpen] = useState(false);
  const [backfilling, setBackfilling] = useState<string | null>(null);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDash({ data: { range } })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => console.error("[sensor-dashboard]", e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, fetchDash, reloadKey]);

  async function handleBackfill(resolution: "last24Hours" | "last7Days" | "last31Days") {
    setBackfilling(resolution);
    setBackfillMsg(null);
    try {
      const res = await runBackfill({ data: { resolution } });
      setBackfillMsg(
        res.ok
          ? `Hentet ${res.eventsInserted} hendelser fra ${res.sensorsProcessed} sensorer${res.errors ? ` (${res.errors} feilet)` : ""}.`
          : `Feil: ${res.error ?? "ukjent"}`,
      );
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setBackfillMsg(`Feil: ${e?.message ?? "ukjent"}`);
    } finally {
      setBackfilling(null);
    }
  }

  const dayNightData = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Dag", value: data.dayNight.day },
      { name: "Natt", value: data.dayNight.night },
    ];
  }, [data]);

  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-3 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-display tracking-[0.25em] text-primary uppercase text-xs">
            Sensor-dashboard
          </h3>
        </div>
        <a
          href="/push-varslinger#sec-sensor-dashboard"
          className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary"
        >
          Innstillinger →
        </a>
      </div>

      {/* Range filter */}
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={`text-[10px] uppercase tracking-[0.2em] px-2.5 py-1.5 rounded-md border transition ${
              range === r.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-primary"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Backfill controls */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="uppercase tracking-[0.2em] text-muted-foreground">Hent fra Homey:</span>
        {([
          { k: "last24Hours", l: "24 t" },
          { k: "last7Days", l: "7 d" },
          { k: "last31Days", l: "31 d" },
        ] as const).map((b) => (
          <button
            key={b.k}
            type="button"
            disabled={!!backfilling}
            onClick={() => handleBackfill(b.k)}
            className="px-2 py-1 rounded border border-border bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50 inline-flex items-center gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${backfilling === b.k ? "animate-spin" : ""}`} />
            {b.l}
          </button>
        ))}
        {backfillMsg && <span className="text-muted-foreground italic">{backfillMsg}</span>}
      </div>




      {loading && !data && (
        <div className="text-[11px] text-muted-foreground italic py-8 text-center">
          Henter sensor-aktivitet…
        </div>
      )}

      {data && (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            <Kpi icon={Activity} label="Bevegelser" value={data.totals.motion} tone="primary" />
            <Kpi
              icon={MapPin}
              label="Mest aktivt"
              value={data.topRoom?.zone ?? "—"}
              sub={data.topRoom ? `${data.topRoom.count} hendelser` : undefined}
              tone="success"
            />
            <Kpi
              icon={Clock}
              label="Siste bevegelse"
              value={data.lastMotion ? ago(data.lastMotion.ts) : "—"}
              sub={data.lastMotion ? `${data.lastMotion.zone ?? ""} · ${data.lastMotion.device}` : undefined}
            />
            <Kpi icon={DoorOpen} label="Døråpninger" value={data.totals.door_open} sub={`Lukket: ${data.totals.door_close}`} />
            <Kpi icon={Unlock} label="Lås opp" value={data.totals.unlocked} sub={`Låst: ${data.totals.locked}`} tone="warn" />
            <Kpi icon={DoorOpen} label="Vindusåpninger" value={data.totals.window_open} sub={`Lukket: ${data.totals.window_close}`} />
            <Kpi
              icon={data.trend.deltaPct >= 0 ? TrendingUp : TrendingDown}
              label="vs forrige periode"
              value={`${data.trend.deltaPct > 0 ? "+" : ""}${data.trend.deltaPct}%`}
              sub={`${data.trend.current} vs ${data.trend.previous}`}
              tone={data.trend.deltaPct > 50 ? "warn" : "primary"}
            />
            <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-3 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
                <Sun className="h-3 w-3" /> / <Moon className="h-3 w-3" /> Dag vs natt
              </div>
              <div className="flex items-end gap-2 h-12">
                <div className="flex-1 bg-amber-400/30 border border-amber-400/50 rounded-sm flex items-end justify-center text-[10px] text-amber-200 font-semibold tabular-nums px-1"
                  style={{ height: `${data.dayNight.day + data.dayNight.night > 0 ? Math.max(15, (data.dayNight.day / Math.max(data.dayNight.day, data.dayNight.night)) * 100) : 5}%` }}>
                  {data.dayNight.day}
                </div>
                <div className="flex-1 bg-indigo-400/30 border border-indigo-400/50 rounded-sm flex items-end justify-center text-[10px] text-indigo-200 font-semibold tabular-nums px-1"
                  style={{ height: `${data.dayNight.day + data.dayNight.night > 0 ? Math.max(15, (data.dayNight.night / Math.max(data.dayNight.day, data.dayNight.night)) * 100) : 5}%` }}>
                  {data.dayNight.night}
                </div>
              </div>
            </div>
          </div>

          {/* Hourly chart */}
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Aktivitet per time
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="motion" stackId="a" fill={SENSOR_CHART_COLORS.motion} name="Bevegelse" />
                  <Bar dataKey="door" stackId="a" fill={SENSOR_CHART_COLORS.door} name="Dør" />
                  <Bar dataKey="window" stackId="a" fill={SENSOR_CHART_COLORS.window} name="Vindu" />
                  <Bar dataKey="lock" stackId="a" fill={SENSOR_CHART_COLORS.lock} name="Lås" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* By room */}
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Bevegelse per rom
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byRoom.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis type="category" dataKey="zone" stroke="hsl(var(--muted-foreground))" fontSize={10} width={80} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                    <Bar dataKey="motion" stackId="a" fill={SENSOR_CHART_COLORS.motion} name="Bevegelse" />
                    <Bar dataKey="door" stackId="a" fill={SENSOR_CHART_COLORS.door} name="Dør" />
                    <Bar dataKey="window" stackId="a" fill={SENSOR_CHART_COLORS.window} name="Vindu" />
                    <Bar dataKey="lock" stackId="a" fill={SENSOR_CHART_COLORS.lock} name="Lås" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Trend over time (daily/hourly depending on range) */}
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Trend over perioden
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily.length > 1 ? data.daily : data.hourly.map((h) => ({ label: String(h.hour).padStart(2, "0"), motion: h.motion, door: h.door, lock: h.lock, window: h.window }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey={data.daily.length > 1 ? "label" : "label"} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="motion" stroke="#d4af37" strokeWidth={2} dot={false} name="Bevegelse" />
                    <Line type="monotone" dataKey="door" stroke="#6a8caf" strokeWidth={2} dot={false} name="Dør" />
                    <Line type="monotone" dataKey="lock" stroke="#c97b4a" strokeWidth={2} dot={false} name="Lås" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Door + lock dedicated chart */}
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> Dør & lås over perioden
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily.length > 1 ? data.daily : data.hourly.map((h) => ({ label: String(h.hour).padStart(2, "0"), door: h.door, lock: h.lock }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="door" stroke="#6a8caf" strokeWidth={2} dot={{ r: 2 }} name="Dør" />
                  <Line type="monotone" dataKey="lock" stroke="#c97b4a" strokeWidth={2} dot={{ r: 2 }} name="Lås" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top 5 rooms + inactive motion sensors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> Mest aktive rom (topp 5)
              </div>
              {data.topRooms.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">Ingen aktivitet i perioden.</div>
              ) : (
                <ol className="space-y-1">
                  {data.topRooms.map((r, i) => {
                    const max = data.topRooms[0].count || 1;
                    return (
                      <li key={r.zone} className="flex items-center gap-2 text-[12px]">
                        <span className="w-4 text-muted-foreground tabular-nums">{i + 1}.</span>
                        <span className="flex-1 truncate text-foreground">{r.zone}</span>
                        <div className="flex-1 h-1.5 rounded bg-border/40 overflow-hidden">
                          <div className="h-full bg-primary/60" style={{ width: `${(r.count / max) * 100}%` }} />
                        </div>
                        <span className="tabular-nums text-primary w-10 text-right">{r.count}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center gap-1.5">
                <EyeOff className="h-3 w-3" /> Stille sensorer (ingen bevegelse 7+ dager)
              </div>
              {data.inactiveMotion.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">Alle bevegelsessensorer har vært aktive siste 7 dager.</div>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {data.inactiveMotion.map((s) => (
                    <li key={s.device_name} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <span className="text-foreground">{s.device_name}</span>
                        {s.zone && <span className="text-muted-foreground"> · {s.zone}</span>}
                      </span>
                      <span className="text-amber-400 tabular-nums whitespace-nowrap">
                        {s.last_ts ? `${s.days} d` : "aldri"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>


          {/* Smart insights - collapsible, default closed */}
          <div className="rounded-md border border-border bg-background/40">
            <button
              type="button"
              onClick={() => setInsightOpen((o) => !o)}
              className="w-full flex items-center justify-between p-3 text-left"
              aria-expanded={insightOpen}
            >
              <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <Sparkles className="h-3 w-3" /> Smart innsikt
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${insightOpen ? "rotate-180" : ""}`} />
            </button>
            {insightOpen && (
              <div className="px-3 pb-3 space-y-3">
                {/* Peak hours */}
                {data.peakHours.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Travleste timer</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.peakHours.map((p) => (
                        <span key={p.hour} className="text-[11px] px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary tabular-nums">
                          kl {String(p.hour).padStart(2, "0")} · {p.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Anomalies */}
                {data.anomalies.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-amber-400 mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Uvanlige mønstre
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-1">
                      {data.anomalies.map((a) => (
                        <li key={a.hour}>• {a.note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Trend insight */}
                <div className="text-[11px] text-muted-foreground">
                  <span className="text-foreground font-medium">Sammenlignet med forrige periode:</span>{" "}
                  {data.trend.deltaPct > 0 ? "økning" : data.trend.deltaPct < 0 ? "nedgang" : "uendret"} på{" "}
                  <span className="tabular-nums">{Math.abs(data.trend.deltaPct)}%</span>
                  {" "}({data.trend.current} vs {data.trend.previous} hendelser).
                </div>

                {/* Inactive sensors */}
                {data.inactiveSensors.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                      Sensorer uten aktivitet (&gt;7 dager)
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-0.5">
                      {data.inactiveSensors.map((s) => (
                        <li key={`${s.device_name}-${s.kind}`}>
                          • {s.device_name} {s.zone ? `(${s.zone})` : ""} — sist {ago(s.last_ts)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.anomalies.length === 0 && data.peakHours.length === 0 && data.inactiveSensors.length === 0 && (
                  <div className="text-[11px] text-muted-foreground italic">
                    Ingen avvik registrert i valgt periode.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
