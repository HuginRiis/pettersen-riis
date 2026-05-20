import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDbUsage, setCronJobActive, type DbUsageStats } from "@/server/db-usage.functions";
import {
  getStorageUsage,
  getBucketObjects,
  type StorageBucket,
  type StorageObject,
} from "@/server/storage-usage.functions";
import { Database, Clock, AlertTriangle, HardDrive, ChevronDown, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// Kategori-mapping for tabeller (matches mot tabellnavn uten public.-prefiks).
const TABLE_CATEGORIES: Array<{ name: string; match: (t: string) => boolean }> = [
  {
    name: "Logger",
    match: (t) =>
      /^(api_call_log|api_error|garmin_sync_log|home_alarm_log|push_send_log|garbage_notification_log|ai_search_log|visitor_|visitors_|login_attempts|pageview)/.test(t),
  },
  {
    name: "API-data",
    match: (t) =>
      /^(tibber|pulse_|spot_|met_|netatmo|garmin_(?!sync)|gardena|homey|roborock|nrk_|strava|kassal|eufy|lightning)/.test(t),
  },
  {
    name: "Innstillinger",
    match: (t) =>
      /(_prefs|_settings|favorites|api_pause_flags|notification_settings|menu_)/.test(t),
  },
  {
    name: "App-data",
    match: (t) =>
      /^(okonomi|hytta|planter|plants|agenda|birthdays|renovation|grocery|payslip|receipt|changelog|garbage_address|ip_user_mapping)/.test(t),
  },
];

function categorizeTable(table: string): string {
  const bare = table.replace(/^public\./, "");
  for (const c of TABLE_CATEGORIES) if (c.match(bare)) return c.name;
  return "Andre";
}

// Buckets: vi gjør et grovt skille mellom bilder og dokumenter.
function categorizeBucket(bucket: string): string {
  if (/payslip|receipt|kvittering/i.test(bucket)) return "Dokumenter";
  return "Bilder";
}

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
  const fetchStorage = useServerFn(getStorageUsage);
  const fetchBucket = useServerFn(getBucketObjects);
  const toggleFn = useServerFn(setCronJobActive);
  const [data, setData] = useState<DbUsageStats | null>(null);
  const [storage, setStorage] = useState<{ buckets: StorageBucket[]; totalBytes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bucketFiles, setBucketFiles] = useState<Record<string, { loading: boolean; objects: StorageObject[] }>>({});

  async function toggleCategory(name: string, bucketsInCat: StorageBucket[]) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    // Last filer for alle buckets i kategorien hvis vi åpner og ikke allerede har dem.
    for (const b of bucketsInCat) {
      if (bucketFiles[b.bucket]) continue;
      setBucketFiles((prev) => ({ ...prev, [b.bucket]: { loading: true, objects: [] } }));
      try {
        const res = await fetchBucket({ data: { bucket: b.bucket, limit: 25 } });
        setBucketFiles((prev) => ({ ...prev, [b.bucket]: { loading: false, objects: res.objects } }));
      } catch (e: any) {
        setBucketFiles((prev) => ({ ...prev, [b.bucket]: { loading: false, objects: [] } }));
        toast.error(`Kunne ikke hente filer i ${b.bucket}: ${e?.message ?? e}`);
      }
    }
  }


  async function handleToggle(jobname: string, next: boolean) {
    setPending(jobname);
    // Optimistisk oppdatering
    setData((d) =>
      d
        ? { ...d, cronJobs: d.cronJobs.map((c) => (c.jobname === jobname ? { ...c, active: next } : c)) }
        : d,
    );
    try {
      const res = await toggleFn({ data: { jobname, active: next } });
      if (!res.ok) throw new Error(res.error ?? "Feilet");
      toast.success(`${jobname}: ${next ? "skrudd på" : "skrudd av"}`);
    } catch (e: any) {
      toast.error(`Kunne ikke oppdatere ${jobname}: ${e?.message ?? e}`);
      // Reverter
      setData((d) =>
        d
          ? { ...d, cronJobs: d.cronJobs.map((c) => (c.jobname === jobname ? { ...c, active: !next } : c)) }
          : d,
      );
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [d, s] = await Promise.all([fetchFn(), fetchStorage()]);
        if (alive) {
          setData(d);
          setStorage(s);
        }
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
  }, [fetchFn, fetchStorage]);

  // Bygg kategoriaggregat over tabeller + buckets.
  const categoryUsage = useMemo(() => {
    const tot = new Map<string, number>();
    for (const t of data?.tables ?? []) {
      const cat = categorizeTable(t.table);
      tot.set(cat, (tot.get(cat) ?? 0) + t.bytes);
    }
    for (const b of storage?.buckets ?? []) {
      const cat = categorizeBucket(b.bucket);
      tot.set(cat, (tot.get(cat) ?? 0) + b.bytes);
    }
    const arr = Array.from(tot.entries()).map(([name, bytes]) => ({ name, bytes }));
    arr.sort((a, b) => b.bytes - a.bytes);
    const total = arr.reduce((s, c) => s + c.bytes, 0);
    return { categories: arr, total };
  }, [data, storage]);

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

      {/* Lagring per kategori */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <HardDrive size={12} /> Lagring per kategori
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            Totalt {prettyBytes(categoryUsage.total)}
          </div>
        </div>
        {categoryUsage.categories.length === 0 ? (
          <div className="text-sm text-muted-foreground">Ingen data.</div>
        ) : (
          <div className="space-y-1.5">
            {categoryUsage.categories.map((c) => {
              const pctC = categoryUsage.total > 0 ? (c.bytes / categoryUsage.total) * 100 : 0;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-foreground">{c.name}</span>
                    <span className="font-mono text-muted-foreground tabular-nums">
                      {prettyBytes(c.bytes)} · {pctC.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary/70" style={{ width: `${pctC}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {storage && storage.buckets.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/60">
            <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1.5">
              Storage-buckets
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {storage.buckets.map((b) => (
                <div key={b.bucket} className="flex items-center justify-between">
                  <span className="font-mono">{b.bucket}</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {prettyBytes(b.bytes)} · {b.objects}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
                  <th className="py-1.5 pr-2">På</th>
                  <th className="py-1.5 pr-2">Jobb</th>
                  <th className="py-1.5 pr-2">Intervall</th>
                  <th className="py-1.5 pr-2">Sist kjørt</th>
                  <th className="py-1.5 pr-2">Sist OK</th>
                  <th className="py-1.5 pr-2">Neste</th>
                  <th className="py-1.5 pr-2 text-right">Kjøringer 24t</th>
                  <th className="py-1.5 pr-2 text-right">Feil 24t</th>
                </tr>
              </thead>
              <tbody>
                {data.cronJobs.map((j) => (
                  <tr key={j.jobname} className={`border-b border-border/40 ${!j.active ? "opacity-50" : ""}`}>
                    <td className="py-1.5 pr-2">
                      <Switch
                        checked={j.active}
                        disabled={pending === j.jobname}
                        onCheckedChange={(v) => handleToggle(j.jobname, v)}
                        aria-label={`Skru ${j.active ? "av" : "på"} ${j.jobname}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2 font-mono">{j.jobname}</td>
                    <td className="py-1.5 pr-2">{describeSchedule(j.schedule)}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {j.last_run
                        ? new Date(j.last_run).toLocaleTimeString("nb-NO")
                        : "—"}
                    </td>
                    <td
                      className={`py-1.5 pr-2 font-mono ${
                        j.last_success ? "text-[oklch(0.72_0.16_150)]" : "text-muted-foreground"
                      }`}
                      title={j.last_success ?? undefined}
                    >
                      {j.last_success
                        ? new Date(j.last_success).toLocaleString("nb-NO", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-primary">
                      {j.active ? nextRun(j.schedule, j.last_run, j.next_run) : "—"}
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

      {/* Datasynk (utenfor pg_cron, trigget fra agenda-push) */}
      {data.dataSyncs && data.dataSyncs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
            <Clock size={12} /> Datasynk
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left border-b border-border">
                  <th className="py-1.5 pr-2">Kilde</th>
                  <th className="py-1.5 pr-2">Tidsplan</th>
                  <th className="py-1.5 pr-2">Sist kjørt</th>
                  <th className="py-1.5 pr-2">Neste</th>
                  <th className="py-1.5 pr-2 text-right">Kjør 24t</th>
                  <th className="py-1.5 pr-2 text-right">Feil 24t</th>
                </tr>
              </thead>
              <tbody>
                {data.dataSyncs.map((s) => (
                  <tr key={s.name} className="border-b border-border/40">
                    <td className="py-1.5 pr-2 font-mono">{s.name}</td>
                    <td className="py-1.5 pr-2">{s.schedule_label}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground">
                      {s.last_run ? new Date(s.last_run).toLocaleString("nb-NO", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-primary">
                      {s.next_run ? relTime(s.next_run) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">{s.runs_24h}</td>
                    <td className={`py-1.5 pr-2 text-right font-mono ${s.failed_24h > 0 ? "text-destructive" : ""}`}>
                      {s.failed_24h > 0 && <AlertTriangle size={10} className="inline mr-1" />}
                      {s.failed_24h}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
