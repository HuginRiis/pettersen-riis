import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PageHero } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, Save, Loader2, Check } from "lucide-react";
import {
  listTaxYear,
  listTaxYears,
  upsertTaxMonth,
  upsertTaxSettings,
  parsePayslip,
  type TaxMonth,
  type TaxYearSettings,
} from "@/server/skatt.functions";
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

const MONTH_NAMES = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(n));
const fmtPct = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n) + " %";

type Row = { month: number; lonn: number; skatt: number; ekstra: number; dirty: boolean; saving?: boolean; saved?: boolean };

function emptyMonths(): Row[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, lonn: 0, skatt: 0, ekstra: 0, dirty: false,
  }));
}

function fileToBase64(file: File): Promise<{ mime: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const idx = result.indexOf(",");
      resolve({ mime: file.type || "application/octet-stream", base64: result.slice(idx + 1) });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function SkattePage() {
  const fnListYear = useServerFn(listTaxYear);
  const fnListYears = useServerFn(listTaxYears);
  const fnUpsertMonth = useServerFn(upsertTaxMonth);
  const fnUpsertSettings = useServerFn(upsertTaxSettings);
  const fnParsePayslip = useServerFn(parsePayslip);

  const [years, setYears] = useState<number[]>([2024, 2025, 2026]);
  const [year, setYear] = useState<number>(2026);
  const [rows, setRows] = useState<Row[]>(emptyMonths());
  const [settings, setSettings] = useState<TaxYearSettings>({ year: 2026, skal_betale: 0, ekstra_pr_mnd: 0 });
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Load years once
  useEffect(() => {
    fnListYears().then((ys) => {
      if (ys.length > 0) {
        const merged = Array.from(new Set([...ys, 2024, 2025, 2026])).sort();
        setYears(merged);
      }
    }).catch(() => { /* keep defaults */ });
  }, [fnListYears]);

  // Load year data
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnListYear({ data: { year } })
      .then((res) => {
        if (!alive) return;
        const map = new Map<number, TaxMonth>();
        res.months.forEach((m) => map.set(m.month, m));
        setRows(
          Array.from({ length: 12 }, (_, i) => {
            const m = map.get(i + 1);
            return {
              month: i + 1,
              lonn: m ? Number(m.lonn) : 0,
              skatt: m ? Number(m.skatt) : 0,
              ekstra: m ? Number(m.ekstra) : 0,
              dirty: false,
            };
          }),
        );
        setSettings({
          year: res.settings.year,
          skal_betale: Number(res.settings.skal_betale),
          ekstra_pr_mnd: Number(res.settings.ekstra_pr_mnd),
        });
        setSettingsDirty(false);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [year, fnListYear]);

  const updateRow = (idx: number, key: "lonn" | "skatt" | "ekstra", value: number) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [key]: value, dirty: true, saved: false } : r));
  };

  const saveRow = async (idx: number) => {
    const r = rows[idx];
    setRows((prev) => prev.map((row, i) => i === idx ? { ...row, saving: true } : row));
    try {
      await fnUpsertMonth({ data: { year, month: r.month, lonn: r.lonn, skatt: r.skatt, ekstra: r.ekstra } });
      setRows((prev) => prev.map((row, i) => i === idx ? { ...row, saving: false, dirty: false, saved: true } : row));
      setTimeout(() => {
        setRows((prev) => prev.map((row, i) => i === idx ? { ...row, saved: false } : row));
      }, 1500);
    } catch (e) {
      setRows((prev) => prev.map((row, i) => i === idx ? { ...row, saving: false } : row));
      alert("Kunne ikke lagre: " + (e instanceof Error ? e.message : "ukjent feil"));
    }
  };

  const saveAllDirty = async () => {
    const dirty = rows.filter((r) => r.dirty);
    for (const r of dirty) {
      await fnUpsertMonth({ data: { year, month: r.month, lonn: r.lonn, skatt: r.skatt, ekstra: r.ekstra } });
    }
    setRows((prev) => prev.map((r) => ({ ...r, dirty: false })));
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await fnUpsertSettings({ data: { year, skal_betale: settings.skal_betale, ekstra_pr_mnd: settings.ekstra_pr_mnd } });
      setSettingsDirty(false);
    } catch (e) {
      alert("Kunne ikke lagre: " + (e instanceof Error ? e.message : "ukjent feil"));
    } finally {
      setSettingsSaving(false);
    }
  };

  const onUploadPayslip = async (file: File) => {
    setImportBusy(true);
    setImportMsg(null);
    setImportErr(null);
    try {
      const { mime, base64 } = await fileToBase64(file);
      const result = await fnParsePayslip({ data: { fileName: file.name, mimeType: mime, base64 } });
      // Save to DB
      await fnUpsertMonth({
        data: {
          year: result.year,
          month: result.month,
          lonn: result.lonn,
          skatt: result.skatt,
          ekstra: result.ekstra,
          source: file.name,
        },
      });
      // Add year to selector if missing
      if (!years.includes(result.year)) {
        setYears((prev) => Array.from(new Set([...prev, result.year])).sort());
      }
      // Switch to that year & refresh
      if (result.year === year) {
        setRows((prev) => prev.map((r) => r.month === result.month
          ? { ...r, lonn: result.lonn, skatt: result.skatt, ekstra: result.ekstra, dirty: false, saved: true }
          : r));
      } else {
        setYear(result.year);
      }
      setImportMsg(
        `Importert til ${MONTH_NAMES[result.month - 1]} ${result.year}: ` +
        `Lønn ${fmt(result.lonn)} kr, Skatt ${fmt(result.skatt)} kr, Ekstra ${fmt(result.ekstra)} kr.` +
        (result.note ? ` (${result.note})` : ""),
      );
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Klarte ikke importere");
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const calc = useMemo(() => {
    const enriched = rows.map((r) => {
      const utbetalt = r.lonn - r.skatt - r.ekstra;
      const prosent = r.lonn > 0 ? ((r.skatt + r.ekstra) / r.lonn) * 100 : 0;
      return { ...r, utbetalt, prosent };
    });
    const sumLonn = enriched.reduce((a, r) => a + r.lonn, 0);
    const sumSkatt = enriched.reduce((a, r) => a + r.skatt, 0);
    const sumEkstra = enriched.reduce((a, r) => a + r.ekstra, 0);
    const sumTrukket = sumSkatt + sumEkstra;
    const sumUtbetalt = sumLonn - sumTrukket;
    const skattProsent = sumLonn > 0 ? (sumTrukket / sumLonn) * 100 : 0;
    const tilGodeEllerRest = sumTrukket - settings.skal_betale;
    const utenEkstra = sumSkatt - settings.skal_betale;
    return {
      enriched, sumLonn, sumSkatt, sumEkstra, sumTrukket, sumUtbetalt,
      skattProsent, tilGodeEllerRest, utenEkstra,
      prMndUtbetalt: sumUtbetalt / 12,
    };
  }, [rows, settings.skal_betale]);

  const tilGode = calc.tilGodeEllerRest >= 0;
  const tilGodeUten = calc.utenEkstra >= 0;
  const anyDirty = rows.some((r) => r.dirty);

  return (
    <PageShell>
      <PageHero
        eyebrow="Skattens Krønike"
        title="Skatte utregningen"
        subtitle="Hva du faktisk skal betale i skatt — måned for måned."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-8 space-y-6">
        {/* År-velger + import */}
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {years.map((y) => (
              <Button
                key={y}
                variant={y === year ? "default" : "outline"}
                size="sm"
                onClick={() => setYear(y)}
              >
                {y}
              </Button>
            ))}
            <div className="ml-auto flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadPayslip(f);
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={importBusy}
                onClick={() => fileRef.current?.click()}
              >
                {importBusy ? <Loader2 className="animate-spin" /> : <Upload />}
                Importer lønnsslipp
              </Button>
              {anyDirty && (
                <Button size="sm" onClick={saveAllDirty}>
                  <Save /> Lagre endringer
                </Button>
              )}
            </div>
          </div>
          {importMsg && (
            <div className="text-sm rounded-md border border-green-600/40 bg-green-600/10 px-3 py-2 text-green-500">
              {importMsg}
            </div>
          )}
          {importErr && (
            <div className="text-sm rounded-md border border-red-600/40 bg-red-600/10 px-3 py-2 text-red-500">
              {importErr}
            </div>
          )}
        </Card>

        {/* Hovedtall */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Sum lønn" value={fmt(calc.sumLonn) + " kr"} />
          <Stat label="Sum skatt trukket" value={fmt(calc.sumTrukket) + " kr"} sub={`inkl. ekstra ${fmt(calc.sumEkstra)} kr`} />
          <Stat label="Sum utbetalt" value={fmt(calc.sumUtbetalt) + " kr"} sub={`${fmt(calc.prMndUtbetalt)} kr/mnd`} />
          <Stat label="Snitt skatte%" value={fmtPct(calc.skattProsent)} />
        </div>

        {/* Resultat */}
        <Card className={`p-5 border-2 ${tilGode ? "border-green-600/40" : "border-red-600/40"}`}>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {tilGode ? "Skatt til gode" : "Restskatt"}
          </div>
          <div className={`text-3xl md:text-4xl font-semibold mt-1 ${tilGode ? "text-green-500" : "text-red-500"}`}>
            {fmt(Math.abs(calc.tilGodeEllerRest))} kr
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Trukket totalt {fmt(calc.sumTrukket)} kr − antatt skatt {fmt(settings.skal_betale)} kr ={" "}
            {tilGode ? "til gode" : "rest å betale"}.
          </div>
          <div className="mt-3 text-sm">
            <span className="text-muted-foreground">Uten ekstra trekk hadde det vært: </span>
            <span className={tilGodeUten ? "text-green-500" : "text-red-500"}>
              {fmt(Math.abs(calc.utenEkstra))} kr {tilGodeUten ? "til gode" : "i restskatt"}
            </span>
          </div>
        </Card>

        {/* Måned-tabell — redigerbar */}
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
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {calc.enriched.map((r, idx) => (
                  <tr key={r.month} className="border-t border-border">
                    <td className="p-2 font-medium whitespace-nowrap">{MONTH_NAMES[r.month - 1]}</td>
                    <td className="p-1 text-right">
                      <NumCell value={r.lonn} onChange={(v) => updateRow(idx, "lonn", v)} />
                    </td>
                    <td className="p-1 text-right">
                      <NumCell value={r.skatt} onChange={(v) => updateRow(idx, "skatt", v)} />
                    </td>
                    <td className="p-1 text-right">
                      <NumCell value={r.ekstra} onChange={(v) => updateRow(idx, "ekstra", v)} />
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmt(r.utbetalt)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtPct(r.prosent)}</td>
                    <td className="p-2 text-center">
                      {r.saving ? <Loader2 className="size-4 animate-spin text-muted-foreground inline" />
                        : r.saved ? <Check className="size-4 text-green-500 inline" />
                        : r.dirty ? (
                          <button
                            onClick={() => saveRow(idx)}
                            className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
                          >
                            Lagre
                          </button>
                        ) : null}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-primary/40 bg-muted/30 font-semibold">
                  <td className="p-3">Sum</td>
                  <td className="p-3 text-right tabular-nums">{fmt(calc.sumLonn)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(calc.sumSkatt)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(calc.sumEkstra)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(calc.sumUtbetalt)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtPct(calc.skattProsent)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          {loading && (
            <div className="p-3 text-xs text-muted-foreground border-t border-border">Laster …</div>
          )}
        </Card>

        {/* Justeringer — i bunn */}
        <Card className="p-5 space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Justeringer for {year}</h2>
            <p className="text-xs text-muted-foreground">Disse styrer beregningen av til gode / restskatt.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="skalBetale">Antatt skatt for året (kr)</Label>
              <Input
                id="skalBetale"
                type="number"
                inputMode="numeric"
                value={settings.skal_betale}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, skal_betale: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
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
                value={settings.ekstra_pr_mnd}
                onChange={(e) => {
                  setSettings((s) => ({ ...s, ekstra_pr_mnd: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Standard ekstra trekk pr mnd (brukes som forslag — faktiske tall pr mnd redigeres i tabellen over).
              </p>
            </div>
          </div>

          <div>
            <Button onClick={saveSettings} disabled={!settingsDirty || settingsSaving}>
              {settingsSaving ? <Loader2 className="animate-spin" /> : <Save />}
              Lagre justeringer
            </Button>
          </div>
        </Card>
      </section>
    </PageShell>
  );
}

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      className="h-8 text-right tabular-nums w-28 ml-auto"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
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
