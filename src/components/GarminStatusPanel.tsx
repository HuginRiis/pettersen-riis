import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Loader2, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { getGarminOverview } from "@/server/garmin.functions";

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
  const [status, setStatus] = useState<Status | null>(null);
  const [lastSync, setLastSync] = useState<LastSync>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = (await fetchOverview()) as { status: Status; lastSync: LastSync };
        if (!alive) return;
        setStatus(r.status);
        setLastSync(r.lastSync);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fetchOverview]);

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
    <div className={`rounded-lg border ${tone} bg-background/40 p-3 flex items-start gap-3`}>
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
        {status?.expires_at && (
          <div className="text-[10px] text-muted-foreground/80">
            Token utløper {new Date(status.expires_at).toLocaleString("nb-NO")}
          </div>
        )}
      </div>
    </div>
  );
}
