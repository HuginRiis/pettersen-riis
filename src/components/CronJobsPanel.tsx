import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  listCronJobs,
  setCronJobConfig,
  type CronJobRow,
} from "@/server/cron-jobs.functions";

type Draft = {
  mode: "cron" | "on-demand";
  /** Tom streng tillates så feltet kan tømmes uten å hoppe til 0 */
  minutes: string;
};

export function CronJobsPanel() {
  const [rows, setRows] = useState<CronJobRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const list = await listCronJobs();
      setRows(list);
      setDrafts((cur) => {
        const next = { ...cur };
        for (const r of list) {
          if (!next[r.jobid]) {
            next[r.jobid] = {
              mode: r.mode,
              minutes: r.intervalMinutes != null ? String(r.intervalMinutes) : "",
            };
          }
        }
        return next;
      });
    } catch (e) {
      console.error(e);
      toast.error("Kunne ikke hente cron-jobber");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save(jobid: number) {
    const d = drafts[jobid];
    if (!d) return;
    setSavingId(jobid);
    try {
      if (d.mode === "cron") {
        const n = Number(d.minutes);
        if (!Number.isFinite(n) || n < 1) {
          toast.error("Skriv inn et tall (minutter) større enn 0");
          setSavingId(null);
          return;
        }
        await setCronJobConfig({ data: { jobid, mode: "cron", minutes: n } });
      } else {
        await setCronJobConfig({ data: { jobid, mode: "on-demand" } });
      }
      toast.success("Lagret");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre");
    } finally {
      setSavingId(null);
    }
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.jobname.localeCompare(b.jobname)),
    [rows],
  );

  return (
    <div className="panel rounded-lg p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-primary" />
          <div className="text-display text-primary text-sm tracking-[0.2em] uppercase">
            Api-kjøringer
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={refresh}
          disabled={loading}
          className="h-7 px-2 text-xs"
        >
          {loading ? (
            <Loader2 size={12} className="mr-1 animate-spin" />
          ) : (
            <RefreshCw size={12} className="mr-1" />
          )}
          Oppdater
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground mb-4">
        Planlagte API-kjøringer på serveren. Velg «Cron» og antall minutter mellom kjøringene, eller «Kun ved bruk» for å skru av automatikken. Endringen tar effekt umiddelbart.
      </p>

      {loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Laster …
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-xs text-muted-foreground">Ingen cron-jobber funnet.</div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((r) => {
            const d = drafts[r.jobid] ?? {
              mode: r.mode,
              minutes: r.intervalMinutes != null ? String(r.intervalMinutes) : "",
            };
            const dirty =
              d.mode !== r.mode ||
              (d.mode === "cron" && Number(d.minutes) !== r.intervalMinutes);
            return (
              <li
                key={r.jobid}
                className="rounded border border-primary/15 p-3 bg-background/40"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {r.jobname}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                      Nå: {r.description}
                      <span className="ml-2 font-mono normal-case tracking-normal text-muted-foreground/70">
                        ({r.schedule})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <div className="inline-flex rounded border border-primary/20 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setDrafts((cur) => ({
                          ...cur,
                          [r.jobid]: { ...d, mode: "cron" },
                        }))
                      }
                      className={`text-[11px] px-3 py-1.5 transition-colors ${
                        d.mode === "cron"
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Cron
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDrafts((cur) => ({
                          ...cur,
                          [r.jobid]: { ...d, mode: "on-demand" },
                        }))
                      }
                      className={`text-[11px] px-3 py-1.5 transition-colors border-l border-primary/20 ${
                        d.mode === "on-demand"
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Kun ved bruk
                    </button>
                  </div>

                  {d.mode === "cron" && (
                    <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Hver
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={10080}
                        value={d.minutes}
                        onChange={(e) =>
                          setDrafts((cur) => ({
                            ...cur,
                            [r.jobid]: { ...d, minutes: e.target.value },
                          }))
                        }
                        className="h-7 w-20 text-xs"
                      />
                      min
                    </label>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => save(r.jobid)}
                    disabled={!dirty || savingId === r.jobid}
                    className="h-7 px-2 text-xs ml-auto"
                  >
                    {savingId === r.jobid ? (
                      <Loader2 size={12} className="mr-1 animate-spin" />
                    ) : (
                      <Save size={12} className="mr-1" />
                    )}
                    Lagre
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
