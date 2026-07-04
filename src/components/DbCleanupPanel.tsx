import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDbCleanupEstimate, runDbCleanup, reclaimDbSpace, type DbCleanupEstimate } from "@/lib/db-cleanup.functions";
import { Database, Trash2, Sparkles, CalendarClock, Layers, Loader2, Zap, HardDrive } from "lucide-react";

function pretty(b: number): string {
  if (!b) return "0 B";
  const u = ["B", "kB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}

export function DbCleanupPanel() {
  const fetchFn = useServerFn(getDbCleanupEstimate);
  const runFn = useServerFn(runDbCleanup);
  const reclaimFn = useServerFn(reclaimDbSpace);
  const [data, setData] = useState<DbCleanupEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reclaiming, setReclaiming] = useState(false);
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<Record<string, { bytes: number; at: number }>>({});



  const load = () => {
    setLoading(true);
    fetchFn({})
      .then(setData)
      .catch((e) => console.error("[db-cleanup]", e))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleReclaim = async (silent = false) => {
    setReclaiming(true);
    try {
      const res = await reclaimFn({});
      if (!silent) {
        alert(`Diskplass frigis nå: ${res.scheduledCount} tabeller planlagt for VACUUM FULL.\n\n${res.message}\n\nDatabase-størrelsen oppdateres innen få minutter.`);
      }
    } catch (e: any) {
      if (!silent) alert("Kunne ikke starte diskrensing: " + (e?.message ?? "ukjent"));
      else console.warn("[db-cleanup] auto-reclaim failed", e);
    } finally {
      setReclaiming(false);
    }
  };

  const handleRun = async (mode: "unused" | "recommended" | "month30" | "full30" | "pgnet", label: string) => {
    const pwd = prompt(`Skriv inn passord for å slette ${label}:`);
    if (pwd === null) return;
    if (pwd !== "9272") {
      alert("Feil passord.");
      return;
    }
    if (!confirm(`Slette ${label}? Dette kan ikke angres.`)) return;
    setBusy(mode);
    try {
      const res = await runFn({ data: { mode } });
      // Auto-frigi diskplass etter sletting (unntatt pgnet som frigir selv)
      if (mode !== "pgnet" && res.totalDeleted > 0) {
        await handleReclaim(true);
        alert(`Slettet ${res.totalDeleted} rader.\n\nDiskplass frigis nå i bakgrunnen (VACUUM FULL). Størrelsen oppdateres innen få minutter.`);
      } else {
        alert(`Slettet ${res.totalDeleted} rader.`);
      }
      load();
    } catch (e: any) {
      alert("Feil: " + (e?.message ?? "ukjent"));
    } finally {
      setBusy(null);
    }
  };

  const handleScan = async (mode: "unused" | "recommended" | "month30" | "full30" | "pgnet") => {
    setScanning(mode);
    try {
      const fresh = await fetchFn({});
      setData(fresh);
      const bytes =
        mode === "unused" ? fresh.totals.unusedBytes :
        mode === "recommended" ? fresh.totals.recommendedBytes :
        mode === "month30" ? fresh.totals.month30Bytes :
        mode === "pgnet" ? fresh.totals.pgnetBytes :
        fresh.totals.full30Bytes;
      setScanResult((prev) => ({ ...prev, [mode]: { bytes, at: Date.now() } }));
    } catch (e: any) {
      alert("Skann feilet: " + (e?.message ?? "ukjent"));
    } finally {
      setScanning(null);
    }
  };

  if (loading && !data) {
    return <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Beregner sparing…</div>;
  }
  if (!data) return null;

  const pct = (b: number) => data.totals.dbBytes > 0 ? Math.round((b / data.totals.dbBytes) * 100) : 0;

  const boxes = [
    {
      key: "unused" as const,
      title: "Slett ubrukt logg",
      icon: Trash2,
      color: "#a78bfa",
      bytes: data.totals.unusedBytes,
      desc: "Logger som ingen graf eller visning bruker — kan trygt tømmes helt.",
      cta: "Slett ubrukt",
    },
    {
      key: "recommended" as const,
      title: "Anbefalt opprydning",
      icon: Sparkles,
      color: "#34d399",
      bytes: data.totals.recommendedBytes,
      desc: "Tilpasset retensjon per tabell basert på hva som faktisk vises i app-en.",
      cta: "Kjør anbefalt",
    },
    {
      key: "month30" as const,
      title: "Slett alt eldre enn 1 måned",
      icon: CalendarClock,
      color: "#f59e0b",
      bytes: data.totals.month30Bytes,
      desc: "Tømmer alle logger, grafer og cron-historikk eldre enn 30 dager.",
      cta: "Slett >30 dager",
    },
    {
      key: "full30" as const,
      title: "Komplett 30-dagers opprydning",
      icon: Layers,
      color: "#60a5fa",
      bytes: data.totals.full30Bytes,
      desc: "Skanner ALLE tabeller (inkl. cron-historikk) og sletter alt eldre enn 30 dager — kun siste 30 dager beholdes.",
      cta: "Kjør komplett",
    },
    {
      key: "pgnet" as const,
      title: "pg_net responscache",
      icon: Zap,
      color: "#f472b6",
      bytes: data.totals.pgnetBytes,
      desc: `Midlertidig HTTP-responscache fra webhooks/cron (${data.totals.pgnetRows.toLocaleString("no-NO")} rader). Ingen UI bruker dette — kan tømmes helt og diskplass frigjøres umiddelbart.`,
      cta: "Tøm cache",
    },

  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Database size={12} />
          Database-størrelse nå: <span className="font-medium text-foreground">{pretty(data.totals.dbBytes)}</span>
        </div>
        <button
          type="button"
          disabled={reclaiming || busy !== null}
          onClick={() => handleReclaim(false)}
          className="text-xs px-3 py-1.5 rounded border border-cyan-500/60 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          title="Kjør VACUUM FULL for å faktisk frigjøre diskplass etter sletting"
        >
          {reclaiming ? <Loader2 size={12} className="animate-spin" /> : <HardDrive size={12} />}
          Frigi diskplass nå
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {boxes.map((b) => {
          const Icon = b.icon;
          return (
            <div
              key={b.key}
              className="rounded-lg border border-border/40 bg-background/40 p-3 flex flex-col"
              style={{ borderColor: `${b.color}40` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} style={{ color: b.color }} />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{b.title}</span>
              </div>
              <div className="font-serif text-3xl tabular-nums" style={{ color: b.color }}>
                {pretty(b.bytes)}
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                ≈ {pct(b.bytes)}% av databasen
              </div>
              <div className="text-[11px] text-muted-foreground/90 mt-1 flex-1">{b.desc}</div>
              {scanResult[b.key] && (
                <div className="text-[10px] text-muted-foreground/80 mt-1">
                  Sist skannet: {pretty(scanResult[b.key].bytes)} ({new Date(scanResult[b.key].at).toLocaleTimeString("no-NO")})
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={scanning !== null || busy !== null}
                  onClick={() => handleScan(b.key)}
                  className="text-xs px-2 py-1 rounded border border-border/60 bg-background/60 hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                >
                  {scanning === b.key ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                  Skann
                </button>
                <button
                  type="button"
                  disabled={busy !== null || scanning !== null || b.bytes === 0}
                  onClick={() => handleRun(b.key, b.title.toLowerCase())}
                  className="text-xs px-2 py-1 rounded border border-border/60 bg-background/60 hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                  style={{ borderColor: `${b.color}80` }}
                >
                  {busy === b.key ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Slett
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <details className="rounded-lg border border-border/40 bg-background/40">
        <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
          Per tabell ({data.rows.length})
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/30">
                <th className="text-left px-3 py-1.5">Tabell</th>
                <th className="text-right px-2 py-1.5">Størrelse</th>
                <th className="text-right px-2 py-1.5">Rader</th>
                <th className="text-right px-2 py-1.5">Ubrukt</th>
                <th className="text-right px-2 py-1.5">Anbefalt</th>
                <th className="text-right px-3 py-1.5">&gt;30d</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.table} className="border-b border-border/20">
                  <td className="px-3 py-1.5">
                    <div className="text-foreground/90">{r.table}</div>
                    {r.note && <div className="text-[10px] text-muted-foreground italic">{r.note}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pretty(r.totalBytes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.totalRows.toLocaleString("no-NO")}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: r.unused ? "#a78bfa" : "var(--muted-foreground)" }}>
                    {r.unused ? pretty(r.unusedBytes) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-400">
                    {r.recommendedBytes > 0 ? pretty(r.recommendedBytes) : "—"}
                    {r.recommendedDays && <span className="text-[10px] text-muted-foreground"> ({r.recommendedDays}d)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-400">
                    {r.month30Bytes > 0 ? pretty(r.month30Bytes) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
