import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, ArrowDown, Minus, Swords, Loader2, Crown, Flame, Settings2 } from "lucide-react";
import { getGarminOverview } from "@/lib/garmin.functions";
import { usePersistedState } from "@/hooks/use-persisted-state";
import arnePortrait from "@/assets/arne-portrait.jpg";
import rebekkaPortrait from "@/assets/rebekka-portrait.jpg";

// Forklaringer per måling — vises når brukeren slår på "Vis forklaringer"
const EXPLANATIONS: Record<string, string> = {
  "skritt": "Daglig bevegelse — mål rundt 8–10 000 styrker hjerte og humør.",
  "søvn (totalt)": "Voksne trenger 7–9 timer for restitusjon og hukommelse.",
  "dyp søvn": "Dyp søvn reparerer kropp og immunforsvar — sikt mot 1–2 timer.",
  "rem-søvn": "REM bygger minne og følelsesregulering — ca. 20–25 % av natten er bra.",
  "søvnscore": "Garmins helhetsvurdering av natten (0–100). Over 80 er utmerket.",
  "hvilepuls": "Lavere hvilepuls = bedre kondisjon. 50–70 bpm er typisk for voksne.",
  "pulsvariasjon (hrv)": "Høyere HRV antyder god restitusjon og lavt stressnivå.",
  "pulsoksygen (spo₂)": "Oksygenmetning i blodet — friske verdier ligger 95–100 %.",
  "respirasjon": "Pust per minutt under søvn — 12–20 er normalt.",
  "body battery (topp)": "Garmins «energinivå». Høyere topp = bedre lading gjennom døgnet.",
  "stress (snitt)": "Lavere er bedre. Under 25 regnes som hvilende.",
  "intensitetsminutter": "WHO anbefaler minst 150 min/uke moderat aktivitet.",
  "aktive kcal": "Kalorier brent utover hvileforbrenning — mål på aktivitet.",
  "trapper": "Trappetrinn klatret — enkel måte å øke daglig pulsbelastning.",
};

type Owner = "arne" | "rebekka";
type Daily = {
  day: string; steps: number | null; resting_heart_rate: number | null;
  total_kilocalories: number | null; active_kilocalories: number | null;
  distance_meters: number | null; floors_climbed: number | null;
  moderate_intensity_minutes: number | null; vigorous_intensity_minutes: number | null;
  body_battery_high: number | null; stress_average: number | null;
};
type Sleep = {
  day: string;
  total_seconds: number | null;
  deep_seconds: number | null;
  rem_seconds: number | null;
  sleep_score: number | null;
  hrv_avg: number | null;
  average_spo2: number | null;
  average_respiration: number | null;
};
type Overview = { daily: Daily[]; sleep: Sleep[] };

function fmtNum(n: number | null | undefined, digits = 0, suffix = "") {
  if (n == null) return "—";
  return n.toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + suffix;
}
function hoursMin(sec: number | null | undefined) {
  if (sec == null || sec === 0) return "—";
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}t ${m}m` : `${m}m`;
}

type Period = "today" | "yesterday" | "this_week" | "last_week" | "last_14";
const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "today", label: "I dag" },
  { key: "yesterday", label: "I går" },
  { key: "this_week", label: "Denne uken" },
  { key: "last_week", label: "Siste 7 dager" },
  { key: "last_14", label: "Siste 14 dager" },
];

function osloDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDaysKey(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function periodRange(period: Period): { from: string; to: string } {
  const today = osloDateKey();
  if (period === "today") return { from: today, to: today };
  if (period === "yesterday") {
    const y = addDaysKey(today, -1);
    return { from: y, to: y };
  }
  if (period === "last_week") return { from: addDaysKey(today, -6), to: today };
  if (period === "last_14") return { from: addDaysKey(today, -13), to: today };
  // this_week (mandag–i dag)
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=sun
  const back = (dow + 6) % 7;
  return { from: addDaysKey(today, -back), to: today };
}
function inRange<T extends { day: string }>(arr: T[] | undefined, from: string, to: string): T[] {
  if (!arr?.length) return [];
  return arr.filter((x) => x.day >= from && x.day <= to);
}
function sum(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0);
}
function avg(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}
function aggDaily(rows: Daily[]): Partial<Daily> & { _intensity: number | null } {
  return {
    steps: sum(rows.map((r) => r.steps)),
    resting_heart_rate: avg(rows.map((r) => r.resting_heart_rate)),
    total_kilocalories: sum(rows.map((r) => r.total_kilocalories)),
    active_kilocalories: sum(rows.map((r) => r.active_kilocalories)),
    distance_meters: sum(rows.map((r) => r.distance_meters)),
    floors_climbed: sum(rows.map((r) => r.floors_climbed)),
    moderate_intensity_minutes: sum(rows.map((r) => r.moderate_intensity_minutes)),
    vigorous_intensity_minutes: sum(rows.map((r) => r.vigorous_intensity_minutes)),
    body_battery_high: avg(rows.map((r) => r.body_battery_high)),
    stress_average: avg(rows.map((r) => r.stress_average)),
    _intensity: sum(rows.map((r) => (r.moderate_intensity_minutes ?? 0) + (r.vigorous_intensity_minutes ?? 0))),
  };
}
function aggSleep(rows: Sleep[]): Partial<Sleep> {
  return {
    total_seconds: sum(rows.map((r) => r.total_seconds)),
    deep_seconds: sum(rows.map((r) => r.deep_seconds)),
    rem_seconds: sum(rows.map((r) => r.rem_seconds)),
    sleep_score: avg(rows.map((r) => r.sleep_score)),
    hrv_avg: avg(rows.map((r) => r.hrv_avg)),
    average_spo2: avg(rows.map((r) => r.average_spo2)),
    average_respiration: avg(rows.map((r) => r.average_respiration)),
  };
}

type Row = {
  label: string;
  arne: number | null;
  rebekka: number | null;
  fmt: (n: number | null) => string;
  fmtDiff?: (n: number) => string;
  higherIsBetter: boolean | null;
};

export function GarminCompare() {
  const fetchOverview = useServerFn(getGarminOverview);
  const [arne, setArne] = useState<Overview | null>(null);
  const [rebekka, setRebekka] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [showSettings, setShowSettings] = useState(false);
  const [topN, setTopN] = usePersistedState<number>("garmin-compare:topN", 5);
  const [showExplanations, setShowExplanations] = usePersistedState<boolean>("garmin-compare:explain", false);
  const safeTopN = Math.min(15, Math.max(1, Number(topN) || 5));

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [a, r] = await Promise.all([
          fetchOverview({ data: { owner: "arne" } }),
          fetchOverview({ data: { owner: "rebekka" } }),
        ]);
        setArne(a as Overview);
        setRebekka(r as Overview);
      } finally { setLoading(false); }
    })();
  }, []);

  const { from, to } = periodRange(period);
  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label ?? "";
  const a = aggDaily(inRange(arne?.daily, from, to));
  const r = aggDaily(inRange(rebekka?.daily, from, to));
  const aSleep = aggSleep(inRange(arne?.sleep, from, to));
  const rSleep = aggSleep(inRange(rebekka?.sleep, from, to));

  const rows: Row[] = [
    { label: "Skritt", arne: a.steps ?? null, rebekka: r.steps ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Søvn (totalt)", arne: aSleep.total_seconds ?? null, rebekka: rSleep.total_seconds ?? null, fmt: (n) => hoursMin(n), fmtDiff: (n) => hoursMin(Math.abs(n)), higherIsBetter: true },
    { label: "Dyp søvn", arne: aSleep.deep_seconds ?? null, rebekka: rSleep.deep_seconds ?? null, fmt: (n) => hoursMin(n), fmtDiff: (n) => hoursMin(Math.abs(n)), higherIsBetter: true },
    { label: "REM-søvn", arne: aSleep.rem_seconds ?? null, rebekka: rSleep.rem_seconds ?? null, fmt: (n) => hoursMin(n), fmtDiff: (n) => hoursMin(Math.abs(n)), higherIsBetter: true },
    { label: "Søvnscore", arne: aSleep.sleep_score ?? null, rebekka: rSleep.sleep_score ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Hvilepuls", arne: a.resting_heart_rate ?? null, rebekka: r.resting_heart_rate ?? null, fmt: (n) => fmtNum(n, 0, " bpm"), higherIsBetter: false },
    { label: "Pulsvariasjon (HRV)", arne: aSleep.hrv_avg ?? null, rebekka: rSleep.hrv_avg ?? null, fmt: (n) => fmtNum(n, 0, " ms"), higherIsBetter: true },
    { label: "Pulsoksygen (SpO₂)", arne: aSleep.average_spo2 ?? null, rebekka: rSleep.average_spo2 ?? null, fmt: (n) => fmtNum(n, 0, " %"), higherIsBetter: true },
    { label: "Respirasjon", arne: aSleep.average_respiration ?? null, rebekka: rSleep.average_respiration ?? null, fmt: (n) => fmtNum(n, 1, " /min"), higherIsBetter: null },
    { label: "Body Battery (topp)", arne: a.body_battery_high ?? null, rebekka: r.body_battery_high ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Stress (snitt)", arne: a.stress_average ?? null, rebekka: r.stress_average ?? null, fmt: (n) => fmtNum(n), higherIsBetter: false },
    { label: "Intensitetsminutter", arne: a._intensity, rebekka: r._intensity, fmt: (n) => fmtNum(n, 0, " min"), higherIsBetter: true },
    { label: "Aktive kcal", arne: a.active_kilocalories ?? null, rebekka: r.active_kilocalories ?? null, fmt: (n) => fmtNum(n, 0, " kcal"), higherIsBetter: true },
    { label: "Trapper", arne: a.floors_climbed ?? null, rebekka: r.floors_climbed ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
  ];

  const winner = (row: Row): "arne" | "rebekka" | "tie" | "na" => {
    if (row.arne == null || row.rebekka == null) return "na";
    if (row.arne === row.rebekka) return "tie";
    if (row.higherIsBetter == null) return "tie";
    const arneWins = row.higherIsBetter ? row.arne > row.rebekka : row.arne < row.rebekka;
    return arneWins ? "arne" : "rebekka";
  };

  const wins = rows.reduce((acc, row) => {
    const w = winner(row);
    if (w === "arne") acc.arne++;
    else if (w === "rebekka") acc.rebekka++;
    return acc;
  }, { arne: 0, rebekka: 0 });

  // 7-dagers snitt — separat fra valgt periode
  const week = periodRange("last_week");
  const a7 = aggDaily(inRange(arne?.daily, week.from, week.to));
  const r7 = aggDaily(inRange(arne?.daily, week.from, week.to)); // placeholder, overwritten
  const r7real = aggDaily(inRange(rebekka?.daily, week.from, week.to));
  const aSleep7 = aggSleep(inRange(arne?.sleep, week.from, week.to));
  const rSleep7 = aggSleep(inRange(rebekka?.sleep, week.from, week.to));
  const rows7: Row[] = [
    { label: "Skritt", arne: a7.steps ?? null, rebekka: r7real.steps ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Søvn", arne: aSleep7.total_seconds ?? null, rebekka: rSleep7.total_seconds ?? null, fmt: (n) => hoursMin(n), higherIsBetter: true },
    { label: "Dyp søvn", arne: aSleep7.deep_seconds ?? null, rebekka: rSleep7.deep_seconds ?? null, fmt: (n) => hoursMin(n), higherIsBetter: true },
    { label: "REM", arne: aSleep7.rem_seconds ?? null, rebekka: rSleep7.rem_seconds ?? null, fmt: (n) => hoursMin(n), higherIsBetter: true },
    { label: "Søvnscore", arne: aSleep7.sleep_score ?? null, rebekka: rSleep7.sleep_score ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Hvilepuls", arne: a7.resting_heart_rate ?? null, rebekka: r7real.resting_heart_rate ?? null, fmt: (n) => fmtNum(n), higherIsBetter: false },
    { label: "HRV", arne: aSleep7.hrv_avg ?? null, rebekka: rSleep7.hrv_avg ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "BB", arne: a7.body_battery_high ?? null, rebekka: r7real.body_battery_high ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Stress", arne: a7.stress_average ?? null, rebekka: r7real.stress_average ?? null, fmt: (n) => fmtNum(n), higherIsBetter: false },
    { label: "Intensitet", arne: a7._intensity, rebekka: r7real._intensity, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Kcal", arne: a7.active_kilocalories ?? null, rebekka: r7real.active_kilocalories ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Trapper", arne: a7.floors_climbed ?? null, rebekka: r7real.floors_climbed ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
  ];
  void r7;
  const wins7 = rows7.reduce((acc, row) => {
    const w = winner(row);
    if (w === "arne") acc.arne++;
    else if (w === "rebekka") acc.rebekka++;
    return acc;
  }, { arne: 0, rebekka: 0 });
  const leader7: "arne" | "rebekka" | "tie" =
    wins7.arne > wins7.rebekka ? "arne" : wins7.rebekka > wins7.arne ? "rebekka" : "tie";

  // Top 5 highlights — shuffled "she slept X more than him"-style insights
  type Highlight = { text: string; winner: "arne" | "rebekka"; label: string };
  const highlights: Highlight[] = [];
  for (const row of rows) {
    const w = winner(row);
    if (w !== "arne" && w !== "rebekka") continue;
    const leader = w === "arne" ? "Arne" : "Rebekka";
    const trailer = w === "arne" ? "Rebekka" : "Arne";
    const diff = Math.abs((row.arne ?? 0) - (row.rebekka ?? 0));
    const diffStr = row.fmtDiff ? row.fmtDiff(diff) : row.fmt(diff);
    let verb = "ledet på";
    const lbl = row.label.toLowerCase();
    if (lbl.includes("søvn (totalt)")) verb = "sov mer enn";
    else if (lbl.includes("dyp søvn")) verb = "fikk mer dyp søvn enn";
    else if (lbl.includes("rem")) verb = "fikk mer REM-søvn enn";
    else if (lbl.includes("søvnscore")) verb = "hadde høyere søvnscore enn";
    else if (lbl.includes("skritt")) verb = "gikk flere skritt enn";
    else if (lbl.includes("hvilepuls")) verb = "hadde lavere hvilepuls enn";
    else if (lbl.includes("hrv")) verb = "hadde bedre pulsvariasjon enn";
    else if (lbl.includes("spo")) verb = "hadde høyere oksygenmetning enn";
    else if (lbl.includes("body battery")) verb = "ladet bedre enn";
    else if (lbl.includes("stress")) verb = "var mindre stresset enn";
    else if (lbl.includes("intensitet")) verb = "tok flere intensitetsminutter enn";
    else if (lbl.includes("kcal")) verb = "brente mer enn";
    else if (lbl.includes("trapper")) verb = "tok flere trapper enn";
    highlights.push({ text: `${leader} ${verb} ${trailer} med ${diffStr} (${row.label.toLowerCase()})`, winner: w, label: row.label });
  }
  // Shuffle (Fisher–Yates) and take 5
  const shuffled = [...highlights];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const top5 = shuffled.slice(0, safeTopN);

  const display = "var(--font-display)";

  return (
    <section>
      <div className="rounded-lg border border-amber-500/30 bg-gradient-to-b from-amber-950/20 to-card/60 p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-500/20 pb-3">
          <div className="flex items-center gap-2">
            <Swords size={18} className="text-amber-400" />
            <h2 className="text-amber-100" style={{ fontFamily: display, letterSpacing: "0.2em", fontWeight: 700 }}>
              SAMMENLIGNING
            </h2>
          </div>
          <div className="text-xs text-muted-foreground italic" style={{ fontFamily: "var(--font-medieval)" }}>
            « {periodLabel} »
          </div>
        </div>

        {/* Periode-velger */}
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriod(opt.key)}
                className={`px-2.5 py-1 rounded-full border text-[11px] uppercase tracking-[0.15em] transition ${
                  active
                    ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:border-amber-400/40"
                }`}
                style={{ fontFamily: display }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Score / banners */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded border ${wins.arne >= wins.rebekka ? "border-slate-300/60" : "border-slate-500/30"} bg-gradient-to-r from-slate-700/60 to-slate-900/70 px-3 py-2 flex items-center gap-2`}>
            <Crown className="h-4 w-4 text-slate-200" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-300" style={{ fontFamily: display }}>House Stark</div>
              <div className="text-slate-100 font-semibold">Arne</div>
            </div>
            <div className="text-2xl text-slate-100 tabular-nums" style={{ fontFamily: display, fontWeight: 700 }}>{wins.arne}</div>
          </div>
          <div className={`rounded border ${wins.rebekka >= wins.arne ? "border-rose-300/60" : "border-rose-500/30"} bg-gradient-to-r from-rose-900/60 to-black/80 px-3 py-2 flex items-center gap-2`}>
            <Flame className="h-4 w-4 text-rose-200" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-rose-200" style={{ fontFamily: display }}>House Targaryen</div>
              <div className="text-rose-100 font-semibold">Rebekka</div>
            </div>
            <div className="text-2xl text-rose-100 tabular-nums" style={{ fontFamily: display, fontWeight: 700 }}>{wins.rebekka}</div>
          </div>
        </div>

        {/* Krønike-pekepinner — antall styres i innstillinger */}
        {!loading && top5.length > 0 && (
          <div className="rounded border border-amber-500/30 bg-black/30 p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300 flex items-center gap-1.5" style={{ fontFamily: display }}>
                <Swords size={12} /> KRØNIKEN — TOPP {safeTopN}
              </div>
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className="text-[10px] uppercase tracking-[0.15em] text-amber-300/70 hover:text-amber-200 inline-flex items-center gap-1"
                style={{ fontFamily: display }}
                aria-expanded={showSettings}
              >
                <Settings2 size={12} /> Innstillinger
              </button>
            </div>

            {showSettings && (
              <div className="mb-3 rounded border border-amber-500/20 bg-black/40 p-2.5 space-y-2">
                <label className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-amber-100/90">Antall topp ({safeTopN})</span>
                  <input
                    type="range"
                    min={1}
                    max={15}
                    step={1}
                    value={safeTopN}
                    onChange={(e) => setTopN(Number(e.target.value))}
                    className="flex-1 max-w-[60%] accent-amber-400"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-[11px] cursor-pointer">
                  <span className="text-amber-100/90">
                    Vis forklaringer
                    <span className="block text-[10px] text-muted-foreground italic">
                      Når på vises en kort forklaring under hver pekepinn om hva målingen betyr og hva som er bra.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={showExplanations}
                    onChange={(e) => setShowExplanations(e.target.checked)}
                    className="h-4 w-4 accent-amber-400 shrink-0"
                  />
                </label>
              </div>
            )}

            <ol className="space-y-1.5">
              {top5.map((h, i) => {
                const expl = EXPLANATIONS[h.label.toLowerCase()];
                return (
                  <li key={i} className="text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400/80 tabular-nums w-4 shrink-0" style={{ fontFamily: display }}>{i + 1}.</span>
                      {h.winner === "arne"
                        ? <Crown className="h-3 w-3 text-slate-200 mt-0.5 shrink-0" />
                        : <Flame className="h-3 w-3 text-rose-300 mt-0.5 shrink-0" />}
                      <span className={h.winner === "arne" ? "text-slate-100" : "text-rose-100"}>{h.text}</span>
                    </div>
                    {showExplanations && expl && (
                      <div className="pl-9 mt-0.5 text-[10px] text-muted-foreground italic">{expl}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laster sammenligning…
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-amber-500/20">
                  <th className="py-2 pr-2 font-medium" style={{ fontFamily: display, letterSpacing: "0.1em" }}>MÅLING</th>
                  <th className="py-2 px-2 font-medium text-right text-slate-300" style={{ fontFamily: display, letterSpacing: "0.1em" }}>ARNE</th>
                  <th className="py-2 px-2 text-center font-medium">Δ</th>
                  <th className="py-2 px-2 font-medium text-right text-rose-200" style={{ fontFamily: display, letterSpacing: "0.1em" }}>REBEKKA</th>
                  <th className="py-2 pl-2 text-center font-medium">Vinner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const w = winner(row);
                  const arneWin = w === "arne";
                  const rebWin = w === "rebekka";
                  const Icon = w === "arne" ? ArrowUp : w === "rebekka" ? ArrowDown : Minus;
                  const iconColor = w === "arne" ? "text-slate-200" : w === "rebekka" ? "text-rose-300" : "text-muted-foreground";
                  let diffStr = "—";
                  if (row.arne != null && row.rebekka != null) {
                    const d = row.arne - row.rebekka;
                    diffStr = (d > 0 ? "+" : d < 0 ? "−" : "") + (row.fmtDiff ? row.fmtDiff(d) : fmtNum(Math.abs(d), Number.isInteger(d) ? 0 : 1));
                  }
                  return (
                    <tr key={row.label} className="border-b border-border/15 last:border-0">
                      <td className="py-2 pr-2 text-foreground">{row.label}</td>
                      <td className={`py-2 px-2 text-right tabular-nums ${arneWin ? "text-slate-100 font-semibold" : "text-foreground/80"}`}>{row.fmt(row.arne)}</td>
                      <td className={`py-2 px-2 text-center tabular-nums ${iconColor}`}>
                        <span className="inline-flex items-center gap-0.5">
                          <Icon size={11} />
                          <span className="text-[10px]">{diffStr}</span>
                        </span>
                      </td>
                      <td className={`py-2 px-2 text-right tabular-nums ${rebWin ? "text-rose-100 font-semibold" : "text-foreground/80"}`}>{row.fmt(row.rebekka)}</td>
                      <td className="py-2 pl-2 text-center">
                        {w === "arne" && <Crown className="inline h-3.5 w-3.5 text-slate-200" />}
                        {w === "rebekka" && <Flame className="inline h-3.5 w-3.5 text-rose-300" />}
                        {(w === "tie" || w === "na") && <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground italic" style={{ fontFamily: "var(--font-medieval)" }}>
          Pekepinn: Krone (Stark) eller flamme (Targaryen) viser hvem som leder per måling. Δ = Arne minus Rebekka. Hvilepuls/stress: lavere er bedre. Rader uten data fra én av husene teller ikke i totalen.
        </p>
      </div>
    </section>
  );
}
