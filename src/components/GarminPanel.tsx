import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Footprints, Heart, HeartPulse, Flame, Moon, RefreshCw, LogIn, Loader2, TrendingUp, ShieldCheck, Battery, Brain, Timer, Scale, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Minus, Building2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { getGarminOverview, garminLoginNow, garminSyncNow, garminSubmitMfaCode } from "@/server/garmin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Daily = {
  day: string; steps: number | null; step_goal: number | null;
  floors_climbed: number | null; resting_heart_rate: number | null;
  average_heart_rate: number | null; weight_kg: number | null;
  total_kilocalories: number | null; active_kilocalories: number | null;
  distance_meters: number | null; moderate_intensity_minutes: number | null;
  vigorous_intensity_minutes: number | null; intensity_minutes_goal: number | null;
  body_battery_high: number | null; body_battery_low: number | null;
  stress_average: number | null;
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
function hoursMin(sec?: number | null) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}t ${m}m` : `${m}m`;
}
function avgFmt(arr: Array<number | null | undefined> | undefined, digits = 0, unit = ""): string {
  const v = (arr ?? []).filter((n): n is number => typeof n === "number" && n > 0);
  if (!v.length) return "—";
  const a = v.reduce((x, y) => x + y, 0) / v.length;
  return a.toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? digits : 0 }) + unit;
}
function stressLevel(n?: number | null): string {
  if (n == null) return "—";
  if (n < 25) return "Hvile";
  if (n < 50) return "Lavt";
  if (n < 75) return "Medium";
  return "Høyt";
}

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
  const [showCharts, setShowCharts] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

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
  const yesterday = data?.daily && data.daily.length >= 2 ? data.daily[data.daily.length - 2] : undefined;
  const lastSleep = data?.sleep?.[data.sleep.length - 1];
  const prevSleep = data?.sleep && data.sleep.length >= 2 ? data.sleep[data.sleep.length - 2] : undefined;
  const intensityToday = (today?.moderate_intensity_minutes ?? 0) + (today?.vigorous_intensity_minutes ?? 0);
  const intensityYesterday = (yesterday?.moderate_intensity_minutes ?? 0) + (yesterday?.vigorous_intensity_minutes ?? 0);
  const sleepHoursToday = lastSleep?.total_seconds ? lastSleep.total_seconds / 3600 : null;
  const sleepHoursYesterday = prevSleep?.total_seconds ? prevSleep.total_seconds / 3600 : null;

  const todayDay = today?.day;
  const todaysActs = data?.activities?.filter((a) => a.start_time_local.slice(0, 10) === todayDay) ?? [];
  const yesterdayDay = yesterday?.day;
  const yesterdaysActs = data?.activities?.filter((a) => a.start_time_local.slice(0, 10) === yesterdayDay) ?? [];
  const maxHrToday = todaysActs.reduce((m, a) => Math.max(m, a.max_hr ?? 0), 0) || null;
  const maxHrYesterday = yesterdaysActs.reduce((m, a) => Math.max(m, a.max_hr ?? 0), 0) || null;

  return (
    <section className="container mx-auto px-4 pb-6">
      <div className="panel rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
            <Activity size={16} /> Garmin — daglig helse
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs ${showDetails ? "border-primary/60 text-primary bg-primary/10" : "border-border/60 hover:bg-muted/40"}`}
            >
              {showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {showDetails ? "Skjul detaljer" : "Vis detaljer"}
            </button>
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
              <Tile icon={<Footprints size={14} />} label="Skritt i dag"
                value={today?.steps ?? null} prev={yesterday?.steps ?? null}
                fmt={fmtNum} fallbackSub={today?.step_goal ? `mål ${fmtNum(today.step_goal)}` : "ingen data"}
                showDetails={showDetails}
                details={[
                  { k: "Mål", v: today?.step_goal ? fmtNum(today.step_goal) : "—" },
                  { k: "Igjen", v: today?.steps != null && today?.step_goal ? fmtNum(Math.max(0, today.step_goal - today.steps)) : "—" },
                  { k: "Distanse", v: fmtKm(today?.distance_meters) },
                  { k: "% av mål", v: today?.steps != null && today?.step_goal ? `${Math.round((today.steps / today.step_goal) * 100)}%` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.steps), 0) },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.steps), 0) },
                ]}
                chart={sparkBar(data?.daily, "steps")} />
              <Tile icon={<HeartPulse size={14} />} label="Hvilepuls"
                value={today?.resting_heart_rate ?? null} prev={yesterday?.resting_heart_rate ?? null}
                unit=" bpm" lowerIsBetter fallbackSub="ingen måling i dag"
                showDetails={showDetails}
                details={[
                  { k: "I dag", v: today?.resting_heart_rate != null ? `${today.resting_heart_rate} bpm` : "—" },
                  { k: "I går", v: yesterday?.resting_heart_rate != null ? `${yesterday.resting_heart_rate} bpm` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.resting_heart_rate), 0, " bpm") },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.resting_heart_rate), 0, " bpm") },
                ]}
                chart={sparkLine(data?.daily, "resting_heart_rate")} />
              <Tile icon={<Heart size={14} />} label="Snitt puls"
                value={today?.average_heart_rate ?? null} prev={yesterday?.average_heart_rate ?? null}
                unit=" bpm" fallbackSub="ingen måling i dag"
                showDetails={showDetails}
                details={[
                  { k: "I dag", v: today?.average_heart_rate != null ? `${today.average_heart_rate} bpm` : "—" },
                  { k: "I går", v: yesterday?.average_heart_rate != null ? `${yesterday.average_heart_rate} bpm` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.average_heart_rate), 0, " bpm") },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.average_heart_rate), 0, " bpm") },
                ]}
                chart={sparkLine(data?.daily, "average_heart_rate")} />
              <Tile icon={<TrendingUp size={14} />} label="Maks puls"
                value={maxHrToday} prev={maxHrYesterday}
                unit=" bpm" fallbackSub="ingen aktivitet i dag"
                showDetails={showDetails}
                details={[
                  { k: "I dag", v: maxHrToday ? `${maxHrToday} bpm` : "—" },
                  { k: "I går", v: maxHrYesterday ? `${maxHrYesterday} bpm` : "—" },
                  { k: "Aktiviteter i dag", v: String(todaysActs.length) },
                  { k: "Topp 30d", v: (() => { const top = data?.activities?.reduce((m, a) => Math.max(m, a.max_hr ?? 0), 0) ?? 0; return top ? `${top} bpm` : "—"; })() },
                ]}
                chart={sparkLine(
                  (() => {
                    const map = new Map<string, number>();
                    for (const a of data?.activities ?? []) {
                      const d = a.start_time_local.slice(0, 10);
                      const v = a.max_hr ?? 0;
                      if (v > (map.get(d) ?? 0)) map.set(d, v);
                    }
                    return (data?.daily ?? []).map((d) => ({ day: d.day, max_hr: map.get(d.day) ?? null }));
                  })(),
                  "max_hr",
                )} />
              <Tile icon={<Building2 size={14} />} label="Trapper"
                value={today?.floors_climbed ?? null} prev={yesterday?.floors_climbed ?? null}
                fmt={fmtNum}
                fallbackSub="ingen data"
                showDetails={showDetails}
                details={[
                  { k: "I dag", v: today?.floors_climbed != null ? fmtNum(today.floors_climbed) : "—" },
                  { k: "I går", v: yesterday?.floors_climbed != null ? fmtNum(yesterday.floors_climbed) : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.floors_climbed), 0) },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.floors_climbed), 0) },
                ]}
                chart={sparkBar(data?.daily, "floors_climbed")} />
              <Tile icon={<Battery size={14} />} label="Body battery"
                value={today?.body_battery_high ?? null} prev={yesterday?.body_battery_high ?? null}
                fallbackSub={today?.body_battery_low != null ? `lav ${today.body_battery_low}` : "ingen data"}
                showDetails={showDetails}
                details={[
                  { k: "Høy", v: today?.body_battery_high != null ? String(today.body_battery_high) : "—" },
                  { k: "Lav", v: today?.body_battery_low != null ? String(today.body_battery_low) : "—" },
                  { k: "Differanse", v: today?.body_battery_high != null && today?.body_battery_low != null ? String(today.body_battery_high - today.body_battery_low) : "—" },
                  { k: "I går (høy)", v: yesterday?.body_battery_high != null ? String(yesterday.body_battery_high) : "—" },
                  { k: "Snitt høy 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.body_battery_high), 0) },
                  { k: "Snitt lav 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.body_battery_low), 0) },
                ]}
                chart={sparkLine2(data?.daily, "body_battery_high", "body_battery_low")} />
              <Tile icon={<Brain size={14} />} label="Stress (snitt)"
                value={today?.stress_average ?? null} prev={yesterday?.stress_average ?? null}
                lowerIsBetter fallbackSub="ingen måling"
                showDetails={showDetails}
                details={[
                  { k: "Snitt i dag", v: today?.stress_average != null ? String(today.stress_average) : "—" },
                  { k: "I går", v: yesterday?.stress_average != null ? String(yesterday.stress_average) : "—" },
                  { k: "Nivå", v: stressLevel(today?.stress_average) },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.stress_average), 0) },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.stress_average), 0) },
                ]}
                chart={sparkLine(data?.daily, "stress_average")} />
              <Tile icon={<Timer size={14} />} label="Intensitetsmin."
                value={intensityToday > 0 ? intensityToday : null} prev={intensityYesterday > 0 ? intensityYesterday : null}
                fallbackSub={today?.intensity_minutes_goal ? `mål ${today.intensity_minutes_goal}` : "ingen mål"}
                showDetails={showDetails}
                details={[
                  { k: "Moderat", v: today?.moderate_intensity_minutes != null ? `${today.moderate_intensity_minutes} min` : "—" },
                  { k: "Hard", v: today?.vigorous_intensity_minutes != null ? `${today.vigorous_intensity_minutes} min` : "—" },
                  { k: "Mål", v: today?.intensity_minutes_goal ? `${today.intensity_minutes_goal} min` : "—" },
                  { k: "Sum 7d", v: (() => { const s = (data?.daily?.slice(-7) ?? []).reduce((a, d) => a + (d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0), 0); return `${s} min`; })() },
                  { k: "Snitt 30d", v: (() => { const arr = (data?.daily ?? []).map((d) => (d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0)).filter((n) => n > 0); return arr.length ? `${Math.round(arr.reduce((a,b)=>a+b,0)/arr.length)} min` : "—"; })() },
                ]}
                chart={sparkBar(
                  (data?.daily ?? []).map((d) => ({ ...d, total_intensity: (d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0) })),
                  "total_intensity",
                )} />
              <Tile icon={<Moon size={14} />} label="Søvn"
                value={sleepHoursToday} prev={sleepHoursYesterday}
                unit=" t" digits={1}
                fallbackSub={lastSleep?.sleep_score != null ? `score ${lastSleep.sleep_score}` : "ingen søvndata"}
                showDetails={showDetails}
                details={[
                  { k: "Score", v: lastSleep?.sleep_score != null ? String(lastSleep.sleep_score) : "—" },
                  { k: "Dyp", v: lastSleep?.deep_seconds ? hoursMin(lastSleep.deep_seconds) : "—" },
                  { k: "Lett", v: lastSleep?.light_seconds ? hoursMin(lastSleep.light_seconds) : "—" },
                  { k: "REM", v: lastSleep?.rem_seconds ? hoursMin(lastSleep.rem_seconds) : "—" },
                  { k: "Våken", v: lastSleep?.awake_seconds ? hoursMin(lastSleep.awake_seconds) : "—" },
                  { k: "Snitt 7d", v: (() => { const s = (data?.sleep?.slice(-7) ?? []).map((x) => x.total_seconds).filter((x): x is number => !!x); return s.length ? `${(s.reduce((a, b) => a + b, 0) / s.length / 3600).toFixed(1)} t` : "—"; })() },
                  { k: "Snitt 30d", v: (() => { const s = (data?.sleep ?? []).map((x) => x.total_seconds).filter((x): x is number => !!x); return s.length ? `${(s.reduce((a, b) => a + b, 0) / s.length / 3600).toFixed(1)} t` : "—"; })() },
                ]}
                chart={sparkBar(
                  (data?.sleep ?? []).map((s) => ({ day: s.day, hours: s.total_seconds ? s.total_seconds / 3600 : null })),
                  "hours",
                )} />
              <Tile icon={<Scale size={14} />} label="Vekt"
                value={today?.weight_kg ?? null} prev={yesterday?.weight_kg ?? null}
                unit=" kg" digits={1} lowerIsBetter
                fallbackSub="ingen veiing i dag"
                showDetails={showDetails}
                details={(() => {
                  const ws = (data?.daily ?? []).map((d) => d.weight_kg).filter((x): x is number => x != null);
                  const first = ws[0];
                  const last = ws[ws.length - 1];
                  const min = ws.length ? Math.min(...ws) : null;
                  const max = ws.length ? Math.max(...ws) : null;
                  const trend = first != null && last != null ? last - first : null;
                  return [
                    { k: "Snitt 30d", v: avgFmt(ws, 1, " kg") },
                    { k: "Min 30d", v: min != null ? `${min.toFixed(1)} kg` : "—" },
                    { k: "Max 30d", v: max != null ? `${max.toFixed(1)} kg` : "—" },
                    { k: "Trend 30d", v: trend != null ? `${trend > 0 ? "+" : ""}${trend.toFixed(1)} kg` : "—" },
                  ];
                })()}
                chart={sparkLine(data?.daily, "weight_kg", true)} />
              <Tile icon={<Flame size={14} />} label="Kalorier"
                value={today?.total_kilocalories ?? null} prev={yesterday?.total_kilocalories ?? null}
                fmt={fmtNum}
                fallbackSub={today?.active_kilocalories ? `aktive ${fmtNum(today.active_kilocalories)}` : "ingen data"}
                showDetails={showDetails}
                details={[
                  { k: "Total", v: today?.total_kilocalories != null ? `${fmtNum(today.total_kilocalories)} kcal` : "—" },
                  { k: "Aktive", v: today?.active_kilocalories != null ? `${fmtNum(today.active_kilocalories)} kcal` : "—" },
                  { k: "BMR", v: today?.total_kilocalories != null && today?.active_kilocalories != null ? `${fmtNum(today.total_kilocalories - today.active_kilocalories)} kcal` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.total_kilocalories), 0, " kcal") },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.total_kilocalories), 0, " kcal") },
                ]}
                chart={sparkLine2(data?.daily, "total_kilocalories", "active_kilocalories")} />
            </div>


            {/* Grafer (skjult som default) */}
            <button
              onClick={() => setShowCharts((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showCharts ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {showCharts ? "Skjul grafer" : "Vis grafer"}
            </button>

            {showCharts && data && data.daily.length > 0 && (
              <div className="space-y-3">
                <ChartCard title="Skritt siste 30 dager">
                  <BarChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                    <Bar dataKey="steps" fill="var(--chart-yellow)" radius={[2,2,0,0]} />
                  </BarChart>
                </ChartCard>

                <div className="grid md:grid-cols-2 gap-3">
                  <ChartCard title="Snitt puls (bpm)" height={140}>
                    <LineChart data={data.daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="average_heart_rate" stroke="var(--chart-yellow)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="resting_heart_rate" stroke="var(--chart-yellow-soft)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartCard>
                  <ChartCard title="Body battery (høy/lav)" height={140}>
                    <LineChart data={data.daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="body_battery_high" stroke="var(--chart-yellow)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="body_battery_low" stroke="var(--chart-yellow-soft)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartCard>
                  <ChartCard title="Stress (snitt)" height={140}>
                    <LineChart data={data.daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="stress_average" stroke="var(--chart-yellow)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartCard>
                  <ChartCard title="Intensitetsminutter" height={140}>
                    <BarChart data={data.daily.map((d) => ({ ...d, total_intensity: (d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0) }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Bar dataKey="total_intensity" fill="var(--chart-yellow)" radius={[2,2,0,0]} />
                    </BarChart>
                  </ChartCard>
                  <ChartCard title="Vekt (kg)" height={140}>
                    <LineChart data={data.daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="weight_kg" stroke="var(--chart-yellow)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    </LineChart>
                  </ChartCard>
                  <ChartCard title="Kalorier (aktive)" height={140}>
                    <LineChart data={data.daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="active_kilocalories" stroke="var(--chart-yellow)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartCard>
                </div>

                {data.sleep.length > 0 && (
                  <ChartCard title={<span className="flex items-center gap-1"><Moon size={12} /> Søvn (timer per natt — siste 14) + score</span>}>
                    <BarChart data={data.sleep.slice(-14).map((s) => ({
                      day: s.day,
                      deep: (s.deep_seconds ?? 0) / 3600,
                      light: (s.light_seconds ?? 0) / 3600,
                      rem: (s.rem_seconds ?? 0) / 3600,
                      awake: (s.awake_seconds ?? 0) / 3600,
                      score: s.sleep_score,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="deep" stackId="a" fill="var(--chart-yellow)" />
                      <Bar yAxisId="left" dataKey="light" stackId="a" fill="var(--chart-yellow-soft)" />
                      <Bar yAxisId="left" dataKey="rem" stackId="a" fill="var(--chart-yellow-faint)" />
                      <Bar yAxisId="left" dataKey="awake" stackId="a" fill="color-mix(in oklab, var(--muted-foreground) 40%, transparent)" />
                      <Line yAxisId="right" type="monotone" dataKey="score" stroke="var(--chart-yellow)" strokeWidth={2} dot={{ r: 3 }} />
                    </BarChart>
                  </ChartCard>
                )}
              </div>
            )}

            {/* Aktiviteter (skjult som default) */}
            {data && data.activities.length > 0 && (
              <>
                <button
                  onClick={() => setShowActivities((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showActivities ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {showActivities ? "Skjul siste aktiviteter" : `Vis siste aktiviteter (${data.activities.length})`}
                </button>
                {showActivities && (
                  <div className="rounded border border-border/60 bg-background/40 p-3">
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

function Tile({
  icon, label, value, prev, unit = "", digits = 0, fmt, lowerIsBetter = false, fallbackSub,
  showDetails = false, details, chart,
}: {
  icon: React.ReactNode; label: string;
  value: number | null; prev?: number | null;
  unit?: string; digits?: number;
  fmt?: (n: number | null | undefined) => string;
  lowerIsBetter?: boolean; fallbackSub?: string;
  showDetails?: boolean; details?: Array<{ k: string; v: string }>;
  chart?: React.ReactNode;
}) {
  const formatVal = (n: number | null | undefined): string => {
    if (n == null) return "—";
    if (fmt) return fmt(n);
    return n.toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? digits : 0 }) + unit;
  };

  let trend: React.ReactNode = null;
  if (value != null && prev != null) {
    const diff = value - prev;
    const eps = digits > 0 ? Math.pow(10, -digits) / 2 : 0.5;
    if (Math.abs(diff) < eps) {
      trend = <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus size={10} /> i går: {formatVal(prev)}</span>;
    } else {
      const isUp = diff > 0;
      const isGood = lowerIsBetter ? !isUp : isUp;
      const cls = isGood ? "text-emerald-500" : "text-rose-400";
      trend = (
        <span className={`inline-flex items-center gap-0.5 ${cls}`}>
          {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          i går: {formatVal(prev)}
        </span>
      );
    }
  }

  return (
    <div className="rounded border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-1">{formatVal(value)}</div>
      <div className="text-[10px] mt-0.5">
        {trend ?? (value == null && fallbackSub ? <span className="text-muted-foreground">{fallbackSub}</span> : null)}
      </div>
      {showDetails && details && details.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/40 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
          {details.map((d) => (
            <div key={d.k} className="flex justify-between gap-1">
              <span className="text-muted-foreground truncate">{d.k}</span>
              <span className="tabular-nums font-medium">{d.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children, height = 160 }: { title: React.ReactNode; children: React.ReactElement; height?: number }) {
  return (
    <div className="rounded border border-border/60 bg-background/40 p-3">
      <div className="text-xs text-muted-foreground mb-2">{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function sparkBar<T extends Record<string, unknown>>(data: T[] | undefined, key: keyof T): React.ReactElement | null {
  if (!data || !data.some((d) => typeof d[key] === "number" && (d[key] as number) > 0)) return null;
  return (
    <BarChart data={data as Array<Record<string, unknown>>}>
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} labelFormatter={(v) => String(v).slice(5)} />
      <XAxis dataKey="day" hide />
      <YAxis hide />
      <Bar dataKey={key as string} fill="var(--chart-yellow)" radius={[2,2,0,0]} />
    </BarChart>
  );
}

function sparkLine<T extends Record<string, unknown>>(data: T[] | undefined, key: keyof T, connectNulls = false): React.ReactElement | null {
  if (!data || !data.some((d) => typeof d[key] === "number" && (d[key] as number) > 0)) return null;
  return (
    <LineChart data={data as Array<Record<string, unknown>>}>
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} labelFormatter={(v) => String(v).slice(5)} />
      <XAxis dataKey="day" hide />
      <YAxis hide domain={["auto", "auto"]} />
      <Line type="monotone" dataKey={key as string} stroke="var(--chart-yellow)" strokeWidth={1.5} dot={false} connectNulls={connectNulls} />
    </LineChart>
  );
}

function sparkLine2<T extends Record<string, unknown>>(data: T[] | undefined, k1: keyof T, k2: keyof T): React.ReactElement | null {
  if (!data || !data.some((d) => typeof d[k1] === "number" || typeof d[k2] === "number")) return null;
  return (
    <LineChart data={data as Array<Record<string, unknown>>}>
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} labelFormatter={(v) => String(v).slice(5)} />
      <XAxis dataKey="day" hide />
      <YAxis hide domain={["auto", "auto"]} />
      <Line type="monotone" dataKey={k1 as string} stroke="var(--chart-yellow)" strokeWidth={1.5} dot={false} />
      <Line type="monotone" dataKey={k2 as string} stroke="var(--chart-yellow-soft)" strokeWidth={1.5} dot={false} />
    </LineChart>
  );
}
