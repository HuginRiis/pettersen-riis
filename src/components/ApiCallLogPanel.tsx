import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getApiCallLog,
  refreshApiSource,
  type ApiCallSummary,
} from "@/server/api-call-log";
import { purgeApiCallLog } from "@/server/api-call-log-purge.functions";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

const SOURCE_COLORS: Record<string, string> = {
  homey: "#d4af37",
  strava: "#fc4c02",
  netatmo: "#6a8caf",
  tibber: "#7fb069",
  met: "#9b8cc6",
  nrk: "#c97b4a",
  spot: "#e8a87c",
  lightning: "#ffd166",
  garbage: "#8b6f47",
  kassal: "#b56576",
  gardena: "#83c5be",
  garmin: "#5fb3a2",
  roborock: "#b07bac",
  ai: "#6c5ce7",
  posten: "#e84393",
  geoip: "#74b9ff",
  uv: "#fdcb6e",
  other: "#888",
};
const colorFor = (s: string) => SOURCE_COLORS[s] ?? "#888";

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
  kassal: "Kassalapp",
  other: "Andre",
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

  const [data, setData] = useState<ApiCallSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busySource, setBusySource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [purging, setPurging] = useState<number | null>(null);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);

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
      const res = await fetchLog();
      setData(res);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Klarte ikke laste logg");
    } finally {
      setLoading(false);
    }
  };

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

  // Bygg timeserie for stacked bar chart (siste 24t per kilde).
  const { chartData, chartSources } = useMemo(() => {
    const hourly = data?.hourly ?? [];
    const buckets = new Map<string, Record<string, number | string>>();
    const srcSet = new Set<string>();
    for (const h of hourly) {
      const d = new Date(h.hour);
      const key = d.toISOString();
      const label = d.toLocaleTimeString("nb-NO", { hour: "2-digit" });
      const row = buckets.get(key) ?? { _ts: key, label };
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
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-1">
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
