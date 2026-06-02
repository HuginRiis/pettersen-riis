import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listLoginAttempts } from "@/lib/login-attempts.functions";

type Attempt = {
  id: string;
  attempted_at: string;
  success: boolean;
  who: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  os: string | null;
  browser: string | null;
  device_type: string | null;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("no-NO", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export function LoginAttemptsLog() {
  const [rows, setRows] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listLoginAttempts({ data: { limit: 50 } });
      setRows(r.attempts);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Innloggings-logg</p>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>
      {loading && rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Laster …</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ingen forsøk ennå.</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {rows.map((r) => {
            const loc = [r.city, r.country].filter(Boolean).join(", ") || r.ip || "ukjent";
            const dev = [r.os, r.browser, r.device_type].filter(Boolean).join(" · ");
            return (
              <div
                key={r.id}
                className={`rounded-md border px-2 py-1.5 text-xs flex items-start gap-2 ${
                  r.success
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-destructive/40 bg-destructive/5"
                }`}
              >
                {r.success
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {r.success ? "Vellykket" : "Feilet"}{r.who ? ` — ${r.who}` : ""}
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{formatTime(r.attempted_at)}</span>
                  </div>
                  <div className="text-muted-foreground truncate">{loc}{dev ? ` · ${dev}` : ""}</div>
                  {r.ip && <div className="text-muted-foreground/70 truncate">IP: {r.ip}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
