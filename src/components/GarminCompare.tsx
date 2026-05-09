import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, ArrowDown, Minus, Swords, Loader2, Crown, Flame } from "lucide-react";
import { getGarminOverview } from "@/server/garmin.functions";

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
function pickLatest<T extends { day: string }>(arr: T[] | undefined): T | undefined {
  if (!arr?.length) return undefined;
  return arr[arr.length - 1];
}
function intensity(d?: Daily) {
  return ((d?.moderate_intensity_minutes ?? 0) + (d?.vigorous_intensity_minutes ?? 0)) || null;
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

  const a = pickLatest(arne?.daily);
  const r = pickLatest(rebekka?.daily);
  const aSleep = pickLatest(arne?.sleep);
  const rSleep = pickLatest(rebekka?.sleep);

  const rows: Row[] = [
    { label: "Skritt", arne: a?.steps ?? null, rebekka: r?.steps ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Søvn (totalt)", arne: aSleep?.total_seconds ?? null, rebekka: rSleep?.total_seconds ?? null, fmt: (n) => hoursMin(n), fmtDiff: (n) => hoursMin(Math.abs(n)), higherIsBetter: true },
    { label: "Dyp søvn", arne: aSleep?.deep_seconds ?? null, rebekka: rSleep?.deep_seconds ?? null, fmt: (n) => hoursMin(n), fmtDiff: (n) => hoursMin(Math.abs(n)), higherIsBetter: true },
    { label: "REM-søvn", arne: aSleep?.rem_seconds ?? null, rebekka: rSleep?.rem_seconds ?? null, fmt: (n) => hoursMin(n), fmtDiff: (n) => hoursMin(Math.abs(n)), higherIsBetter: true },
    { label: "Søvnscore", arne: aSleep?.sleep_score ?? null, rebekka: rSleep?.sleep_score ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Hvilepuls", arne: a?.resting_heart_rate ?? null, rebekka: r?.resting_heart_rate ?? null, fmt: (n) => fmtNum(n, 0, " bpm"), higherIsBetter: false },
    { label: "Pulsvariasjon (HRV)", arne: aSleep?.hrv_avg ?? null, rebekka: rSleep?.hrv_avg ?? null, fmt: (n) => fmtNum(n, 0, " ms"), higherIsBetter: true },
    { label: "Pulsoksygen (SpO₂)", arne: aSleep?.average_spo2 ?? null, rebekka: rSleep?.average_spo2 ?? null, fmt: (n) => fmtNum(n, 0, " %"), higherIsBetter: true },
    { label: "Respirasjon", arne: aSleep?.average_respiration ?? null, rebekka: rSleep?.average_respiration ?? null, fmt: (n) => fmtNum(n, 1, " /min"), higherIsBetter: null },
    { label: "Body Battery (topp)", arne: a?.body_battery_high ?? null, rebekka: r?.body_battery_high ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Stress (snitt)", arne: a?.stress_average ?? null, rebekka: r?.stress_average ?? null, fmt: (n) => fmtNum(n), higherIsBetter: false },
    { label: "Intensitetsminutter", arne: intensity(a), rebekka: intensity(r), fmt: (n) => fmtNum(n, 0, " min"), higherIsBetter: true },
    { label: "Aktive kcal", arne: a?.active_kilocalories ?? null, rebekka: r?.active_kilocalories ?? null, fmt: (n) => fmtNum(n, 0, " kcal"), higherIsBetter: true },
    { label: "Trapper", arne: a?.floors_climbed ?? null, rebekka: r?.floors_climbed ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
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

  // Top 5 highlights — shuffled "she slept X more than him"-style insights
  type Highlight = { text: string; winner: "arne" | "rebekka" };
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
    highlights.push({ text: `${leader} ${verb} ${trailer} med ${diffStr} (${row.label.toLowerCase()})`, winner: w });
  }
  // Shuffle (Fisher–Yates) and take 5
  const shuffled = [...highlights];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const top5 = shuffled.slice(0, 5);

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
            « Siste registrerte dag »
          </div>
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
