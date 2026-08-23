import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getDbBreakdown,
  reclaimDbSpace,
  type DbBreakdown,
} from "@/lib/db-cleanup.functions";
import { Database, Loader2, PackageOpen, RefreshCw } from "lucide-react";
import { useDbProgress, DbProgressBar } from "@/components/DbProgress";

function pretty(b: number): string {
  if (!b) return "0 B";
  const u = ["B", "kB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}

/**
 * Full oversikt over hva databasen faktisk består av — alle tabeller,
 * indekser, toast og «resten» (systemkataloger, cron-historikk osv.),
 * pluss en knapp for å komprimere (VACUUM FULL) hele databasen.
 */
export function DbBreakdownPanel() {
  const fetchFn = useServerFn(getDbBreakdown);
  const reclaimFn = useServerFn(reclaimDbSpace);
  const [data, setData] = useState<DbBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [compressing, setCompressing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const progress = useDbProgress();

  const load = () => {
    setLoading(true);
    fetchFn({})
      .then(setData)
      .catch((e) => console.error("[db-breakdown]", e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCompress = async () => {
    if (
      !confirm(
        "Komprimere databasen?\n\nVACUUM FULL kjøres på alle store tabeller og frigjør ledig plass etter sletting. Tabellene låses kort mens dette pågår.",
      )
    )
      return;
    setCompressing(true);
    try {
      const res = await reclaimFn({});
      progress.trackReclaim();
      alert(
        `Komprimering startet: ${res.scheduledCount} tabeller planlagt.\n\n${res.message}\n\nStørrelsen oppdateres innen få minutter.`,
      );
    } catch (e: any) {
      progress.hide();
      alert("Komprimering feilet: " + (e?.message ?? "ukjent"));
    } finally {
      setCompressing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Leser database-innhold…
      </div>
    );
  }
  if (!data) return null;

  const pct = (b: number) =>
    data.dbBytes > 0 ? Math.round((b / data.dbBytes) * 1000) / 10 : 0;
  const list = showAll ? data.tables : data.tables.slice(0, 15);
  const maxBytes = data.tables[0]?.bytes ?? 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Hva består databasen av?
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded border border-border/60 bg-background/60 hover:bg-background disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Oppdater
          </button>
          <button
            type="button"
            onClick={handleCompress}
            disabled={compressing}
            className="text-xs px-3 py-1.5 rounded border border-fuchsia-500/60 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-200 disabled:opacity-50 inline-flex items-center gap-1.5"
            title="VACUUM FULL på alle store tabeller — frigjør plass fra slettede rader"
          >
            {compressing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <PackageOpen size={12} />
            )}
            Komprimer database
          </button>
        </div>
      </div>

      <DbProgressBar state={progress.state} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total database", bytes: data.dbBytes, color: "#e5e7eb" },
          { label: "Tabeller + indekser", bytes: data.tablesBytes, color: "#34d399" },
          { label: "pg_net cache", bytes: data.pgnetBytes, color: "#f472b6" },
          { label: "System / annet", bytes: data.otherBytes, color: "#60a5fa" },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-border/40 bg-background/40 p-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {k.label}
            </div>
            <div
              className="font-serif text-2xl tabular-nums"
              style={{ color: k.color }}
            >
              {pretty(k.bytes)}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              ≈ {pct(k.bytes)}%
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground/90">
        «System / annet» er Postgres sine egne kataloger, storage-metadata,
        auth-tabeller og cron-historikk — dette kan ikke slettes fra app-en,
        men krymper når du komprimerer etter en opprydning.
      </p>

      <div className="rounded-lg border border-border/40 bg-background/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/30">
                <th className="text-left px-3 py-1.5">Tabell</th>
                <th className="text-right px-2 py-1.5">Data</th>
                <th className="text-right px-2 py-1.5">Indeks</th>
                <th className="text-right px-2 py-1.5">Rader</th>
                <th className="text-right px-3 py-1.5">Totalt</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.table} className="border-b border-border/20">
                  <td className="px-3 py-1.5">
                    <div className="text-foreground/90 flex items-center gap-2">
                      <Database size={11} className="text-muted-foreground" />
                      {t.table}
                    </div>
                    <div className="mt-1 h-1 rounded bg-border/40 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400/70"
                        style={{
                          width: `${Math.max(2, (t.bytes / maxBytes) * 100)}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {pretty(t.tableBytes + t.toastBytes)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {pretty(t.indexBytes)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {t.rows.toLocaleString("no-NO")}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-foreground/90">
                    {pretty(t.bytes)}
                    <span className="text-[10px] text-muted-foreground">
                      {" "}
                      ({pct(t.bytes)}%)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.tables.length > 15 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="w-full text-[11px] px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            {showAll
              ? "Vis færre"
              : `Vis alle ${data.tables.length} tabeller`}
          </button>
        )}
      </div>
    </div>
  );
}
