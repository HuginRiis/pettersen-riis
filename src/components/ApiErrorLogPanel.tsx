import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getApiErrorLog, type ApiErrorLog } from "@/server/api-call-log";

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
  gardena: "Gardena",
  garmin: "Garmin",
  roborock: "Roborock",
  ai: "AI",
  posten: "Posten",
  geoip: "GeoIP",
  uv: "UV",
  other: "Andre",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s siden`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m siden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}t siden`;
  return `${Math.round(h / 24)}d siden`;
}

const WINDOWS = [
  { label: "24t", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 24 * 7 },
];

export function ApiErrorLogPanel() {
  const fetchErrors = useServerFn(getApiErrorLog);
  const [data, setData] = useState<ApiErrorLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState(72);
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (h = hours, source: string | null = filterSource) => {
    setLoading(true);
    try {
      const res = await fetchErrors({
        data: { hours: h, limit: 200, source: source ?? undefined },
      });
      setData(res);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Klarte ikke laste feil-logg");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(hours, filterSource);
    const id = setInterval(() => load(hours, filterSource), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, filterSource]);

  const errors = data?.errors ?? [];
  const counts = data?.countsBySource ?? [];

  const grouped = useMemo(() => {
    const m = new Map<string, typeof errors>();
    for (const e of errors) {
      const key = `${e.source}::${e.endpoint}`;
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
    return Array.from(m.entries())
      .map(([key, list]) => {
        const [source, endpoint] = key.split("::");
        return { source, endpoint, list };
      })
      .sort((a, b) => b.list.length - a.list.length);
  }, [errors]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 rounded border border-border p-0.5 bg-muted/30">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              onClick={() => setHours(w.hours)}
              className={`px-2 py-1 text-[10px] tracking-[0.15em] uppercase rounded ${
                hours === w.hours
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFilterSource(null)}
          className={`px-2 py-1 text-[10px] tracking-[0.15em] uppercase rounded border ${
            filterSource === null
              ? "border-primary text-primary bg-primary/10"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Alle ({errors.length})
        </button>
        {counts.map((c) => (
          <button
            key={c.source}
            type="button"
            onClick={() =>
              setFilterSource((prev) => (prev === c.source ? null : c.source))
            }
            className={`px-2 py-1 text-[10px] tracking-[0.15em] uppercase rounded border ${
              filterSource === c.source
                ? "border-destructive text-destructive bg-destructive/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {SOURCE_LABELS[c.source] ?? c.source} · {c.count}
          </button>
        ))}

        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="ml-auto px-3 py-1 rounded border border-border text-[10px] tracking-[0.15em] uppercase hover:bg-primary/10 disabled:opacity-50"
        >
          {loading ? "Laster…" : "○ Last på nytt"}
        </button>
      </div>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          ⚠ {error}
        </div>
      )}

      {!loading && errors.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          Ingen API-feil registrert i valgt periode. ✦
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ source, endpoint, list }) => (
            <div key={`${source}::${endpoint}`} className="border border-border rounded">
              <div className="px-3 py-2 bg-muted/20 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                  {SOURCE_LABELS[source] ?? source}
                </span>
                <span className="font-mono text-xs text-foreground truncate flex-1 min-w-0">
                  {endpoint}
                </span>
                <span className="text-[10px] text-destructive tracking-[0.15em] uppercase">
                  {list.length} feil
                </span>
              </div>
              <ul className="divide-y divide-border/60">
                {list.map((e) => {
                  const isOpen = openId === e.id;
                  return (
                    <li key={e.id} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : e.id)}
                        className="w-full text-left flex items-start gap-2 flex-wrap"
                      >
                        <span className="text-muted-foreground text-[10px] mt-0.5 w-3">
                          {isOpen ? "▾" : "▸"}
                        </span>
                        <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                          {formatTime(e.called_at)}
                        </span>
                        <span className="text-[10px] text-muted-foreground/80 shrink-0">
                          ({formatAgo(e.called_at)})
                        </span>
                        {e.status_code !== null && (
                          <span className="text-[10px] tracking-[0.15em] uppercase px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10 shrink-0">
                            {e.status_code}
                          </span>
                        )}
                        {e.duration_ms !== null && (
                          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                            {e.duration_ms}ms
                          </span>
                        )}
                        <span className="text-xs text-destructive flex-1 min-w-0 truncate">
                          {e.error_message ?? "(ingen feilmelding)"}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="mt-2 pl-5 space-y-2">
                          {e.error_message && (
                            <div>
                              <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
                                Feilmelding
                              </div>
                              <pre className="text-[11px] font-mono whitespace-pre-wrap break-words bg-muted/30 border border-border rounded p-2 text-destructive">
                                {e.error_message}
                              </pre>
                            </div>
                          )}
                          {e.metadata && (
                            <div>
                              <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
                                Metadata
                              </div>
                              <pre className="text-[11px] font-mono whitespace-pre-wrap break-words bg-muted/30 border border-border rounded p-2">
                                {(() => {
                                  try {
                                    return JSON.stringify(JSON.parse(e.metadata), null, 2);
                                  } catch {
                                    return e.metadata;
                                  }
                                })()}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {data && (
        <p className="text-[10px] text-muted-foreground text-right">
          Vindu: siste {data.windowHours}t · Oppdatert{" "}
          {new Date(data.fetchedAt).toLocaleTimeString("nb-NO")}
        </p>
      )}
    </div>
  );
}
