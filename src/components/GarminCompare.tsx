import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, ArrowDown, Minus, Swords, Loader2 } from "lucide-react";
import { getGarminOverview } from "@/server/garmin.functions";

type Owner = "arne" | "rebekka";
type Daily = {
  day: string; steps: number | null; resting_heart_rate: number | null;
  total_kilocalories: number | null; active_kilocalories: number | null;
  distance_meters: number | null; floors_climbed: number | null;
  moderate_intensity_minutes: number | null; vigorous_intensity_minutes: number | null;
  body_battery_high: number | null; stress_average: number | null;
};
type Sleep = { day: string; total_seconds: number | null; sleep_score: number | null; hrv_avg: number | null };
type Overview = { daily: Daily[]; sleep: Sleep[] };

function fmtNum(n: number | null | undefined, digits = 0, suffix = "") {
  if (n == null) return "—";
  return n.toLocaleString("nb-NO", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + suffix;
}
function hoursMin(sec: number | null | undefined) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}t ${m}m` : `${m}m`;
}

type Row = {
  label: string;
  arne: number | null;
  rebekka: number | null;
  fmt: (n: number | null) => string;
  // higherIsBetter: true=høyere bedre, false=lavere bedre, null=nøytral
  higherIsBetter: boolean | null;
};

function pickLatest<T extends { day: string }>(arr: T[] | undefined): T | undefined {
  if (!arr?.length) return undefined;
  return arr[arr.length - 1];
}
function intensity(d?: Daily) {
  return ((d?.moderate_intensity_minutes ?? 0) + (d?.vigorous_intensity_minutes ?? 0)) || null;
}

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
    { label: "Distanse (km)", arne: a?.distance_meters ? a.distance_meters / 1000 : null, rebekka: r?.distance_meters ? r.distance_meters / 1000 : null, fmt: (n) => fmtNum(n, 1), higherIsBetter: true },
    { label: "Etasjer", arne: a?.floors_climbed ?? null, rebekka: r?.floors_climbed ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Aktive kcal", arne: a?.active_kilocalories ?? null, rebekka: r?.active_kilocalories ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Total kcal", arne: a?.total_kilocalories ?? null, rebekka: r?.total_kilocalories ?? null, fmt: (n) => fmtNum(n), higherIsBetter: null },
    { label: "Intensitet (min)", arne: intensity(a), rebekka: intensity(r), fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Hvilepuls", arne: a?.resting_heart_rate ?? null, rebekka: r?.resting_heart_rate ?? null, fmt: (n) => fmtNum(n), higherIsBetter: false },
    { label: "Stress (snitt)", arne: a?.stress_average ?? null, rebekka: r?.stress_average ?? null, fmt: (n) => fmtNum(n), higherIsBetter: false },
    { label: "Body Battery (topp)", arne: a?.body_battery_high ?? null, rebekka: r?.body_battery_high ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "Søvn", arne: aSleep?.total_seconds ?? null, rebekka: rSleep?.total_seconds ?? null, fmt: (n) => hoursMin(n), higherIsBetter: true },
    { label: "Søvnscore", arne: aSleep?.sleep_score ?? null, rebekka: rSleep?.sleep_score ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
    { label: "HRV (snitt)", arne: aSleep?.hrv_avg ?? null, rebekka: rSleep?.hrv_avg ?? null, fmt: (n) => fmtNum(n), higherIsBetter: true },
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

  return (
    <section className="container mx-auto px-2 sm:px-4 pb-6">
      <div className="rounded-lg border border-border/60 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
            <Swords size={16} /> Sammenligning — siste dag
          </h2>
          <div className="text-xs text-muted-foreground">
            Stillingen: <span className="text-foreground font-medium">Arne {wins.arne}</span> · <span className="text-foreground font-medium">Rebekka {wins.rebekka}</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laster sammenligning…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/40">
                  <th className="py-1.5 pr-2 font-medium">Måling</th>
                  <th className="py-1.5 px-2 font-medium text-right">Arne</th>
                  <th className="py-1.5 px-2 text-center font-medium">vs</th>
                  <th className="py-1.5 px-2 font-medium text-right">Rebekka</th>
                  <th className="py-1.5 pl-2 text-center font-medium">Vinner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const w = winner(row);
                  const arneWin = w === "arne";
                  const rebWin = w === "rebekka";
                  const Icon = w === "arne" ? ArrowUp : w === "rebekka" ? ArrowDown : Minus;
                  const iconColor = w === "arne" ? "text-emerald-500" : w === "rebekka" ? "text-rose-500" : "text-muted-foreground";
                  return (
                    <tr key={row.label} className="border-b border-border/20 last:border-0">
                      <td className="py-1.5 pr-2 text-foreground">{row.label}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums ${arneWin ? "text-emerald-500 font-semibold" : "text-foreground"}`}>{row.fmt(row.arne)}</td>
                      <td className={`py-1.5 px-2 text-center ${iconColor}`}><Icon size={12} className="inline" /></td>
                      <td className={`py-1.5 px-2 text-right tabular-nums ${rebWin ? "text-emerald-500 font-semibold" : "text-foreground"}`}>{row.fmt(row.rebekka)}</td>
                      <td className="py-1.5 pl-2 text-center text-muted-foreground">{w === "arne" ? "Arne" : w === "rebekka" ? "Rebekka" : w === "tie" ? "—" : "n/a"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Pekepinn: grønn pil = bedre verdi for retningen som teller (f.eks. lavere hvilepuls, høyere søvn). Rader uten data fra én av brukerne teller ikke i stillingen.
        </p>
      </div>
    </section>
  );
}
