import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDbUsage, type DbUsageStats } from "@/server/db-usage.functions";
import { Database, Clock, AlertTriangle } from "lucide-react";

function prettyBytes(b: number): string {
  if (!b) return "0 B";
  const units = ["B", "kB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

function describeSchedule(cron: string): string {
  const map: Record<string, string> = {
    "* * * * *": "hvert minutt",
    "*/2 * * * *": "hvert 2. minutt",
    "*/5 * * * *": "hvert 5. minutt",
    "*/10 * * * *": "hvert 10. minutt",
    "*/15 * * * *": "hvert 15. minutt",
    "*/30 * * * *": "hver halvtime",
    "0 * * * *": "hver time",
    "0 0 * * *": "midnatt daglig",
  };
  return map[cron] ?? cron;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  const fmt =
    sec < 60 ? `${sec}s` :
    sec < 3600 ? `${Math.round(sec / 60)} min` :
    sec < 86400 ? `${Math.round(sec / 3600)}t` :
    `${Math.round(sec / 86400)}d`;
  return diff <= 0 ? `for ${fmt} siden` : `om ${fmt}`;
}

function nextRun(cron: string, lastRun: string | null, explicit?: string | null): string {
  if (explicit) return relTime(explicit);
  if (!lastRun) return "—";
  const last = new Date(lastRun).getTime();
  const interval = (() => {
    if (cron === "* * * * *") return 60_000;
    const m = cron.match(/^\*\/(\d+) \* \* \* \*$/);
    if (m) return Number(m[1]) * 60_000;
    if (cron === "0 * * * *") return 60 * 60_000;
    return null;
  })();
  if (!interval) return "—";
  const next = new Date(last + interval);
  const diff = next.getTime() - Date.now();
  if (diff <= 0) return "snart";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `om ${sec}s`;
  return `om ${Math.round(sec / 60)} min`;
}

export function DbUsagePanel() {
  const fetchFn = useServerFn(getDbUsage);
  const [data, setData] = useState<DbUsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await fetchFn();
        if (alive) setData(d);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const i = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(i);
    };
  }, [fetchFn]);

  if (loading && !data) {
    return <div className="text-sm text-muted-foreground">Henter forbruk…</div>;
  }
  if (!data) return null;

  const pct = Math.min(100, (data.dbBytes / data.limitBytes) * 100);
  const tone = pct > 80 ? "text-destructive" : pct > 50 ? "text-yellow-500" : "text-primary";

  return (
    <div className="space-y-5">
      {/* Database-størrelse */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Database size={12} /> Database
          </div>
          <div className={`text-sm font-mono ${tone}`}>
            {data.dbPretty} / {data.limitLabel} ({pct.toFixed(1)}%)
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${pct > 80 ? "bg-destructive" : pct > 50 ? "bg-yellow-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 italic">
          Lovable Cloud free-tier gir 500 MB. Snakk med hærmesteren før vi når
          taket.
        </p>
      </div>

      {/* Cron jobs */}
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <Clock size={12} /> Planlagte jobber (cron)
        </div>
        {data.cronJobs.length === 0 ? (
          <div className="text-sm text-muted-foreground">Ingen jobber funnet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left border-b border-border">
                  <th className="py-1.5 pr-2">Jobb</th>
                  <th className="py-1.5 pr-2">Intervall</th>
                  <th className="py-1.5 pr-2">Sist kjørt</th>
                  <th className="py-1.5 pr-2">Neste</th>
                  <th className="py-1.5 pr-2 text-right">Kjøringer 24t</th>
                  <th className="py-1.5 pr-2 text-right">Feil 24t</th>
                </tr>
              </thead>
              <tbody>
                {data.cronJobs.map((j) => (
                  <tr key={j.jobname} className="border-b border-border/40">
                    <td className="py-1.5 pr-2 font-mono">{j.jobname}</td>
                    <td className="py-1.5 pr-2">{describeSchedule(j.schedule)}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {j.last_run
                        ? new Date(j.last_run).toLocaleTimeString("nb-NO")
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-primary">
                      {nextRun(j.schedule, j.last_run)}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {j.runs_24h}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right font-mono ${
                        j.failed_24h > 0 ? "text-destructive" : ""
                      }`}
                    >
                      {j.failed_24h > 0 && (
                        <AlertTriangle size={10} className="inline mr-1" />
                      )}
                      {j.failed_24h}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tabeller */}
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
          <Database size={12} /> Største tabeller
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left border-b border-border">
                <th className="py-1.5 pr-2">Tabell</th>
                <th className="py-1.5 pr-2 text-right">Rader</th>
                <th className="py-1.5 pr-2 text-right">Størrelse</th>
                <th className="py-1.5 pr-2 text-right">Andel</th>
              </tr>
            </thead>
            <tbody>
              {data.tables.slice(0, 12).map((t) => {
                const share = data.dbBytes > 0 ? (t.bytes / data.dbBytes) * 100 : 0;
                return (
                  <tr key={t.table} className="border-b border-border/40">
                    <td className="py-1.5 pr-2 font-mono">
                      {t.table.replace(/^public\./, "")}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {t.rows.toLocaleString("nb-NO")}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {prettyBytes(t.bytes)}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-muted-foreground">
                      {share.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
