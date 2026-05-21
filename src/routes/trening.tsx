import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Footprints, Heart, Moon, Battery, Brain, Dumbbell, Activity as ActivityIcon } from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { ActivityMap } from "@/components/ActivityMap";
import { GarminHouses } from "@/components/GarminHouses";
import { getActivityStreams, getStravaDashboard, getStravaStatus } from "@/server/strava";
import { getGarminCore } from "@/server/garmin.functions";
import treningImg from "@/assets/got-trening.jpg";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Crown, Flame, Swords } from "lucide-react";

export const Route = createFileRoute("/trening")({
  head: () => ({
    meta: [
      { title: "Treningssalen — Kroppen som rustning | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Husets treningskrønike — Arnes Strava-data, ukens innsats, trender, totaler og siste turer på kart.",
      },
      { property: "og:title", content: "Treningssalen | House Pettersen Riis" },
      { property: "og:description", content: "Styrke, utholdenhet og disiplin." },
      { property: "og:image", content: treningImg },
    ],
  }),
  component: TreningPage,
});

type TotalBlock = {
  count: number;
  distance: number;
  moving_time: number;
  elevation_gain: number;
};

type StatusState =
  | { kind: "loading" }
  | { kind: "disconnected" }
  | { kind: "connected"; athleteName: string | null };

type PeriodBucket = {
  key: string;
  label: string;
  count: number;
  distanceMeters: number;
  movingSeconds: number;
  elevationMeters: number;
  avgHeartrate: number | null;
};

type DashOk = {
  athleteName: string | null;
  week: {
    count: number;
    distanceMeters: number;
    movingSeconds: number;
    elevationMeters: number;
    avgHeartrate: number | null;
  };
  weeklyTrend: Array<{
    weekStart: string;
    label: string;
    distanceKm: number;
    movingMin: number;
    elevation: number;
    count: number;
    calories: number;
  }>;
  periodBuckets: {
    thisWeek: PeriodBucket;
    lastWeek: PeriodBucket;
    months: PeriodBucket[];
    years: PeriodBucket[];
  };
  sportBreakdown: Array<{
    sport: string;
    count: number;
    distance: number;
    movingTime: number;
    elevation: number;
  }>;
  records: {
    longestDistance: SlimAct | null;
    longestTime: SlimAct | null;
    mostElevation: SlimAct | null;
    maxHr: SlimAct | null;
    avgHr: SlimAct | null;
    maxSpeed: SlimAct | null;
    avgSpeed: SlimAct | null;
    mostKudos: SlimAct | null;
    mostAchievements: SlimAct | null;
    longestWalk: SlimAct | null;
    longestRun: SlimAct | null;
    longestRide: SlimAct | null;
    fastestRide: SlimAct | null;
  };
  walkRecent: {
    count: number;
    distance: number;
    movingTime: number;
    elevation: number;
  };
  totals: {
    recentRun: TotalBlock | null;
    recentRide: TotalBlock | null;
    recentSwim: TotalBlock | null;
    recentWalk: TotalBlock | null;
    ytdRun: TotalBlock | null;
    ytdRide: TotalBlock | null;
    ytdSwim: TotalBlock | null;
    ytdWalk: TotalBlock | null;
    allRun: TotalBlock | null;
    allRide: TotalBlock | null;
    allSwim: TotalBlock | null;
    allWalk: TotalBlock | null;
    biggestRide: number | null;
    biggestClimb: number | null;
  } | null;
  activities: Array<{
    id: number;
    name: string;
    type: string;
    distance: number;
    movingTime: number;
    elevation: number;
    startDate: string;
    avgHeartrate: number | null;
    maxHeartrate: number | null;
    avgSpeed: number | null;
    maxSpeed: number | null;
    polyline: string | null;
    kudos: number;
    achievements: number;
  }>;
};

type SlimAct = {
  id: number;
  name: string;
  type: string;
  distance: number;
  movingTime: number;
  elevation: number;
  startDate: string;
  avgHeartrate: number | null;
  maxHeartrate: number | null;
  avgSpeed: number | null;
  maxSpeed: number | null;
  kudos: number;
  achievements: number;
};

type DashState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | ({ kind: "ok" } & DashOk);

function formatKm(m: number) {
  return `${(m / 1000).toFixed(1)} km`;
}
function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}t ${m}m`;
  return `${m} min`;
}
function formatPace(distM: number, timeS: number) {
  if (!distM || !timeS) return "—";
  const minPerKm = timeS / 60 / (distM / 1000);
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}
function formatSpeedKmh(mps: number | null) {
  if (!mps) return "—";
  return `${(mps * 3.6).toFixed(1)} km/t`;
}
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function activityIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("run")) return "🏃";
  if (t.includes("ride") || t.includes("cycl") || t.includes("bike")) return "🚴";
  if (t.includes("swim")) return "🏊";
  if (t.includes("hike")) return "🥾";
  if (t.includes("walk")) return "🚶";
  if (t.includes("ski")) return "⛷";
  if (t.includes("workout") || t.includes("strength")) return "🏋";
  return "⚔";
}
function sportLabel(s: string) {
  switch (s) {
    case "run":
      return "Løping";
    case "ride":
      return "Sykling";
    case "swim":
      return "Svømming";
    case "hike":
      return "Fjelltur";
    case "walk":
      return "Gåtur";
    case "ski":
      return "Ski";
    default:
      return "Annet";
  }
}
function sportColor(s: string) {
  switch (s) {
    case "run":
      return "var(--chart-yellow)";
    case "ride":
      return "#5b9dd9";
    case "swim":
      return "#56b9b3";
    case "hike":
      return "#a37b3a";
    case "walk":
      return "#9b8456";
    case "ski":
      return "#cfd8e3";
    default:
      return "#7a7568";
  }
}

type Owner = "arne" | "rebekka";

function TreningPage() {
  const [stravaReady, setStravaReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setStravaReady(true), 1800);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets disiplin"
        title="Treningssalen"
        subtitle="Kroppen er rustning. Disiplin er sverd."
        image={treningImg}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StepsChip owner="arne" displayName="Arne" />
          <HealthStatusChip owner="arne" displayName="Arne" />
          <StepsChip owner="rebekka" displayName="Rebekka" />
          <HealthStatusChip owner="rebekka" displayName="Rebekka" />
        </div>
      </PageHero>

      <section className="container mx-auto px-4 py-12 space-y-16">
        
        <GarminHouses />
        {stravaReady ? (
          <StravaHouses />
        ) : (
          <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-center text-xs text-muted-foreground">
            Strava-krøniken lastes etter Garmin-tallene…
          </div>
        )}
      </section>
    </PageShell>
  );
}

function StepsChip({ owner = "arne", displayName }: { owner?: Owner; displayName?: string } = {}) {
  const fetchOverview = useServerFn(getGarminCore);
  const [steps, setSteps] = useState<number | null>(null);
  const [goal, setGoal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o: any = await fetchOverview({ data: { owner } });
        const today = o?.daily?.[o.daily.length - 1];
        if (!cancelled) {
          setSteps(today?.steps ?? null);
          setGoal(today?.step_goal ?? null);
        }
      } catch {
        /* stille */
      }
    })();
    return () => { cancelled = true; };
  }, [owner]);

  if (steps == null) return null;
  const pct = goal ? Math.min(100, Math.round((steps / goal) * 100)) : null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-card/70 backdrop-blur px-4 py-2 text-sm">
      <Footprints size={16} className="text-primary" />
      <span className="text-medieval text-primary">
        {displayName ? `${displayName}: ` : ""}{steps.toLocaleString("nb-NO")} skritt i dag
      </span>
      {goal && (
        <span className="text-xs text-muted-foreground">
          · mål {goal.toLocaleString("nb-NO")} ({pct}%)
        </span>
      )}
    </div>
  );
}

function RestingHrChip({ owner = "arne", displayName }: { owner?: Owner; displayName?: string } = {}) {
  const fetchOverview = useServerFn(getGarminCore);
  const [today, setToday] = useState<number | null>(null);
  const [avg7, setAvg7] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o: any = await fetchOverview({ data: { owner } });
        if (cancelled) return;
        const last = o?.daily?.[o.daily.length - 1];
        setToday(last?.resting_heart_rate ?? null);
        const last7: number[] = (o?.daily ?? [])
          .slice(-7)
          .map((d: any) => d?.resting_heart_rate)
          .filter((n: any): n is number => typeof n === "number" && n > 0);
        setAvg7(last7.length ? Math.round(last7.reduce((s, n) => s + n, 0) / last7.length) : null);
      } catch { /* stille */ }
    })();
    return () => { cancelled = true; };
  }, [owner]);

  if (today == null && avg7 == null) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-card/70 backdrop-blur px-4 py-2 text-sm">
      <Heart size={16} className="text-primary" />
      <span className="text-medieval text-primary">
        {displayName ? `${displayName}: ` : ""}Hvilepuls {today != null ? `${today} bpm` : "—"}
      </span>
      {avg7 != null && (
        <span className="text-xs text-muted-foreground">· snitt 7d {avg7} bpm</span>
      )}
    </div>
  );
}

function HealthStatusChip({ owner = "arne", displayName }: { owner?: Owner; displayName?: string } = {}) {
  const fetchOverview = useServerFn(getGarminCore);
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o: any = await fetchOverview({ data: { owner } });
        if (!cancelled) setData(o);
      } catch { /* stille */ }
    })();
    return () => { cancelled = true; };
  }, [owner]);

  if (!data) return null;

  const today = data?.daily?.[data.daily.length - 1];
  const yesterday = data?.daily && data.daily.length >= 2 ? data.daily[data.daily.length - 2] : null;
  const lastSleep = data?.sleep?.[data.sleep.length - 1];
  const rhr = today?.resting_heart_rate ?? yesterday?.resting_heart_rate ?? null;
  const sleepHrs = lastSleep?.total_seconds ? lastSleep.total_seconds / 3600 : null;
  const battery = today?.body_battery_high ?? null;
  const stress = today?.stress_average ?? null;
  const steps = typeof today?.steps === "number" ? today.steps : null;
  const stepGoal = typeof today?.step_goal === "number" && today.step_goal > 0 ? today.step_goal : 10000;

  // Enkel score (0–100) — del-skår per faktor for visning i detaljvinduet
  const rhrScore = rhr != null ? Math.max(0, Math.min(100, 100 - (rhr - 50) * 2)) : null;
  const sleepScore = sleepHrs != null ? Math.max(0, Math.min(100, (sleepHrs / 8) * 100)) : null;
  const batteryScore = battery != null ? battery : null;
  const stressScore = stress != null ? Math.max(0, 100 - stress) : null;
  const stepsScore = steps != null ? Math.max(0, Math.min(100, (steps / stepGoal) * 100)) : null;
  // Treningsklar: kombinasjon av søvn, body battery og lav stress
  const readyParts = [sleepScore, batteryScore, stressScore].filter((n): n is number => n != null);
  const readyScore = readyParts.length ? readyParts.reduce((a, b) => a + b, 0) / readyParts.length : null;

  const parts: Array<{
    key: string;
    label: string;
    icon: any;
    raw: string;
    score: number | null;
    formula: string;
    explain: string;
  }> = [
    {
      key: "rhr",
      label: "Hvilepuls",
      icon: Heart,
      raw: rhr != null ? `${rhr} slag/min` : "—",
      score: rhrScore,
      formula: "100 − (hvilepuls − 50) × 2",
      explain: "Lavere hvilepuls gir høyere skår. 50 bpm = 100, 100 bpm = 0.",
    },
    {
      key: "sleep",
      label: "Søvn",
      icon: Moon,
      raw: sleepHrs != null ? `${sleepHrs.toFixed(1)} t` : "—",
      score: sleepScore,
      formula: "(timer / 8) × 100",
      explain: "8 timer søvn gir 100. Skalerer lineært ned mot 0.",
    },
    {
      key: "battery",
      label: "Body Battery (høyeste)",
      icon: Battery,
      raw: battery != null ? `${battery}` : "—",
      score: batteryScore,
      formula: "verdi som er (0–100)",
      explain: "Brukes direkte som skår.",
    },
    {
      key: "stress",
      label: "Stressnivå (snitt)",
      icon: Brain,
      raw: stress != null ? `${stress}` : "—",
      score: stressScore,
      formula: "100 − stressnivå",
      explain: "Lavere stress gir høyere skår.",
    },
    {
      key: "ready",
      label: "Treningsklar",
      icon: Dumbbell,
      raw: readyScore != null ? `${Math.round(readyScore)} / 100` : "—",
      score: readyScore,
      formula: "snitt(søvn, body battery, 100 − stress)",
      explain: "Proxy for treningsberedskap basert på restitusjon.",
    },
    {
      key: "steps",
      label: "Skritt",
      icon: Footprints,
      raw: steps != null ? `${steps.toLocaleString("nb-NO")} / ${stepGoal.toLocaleString("nb-NO")}` : "—",
      score: stepsScore,
      formula: "(skritt / mål) × 100",
      explain: "Dagens skritt mot dagens mål. 100 ved nådd mål.",
    },
  ];

  const used = parts.filter((p) => p.score != null);
  const overall = used.length ? Math.round(used.reduce((s, p) => s + (p.score ?? 0), 0) / used.length) : null;
  const status = overall == null ? "ukjent" : overall >= 75 ? "Sterk" : overall >= 55 ? "God" : overall >= 35 ? "Trett" : "Svak";
  const color = overall == null ? "text-muted-foreground" : overall >= 75 ? "text-emerald-400" : overall >= 55 ? "text-primary" : overall >= 35 ? "text-amber-400" : "text-rose-400";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-card/70 backdrop-blur px-4 py-2 text-sm transition hover:bg-card hover:border-primary cursor-pointer"
        aria-label="Vis helsedetaljer"
      >
        <ActivityIcon size={16} className={color} />
        <span className={`text-medieval ${color}`}>{displayName ? `${displayName} · ` : ""}Helse: {status}{overall != null && ` · ${overall}`}</span>
        <span className="hidden md:inline-flex items-center gap-2 text-xs text-muted-foreground">
          {rhr != null && (<span className="inline-flex items-center gap-1"><Heart size={11} /> {rhr}</span>)}
          {sleepHrs != null && (<span className="inline-flex items-center gap-1"><Moon size={11} /> {sleepHrs.toFixed(1)}t</span>)}
          {battery != null && (<span className="inline-flex items-center gap-1"><Battery size={11} /> {battery}</span>)}
          {stress != null && (<span className="inline-flex items-center gap-1"><Brain size={11} /> {stress}</span>)}
          {readyScore != null && (<span className="inline-flex items-center gap-1"><Dumbbell size={11} /> {Math.round(readyScore)}</span>)}
          {steps != null && (<span className="inline-flex items-center gap-1"><Footprints size={11} /> {steps.toLocaleString("nb-NO")}</span>)}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="flex justify-end mt-8 mb-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 rounded border border-primary/40 text-primary text-[10px] tracking-[0.3em] uppercase hover:bg-primary/10"
            >
              Lukk
            </button>
          </div>
          <DialogHeader>
            <DialogTitle className={`text-medieval ${color}`}>
              Helse: {status}{overall != null && ` · ${overall} / 100`}
            </DialogTitle>
            <DialogDescription>
              Skåren er et snitt av delskårene under. Manglende data utelates fra snittet.
            </DialogDescription>
          </DialogHeader>

          <div
            className="space-y-2"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            {parts.map((p) => {
              const Icon = p.icon;
              const has = p.score != null;
              return (
                <div
                  key={p.key}
                  className={`rounded-lg border px-2.5 py-1.5 ${has ? "border-primary/30 bg-card/60" : "border-muted/40 bg-muted/10 opacity-70"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-primary" />
                      <span className="text-xs font-medium">{p.label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs">{p.raw}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Skår: {p.score != null ? Math.round(p.score) : "—"} / 100
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground leading-snug">
                    <div><span className="font-mono">{p.formula}</span></div>
                    <div>{p.explain}</div>
                  </div>
                </div>
              );
            })}

            <div className="rounded-lg border border-primary/40 bg-card/70 px-2.5 py-1.5">
              <div className="text-xs font-medium mb-0.5">Samlet skår</div>
              <div className="text-[10px] text-muted-foreground leading-snug">
                Snitt av {used.length} av {parts.length} delskår:{" "}
                {used.map((p) => Math.round(p.score ?? 0)).join(" + ")}
                {used.length > 0 && ` = ${used.reduce((s, p) => s + Math.round(p.score ?? 0), 0)} / ${used.length} ≈ ${overall}`}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Status: ≥75 Sterk · ≥55 God · ≥35 Trett · &lt;35 Svak
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const STRAVA_HOUSES: Record<Owner, {
  name: string;
  house: string;
  words: string;
  Icon: typeof Crown;
  accent: string;
  border: string;
  bg: string;
  bannerFrom: string;
  bannerTo: string;
}> = {
  arne: {
    name: "Arne",
    house: "House Stark",
    words: "Winter is Coming",
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
    Icon: Flame,
    accent: "text-rose-200",
    border: "border-rose-500/40",
    bg: "bg-rose-950/30",
    bannerFrom: "from-rose-900/60",
    bannerTo: "to-black/80",
  },
};

function StravaHouseBanner({ owner }: { owner: Owner }) {
  const h = STRAVA_HOUSES[owner];
  const Icon = h.Icon;
  return (
    <div className={`rounded-lg border ${h.border} bg-gradient-to-r ${h.bannerFrom} ${h.bannerTo} px-4 py-3 mb-3 flex items-center gap-3`}>
      <div className={`h-10 w-10 rounded-full border ${h.border} ${h.bg} flex items-center justify-center`}>
        <Icon className={`h-5 w-5 ${h.accent}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
          {h.house} · Strava
        </div>
        <div className={`text-lg leading-tight ${h.accent}`} style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.05em" }}>
          {h.name}s krønike
        </div>
        <div className="text-[10px] italic text-muted-foreground" style={{ fontFamily: "var(--font-medieval)" }}>
          « {h.words} »
        </div>
      </div>
    </div>
  );
}

function StravaHouses() {
  const [tab, setTab] = useState<"arne" | "rebekka" | "compare">("arne");
  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full bg-card/40 border border-border/60 h-auto p-1">
          <TabsTrigger
            value="arne"
            className="data-[state=active]:bg-slate-800/60 data-[state=active]:text-slate-100 data-[state=active]:border-slate-400/50 border border-transparent flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
          >
            <Crown className="h-3.5 w-3.5" /> Arne
          </TabsTrigger>
          <TabsTrigger
            value="rebekka"
            className="data-[state=active]:bg-rose-950/60 data-[state=active]:text-rose-100 data-[state=active]:border-rose-500/50 border border-transparent flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
          >
            <Flame className="h-3.5 w-3.5" /> Rebekka
          </TabsTrigger>
          <TabsTrigger
            value="compare"
            className="data-[state=active]:bg-amber-950/60 data-[state=active]:text-amber-100 data-[state=active]:border-amber-500/50 border border-transparent flex items-center gap-1.5"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}
          >
            <Swords className="h-3.5 w-3.5" /> Sammenlign
          </TabsTrigger>
        </TabsList>

        <TabsContent value="arne" className="mt-3">
          <StravaHouseBanner owner="arne" />
          <StravaSection owner="arne" displayName="Arne" />
        </TabsContent>
        <TabsContent value="rebekka" className="mt-3">
          <StravaHouseBanner owner="rebekka" />
          <StravaSection owner="rebekka" displayName="Rebekka" />
        </TabsContent>
        <TabsContent value="compare" className="mt-3">
          <StravaCompare />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StravaCompare() {
  const fetchStatus = useServerFn(getStravaStatus);
  const fetchDash = useServerFn(getStravaDashboard);
  const [arne, setArne] = useState<DashOk | null>(null);
  const [rebekka, setRebekka] = useState<DashOk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const load = async (owner: Owner) => {
          const s = await fetchStatus({ data: { owner } });
          if (!s.connected) return null;
          const r = await fetchDash({ data: { owner } });
          return r.ok ? (r as DashOk) : null;
        };
        const [a, r] = await Promise.all([load("arne"), load("rebekka")]);
        if (!cancelled) {
          setArne(a);
          setRebekka(r);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Ukjent feil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <p className="text-center text-sm text-muted-foreground italic">Veier de to husene mot hverandre…</p>;
  }
  if (error) {
    return <p className="text-center text-xs text-destructive">{error}</p>;
  }
  if (!arne && !rebekka) {
    return <p className="text-center text-sm text-muted-foreground">Ingen av husene er lenket til Strava ennå.</p>;
  }

  const fmtKm = (m: number | null | undefined) => m == null ? "—" : `${(m / 1000).toFixed(1)} km`;
  const fmtDur = (s: number | null | undefined) => s == null ? "—" : formatDuration(s);
  const fmtNum = (n: number | null | undefined, suf = "") => n == null ? "—" : `${Math.round(n)}${suf}`;
  const fmtSpeed = (mps: number | null | undefined) => mps == null ? "—" : `${(mps * 3.6).toFixed(1)} km/t`;

  type Row = {
    label: string;
    arne: { display: string; value: number | null };
    rebekka: { display: string; value: number | null };
    higherIsBetter: boolean;
  };

  const w = (d: DashOk | null) => d?.periodBuckets.thisWeek;
  const lw = (d: DashOk | null) => d?.periodBuckets.lastWeek;
  const yr = (d: DashOk | null) => d?.periodBuckets.years?.[0];

  const rows: Row[] = [
    {
      label: "🏃 Aktiviteter denne uka",
      arne: { display: String(w(arne)?.count ?? 0), value: w(arne)?.count ?? 0 },
      rebekka: { display: String(w(rebekka)?.count ?? 0), value: w(rebekka)?.count ?? 0 },
      higherIsBetter: true,
    },
    {
      label: "📏 Distanse denne uka",
      arne: { display: fmtKm(w(arne)?.distanceMeters), value: w(arne)?.distanceMeters ?? null },
      rebekka: { display: fmtKm(w(rebekka)?.distanceMeters), value: w(rebekka)?.distanceMeters ?? null },
      higherIsBetter: true,
    },
    {
      label: "⏱ Tid denne uka",
      arne: { display: fmtDur(w(arne)?.movingSeconds), value: w(arne)?.movingSeconds ?? null },
      rebekka: { display: fmtDur(w(rebekka)?.movingSeconds), value: w(rebekka)?.movingSeconds ?? null },
      higherIsBetter: true,
    },
    {
      label: "⛰ Høydemeter denne uka",
      arne: { display: fmtNum(w(arne)?.elevationMeters, " m"), value: w(arne)?.elevationMeters ?? null },
      rebekka: { display: fmtNum(w(rebekka)?.elevationMeters, " m"), value: w(rebekka)?.elevationMeters ?? null },
      higherIsBetter: true,
    },
    {
      label: "❤ Snittpuls denne uka",
      arne: { display: fmtNum(w(arne)?.avgHeartrate, " bpm"), value: w(arne)?.avgHeartrate ?? null },
      rebekka: { display: fmtNum(w(rebekka)?.avgHeartrate, " bpm"), value: w(rebekka)?.avgHeartrate ?? null },
      higherIsBetter: false,
    },
    {
      label: "📅 Distanse forrige uke",
      arne: { display: fmtKm(lw(arne)?.distanceMeters), value: lw(arne)?.distanceMeters ?? null },
      rebekka: { display: fmtKm(lw(rebekka)?.distanceMeters), value: lw(rebekka)?.distanceMeters ?? null },
      higherIsBetter: true,
    },
    {
      label: "🗓 Distanse i år",
      arne: { display: fmtKm(yr(arne)?.distanceMeters), value: yr(arne)?.distanceMeters ?? null },
      rebekka: { display: fmtKm(yr(rebekka)?.distanceMeters), value: yr(rebekka)?.distanceMeters ?? null },
      higherIsBetter: true,
    },
    {
      label: "🏆 Lengste tur (rekord)",
      arne: { display: fmtKm(arne?.records.longestDistance?.distance), value: arne?.records.longestDistance?.distance ?? null },
      rebekka: { display: fmtKm(rebekka?.records.longestDistance?.distance), value: rebekka?.records.longestDistance?.distance ?? null },
      higherIsBetter: true,
    },
    {
      label: "💥 Maks puls",
      arne: { display: fmtNum(arne?.records.maxHr?.maxHeartrate, " bpm"), value: arne?.records.maxHr?.maxHeartrate ?? null },
      rebekka: { display: fmtNum(rebekka?.records.maxHr?.maxHeartrate, " bpm"), value: rebekka?.records.maxHr?.maxHeartrate ?? null },
      higherIsBetter: true,
    },
    {
      label: "⚡ Maks fart",
      arne: { display: fmtSpeed(arne?.records.maxSpeed?.maxSpeed), value: arne?.records.maxSpeed?.maxSpeed ?? null },
      rebekka: { display: fmtSpeed(rebekka?.records.maxSpeed?.maxSpeed), value: rebekka?.records.maxSpeed?.maxSpeed ?? null },
      higherIsBetter: true,
    },
  ];

  let arneWins = 0;
  let rebekkaWins = 0;
  for (const r of rows) {
    const a = r.arne.value;
    const b = r.rebekka.value;
    if (a == null && b == null) continue;
    if (a == null) { rebekkaWins++; continue; }
    if (b == null) { arneWins++; continue; }
    if (a === b) continue;
    if (r.higherIsBetter ? a > b : a < b) arneWins++; else rebekkaWins++;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-400/40 bg-slate-900/40 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>House Stark</div>
          <div className="text-2xl text-slate-200" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{arneWins}</div>
          <div className="text-[10px] text-muted-foreground">seire</div>
        </div>
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>House Targaryen</div>
          <div className="text-2xl text-rose-200" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{rebekkaWins}</div>
          <div className="text-[10px] text-muted-foreground">seire</div>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-3 py-2 border-b border-border/60" style={{ fontFamily: "var(--font-display)" }}>
          <div>Måling</div>
          <div className="text-right">Arne</div>
          <div className="text-right">Rebekka</div>
        </div>
        {rows.map((r, i) => {
          const a = r.arne.value;
          const b = r.rebekka.value;
          let aWin = false, bWin = false;
          if (a != null && b != null && a !== b) {
            if (r.higherIsBetter ? a > b : a < b) aWin = true; else bWin = true;
          } else if (a != null && b == null) aWin = true;
          else if (b != null && a == null) bWin = true;
          return (
            <div key={i} className={`grid grid-cols-[1.4fr_1fr_1fr] items-center px-3 py-2 text-sm ${i % 2 ? "bg-card/20" : ""}`}>
              <div className="text-muted-foreground">{r.label}</div>
              <div className={`text-right ${aWin ? "text-slate-100 font-semibold" : "text-foreground/70"}`}>
                {r.arne.display}{aWin && " 👑"}
              </div>
              <div className={`text-right ${bWin ? "text-rose-200 font-semibold" : "text-foreground/70"}`}>
                {r.rebekka.display}{bWin && " 🔥"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StravaSection({ owner, displayName }: { owner: Owner; displayName: string }) {
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [dash, setDash] = useState<DashState>({ kind: "idle" });
  const fetchStatus = useServerFn(getStravaStatus);
  const fetchDash = useServerFn(getStravaDashboard);

  const loadStatus = async () => {
    try {
      const s = await fetchStatus({ data: { owner } });
      if (s.connected) {
        setStatus({ kind: "connected", athleteName: s.athleteName });
      } else {
        setStatus({ kind: "disconnected" });
        setDash({ kind: "idle" });
      }
    } catch {
      setStatus({ kind: "disconnected" });
    }
  };

  const loadDash = async () => {
    setDash({ kind: "loading" });
    try {
      const res = await fetchDash({ data: { owner } });
      if (res.ok) {
        setDash({ kind: "ok", ...res });
      } else {
        setDash({ kind: "error", message: res.error });
      }
    } catch (e: any) {
      setDash({ kind: "error", message: e?.message ?? "Ukjent feil" });
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  useEffect(() => {
    if (status.kind === "connected") loadDash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.kind]);

  return (
    <div>
      <div className="ornate-divider mb-8">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          {displayName}s Krønike · Strava
        </span>
      </div>

      {status.kind === "loading" && (
        <p className="text-center text-sm text-muted-foreground">Sender bud til Strava…</p>
      )}

      {status.kind === "disconnected" && (
        <div className="panel rounded-lg p-8 text-center max-w-xl mx-auto">
          <p className="text-medieval text-lg text-primary mb-2">Krøniken er ikke lenket</p>
          <p className="text-sm text-muted-foreground mb-6">
            Koble {displayName}s Strava for å vise ukens innsats, siste turer og kart fra marka.
          </p>
          <a
            href={`/api/strava/start?owner=${owner}`}
            className="inline-flex items-center gap-2 rounded-md bg-[#FC4C02] px-6 py-3 text-sm font-medium text-white hover:bg-[#e04400] transition-colors"
          >
            Koble {displayName} til Strava
          </a>
        </div>
      )}

      {status.kind === "connected" && (
        <>
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-muted-foreground">
              Lenket til{" "}
              <span className="text-primary text-medieval">
                {dash.kind === "ok" && dash.athleteName
                  ? dash.athleteName
                  : status.athleteName ?? displayName}
              </span>
            </p>
            <div className="flex items-center gap-3">
              <a
                href={`/api/strava/start?owner=${owner}`}
                className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary"
                title="Bytt Strava-konto"
              >
                ↺ Bytt konto
              </a>
              <button
                onClick={loadDash}
                disabled={dash.kind === "loading"}
                className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary disabled:opacity-50"
              >
                ↻ Oppfrisk krøniken
              </button>
            </div>
          </div>

          {dash.kind === "loading" && (
            <p className="text-center text-sm text-muted-foreground italic">
              Budbringeren rir gjennom marka…
            </p>
          )}

          {dash.kind === "error" && (
            <div className="panel rounded-lg p-6 text-center max-w-xl mx-auto">
              <p className="text-xs tracking-[0.3em] text-destructive uppercase mb-2">
                Budet kom ikke fram
              </p>
              <p className="text-xs text-muted-foreground">{dash.message}</p>
            </div>
          )}

          {dash.kind === "ok" && <DashboardView dash={dash} owner={owner} />}
        </>
      )}
    </div>
  );
}

function DashboardView({ dash, owner }: { dash: DashOk; owner: Owner }) {
  return (
    <>
      {/* Topp-stats med periodefilter */}
      <PeriodStats periodBuckets={dash.periodBuckets} />

      {/* 4 ukers trend */}
      <SubHeader text="4 ukers trend" />
      <WeeklyTrendChart data={dash.weeklyTrend} />

      {/* Sportsfordeling */}
      <SubHeader text="Sportsfordeling · siste 100 dåder" />
      <SportBreakdown data={dash.sportBreakdown} />

      {/* Totaler */}
      {dash.totals && (
        <>
          <SubHeader text="Husets store regnskap" />
          <TotalsGrid totals={dash.totals} mostElevation={dash.records.mostElevation} />
        </>
      )}

      {/* Rekorder */}
      <SubHeader text="Bragder & rekorder" />
      <RecordsGrid records={dash.records} />

      {/* Gåing — siste 100 dåder (Strava AthleteStats har ikke walk-totaler) */}
      {dash.walkRecent.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Stat
            label="🚶 Gåturer"
            value={String(dash.walkRecent.count)}
            hint="siste 100 dåder"
          />
          <Stat
            label="🚶 Distanse gått"
            value={formatKm(dash.walkRecent.distance)}
            hint="siste 100 dåder"
          />
          <Stat
            label="🚶 Tid på beina"
            value={formatDuration(dash.walkRecent.movingTime)}
            hint="siste 100 dåder"
          />
          <Stat
            label="🚶 Stigning"
            value={`${Math.round(dash.walkRecent.elevation)} m`}
            hint="siste 100 dåder"
          />
        </div>
      )}

      {/* Aktiviteter */}
      <SubHeader text="De siste dåder" />
      <ActivitiesPaginated activities={dash.activities} owner={owner} />
    </>
  );
}

function ActivitiesPaginated({ activities, owner }: { activities: DashOk["activities"]; owner: Owner }) {
  const PAGE_SIZE = 9;
  const INITIAL = 3;
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const totalPages = expanded ? Math.max(1, Math.ceil(activities.length / PAGE_SIZE)) : 1;
  const start = expanded ? page * PAGE_SIZE : 0;
  const slice = expanded ? activities.slice(start, start + PAGE_SIZE) : activities.slice(0, INITIAL);

  return (
    <>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slice.map((a, idx) => {
          const globalIdx = start + idx + 1;
          const isRun = a.type.toLowerCase().includes("run");
          return (
            <li key={a.id}>
              <a
                href={`https://www.strava.com/activities/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full"
                title="Åpne i Strava"
              >
                <article className="panel rounded-lg overflow-hidden glow-on-hover relative h-full flex flex-col transition-transform hover:-translate-y-0.5">
                  <div className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-background/80 border border-primary/40 flex items-center justify-center">
                    <span className="text-medieval text-primary text-xs leading-none">
                      {globalIdx}
                    </span>
                  </div>
                  <div
                    className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-[#FC4C02]/90 text-[9px] uppercase tracking-[0.15em] text-white font-medium"
                    title="Åpne i Strava"
                  >
                    Strava ↗
                  </div>

                  {a.polyline ? (
                    <div className="aspect-[16/9] bg-muted">
                      <ActivityMap encoded={a.polyline} />
                    </div>
                  ) : (
                    <div className="aspect-[16/9] bg-muted/40 flex items-center justify-center">
                      <span className="text-3xl opacity-30">{activityIcon(a.type)}</span>
                    </div>
                  )}

                  <div className="p-3 flex flex-col flex-1">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <h3 className="text-sm text-primary text-medieval truncate">
                        {activityIcon(a.type)} {a.name}
                      </h3>
                    </div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-2 truncate">
                      {formatDate(a.startDate)} · {a.type}
                    </p>

                    <ActivityStreams activityId={a.id} owner={owner} />

                    <div className="grid grid-cols-2 gap-1.5 text-xs text-foreground/90 mt-2">
                      <MiniMetric label="Dist" value={formatKm(a.distance)} />
                      <MiniMetric label="Tid" value={formatDuration(a.movingTime)} />
                      <MiniMetric
                        label={isRun ? "Tempo" : "Stigning"}
                        value={
                          isRun
                            ? formatPace(a.distance, a.movingTime)
                            : `${Math.round(a.elevation)} m`
                        }
                      />
                      <MiniMetric
                        label="Puls"
                        value={a.avgHeartrate ? `${Math.round(a.avgHeartrate)}` : "—"}
                      />
                    </div>
                  </div>
                </article>
              </a>
            </li>
          );
        })}
      </ol>

      {!expanded && activities.length > INITIAL && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setExpanded(true)}
            className="px-4 py-1.5 rounded border border-primary/30 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:border-primary"
          >
            Vis resterende ({activities.length - INITIAL})
          </button>
        </div>
      )}

      {expanded && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => { setExpanded(false); setPage(0); }}
            className="px-3 py-1.5 rounded border border-primary/30 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:border-primary"
          >
            Skjul
          </button>
          {totalPages > 1 && (
            <>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded border border-primary/30 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Forrige
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`w-8 h-8 rounded border text-xs text-medieval transition-colors ${
                    i === page
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-primary/20 text-muted-foreground hover:text-primary hover:border-primary/50"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-3 py-1.5 rounded border border-primary/30 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Neste →
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-primary/15 bg-background/40 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground leading-tight">
        {label}
      </div>
      <div className="text-xs text-primary leading-tight mt-0.5 truncate">{value}</div>
    </div>
  );
}

function ActivityStreams({ activityId, owner }: { activityId: number; owner: Owner }) {
  const fetchStreams = useServerFn(getActivityStreams);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | {
        kind: "ok";
        altitude: number[] | null;
        heartrate: number[] | null;
        speed: number[] | null;
      }
    | { kind: "error" }
  >({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchStreams({ data: { activityId, owner } })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setState({
            kind: "ok",
            altitude: res.altitude,
            heartrate: res.heartrate,
            speed: res.speed,
          });
        } else {
          setState({ kind: "error" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [activityId, owner, fetchStreams]);

  if (state.kind === "loading" || state.kind === "idle") {
    return <div className="h-12 rounded bg-muted/30 animate-pulse" />;
  }
  if (state.kind === "error") {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        <Sparkline
          data={state.altitude}
          color="#5aa9ff"
          fill="rgba(90, 169, 255, 0.18)"
          label="Stigning"
          unit="m"
        />
        <Sparkline
          data={state.speed}
          color="#4ade80"
          fill="rgba(74, 222, 128, 0.18)"
          label="Fart"
          unit="km/t"
        />
        <Sparkline
          data={state.heartrate}
          color="#d96666"
          fill="rgba(217, 102, 102, 0.18)"
          label="Puls"
          unit="bpm"
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <StreamStats data={state.altitude} unit="m" color="#5aa9ff" decimals={0} />
        <StreamStats data={state.speed} unit="km/t" color="#4ade80" decimals={1} />
        <StreamStats data={state.heartrate} unit="" color="#d96666" decimals={0} />
      </div>
    </div>
  );
}

function StreamStats({
  data,
  unit,
  color,
  decimals,
}: {
  data: number[] | null;
  unit: string;
  color: string;
  decimals: number;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded border border-primary/10 bg-background/30 px-1 py-1 flex items-center justify-center">
        <span className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground">—</span>
      </div>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const avg = data.reduce((s, v) => s + v, 0) / data.length;
  const fmt = (v: number) => v.toFixed(decimals);
  return (
    <div
      className="rounded border bg-background/40 px-1 py-1 grid grid-cols-3 gap-0.5"
      style={{ borderColor: `${color}33` }}
    >
      <StatCell label="Min" value={fmt(min)} unit={unit} />
      <StatCell label="Snitt" value={fmt(avg)} unit={unit} />
      <StatCell label="Maks" value={fmt(max)} unit={unit} />
    </div>
  );
}

function StatCell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="text-center leading-tight">
      <div className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className="text-[10px] text-primary truncate">
        {value}
        {unit && <span className="text-muted-foreground/70">{unit}</span>}
      </div>
    </div>
  );
}

function Sparkline({
  data,
  color,
  fill,
  label,
  unit,
}: {
  data: number[] | null;
  color: string;
  fill: string;
  label: string;
  unit: string;
}) {
  if (!data || data.length < 2) {
    return (
      <div className="rounded border border-primary/10 bg-background/40 p-1.5 flex items-center justify-center h-12">
        <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
          {label} —
        </span>
      </div>
    );
  }
  const W = 100;
  const H = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = W / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M${pts.join(" L")}`;
  const areaPath = `M0,${H} L${pts.join(" L")} L${W},${H} Z`;
  const last = Math.round(data[data.length - 1]);
  const peak = Math.round(max);

  return (
    <div className="rounded border border-primary/10 bg-background/40 p-1.5">
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[9px] text-primary/80">
          {peak}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-7" preserveAspectRatio="none">
        <path d={areaPath} fill={fill} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
      </svg>
      <div className="text-[9px] text-muted-foreground text-right leading-none mt-0.5">
        nå {last}
        {unit}
      </div>
    </div>
  );
}


function SubHeader({ text }: { text: string }) {
  return (
    <div className="ornate-divider mb-6 mt-12">
      <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">{text}</span>
    </div>
  );
}

function WeeklyTrendChart({
  data,
}: {
  data: Array<{ weekStart: string; label: string; distanceKm: number; movingMin: number; elevation: number; count: number; calories: number }>;
}) {
  const maxKm = useMemo(() => Math.max(1, ...data.map((d) => d.distanceKm)), [data]);
  const maxElev = useMemo(() => Math.max(1, ...data.map((d) => d.elevation)), [data]);
  const maxKcal = useMemo(() => Math.max(1, ...data.map((d) => d.calories)), [data]);

  return (
    <div className="panel rounded-lg p-5 mb-6">
      <div className="grid grid-cols-4 gap-4">
        {data.map((w) => {
          const kmPct = (w.distanceKm / maxKm) * 100;
          const elPct = (w.elevation / maxElev) * 100;
          const kcalPct = (w.calories / maxKcal) * 100;
          return (
            <div key={w.weekStart} className="flex flex-col">
              <div className="flex items-end justify-center gap-2 h-40">
                <div className="flex flex-col items-center justify-end h-full w-5">
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${Math.max(2, kmPct)}%` }}
                    title={`${w.distanceKm.toFixed(1)} km`}
                  />
                </div>
                <div className="flex flex-col items-center justify-end h-full w-5">
                  <div
                    className="w-full rounded-t bg-primary/30"
                    style={{ height: `${Math.max(2, elPct)}%` }}
                    title={`${Math.round(w.elevation)} m`}
                  />
                </div>
                <div className="flex flex-col items-center justify-end h-full w-5">
                  <div
                    className="w-full rounded-t bg-orange-500/70"
                    style={{ height: `${Math.max(2, kcalPct)}%` }}
                    title={`${Math.round(w.calories)} kcal`}
                  />
                </div>
              </div>
              <div className="mt-2 text-center">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {w.label}
                </div>
                <div className="text-sm text-primary mt-1">{w.distanceKm.toFixed(1)} km</div>
                <div className="text-[10px] text-muted-foreground">
                  {Math.round(w.elevation)} m · {w.count} økter
                </div>
                <div className="text-[10px] text-orange-500/90 mt-0.5">
                  {Math.round(w.calories).toLocaleString("nb-NO")} kcal
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary/70" /> Distanse
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary/30" /> Stigning
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-orange-500/70" /> Kalorier (est.)
        </span>
      </div>
    </div>
  );
}

function SportBreakdown({
  data,
}: {
  data: Array<{ sport: string; count: number; distance: number; movingTime: number; elevation: number }>;
}) {
  const totalDist = data.reduce((sum, d) => sum + d.distance, 0) || 1;
  return (
    <div className="panel rounded-lg p-5 mb-6">
      <div className="space-y-3">
        {data.map((s) => {
          const pct = (s.distance / totalDist) * 100;
          return (
            <div key={s.sport}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="text-foreground/90">
                  {sportLabel(s.sport)}{" "}
                  <span className="text-muted-foreground text-xs">· {s.count} økter</span>
                </span>
                <span className="text-primary text-medieval">
                  {formatKm(s.distance)}{" "}
                  <span className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase">
                    {pct.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-background/60 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: sportColor(s.sport) }}
                />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {formatDuration(s.movingTime)} · {Math.round(s.elevation)} m stigning
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TotalsGrid({
  totals,
  mostElevation,
}: {
  totals: NonNullable<DashOk["totals"]>;
  mostElevation: SlimAct | null;
}) {
  const hasData = (t: TotalBlock | null): t is TotalBlock =>
    !!t && (t.count > 0 || t.distance > 0 || t.moving_time > 0);

  const block = (label: string, t: TotalBlock | null) => {
    if (!hasData(t)) return null;
    return (
      <div key={label} className="panel rounded-lg p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
        <div className="text-2xl text-primary mt-1">{formatKm(t.distance)}</div>
        <div className="text-[11px] text-muted-foreground mt-1">
          {t.count} økter · {formatDuration(t.moving_time)} ·{" "}
          {Math.round(t.elevation_gain)} m
        </div>
      </div>
    );
  };

  const recentCards = [
    block("Løping", totals.recentRun),
    block("Sykling", totals.recentRide),
    block("Svømming", totals.recentSwim),
    block("Gåing", totals.recentWalk),
  ].filter(Boolean);
  const ytdCards = [
    block("Løping", totals.ytdRun),
    block("Sykling", totals.ytdRide),
    block("Svømming", totals.ytdSwim),
    block("Gåing", totals.ytdWalk),
  ].filter(Boolean);
  const allCards = [
    block("Løping totalt", totals.allRun),
    block("Sykling totalt", totals.allRide),
    block("Svømming totalt", totals.allSwim),
    block("Gåing totalt", totals.allWalk),
  ].filter(Boolean);

  return (
    <div className="space-y-6 mb-6">
      {recentCards.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
            Siste 4 uker
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentCards}
          </div>
        </div>
      )}
      {ytdCards.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
            Hittil i år
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ytdCards}
          </div>
        </div>
      )}
      {allCards.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
            Siden tidenes morgen
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {allCards}
          </div>
          {(totals.biggestRide || mostElevation) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {totals.biggestRide && (
                <Stat
                  label="Lengste sykkeltur noensinne"
                  value={formatKm(totals.biggestRide)}
                  hint="rekord"
                />
              )}
              {mostElevation && (
                <Stat
                  label="Største klatring noensinne"
                  value={`${Math.round(mostElevation.elevation)} m`}
                  hint={mostElevation.name}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecordsGrid({ records }: { records: DashOk["records"] }) {
  const card = (title: string, icon: string, a: SlimAct | null, value: string) => (
    <div className="panel rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {icon} {title}
      </div>
      <div className="text-xl text-primary text-medieval mt-2">{value}</div>
      {a && (
        <div className="text-[11px] text-muted-foreground mt-1 truncate">
          {a.name} · {formatDate(a.startDate)}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
      {card(
        "Lengste tur",
        "🛡",
        records.longestDistance,
        records.longestDistance ? formatKm(records.longestDistance.distance) : "—",
      )}
      {card(
        "Lengste tid",
        "⌛",
        records.longestTime,
        records.longestTime ? formatDuration(records.longestTime.movingTime) : "—",
      )}
      {card(
        "Mest stigning",
        "⛰",
        records.mostElevation,
        records.mostElevation ? `${Math.round(records.mostElevation.elevation)} m` : "—",
      )}
      {card(
        "Høyeste puls",
        "❤",
        records.maxHr,
        records.maxHr?.maxHeartrate ? `${Math.round(records.maxHr.maxHeartrate)} bpm` : "—",
      )}
      {card(
        "Høyeste snittpuls",
        "♥",
        records.avgHr,
        records.avgHr?.avgHeartrate ? `${Math.round(records.avgHr.avgHeartrate)} bpm` : "—",
      )}
      {card(
        "Toppfart",
        "💨",
        records.maxSpeed,
        records.maxSpeed?.maxSpeed ? formatSpeedKmh(records.maxSpeed.maxSpeed) : "—",
      )}
      {card(
        "Høyeste snittfart",
        "⚡",
        records.avgSpeed,
        records.avgSpeed?.avgSpeed ? formatSpeedKmh(records.avgSpeed.avgSpeed) : "—",
      )}
      {card(
        "Lengste løpetur",
        "🏃",
        records.longestRun,
        records.longestRun ? formatKm(records.longestRun.distance) : "—",
      )}
      {card(
        "Lengste sykkeltur",
        "🚴",
        records.longestRide,
        records.longestRide ? formatKm(records.longestRide.distance) : "—",
      )}
      {card(
        "Raskeste sykkeltur",
        "🚴‍♂️",
        records.fastestRide,
        records.fastestRide?.avgSpeed ? formatSpeedKmh(records.fastestRide.avgSpeed) : "—",
      )}
      {card(
        "Lengste gåtur",
        "🚶",
        records.longestWalk,
        records.longestWalk ? formatKm(records.longestWalk.distance) : "—",
      )}
      {card(
        "Mest kudos",
        "👏",
        records.mostKudos,
        records.mostKudos ? `${records.mostKudos.kudos} kudos` : "—",
      )}
      {card(
        "Flest bragder",
        "🏆",
        records.mostAchievements,
        records.mostAchievements ? `${records.mostAchievements.achievements} stk` : "—",
      )}
    </div>
  );
}

function PeriodStats({ periodBuckets }: { periodBuckets: DashOk["periodBuckets"] }) {
  const options = useMemo(() => {
    const list: Array<{ key: string; label: string; bucket: PeriodBucket }> = [
      { key: periodBuckets.thisWeek.key, label: periodBuckets.thisWeek.label, bucket: periodBuckets.thisWeek },
      { key: periodBuckets.lastWeek.key, label: periodBuckets.lastWeek.label, bucket: periodBuckets.lastWeek },
      ...periodBuckets.months.map((m) => ({ key: m.key, label: m.label, bucket: m })),
      ...periodBuckets.years.map((y) => ({ key: y.key, label: `År ${y.label}`, bucket: y })),
    ];
    return list;
  }, [periodBuckets]);

  const [selectedKey, setSelectedKey] = useState<string>(periodBuckets.thisWeek.key);
  const selected = options.find((o) => o.key === selectedKey) ?? options[0];
  const b = selected.bucket;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Periodens dåder
        </div>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="bg-background border border-border rounded px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-foreground hover:border-primary/40 focus:outline-none focus:border-primary"
        >
          <optgroup label="Uker">
            <option value={periodBuckets.thisWeek.key}>Denne uka</option>
            <option value={periodBuckets.lastWeek.key}>Forrige uke</option>
          </optgroup>
          {periodBuckets.months.length > 0 && (
            <optgroup label="Måneder">
              {periodBuckets.months.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
          )}
          {periodBuckets.years.length > 0 && (
            <optgroup label="År">
              {periodBuckets.years.map((y) => (
                <option key={y.key} value={y.key}>{y.label}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Økter" value={String(b.count)} hint={selected.label} />
        <Stat label="Distanse" value={formatKm(b.distanceMeters)} hint="totalt" />
        <Stat
          label="Tid i bevegelse"
          value={formatDuration(b.movingSeconds)}
          hint="nettotid"
        />
        <Stat
          label="Stigning"
          value={`${Math.round(b.elevationMeters)} m`}
          hint={b.avgHeartrate ? `Snittpuls ${b.avgHeartrate} bpm` : "høydemeter"}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className="text-2xl text-primary mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-primary/20 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1">
        {icon && <span className="text-primary/80">{icon}</span>}
        {label}
      </div>
      <div className="text-base text-primary mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

