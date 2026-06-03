import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getApiCallLog,
  refreshApiSource,
  type ApiCallSummary,
} from "@/lib/api-call-log";
import { purgeApiCallLog } from "@/lib/api-call-log-purge.functions";
import {
  getApiPauseFlags,
  setApiSourcePaused,
  setApiSourceWindow,
  type ApiPauseFlag,
} from "@/lib/api-pause.functions";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { useChartAppearance } from "@/hooks/use-chart-appearance";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
}

function isWindowActiveNow(flag: ApiPauseFlag | undefined): boolean {
  if (!flag?.window_enabled) return false;
  const start = toMinutes(flag.start_time);
  const end = toMinutes(flag.end_time);
  if (start === end) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const cur = h * 60 + m;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}


function triggerExplanation(
  trigger: string | undefined,
  description: string | undefined,
): string {
  switch (trigger) {
    case "cron":
      return `Kjøres automatisk fra serveren etter en tidsplan (${description ?? "cron"}). Ingen side trigger dette — pg_cron eller en backend-hook ringer inn med jevne mellomrom.`;
    case "cache":
      return `Hentes ved bruk, men bufres på serveren (${description ?? "cache"}). Nye kall går mot APIet først når bufferen utløper.`;
    case "webhook":
      return "Trigges av en innkommende webhook fra ekstern tjeneste. Ingen side trigger dette direkte.";
    case "on-demand":
    default:
      return "On-demand: spørres når en side i borgen laster og trenger ferske data. Sidene under viser hvor kallene kom fra siste 24t.";
  }
}


const SOURCE_LABELS: Record<string, string> = {
  homey: "Homey",
  strava: "Strava",
  netatmo: "Netatmo",
  tibber: "Tibber",
  met: "Met.no",
  nrk: "NRK trafikk",
  spot: "Spotpris",
  lightning: "Lyn / radar",
  garbage: "Renovasjon",
  uv: "UV · MET.no",
  "open-meteo": "Open-Meteo (core)",
  gardena: "Gardena",
  garmin: "Garmin",
  roborock: "Roborock",
  posten: "Posten",
  geoip: "GeoIP",
};

const INITIAL_VISIBLE = 5;

function formatAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s siden`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m siden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}t siden`;
  return `${Math.round(h / 24)}d siden`;
}

function formatIn(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "snart";
  const s = Math.round(ms / 1000);
  if (s < 60) return `om ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `om ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `om ${h}t`;
  return `om ${Math.round(h / 24)}d`;
}

function formatClock(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApiCallLogPanel() {
  const fetchLog = useServerFn(getApiCallLog);
  const refresh = useServerFn(refreshApiSource);
  const purge = useServerFn(purgeApiCallLog);
  const fetchPauseFlags = useServerFn(getApiPauseFlags);
  const savePause = useServerFn(setApiSourcePaused);
  const saveWindow = useServerFn(setApiSourceWindow);
  const appearance = useChartAppearance();

  const [data, setData] = useState<ApiCallSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busySource, setBusySource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [purging, setPurging] = useState<number | null>(null);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [pauseFlags, setPauseFlags] = useState<Map<string, ApiPauseFlag>>(new Map());
  const [pauseDraft, setPauseDraft] = useState<Map<string, { start: string; end: string }>>(new Map());
  const [pauseBusy, setPauseBusy] = useState<string | null>(null);

  async function handlePurge(days: number) {
    const ok = window.confirm(
      `Vil du slette alle API-logger eldre enn ${days} dager?`,
    );
    if (!ok) return;
    setPurging(days);
    setPurgeMsg(null);
    try {
      const res = await purge({ data: { olderThanDays: days } });
      setPurgeMsg(`✓ Slettet ${res.deleted} rader eldre enn ${days} dager.`);
      await load();
    } catch (e: any) {
      setPurgeMsg(`⚠ Feil: ${e?.message ?? String(e)}`);
    } finally {
      setPurging(null);
    }
  }

  const load = async () => {
    setLoading(true);
    try {
      const [res, pf] = await Promise.all([fetchLog(), fetchPauseFlags()]);
      setData(res);
      const m = new Map<string, ApiPauseFlag>();
      for (const f of pf.flags) m.set(f.source, f);
      setPauseFlags(m);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Klarte ikke laste logg");
    } finally {
      setLoading(false);
    }
  };

  const togglePaused = useCallback(async (source: string, paused: boolean) => {
    setPauseBusy(source);
    try {
      await savePause({ data: { source, paused } });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Pause feilet");
    } finally {
      setPauseBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSourceWindow = useCallback(
    async (source: string, window_enabled: boolean, start_time: string, end_time: string) => {
      setPauseBusy(source);
      try {
        await saveWindow({ data: { source, window_enabled, start_time, end_time } });
        await load();
        setPauseDraft((prev) => {
          const next = new Map(prev);
          next.delete(source);
          return next;
        });
      } catch (e: any) {
        setError(e?.message ?? "Lagring feilet");
      } finally {
        setPauseBusy(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof data extends null ? never : NonNullable<typeof data>["rows"]>();
    for (const row of data?.rows ?? []) {
      const list = map.get(row.source) ?? [];
      list.push(row);
      map.set(row.source, list);
    }
    return map;
  }, [data]);

  // Bygg sortert liste over alle kilder vi har sett siste 24t (mest brukt først),
  // og inkluder også kjente kilder som mangler data så de fortsatt kan oppdateres manuelt.
  const sortedSources = useMemo(() => {
    const totals = new Map<string, number>();
    for (const [src, rows] of grouped.entries()) {
      const total = rows.reduce((s, r) => s + r.total_24h, 0);
      totals.set(src, total);
    }
    // Inkluder kjente kilder selv om de mangler data
    for (const id of Object.keys(SOURCE_LABELS)) {
      if (!totals.has(id)) totals.set(id, 0);
    }
    return Array.from(totals.entries())
      .map(([id, total]) => ({
        id,
        label: SOURCE_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1),
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [grouped]);

  // Bygg timeserie for stacked bar chart (siste 24t per kilde) + gårsdagens total per samme time.
  const { chartData, chartSources } = useMemo(() => {
    const hourly = data?.hourly ?? [];
    const yest = data?.yesterday ?? [];
    const yestByHour = new Map<string, number>();
    for (const y of yest) {
      yestByHour.set(new Date(y.hour).toISOString(), Number(y.yest_total) || 0);
    }
    const buckets = new Map<string, Record<string, number | string>>();
    const srcSet = new Set<string>();
    for (const h of hourly) {
      const d = new Date(h.hour);
      const key = d.toISOString();
      const label = d.toLocaleTimeString("nb-NO", { hour: "2-digit" });
      const row = buckets.get(key) ?? { _ts: key, label, _yesterday: yestByHour.get(key) ?? 0 };
      if (h.source && h.total > 0) {
        row[h.source] = ((row[h.source] as number) ?? 0) + h.total;
        srcSet.add(h.source);
      }
      buckets.set(key, row);
    }
    const arr = Array.from(buckets.values()).sort(
      (a, b) => String(a._ts).localeCompare(String(b._ts)),
    );
    // Sorter kilder så største totalt vises nederst i stacken
    const totals = new Map<string, number>();
    for (const s of srcSet) {
      let t = 0;
      for (const row of arr) t += (row[s] as number) ?? 0;
      totals.set(s, t);
    }
    const srcList = Array.from(srcSet).sort(
      (a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0),
    );
    return { chartData: arr, chartSources: srcList };
  }, [data]);


  // Felles fargekart per kilde — brukes både i grafen og i kortene under,
  // slik at fargene alltid stemmer overens.
  const colorBySource = useMemo(() => {
    const map = new Map<string, string>();
    const palette = appearance.series;
    let i = 0;
    for (const s of chartSources) {
      map.set(s, palette[i % palette.length]);
      i++;
    }
    for (const s of sortedSources) {
      if (!map.has(s.id)) {
        map.set(s.id, palette[i % palette.length]);
        i++;
      }
    }
    return map;
  }, [chartSources, sortedSources, appearance.series]);



  const visibleSources = expanded
    ? sortedSources
    : sortedSources.slice(0, INITIAL_VISIBLE);
  const hiddenCount = sortedSources.length - visibleSources.length;

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRefresh = async (source: string) => {
    setBusySource(source);
    try {
      await refresh({ data: { source } });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Oppdatering feilet");
    } finally {
      setBusySource(null);
    }
  };

  return (
    <section className="container mx-auto px-4 pt-6 pb-12">
      <div className="panel rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
              Mestrenes register
            </div>
            <h3 className="text-display text-lg tracking-[0.2em] text-primary">
              API-LOGG · SISTE 24 TIMER
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Hver gang borgen henter data fra eksterne tjenester loggføres det her.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded border border-border text-[11px] tracking-[0.3em] uppercase hover:bg-primary/10 disabled:opacity-50"
          >
            {loading ? "Laster…" : "○ Last på nytt"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            ⚠ {error}
          </div>
        )}

        {/* Time-for-time graf siste 24t */}
        {(() => {
          const todayTotal = chartData.reduce((s, r) => {
            let t = 0;
            for (const k of chartSources) t += (r[k] as number) ?? 0;
            return s + t;
          }, 0);
          const yestTotal = chartData.reduce(
            (s, r) => s + ((r._yesterday as number) ?? 0),
            0,
          );
          const diff = todayTotal - yestTotal;
          const diffPct = yestTotal > 0 ? Math.round((diff / yestTotal) * 100) : null;
          return (
            <div className="mb-5 rounded border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                  API-kall per time · siste 24t (linje = samme time i går)
                </div>
                <div className="flex items-center gap-2 text-[10px] tabular-nums">
                  <span className="text-muted-foreground">
                    I dag: <span className="text-foreground">{todayTotal}</span>
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    I går: <span className="text-foreground">{yestTotal}</span>
                  </span>
                  <span
                    className={
                      "px-2 py-0.5 rounded-sm border " +
                      (diff > 0
                        ? "border-destructive/40 text-destructive bg-destructive/10"
                        : diff < 0
                          ? "border-primary/40 text-primary bg-primary/10"
                          : "border-border text-muted-foreground")
                    }
                  >
                    {diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {Math.abs(diff)}
                    {diffPct !== null ? ` (${diffPct > 0 ? "+" : ""}${diffPct}%)` : ""}
                  </span>
                </div>
              </div>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <ComposedChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="color-mix(in oklab, var(--border) 40%, transparent)"
                    />
                    <XAxis dataKey="label" stroke="#ffffff" tick={{ fill: "#ffffff" }} fontSize={10} />
                    <YAxis
                      stroke="#ffffff"
                      tick={{ fill: "#ffffff" }}
                      fontSize={10}
                      allowDecimals={false}
                    />
                    <Tooltip
                      trigger="click"
                      contentStyle={{
                        background: "#1e293b",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "#ffffff",
                      }}
                      labelStyle={{ color: "#ffffff" }}
                      itemStyle={{ color: "#ffffff" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: "#ffffff" }} />
                    {chartSources.map((s, i) => (
                      <Bar
                        key={s}
                        dataKey={s}
                        stackId="a"
                        fill={colorBySource.get(s) ?? appearance.series[i % appearance.series.length]}
                        name={SOURCE_LABELS[s] ?? s}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="_yesterday"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={false}
                      name="I går (samme time)"
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-muted-foreground/80 italic mt-2">
                Hver søyle = én time. Den stiplede linjen viser totalt antall kall samme klokketime i går.
              </p>
            </div>
          );
        })()}




        <div className="space-y-2">
          {visibleSources.map((src) => {
            const rows = grouped.get(src.id) ?? [];
            const lastCall = rows.reduce<string | null>((acc, r) => {
              if (!r.last_called_at) return acc;
              if (!acc) return r.last_called_at;
              return new Date(r.last_called_at) > new Date(acc) ? r.last_called_at : acc;
            }, null);
            const errors24 = rows.reduce((s, r) => s + r.errors_24h, 0);
            const total24 = rows.reduce((s, r) => s + r.total_24h, 0);
            const ondemand24 = rows.reduce((s, r) => s + (r.ondemand_24h ?? 0), 0);
            const cron24 = rows.reduce((s, r) => s + (r.cron_24h ?? 0), 0);
            const auth24 = rows.reduce((s, r) => s + (r.auth_24h ?? 0), 0);
            const live24 = rows.reduce((s, r) => s + (r.live_24h ?? 0), 0);
            const cache24 = rows.reduce((s, r) => s + (r.cache_24h ?? 0), 0);
            const isOpen = open.has(src.id);
            const hasErrors = errors24 > 0;
            // Siste status: om noen endpoint sist svarte med feil → feil
            const anyLastFail = rows.some((r) => r.last_ok === false);
            const status: "ok" | "fail" | "idle" =
              rows.length === 0 ? "idle" : anyLastFail ? "fail" : "ok";
            const nextRun = data?.nextRunBySource?.[src.id] ?? null;
            const sched = data?.schedules?.[src.id];

            return (
              <div
                key={src.id}
                className="border border-border rounded overflow-hidden"
              >
                <div className="p-3 space-y-2">
                  {/* Topprad: navn + status + oppdater-knapp */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggle(src.id)}
                      className="flex items-center gap-2 text-left flex-1 min-w-0"
                    >
                      <span className="text-muted-foreground text-xs w-3 shrink-0">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span className="font-medium tracking-wide truncate">
                        {src.label}
                      </span>
                      <span
                        className={
                          "shrink-0 text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-sm border " +
                          (status === "fail"
                            ? "border-destructive/60 text-destructive bg-destructive/10"
                            : status === "ok"
                              ? "border-primary/40 text-primary bg-primary/10"
                              : "border-border text-muted-foreground bg-muted/20")
                        }
                      >
                        {status === "fail" ? "⚠ feil" : status === "ok" ? "✓ OK" : "○ inaktiv"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRefresh(src.id)}
                      disabled={busySource === src.id}
                      className="shrink-0 px-3 py-1.5 rounded border border-primary/40 text-primary text-[10px] tracking-[0.2em] uppercase hover:bg-primary/10 disabled:opacity-50"
                    >
                      {busySource === src.id ? "Henter…" : "✦ Oppdater"}
                    </button>
                  </div>
                  {/* Statusrad: meta-info, wrapper på mobil */}
                  <div className="flex items-center gap-x-3 gap-y-1 text-[11px] tabular-nums flex-wrap pl-5">
                    <span className="text-muted-foreground">
                      {rows.length} endpoint{rows.length === 1 ? "" : "er"}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      Intervall:{" "}
                      <span className="text-foreground">
                        {sched?.description ?? "ukjent"}
                      </span>
                      {sched?.trigger && (
                        <span className="ml-1 text-[9px] tracking-[0.15em] uppercase text-muted-foreground/70">
                          [{sched.trigger}]
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      Sist:{" "}
                      <span className="text-foreground" title={lastCall ?? undefined}>
                        {formatAgo(lastCall)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      Neste:{" "}
                      <span
                        className="text-foreground"
                        title={nextRun ? new Date(nextRun).toLocaleString("nb-NO") : undefined}
                      >
                        {nextRun
                          ? `${formatIn(nextRun)} kl ${formatClock(nextRun)}`
                          : sched?.trigger === "on-demand"
                            ? "ved sidelasting"
                            : "—"}
                      </span>
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      24t: <span className="text-foreground">{total24}</span>
                    </span>
                    {hasErrors && (
                      <span className="text-destructive">⚠ {errors24} feil</span>
                    )}
                    <span className="basis-full h-0" />
                    <span
                      className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-primary/30 text-primary bg-primary/5"
                      title="On-demand: trigget av sidevisning"
                    >
                      side {ondemand24}
                    </span>
                    <span
                      className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-border text-muted-foreground bg-muted/20"
                      title="Cron / server / webhook"
                    >
                      cron {cron24}
                    </span>
                    <span
                      className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-amber-500/40 text-amber-400 bg-amber-500/10"
                      title="Auth / token / login (brukernavn + passord)"
                    >
                      auth {auth24}
                    </span>
                    <span
                      className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                      title="Faktiske utgående kall til ekstern API"
                    >
                      live {live24}
                    </span>
                    <span
                      className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-sky-500/40 text-sky-400 bg-sky-500/10"
                      title="Treff i lokal/server-cache (ingen ekstern spørring)"
                    >
                      cache {cache24}
                    </span>
                  </div>

                  {/* Pause / tidsvindu per kilde */}
                  {(() => {
                    const flag = pauseFlags.get(src.id);
                    const draft = pauseDraft.get(src.id);
                    const start = draft?.start ?? flag?.start_time ?? "22:00";
                    const end = draft?.end ?? flag?.end_time ?? "06:00";
                    const winEnabled = Boolean(flag?.window_enabled);
                    const fullPaused = Boolean(flag?.paused);
                    const winActive = isWindowActiveNow(flag);
                    const dirty = draft != null;
                    const busy = pauseBusy === src.id;
                    return (
                      <div className="pl-5 flex items-center gap-2 flex-wrap text-[10px]">
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                            fullPaused || winActive
                              ? "bg-destructive"
                              : winEnabled
                                ? "bg-yellow-500"
                                : "bg-primary"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => togglePaused(src.id, !fullPaused)}
                          disabled={busy}
                          className={
                            "px-2 py-0.5 rounded border tracking-[0.15em] uppercase " +
                            (fullPaused
                              ? "border-destructive/60 text-destructive bg-destructive/10 hover:bg-destructive/20"
                              : "border-border text-muted-foreground hover:bg-primary/10") +
                            " disabled:opacity-40"
                          }
                          title="Full pause uavhengig av klokkeslett"
                        >
                          {fullPaused ? "■ Pauset" : "▶ Aktiv"}
                        </button>
                        <label className="flex items-center gap-1 text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={winEnabled}
                            disabled={busy}
                            onChange={(e) =>
                              saveSourceWindow(src.id, e.target.checked, start, end)
                            }
                            className="h-3 w-3 accent-primary"
                          />
                          <span>Tidsvindu</span>
                        </label>
                        <input
                          type="time"
                          value={start}
                          disabled={busy}
                          onChange={(e) =>
                            setPauseDraft((prev) => {
                              const next = new Map(prev);
                              next.set(src.id, { start: e.target.value, end });
                              return next;
                            })
                          }
                          className="bg-background border border-border rounded px-1.5 py-0.5 font-mono text-[10px]"
                        />
                        <span className="text-muted-foreground">–</span>
                        <input
                          type="time"
                          value={end}
                          disabled={busy}
                          onChange={(e) =>
                            setPauseDraft((prev) => {
                              const next = new Map(prev);
                              next.set(src.id, { start, end: e.target.value });
                              return next;
                            })
                          }
                          className="bg-background border border-border rounded px-1.5 py-0.5 font-mono text-[10px]"
                        />
                        {dirty && (
                          <button
                            type="button"
                            onClick={() => saveSourceWindow(src.id, winEnabled, start, end)}
                            disabled={busy}
                            className="px-2 py-0.5 rounded border border-primary/50 text-primary tracking-[0.15em] uppercase hover:bg-primary/10 disabled:opacity-40"
                          >
                            {busy ? "Lagrer…" : "Lagre"}
                          </button>
                        )}
                        {winActive && !fullPaused && (
                          <span className="text-destructive tracking-[0.15em] uppercase">
                            ⏰ Blokkert nå
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>


                {isOpen && (
                  <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-2">
                    {/* Forklaring: hvorfor kjøres denne kilden? */}
                    <p className="text-[11px] text-muted-foreground italic">
                      {triggerExplanation(sched?.trigger, sched?.description)}
                    </p>

                    {/* Sider som trigget kallene (on-demand) eller (server / cron) */}
                    {(() => {
                      const pages = data?.pagesBySource?.[src.id] ?? [];
                      if (pages.length === 0) return null;
                      const top = pages.slice(0, 8);
                      const totalPages = pages.reduce((s, p) => s + p.total, 0);
                      return (
                        <div className="rounded border border-border/50 bg-background/40 px-2 py-1.5">
                          <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
                            Hva trigget kallene
                          </div>
                          <ul className="space-y-0.5">
                            {top.map((p) => {
                              const pct = totalPages > 0
                                ? Math.max(2, Math.round((p.total / totalPages) * 100))
                                : 0;
                              return (
                                <li
                                  key={p.page}
                                  className="flex items-center gap-2 text-[11px]"
                                >
                                  <span className="font-mono text-foreground flex-1 min-w-0 truncate">
                                    {p.page}
                                  </span>
                                  <div className="w-20 h-1.5 bg-background/60 rounded-full overflow-hidden border border-border/30">
                                    <div
                                      className="h-full"
                                      style={{
                                        width: `${pct}%`,
                                        background: colorBySource.get(src.id) ?? appearance.series[0],
                                      }}
                                    />
                                  </div>
                                  <span className="text-muted-foreground tabular-nums w-10 text-right">
                                    {p.total}×
                                  </span>
                                  <span className="text-muted-foreground tabular-nums w-16 text-right text-[10px]">
                                    {formatAgo(p.last_at)}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                          {pages.length > top.length && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                              + {pages.length - top.length} flere kilder
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Endepunkter */}

                    {rows.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic py-2">
                        Ingen kall registrert siste 24t. Trykk «Oppdater» for å trigge.
                      </p>
                    ) : (
                      rows.map((r) => (
                        <div
                          key={r.endpoint}
                          className="flex items-center gap-3 text-[11px] py-1 flex-wrap"
                        >
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              r.last_ok === false
                                ? "bg-destructive"
                                : r.last_cached
                                  ? "bg-muted-foreground"
                                  : "bg-primary"
                            }`}
                          />
                          <span className="font-mono text-foreground flex-1 min-w-0 truncate">
                            {r.endpoint}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {formatAgo(r.last_called_at)}
                          </span>
                          {r.last_duration_ms !== null && (
                            <span className="text-muted-foreground tabular-nums">
                              {r.last_duration_ms}ms
                            </span>
                          )}
                          <span className="text-muted-foreground tabular-nums">
                            {r.total_24h}× / 24t
                          </span>
                          <span
                            className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-primary/30 text-primary bg-primary/5"
                            title="On-demand: trigget av en side"
                          >
                            side {r.ondemand_24h}
                          </span>
                          <span
                            className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-border text-muted-foreground bg-muted/20"
                            title="Cron / server / webhook"
                          >
                            cron {r.cron_24h}
                          </span>
                          <span
                            className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-amber-500/40 text-amber-400 bg-amber-500/10"
                            title="Auth / token / login (brukernavn + passord)"
                          >
                            auth {r.auth_24h}
                          </span>
                          <span
                            className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                            title="Faktiske utgående kall til ekstern API"
                          >
                            live {r.live_24h}
                          </span>
                          <span
                            className="text-[9px] tracking-[0.15em] uppercase tabular-nums px-1.5 py-0.5 rounded-sm border border-sky-500/40 text-sky-400 bg-sky-500/10"
                            title="Treff i lokal/server-cache (ingen ekstern spørring)"
                          >
                            cache {r.cache_24h}
                          </span>

                          {r.errors_24h > 0 && (
                            <span className="text-destructive">
                              {r.errors_24h} feil
                            </span>
                          )}
                          {r.last_cached && (
                            <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
                              cache
                            </span>
                          )}
                          {r.last_error && (
                            <span className="basis-full text-destructive italic pl-4">
                              {r.last_error}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {(hiddenCount > 0 || expanded) && sortedSources.length > INITIAL_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 w-full px-4 py-2 rounded border border-border text-[11px] tracking-[0.3em] uppercase hover:bg-primary/10 text-muted-foreground"
          >
            {expanded
              ? "▴ Vis færre"
              : `▾ Vis ${hiddenCount} til`}
          </button>
        )}

        <div className="mt-6 pt-4 border-t border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
            Rydd opp i loggen
          </div>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => handlePurge(days)}
                disabled={purging !== null}
                className="px-3 py-1.5 rounded border border-destructive/40 text-destructive text-[11px] tracking-[0.15em] uppercase hover:bg-destructive/10 disabled:opacity-50"
              >
                {purging === days
                  ? "Sletter…"
                  : `🗑 Eldre enn ${days < 30 ? `${days} dager` : "1 måned"}`}
              </button>
            ))}
          </div>
          {purgeMsg && (
            <p className="mt-2 text-[11px] text-muted-foreground">{purgeMsg}</p>
          )}
        </div>

        {data && (
          <p className="text-[10px] text-muted-foreground mt-4 text-right">
            Oppdatert {new Date(data.fetchedAt).toLocaleTimeString("nb-NO")}
          </p>
        )}
      </div>
    </section>
  );
}
