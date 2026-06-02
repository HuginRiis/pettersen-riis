import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDbDetailStats, type DbDetailStats } from "@/lib/db-detail.functions";
import { Database, Table2, Eye, Clock, ArrowUpDown } from "lucide-react";

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

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "snart";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s siden`;
  if (sec < 3600) return `${Math.round(sec / 60)} min siden`;
  if (sec < 86400) return `${Math.round(sec / 3600)} t siden`;
  return `${Math.round(sec / 86400)} d siden`;
}

type SortKey = "bytes" | "rows" | "last_analyze" | "name";

export function DbDetailPanel() {
  const fetchFn = useServerFn(getDbDetailStats);
  const [data, setData] = useState<DbDetailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("bytes");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetchFn();
        if (alive) setData(d);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchFn]);

  const sortedTables = useMemo(() => {
    if (!data) return [];
    const f = filter.trim().toLowerCase();
    const list = f ? data.tables.filter((t) => t.table.toLowerCase().includes(f)) : data.tables;
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortKey === "bytes") return b.bytes - a.bytes;
      if (sortKey === "rows") return b.rows - a.rows;
      if (sortKey === "name") return a.table.localeCompare(b.table);
      // last_analyze: nyligst først, null sist
      const av = a.last_analyze ? new Date(a.last_analyze).getTime() : 0;
      const bv = b.last_analyze ? new Date(b.last_analyze).getTime() : 0;
      return bv - av;
    });
    return sorted;
  }, [data, sortKey, filter]);

  const totalBytes = useMemo(
    () => (data?.tables ?? []).reduce((s, t) => s + t.bytes, 0),
    [data],
  );

  if (loading && !data) {
    return <div className="text-sm text-muted-foreground">Henter detaljer…</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Header med sum */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Database size={12} /> Detaljert oversikt
        </div>
        <div className="text-[11px] font-mono text-muted-foreground">
          DB totalt: {prettyBytes(data.dbBytes)} · Sum tabeller: {prettyBytes(totalBytes)}
        </div>
      </div>

      {/* Tabell-liste */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <Table2 size={12} /> Tabeller ({sortedTables.length})
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Søk…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-border bg-background w-32"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="text-xs px-2 py-1 rounded border border-border bg-background"
              aria-label="Sorter"
            >
              <option value="bytes">Størrelse</option>
              <option value="rows">Rader</option>
              <option value="last_analyze">Sist oppdatert</option>
              <option value="name">Navn</option>
            </select>
            <ArrowUpDown size={12} className="text-muted-foreground" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left border-b border-border">
                <th className="py-1.5 pr-2">Tabell</th>
                <th className="py-1.5 pr-2 text-right">Størrelse</th>
                <th className="py-1.5 pr-2 text-right">Tabell</th>
                <th className="py-1.5 pr-2 text-right">Indeks</th>
                <th className="py-1.5 pr-2 text-right">Rader</th>
                <th className="py-1.5 pr-2">Sist oppdatert</th>
                <th className="py-1.5 pr-2">Sist vakuum</th>
              </tr>
            </thead>
            <tbody>
              {sortedTables.map((t) => {
                const pct = totalBytes > 0 ? (t.bytes / totalBytes) * 100 : 0;
                return (
                  <tr key={t.table} className="border-b border-border/40">
                    <td className="py-1.5 pr-2 font-mono">
                      <div>{t.table}</div>
                      <div className="h-1 mt-0.5 w-full max-w-[140px] rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{prettyBytes(t.bytes)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{prettyBytes(t.table_bytes)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{prettyBytes(t.index_bytes)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{t.rows.toLocaleString("nb-NO")}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground" title={t.last_analyze ?? ""}>{relTime(t.last_analyze)}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground" title={t.last_vacuum ?? ""}>{relTime(t.last_vacuum)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 italic">
          «Sist oppdatert» og «Sist vakuum» kommer fra Postgres sin egen statistikk
          (auto-analyze / auto-vacuum) og er en god indikasjon på når tabellen sist hadde
          aktivitet.
        </p>
      </div>

      {/* Views */}
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          <Eye size={12} /> Views ({data.views.length})
        </div>
        {data.views.length === 0 ? (
          <div className="text-xs text-muted-foreground">Ingen views.</div>
        ) : (
          <div className="space-y-0.5">
            {data.views.map((v) => (
              <div key={`${v.schema}.${v.view}`} className="flex items-center justify-between text-[11px]">
                <span className="font-mono">
                  {v.view}
                  {v.is_materialized && <span className="ml-1 text-[10px] text-muted-foreground">(materialisert)</span>}
                </span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {v.bytes != null ? prettyBytes(v.bytes) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cron-tabeller (pg_cron) */}
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          <Clock size={12} /> Cron-jobber ({data.cronJobs.length})
        </div>
        {data.cronJobs.length === 0 ? (
          <div className="text-xs text-muted-foreground">Ingen cron-jobber.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left border-b border-border">
                  <th className="py-1.5 pr-2">Jobb</th>
                  <th className="py-1.5 pr-2">Schedule</th>
                  <th className="py-1.5 pr-2">Aktiv</th>
                  <th className="py-1.5 pr-2">Sist kjørt</th>
                  <th className="py-1.5 pr-2">Sist OK</th>
                  <th className="py-1.5 pr-2 text-right">24t</th>
                  <th className="py-1.5 pr-2 text-right">Feil</th>
                </tr>
              </thead>
              <tbody>
                {data.cronJobs.map((c) => (
                  <tr key={c.jobname} className={`border-b border-border/40 ${!c.active ? "opacity-50" : ""}`}>
                    <td className="py-1.5 pr-2 font-mono">{c.jobname}</td>
                    <td className="py-1.5 pr-2 font-mono text-muted-foreground">{c.schedule}</td>
                    <td className="py-1.5 pr-2">{c.active ? "På" : "Av"}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground" title={c.last_run ?? ""}>{relTime(c.last_run)}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground" title={c.last_success ?? ""}>{relTime(c.last_success)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{c.runs_24h}</td>
                    <td className={`py-1.5 pr-2 text-right tabular-nums ${c.failed_24h > 0 ? "text-destructive" : ""}`}>{c.failed_24h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
