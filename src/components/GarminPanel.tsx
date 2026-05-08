import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Footprints, Heart, Flame, Moon, RefreshCw, LogIn, Loader2, TrendingUp, ShieldCheck } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { getGarminOverview, garminLoginNow, garminSyncNow, garminSubmitMfaCode } from "@/server/garmin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Daily = {
  day: string; steps: number | null; step_goal: number | null;
  floors_climbed: number | null; resting_heart_rate: number | null;
  total_kilocalories: number | null; active_kilocalories: number | null;
  distance_meters: number | null; moderate_intensity_minutes: number | null;
  vigorous_intensity_minutes: number | null; body_battery_high: number | null;
  body_battery_low: number | null; stress_average: number | null;
};
type Activity = {
  garmin_activity_id: number; activity_type: string | null; activity_name: string | null;
  start_time_local: string; duration_seconds: number | null; distance_meters: number | null;
  calories: number | null; average_hr: number | null; max_hr: number | null;
};
type Sleep = { day: string; total_seconds: number | null; deep_seconds: number | null; light_seconds: number | null; rem_seconds: number | null; awake_seconds: number | null; sleep_score: number | null };
type Overview = {
  status: { connected: boolean; username: string | null; expires_at: string | null; last_login_at: string | null; mfa_pending?: boolean };
  daily: Daily[]; activities: Activity[]; sleep: Sleep[];
  lastSync: { ran_at: string; ok: boolean; daily_count: number; activities_count: number; sleep_count: number; error: string | null } | null;
};
type GarminLoginResult =
  | { ok: true; mfa: true }
  | { ok: true; mfa: false; expires_at: string }
  | { ok: false; mfa: false; rateLimited: true; retryAfterSeconds: number; message: string };

function fmtDuration(sec?: number | null) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}t ${m}m` : `${m}m`;
}
function fmtKm(m?: number | null) { return m ? `${(m / 1000).toFixed(1)} km` : "—"; }
function fmtNum(n?: number | null) { return n != null ? n.toLocaleString("nb-NO") : "—"; }

export function GarminPanel() {
  const fetchOverview = useServerFn(getGarminOverview);
  const loginFn = useServerFn(garminLoginNow);
  const syncFn = useServerFn(garminSyncNow);
  const mfaFn = useServerFn(garminSubmitMfaCode);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"login" | "sync" | "mfa" | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setData(await fetchOverview() as Overview); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const handleLogin = async () => {
    setWorking("login");
    try {
      const r = await loginFn() as GarminLoginResult;
      if (!r.ok && "rateLimited" in r && r.rateLimited) {
        setLoginNotice(r.message);
        toast.error(r.message);
      } else if (r.mfa) {
        setMfaCode("");
        setMfaOpen(true);
        setLoginNotice("Garmin har sendt en sikkerhetskode på e-post. Skriv den inn i dialogboksen.");
        toast.info("Garmin sendte deg en sikkerhetskode på e-post.");
      } else {
        setLoginNotice(null);
        toast.success("Logget inn på Garmin");
      }
      await load();
    } catch (e) { const message = (e as Error).message; setLoginNotice(message); toast.error(message); }
    finally { setWorking(null); }
  };

  const handleSubmitMfa = async () => {
    setWorking("mfa");
    setLoginNotice(null);
    try {
      await mfaFn({ data: { code: mfaCode } });
      toast.success("Garmin innlogging fullført");
      setMfaOpen(false);
      setMfaCode("");
      await load();
    } catch (e) { const message = (e as Error).message; setLoginNotice(message); toast.error(message); }
    finally { setWorking(null); }
  };

  const today = data?.daily?.[data.daily.length - 1];

  return (
    <section className="container mx-auto px-4 pb-6">
      <div className="panel rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
            <Activity size={16} /> Garmin — daglig helse
          </h2>
          <div className="flex items-center gap-2">
            {data?.status.mfa_pending && (
              <button
                onClick={() => { setMfaCode(""); setMfaOpen(true); }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-500/60 text-amber-600 dark:text-amber-400 text-xs hover:bg-amber-500/10"
              >
                <ShieldCheck size={12} /> Skriv inn kode
              </button>
            )}
            <button
              onClick={handleLogin}
              disabled={!!working}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border/60 text-xs hover:bg-muted/40 disabled:opacity-50"
            >
              {working === "login" ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn size={12} />}
              {data?.status.connected ? "Re-login" : "Logg inn"}
            </button>
            <button
              onClick={async () => { setWorking("sync"); try { const r = await syncFn(); if (r.ok) toast.success(`Synket: ${r.daily} dager, ${r.activities} aktiviteter, ${r.sleep} søvn`); else toast.error(r.error || "Sync feilet"); await load(); } catch (e) { toast.error((e as Error).message); } finally { setWorking(null); } }}
              disabled={!!working}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-primary/60 text-primary text-xs hover:bg-primary/10 disabled:opacity-50"
            >
              {working === "sync" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw size={12} />}
              Synk nå
            </button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {data?.status.connected
            ? <>Tilkoblet som <span className="text-foreground">{data.status.username}</span>{data.lastSync && <> · sist synket {new Date(data.lastSync.ran_at).toLocaleString("nb-NO")}</>}</>
            : data?.status.mfa_pending
              ? "Garmin venter på sikkerhetskode fra e-posten din — trykk 'Skriv inn kode'."
              : "Ikke tilkoblet — trykk 'Logg inn' for å hente data."}
        </p>

        {loginNotice && (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {loginNotice}
          </div>
        )}

        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laster…</div>}

        {!loading && (
          <>
            {/* Tellere */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile icon={<Footprints size={14} />} label="Skritt i dag" value={fmtNum(today?.steps)} sub={today?.step_goal ? `mål ${fmtNum(today.step_goal)}` : undefined} />
              <Tile icon={<TrendingUp size={14} />} label="Trapper" value={fmtNum(today?.floors_climbed ? Math.round(today.floors_climbed) : null)} />
              <Tile icon={<Heart size={14} />} label="Hvilepuls" value={today?.resting_heart_rate ? `${today.resting_heart_rate} bpm` : "—"} />
              <Tile icon={<Flame size={14} />} label="Kalorier" value={fmtNum(today?.total_kilocalories)} sub={today?.active_kilocalories ? `aktive ${fmtNum(today.active_kilocalories)}` : undefined} />
            </div>

            {/* Skritt-graf */}
            {data && data.daily.length > 0 && (
              <div className="rounded border border-border/60 bg-background/40 p-3">
                <div className="text-xs text-muted-foreground mb-2">Skritt siste 30 dager</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                    <Bar dataKey="steps" fill="var(--chart-yellow)" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Hvilepuls + Kalorier */}
            {data && data.daily.length > 0 && (
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded border border-border/60 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground mb-2">Hvilepuls (bpm)</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={data.daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="resting_heart_rate" stroke="var(--chart-yellow)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded border border-border/60 bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground mb-2">Aktive kalorier</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={data.daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="active_kilocalories" stroke="var(--chart-yellow)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Søvn */}
            {data && data.sleep.length > 0 && (
              <div className="rounded border border-border/60 bg-background/40 p-3">
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Moon size={12} /> Søvn (timer per natt — siste 14)</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.sleep.slice(-14).map((s) => ({
                    day: s.day,
                    deep: (s.deep_seconds ?? 0) / 3600,
                    light: (s.light_seconds ?? 0) / 3600,
                    rem: (s.rem_seconds ?? 0) / 3600,
                    awake: (s.awake_seconds ?? 0) / 3600,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                    <Bar dataKey="deep" stackId="a" fill="var(--chart-yellow)" />
                    <Bar dataKey="light" stackId="a" fill="var(--chart-yellow-soft)" />
                    <Bar dataKey="rem" stackId="a" fill="var(--chart-yellow-faint)" />
                    <Bar dataKey="awake" stackId="a" fill="color-mix(in oklab, var(--muted-foreground) 40%, transparent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Aktiviteter */}
            {data && data.activities.length > 0 && (
              <div className="rounded border border-border/60 bg-background/40 p-3">
                <div className="text-xs text-muted-foreground mb-2">Siste aktiviteter</div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {data.activities.map((a) => (
                    <div key={a.garmin_activity_id} className="flex items-center justify-between gap-2 text-xs border-b border-border/30 pb-1.5 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{a.activity_name || a.activity_type || "Aktivitet"}</div>
                        <div className="text-muted-foreground text-[10px]">
                          {new Date(a.start_time_local).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div className="flex gap-3 text-[10px] tabular-nums text-muted-foreground">
                        <span>{fmtKm(a.distance_meters)}</span>
                        <span>{fmtDuration(a.duration_seconds)}</span>
                        <span>{a.average_hr ? `♥ ${a.average_hr}` : "—"}</span>
                        <span>{a.calories ? `${a.calories} kcal` : "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={mfaOpen} onOpenChange={(o) => { if (!working) setMfaOpen(o); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck size={16} /> Garmin sikkerhetskode</DialogTitle>
            <DialogDescription>
              Garmin har sendt en kode på e-post. Skriv inn koden her for å fullføre innloggingen.
            </DialogDescription>
          </DialogHeader>
          <Input
            inputMode="numeric"
            autoFocus
            placeholder="123456"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => { if (e.key === "Enter" && mfaCode.length >= 4) void handleSubmitMfa(); }}
            className="text-center text-lg tracking-widest tabular-nums"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMfaOpen(false)} disabled={working === "mfa"}>Avbryt</Button>
            <Button onClick={handleSubmitMfa} disabled={mfaCode.length < 4 || working === "mfa"}>
              {working === "mfa" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Bekreft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
