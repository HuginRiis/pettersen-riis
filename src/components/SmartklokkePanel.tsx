import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Watch, Crown, Flame, Loader2, Heart, Activity, Moon, Footprints, Flame as FireIcon,
  Battery, Brain, Droplets, Wind, Zap, Trophy, Mountain, Gauge, Calendar, Cog,
  ChevronDown, ChevronRight, Wifi, WifiOff, AlertTriangle, Target, Bike, Dumbbell, Award,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getSmartklokkeOverview } from "@/server/smartklokke.functions";

type Owner = "arne" | "rebekka";

// --------- Hjelpere ----------------------------------------------------------
function fmt(n: unknown, digits = 0): string {
  if (n == null || (typeof n === "number" && (!isFinite(n) || n === 0))) return "—";
  if (typeof n !== "number") return String(n);
  return n.toLocaleString("nb-NO", { maximumFractionDigits: digits });
}
function fmtNum(n: unknown, digits = 1): string {
  if (n == null) return "—";
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return v.toLocaleString("nb-NO", { maximumFractionDigits: digits });
}
function hhmm(sec: unknown): string {
  const s = Number(sec);
  if (!isFinite(s) || s <= 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}t ${String(m).padStart(2, "0")}m`;
}
function dayShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("nb-NO", { weekday: "short", day: "2-digit", month: "2-digit" });
}
function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
}
function avg(arr: Array<number | null | undefined>): number | null {
  const v = arr.filter((x): x is number => typeof x === "number" && isFinite(x) && x > 0);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}
function sum(arr: Array<number | null | undefined>): number {
  return arr.reduce<number>((a, b) => a + (typeof b === "number" && isFinite(b) ? b : 0), 0);
}

// --------- Hus-design --------------------------------------------------------
const HOUSE = {
  arne: {
    name: "Arne",
    house: "House Stark",
    words: "Winter is Coming",
    device: "Fenix 8 Pro",
    Icon: Crown,
    accent: "text-slate-200",
    border: "border-slate-400/40",
    bg: "bg-slate-900/40",
    bannerFrom: "from-slate-700/60",
    bannerTo: "to-slate-900/80",
  },
  rebekka: {
    name: "Rebekka",
    house: "House Targaryen",
    words: "Fire and Blood",
    device: "Fenix 8 AMOLED",
    Icon: Flame,
    accent: "text-rose-200",
    border: "border-rose-500/40",
    bg: "bg-rose-950/30",
    bannerFrom: "from-rose-900/60",
    bannerTo: "to-black/80",
  },
} as const;

// --------- UI-byggesteiner ---------------------------------------------------
function Section({
  title, icon, children, defaultOpen = true,
}: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-semibold uppercase tracking-wider text-primary flex-1">
          {title}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
      {sub != null && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-border/30 last:border-b-0 text-xs">
      <span className="text-muted-foreground truncate">{k}</span>
      <span className="tabular-nums font-medium text-right">{v}</span>
    </div>
  );
}

function MiniBar({ values, max, color = "bg-primary/70" }: { values: number[]; max?: number; color?: string }) {
  const m = max ?? Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1 h-12">
      {values.map((v, i) => (
        <div key={i} className="flex-1 bg-muted/30 rounded-sm overflow-hidden flex items-end">
          <div className={`w-full ${color}`} style={{ height: `${Math.max(2, (v / m) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

// --------- Bruker-tab -------------------------------------------------------
function OwnerView({ owner }: { owner: Owner }) {
  const fetchOverview = useServerFn(getSmartklokkeOverview);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetchOverview({ data: { owner } })
      .then((r: any) => { if (alive) { setData(r); setState("ready"); } })
      .catch((e: Error) => { if (alive) { setErr(e.message); setState("error"); } });
    return () => { alive = false; };
  }, [fetchOverview, owner]);

  const h = HOUSE[owner];

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Maesteren leter etter klokkens krønike…
      </div>
    );
  }
  if (state === "error" || !data) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Kunne ikke hente data: {err}
      </div>
    );
  }

  const daily: any[] = data.daily ?? [];
  const sleep: any[] = data.sleep ?? [];
  const activities: any[] = data.activities ?? [];
  const devices: any[] = data.devices ?? [];
  const intraday: any[] = data.intraday ?? [];
  const live = data.live ?? {};
  const status = data.status ?? {};
  const sync = data.lastSync ?? null;

  const today = daily[daily.length - 1];
  const yesterday = daily[daily.length - 2];

  const live_ = (k: string) => (live[k]?.ok ? live[k].data : null);
  const liveErr = (k: string) => (live[k]?.ok === false ? live[k].error : null);

  const tr = live_("trainingReadiness");
  const ts = live_("trainingStatus");
  const mm = live_("maxMetrics");
  const fa = live_("fitnessAge");
  const hrv = live_("hrv");
  const hrvWeek = live_("hrvWeek");
  const rp = live_("racePredictions");
  const prs = live_("personalRecords");
  const hrZones = live_("hrZones");
  const bbEvents = live_("bodyBatteryEvents");
  const stressDetail = live_("stressDetail");
  const respiration = live_("respiration");
  const spo2 = live_("spo2");
  const hydration = live_("hydrationToday");
  const userSummary = live_("userSummary");
  const userProfile = live_("userProfile");
  const social = live_("socialProfile");
  const endurance = live_("enduranceScore");
  const hillScore = live_("hillScore");
  const weightWeek = live_("weightWeek");
  const badges = live_("badgesEarned");
  const gear = live_("gear");
  const activeGoals = live_("activeGoals");

  return (
    <div className="space-y-4">
      {/* Husbanner */}
      <div className={`rounded-lg border ${h.border} bg-gradient-to-r ${h.bannerFrom} ${h.bannerTo} px-4 py-3 flex items-center gap-3`}>
        <div className={`h-10 w-10 rounded-full border ${h.border} ${h.bg} flex items-center justify-center`}>
          <h.Icon className={`h-5 w-5 ${h.accent}`} />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{h.house}</div>
          <div className={`text-lg leading-tight ${h.accent}`} style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.05em" }}>
            {h.name} <span className="text-xs text-muted-foreground font-normal ml-2">{h.device}</span>
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="flex items-center gap-1 justify-end">
            {status.connected ? <Wifi className="h-3 w-3 text-emerald-400" /> : <WifiOff className="h-3 w-3 text-red-400" />}
            <span className={status.connected ? "text-emerald-400" : "text-red-400"}>
              {status.connected ? "Tilkoblet" : "Ikke koblet"}
            </span>
          </div>
          {sync && (
            <div className="text-muted-foreground mt-0.5">
              Sist sync {sync.ran_at ? dateTime(sync.ran_at) : "—"}
            </div>
          )}
        </div>
      </div>

      {/* ---- Klokken ---- */}
      <Section title="Klokken" icon={<Watch size={14} />}>
        {devices.length === 0 ? (
          <div className="text-xs text-muted-foreground">Ingen klokker registrert.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {devices.map((d) => (
              <div key={d.id} className="rounded border border-border/60 bg-background/40 p-3 flex gap-3">
                {(d.image_transparent_url || d.image_url) && (
                  <img
                    src={d.image_transparent_url || d.image_url}
                    alt={d.name}
                    className="h-20 w-20 object-contain"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {d.name}
                    {d.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Standard</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                    <KV k="Produkt-ID" v={d.product_id} />
                    {d.register_date && <KV k="Registrert" v={dateTime(d.register_date)} />}
                    {d.last_used_at && <KV k="Sist brukt" v={dateTime(d.last_used_at)} />}
                    {d.raw?.serialNumber && <KV k="Serienr." v={d.raw.serialNumber} />}
                    {d.raw?.softwareVersion && <KV k="Firmware" v={d.raw.softwareVersion} />}
                    {d.raw?.batteryLevel != null && <KV k="Batteri" v={`${d.raw.batteryLevel}%`} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ---- Trenings-beredskap (i dag) ---- */}
      <Section title="Trenings­beredskap & status (i dag)" icon={<Gauge size={14} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            icon={<Brain size={12} />}
            label="Treningsberedskap"
            value={fmt(asArr(tr)?.[0]?.score ?? tr?.score)}
            sub={asArr(tr)?.[0]?.level ?? tr?.level ?? liveErr("trainingReadiness")}
          />
          <Stat
            icon={<Activity size={12} />}
            label="Treningsstatus"
            value={ts?.trainingStatusFeedbackPhrase ?? ts?.trainingStatus ?? today?.training_status ?? "—"}
            sub={ts?.acuteTrainingLoadDTO?.acwrPercent != null ? `ACWR ${fmt(ts.acuteTrainingLoadDTO.acwrPercent)}%` : null}
          />
          <Stat
            icon={<Heart size={12} />}
            label="VO₂max løp"
            value={fmtNum(mm?.generic?.vo2MaxValue ?? today?.vo2max_running, 1)}
            sub={mm?.generic?.fitnessAge ? `Form­alder ${fmt(mm.generic.fitnessAge)} år` : (fa?.chronologicalAge ? `Form­alder ${fmt(fa?.fitnessAge ?? fa?.estimatedFitnessAge)}` : null)}
          />
          <Stat
            icon={<Bike size={12} />}
            label="VO₂max sykkel"
            value={fmtNum(mm?.cycling?.vo2MaxValue ?? today?.vo2max_cycling, 1)}
            sub={mm?.heatAltitudeAcclimationDTO?.altitudeAcclimation != null ? `Høyde­tilv. ${fmt(mm.heatAltitudeAcclimationDTO.altitudeAcclimation)}m` : null}
          />
          <Stat
            icon={<Mountain size={12} />}
            label="Hill score"
            value={fmt(hillScore?.overallScore ?? hillScore?.value)}
            sub={hillScore?.classification ?? null}
          />
          <Stat
            icon={<Trophy size={12} />}
            label="Endurance score"
            value={fmt(endurance?.overallScore ?? today?.endurance_score)}
            sub={endurance?.classification ?? null}
          />
          <Stat
            icon={<Target size={12} />}
            label="Sliten/uthvilt"
            value={asArr(tr)?.[0]?.feedbackLong ?? tr?.feedbackLong ?? "—"}
          />
          <Stat
            icon={<Battery size={12} />}
            label="Body Battery nå"
            value={fmt(bbEvents?.[bbEvents?.length - 1]?.bodyBatteryStatusList?.slice(-1)?.[0]?.bodyBatteryValue ?? today?.body_battery_high)}
            sub={today ? `Høyt ${fmt(today.body_battery_high)} · Lavt ${fmt(today.body_battery_low)}` : null}
          />
        </div>
        {tr && Array.isArray(tr) && tr[0] && (
          <div className="mt-3 text-[11px] text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-2">
            {tr[0].sleepScore != null && <KV k="Søvn-score (input)" v={tr[0].sleepScore} />}
            {tr[0].sleepHistoryFactorFeedback && <KV k="Søvn-historikk" v={tr[0].sleepHistoryFactorFeedback} />}
            {tr[0].hrvFactorFeedback && <KV k="HRV-faktor" v={tr[0].hrvFactorFeedback} />}
            {tr[0].acuteLoadFactorFeedback && <KV k="Akutt belastning" v={tr[0].acuteLoadFactorFeedback} />}
            {tr[0].stressHistoryFactorFeedback && <KV k="Stress-historikk" v={tr[0].stressHistoryFactorFeedback} />}
            {tr[0].recoveryTime != null && <KV k="Recovery-tid" v={`${tr[0].recoveryTime} t`} />}
          </div>
        )}
      </Section>

      {/* ---- Hvilepuls & HRV (7d) ---- */}
      <Section title="Hjerte — Hvilepuls & HRV (7 dager)" icon={<Heart size={14} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Hvilepuls i dag" value={today?.resting_heart_rate ? `${today.resting_heart_rate} bpm` : "—"} />
          <Stat label="Hvilepuls i går" value={yesterday?.resting_heart_rate ? `${yesterday.resting_heart_rate} bpm` : "—"} />
          <Stat label="Snitt 7d" value={(() => { const v = avg(daily.map((d) => d.resting_heart_rate)); return v ? `${v.toFixed(0)} bpm` : "—"; })()} />
          <Stat label="Snittpuls i dag" value={today?.average_heart_rate ? `${today.average_heart_rate} bpm` : "—"} />
        </div>
        <div className="mt-3">
          <div className="text-[10px] text-muted-foreground mb-1">Hvilepuls 7d</div>
          <MiniBar values={daily.map((d) => d.resting_heart_rate ?? 0)} color="bg-red-500/60" />
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            {daily.map((d) => <span key={d.day}>{dayShort(d.day).split(".")[0]}</span>)}
          </div>
        </div>
        {(hrv || hrvWeek) && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="HRV i natt" value={hrv?.hrvSummary?.lastNightAvg ? `${hrv.hrvSummary.lastNightAvg} ms` : "—"} sub={hrv?.hrvSummary?.status} />
            <Stat label="HRV 7d snitt" value={hrv?.hrvSummary?.weeklyAvg ? `${hrv.hrvSummary.weeklyAvg} ms` : "—"} />
            <Stat label="HRV baseline (lav)" value={hrv?.hrvSummary?.baseline?.lowUpper ? `${hrv.hrvSummary.baseline.lowUpper} ms` : "—"} />
            <Stat label="HRV baseline (balansert)" value={hrv?.hrvSummary?.baseline?.balancedLow ? `${hrv.hrvSummary.baseline.balancedLow}–${hrv.hrvSummary.baseline.balancedUpper} ms` : "—"} />
          </div>
        )}
        {hrZones && Array.isArray(hrZones) && hrZones.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Puls-soner</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {hrZones.slice(0, 5).map((z: any, i: number) => (
                <div key={i} className="rounded border border-border/60 bg-background/40 p-2 text-xs">
                  <div className="font-semibold">Sone {i + 1}</div>
                  <div className="text-muted-foreground tabular-nums">{z.zoneLowBoundary ?? z.lowBoundary}–{z.zoneHighBoundary ?? z.highBoundary} bpm</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ---- Aktivitet, skritt, etasjer, kalorier ---- */}
      <Section title="Aktivitet — skritt, etasjer, distanse, kalorier" icon={<Footprints size={14} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Skritt i dag" value={fmt(today?.steps)} sub={today?.step_goal ? `Mål ${fmt(today.step_goal)}` : null} />
          <Stat label="Skritt 7d totalt" value={fmt(sum(daily.map((d) => d.steps)))} />
          <Stat label="Distanse i dag" value={today?.distance_meters ? `${(today.distance_meters / 1000).toFixed(2)} km` : "—"} />
          <Stat label="Distanse 7d" value={`${(sum(daily.map((d) => d.distance_meters)) / 1000).toFixed(1)} km`} />
          <Stat label="Etasjer i dag" value={fmtNum(today?.floors_climbed, 0)} sub={today?.floors_goal ? `Mål ${fmt(today.floors_goal)}` : null} />
          <Stat label="Etasjer 7d" value={fmtNum(sum(daily.map((d) => Number(d.floors_climbed) || 0)), 0)} />
          <Stat label="Aktiv kcal i dag" value={fmt(today?.active_kilocalories)} sub={today?.total_kilocalories ? `Totalt ${fmt(today.total_kilocalories)}` : null} />
          <Stat label="Total kcal 7d" value={fmt(sum(daily.map((d) => d.total_kilocalories)))} />
          <Stat label="Intensitets­minutter i dag" value={fmt((today?.moderate_intensity_minutes ?? 0) + 2 * (today?.vigorous_intensity_minutes ?? 0))} sub={today?.intensity_minutes_goal ? `Mål ${fmt(today.intensity_minutes_goal)}` : null} />
          <Stat label="Moderat / Hard 7d" value={`${fmt(sum(daily.map((d) => d.moderate_intensity_minutes)))} / ${fmt(sum(daily.map((d) => d.vigorous_intensity_minutes)))}`} />
        </div>
        <div className="mt-3">
          <div className="text-[10px] text-muted-foreground mb-1">Skritt 7d</div>
          <MiniBar values={daily.map((d) => d.steps ?? 0)} color="bg-emerald-500/60" />
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            {daily.map((d) => <span key={d.day}>{dayShort(d.day).split(".")[0]}</span>)}
          </div>
        </div>
      </Section>

      {/* ---- Stress & Body Battery ---- */}
      <Section title="Stress & Body Battery" icon={<Zap size={14} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Stress-snitt i dag" value={fmt(today?.stress_average)} sub={stressLabel(today?.stress_average)} />
          <Stat label="Stress 7d snitt" value={(() => { const v = avg(daily.map((d) => d.stress_average)); return v ? v.toFixed(0) : "—"; })()} />
          <Stat label="Maks stress i dag" value={fmt(stressDetail?.maxStressLevel)} />
          <Stat label="Hviletid i dag" value={hhmm(stressDetail?.restStressDuration)} />
          <Stat label="Body Battery høyest" value={fmt(today?.body_battery_high)} />
          <Stat label="Body Battery lavest" value={fmt(today?.body_battery_low)} />
          <Stat label="Body Battery ladet" value={fmt(bbSum(bbEvents, "charged"))} sub="poeng i dag" />
          <Stat label="Body Battery brukt" value={fmt(bbSum(bbEvents, "drained"))} sub="poeng i dag" />
        </div>
        <div className="mt-3">
          <div className="text-[10px] text-muted-foreground mb-1">Stress-snitt 7d</div>
          <MiniBar values={daily.map((d) => d.stress_average ?? 0)} max={100} color="bg-amber-500/60" />
        </div>
      </Section>

      {/* ---- Søvn (7d) ---- */}
      <Section title="Søvn — siste 7 netter" icon={<Moon size={14} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Søvn i natt" value={hhmm(sleep[sleep.length - 1]?.total_seconds)} sub={sleep[sleep.length - 1]?.sleep_score ? `Score ${sleep[sleep.length - 1].sleep_score}` : null} />
          <Stat label="Snitt 7d" value={hhmm(avg(sleep.map((s) => s.total_seconds)) ?? 0)} />
          <Stat label="Dyp søvn i natt" value={hhmm(sleep[sleep.length - 1]?.deep_seconds)} />
          <Stat label="REM i natt" value={hhmm(sleep[sleep.length - 1]?.rem_seconds)} />
          <Stat label="Lett søvn i natt" value={hhmm(sleep[sleep.length - 1]?.light_seconds)} />
          <Stat label="Våken i natt" value={hhmm(sleep[sleep.length - 1]?.awake_seconds)} />
          <Stat label="SpO₂ snitt i natt" value={sleep[sleep.length - 1]?.average_spo2 ? `${sleep[sleep.length - 1].average_spo2}%` : "—"} />
          <Stat label="Respirasjon i natt" value={sleep[sleep.length - 1]?.average_respiration ? `${sleep[sleep.length - 1].average_respiration}/min` : "—"} />
          <Stat label="HRV i natt" value={sleep[sleep.length - 1]?.hrv_avg ? `${sleep[sleep.length - 1].hrv_avg} ms` : "—"} />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr><th className="text-left py-1">Dag</th><th className="text-right">Total</th><th className="text-right">Dyp</th><th className="text-right">REM</th><th className="text-right">Lett</th><th className="text-right">Våken</th><th className="text-right">Score</th><th className="text-right">SpO₂</th></tr>
            </thead>
            <tbody>
              {sleep.map((s) => (
                <tr key={s.day} className="border-t border-border/30">
                  <td className="py-1">{dayShort(s.day)}</td>
                  <td className="text-right tabular-nums">{hhmm(s.total_seconds)}</td>
                  <td className="text-right tabular-nums">{hhmm(s.deep_seconds)}</td>
                  <td className="text-right tabular-nums">{hhmm(s.rem_seconds)}</td>
                  <td className="text-right tabular-nums">{hhmm(s.light_seconds)}</td>
                  <td className="text-right tabular-nums">{hhmm(s.awake_seconds)}</td>
                  <td className="text-right tabular-nums">{s.sleep_score ?? "—"}</td>
                  <td className="text-right tabular-nums">{s.average_spo2 ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---- Pust, SpO₂, hydrering ---- */}
      <Section title="Pust, SpO₂ og hydrering (i dag)" icon={<Wind size={14} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<Wind size={12} />} label="Pust hvile" value={respiration?.avgWakingRespirationValue ? `${respiration.avgWakingRespirationValue}/min` : "—"} />
          <Stat icon={<Wind size={12} />} label="Pust høyest" value={respiration?.highestRespirationValue ? `${respiration.highestRespirationValue}/min` : "—"} />
          <Stat icon={<Wind size={12} />} label="Pust lavest" value={respiration?.lowestRespirationValue ? `${respiration.lowestRespirationValue}/min` : "—"} />
          <Stat icon={<Heart size={12} />} label="SpO₂ snitt" value={spo2?.averageSpO2 ? `${spo2.averageSpO2}%` : "—"} sub={spo2?.lowestSpO2 ? `Lavest ${spo2.lowestSpO2}%` : null} />
          <Stat icon={<Droplets size={12} />} label="Hydrering" value={hydration?.valueInML ? `${hydration.valueInML} ml` : "—"} sub={hydration?.goalInML ? `Mål ${hydration.goalInML} ml` : null} />
          <Stat icon={<Droplets size={12} />} label="Hydrering svette-tap" value={hydration?.sweatLossInML ? `${hydration.sweatLossInML} ml` : "—"} />
        </div>
      </Section>

      {/* ---- Vekt ---- */}
      <Section title="Vekt og kroppssammensetning (7d)" icon={<Award size={14} />}>
        {weightWeek && Array.isArray(weightWeek?.dailyWeightSummaries) && weightWeek.dailyWeightSummaries.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {weightWeek.dailyWeightSummaries.slice(-4).map((d: any, i: number) => (
              <Stat key={i} label={d.summaryDate ? dayShort(d.summaryDate) : "Dag"} value={d.allWeightMetrics?.[0]?.weight ? `${(d.allWeightMetrics[0].weight / 1000).toFixed(1)} kg` : "—"} sub={d.allWeightMetrics?.[0]?.bodyFat ? `Fett ${(d.allWeightMetrics[0].bodyFat).toFixed(1)}%` : null} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Ingen vekt­målinger registrert siste 7 dager.</div>
        )}
      </Section>

      {/* ---- Aktiviteter ---- */}
      <Section title={`Aktiviteter siste 7 dager (${activities.length})`} icon={<Dumbbell size={14} />}>
        {activities.length === 0 ? (
          <div className="text-xs text-muted-foreground">Ingen aktiviteter registrert.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Når</th>
                  <th className="text-left">Type</th>
                  <th className="text-left">Navn</th>
                  <th className="text-right">Varighet</th>
                  <th className="text-right">Distanse</th>
                  <th className="text-right">Snitt-puls</th>
                  <th className="text-right">Maks-puls</th>
                  <th className="text-right">Kcal</th>
                  <th className="text-right">Stigning</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id} className="border-t border-border/30">
                    <td className="py-1">{dateTime(a.start_time_local)}</td>
                    <td className="capitalize">{a.activity_type ?? "—"}</td>
                    <td className="truncate max-w-[200px]">{a.activity_name ?? "—"}</td>
                    <td className="text-right tabular-nums">{hhmm(a.duration_seconds)}</td>
                    <td className="text-right tabular-nums">{a.distance_meters ? `${(a.distance_meters / 1000).toFixed(2)} km` : "—"}</td>
                    <td className="text-right tabular-nums">{a.average_hr ?? "—"}</td>
                    <td className="text-right tabular-nums">{a.max_hr ?? "—"}</td>
                    <td className="text-right tabular-nums">{a.calories ?? "—"}</td>
                    <td className="text-right tabular-nums">{a.elevation_gain ? `${Number(a.elevation_gain).toFixed(0)} m` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ---- Race-predictions ---- */}
      {rp && (
        <Section title="Race-predikering (klokkens spådommer)" icon={<Trophy size={14} />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="5 km" value={secToTime(rp.time5K)} />
            <Stat label="10 km" value={secToTime(rp.time10K)} />
            <Stat label="Halv­maraton" value={secToTime(rp.timeHalfMarathon)} />
            <Stat label="Maraton" value={secToTime(rp.timeMarathon)} />
          </div>
        </Section>
      )}

      {/* ---- Personlige rekorder ---- */}
      {Array.isArray(prs) && prs.length > 0 && (
        <Section title={`Personlige rekorder (${prs.length})`} icon={<Award size={14} />} defaultOpen={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {prs.slice(0, 24).map((p: any, i: number) => (
              <div key={i} className="rounded border border-border/60 bg-background/40 p-2 text-xs">
                <div className="font-semibold">{p.typeId ? `Type ${p.typeId}` : "Rekord"} · {p.activityName ?? ""}</div>
                <div className="text-muted-foreground tabular-nums">Verdi: {p.value ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">{p.prStartTimeLocal ? dateTime(p.prStartTimeLocal) : ""}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---- Mål ---- */}
      {Array.isArray(activeGoals) && activeGoals.length > 0 && (
        <Section title="Aktive mål" icon={<Target size={14} />} defaultOpen={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeGoals.map((g: any, i: number) => (
              <div key={i} className="rounded border border-border/60 bg-background/40 p-2 text-xs">
                <div className="font-semibold">{g.name ?? g.goalTypeName ?? "Mål"}</div>
                <div className="text-muted-foreground">{g.currentValue ?? 0} / {g.targetValue ?? "—"} {g.unit ?? ""}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---- Badges ---- */}
      {Array.isArray(badges) && badges.length > 0 && (
        <Section title={`Merker (${badges.length})`} icon={<Award size={14} />} defaultOpen={false}>
          <div className="flex flex-wrap gap-2">
            {badges.slice(0, 60).map((b: any, i: number) => (
              <div key={i} className="rounded border border-border/60 bg-background/40 p-2 text-[11px] flex items-center gap-2">
                {b.badgeImageUrl && <img src={b.badgeImageUrl} alt="" className="h-6 w-6" loading="lazy" />}
                <div>
                  <div className="font-semibold">{b.badgeName ?? b.name ?? "Merke"}</div>
                  {b.earnedDate && <div className="text-muted-foreground">{new Date(b.earnedDate).toLocaleDateString("nb-NO")}</div>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---- Utstyr / gear ---- */}
      {Array.isArray(gear) && gear.length > 0 && (
        <Section title={`Utstyr (${gear.length})`} icon={<Cog size={14} />} defaultOpen={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {gear.map((g: any, i: number) => (
              <div key={i} className="rounded border border-border/60 bg-background/40 p-2 text-xs">
                <div className="font-semibold">{g.displayName ?? g.customMakeModel ?? "Utstyr"}</div>
                <div className="text-muted-foreground">{g.gearTypeName ?? ""} {g.totalDistance ? `· ${(g.totalDistance / 1000).toFixed(1)} km` : ""}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---- Bruker-profil / klokkens innstillinger ---- */}
      {(userProfile || social || userSummary) && (
        <Section title="Profil & innstillinger" icon={<Cog size={14} />} defaultOpen={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <KV k="Display-navn" v={social?.displayName ?? "—"} />
              <KV k="Fullt navn" v={social?.fullName ?? "—"} />
              <KV k="Sted" v={social?.location ?? "—"} />
              <KV k="Tidssone" v={userProfile?.userData?.timeZone ?? "—"} />
              <KV k="Måleenheter" v={userProfile?.userData?.measurementSystem ?? "—"} />
              <KV k="Høyde" v={userProfile?.userData?.height ? `${userProfile.userData.height} cm` : "—"} />
              <KV k="Vekt (profil)" v={userProfile?.userData?.weight ? `${(userProfile.userData.weight / 1000).toFixed(1)} kg` : "—"} />
              <KV k="Maks-puls" v={userProfile?.userData?.handednessTypeId ?? userProfile?.userSleep?.defaultSleepEndTimestampGMT ?? "—"} />
            </div>
            <div className="space-y-1">
              <KV k="Skritt-mål (i dag)" v={userSummary?.dailyStepGoal ?? "—"} />
              <KV k="Auto-skritt-mål" v={userSummary?.userDailySummaryDTO?.userDailyStepGoal ?? "—"} />
              <KV k="Søvn-mål" v={userProfile?.userSleep?.defaultSleepGoal ?? "—"} />
              <KV k="Aktivitets-nivå" v={userProfile?.userData?.activityLevel ?? "—"} />
              <KV k="VO₂max profil" v={userProfile?.userData?.vo2MaxRunning ?? "—"} />
              <KV k="HRV status" v={hrv?.hrvSummary?.status ?? "—"} />
              <KV k="Form-alder" v={fa?.estimatedFitnessAge ?? fa?.fitnessAge ?? "—"} />
            </div>
          </div>
        </Section>
      )}

      {/* ---- Diagnostikk ---- */}
      <Section title="Diagnostikk (rå-detalj)" icon={<AlertTriangle size={14} />} defaultOpen={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          {Object.entries(live).map(([k, v]: any) => (
            <div key={k} className={`rounded border px-2 py-1 ${v.ok ? "border-emerald-500/30 bg-emerald-950/20" : "border-amber-500/30 bg-amber-950/20"}`}>
              <div className="font-mono truncate">{k}</div>
              <div className={v.ok ? "text-emerald-400" : "text-amber-400"}>{v.ok ? "OK" : "feil"}</div>
              {!v.ok && <div className="text-[10px] text-muted-foreground truncate">{v.error}</div>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function asArr<T = any>(x: T | T[] | null | undefined): T[] | null {
  if (x == null) return null;
  return Array.isArray(x) ? x : [x];
}
function stressLabel(v: number | null | undefined): string | null {
  if (v == null) return null;
  if (v < 26) return "Hvile";
  if (v < 51) return "Lavt";
  if (v < 76) return "Middels";
  return "Høyt";
}
function bbSum(events: any[] | null | undefined, kind: "charged" | "drained"): number {
  if (!Array.isArray(events)) return 0;
  return events.reduce<number>((acc, e) => acc + (e?.[`${kind}Value`] ?? 0), 0);
}
function secToTime(s: number | null | undefined): string {
  if (!s || !isFinite(s)) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (h > 0) return `${h}t ${String(m).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  return `${m}m ${String(ss).padStart(2, "0")}s`;
}

// --------- Hovedpanel med tabs ----------------------------------------------
export function SmartklokkePanel() {
  const [tab, setTab] = useState<Owner>("arne");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Owner)} className="w-full">
      <TabsList className="grid grid-cols-2 w-full bg-card/40 border border-border/60 h-auto p-1">
        <TabsTrigger
          value="arne"
          className="data-[state=active]:bg-slate-800/60 data-[state=active]:text-slate-100 data-[state=active]:border-slate-400/50 border border-transparent flex items-center gap-1.5"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
        >
          <Crown className="h-3.5 w-3.5" /> Arne — Fenix 8 Pro
        </TabsTrigger>
        <TabsTrigger
          value="rebekka"
          className="data-[state=active]:bg-rose-950/60 data-[state=active]:text-rose-100 data-[state=active]:border-rose-500/50 border border-transparent flex items-center gap-1.5"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
        >
          <Flame className="h-3.5 w-3.5" /> Rebekka — Fenix 8 AMOLED
        </TabsTrigger>
      </TabsList>
      <TabsContent value="arne" className="mt-3"><OwnerView owner="arne" /></TabsContent>
      <TabsContent value="rebekka" className="mt-3"><OwnerView owner="rebekka" /></TabsContent>
    </Tabs>
  );
}
