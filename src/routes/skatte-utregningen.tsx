import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/got-skatt.jpg";

export const Route = createFileRoute("/skatte-utregningen")({
  head: () => ({
    meta: [
      { title: "Skatte utregningen | House Pettersen Riis" },
      { name: "description", content: "Skatte- og lønnsutregning per måned — hva du faktisk skal betale i skatt." },
      { property: "og:title", content: "Skatte utregningen" },
      { property: "og:description", content: "Skatte- og lønnsutregning per måned." },
      { property: "og:image", content: heroImg },
    ],
  }),
  component: SkattePage,
});

type Month = { name: string; lonn: number; skatt: number; ekstra: number };

const DATA: Record<string, { months: Month[]; skalBetale: number }> = {
  "2024": {
    skalBetale: 302000,
    months: [
      { name: "Januar", lonn: 69170, skatt: 21276, ekstra: 2000 },
      { name: "Februar", lonn: 79599, skatt: 26519, ekstra: 0 },
      { name: "Mars", lonn: 69138, skatt: 21276, ekstra: 0 },
      { name: "April", lonn: 68851, skatt: 21125, ekstra: 500 },
      { name: "Mai", lonn: 126743, skatt: 47792, ekstra: 500 },
      { name: "Juni", lonn: 95116, skatt: 0, ekstra: 1500 },
      { name: "Juli", lonn: 71730, skatt: 23179, ekstra: 1500 },
      { name: "August", lonn: 69267, skatt: 21927, ekstra: 1500 },
      { name: "September", lonn: 71742, skatt: 24679, ekstra: 1500 },
      { name: "Oktober", lonn: 87566, skatt: 28055, ekstra: 2000 },
      { name: "November", lonn: 77133, skatt: 12867, ekstra: 2000 },
      { name: "Desember", lonn: 69333, skatt: 20624, ekstra: 2000 },
    ],
  },
  "2025": {
    skalBetale: 312767,
    months: [
      { name: "Januar", lonn: 70210, skatt: 22921, ekstra: 500 },
      { name: "Februar", lonn: 69333, skatt: 22420, ekstra: 500 },
      { name: "Mars", lonn: 73315, skatt: 24474, ekstra: 500 },
      { name: "April", lonn: 76810, skatt: 26227, ekstra: 1000 },
      { name: "Mai", lonn: 141320, skatt: 56185, ekstra: 1000 },
      { name: "Juni", lonn: 87368, skatt: 0, ekstra: 1000 },
      { name: "Juli", lonn: 69333, skatt: 21769, ekstra: 1000 },
      { name: "August", lonn: 74305, skatt: 24975, ekstra: 1000 },
      { name: "September", lonn: 72225, skatt: 23923, ekstra: 1000 },
      { name: "Oktober", lonn: 74658, skatt: 25892, ekstra: 1000 },
      { name: "November", lonn: 73733, skatt: 26007, ekstra: 1000 },
      { name: "Desember", lonn: 71108, skatt: 13086, ekstra: 1000 },
    ],
  },
  "2026": {
    skalBetale: 312767,
    months: [
      { name: "Januar", lonn: 78600, skatt: 26546, ekstra: 1000 },
      { name: "Februar", lonn: 81108, skatt: 22647, ekstra: 1000 },
      { name: "Mars", lonn: 74281, skatt: 24367, ekstra: 1000 },
      { name: "April", lonn: 74281, skatt: 24367, ekstra: 1000 },
      { name: "Mai", lonn: 74281, skatt: 24367, ekstra: 1000 },
      { name: "Juni", lonn: 74281, skatt: 0, ekstra: 1000 },
      { name: "Juli", lonn: 74281, skatt: 24367, ekstra: 1000 },
      { name: "August", lonn: 74281, skatt: 24367, ekstra: 1000 },
      { name: "September", lonn: 74281, skatt: 24367, ekstra: 1000 },
      { name: "Oktober", lonn: 74281, skatt: 24367, ekstra: 1000 },
      { name: "November", lonn: 74281, skatt: 24367, ekstra: 1000 },
      { name: "Desember", lonn: 74281, skatt: 24367, ekstra: 1000 },
    ],
  },
};

const fmt = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(n));
const fmtPct = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n) + " %";

function SkattePage() {
  const years = Object.keys(DATA).sort();
  const [year, setYear] = useState<string>("2026");
  const base = DATA[year];

  // Editable: Skal betale i skatt + Ekstra skatt pr mnd
  const [skalBetale, setSkalBetale] = useState<number>(base.skalBetale);
  const [ekstraPrMnd, setEkstraPrMnd] = useState<number>(base.months[0]?.ekstra ?? 1000);

  // Reset edits when year changes
  const onYearChange = (y: string) => {
    setYear(y);
    setSkalBetale(DATA[y].skalBetale);
    setEkstraPrMnd(DATA[y].months[0]?.ekstra ?? 1000);
  };

  const calc = useMemo(() => {
    const rows = base.months.map((m) => {
      const utbetalt = m.lonn - m.skatt - ekstraPrMnd;
      const prosent = m.lonn > 0 ? ((m.skatt + ekstraPrMnd) / m.lonn) * 100 : 0;
      return { ...m, ekstra: ekstraPrMnd, utbetalt, prosent };
    });
    const sumLonn = rows.reduce((a, r) => a + r.lonn, 0);
    const sumSkatt = rows.reduce((a, r) => a + r.skatt, 0);
    const sumEkstra = ekstraPrMnd * 12;
    const sumTrukket = sumSkatt + sumEkstra;
    const sumUtbetalt = sumLonn - sumTrukket;
    const skattProsent = sumLonn > 0 ? (sumTrukket / sumLonn) * 100 : 0;
    const tilGodeEllerRest = sumTrukket - skalBetale; // positiv = til gode, negativ = restskatt
    const utenEkstra = sumSkatt - skalBetale; // hva ville stått uten ekstra trekk
    return {
      rows,
      sumLonn,
      sumSkatt,
      sumEkstra,
      sumTrukket,
      sumUtbetalt,
      skattProsent,
      tilGodeEllerRest,
      utenEkstra,
      prMndSkatt: sumTrukket / 12,
      prMndUtbetalt: sumUtbetalt / 12,
    };
  }, [base, ekstraPrMnd, skalBetale]);

  const tilGode = calc.tilGodeEllerRest >= 0;
  const tilGodeUten = calc.utenEkstra >= 0;

  return (
    <PageShell>
      <PageHero
        eyebrow="Skattens Krønike"
        title="Skatte utregningen"
        subtitle="Hva du faktisk skal betale i skatt — måned for måned."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-8 space-y-6">
        {/* År-velger + justeringer */}
        <Card className="p-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            {years.map((y) => (
              <Button
                key={y}
                variant={y === year ? "default" : "outline"}
                size="sm"
                onClick={() => onYearChange(y)}
              >
                {y}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="skalBetale">Antatt skatt for året (kr)</Label>
              <Input
                id="skalBetale"
                type="number"
                inputMode="numeric"
                value={skalBetale}
                onChange={(e) => setSkalBetale(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Det du tror du faktisk skal ende opp med å betale i skatt for hele året.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ekstra">Ekstra skattetrekk pr måned (kr)</Label>
              <Input
                id="ekstra"
                type="number"
                inputMode="numeric"
                value={ekstraPrMnd}
                onChange={(e) => setEkstraPrMnd(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Frivillig ekstra trekk hver måned for å unngå restskatt.
              </p>
            </div>
          </div>
        </Card>

        {/* Hovedtall */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Sum lønn" value={fmt(calc.sumLonn) + " kr"} />
          <Stat label="Sum skatt trukket" value={fmt(calc.sumTrukket) + " kr"} sub={`inkl. ekstra ${fmt(calc.sumEkstra)} kr`} />
          <Stat label="Sum utbetalt" value={fmt(calc.sumUtbetalt) + " kr"} sub={`${fmt(calc.prMndUtbetalt)} kr/mnd`} />
          <Stat label="Snitt skatte%" value={fmtPct(calc.skattProsent)} />
        </div>

        {/* Resultat — til gode / restskatt */}
        <Card className={`p-5 border-2 ${tilGode ? "border-green-600/40" : "border-red-600/40"}`}>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {tilGode ? "Skatt til gode" : "Restskatt"}
          </div>
          <div className={`text-3xl md:text-4xl font-semibold mt-1 ${tilGode ? "text-green-500" : "text-red-500"}`}>
            {fmt(Math.abs(calc.tilGodeEllerRest))} kr
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Trukket totalt {fmt(calc.sumTrukket)} kr − antatt skatt {fmt(skalBetale)} kr ={" "}
            {tilGode ? "til gode" : "rest å betale"}.
          </div>
          <div className="mt-3 text-sm">
            <span className="text-muted-foreground">Uten ekstra trekk hadde det vært: </span>
            <span className={tilGodeUten ? "text-green-500" : "text-red-500"}>
              {fmt(Math.abs(calc.utenEkstra))} kr {tilGodeUten ? "til gode" : "i restskatt"}
            </span>
          </div>
        </Card>

        {/* Måned-tabell */}
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Måned</th>
                  <th className="text-right p-3">Lønn</th>
                  <th className="text-right p-3">Skatt</th>
                  <th className="text-right p-3">Ekstra</th>
                  <th className="text-right p-3">Utbetalt</th>
                  <th className="text-right p-3">Skatt %</th>
                </tr>
              </thead>
              <tbody>
                {calc.rows.map((r) => (
                  <tr key={r.name} className="border-t border-border">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(r.lonn)}</td>
                    <td className="p-3 text-right tabular-nums">{fmt(r.skatt)}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{fmt(r.ekstra)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{fmt(r.utbetalt)}</td>
                    <td className="p-3 text-right tabular-nums">{fmtPct(r.prosent)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-primary/40 bg-muted/30 font-semibold">
                  <td className="p-3">Sum</td>
                  <td className="p-3 text-right tabular-nums">{fmt(calc.sumLonn)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(calc.sumSkatt)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(calc.sumEkstra)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(calc.sumUtbetalt)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtPct(calc.skattProsent)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </PageShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl md:text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
