import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Loader2, CheckCircle2, AlertTriangle, ShieldAlert, Settings2, Save } from "lucide-react";
import { toast } from "sonner";
import { getGarminOverview, getGarminSyncSchedule, saveGarminSyncSchedule } from "@/server/garmin.functions";

type Status = {
  connected: boolean;
  username: string | null;
  expires_at: string | null;
  last_login_at: string | null;
  mfa_pending?: boolean;
};
type LastSync = {
  ran_at: string;
  ok: boolean;
  daily_count: number;
  activities_count: number;
  sleep_count: number;
  error: string | null;
} | null;

type Schedule = {
  interval_minutes: number;
  first_local_hour: number;
  last_local_hour: number;
};

const INTERVAL_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30, label: "Hver 30. min" },
  { value: 60, label: "Hver time" },
  { value: 120, label: "Hver 2. time" },
  { value: 240, label: "Hver 4. time" },
  { value: 360, label: "Hver 6. time" },
  { value: 720, label: "Hver 12. time" },
  { value: 1440, label: "Én gang per dag" },
];

function ago(iso: string | null): string {
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

export function GarminStatusPanel() {
  const fetchOverview = useServerFn(getGarminOverview);
  const fetchSchedule = useServerFn(getGarminSyncSchedule);
  const saveSchedule = useServerFn(saveGarminSyncSchedule);
  const [status, setStatus] = useState<Status | null>(null);
  const [lastSync, setLastSync] = useState<LastSync>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, s] = await Promise.all([
          fetchOverview() as Promise<{ status: Status; lastSync: LastSync }>,
          fetchSchedule() as Promise<Schedule>,
        ]);
        if (!alive) return;
        setStatus(r.status);
        setLastSync(r.lastSync);
        setSchedule(s);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchOverview, fetchSchedule]);

  const handleSave = async () => {
    if (!schedule) return;
    setSaving(true);
    try {
      await saveSchedule({ data: schedule });
      toast.success("Garmin-tidsplan lagret");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Laster Garmin-status…</div>;
  }

  const ok = status?.connected && lastSync?.ok !== false;
  const Icon = status?.mfa_pending ? ShieldAlert : ok ? CheckCircle2 : AlertTriangle;
  const tone = status?.mfa_pending
    ? "text-amber-500 border-amber-500/40"
    : ok
      ? "text-emerald-500 border-emerald-500/40"
      : "text-destructive border-destructive/40";

  return (
    <div className={`rounded-lg border ${tone} bg-background/40 p-3 space-y-2`}>
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 text-xs space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> Garmin Connect</span>
            {status?.connected ? (
              <span className="text-foreground">{status.username ?? "tilkoblet"}</span>
            ) : status?.mfa_pending ? (
              <span className="text-amber-500">venter på sikkerhetskode</span>
            ) : (
              <span className="text-destructive">ikke tilkoblet</span>
            )}
          </div>
          <div className="text-muted-foreground">
            {lastSync ? (
              <>
                Sist synket {ago(lastSync.ran_at)} ·{" "}
                {lastSync.ok
                  ? `${lastSync.daily_count} dager · ${lastSync.activities_count} aktiviteter · ${lastSync.sleep_count} søvn`
                  : <span className="text-destructive">{lastSync.error ?? "feilet"}</span>}
              </>
            ) : (
              <>Ingen sync logget enda</>
            )}
          </div>
          {schedule && (
            <div className="text-[10px] text-muted-foreground/80">
              Henter {INTERVAL_OPTIONS.find((o) => o.value === schedule.interval_minutes)?.label.toLowerCase() ?? `hver ${schedule.interval_minutes}. min`}
              {" · "}vindu {String(schedule.first_local_hour).padStart(2, "0")}–{String(schedule.last_local_hour).padStart(2, "0")}
            </div>
          )}
          {status?.expires_at && (
            <div className="text-[10px] text-muted-foreground/80">
              Token utløper {new Date(status.expires_at).toLocaleString("nb-NO")}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border/60 rounded px-1.5 py-0.5"
          aria-label="Tidsplan"
        >
          <Settings2 className="h-3 w-3" /> Tidsplan
        </button>
      </div>

      {showSettings && schedule && (
        <div className="border-t border-border/40 pt-2 space-y-2 text-xs">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Hvor ofte</span>
            <select
              className="mt-1 w-full rounded border border-border/60 bg-background px-2 py-1 text-xs"
              value={schedule.interval_minutes}
              onChange={(e) => setSchedule({ ...schedule, interval_minutes: parseInt(e.target.value, 10) })}
            >
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Første henting</span>
              <select
                className="mt-1 w-full rounded border border-border/60 bg-background px-2 py-1 text-xs"
                value={schedule.first_local_hour}
                onChange={(e) => setSchedule({ ...schedule, first_local_hour: parseInt(e.target.value, 10) })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Siste henting</span>
              <select
                className="mt-1 w-full rounded border border-border/60 bg-background px-2 py-1 text-xs"
                value={schedule.last_local_hour}
                onChange={(e) => setSchedule({ ...schedule, last_local_hour: parseInt(e.target.value, 10) })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:59</option>
                ))}
              </select>
            </label>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-primary/60 text-primary text-xs hover:bg-primary/10 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Lagre tidsplan
          </button>
        </div>
      )}
    </div>
  );
}
