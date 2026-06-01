import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  Bell,
  Cpu,
  Database,
  Gauge,
  Loader2,
  MemoryStick,
  RefreshCw,
  Server,
  Timer,
  Zap,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getPerformanceSnapshot,
  type PerfSnapshot,
} from "@/server/performance-stats.functions";

export const Route = createFileRoute("/ytelse")({
  head: () => ({
    meta: [
      { title: "Ytelse — Pettersen-Riis" },
      { name: "description", content: "Oversikt over CPU-bruk, API-kall, cron-jobber, databasebruk og push." },
    ],
  }),
  component: YtelsePage,
});

const PALETTE = ["#d4af37", "#22d3ee", "#a78bfa", "#34d399", "#fb923c", "#f472b6", "#60a5fa", "#facc15", "#f87171", "#10b981"];

function fmtUptime(sec: number): string {
  if (!sec) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}t`;
}

function prettyBytes(b: number): string {
  if (!b) return "0 B";
  const u = ["B", "kB", "MB", "GB"];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "nå";
  if (m < 60) return `${m} min siden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} t siden`;
  const d = Math.round(h / 24);
  return `${d} d siden`;
}

function YtelsePage() {
  const fetchSnap = useServerFn(getPerformanceSnapshot);
  const [snap, setSnap] = useState<PerfSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const s = await fetchSnap();
      setSnap(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchSnap]);

  useEffect(() => { load(); }, [load]);

  // Aggregate hourly buckets across sources
  const hourlyChart = useMemo(() => {
    if (!snap) return [];
    const map = new Map<string, { hour: string; label: string; total: number; errors: number }>();
    for (const b of snap.api.hourly) {
      const key = b.hour;
      let row = map.get(key);
      if (!row) {
        const d = new Date(b.hour);
        row = { hour: key, label: `${String(d.getHours()).padStart(2, "0")}:00`, total: 0, errors: 0 };
        map.set(key, row);
      }
      row.total += b.total;
      row.errors += b.errors;
    }
    return Array.from(map.values()).sort((a, b) => a.hour.localeCompare(b.hour));
  }, [snap]);

  const sourceShare = useMemo(() => {
    if (!snap) return [];
    const m = new Map<string, number>();
    for (const r of snap.api.rows) m.set(r.source, (m.get(r.source) ?? 0) + r.total_24h);
    return Array.from(m.entries()).map(([source, total]) => ({ source, total })).sort((a, b) => b.total - a.total);
  }, [snap]);

  const dbPct = snap ? Math.min(100, Math.round((snap.db.bytes / snap.db.limitBytes) * 100)) : 0;

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-display text-2xl text-primary flex items-center gap-2">
              <Gauge size={22} /> Ytelse & Flaskehalser
            </h1>
            <p className="text-xs text-muted-foreground italic">
              Snapshot av API-trafikk, cron-jobber, databasebruk og push siste 24 timer.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {snap && (
              <span className="text-[10px] text-muted-foreground font-mono">
                Hentet {new Date(snap.fetchedAt).toLocaleTimeString("nb-NO")}
              </span>
            )}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-primary/50 text-primary text-xs uppercase tracking-[0.2em] hover:bg-primary/10 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Oppdater
            </button>
          </div>
        </header>

        {err && (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            ⚠ {err}
          </div>
        )}

        {!snap && loading && (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="inline-block animate-spin" size={20} /> Speider…
          </div>
        )}

        {snap && (
          <>
            {/* Topp-tall */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon={Activity} color="#d4af37" label="API-kall 24t" value={snap.api.total24h.toLocaleString("nb-NO")} sub={`${Math.round(snap.api.avgPerHour)} kall/t i snitt`} />
              <KpiCard icon={AlertTriangle} color="#f87171" label="Feil 24t" value={snap.api.errors24h.toLocaleString("nb-NO")} sub={`${snap.api.total24h ? Math.round((snap.api.errors24h / snap.api.total24h) * 100) : 0}% feilrate`} />
              <KpiCard icon={Database} color="#22d3ee" label="Database" value={prettyBytes(snap.db.bytes)} sub={`${dbPct}% av 500 MB`} />
              <KpiCard icon={Bell} color="#fb923c" label="Push i dag" value={snap.push.reduce((s, r) => s + r.today, 0).toString()} sub={`${snap.push.reduce((s, r) => s + r.week, 0)} siste 7d`} />
            </div>

            {/* Runtime: RAM + CPU på serverless-workeren */}
            <section className="panel rounded-lg p-4">
              <h2 className="text-display tracking-[0.2em] uppercase text-sm text-primary mb-3 flex items-center gap-2">
                <Cpu size={16} /> Worker-prosess (denne forespørselen)
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  icon={MemoryStick}
                  color="#a78bfa"
                  label="Heap brukt"
                  value={prettyBytes(snap.runtime.heapUsedBytes)}
                  sub={`av ${prettyBytes(snap.runtime.heapTotalBytes)} (${snap.runtime.heapTotalBytes ? Math.round((snap.runtime.heapUsedBytes / snap.runtime.heapTotalBytes) * 100) : 0}%)`}
                />
                <KpiCard
                  icon={MemoryStick}
                  color="#34d399"
                  label="RSS-minne"
                  value={prettyBytes(snap.runtime.rssBytes)}
                  sub={`extern ${prettyBytes(snap.runtime.externalBytes)}`}
                />
                <KpiCard
                  icon={Cpu}
                  color="#fb923c"
                  label="CPU last"
                  value={`${snap.runtime.cpuPercent}%`}
                  sub={`${snap.runtime.cpuUserMs.toFixed(1)} ms user · ${snap.runtime.cpuSystemMs.toFixed(1)} ms sys`}
                />
                <KpiCard
                  icon={Server}
                  color="#22d3ee"
                  label="Uptime"
                  value={fmtUptime(snap.runtime.uptimeSec)}
                  sub={`${snap.runtime.nodeVersion || "—"} · ${snap.runtime.platform || "edge"}`}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                Måles per kall i den serverless workeren som svarte. Cloudflare gjenbruker isolater, så RAM/uptime gjenspeiler aktiv instans — ikke hele appen.
              </p>
            </section>


            {/* Flaskehalser */}
            <section className="panel rounded-lg p-4">
              <h2 className="text-display tracking-[0.2em] uppercase text-sm text-primary mb-3 flex items-center gap-2">
                <Zap size={16} /> Anbefalinger & flaskehalser
              </h2>
              <ul className="space-y-2">
                {snap.bottlenecks.map((b, i) => (
                  <li key={i} className={`rounded border px-3 py-2 text-sm ${
                    b.level === "critical" ? "border-destructive/50 bg-destructive/10"
                    : b.level === "warn" ? "border-amber-500/50 bg-amber-500/10"
                    : "border-border/50 bg-background/40"
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded ${
                        b.level === "critical" ? "bg-destructive/30 text-destructive"
                        : b.level === "warn" ? "bg-amber-500/30 text-amber-300"
                        : "bg-primary/20 text-primary"
                      }`}>{b.level === "critical" ? "Kritisk" : b.level === "warn" ? "OBS" : "Info"}</span>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{b.area}</span>
                    </div>
                    <div className="text-foreground mt-1">{b.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{b.detail}</div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Hourly chart */}
            <section className="panel rounded-lg p-4">
              <h2 className="text-display tracking-[0.2em] uppercase text-sm text-primary mb-3 flex items-center gap-2">
                <Timer size={16} /> API-kall per time (siste 24t)
              </h2>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={hourlyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklab, var(--border) 30%, transparent)" />
                    <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "#fff" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="total" stackId="a" fill="#22d3ee" name="Totalt" />
                    <Bar dataKey="errors" stackId="b" fill="#f87171" name="Feil" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Source split + DB usage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="panel rounded-lg p-4">
                <h2 className="text-display tracking-[0.2em] uppercase text-sm text-primary mb-3 flex items-center gap-2">
                  <Server size={16} /> Fordeling per kilde
                </h2>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={sourceShare.slice(0, 10)} dataKey="total" nameKey="source" outerRadius={90} label={(p: any) => p.source}>
                        {sourceShare.slice(0, 10).map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "#fff" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="panel rounded-lg p-4">
                <h2 className="text-display tracking-[0.2em] uppercase text-sm text-primary mb-3 flex items-center gap-2">
                  <Database size={16} /> Største tabeller
                </h2>
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Databasebruk</span>
                    <span>{prettyBytes(snap.db.bytes)} / 500 MB</span>
                  </div>
                  <div className="h-2 bg-background/60 rounded-full overflow-hidden border border-border/30">
                    <div
                      className={`h-full ${dbPct > 85 ? "bg-destructive" : dbPct > 60 ? "bg-amber-500" : "bg-primary"}`}
                      style={{ width: `${dbPct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    pg_net cache: {snap.pgnet.rows.toLocaleString("nb-NO")} rader ({prettyBytes(snap.pgnet.bytes)})
                  </div>
                </div>
                <ul className="space-y-1 text-xs max-h-56 overflow-y-auto">
                  {snap.db.tables.slice(0, 12).map((t) => {
                    const max = snap.db.tables[0]?.bytes || 1;
                    const pct = Math.max(3, Math.round((t.bytes / max) * 100));
                    return (
                      <li key={t.table} className="flex items-center gap-2">
                        <span className="w-44 truncate text-foreground">{t.table}</span>
                        <div className="flex-1 h-1.5 bg-background/60 rounded-full overflow-hidden">
                          <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 text-right font-mono text-muted-foreground">{prettyBytes(t.bytes)}</span>
                        <span className="w-16 text-right font-mono text-muted-foreground/70">{t.rows.toLocaleString("nb-NO")}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            {/* Cron jobs */}
            <section className="panel rounded-lg p-4">
              <h2 className="text-display tracking-[0.2em] uppercase text-sm text-primary mb-3 flex items-center gap-2">
                <Timer size={16} /> Cron-jobber
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left py-1.5 pr-2">Jobb</th>
                      <th className="text-left py-1.5 pr-2">Plan</th>
                      <th className="text-left py-1.5 pr-2">Status</th>
                      <th className="text-right py-1.5 px-2">Runs 24t</th>
                      <th className="text-right py-1.5 px-2">Feil 24t</th>
                      <th className="text-right py-1.5 pl-2">Siste kjøring</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.cronJobs.map((c) => (
                      <tr key={c.jobname} className="border-t border-border/30">
                        <td className="py-1.5 pr-2 font-medium text-foreground">{c.jobname}</td>
                        <td className="py-1.5 pr-2 font-mono text-muted-foreground">{c.schedule}</td>
                        <td className="py-1.5 pr-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                            !c.active ? "bg-muted text-muted-foreground"
                            : c.failed_24h > 0 ? "bg-destructive/30 text-destructive"
                            : "bg-primary/20 text-primary"
                          }`}>
                            {!c.active ? "Av" : c.failed_24h > 0 ? "Feil" : "OK"}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{c.runs_24h}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${c.failed_24h > 0 ? "text-destructive" : ""}`}>{c.failed_24h}</td>
                        <td className="py-1.5 pl-2 text-right text-muted-foreground">{relTime(c.last_run)}</td>
                      </tr>
                    ))}
                    {snap.cronJobs.length === 0 && (
                      <tr><td colSpan={6} className="py-3 text-center text-muted-foreground">Ingen cron-jobber funnet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* API endpoint table */}
            <section className="panel rounded-lg p-4">
              <h2 className="text-display tracking-[0.2em] uppercase text-sm text-primary mb-3 flex items-center gap-2">
                <Activity size={16} /> Topp endepunkter (24t)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left py-1.5 pr-2">Kilde</th>
                      <th className="text-left py-1.5 pr-2">Endepunkt</th>
                      <th className="text-right py-1.5 px-2">Totalt</th>
                      <th className="text-right py-1.5 px-2">Cron</th>
                      <th className="text-right py-1.5 px-2">På-bestilling</th>
                      <th className="text-right py-1.5 px-2">Cache</th>
                      <th className="text-right py-1.5 px-2">Snitt ms</th>
                      <th className="text-right py-1.5 pl-2">Feil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.api.rows.slice().sort((a, b) => b.total_24h - a.total_24h).slice(0, 25).map((r, i) => (
                      <tr key={`${r.source}-${r.endpoint}-${i}`} className="border-t border-border/30">
                        <td className="py-1.5 pr-2 text-primary">{r.source}</td>
                        <td className="py-1.5 pr-2 font-mono text-muted-foreground truncate max-w-[260px]">{r.endpoint}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{r.total_24h.toLocaleString("nb-NO")}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{r.cron_24h}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{r.ondemand_24h}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{r.cache_24h}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${(r.avg_duration_ms_24h ?? 0) > 2000 ? "text-amber-400" : ""}`}>{r.avg_duration_ms_24h ?? "—"}</td>
                        <td className={`py-1.5 pl-2 text-right tabular-nums ${r.errors_24h > 0 ? "text-destructive" : "text-muted-foreground"}`}>{r.errors_24h}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Push */}
            {snap.push.length > 0 && (
              <section className="panel rounded-lg p-4">
                <h2 className="text-display tracking-[0.2em] uppercase text-sm text-primary mb-3 flex items-center gap-2">
                  <Bell size={16} /> Push-varslinger
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="text-left py-1.5 pr-2">Mottaker</th>
                        <th className="text-right py-1.5 px-2">I dag</th>
                        <th className="text-right py-1.5 px-2">7d</th>
                        <th className="text-right py-1.5 pl-2">30d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.push.map((p) => (
                        <tr key={p.recipient} className="border-t border-border/30">
                          <td className="py-1.5 pr-2 text-foreground">{p.recipient}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{p.today}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{p.week}</td>
                          <td className="py-1.5 pl-2 text-right tabular-nums">{p.month}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function KpiCard({ icon: Icon, color, label, value, sub }: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
          <div className="font-serif text-2xl mt-1 tabular-nums" style={{ color, textShadow: `0 0 14px ${color}55` }}>{value}</div>
        </div>
        <Icon size={20} color={color} />
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
