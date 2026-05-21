import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Footprints, Heart, HeartPulse, Flame, Moon, RefreshCw, LogIn, Loader2, TrendingUp, ShieldCheck, Battery, Brain, Timer, Scale, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Minus, Building2, Wind, Droplets, Waves, Award, Gauge, Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { getGarminOverview, garminLoginNow, garminSyncNow, garminSubmitMfaCode, listGarminDevices, setDefaultGarminDevice } from "@/server/garmin.functions";
import { Check } from "lucide-react";
import { getStoredWho, isCurrentlySubscribed } from "@/lib/push-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSceneMarquee } from "@/hooks/use-scene-marquee";

type Daily = {
  day: string; steps: number | null; step_goal: number | null;
  floors_climbed: number | null; resting_heart_rate: number | null;
  average_heart_rate: number | null; weight_kg: number | null;
  total_kilocalories: number | null; active_kilocalories: number | null;
  distance_meters: number | null; moderate_intensity_minutes: number | null;
  vigorous_intensity_minutes: number | null; intensity_minutes_goal: number | null;
  body_battery_high: number | null; body_battery_low: number | null;
  stress_average: number | null;
  vo2max_running?: number | null; vo2max_cycling?: number | null;
  endurance_score?: number | null; fitness_age?: number | null;
  training_status?: string | null;
  training_load_focus?: {
    aerobic_low?: number | null; aerobic_high?: number | null; anaerobic?: number | null;
    feedback?: string | null;
    aerobic_low_target?: [number, number] | null;
    aerobic_high_target?: [number, number] | null;
    anaerobic_target?: [number, number] | null;
  } | null;
  endurance_contributors?: Array<{ group: string; contribution: number }> | null;
};
type Activity = {
  garmin_activity_id: number; activity_type: string | null; activity_name: string | null;
  start_time_local: string; duration_seconds: number | null; distance_meters: number | null;
  calories: number | null; average_hr: number | null; max_hr: number | null;
};
type Sleep = { day: string; total_seconds: number | null; deep_seconds: number | null; light_seconds: number | null; rem_seconds: number | null; awake_seconds: number | null; sleep_score: number | null; average_spo2: number | null; average_respiration: number | null; hrv_avg: number | null };
type Intraday = { day: string; hour: number; heart_rate_avg: number | null; heart_rate_max: number | null; stress_avg: number | null; body_battery: number | null };
type Overview = {
  status: { connected: boolean; username: string | null; expires_at: string | null; last_login_at: string | null; mfa_pending?: boolean; device_name?: string | null; device_image_url?: string | null };
  daily: Daily[]; activities: Activity[]; sleep: Sleep[]; intraday?: Intraday[];
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
function nums(arr: Array<number | null | undefined> | undefined): number[] {
  return (arr ?? []).filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
}
function minFmt(arr: Array<number | null | undefined> | undefined, digits = 0, unit = ""): string {
  const v = nums(arr); if (!v.length) return "—";
  return Math.min(...v).toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? digits : 0 }) + unit;
}
function maxFmt(arr: Array<number | null | undefined> | undefined, digits = 0, unit = ""): string {
  const v = nums(arr); if (!v.length) return "—";
  return Math.max(...v).toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? digits : 0 }) + unit;
}
function sumFmt(arr: Array<number | null | undefined> | undefined, digits = 0, unit = ""): string {
  const v = (arr ?? []).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!v.length) return "—";
  return v.reduce((a, b) => a + b, 0).toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? digits : 0 }) + unit;
}
function trendFmt(arr: Array<number | null | undefined> | undefined, digits = 1, unit = ""): string {
  const v = nums(arr); if (v.length < 2) return "—";
  const d = v[v.length - 1] - v[0];
  return `${d > 0 ? "+" : ""}${d.toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: digits > 0 ? digits : 0 })}${unit}`;
}
function countFmt(arr: Array<number | null | undefined> | undefined): string {
  return String(nums(arr).length);
}

type ChartPeriod = "today" | "yesterday" | "thisWeek" | "lastWeek" | "last30" | "thisMonth";

// Garmin-aktige farger per metrikk (matcher Connect-grafene)
const C = {
  steps: "#4FB3F0",
  hr: "#E84855",
  hrAvg: "#FF6F61",
  hrMax: "#C81D25",
  floors: "#F08C2E",
  batteryHigh: "#2EBF6F",
  batteryLow: "#F4B61A",
  stress: "#F4B61A",
  intensity: "#7DCB3D",
  weight: "#9CA3AF",
  sleepDeep: "#1F3A93",
  sleepLight: "#5B6CE0",
  sleepRem: "#9C5BD9",
  sleepAwake: "#F08C2E",
  sleep: "#5B6CE0",
  spo2: "#3E8FE0",
  hrv: "#9C5BD9",
  respiration: "#3DB7C9",
  caloriesTotal: "#E8743C",
  caloriesActive: "#F4B61A",
} as const;

function isSingleDay(p: ChartPeriod) { return p === "today" || p === "yesterday"; }

function filterPeriod<T extends { day: string }>(arr: T[] | undefined, period: ChartPeriod): T[] {
  if (!arr || !arr.length) return [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (period === "today") {
    return arr.filter((x) => x.day === fmt(today));
  }
  if (period === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return arr.filter((x) => x.day === fmt(y));
  }
  if (period === "thisWeek") {
    const dow = (today.getDay() + 6) % 7;
    const start = new Date(today); start.setDate(start.getDate() - dow);
    return arr.filter((x) => x.day >= fmt(start));
  }
  if (period === "lastWeek") {
    const dow = (today.getDay() + 6) % 7;
    const start = new Date(today); start.setDate(start.getDate() - dow - 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return arr.filter((x) => x.day >= fmt(start) && x.day <= fmt(end));
  }
  if (period === "thisMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return arr.filter((x) => x.day >= fmt(start));
  }
  const start = new Date(today); start.setDate(start.getDate() - 29);
  return arr.filter((x) => x.day >= fmt(start));
}

function withTrend<T extends Record<string, unknown>>(data: T[], key: string): Array<T & { _trend: number | null }> {
  const pts: Array<{ i: number; v: number }> = [];
  data.forEach((d, i) => { const v = d[key]; if (typeof v === "number") pts.push({ i, v }); });
  if (pts.length < 2) return data.map((d) => ({ ...d, _trend: null }));
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.i, 0);
  const sy = pts.reduce((a, p) => a + p.v, 0);
  const sxy = pts.reduce((a, p) => a + p.i * p.v, 0);
  const sxx = pts.reduce((a, p) => a + p.i * p.i, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return data.map((d) => ({ ...d, _trend: null }));
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return data.map((d, i) => ({ ...d, _trend: slope * i + intercept }));
}

function renderBar<T extends Record<string, unknown> & { day?: string }>(data: T[], key: string, showTrend: boolean, color: string = C.steps): React.ReactElement {
  const d = showTrend ? withTrend(data, key) : data;
  return (
    <BarChart data={d as Array<Record<string, unknown>>}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => String(v).slice(5)} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
      <Bar dataKey={key} fill={color} radius={[2, 2, 0, 0]} />
      {showTrend && <Line type="monotone" dataKey="_trend" stroke={color} strokeOpacity={0.45} strokeWidth={2} strokeDasharray="4 3" dot={false} />}
    </BarChart>
  );
}

function renderLine<T extends Record<string, unknown> & { day?: string }>(data: T[], key: string, showTrend: boolean, connectNulls = false, color: string = C.hr): React.ReactElement {
  const d = showTrend ? withTrend(data, key) : data;
  return (
    <LineChart data={d as Array<Record<string, unknown>>}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => String(v).slice(5)} />
      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
      <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 2 }} connectNulls={connectNulls} />
      {showTrend && <Line type="monotone" dataKey="_trend" stroke={color} strokeOpacity={0.45} strokeWidth={2} strokeDasharray="4 3" dot={false} />}
    </LineChart>
  );
}

function renderLine2<T extends Record<string, unknown> & { day?: string }>(data: T[], k1: string, k2: string, showTrend: boolean, color1: string = C.batteryHigh, color2: string = C.batteryLow): React.ReactElement {
  const d = showTrend ? withTrend(data, k1) : data;
  return (
    <LineChart data={d as Array<Record<string, unknown>>}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
      <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => String(v).slice(5)} />
      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
      <Line type="monotone" dataKey={k1} stroke={color1} strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey={k2} stroke={color2} strokeWidth={2} dot={false} />
      {showTrend && <Line type="monotone" dataKey="_trend" stroke={color1} strokeOpacity={0.4} strokeWidth={2} strokeDasharray="4 3" dot={false} />}
    </LineChart>
  );
}

// Time-for-time bars for én dag (basert på aktiviteter eller datapoint pr. time)
function renderHourBar(items: Array<{ hour: number; value: number | null }>, color: string, unit = ""): React.ReactElement {
  return (
    <BarChart data={items}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
      <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h: number) => `${String(h).padStart(2, "0")}`} interval={1} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip
        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
        labelFormatter={(h) => `kl ${String(h).padStart(2, "0")}:00`}
        formatter={(v: number) => [`${v}${unit}`, ""]}
      />
      <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
    </BarChart>
  );
}

type GarminOwner = "arne" | "rebekka";
export function GarminPanel({ owner = "arne", displayName = "Arne" }: { owner?: GarminOwner; displayName?: string } = {}) {
  const fetchOverview = useServerFn(getGarminOverview);
  const loginFn = useServerFn(garminLoginNow);
  const syncFn = useServerFn(garminSyncNow);
  const mfaFn = useServerFn(garminSubmitMfaCode);
  const listDevicesFn = useServerFn(listGarminDevices);
  const setDefaultDeviceFn = useServerFn(setDefaultGarminDevice);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"login" | "sync" | "mfa" | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [showActivities, setShowActivities] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("last30");
  const [showTrend, setShowTrend] = useState(false);
  const [weightAllowed, setWeightAllowed] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; product_id: string; name: string; image_url: string | null; is_default: boolean; last_used_at: string | null; register_date: string | null }>>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function updateWeightAccess() {
      const selectedWho = getStoredWho();
      const subscribed = await isCurrentlySubscribed();
      if (cancelled) return;
      setWeightAllowed(subscribed && (selectedWho === "Arne" || selectedWho === "Rebekka"));
    }
    void updateWeightAccess();
    window.addEventListener("focus", updateWeightAccess);
    window.addEventListener("storage", updateWeightAccess);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", updateWeightAccess);
      window.removeEventListener("storage", updateWeightAccess);
    };
  }, []);

  const load = async () => {
    setLoading(true);
    try { setData(await fetchOverview({ data: { owner } }) as Overview); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [owner]);

  const openDevices = async () => {
    setDevicesOpen(true);
    setDevicesLoading(true);
    try {
      const r = await listDevicesFn({ data: { owner } }) as { devices: typeof devices };
      setDevices(r.devices ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDevicesLoading(false);
    }
  };

  const chooseDefault = async (deviceId: string) => {
    setSettingDefault(deviceId);
    try {
      await setDefaultDeviceFn({ data: { owner, deviceId } });
      toast.success("Standardklokke oppdatert");
      const r = await listDevicesFn({ data: { owner } }) as { devices: typeof devices };
      setDevices(r.devices ?? []);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSettingDefault(null);
    }
  };

  const handleLogin = async () => {
    if (data?.status.connected) {
      const ok = window.confirm(
        `Er du sikker på at du vil re-logge inn på Garmin for ${displayName}? Bør kun gjøres hvis brukeren ikke synker mer.`,
      );
      if (!ok) return;
    }
    setWorking("login");
    try {
      const r = await loginFn({ data: { owner } }) as GarminLoginResult;
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
      await mfaFn({ data: { code: mfaCode, owner } });
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

  // Siste kjente vekt (uansett dag) — vises alltid
  const latestWeightEntry = (() => {
    const arr = (data?.daily ?? []).filter((d) => d.weight_kg != null);
    return arr.length ? arr[arr.length - 1] : undefined;
  })();
  const prevWeightEntry = (() => {
    const arr = (data?.daily ?? []).filter((d) => d.weight_kg != null);
    return arr.length >= 2 ? arr[arr.length - 2] : undefined;
  })();
  // Siste kjente sleep-baserte målinger
  const lastSpo2Entry = (data?.sleep ?? []).slice().reverse().find((s) => s.average_spo2 != null);
  const prevSpo2Entry = (() => {
    const arr = (data?.sleep ?? []).filter((s) => s.average_spo2 != null);
    return arr.length >= 2 ? arr[arr.length - 2] : undefined;
  })();
  const lastRespEntry = (data?.sleep ?? []).slice().reverse().find((s) => s.average_respiration != null);
  const prevRespEntry = (() => {
    const arr = (data?.sleep ?? []).filter((s) => s.average_respiration != null);
    return arr.length >= 2 ? arr[arr.length - 2] : undefined;
  })();
  const lastHrvEntry = (data?.sleep ?? []).slice().reverse().find((s) => s.hrv_avg != null);
  const prevHrvEntry = (() => {
    const arr = (data?.sleep ?? []).filter((s) => s.hrv_avg != null);
    return arr.length >= 2 ? arr[arr.length - 2] : undefined;
  })();

  const todayDay = today?.day;
  const todaysActs = data?.activities?.filter((a) => a.start_time_local.slice(0, 10) === todayDay) ?? [];
  const yesterdayDay = yesterday?.day;
  const yesterdaysActs = data?.activities?.filter((a) => a.start_time_local.slice(0, 10) === yesterdayDay) ?? [];
  const maxHrToday = todaysActs.reduce((m, a) => Math.max(m, a.max_hr ?? 0), 0) || null;
  const maxHrYesterday = yesterdaysActs.reduce((m, a) => Math.max(m, a.max_hr ?? 0), 0) || null;

  return (
    <section className="container mx-auto px-2 sm:px-4 pb-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
            <Activity size={16} />
            <span>Garmin — {displayName}</span>
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
              onClick={async () => { setWorking("sync"); try { const r = await syncFn({ data: { owner } }); if ("results" in r) { const tot = r.results.reduce((a, x) => ({ d: a.d + x.daily, a: a.a + x.activities, s: a.s + x.sleep }), { d: 0, a: 0, s: 0 }); r.ok ? toast.success(`Synket: ${tot.d} dager, ${tot.a} aktiviteter, ${tot.s} søvn`) : toast.error("Sync feilet for én eller flere brukere"); } else { r.ok ? toast.success(`Synket: ${r.daily} dager, ${r.activities} aktiviteter, ${r.sleep} søvn`) : toast.error(r.error || "Sync feilet"); } await load(); } catch (e) { toast.error((e as Error).message); } finally { setWorking(null); } }}
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
              <Tile icon={<Footprints size={14} style={{color: C.steps}} />} label="Skritt i dag"
                value={today?.steps ?? null} prev={yesterday?.steps ?? null}
                fmt={fmtNum} fallbackSub={today?.step_goal ? `mål ${fmtNum(today.step_goal)}` : "ingen data"}
                showDetails={showDetails}
                details={[
                  { k: "Mål", v: today?.step_goal ? fmtNum(today.step_goal) : "—" },
                  { k: "Igjen", v: today?.steps != null && today?.step_goal ? fmtNum(Math.max(0, today.step_goal - today.steps)) : "—" },
                  { k: "% av mål", v: today?.steps != null && today?.step_goal ? `${Math.round((today.steps / today.step_goal) * 100)}%` : "—" },
                  { k: "Distanse i dag", v: fmtKm(today?.distance_meters) },
                  { k: "I går", v: yesterday?.steps != null ? fmtNum(yesterday.steps) : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.steps), 0) },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.steps), 0) },
                  { k: "Min 30d", v: minFmt(data?.daily?.map((d) => d.steps), 0) },
                  { k: "Beste 30d", v: maxFmt(data?.daily?.map((d) => d.steps), 0) },
                  { k: "Sum 7d", v: sumFmt(data?.daily?.slice(-7).map((d) => d.steps), 0) },
                  { k: "Sum 30d", v: sumFmt(data?.daily?.map((d) => d.steps), 0) },
                  { k: "Distanse 7d", v: (() => { const m = (data?.daily?.slice(-7) ?? []).reduce((a, d) => a + (d.distance_meters ?? 0), 0); return m > 0 ? `${(m/1000).toFixed(1)} km` : "—"; })() },
                  { k: "Distanse 30d", v: (() => { const m = (data?.daily ?? []).reduce((a, d) => a + (d.distance_meters ?? 0), 0); return m > 0 ? `${(m/1000).toFixed(1)} km` : "—"; })() },
                  { k: "Mål nådd 7d", v: String((data?.daily?.slice(-7) ?? []).filter((d) => d.steps != null && d.step_goal != null && d.steps >= d.step_goal).length) },
                  { k: "Mål nådd 30d", v: String((data?.daily ?? []).filter((d) => d.steps != null && d.step_goal != null && d.steps >= d.step_goal).length) },
                  { k: "Trend 30d", v: trendFmt(data?.daily?.map((d) => d.steps), 0) },
                ]}
                chart={sparkBar(data?.daily, "steps", C.steps)} />
              <Tile icon={<HeartPulse size={14} style={{color: C.hr}} />} label="Hvilepuls"
                value={today?.resting_heart_rate ?? null} prev={yesterday?.resting_heart_rate ?? null}
                unit=" bpm" lowerIsBetter fallbackSub="ingen måling i dag"
                showDetails={showDetails}
                details={[
                  { k: "I dag", v: today?.resting_heart_rate != null ? `${today.resting_heart_rate} bpm` : "—" },
                  { k: "I går", v: yesterday?.resting_heart_rate != null ? `${yesterday.resting_heart_rate} bpm` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.resting_heart_rate), 0, " bpm") },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.resting_heart_rate), 0, " bpm") },
                  { k: "Lavest 30d", v: minFmt(data?.daily?.map((d) => d.resting_heart_rate), 0, " bpm") },
                  { k: "Høyest 30d", v: maxFmt(data?.daily?.map((d) => d.resting_heart_rate), 0, " bpm") },
                  { k: "Trend 30d", v: trendFmt(data?.daily?.map((d) => d.resting_heart_rate), 0, " bpm") },
                  { k: "Målinger 30d", v: countFmt(data?.daily?.map((d) => d.resting_heart_rate)) },
                ]}
                chart={sparkLine(data?.daily, "resting_heart_rate", false, C.hr)} />
              <Tile icon={<Heart size={14} style={{color: C.hrAvg}} />} label="Snitt puls"
                value={today?.average_heart_rate ?? null} prev={yesterday?.average_heart_rate ?? null}
                unit=" bpm" fallbackSub="ingen måling i dag"
                showDetails={showDetails}
                details={[
                  { k: "I dag", v: today?.average_heart_rate != null ? `${today.average_heart_rate} bpm` : "—" },
                  { k: "I går", v: yesterday?.average_heart_rate != null ? `${yesterday.average_heart_rate} bpm` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.average_heart_rate), 0, " bpm") },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.average_heart_rate), 0, " bpm") },
                  { k: "Min 30d", v: minFmt(data?.daily?.map((d) => d.average_heart_rate), 0, " bpm") },
                  { k: "Max 30d", v: maxFmt(data?.daily?.map((d) => d.average_heart_rate), 0, " bpm") },
                  { k: "Trend 30d", v: trendFmt(data?.daily?.map((d) => d.average_heart_rate), 0, " bpm") },
                ]}
                chart={sparkLine(data?.daily, "average_heart_rate", false, C.hrAvg)} />
              <Tile icon={<TrendingUp size={14} style={{color: C.hrMax}} />} label="Maks puls"
                value={maxHrToday} prev={maxHrYesterday}
                unit=" bpm" fallbackSub="ingen aktivitet i dag"
                showDetails={showDetails}
                details={[
                  { k: "I dag", v: maxHrToday ? `${maxHrToday} bpm` : "—" },
                  { k: "I går", v: maxHrYesterday ? `${maxHrYesterday} bpm` : "—" },
                  { k: "Aktiviteter i dag", v: String(todaysActs.length) },
                  { k: "Aktiviteter i går", v: String(yesterdaysActs.length) },
                  { k: "Snitt maks", v: avgFmt(data?.activities?.map((a) => a.max_hr), 0, " bpm") },
                  { k: "Topp 30d", v: (() => { const top = data?.activities?.reduce((m, a) => Math.max(m, a.max_hr ?? 0), 0) ?? 0; return top ? `${top} bpm` : "—"; })() },
                  { k: "Aktiviteter 30d", v: String((data?.activities ?? []).length) },
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
                  false, C.hrMax,
                )} />
              <Tile icon={<Building2 size={14} style={{color: C.floors}} />} label="Trapper"
                value={today?.floors_climbed ?? null} prev={yesterday?.floors_climbed ?? null}
                fmt={fmtNum}
                fallbackSub="ingen data"
                showDetails={showDetails}
                details={[
                  { k: "I dag", v: today?.floors_climbed != null ? fmtNum(today.floors_climbed) : "—" },
                  { k: "I går", v: yesterday?.floors_climbed != null ? fmtNum(yesterday.floors_climbed) : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.floors_climbed), 0) },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.floors_climbed), 0) },
                  { k: "Beste 30d", v: maxFmt(data?.daily?.map((d) => d.floors_climbed), 0) },
                  { k: "Sum 7d", v: sumFmt(data?.daily?.slice(-7).map((d) => d.floors_climbed), 0) },
                  { k: "Sum 30d", v: sumFmt(data?.daily?.map((d) => d.floors_climbed), 0) },
                  { k: "Trend 30d", v: trendFmt(data?.daily?.map((d) => d.floors_climbed), 0) },
                ]}
                chart={sparkBar(data?.daily, "floors_climbed", C.floors)} />
              <Tile icon={<Battery size={14} style={{color: C.batteryHigh}} />} label="Body battery"
                value={today?.body_battery_high ?? null} prev={yesterday?.body_battery_high ?? null}
                fallbackSub={today?.body_battery_low != null ? `lav ${today.body_battery_low}` : "ingen data"}
                showDetails={showDetails}
                details={[
                  { k: "Høy i dag", v: today?.body_battery_high != null ? String(today.body_battery_high) : "—" },
                  { k: "Lav i dag", v: today?.body_battery_low != null ? String(today.body_battery_low) : "—" },
                  { k: "Ladet i dag", v: today?.body_battery_high != null && today?.body_battery_low != null ? `+${today.body_battery_high - today.body_battery_low}` : "—" },
                  { k: "Høy i går", v: yesterday?.body_battery_high != null ? String(yesterday.body_battery_high) : "—" },
                  { k: "Lav i går", v: yesterday?.body_battery_low != null ? String(yesterday.body_battery_low) : "—" },
                  { k: "Snitt høy 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.body_battery_high), 0) },
                  { k: "Snitt lav 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.body_battery_low), 0) },
                  { k: "Snitt høy 30d", v: avgFmt(data?.daily?.map((d) => d.body_battery_high), 0) },
                  { k: "Snitt lav 30d", v: avgFmt(data?.daily?.map((d) => d.body_battery_low), 0) },
                  { k: "Maks høy 30d", v: maxFmt(data?.daily?.map((d) => d.body_battery_high), 0) },
                  { k: "Min lav 30d", v: minFmt(data?.daily?.map((d) => d.body_battery_low), 0) },
                ]}
                chart={sparkLine2(data?.daily, "body_battery_high", "body_battery_low", C.batteryHigh, C.batteryLow)} />
              <Tile icon={<Brain size={14} style={{color: C.stress}} />} label="Stress (snitt)"
                value={today?.stress_average ?? null} prev={yesterday?.stress_average ?? null}
                lowerIsBetter fallbackSub="ingen måling"
                showDetails={showDetails}
                details={[
                  { k: "Snitt i dag", v: today?.stress_average != null ? String(today.stress_average) : "—" },
                  { k: "Nivå i dag", v: stressLevel(today?.stress_average) },
                  { k: "I går", v: yesterday?.stress_average != null ? String(yesterday.stress_average) : "—" },
                  { k: "Nivå i går", v: stressLevel(yesterday?.stress_average) },
                  { k: "Snitt 7d", v: avgFmt(data?.daily?.slice(-7).map((d) => d.stress_average), 0) },
                  { k: "Snitt 30d", v: avgFmt(data?.daily?.map((d) => d.stress_average), 0) },
                  { k: "Lavest 30d", v: minFmt(data?.daily?.map((d) => d.stress_average), 0) },
                  { k: "Høyest 30d", v: maxFmt(data?.daily?.map((d) => d.stress_average), 0) },
                  { k: "Trend 30d", v: trendFmt(data?.daily?.map((d) => d.stress_average), 0) },
                ]}
                chart={sparkLine(data?.daily, "stress_average", false, C.stress)} />
              <Tile icon={<Timer size={14} style={{color: C.intensity}} />} label="Intensitetsmin."
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
                  "total_intensity", C.intensity,
                )} />
              <Tile icon={<Moon size={14} style={{color: C.sleep}} />} label="Søvn"
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
                  "hours", C.sleep,
                )} />
              <Tile icon={<Award size={14} style={{color: C.sleepRem}} />} label="Søvnscore"
                value={lastSleep?.sleep_score ?? null}
                prev={prevSleep?.sleep_score ?? null}
                fallbackSub="ingen score i natt"
                showDetails={showDetails}
                details={[
                  { k: "I natt", v: lastSleep?.sleep_score != null ? String(lastSleep.sleep_score) : "—" },
                  { k: "Forrige natt", v: prevSleep?.sleep_score != null ? String(prevSleep.sleep_score) : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.sleep?.slice(-7).map((s) => s.sleep_score), 0) },
                  { k: "Snitt 30d", v: avgFmt(data?.sleep?.map((s) => s.sleep_score), 0) },
                  { k: "Beste 30d", v: (() => { const ss = (data?.sleep ?? []).map((s) => s.sleep_score).filter((x): x is number => x != null); return ss.length ? String(Math.max(...ss)) : "—"; })() },
                ]}
                chart={sparkLine(
                  (data?.sleep ?? []).map((s) => ({ day: s.day, score: s.sleep_score })),
                  "score", false, C.sleepRem,
                )} />
              {(() => {
                const latestFit = (data?.daily ?? []).slice().reverse().find((d) => d.vo2max_running != null || d.vo2max_cycling != null || d.endurance_score != null);
                const prevFit = (() => {
                  const arr = (data?.daily ?? []).filter((d) => d.vo2max_running != null);
                  return arr.length >= 2 ? arr[arr.length - 2] : undefined;
                })();
                return (
                  <Tile icon={<Gauge size={14} style={{color: C.intensity}} />} label="Kondisjon (VO₂max)"
                    value={latestFit?.vo2max_running ?? null}
                    prev={prevFit?.vo2max_running ?? null}
                    digits={1}
                    fallbackSub={latestFit?.endurance_score != null ? `utholdenhet ${Math.round(latestFit.endurance_score)}` : "ingen måling"}
                    showDetails={showDetails}
                    details={[
                      { k: "Løping", v: latestFit?.vo2max_running != null ? `${latestFit.vo2max_running.toFixed(1)} ml/kg/min` : "—" },
                      { k: "Sykling", v: latestFit?.vo2max_cycling != null ? `${latestFit.vo2max_cycling.toFixed(1)} ml/kg/min` : "—" },
                      { k: "Utholdenhetspoeng", v: latestFit?.endurance_score != null ? String(Math.round(latestFit.endurance_score)) : "—" },
                      { k: "Kondisjonsalder", v: latestFit?.fitness_age != null ? `${Math.round(latestFit.fitness_age)} år` : "—" },
                      { k: "Sist oppdatert", v: latestFit?.day ?? "—" },
                    ]}
                    chart={sparkLine(data?.daily, "vo2max_running", true, C.intensity)} />
                );
              })()}
              {weightAllowed && (
              <Tile icon={<Scale size={14} style={{color: C.weight}} />} label="Vekt"
                value={latestWeightEntry?.weight_kg ?? null} prev={prevWeightEntry?.weight_kg ?? null}
                unit=" kg" digits={1} lowerIsBetter
                fallbackSub={latestWeightEntry?.day ? `siste veiing ${latestWeightEntry.day.slice(5)}` : "ingen veiing"}
                showDetails={showDetails}
                details={(() => {
                  const ws = (data?.daily ?? []).map((d) => d.weight_kg).filter((x): x is number => x != null);
                  const first = ws[0];
                  const last = ws[ws.length - 1];
                  const min = ws.length ? Math.min(...ws) : null;
                  const max = ws.length ? Math.max(...ws) : null;
                  const trend = first != null && last != null ? last - first : null;
                  return [
                    { k: "Siste veiing", v: latestWeightEntry?.day ?? "—" },
                    { k: "Snitt 30d", v: avgFmt(ws, 1, " kg") },
                    { k: "Min 30d", v: min != null ? `${min.toFixed(1)} kg` : "—" },
                    { k: "Max 30d", v: max != null ? `${max.toFixed(1)} kg` : "—" },
                    { k: "Trend 30d", v: trend != null ? `${trend > 0 ? "+" : ""}${trend.toFixed(1)} kg` : "—" },
                  ];
                })()}
                chart={sparkLine(data?.daily, "weight_kg", true, C.weight)} />
              )}
              <Tile icon={<Droplets size={14} style={{color: C.spo2}} />} label="Pulsoksygen (SpO₂)"
                value={lastSpo2Entry?.average_spo2 ?? null} prev={prevSpo2Entry?.average_spo2 ?? null}
                unit=" %" digits={0}
                fallbackSub="ingen måling"
                showDetails={showDetails}
                details={[
                  { k: "Siste natt", v: lastSpo2Entry?.average_spo2 != null ? `${Math.round(lastSpo2Entry.average_spo2)} %` : "—" },
                  { k: "Dato", v: lastSpo2Entry?.day ?? "—" },
                  { k: "Forrige", v: prevSpo2Entry?.average_spo2 != null ? `${Math.round(prevSpo2Entry.average_spo2)} %` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.sleep?.slice(-7).map((s) => s.average_spo2), 0, " %") },
                  { k: "Snitt 30d", v: avgFmt(data?.sleep?.map((s) => s.average_spo2), 0, " %") },
                ]}
                chart={sparkLine(
                  (data?.sleep ?? []).map((s) => ({ day: s.day, spo2: s.average_spo2 })),
                  "spo2", false, C.spo2,
                )} />
              <Tile icon={<Waves size={14} style={{color: C.hrv}} />} label="Pulsvariasjon (HRV)"
                value={lastHrvEntry?.hrv_avg ?? null} prev={prevHrvEntry?.hrv_avg ?? null}
                unit=" ms" digits={0}
                fallbackSub="ingen data"
                showDetails={showDetails}
                details={[
                  { k: "Siste natt", v: lastHrvEntry?.hrv_avg != null ? `${Math.round(lastHrvEntry.hrv_avg)} ms` : "—" },
                  { k: "Dato", v: lastHrvEntry?.day ?? "—" },
                  { k: "Forrige", v: prevHrvEntry?.hrv_avg != null ? `${Math.round(prevHrvEntry.hrv_avg)} ms` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.sleep?.slice(-7).map((s) => s.hrv_avg), 0, " ms") },
                  { k: "Snitt 30d", v: avgFmt(data?.sleep?.map((s) => s.hrv_avg), 0, " ms") },
                ]}
                chart={sparkLine(
                  (data?.sleep ?? []).map((s) => ({ day: s.day, hrv: s.hrv_avg })),
                  "hrv", false, C.hrv,
                )} />
              <Tile icon={<Wind size={14} style={{color: C.respiration}} />} label="Pusting (snitt)"
                value={lastRespEntry?.average_respiration ?? null} prev={prevRespEntry?.average_respiration ?? null}
                unit=" /min" digits={0}
                fallbackSub="ingen måling"
                showDetails={showDetails}
                details={[
                  { k: "Siste natt", v: lastRespEntry?.average_respiration != null ? `${Math.round(lastRespEntry.average_respiration)} /min` : "—" },
                  { k: "Dato", v: lastRespEntry?.day ?? "—" },
                  { k: "Forrige", v: prevRespEntry?.average_respiration != null ? `${Math.round(prevRespEntry.average_respiration)} /min` : "—" },
                  { k: "Snitt 7d", v: avgFmt(data?.sleep?.slice(-7).map((s) => s.average_respiration), 0, " /min") },
                  { k: "Snitt 30d", v: avgFmt(data?.sleep?.map((s) => s.average_respiration), 0, " /min") },
                ]}
                chart={sparkLine(
                  (data?.sleep ?? []).map((s) => ({ day: s.day, resp: s.average_respiration })),
                  "resp", false, C.respiration,
                )} />
              <Tile icon={<Flame size={14} style={{color: C.caloriesTotal}} />} label="Kalorier"
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
                chart={sparkLine2(data?.daily, "total_kilocalories", "active_kilocalories", C.caloriesTotal, C.caloriesActive)} />
            </div>

            {/* Treningsstatus, kondisjonsalder og belastningsfokus */}
            {(() => {
              const latestFit = (data?.daily ?? []).slice().reverse().find(
                (d) => d.training_status != null || d.training_load_focus != null || d.fitness_age != null,
              );
              if (!latestFit) return null;
              const focus = latestFit.training_load_focus ?? null;
              const fmtRange = (r?: [number, number] | null) => r ? `${Math.round(r[0])}–${Math.round(r[1])}` : "—";
              const Bar = ({ value, target, label, color }: { value: number | null | undefined; target: [number, number] | null | undefined; label: string; color: string }) => {
                const v = value ?? 0;
                const max = Math.max(v, target?.[1] ?? 0, 1);
                const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
                return (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums text-foreground">{value != null ? Math.round(value) : "—"}{target ? ` / ${fmtRange(target)}` : ""}</span>
                    </div>
                    <div className="relative h-2 rounded bg-muted/40 overflow-hidden">
                      {target && (
                        <div
                          className="absolute top-0 h-full bg-foreground/10"
                          style={{ left: pct(target[0]), width: `calc(${pct(target[1])} - ${pct(target[0])})` }}
                        />
                      )}
                      <div className="absolute top-0 left-0 h-full rounded" style={{ width: pct(v), background: color }} />
                    </div>
                  </div>
                );
              };
              return (
                <div className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                      <Target size={14} /> Treningsstatus & belastningsfokus
                    </h3>
                    <span className="text-[10px] text-muted-foreground">oppdatert {latestFit.day}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="rounded border border-border/60 bg-background/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Treningsstatus</div>
                      <div className="text-lg font-semibold mt-1">{latestFit.training_status ?? "—"}</div>
                    </div>
                    <div className="rounded border border-border/60 bg-background/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Kondisjonsalder</div>
                      <div className="text-lg font-semibold tabular-nums mt-1">{latestFit.fitness_age != null ? `${latestFit.fitness_age.toFixed(2)} år` : "—"}</div>
                    </div>
                    <div className="rounded border border-border/60 bg-background/40 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Utholdenhetspoeng</div>
                      <div className="text-lg font-semibold tabular-nums mt-1">{latestFit.endurance_score != null ? Math.round(latestFit.endurance_score) : "—"}</div>
                      {(() => {
                        const contribsSrc = (data?.daily ?? []).slice().reverse().find((d) => d.endurance_contributors && d.endurance_contributors.length)?.endurance_contributors;
                        if (!contribsSrc?.length) return null;
                        const top = contribsSrc.slice(0, 3);
                        const labelMap: Record<string, string> = {
                          RUNNING: "Løping", RUN: "Løping", TRAIL_RUNNING: "Terrengløping",
                          CYCLING: "Sykling", BIKING: "Sykling", BIKE: "Sykling", ROAD_BIKING: "Sykling", MOUNTAIN_BIKING: "Terrengsykling", INDOOR_CYCLING: "Sykling",
                          SWIMMING: "Svømming", LAP_SWIMMING: "Svømming", OPEN_WATER_SWIMMING: "Svømming",
                          HIKING: "Fotturer", HIKE: "Fotturer", MOUNTAINEERING: "Fotturer",
                          WALKING: "Gåtur", WALK: "Gåtur", CASUAL_WALKING: "Gåtur", SPEED_WALKING: "Gåtur",
                          STRENGTH: "Styrke", STRENGTH_TRAINING: "Styrke",
                          CARDIO: "Kondisjon", OTHER: "Annet",
                          RUNNING_GROUP: "Løping", CYCLING_GROUP: "Sykling", HIKING_GROUP: "Fotturer", WALKING_GROUP: "Gåtur", OTHER_GROUP: "Annet",
                        };
                        return (
                          <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Største bidragsytere</div>
                            {top.map((c) => (
                              <div key={c.group} className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">{labelMap[c.group.toUpperCase()] ?? c.group}</span>
                                <span className="tabular-nums text-foreground">{Math.round(c.contribution)}%</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  {focus ? (
                    <div className="space-y-2 pt-1">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Belastningsfokus (siste 4 uker)</div>
                      <Bar label="Lav aerob" value={focus.aerobic_low} target={focus.aerobic_low_target ?? null} color={C.intensity} />
                      <Bar label="Høy aerob" value={focus.aerobic_high} target={focus.aerobic_high_target ?? null} color={C.hrAvg} />
                      <Bar label="Anaerob" value={focus.anaerobic} target={focus.anaerobic_target ?? null} color={C.hrMax} />
                      {focus.feedback && (
                        <p className="text-[11px] italic text-muted-foreground pt-1">« {focus.feedback} »</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">Ingen belastningsdata enda — synk Garmin for å oppdatere.</p>
                  )}
                </div>
              );
            })()}


            {/* Grafer (skjult som default) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowCharts((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {showCharts ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {showCharts ? "Skjul grafer" : "Vis grafer"}
              </button>
              {showCharts && (
                <>
                  <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-[11px] ml-2 flex-wrap">
                    {([
                      ["today", "I dag"],
                      ["yesterday", "I går"],
                      ["thisWeek", "Denne uken"],
                      ["lastWeek", "Forrige uke"],
                      ["last30", "Siste 30 dager"],
                      ["thisMonth", "Denne måneden"],
                    ] as const).map(([k, lbl], i) => (
                      <button
                        key={k}
                        onClick={() => setChartPeriod(k)}
                        className={`px-2 py-1 ${i > 0 ? "border-l border-border/60" : ""} ${chartPeriod === k ? "bg-primary/20 text-primary" : "hover:bg-muted/40"}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowTrend((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${showTrend ? "border-primary/60 text-primary bg-primary/10" : "border-border/60 hover:bg-muted/40"}`}
                  >
                    <TrendingUp size={12} /> Trendlinje {showTrend ? "på" : "av"}
                  </button>
                </>
              )}
            </div>

            {showCharts && data && (() => {
              const dailyF = filterPeriod(data.daily, chartPeriod);
              const sleepF = filterPeriod(data.sleep, chartPeriod);
              const intensityData = dailyF.map((d) => ({ ...d, total_intensity: (d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0) }));
              const maxHrMap = new Map<string, number>();
              for (const a of data.activities ?? []) {
                const dd = a.start_time_local.slice(0, 10);
                const v = a.max_hr ?? 0;
                if (v > (maxHrMap.get(dd) ?? 0)) maxHrMap.set(dd, v);
              }
              const maxHrData = dailyF.map((d) => ({ day: d.day, max_hr: maxHrMap.get(d.day) ?? null }));
              const sleepData = sleepF.map((s) => ({
                day: s.day,
                deep: (s.deep_seconds ?? 0) / 3600,
                light: (s.light_seconds ?? 0) / 3600,
                rem: (s.rem_seconds ?? 0) / 3600,
                awake: (s.awake_seconds ?? 0) / 3600,
                total: (s.total_seconds ?? 0) / 3600,
                score: s.sleep_score,
              }));
              const spo2Data = sleepF.map((s) => ({ day: s.day, spo2: s.average_spo2 }));
              const respData = sleepF.map((s) => ({ day: s.day, resp: s.average_respiration }));
              const hrvData = sleepF.map((s) => ({ day: s.day, hrv: s.hrv_avg }));
              const hasSpo2 = spo2Data.some((d) => typeof d.spo2 === "number");
              const hasResp = respData.some((d) => typeof d.resp === "number");
              const hasHrv = hrvData.some((d) => typeof d.hrv === "number");

              if (dailyF.length === 0 && sleepF.length === 0) {
                return <p className="text-xs text-muted-foreground italic">Ingen data for valgt periode.</p>;
              }

              const single = isSingleDay(chartPeriod) && (dailyF.length <= 1);
              const dayKey = chartPeriod === "today"
                ? (() => { const d = new Date(); d.setHours(0,0,0,0); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })()
                : (() => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();

              // Aktiviteter for valgt enkeltdag — brukes til time-for-time puls (snitt under aktivitet)
              const dayActs = single ? (data.activities ?? []).filter((a) => a.start_time_local.slice(0, 10) === dayKey) : [];
              const dayIntraday = single ? (data.intraday ?? []).filter((x) => x.day === dayKey) : [];
              const intradayBuckets = (pick: (x: Intraday) => number | null) => {
                const out: Array<{ hour: number; value: number | null }> = Array.from({ length: 24 }, (_, h) => ({ hour: h, value: null }));
                for (const x of dayIntraday) {
                  const v = pick(x);
                  if (v != null) out[x.hour].value = v;
                }
                return out;
              };
              const hasIntradayHr = dayIntraday.some((x) => x.heart_rate_avg != null);
              const hasIntradayStress = dayIntraday.some((x) => x.stress_avg != null);
              const hasIntradayBb = dayIntraday.some((x) => x.body_battery != null);
              const hourly = (pickHr: (a: Activity) => number | null) => {
                const buckets: Array<{ hour: number; value: number | null }> = Array.from({ length: 24 }, (_, h) => ({ hour: h, value: null }));
                for (const a of dayActs) {
                  const h = new Date(a.start_time_local).getHours();
                  const v = pickHr(a);
                  if (v != null) {
                    const cur = buckets[h].value;
                    buckets[h].value = cur == null ? v : Math.max(cur, v);
                  }
                }
                return buckets;
              };
              const SingleDayNote = ({ value, unit = "" }: { value: number | null | undefined; unit?: string }) => (
                <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground italic px-2 text-center">
                  {value != null ? <>Dagsverdi: <span className="text-foreground tabular-nums not-italic font-medium">{value}{unit}</span></> : "Ingen data for valgt dag"}
                </div>
              );

              return (
                <div className="space-y-3">
                  <ChartCard title={single ? "Skritt (time-for-time)" : "Skritt"}>
                    {single
                      ? <SingleDayNote value={dailyF[0]?.steps ?? null} />
                      : renderBar(dailyF, "steps", showTrend, C.steps)}
                  </ChartCard>

                  <div className="grid md:grid-cols-2 gap-3">
                    <ChartCard title="Hvilepuls (bpm)" height={160}>
                      {single
                        ? <SingleDayNote value={dailyF[0]?.resting_heart_rate ?? null} unit=" bpm" />
                        : renderLine(dailyF, "resting_heart_rate", showTrend, false, C.hr)}
                    </ChartCard>
                    <ChartCard title={single ? "Puls (snitt per time)" : "Snitt puls (bpm)"} height={160}>
                      {single
                        ? (hasIntradayHr
                            ? renderHourBar(intradayBuckets((x) => x.heart_rate_avg), C.hrAvg, " bpm")
                            : renderHourBar(hourly((a) => a.average_hr ?? null), C.hrAvg, " bpm"))
                        : renderLine(dailyF, "average_heart_rate", showTrend, false, C.hrAvg)}
                    </ChartCard>
                    <ChartCard title={single ? "Maks puls (per time)" : "Maks puls (bpm)"} height={160}>
                      {single
                        ? (hasIntradayHr
                            ? renderHourBar(intradayBuckets((x) => x.heart_rate_max), C.hrMax, " bpm")
                            : renderHourBar(hourly((a) => a.max_hr ?? null), C.hrMax, " bpm"))
                        : renderLine(maxHrData, "max_hr", showTrend, false, C.hrMax)}
                    </ChartCard>
                    <ChartCard title="Trapper" height={160}>
                      {single
                        ? <SingleDayNote value={dailyF[0]?.floors_climbed ?? null} />
                        : renderBar(dailyF, "floors_climbed", showTrend, C.floors)}
                    </ChartCard>
                    <ChartCard title={single ? "Body battery (per time)" : "Body battery (høy/lav)"} height={160}>
                      {single
                        ? (hasIntradayBb
                            ? renderHourBar(intradayBuckets((x) => x.body_battery), C.batteryHigh, "")
                            : <SingleDayNote value={dailyF[0]?.body_battery_high ?? null} />)
                        : renderLine2(dailyF, "body_battery_high", "body_battery_low", showTrend, C.batteryHigh, C.batteryLow)}
                    </ChartCard>
                    <ChartCard title={single ? "Stress (per time)" : "Stress (snitt)"} height={160}>
                      {single
                        ? (hasIntradayStress
                            ? renderHourBar(intradayBuckets((x) => x.stress_avg), C.stress, "")
                            : <SingleDayNote value={dailyF[0]?.stress_average ?? null} />)
                        : renderLine(dailyF, "stress_average", showTrend, false, C.stress)}
                    </ChartCard>
                    <ChartCard title="Intensitetsminutter" height={160}>
                      {single
                        ? <SingleDayNote value={(dailyF[0] ? (dailyF[0].moderate_intensity_minutes ?? 0) + (dailyF[0].vigorous_intensity_minutes ?? 0) : null)} unit=" min" />
                        : renderBar(intensityData, "total_intensity", showTrend, C.intensity)}
                    </ChartCard>
                    {weightAllowed && (
                    <ChartCard title="Vekt (kg)" height={160}>
                      {single
                        ? <SingleDayNote value={dailyF[0]?.weight_kg ?? null} unit=" kg" />
                        : renderLine(dailyF, "weight_kg", showTrend, true, C.weight)}
                    </ChartCard>
                    )}
                    <ChartCard title="Kalorier (total/aktive)" height={160}>
                      {single
                        ? <SingleDayNote value={dailyF[0]?.total_kilocalories ?? null} unit=" kcal" />
                        : renderLine2(dailyF, "total_kilocalories", "active_kilocalories", showTrend, C.caloriesTotal, C.caloriesActive)}
                    </ChartCard>
                    <ChartCard title="Søvn (timer)" height={160}>
                      {single
                        ? <SingleDayNote value={sleepF[0]?.total_seconds ? Number(((sleepF[0].total_seconds) / 3600).toFixed(1)) : null} unit=" t" />
                        : renderBar(sleepData, "total", showTrend, C.sleep)}
                    </ChartCard>
                    {hasSpo2 && (
                      <ChartCard title="Pulsoksygen SpO₂ (%)" height={160}>
                        {single
                          ? <SingleDayNote value={sleepF[0]?.average_spo2 ?? null} unit=" %" />
                          : renderLine(spo2Data, "spo2", showTrend, true, C.spo2)}
                      </ChartCard>
                    )}
                    {hasHrv && (
                      <ChartCard title="Pulsvariasjon HRV (ms)" height={160}>
                        {single
                          ? <SingleDayNote value={sleepF[0]?.hrv_avg ?? null} unit=" ms" />
                          : renderLine(hrvData, "hrv", showTrend, true, C.hrv)}
                      </ChartCard>
                    )}
                    {hasResp && (
                      <ChartCard title="Pusting (pust/min)" height={160}>
                        {single
                          ? <SingleDayNote value={sleepF[0]?.average_respiration ?? null} unit=" /min" />
                          : renderLine(respData, "resp", showTrend, true, C.respiration)}
                      </ChartCard>
                    )}
                  </div>

                  {sleepData.length > 0 && (
                    <ChartCard title={<span className="flex items-center gap-1"><Moon size={12} /> Søvnfaser + score</span>}>
                      <BarChart data={sleepData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                        <Bar yAxisId="left" dataKey="deep" stackId="a" fill={C.sleepDeep} name="Dyp" />
                        <Bar yAxisId="left" dataKey="light" stackId="a" fill={C.sleepLight} name="Lett" />
                        <Bar yAxisId="left" dataKey="rem" stackId="a" fill={C.sleepRem} name="REM" />
                        <Bar yAxisId="left" dataKey="awake" stackId="a" fill={C.sleepAwake} name="Våken" />
                        <Line yAxisId="right" type="monotone" dataKey="score" stroke={C.sleep} strokeWidth={2} dot={{ r: 3 }} name="Score" />
                      </BarChart>
                    </ChartCard>
                  )}
                </div>
              );
            })()}

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

      <Dialog open={devicesOpen} onOpenChange={setDevicesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Velg klokke for {displayName}</DialogTitle>
            <DialogDescription>
              Klikk på en klokke for å velge den som standard. Den vises i headeren og brukes til å generere bilder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {devicesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Henter klokker…</div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-muted-foreground">Ingen klokker funnet enda. Trykk «Synk nå» for å hente fra Garmin.</div>
            ) : (
              devices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={settingDefault === d.id}
                  onClick={() => chooseDefault(d.id)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                    d.is_default ? "border-primary/60 bg-primary/10" : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  {d.image_url ? (
                    <img src={d.image_url} alt={d.name} className="h-12 w-12 rounded-md object-cover border border-border/60 bg-background" loading="lazy" />
                  ) : (
                    <div className="h-12 w-12 rounded-md border border-border/60 bg-muted/40 flex items-center justify-center"><Activity className="h-5 w-5 opacity-50" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {d.name}
                      {d.is_default && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {d.last_used_at ? `Sist brukt ${new Date(d.last_used_at).toLocaleDateString("nb-NO")}` : d.register_date ? `Registrert ${new Date(d.register_date).toLocaleDateString("nb-NO")}` : "Ukjent dato"}
                    </div>
                  </div>
                  {settingDefault === d.id && <Loader2 className="h-4 w-4 animate-spin" />}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDevicesOpen(false)}>Lukk</Button>
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

  const hasData = value != null;
  return (
    <div className={`rounded border p-3 transition-colors ${hasData ? "border-border/60 bg-background/40" : "border-border/30 bg-muted/20 opacity-60"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${hasData ? "" : "text-muted-foreground/70"}`}>{formatVal(value)}</div>
      <div className="text-[10px] mt-0.5">
        {trend ?? (value == null && fallbackSub ? <span className="text-muted-foreground">{fallbackSub}</span> : null)}
      </div>
      {showDetails && details && details.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/40 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
          {details.map((d) => (
            <div key={d.k} className="flex justify-between items-baseline gap-1 min-w-0">
              <span className="text-muted-foreground shrink-0">{d.k}</span>
              <InlineMarquee text={d.v} className="tabular-nums font-medium text-right" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Inline-marquee som ruller verdien horisontalt hvis den ikke får plass i
 * tilgjengelig bredde. Bruker hastighet og modus fra scene-marquee-
 * innstillingen (samme som lys-scenene), men arver fontstørrelse fra
 * forelderen så små detalj-rader holder seg på 10px.
 */
function InlineMarquee({ text, className }: { text: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const { speedPxPerSec, mode } = useSceneMarquee();
  const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  useIso(() => {
    const wrap = wrapRef.current; const m = measureRef.current;
    if (!wrap || !m) return;
    const run = () => { setContainerW(wrap.clientWidth); setTextW(m.scrollWidth); };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(wrap); ro.observe(m);
    return () => ro.disconnect();
  }, [text]);
  const overflow = textW > containerW + 1;
  const distance = Math.max(0, textW - containerW);
  const speed = Math.max(10, speedPxPerSec);
  const gap = 16;
  const loopDuration = overflow ? (textW + gap) / speed : 0;
  const pingDuration = overflow ? (distance / speed) * 2 + 1.2 : 0;
  return (
    <div ref={wrapRef} className={`relative min-w-0 flex-1 overflow-hidden ${className ?? ""}`}>
      <span ref={measureRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap pointer-events-none">{text}</span>
      {overflow && mode === "loop" ? (
        <div className="flex whitespace-nowrap will-change-transform" style={{ animation: `scene-marquee-loop ${loopDuration}s linear infinite`, gap: `${gap}px`, ["--marquee-loop" as any]: `${textW + gap}px` }}>
          <span className="shrink-0">{text}</span>
          <span className="shrink-0" aria-hidden>{text}</span>
        </div>
      ) : overflow && mode === "pingpong" ? (
        <span className="block whitespace-nowrap will-change-transform" style={{ animation: `scene-marquee-ping ${pingDuration}s ease-in-out infinite`, ["--marquee-dist" as any]: `-${distance}px` }}>{text}</span>
      ) : (
        <span className="block whitespace-nowrap">{text}</span>
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

function sparkBar<T extends Record<string, unknown>>(data: T[] | undefined, key: keyof T, color: string = C.steps): React.ReactElement | null {
  if (!data || !data.some((d) => typeof d[key] === "number" && (d[key] as number) > 0)) return null;
  return (
    <BarChart data={data as Array<Record<string, unknown>>}>
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} labelFormatter={(v) => String(v).slice(5)} />
      <XAxis dataKey="day" hide />
      <YAxis hide />
      <Bar dataKey={key as string} fill={color} radius={[2,2,0,0]} />
    </BarChart>
  );
}

function sparkLine<T extends Record<string, unknown>>(data: T[] | undefined, key: keyof T, connectNulls = false, color: string = C.hr): React.ReactElement | null {
  if (!data || !data.some((d) => typeof d[key] === "number" && (d[key] as number) > 0)) return null;
  return (
    <LineChart data={data as Array<Record<string, unknown>>}>
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} labelFormatter={(v) => String(v).slice(5)} />
      <XAxis dataKey="day" hide />
      <YAxis hide domain={["auto", "auto"]} />
      <Line type="monotone" dataKey={key as string} stroke={color} strokeWidth={1.5} dot={false} connectNulls={connectNulls} />
    </LineChart>
  );
}

function sparkLine2<T extends Record<string, unknown>>(data: T[] | undefined, k1: keyof T, k2: keyof T, color1: string = C.batteryHigh, color2: string = C.batteryLow): React.ReactElement | null {
  if (!data || !data.some((d) => typeof d[k1] === "number" || typeof d[k2] === "number")) return null;
  return (
    <LineChart data={data as Array<Record<string, unknown>>}>
      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} labelFormatter={(v) => String(v).slice(5)} />
      <XAxis dataKey="day" hide />
      <YAxis hide domain={["auto", "auto"]} />
      <Line type="monotone" dataKey={k1 as string} stroke={color1} strokeWidth={1.5} dot={false} />
      <Line type="monotone" dataKey={k2 as string} stroke={color2} strokeWidth={1.5} dot={false} />
    </LineChart>
  );
}
