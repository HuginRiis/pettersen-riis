import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPageLoadStats, type PageLoadStats } from "@/server/page-load.functions";
import { Gauge, Smartphone, History, TrendingUp, Users, AlertTriangle, ArrowUp, ArrowDown, Minus, Lightbulb } from "lucide-react";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function tone(ms: number): string {
  if (ms < 800) return "text-[oklch(0.72_0.16_150)]";
  if (ms < 2000) return "text-yellow-500";
  return "text-destructive";
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s siden`;
  if (sec < 3600) return `${Math.round(sec / 60)} min siden`;
  if (sec < 86400) return `${Math.round(sec / 3600)} t siden`;
  return `${Math.round(sec / 86400)} d siden`;
}

export function PageLoadPanel() {
  const fetchFn = useServerFn(getPageLoadStats);
  const [days, setDays] = useState(14);
  const [limit, setLimit] = useState(10000);
  const [limitInput, setLimitInput] = useState("10000");
  const [data, setData] = useState<PageLoadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const d = await fetchFn({ data: { days, limit } });
        if (alive) setData(d);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchFn, days, limit]);


  const routeHistory = useMemo(() => {
    if (!data || !selectedRoute) return [];
    return data.recent
      .filter((r) => r.route === selectedRoute)
      .slice(0, 30)
      .reverse()
      .map((r, i) => ({ i, ms: r.load_ms, when: new Date(r.loaded_at).toLocaleString("nb-NO") }));
  }, [data, selectedRoute]);

  if (loading && !data) return <div className="text-sm text-muted-foreground">Henter data…</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Gauge size={12} /> Sidelaster siste {days} dager
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-xs px-2 py-1 rounded border border-border bg-background"
          >
            <option value={1}>1 dag</option>
            <option value={7}>7 dager</option>
            <option value={14}>14 dager</option>
            <option value={30}>30 dager</option>
          </select>
        </div>
      </div>

      {/* Totalsum */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
          <div className={`text-lg font-mono ${tone(data.avgMs)}`}>{fmtMs(data.avgMs)}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">Snitt lastetid</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
          <div className="text-lg font-mono text-foreground">{data.totalCount.toLocaleString("nb-NO")}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-0.5">Sidevisninger</div>
        </div>
      </div>

      {/* Daglig trend */}
      {data.daily.length > 1 && (
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            <TrendingUp size={12} /> Snitt lastetid per dag
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}ms`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: number) => fmtMs(v)}
                />
                <Line type="monotone" dataKey="avg_ms" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per side */}
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Per side ({data.routes.length})
        </div>
        {data.routes.length === 0 ? (
          <div className="text-xs text-muted-foreground">Ingen data ennå. Naviger rundt i appen så fyller det seg.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left border-b border-border">
                  <th className="py-1.5 pr-2">Side</th>
                  <th className="py-1.5 pr-2 text-right">Snitt</th>
                  <th className="py-1.5 pr-2 text-right">P95</th>
                  <th className="py-1.5 pr-2 text-right">Antall</th>
                  <th className="py-1.5 pr-2">Sist</th>
                  <th className="py-1.5 pr-2">Av hvem</th>
                </tr>
              </thead>
              <tbody>
                {data.routes.map((r) => (
                  <tr
                    key={r.route}
                    className={`border-b border-border/40 cursor-pointer hover:bg-muted/30 ${selectedRoute === r.route ? "bg-muted/40" : ""}`}
                    onClick={() => setSelectedRoute(selectedRoute === r.route ? null : r.route)}
                  >
                    <td className="py-1.5 pr-2 font-mono">{r.route}</td>
                    <td className={`py-1.5 pr-2 text-right font-mono tabular-nums ${tone(r.avg_ms)}`}>{fmtMs(r.avg_ms)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{fmtMs(r.p95_ms)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.count}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground" title={r.last_at}>{relTime(r.last_at)}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {r.last_who}
                      {r.last_device ? <span className="text-[10px] opacity-70"> · {r.last_device}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historikk for valgt rute */}
      {selectedRoute && routeHistory.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            <History size={12} /> Historikk · {selectedRoute}
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={routeHistory}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="i" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}ms`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: number) => fmtMs(v)}
                  labelFormatter={(i: number) => routeHistory[i]?.when ?? ""}
                />
                <Bar dataKey="ms" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per bruker */}
      {data.users.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            <Users size={12} /> Per bruker ({data.users.length})
          </div>
          <div className="space-y-1">
            {data.users.map((u) => {
              const open = expandedUser === u.who;
              return (
                <div key={u.who} className="rounded border border-border/60 bg-muted/10">
                  <button
                    type="button"
                    onClick={() => setExpandedUser(open ? null : u.who)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-muted/30"
                  >
                    <span className="font-medium">{u.who}</span>
                    <span className="font-mono text-muted-foreground tabular-nums">
                      {u.count} visninger · {u.routes.length} sider · snitt{" "}
                      <span className={tone(u.avg_ms)}>{fmtMs(u.avg_ms)}</span> ·{" "}
                      <span title={u.last_at}>{relTime(u.last_at)}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="px-2 pb-2">
                      <table className="w-full text-xs">
                        <thead className="text-muted-foreground">
                          <tr className="text-left border-b border-border/40">
                            <th className="py-1 pr-2">Side</th>
                            <th className="py-1 pr-2 text-right">Antall</th>
                            <th className="py-1 pr-2">Sist</th>
                          </tr>
                        </thead>
                        <tbody>
                          {u.routes.map((r) => (
                            <tr key={r.route} className="border-b border-border/20">
                              <td className="py-1 pr-2 font-mono">{r.route}</td>
                              <td className="py-1 pr-2 text-right tabular-nums">{r.count}</td>
                              <td className="py-1 pr-2 text-muted-foreground" title={r.last_at}>
                                {relTime(r.last_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Enheter */}
      {data.devices.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            <Smartphone size={12} /> Enheter
          </div>
          <div className="space-y-0.5">
            {data.devices.map((d) => (
              <div key={d.device} className="flex items-center justify-between text-[11px]">
                <span className="font-mono">{d.device}</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {d.count} visninger · snitt <span className={tone(d.avg_ms)}>{fmtMs(d.avg_ms)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Siste 100 hendelser */}
      {data.recent.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
            <History size={12} /> Siste hendelser
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground sticky top-0 bg-background">
                <tr className="text-left border-b border-border">
                  <th className="py-1.5 pr-2">Tid</th>
                  <th className="py-1.5 pr-2">Side</th>
                  <th className="py-1.5 pr-2">Hvem</th>
                  <th className="py-1.5 pr-2">Enhet</th>
                  <th className="py-1.5 pr-2 text-right">Tid</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-1 pr-2 text-muted-foreground">{new Date(r.loaded_at).toLocaleString("nb-NO")}</td>
                    <td className="py-1 pr-2 font-mono">{r.route}</td>
                    <td className="py-1 pr-2">{r.who}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{r.device ?? "—"}</td>
                    <td className={`py-1 pr-2 text-right font-mono tabular-nums ${tone(r.load_ms)}`}>{fmtMs(r.load_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
