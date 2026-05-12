import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PageHero } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Save, Loader2, Check, Plus, Trash2, ChevronDown, FileText, ExternalLink } from "lucide-react";
import {
  listTaxYear,
  listTaxYears,
  upsertTaxMonth,
  deleteTaxMonth,
  upsertTaxSettings,
  parsePayslip,
  listPayslipFiles,
  savePayslipFile,
  deletePayslipFile,
  type TaxMonth,
  type TaxYearSettings,
  type PayslipFile,
} from "@/server/skatt.functions";
import heroImg from "@/assets/got-skatt.jpg";
import { PayslipArchive } from "@/components/PayslipArchive";
import { SkattCharts } from "@/components/SkattCharts";
import { StandaloneTaxCalculator } from "@/components/StandaloneTaxCalculator";

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
const DEFAULT_EMPLOYER = "Hovedjobb";

const fmt = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(n));
const fmtPct = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n) + " %";

type Row = {
  key: string;
  month: number;
  employer: string;
  lonn: number;
  skatt: number;
  ekstra: number;
  dirty: boolean;
  saving?: boolean;
  saved?: boolean;
  isNew?: boolean;
};

function rowKey(month: number, employer: string) {
  return `${month}::${employer}`;
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

function buildRows(months: TaxMonth[]): Row[] {
  const map = new Map<string, Row>();
  // Bare seed tomme "Hovedjobb"-rader hvis året er helt tomt (første gangs bruk).
  // Da unngår vi at slettede rader dukker opp igjen.
  if (months.length === 0) {
    for (let m = 1; m <= 12; m++) {
      const k = rowKey(m, DEFAULT_EMPLOYER);
      map.set(k, { key: k, month: m, employer: DEFAULT_EMPLOYER, lonn: 0, skatt: 0, ekstra: 0, dirty: false });
    }
  }
  for (const m of months) {
    const k = rowKey(m.month, m.employer);
    map.set(k, {
      key: k,
      month: m.month,
      employer: m.employer,
      lonn: Number(m.lonn),
      skatt: Number(m.skatt),
      ekstra: Number(m.ekstra),
      dirty: false,
    });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.month - b.month || a.employer.localeCompare(b.employer, "nb"),
  );
}

function SkattePage() {
  const fnListYear = useServerFn(listTaxYear);
  const fnListYears = useServerFn(listTaxYears);
  const fnUpsertMonth = useServerFn(upsertTaxMonth);
  const fnDeleteMonth = useServerFn(deleteTaxMonth);
  const fnUpsertSettings = useServerFn(upsertTaxSettings);
  const fnParsePayslip = useServerFn(parsePayslip);
  const fnListFiles = useServerFn(listPayslipFiles);
  const fnSaveFile = useServerFn(savePayslipFile);
  const fnDeleteFile = useServerFn(deletePayslipFile);

  const [years, setYears] = useState<number[]>([2024, 2025, 2026]);
  const [year, setYear] = useState<number>(2026);
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<TaxYearSettings>({ year: 2026, skal_betale: 0, ekstra_pr_mnd: 0 });
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importEmployer, setImportEmployer] = useState<string>("");
  const [files, setFiles] = useState<PayslipFile[]>([]);
  const [openYears, setOpenYears] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reloadFiles = () => {
    fnListFiles().then(setFiles).catch(() => { /* ignore */ });
  };
  useEffect(() => { reloadFiles(); }, []);

  useEffect(() => {
    fnListYears().then((ys) => {
      if (ys.length > 0) {
        const merged = Array.from(new Set([...ys, 2024, 2025, 2026])).sort();
        setYears(merged);
      }
    }).catch(() => { /* keep defaults */ });
  }, [fnListYears]);

  const reload = async (y: number) => {
    setLoading(true);
    try {
      const res = await fnListYear({ data: { year: y } });
      setRows(buildRows(res.months));
      setSettings({
        year: res.settings.year,
        skal_betale: Number(res.settings.skal_betale),
        ekstra_pr_mnd: Number(res.settings.ekstra_pr_mnd),
      });
      setSettingsDirty(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnListYear({ data: { year } })
      .then((res) => {
        if (!alive) return;
        setRows(buildRows(res.months));
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

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, ...patch, dirty: true, saved: false } : r));
  };

  const renameEmployer = (key: string, newName: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key) return r;
      const employer = newName.trim() || "Ukjent";
      return { ...r, employer, key: rowKey(r.month, employer), dirty: true, saved: false };
    }));
  };

  const addEmployerRow = (month: number) => {
    const existing = rows.filter((r) => r.month === month).map((r) => r.employer);
    let name = "Ny arbeidsgiver";
    let i = 2;
    while (existing.includes(name)) name = `Ny arbeidsgiver ${i++}`;
    const k = rowKey(month, name);
    setRows((prev) => [...prev, {
      key: k, month, employer: name, lonn: 0, skatt: 0, ekstra: 0, dirty: true, isNew: true,
    }].sort((a, b) => a.month - b.month || a.employer.localeCompare(b.employer, "nb")));
  };

  const removeRow = async (row: Row) => {
    if (!confirm(`Slette "${row.employer}" for ${MONTH_NAMES[row.month - 1]}?`)) return;
    if (!row.isNew) {
      try {
        await fnDeleteMonth({ data: { year, month: row.month, employer: row.employer } });
      } catch (e) {
        alert("Kunne ikke slette: " + (e instanceof Error ? e.message : "ukjent"));
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  };

  const saveRow = async (row: Row) => {
    setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, saving: true } : r));
    try {
      await fnUpsertMonth({
        data: {
          year, month: row.month, employer: row.employer,
          lonn: row.lonn, skatt: row.skatt, ekstra: row.ekstra,
        },
      });
      setRows((prev) => prev.map((r) => r.key === row.key
        ? { ...r, saving: false, dirty: false, saved: true, isNew: false }
        : r));
      setTimeout(() => {
        setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, saved: false } : r));
      }, 1500);
    } catch (e) {
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, saving: false } : r));
      alert("Kunne ikke lagre: " + (e instanceof Error ? e.message : "ukjent feil"));
    }
  };

  const saveAllDirty = async () => {
    const dirty = rows.filter((r) => r.dirty);
    for (const r of dirty) {
      await fnUpsertMonth({
        data: {
          year, month: r.month, employer: r.employer,
          lonn: r.lonn, skatt: r.skatt, ekstra: r.ekstra,
        },
      });
    }
    setRows((prev) => prev.map((r) => ({ ...r, dirty: false, isNew: false })));
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
      const employer = (importEmployer.trim() || result.employer || "Hovedjobb").trim();
      await fnUpsertMonth({
        data: {
          year: result.year,
          month: result.month,
          employer,
          lonn: result.lonn,
          skatt: result.skatt,
          ekstra: result.ekstra,
          source: file.name,
        },
      });
      // Lagre selve filen i storage så den kan åpnes seinere
      try {
        await fnSaveFile({
          data: {
            year: result.year,
            month: result.month,
            employer,
            fileName: file.name,
            mimeType: mime,
            base64,
            sizeBytes: file.size,
          },
        });
        reloadFiles();
        setOpenYears((p) => ({ ...p, [result.year]: true }));
      } catch (fileErr) {
        console.warn("Kunne ikke lagre selve filen", fileErr);
      }
      if (!years.includes(result.year)) {
        setYears((prev) => Array.from(new Set([...prev, result.year])).sort());
      }
      if (result.year === year) {
        await reload(year);
      } else {
        setYear(result.year);
      }
      setImportMsg(
        `Importert til ${MONTH_NAMES[result.month - 1]} ${result.year} (${employer}): ` +
        `Lønn ${fmt(result.lonn)} kr, Skatt ${fmt(result.skatt)} kr, Ekstra ${fmt(result.ekstra)} kr.` +
        (result.note ? ` (${result.note})` : ""),
      );
      setImportEmployer("");
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Klarte ikke importere");
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Group rows per month for UI
  const grouped = useMemo(() => {
    const byMonth = new Map<number, Row[]>();
    for (let m = 1; m <= 12; m++) byMonth.set(m, []);
    for (const r of rows) byMonth.get(r.month)!.push(r);
    return byMonth;
  }, [rows]);

  const calc = useMemo(() => {
    const sumLonn = rows.reduce((a, r) => a + r.lonn, 0);
    const sumSkatt = rows.reduce((a, r) => a + r.skatt, 0);
    const sumEkstra = rows.reduce((a, r) => a + r.ekstra, 0);
    const sumTrukket = sumSkatt + sumEkstra;
    const sumUtbetalt = sumLonn - sumTrukket;
    const skattProsent = sumLonn > 0 ? (sumTrukket / sumLonn) * 100 : 0;
    const tilGodeEllerRest = sumTrukket - settings.skal_betale;
    const utenEkstra = sumSkatt - settings.skal_betale;
    return {
      sumLonn, sumSkatt, sumEkstra, sumTrukket, sumUtbetalt,
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
            <div className="ml-auto flex flex-wrap gap-2 items-center">
              <Input
                placeholder="Arbeidsgiver (valgfritt)"
                className="h-9 w-48"
                value={importEmployer}
                onChange={(e) => setImportEmployer(e.target.value)}
              />
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
                  <Save /> Lagre alle
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tips: La feltet stå tomt så bruker AI navnet på arbeidsgiveren fra slippen. Skriv inn et navn for å overstyre.
          </p>
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

        {/* Kurver siste 3 år */}
        <SkattCharts currentYear={year} refreshKey={rows.length} />

        {/* Forslag til ekstra skatt pr mnd (frittstående) */}
        <BreakEvenSuggestion rows={rows} skalBetale={settings.skal_betale} />
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

        {/* Måned-tabell — redigerbar med flere arbeidsgivere */}
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Måned</th>
                  <th className="text-left p-3">Arbeidsgiver</th>
                  <th className="text-right p-3">Lønn</th>
                  <th className="text-right p-3">Skatt</th>
                  <th className="text-right p-3">Ekstra</th>
                  <th className="text-right p-3">Utbetalt</th>
                  <th className="text-right p-3">Skatt %</th>
                  <th className="p-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([month, monthRows]) => {
                  const sumL = monthRows.reduce((a, r) => a + r.lonn, 0);
                  const sumS = monthRows.reduce((a, r) => a + r.skatt, 0);
                  const sumE = monthRows.reduce((a, r) => a + r.ekstra, 0);
                  const utb = sumL - sumS - sumE;
                  const pct = sumL > 0 ? ((sumS + sumE) / sumL) * 100 : 0;
                  const showSubtotal = monthRows.length > 1;
                  return (
                    <FragmentRows key={month}>
                      {monthRows.map((r, idx) => {
                        const utbR = r.lonn - r.skatt - r.ekstra;
                        const pctR = r.lonn > 0 ? ((r.skatt + r.ekstra) / r.lonn) * 100 : 0;
                        return (
                          <tr key={r.key} className="border-t border-border">
                            <td className="p-2 font-medium whitespace-nowrap">
                              {idx === 0 ? MONTH_NAMES[month - 1] : ""}
                            </td>
                            <td className="p-1">
                              <Input
                                className="h-8 w-40"
                                value={r.employer}
                                onChange={(e) => renameEmployer(r.key, e.target.value)}
                              />
                            </td>
                            <td className="p-1 text-right">
                              <NumCell value={r.lonn} onChange={(v) => updateRow(r.key, { lonn: v })} />
                            </td>
                            <td className="p-1 text-right">
                              <NumCell value={r.skatt} onChange={(v) => updateRow(r.key, { skatt: v })} />
                            </td>
                            <td className="p-1 text-right">
                              <NumCell value={r.ekstra} onChange={(v) => updateRow(r.key, { ekstra: v })} />
                            </td>
                            <td className="p-2 text-right tabular-nums font-semibold">{fmt(utbR)}</td>
                            <td className="p-2 text-right tabular-nums">{fmtPct(pctR)}</td>
                            <td className="p-2">
                              <div className="flex items-center justify-end gap-1">
                                {r.saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                  : r.saved ? <Check className="size-4 text-green-500" />
                                  : r.dirty ? (
                                    <button
                                      onClick={() => saveRow(r)}
                                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
                                    >
                                      Lagre
                                    </button>
                                  ) : null}
                                <button
                                  onClick={() => removeRow(r)}
                                  className="text-muted-foreground hover:text-red-500 p-1"
                                  title="Slett"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {showSubtotal && (
                        <tr className="border-t border-border bg-muted/20 text-xs italic">
                          <td className="p-2"></td>
                          <td className="p-2 text-muted-foreground">Sum {MONTH_NAMES[month - 1]}</td>
                          <td className="p-2 text-right tabular-nums">{fmt(sumL)}</td>
                          <td className="p-2 text-right tabular-nums">{fmt(sumS)}</td>
                          <td className="p-2 text-right tabular-nums">{fmt(sumE)}</td>
                          <td className="p-2 text-right tabular-nums">{fmt(utb)}</td>
                          <td className="p-2 text-right tabular-nums">{fmtPct(pct)}</td>
                          <td></td>
                        </tr>
                      )}
                      <tr className="border-t border-dashed border-border/60">
                        <td colSpan={8} className="p-1 pl-3">
                          <button
                            onClick={() => addEmployerRow(month)}
                            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                          >
                            <Plus className="size-3" /> Legg til arbeidsgiver i {MONTH_NAMES[month - 1]}
                          </button>
                        </td>
                      </tr>
                    </FragmentRows>
                  );
                })}
                <tr className="border-t-2 border-primary/40 bg-muted/30 font-semibold">
                  <td className="p-3" colSpan={2}>Sum året</td>
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

        {/* Lønnsslipp-arkiv */}
        <PayslipArchive
          files={files}
          openYears={openYears}
          setOpenYears={setOpenYears}
          onDelete={async (id) => {
            if (!confirm("Slette filen?")) return;
            try {
              await fnDeleteFile({ data: { id } });
              reloadFiles();
            } catch (e) {
              alert("Kunne ikke slette: " + (e instanceof Error ? e.message : "ukjent"));
            }
          }}
        />


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

        {/* Frittstående skatteberegning */}
        <StandaloneTaxCalculator defaultYear={year} />
      </section>
    </PageShell>
  );
}

function BreakEvenSuggestion({ rows, skalBetale }: { rows: Row[]; skalBetale: number }) {
  const filledMonths = new Set(rows.filter((r) => r.lonn > 0 || r.skatt > 0).map((r) => r.month));
  const monthsDone = filledMonths.size;
  const monthsLeft = Math.max(0, 12 - monthsDone);
  const sumLonnSoFar = rows.reduce((a, r) => a + r.lonn, 0);
  const sumSkattSoFar = rows.reduce((a, r) => a + r.skatt, 0); // ordinær, uten ekstra
  const sumEkstraSoFar = rows.reduce((a, r) => a + r.ekstra, 0);
  const avgLonn = monthsDone > 0 ? sumLonnSoFar / monthsDone : 0;
  const avgSkattOrd = monthsDone > 0 ? sumSkattSoFar / monthsDone : 0;
  const projOrdSkattRest = avgSkattOrd * monthsLeft;
  const projTotalOrdSkatt = sumSkattSoFar + projOrdSkattRest;
  const mangler = skalBetale - projTotalOrdSkatt - sumEkstraSoFar;
  const ekstraPrMnd = monthsLeft > 0 ? Math.max(0, mangler / monthsLeft) : 0;
  const overskudd = mangler < 0 ? Math.abs(mangler) : 0;

  if (skalBetale <= 0) return null;

  return (
    <Card className="p-5 border-2 border-dashed border-primary/40 space-y-2">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        Forslag — ekstra skatt pr mnd for å gå i null
      </div>
      <div className="text-3xl md:text-4xl font-semibold tabular-nums text-primary">
        {fmt(ekstraPrMnd)} kr / mnd
      </div>
      <div className="text-sm text-muted-foreground space-y-1">
        <div>
          Basert på snitt fra {monthsDone} fylte måneder (lønn ~{fmt(avgLonn)} kr/mnd, ordinær skatt ~{fmt(avgSkattOrd)} kr/mnd) og {monthsLeft} måneder igjen.
        </div>
        <div>
          Antatt skatt for året: {fmt(skalBetale)} kr — projisert ordinær skatt: {fmt(projTotalOrdSkatt)} kr — allerede ekstra trukket: {fmt(sumEkstraSoFar)} kr.
        </div>
        {overskudd > 0 && (
          <div className="text-green-500">Du ligger an til {fmt(overskudd)} kr til gode — ingen ekstra trekk nødvendig.</div>
        )}
      </div>
      <div className="text-xs text-muted-foreground italic">
        Frittstående forslag — påvirker ikke tabellen eller justeringene over.
      </div>
    </Card>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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

