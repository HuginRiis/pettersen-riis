import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, Plus, Trash2, Coins, FileText, Sparkles, Check, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  listOkonomiCategories,
  upsertOkonomiCategory,
  deleteOkonomiCategory,
  listOkonomiTransactions,
  upsertOkonomiTransaction,
  deleteOkonomiTransaction,
  bulkUpdateOkonomiCategory,
  importOkonomiTransactions,
  findOkonomiDuplicates,
  findExistingOkonomiDuplicates,
  bulkDeleteOkonomiTransactions,
  parseStatementWithAI,
  categorizeTransactionsWithAI,
  getOkonomiSettings,
  learnMerchantRule,
  listOkonomiAccounts,
  type OkonomiCategory,
  type OkonomiTransaction,
  type OkonomiSettings,
  type OkonomiAccount,
  type ParsedTxn,
} from "@/server/okonomi.functions";
import { OkonomiAccountsTab, classifyAccount } from "@/components/OkonomiAccountsTab";
import { OkonomiBulkEditSheet } from "@/components/OkonomiBulkEditSheet";

export const Route = createFileRoute("/okonomi")({
  head: () => ({
    meta: [
      { title: "Iron Bank of Braavos | House Pettersen Riis" },
      { name: "description", content: "Budsjett og forbruk — familieøkonomi i Iron Bank-stil." },
    ],
  }),
  component: OkonomiGate,
});

const VAULT_PIN = "9272";
const VAULT_UNLOCK_KEY = "okonomi_vault_unlocked";

function OkonomiGate() {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      setUnlocked(sessionStorage.getItem(VAULT_UNLOCK_KEY) === "1");
    } catch {
      // ignore
    }
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (unlocked) return <OkonomiPage />;

  function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pin === VAULT_PIN) {
      try { sessionStorage.setItem(VAULT_UNLOCK_KEY, "1"); } catch { /* ignore */ }
      setUnlocked(true);
      setErr(null);
    } else {
      setErr("Feil kode");
      setPin("");
    }
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-10 max-w-md">
        <div className="panel rounded-lg p-6 border border-amber-500/40">
          <div className="flex items-center gap-2 mb-2 text-amber-400">
            <Lock className="w-5 h-5" />
            <h1 className="text-lg font-serif">Husholdningens hvelv — låst</h1>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Skriv inn 4-sifret kode for å åpne hvelvet.
          </p>
          <form onSubmit={tryUnlock} className="flex gap-2 items-start">
            <Input
              autoFocus
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)); setErr(null); }}
              placeholder="••••"
              className="h-10 w-32 tracking-[0.4em] text-center"
            />
            <Button type="submit" variant="secondary" className="h-10">Åpne</Button>
          </form>
          {err && <p className="text-xs text-destructive mt-2">{err}</p>}
        </div>
      </div>
    </PageShell>
  );
}

const fmt = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n) + " kr";

function OkonomiPage() {
  const listCats = useServerFn(listOkonomiCategories);
  const listTxns = useServerFn(listOkonomiTransactions);
  const getSettings = useServerFn(getOkonomiSettings);
  const listAccs = useServerFn(listOkonomiAccounts);
  const [cats, setCats] = useState<OkonomiCategory[]>([]);
  const [txns, setTxns] = useState<OkonomiTransaction[]>([]);
  const [settings, setSettings] = useState<OkonomiSettings | null>(null);
  const [accounts, setAccounts] = useState<OkonomiAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Bulk-edit sheet state (åpnes når man klikker på en av stat-boksene)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkSubtitle, setBulkSubtitle] = useState<string | undefined>(undefined);
  const [bulkTxns, setBulkTxns] = useState<OkonomiTransaction[]>([]);

  function openBulk(title: string, items: OkonomiTransaction[], subtitle?: string) {
    setBulkTitle(title);
    setBulkSubtitle(subtitle);
    setBulkTxns(items);
    setBulkOpen(true);
  }

  async function reload() {
    setLoading(true);
    try {
      const now = new Date();
      const from = `${now.getFullYear() - 1}-01-01`;
      const [c, t, s, a] = await Promise.all([
        listCats(),
        listTxns({ data: { from, limit: 2000 } }),
        getSettings(),
        listAccs(),
      ]);
      setCats(c);
      setTxns(t);
      setSettings(s);
      setAccounts(a);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke laste");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, []);

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-amber-500/60 bg-gradient-to-br from-amber-900/40 to-amber-600/20 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)]">
            <Coins className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] tracking-[0.4em] uppercase text-amber-400/80">
              Iron Bank of Braavos
            </p>
            <h1 className="text-2xl font-serif text-amber-100">Husholdningens hvelv</h1>
            <p className="text-xs text-muted-foreground italic">
              «The Iron Bank will have its due»
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Teller mynter…
          </div>
        ) : (
          <Tabs defaultValue="oversikt">
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
              <TabsTrigger value="posteringer">Posteringer</TabsTrigger>
              <TabsTrigger value="kontoer">Kontoer</TabsTrigger>
              <TabsTrigger value="budsjett">Budsjett</TabsTrigger>
              <TabsTrigger value="import">Importer</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="mt-4">
              <Oversikt cats={cats} txns={txns} settings={settings} reload={reload} openBulk={openBulk} />
            </TabsContent>
            <TabsContent value="posteringer" className="mt-4">
              <Posteringer cats={cats} txns={txns} reload={reload} />
            </TabsContent>
            <TabsContent value="kontoer" className="mt-4">
              <OkonomiAccountsTab
                accounts={accounts}
                txns={txns}
                onPickAccount={(a, items) => openBulk(a.name, items, "Posteringer på konto")}
              />
            </TabsContent>
            <TabsContent value="budsjett" className="mt-4">
              <Budsjett cats={cats} reload={reload} />
            </TabsContent>
            <TabsContent value="import" className="mt-4">
              <ImportTab cats={cats} reload={reload} />
            </TabsContent>
          </Tabs>
        )}

        <OkonomiBulkEditSheet
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          title={bulkTitle}
          subtitle={bulkSubtitle}
          txns={bulkTxns}
          cats={cats}
          accounts={accounts}
          onSaved={reload}
        />
      </div>
    </PageShell>
  );
}

// ---------------- Oversikt ----------------

function Oversikt({
  cats,
  txns,
  settings,
  reload,
  openBulk,
}: {
  cats: OkonomiCategory[];
  txns: OkonomiTransaction[];
  settings: OkonomiSettings | null;
  reload: () => void;
  openBulk: (title: string, items: OkonomiTransaction[], subtitle?: string) => void;
}) {
  const today = new Date();
  const currentY = today.getFullYear();
  const currentM = today.getMonth() + 1;

  const [year, setYear] = usePersistedState<number>("okonomi_oversikt_year", currentY);
  const [month, setMonth] = usePersistedState<number | "all">("okonomi_oversikt_month", currentM);
  const [chartEndY, setChartEndY] = usePersistedState<number>("okonomi_chart_end_y", currentY);
  const [chartEndM, setChartEndM] = usePersistedState<number>("okonomi_chart_end_m", currentM);
  const [chartEndPayCut, setChartEndPayCut] = usePersistedState<boolean>("okonomi_chart_end_paycut", true);
  const startDefault = new Date(currentY, currentM - 1 - 11, 1);
  const [chartStartY, setChartStartY] = usePersistedState<number>("okonomi_chart_start_y", startDefault.getFullYear());
  const [chartStartM, setChartStartM] = usePersistedState<number>("okonomi_chart_start_m", startDefault.getMonth() + 1);
  const [chartStartPayCut, setChartStartPayCut] = usePersistedState<boolean>("okonomi_chart_start_paycut", false);

  // Periodefilter for "stats-boksene" (uavhengig av år/mnd-filteret over)
  const [periodStartY, setPeriodStartY] = usePersistedState<number>("okonomi_period_start_y", startDefault.getFullYear());
  const [periodStartM, setPeriodStartM] = usePersistedState<number>("okonomi_period_start_m", startDefault.getMonth() + 1);
  const [periodStartPayCut, setPeriodStartPayCut] = usePersistedState<boolean>("okonomi_period_start_paycut", false);
  const [periodEndY, setPeriodEndY] = usePersistedState<number>("okonomi_period_end_y", currentY);
  const [periodEndM, setPeriodEndM] = usePersistedState<number>("okonomi_period_end_m", currentM);
  const [periodEndPayCut, setPeriodEndPayCut] = usePersistedState<boolean>("okonomi_period_end_paycut", true);

  // Filter for "Mot typisk norsk familie": fra–til år/måned
  const [benchStartY, setBenchStartY] = usePersistedState<number>("okonomi_bench_start_y", currentY);
  const [benchStartM, setBenchStartM] = usePersistedState<number>("okonomi_bench_start_m", 1);
  const [benchY, setBenchY] = usePersistedState<number>("okonomi_bench_y", currentY);
  const [benchM, setBenchM] = usePersistedState<number>("okonomi_bench_m", currentM);

  // Drill-down state (inline ekspandering)
  const [drillTopCat, setDrillTopCat] = useState<string | null>(null);
  const [drillBenchCat, setDrillBenchCat] = useState<string | null>(null);
  const [drillPieCat, setDrillPieCat] = useState<string | null>(null);
  const [drillTrendMonth, setDrillTrendMonth] = useState<string | null>(null);

  // Hvilke kategorier som er EKSKLUDERT fra beregning. "uten" = uten kategori.
  // Default: alle inkludert. Lagres i localStorage.
  const EXCL_KEY = "okonomi_excluded_cats";
  const [excludedCats, setExcludedCats] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(EXCL_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  });
  useEffect(() => {
    try {
      localStorage.setItem(EXCL_KEY, JSON.stringify(Array.from(excludedCats)));
    } catch {}
  }, [excludedCats]);
  const [catsOpen, setCatsOpen] = useState(false);
  const toggleCatExcluded = (id: string) =>
    setExcludedCats((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>([currentY]);
    for (const t of txns) {
      const y = Number(t.txn_date.slice(0, 4));
      if (isFinite(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [txns, currentY]);

  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const isIncluded = (t: OkonomiTransaction) => {
    const key = t.category_id ?? "uten";
    return !excludedCats.has(key);
  };
  const isExpense = (t: OkonomiTransaction) => {
    if (!isIncluded(t)) return false;
    const c = t.category_id ? catMap.get(t.category_id) : undefined;
    if (c?.is_income) return false;
    return Number(t.amount) < 0;
  };
  const isIncome = (t: OkonomiTransaction) => {
    if (!isIncluded(t)) return false;
    const c = t.category_id ? catMap.get(t.category_id) : undefined;
    if (c?.is_income) return true;
    return Number(t.amount) > 0;
  };

  // Filtrer på valgt år/mnd
  const ymPrefix = month === "all" ? `${year}-` : `${year}-${String(month).padStart(2, "0")}`;
  const filtered = txns.filter((t) => t.txn_date.startsWith(ymPrefix));
  const isCurrentPeriod =
    year === currentY && (month === "all" || month === currentM);

  const brukt = filtered.filter(isExpense).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const inntekt = filtered.filter(isIncome).reduce((s, t) => s + Number(t.amount), 0);
  const monthsCount = month === "all" ? 12 : 1;
  const budsjett = cats.filter((c) => !excludedCats.has(c.id)).reduce((s, c) => s + (Number(c.monthly_budget) || 0), 0) * monthsCount;
  const igjen = Math.max(0, budsjett - brukt);
  const netto = inntekt - brukt;

  // Snitt brukt pr dag + igjen pr dag
  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
  let elapsedDays: number;
  let daysUntilPayday: number;
  if (month === "all") {
    // hele året
    if (year === currentY) {
      const startOfYear = new Date(year, 0, 1);
      elapsedDays = Math.max(
        1,
        Math.floor((today.getTime() - startOfYear.getTime()) / 86400000) + 1,
      );
    } else {
      elapsedDays = year < currentY ? 365 : 1;
    }
    daysUntilPayday = 0;
  } else {
    const dim = daysInMonth(year, month);
    if (year === currentY && month === currentM) {
      elapsedDays = today.getDate();
    } else if (year < currentY || (year === currentY && month < currentM)) {
      elapsedDays = dim;
    } else {
      elapsedDays = 1;
    }
    // Dager til neste lønning (kun nyttig for inneværende måned)
    const payday = settings?.payday_day ?? 15;
    if (year === currentY && month === currentM) {
      const day = today.getDate();
      if (day < payday) daysUntilPayday = payday - day;
      else {
        const nextPayday = new Date(year, month, payday); // neste mnd
        daysUntilPayday = Math.max(
          1,
          Math.ceil((nextPayday.getTime() - today.getTime()) / 86400000),
        );
      }
    } else {
      daysUntilPayday = 0;
    }
  }
  const snittPrDag = elapsedDays > 0 ? brukt / elapsedDays : 0;
  const overskudd = inntekt - brukt;
  const igjenPrDag = daysUntilPayday > 0 ? overskudd / daysUntilPayday : overskudd;

  // ---- Periodefilter-stats (uavhengig sett med bokser) ----
  const periodStartAnchor = new Date(periodStartY, periodStartM - 1, 1);
  const periodEndAnchorLast = new Date(periodEndY, periodEndM, 0);
  const startKey = `${periodStartY}-${String(periodStartM).padStart(2, "0")}`;
  const endKey = `${periodEndY}-${String(periodEndM).padStart(2, "0")}`;
  let periodTxns: OkonomiTransaction[] = [];
  let effectiveStartDate = periodStartAnchor;
  let effectiveEndDate = periodEndAnchorLast;
  if (periodEndAnchorLast >= periodStartAnchor) {
    periodTxns = txns.filter((t) => {
      const k = t.txn_date.slice(0, 7);
      return k >= startKey && k <= endKey;
    });
    if (periodStartPayCut) {
      const salary = periodTxns
        .filter((t) => t.txn_date.slice(0, 7) === startKey && isIncome(t) && Number(t.amount) > 30000)
        .sort((a, b) => a.txn_date.localeCompare(b.txn_date))[0];
      if (salary) {
        periodTxns = periodTxns.filter(
          (t) => t.txn_date.slice(0, 7) !== startKey || t.txn_date >= salary.txn_date,
        );
        effectiveStartDate = new Date(salary.txn_date);
      }
    }
    if (periodEndPayCut) {
      const salary = periodTxns
        .filter((t) => t.txn_date.slice(0, 7) === endKey && isIncome(t) && Number(t.amount) > 30000)
        .sort((a, b) => a.txn_date.localeCompare(b.txn_date))[0];
      if (salary) {
        periodTxns = periodTxns.filter(
          (t) => t.txn_date.slice(0, 7) !== endKey || t.txn_date < salary.txn_date,
        );
        const d = new Date(salary.txn_date);
        d.setDate(d.getDate() - 1);
        effectiveEndDate = d;
      }
    }
  }
  const periodBrukt = periodTxns.filter(isExpense).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const periodInntekt = periodTxns.filter(isIncome).reduce((s, t) => s + Number(t.amount), 0);
  const periodMonths = Math.max(
    1,
    (periodEndY - periodStartY) * 12 + (periodEndM - periodStartM) + 1,
  );
  const periodBudsjett = cats.filter((c) => !excludedCats.has(c.id)).reduce((s, c) => s + (Number(c.monthly_budget) || 0), 0) * periodMonths;
  const periodOverskudd = periodInntekt - periodBrukt;
  const periodIgjen = Math.max(0, periodBudsjett - periodBrukt);
  const cappedEnd = effectiveEndDate > today ? today : effectiveEndDate;
  const periodDays = Math.max(
    1,
    Math.floor((cappedEnd.getTime() - effectiveStartDate.getTime()) / 86400000) + 1,
  );
  const periodSnittPrDag = periodBrukt / periodDays;


  // Per kategori i valgt periode
  const perCat = new Map<string, number>();
  for (const t of filtered.filter(isExpense)) {
    const k = t.category_id ?? "uten";
    perCat.set(k, (perCat.get(k) || 0) + Math.abs(Number(t.amount)));
  }
  const benchmarks = settings?.benchmarks ?? {};
  const catData = Array.from(perCat.entries())
    .map(([id, sum]) => {
      const c = cats.find((x) => x.id === id);
      const benchPerMonth = Number(benchmarks[id] || 0);
      const bench = benchPerMonth * monthsCount;
      return {
        id,
        name: c?.name ?? "Uten kategori",
        color: c?.color ?? "#94a3b8",
        sum,
        budget: (Number(c?.monthly_budget) || 0) * monthsCount,
        bench,
      };
    })
    .sort((a, b) => b.sum - a.sum);

  const top5 = catData.slice(0, 5);

  // Per kategori for benchmark-perioden (fra benchStart til benchY/benchM, inkl)
  const benchStartIdx = benchStartY * 12 + (benchStartM - 1);
  const benchEndIdx = benchY * 12 + (benchM - 1);
  const benchMonths = Math.max(1, benchEndIdx - benchStartIdx + 1);
  const benchPerCat = new Map<string, number>();
  for (const t of txns) {
    if (!isExpense(t)) continue;
    const y = Number(t.txn_date.slice(0, 4));
    const m = Number(t.txn_date.slice(5, 7));
    const idx = y * 12 + (m - 1);
    if (idx < benchStartIdx || idx > benchEndIdx) continue;
    const k = t.category_id ?? "uten";
    benchPerCat.set(k, (benchPerCat.get(k) || 0) + Math.abs(Number(t.amount)));
  }
  // Inkluder ALLE kategorier (også de uten forbruk/benchmark) + "uten" hvis brukt
  const benchCatIds = new Set<string>(cats.map((c) => c.id));
  for (const k of benchPerCat.keys()) benchCatIds.add(k);
  for (const k of Object.keys(benchmarks)) benchCatIds.add(k);
  const benchCatData = Array.from(benchCatIds)
    .map((id) => {
      const c = cats.find((x) => x.id === id);
      const benchPerMonth = Number(benchmarks[id] || 0);
      const sum = benchPerCat.get(id) || 0;
      return {
        id,
        name: c?.name ?? "Uten kategori",
        color: c?.color ?? "#94a3b8",
        sum,
        bench: benchPerMonth * benchMonths,
      };
    })
    .sort((a, b) => (b.sum + b.bench) - (a.sum + a.bench));

  // Trend fra valgt startmåned til valgt sluttmåned (inkl). Lønnsperiode-kutt valgfritt på hver side.
  const startAnchor = new Date(chartStartY, chartStartM - 1, 1);
  const endAnchor = new Date(chartEndY, chartEndM - 1, 1);
  const months: { key: string; label: string; isFirst: boolean; isLast: boolean }[] = [];
  if (endAnchor >= startAnchor) {
    const cursor = new Date(startAnchor);
    while (cursor <= endAnchor) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        label: cursor.toLocaleDateString("nb-NO", { month: "short", year: "2-digit" }),
        isFirst: false,
        isLast: false,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (months.length > 0) {
      months[0].isFirst = true;
      months[months.length - 1].isLast = true;
    }
  }
  const trend = months.map((m) => {
    let rows = txns.filter((t) => t.txn_date.startsWith(m.key));
    if (m.isLast && chartEndPayCut) {
      // Kutt alt fra og med første lønnsutbetaling i sluttmåneden (lønnen tas IKKE med)
      const salary = rows
        .filter((t) => isIncome(t) && Number(t.amount) > 30000)
        .sort((a, b) => a.txn_date.localeCompare(b.txn_date))[0];
      if (salary) rows = rows.filter((t) => t.txn_date < salary.txn_date);
    }
    if (m.isFirst && chartStartPayCut) {
      // Kutt alt før første lønn i startmåneden (lønnen tas MED)
      const salary = rows
        .filter((t) => isIncome(t) && Number(t.amount) > 30000)
        .sort((a, b) => a.txn_date.localeCompare(b.txn_date))[0];
      if (salary) rows = rows.filter((t) => t.txn_date >= salary.txn_date);
    }
    return {
      label: m.label,
      Inntekt: rows.filter(isIncome).reduce((s, t) => s + Number(t.amount), 0),
      Utgift: rows.filter(isExpense).reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
    };
  });

  const monthNames = [
    "Januar", "Februar", "Mars", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Desember",
  ];

  return (
    <div className="space-y-4">
      {/* Filter */}
      <Card className="p-3 border-amber-500/30">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">År</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearsAvailable.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Måned</Label>
            <Select
              value={month === "all" ? "all" : String(month)}
              onValueChange={(v) => setMonth(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Hele året</SelectItem>
                {monthNames.map((n, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Kategorier inkludert i beregningen */}
      <Card className="p-3 border-amber-500/30">
        <div className="flex items-center justify-between mb-2 gap-2">
          <button
            type="button"
            onClick={() => setCatsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase text-amber-400"
          >
            <span className="text-xs">{catsOpen ? "▾" : "▸"}</span>
            Kategorier i beregning
            <span className="text-[10px] text-muted-foreground normal-case tracking-normal ml-1">
              ({cats.length - excludedCats.size + (excludedCats.has("uten") ? 0 : 1)}/{cats.length + 1} på)
            </span>
          </button>
          {catsOpen && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => setExcludedCats(new Set())}
            >
              Alle på
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() =>
                setExcludedCats(new Set([...cats.map((c) => c.id), "uten"]))
              }
            >
              Alle av
            </Button>
          </div>
          )}
        </div>
        {catsOpen && (
        <ul className="space-y-1.5">
          {cats.map((c) => {
            const on = !excludedCats.has(c.id);
            return (
              <li key={c.id} className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: c.color }}
                />
                <span className="flex-1 text-xs truncate">
                  {c.name}
                  {c.is_income && <span className="text-emerald-400/70 ml-1">(inntekt)</span>}
                  {c.is_transfer && <span className="text-sky-400/70 ml-1">(overføring)</span>}
                </span>
                <Switch checked={on} onCheckedChange={() => toggleCatExcluded(c.id)} />
              </li>
            );
          })}
          <li className="flex items-center gap-2 pt-1 border-t border-amber-500/10">
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 bg-slate-500" />
            <span className="flex-1 text-xs italic text-muted-foreground">Uten kategori</span>
            <Switch
              checked={!excludedCats.has("uten")}
              onCheckedChange={() => toggleCatExcluded("uten")}
            />
          </li>
        </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Brukt" value={fmt(brukt)} tone="warn" onClick={() => openBulk(`Brukt — ${ymPrefix}`, filtered.filter(isExpense), "Klikk for å redigere")} />
        <Stat label="Inntekt" value={fmt(inntekt)} tone="ok" onClick={() => openBulk(`Inntekt — ${ymPrefix}`, filtered.filter(isIncome), "Klikk for å redigere")} />
        <Stat label="Budsjett" value={fmt(budsjett)} onClick={() => openBulk(`Posteringer i periode — ${ymPrefix}`, filtered, "Alle posteringer")} />
        <Stat
          label={netto >= 0 ? "Overskudd" : "Underskudd"}
          value={fmt(Math.abs(netto))}
          tone={netto >= 0 ? "ok" : "warn"}
          onClick={() => openBulk(`Netto — ${ymPrefix}`, filtered, "Inntekt + utgift")}
        />
        <Stat label={`Snitt pr dag (${elapsedDays} d)`} value={fmt(snittPrDag)} onClick={() => openBulk(`Utgifter — ${ymPrefix}`, filtered.filter(isExpense))} />
        {daysUntilPayday > 0 ? (
          <Stat
            label={`Igjen pr dag (${daysUntilPayday} d til lønn)`}
            value={fmt(igjenPrDag)}
            tone={igjenPrDag <= 0 ? "warn" : "ok"}
            onClick={() => openBulk(`Posteringer — ${ymPrefix}`, filtered)}
          />
        ) : (
          <Stat label="Igjen" value={fmt(igjen)} onClick={() => openBulk(`Posteringer — ${ymPrefix}`, filtered)} />
        )}
      </div>

      {/* Periodefilter med lønnsperiode (egne bokser) */}
      <Card className="p-3 border-amber-500/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1 p-2 rounded border border-amber-500/20">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fra</Label>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lønnsperiode</Label>
                <Switch checked={periodStartPayCut} onCheckedChange={setPeriodStartPayCut} />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={String(periodStartM)} onValueChange={(v) => setPeriodStartM(Number(v))}>
                <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthNames.map((n, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(periodStartY)} onValueChange={(v) => setPeriodStartY(Number(v))}>
                <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearsAvailable.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1 p-2 rounded border border-amber-500/20">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Til</Label>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lønnsperiode</Label>
                <Switch checked={periodEndPayCut} onCheckedChange={setPeriodEndPayCut} />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={String(periodEndM)} onValueChange={(v) => setPeriodEndM(Number(v))}>
                <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthNames.map((n, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(periodEndY)} onValueChange={(v) => setPeriodEndY(Number(v))}>
                <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearsAvailable.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Brukt" value={fmt(periodBrukt)} tone="warn" onClick={() => openBulk(`Brukt — ${startKey} → ${endKey}`, periodTxns.filter(isExpense))} />
        <Stat label="Inntekt" value={fmt(periodInntekt)} tone="ok" onClick={() => openBulk(`Inntekt — ${startKey} → ${endKey}`, periodTxns.filter(isIncome))} />
        <Stat label="Budsjett" value={fmt(periodBudsjett)} onClick={() => openBulk(`Periode — ${startKey} → ${endKey}`, periodTxns)} />
        <Stat
          label={periodOverskudd >= 0 ? "Overskudd" : "Underskudd"}
          value={fmt(Math.abs(periodOverskudd))}
          tone={periodOverskudd >= 0 ? "ok" : "warn"}
          onClick={() => openBulk(`Netto — ${startKey} → ${endKey}`, periodTxns)}
        />
        <Stat label={`Snitt pr dag (${periodDays} d)`} value={fmt(periodSnittPrDag)} onClick={() => openBulk(`Utgifter — ${startKey} → ${endKey}`, periodTxns.filter(isExpense))} />
        <Stat label="Igjen" value={fmt(periodIgjen)} onClick={() => openBulk(`Periode — ${startKey} → ${endKey}`, periodTxns)} />
      </div>


      {!isCurrentPeriod && (
        <p className="text-[11px] text-muted-foreground italic">
          Viser historisk periode — «igjen pr dag» og lønn vises kun for inneværende måned.
        </p>
      )}

      {/* Top 5 */}
      {top5.length > 0 && (
        <Card className="p-4 border-amber-500/30">
          <h3 className="text-sm tracking-[0.25em] uppercase text-amber-400 mb-3">
            Topp 5 kategorier
          </h3>
          <ul className="space-y-1.5 text-sm">
            {top5.map((d, i) => {
              const open = drillTopCat === d.id;
              const items = filtered
                .filter(isExpense)
                .filter((t) => (t.category_id ?? "uten") === d.id)
                .sort((a, b) => b.txn_date.localeCompare(a.txn_date));
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setDrillTopCat(open ? null : d.id)}
                    className="w-full flex items-center gap-2 text-left hover:bg-amber-500/5 rounded px-1 py-0.5"
                  >
                    <span className="w-3 text-amber-400/70 text-[10px]">{open ? "▾" : "▸"}</span>
                    <span className="w-5 text-amber-400/70 tabular-nums text-xs">#{i + 1}</span>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ background: d.color }}
                    />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="tabular-nums text-amber-100">{fmt(d.sum)}</span>
                  </button>
                  {open && <DrillTxns items={items} cats={cats} reload={reload} />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Sammenligning mot snittfamilie */}
      <Card className="p-4 border-amber-500/30">
        <h3 className="text-sm tracking-[0.25em] uppercase text-amber-400 mb-1">
          Mot typisk norsk familie
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          {settings
            ? `${settings.household_adults} voksne, ${settings.household_children_under18} barn < 18, ${settings.household_children_over18} barn ≥ 18`
            : "—"}
          {Object.keys(benchmarks).length === 0 && (
            <> · Generer snitt-tall i Innstillinger.</>
          )}
        </p>
        <div className="flex flex-col gap-2 mb-3 p-2 rounded border border-amber-500/20">
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground w-8">Fra</Label>
            <Select value={String(benchStartM)} onValueChange={(v) => setBenchStartM(Number(v))}>
              <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthNames.map((n, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(benchStartY)} onValueChange={(v) => setBenchStartY(Number(v))}>
              <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearsAvailable.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground w-8">Til</Label>
            <Select value={String(benchM)} onValueChange={(v) => setBenchM(Number(v))}>
              <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthNames.map((n, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(benchY)} onValueChange={(v) => setBenchY(Number(v))}>
              <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearsAvailable.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-[10px] text-muted-foreground text-right">× {benchMonths} mnd</div>
        </div>
        {benchCatData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ingen kategorier ennå.
          </p>
        ) : (
          <ul className="space-y-2">
            {benchCatData.map((d) => {
                const diff = d.sum - d.bench;
                const pct = d.bench > 0 ? (diff / d.bench) * 100 : 0;
                const over = diff > 0;
                const open = drillBenchCat === d.id;
                const items = txns
                  .filter(isExpense)
                  .filter((t) => (t.category_id ?? "uten") === d.id)
                  .filter((t) => {
                    const y = Number(t.txn_date.slice(0, 4));
                    const m = Number(t.txn_date.slice(5, 7));
                    const idx = y * 12 + (m - 1);
                    return idx >= benchStartIdx && idx <= benchEndIdx;
                  })
                  .sort((a, b) => b.txn_date.localeCompare(a.txn_date));
                return (
                  <li key={d.id} className="text-sm">
                    <button
                      type="button"
                      onClick={() => setDrillBenchCat(open ? null : d.id)}
                      className="w-full text-left hover:bg-amber-500/5 rounded px-1 py-0.5"
                    >
                      <div className="flex justify-between mb-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-amber-400/70 text-[10px] w-3">{open ? "▾" : "▸"}</span>
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: d.color }}
                          />
                          <span className="truncate">{d.name}</span>
                        </span>
                        <span className="tabular-nums text-xs flex items-center gap-2">
                          <span className="text-amber-100">{fmt(d.sum)}</span>
                          <span className="text-muted-foreground">
                            / snitt {d.bench > 0 ? fmt(d.bench) : "—"}
                          </span>
                          {d.bench > 0 ? (
                            <span
                              className={`font-semibold ${over ? "text-red-400" : "text-emerald-400"}`}
                            >
                              {over ? "+" : ""}
                              {pct.toFixed(0)}%
                            </span>
                          ) : (
                            <span className="font-semibold text-muted-foreground">—</span>
                          )}
                        </span>
                      </div>
                    </button>
                    {open && <DrillTxns items={items} cats={cats} reload={reload} />}
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      <Card className="p-4 border-amber-500/30">
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm tracking-[0.25em] uppercase text-amber-400">
              Inntekt vs utgift
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 p-2 rounded border border-amber-500/20">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fra</Label>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lønnsperiode</Label>
                  <Switch checked={chartStartPayCut} onCheckedChange={setChartStartPayCut} />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Select value={String(chartStartM)} onValueChange={(v) => setChartStartM(Number(v))}>
                  <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map((n, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(chartStartY)} onValueChange={(v) => setChartStartY(Number(v))}>
                  <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearsAvailable.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1 p-2 rounded border border-amber-500/20">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Til</Label>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lønnsperiode</Label>
                  <Switch checked={chartEndPayCut} onCheckedChange={setChartEndPayCut} />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Select value={String(chartEndM)} onValueChange={(v) => setChartEndM(Number(v))}>
                  <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map((n, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(chartEndY)} onValueChange={(v) => setChartEndY(Number(v))}>
                  <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearsAvailable.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trend}
              margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
              onClick={(e: any) => {
                const lbl = e?.activeLabel;
                if (!lbl) return;
                const idx = trend.findIndex((t) => t.label === lbl);
                if (idx < 0) return;
                const key = months[idx]?.key ?? null;
                setDrillTrendMonth((cur) => (cur === key ? null : key));
              }}
            >
              <CartesianGrid stroke="#3f2d10" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="label" stroke="#a78b4a" fontSize={11} />
              <YAxis stroke="#a78b4a" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "#1a1208", border: "1px solid #92651a" }}
                formatter={(v: any) => fmt(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Inntekt" fill="#10b981" radius={[3, 3, 0, 0]} cursor="pointer" />
              <Bar dataKey="Utgift" fill="#ef4444" radius={[3, 3, 0, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {drillTrendMonth && (() => {
          const idx = months.findIndex((m) => m.key === drillTrendMonth);
          if (idx < 0) return null;
          const m = months[idx];
          let rows = txns.filter((t) => t.txn_date.startsWith(m.key));
          if (m.isLast && chartEndPayCut) {
            const salary = rows
              .filter((t) => isIncome(t) && Number(t.amount) > 30000)
              .sort((a, b) => a.txn_date.localeCompare(b.txn_date))[0];
            if (salary) rows = rows.filter((t) => t.txn_date < salary.txn_date);
          }
          if (m.isFirst && chartStartPayCut) {
            const salary = rows
              .filter((t) => isIncome(t) && Number(t.amount) > 30000)
              .sort((a, b) => a.txn_date.localeCompare(b.txn_date))[0];
            if (salary) rows = rows.filter((t) => t.txn_date >= salary.txn_date);
          }
          const items = rows
            .filter((t) => isExpense(t) || isIncome(t))
            .sort((a, b) => b.txn_date.localeCompare(a.txn_date));
          return (
            <div className="mt-3 pt-3 border-t border-amber-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-amber-400">
                  {m.label} — {items.length} posteringer
                </span>
                <button
                  type="button"
                  onClick={() => setDrillTrendMonth(null)}
                  className="text-[10px] text-muted-foreground hover:text-amber-400"
                >
                  Lukk
                </button>
              </div>
              <DrillTxns items={items} signed cats={cats} reload={reload} />
            </div>
          );
        })()}
      </Card>

      {catData.length > 0 && (
        <Card className="p-4 border-amber-500/30">
          <h3 className="text-sm tracking-[0.25em] uppercase text-amber-400 mb-3">
            Fordeling — {month === "all" ? `hele ${year}` : `${monthNames[month - 1]} ${year}`}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={catData}
                    dataKey="sum"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                    onClick={(data: any) => {
                      const id = data?.id ?? data?.payload?.id;
                      if (!id) return;
                      setDrillPieCat((cur) => (cur === id ? null : id));
                    }}
                  >
                    {catData.map((d) => (
                      <Cell key={d.id} fill={d.color} stroke="#1a1208" cursor="pointer" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1a1208", border: "1px solid #92651a" }}
                    formatter={(v: any) => fmt(Number(v))}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5 text-xs">
              {catData.slice(0, 8).map((d) => {
                const open = drillPieCat === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setDrillPieCat(open ? null : d.id)}
                      className="w-full flex items-center gap-2 text-left hover:bg-amber-500/5 rounded px-1 py-0.5"
                    >
                      <span className="text-amber-400/70 text-[10px] w-3">{open ? "▾" : "▸"}</span>
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="tabular-nums text-amber-100">{fmt(d.sum)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {drillPieCat && (() => {
            const items = filtered
              .filter(isExpense)
              .filter((t) => (t.category_id ?? "uten") === drillPieCat)
              .sort((a, b) => b.txn_date.localeCompare(a.txn_date));
            const cat = catData.find((c) => c.id === drillPieCat);
            return (
              <div className="mt-3 pt-3 border-t border-amber-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wider text-amber-400">
                    {cat?.name ?? "?"} — {items.length} posteringer
                  </span>
                  <button
                    type="button"
                    onClick={() => setDrillPieCat(null)}
                    className="text-[10px] text-muted-foreground hover:text-amber-400"
                  >
                    Lukk
                  </button>
                </div>
                <DrillTxns items={items} cats={cats} reload={reload} />
              </div>
            );
          })()}
        </Card>
      )}

      <Card className="p-4 border-amber-500/30">
        <h3 className="text-sm tracking-[0.25em] uppercase text-amber-400 mb-3">
          Budsjett-status per kategori
        </h3>
        {catData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen posteringer ennå.</p>
        ) : (
          <ul className="space-y-2">
            {catData.map((r) => {
              const pct = r.budget > 0 ? Math.min(100, (r.sum / r.budget) * 100) : 0;
              const over = r.budget > 0 && r.sum > r.budget;
              return (
                <li key={r.id} className="text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                      {r.name}
                    </span>
                    <span className="tabular-nums">
                      {fmt(r.sum)}
                      {r.budget > 0 && <span className="text-muted-foreground"> / {fmt(r.budget)}</span>}
                    </span>
                  </div>
                  {r.budget > 0 && (
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, background: over ? "#ef4444" : r.color }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4 border-amber-500/30">
        <h3 className="text-sm tracking-[0.25em] uppercase text-amber-400 mb-3">
          Netto pr måned
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend.map((t) => ({ label: t.label, Netto: t.Inntekt - t.Utgift }))} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#3f2d10" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="label" stroke="#a78b4a" fontSize={11} />
              <YAxis stroke="#a78b4a" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "#1a1208", border: "1px solid #92651a" }}
                formatter={(v: any) => fmt(Number(v))}
              />
              <Line type="monotone" dataKey="Netto" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function DrillTxns({
  items,
  signed = false,
  cats,
  reload,
}: {
  items: OkonomiTransaction[];
  signed?: boolean;
  cats: OkonomiCategory[];
  reload: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  if (items.length === 0) {
    return <p className="mt-2 pl-6 text-[11px] italic text-muted-foreground">Ingen posteringer.</p>;
  }
  const max = 100;
  const shown = items.slice(0, max);
  return (
    <ul className="mt-1 ml-6 space-y-0.5 text-[11px] border-l border-amber-500/20 pl-2 max-h-80 overflow-y-auto overscroll-contain">
      {shown.map((t) => {
        const n = Number(t.amount);
        const pos = n > 0;
        if (editId === t.id) {
          return (
            <li key={t.id} className="my-1.5">
              <PosteringEditor
                txn={t}
                cats={cats}
                onCancel={() => setEditId(null)}
                onSaved={() => {
                  setEditId(null);
                  reload();
                }}
              />
            </li>
          );
        }
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setEditId(t.id)}
              className="w-full flex justify-between gap-2 text-left hover:bg-amber-500/5 rounded px-1 py-0.5"
            >
              <span className="text-muted-foreground tabular-nums shrink-0 w-12">{t.txn_date.slice(5)}</span>
              <span className="flex-1 truncate text-amber-100/80">{t.description}</span>
              <span className={`tabular-nums shrink-0 ${signed ? (pos ? "text-emerald-400" : "text-red-400") : "text-amber-100"}`}>
                {signed && pos ? "+" : ""}
                {fmt(signed ? n : Math.abs(n))}
              </span>
            </button>
          </li>
        );
      })}
      {items.length > max && (
        <li className="text-muted-foreground italic">+{items.length - max} flere…</li>
      )}
    </ul>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: string; tone?: "ok" | "warn"; onClick?: () => void }) {
  const c = tone === "warn" ? "text-red-400" : tone === "ok" ? "text-emerald-400" : "text-amber-200";
  const clickable = !!onClick;
  return (
    <Card
      className={`p-3 border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-transparent ${clickable ? "cursor-pointer hover:border-amber-500/50 hover:bg-amber-950/30 transition" : ""}`}
      onClick={onClick}
    >
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${c}`}>{value}</p>
    </Card>
  );
}

// ---------------- Posteringer ----------------

function Posteringer({
  cats,
  txns,
  reload,
}: {
  cats: OkonomiCategory[];
  txns: OkonomiTransaction[];
  reload: () => void;
}) {
  const upsert = useServerFn(upsertOkonomiTransaction);
  const del = useServerFn(deleteOkonomiTransaction);
  const bulk = useServerFn(bulkUpdateOkonomiCategory);
  const learn = useServerFn(learnMerchantRule);
  const findExistingDupes = useServerFn(findExistingOkonomiDuplicates);
  const bulkDelete = useServerFn(bulkDeleteOkonomiTransactions);
  const [dupGroups, setDupGroups] = useState<
    Array<{
      key: string;
      keep_id: string;
      duplicates: Array<{ id: string; txn_date: string; description: string; amount: number; account: string | null }>;
    }>
  >([]);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupBusy, setDupBusy] = useState(false);

  async function scanDuplicates() {
    setDupBusy(true);
    try {
      const res = await findExistingDupes();
      setDupGroups(res.groups);
      setDupOpen(true);
      if (res.groups.length === 0) toast.success("Ingen duplikater funnet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setDupBusy(false);
    }
  }

  async function deleteAllDuplicates() {
    const ids = dupGroups.flatMap((g) => g.duplicates.map((d) => d.id));
    if (ids.length === 0) return;
    if (!confirm(`Slette ${ids.length} duplikater (beholder eldste i hver gruppe)?`)) return;
    setDupBusy(true);
    try {
      await bulkDelete({ data: { ids } });
      toast.success(`Slettet ${ids.length} duplikater`);
      setDupGroups([]);
      setDupOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setDupBusy(false);
    }
  }

  async function deleteSingleDup(id: string) {
    setDupBusy(true);
    try {
      await bulkDelete({ data: { ids: [id] } });
      setDupGroups((gs) =>
        gs
          .map((g) => ({ ...g, duplicates: g.duplicates.filter((d) => d.id !== id) }))
          .filter((g) => g.duplicates.length > 0),
      );
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setDupBusy(false);
    }
  }

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [onlyUncat, setOnlyUncat] = usePersistedState<boolean>("okonomi_post_only_uncat", false);
  const [filterCat, setFilterCat] = usePersistedState<string>("okonomi_post_filter_cat", "__all__");
  const [filterPeriod, setFilterPeriod] = usePersistedState<string>("okonomi_post_filter_period", "__all__");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDesc, setBulkDesc] = useState<string>("");
  const [bulkCat, setBulkCat] = useState<string>("");
  const [bulkLearn, setBulkLearn] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [form, setForm] = useState({
    txn_date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    category_id: "",
  });

  // Tilgjengelige perioder (YYYY-MM) fra posteringene
  const periods = useMemo(() => {
    const set = new Set<string>();
    for (const t of txns) {
      if (t.txn_date && t.txn_date.length >= 7) set.add(t.txn_date.slice(0, 7));
    }
    return Array.from(set).sort().reverse();
  }, [txns]);

  // Grupper posteringer etter beskrivelse for "Endre alle"
  const descGroups = useMemo(() => {
    const map = new Map<string, { ids: string[]; total: number; sample: number; catCounts: Map<string, number> }>();
    for (const t of txns) {
      const key = (t.description ?? "").trim();
      if (!key) continue;
      const g = map.get(key) ?? { ids: [], total: 0, sample: Number(t.amount), catCounts: new Map<string, number>() };
      g.ids.push(t.id);
      g.total += Number(t.amount) || 0;
      const ck = t.category_id ?? "__none__";
      g.catCounts.set(ck, (g.catCounts.get(ck) ?? 0) + 1);
      map.set(key, g);
    }
    const catName = (id: string) => id === "__none__" ? "Ukategorisert" : (cats.find((c) => c.id === id)?.name ?? "?");
    return Array.from(map.entries())
      .map(([desc, g]) => {
        const breakdown = Array.from(g.catCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => `${catName(id)} (${n})`)
          .join(", ");
        return { desc, ...g, breakdown };
      })
      .filter((g) => g.ids.length >= 2)
      .sort((a, b) => b.ids.length - a.ids.length);
  }, [txns, cats]);

  const bulkGroup = descGroups.find((g) => g.desc === bulkDesc);

  async function applyBulk() {
    if (!bulkGroup || !bulkCat) return;
    setBulkBusy(true);
    try {
      await bulk({ data: { ids: bulkGroup.ids, category_id: bulkCat } });
      if (bulkLearn) {
        try {
          await learn({ data: { description: bulkDesc, category_id: bulkCat } });
        } catch {}
      }
      toast.success(`Oppdaterte ${bulkGroup.ids.length} posteringer`);
      setBulkOpen(false);
      setBulkDesc("");
      setBulkCat("");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBulkBusy(false);
    }
  }

  async function add() {
    if (!form.description || !form.amount) return;
    try {
      await upsert({
        data: {
          txn_date: form.txn_date,
          description: form.description,
          amount: Number(form.amount),
          category_id: form.category_id || null,
          source: "manual",
          approved: true,
        },
      });
      if (form.category_id) {
        try {
          await learn({ data: { description: form.description, category_id: form.category_id } });
        } catch {}
      }
      toast.success("Lagt til");
      setForm({ ...form, description: "", amount: "" });
      setAdding(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setAdding((v) => !v)} className="w-full" variant="secondary">
        <Plus className="w-4 h-4 mr-1" /> Ny postering
      </Button>
      {adding && (
        <Card className="p-3 space-y-2 border-amber-500/30">
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={form.txn_date}
              onChange={(e) => setForm({ ...form, txn_date: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Beløp (negativt = utgift)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <Input
            placeholder="Beskrivelse"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={add} className="w-full">
            Lagre
          </Button>
        </Card>
      )}
      <Button
        onClick={() => setBulkOpen((v) => !v)}
        className="w-full"
        variant="outline"
      >
        <Sparkles className="w-4 h-4 mr-1" /> Endre alle med samme navn
      </Button>
      {bulkOpen && (
        <Card className="p-3 space-y-2 border-amber-500/30">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Velg navn ({descGroups.length} grupper med 2+ posteringer)
          </Label>
          <Select value={bulkDesc} onValueChange={setBulkDesc}>
            <SelectTrigger>
              <SelectValue placeholder="Velg beskrivelse…" />
            </SelectTrigger>
            <SelectContent>
              {descGroups.slice(0, 300).map((g) => (
                <SelectItem key={g.desc} value={g.desc}>
                  {g.desc} — {g.ids.length} stk · {g.breakdown}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bulkGroup && (
            <p className="text-[11px] text-muted-foreground">
              {bulkGroup.ids.length} posteringer · totalt {fmt(bulkGroup.total)}
              <br />
              <span className="text-amber-300/80">Nåværende: {bulkGroup.breakdown}</span>
            </p>
          )}
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ny kategori
          </Label>
          <Select value={bulkCat} onValueChange={setBulkCat}>
            <SelectTrigger>
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between pt-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-2">
              <Switch checked={bulkLearn} onCheckedChange={setBulkLearn} />
              Lær regel for fremtiden
            </Label>
          </div>
          <Button
            onClick={applyBulk}
            disabled={!bulkGroup || !bulkCat || bulkBusy}
            className="w-full"
          >
            {bulkBusy ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-1" />
            )}
            Bruk på alle {bulkGroup ? `(${bulkGroup.ids.length})` : ""}
          </Button>
        </Card>
      )}
      <Card className="p-2 px-3 border-amber-500/20 flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Kun ukategoriserte</Label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {txns.filter((t) => !t.category_id).length} stk
          </span>
          <Switch checked={onlyUncat} onCheckedChange={setOnlyUncat} />
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alle kategorier</SelectItem>
            <SelectItem value="__none__">Uten kategori</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Periode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alle perioder</SelectItem>
            {periods.map((p) => {
              const [y, m] = p.split("-");
              const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("nb-NO", {
                month: "long",
                year: "numeric",
              });
              return (
                <SelectItem key={p} value={p}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        {(() => {
          let list = txns;
          if (onlyUncat) list = list.filter((t) => !t.category_id);
          if (filterCat === "__none__") list = list.filter((t) => !t.category_id);
          else if (filterCat !== "__all__") list = list.filter((t) => t.category_id === filterCat);
          if (filterPeriod !== "__all__")
            list = list.filter((t) => (t.txn_date ?? "").slice(0, 7) === filterPeriod);
          return list.slice(0, 200);
        })().map((t) => {
          const cat = cats.find((c) => c.id === t.category_id);
          if (editingId === t.id) {
            return (
              <PosteringEditor
                key={t.id}
                txn={t}
                cats={cats}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  reload();
                }}
              />
            );
          }
          return (
            <Card
              key={t.id}
              className="p-3 flex items-center gap-2 cursor-pointer hover:border-amber-500/40"
              onClick={() => setEditingId(t.id)}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: cat?.color ?? "#94a3b8" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.description}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t.txn_date} · {cat?.name ?? "Uten kategori"}
                </p>
              </div>
              <span
                className={`text-sm tabular-nums font-semibold ${
                  Number(t.amount) < 0 ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {Number(t.amount) > 0 ? "+" : ""}
                {fmt(Number(t.amount))}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm("Slette?")) return;
                  await del({ data: { id: t.id } });
                  reload();
                }}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </Button>
            </Card>
          );
        })}
        {txns.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Ingen posteringer ennå. Importer kontoutskrift eller legg til manuelt.
          </p>
        )}
      </div>
    </div>
  );
}

function PosteringEditor({
  txn,
  cats,
  onCancel,
  onSaved,
}: {
  txn: OkonomiTransaction;
  cats: OkonomiCategory[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertOkonomiTransaction);
  const learn = useServerFn(learnMerchantRule);
  const [date, setDate] = useState(txn.txn_date);
  const [desc, setDesc] = useState(txn.description);
  const [amount, setAmount] = useState(String(txn.amount));
  const [catId, setCatId] = useState<string>(txn.category_id ?? "");
  const [note, setNote] = useState(txn.note ?? "");
  const [busy, setBusy] = useState(false);

  function flipSign() {
    const n = Number(amount);
    if (isFinite(n)) setAmount(String(-n));
  }

  async function save(overrideCatId?: string) {
    const useCat = overrideCatId !== undefined ? overrideCatId : catId;
    setBusy(true);
    try {
      await upsert({
        data: {
          id: txn.id,
          txn_date: date,
          description: desc,
          amount: Number(amount),
          category_id: useCat || null,
          note: note || null,
          source: txn.source,
          approved: txn.approved,
        },
      });
      // Husk kategori-valget for fremtidige importer
      if (useCat && (useCat !== txn.category_id || desc !== txn.description)) {
        try {
          await learn({ data: { description: desc, category_id: useCat } });
        } catch {}
      }
      toast.success("Lagret");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  async function onPickCategory(v: string) {
    setCatId(v);
    if (v !== (txn.category_id ?? "")) {
      await save(v);
    }
  }

  const isExpense = Number(amount) < 0;
  return (
    <Card className="p-3 space-y-2 border-amber-500/40 bg-amber-950/10">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Dato</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Beløp</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-[10px] shrink-0"
              onClick={flipSign}
              title="Bytt mellom inntekt/utgift"
            >
              {isExpense ? "→ Inntekt" : "→ Utgift"}
            </Button>
          </div>
        </div>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Beskrivelse
        </Label>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-8" />
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Kategori</Label>
        <Select value={catId} onValueChange={onPickCategory}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Velg kategori" />
          </SelectTrigger>
          <SelectContent>
            {cats.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.is_income ? " (inntekt)" : ""}
                {c.is_transfer ? " (overføring)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notat</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8" placeholder="Valgfritt" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy} className="flex-1">
          Avbryt
        </Button>
        <Button size="sm" onClick={() => save()} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Lagre"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------- Budsjett ----------------

const CAT_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#94a3b8",
];

function Budsjett({ cats, reload }: { cats: OkonomiCategory[]; reload: () => void }) {
  const upsert = useServerFn(upsertOkonomiCategory);
  const del = useServerFn(deleteOkonomiCategory);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState({
    name: "",
    color: CAT_COLORS[0],
    monthly_budget: "",
    is_income: false,
    is_transfer: false,
  });

  async function save(c: OkonomiCategory) {
    const v = draft[c.id];
    const monthly = v === "" ? null : Number(v);
    try {
      await upsert({
        data: {
          id: c.id,
          name: c.name,
          icon: c.icon,
          color: c.color,
          monthly_budget: monthly,
          yearly_budget: monthly !== null ? monthly * 12 : null,
          sort_order: c.sort_order,
          hidden: c.hidden,
          is_income: c.is_income,
          is_transfer: c.is_transfer,
        },
      });
      toast.success(`${c.name} oppdatert`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  async function createCat() {
    if (!newCat.name.trim()) {
      toast.error("Navn må fylles inn");
      return;
    }
    const monthly = newCat.monthly_budget ? Number(newCat.monthly_budget) : null;
    try {
      await upsert({
        data: {
          name: newCat.name.trim(),
          color: newCat.color,
          monthly_budget: monthly,
          yearly_budget: monthly !== null ? monthly * 12 : null,
          sort_order: 500,
          hidden: false,
          is_income: newCat.is_income,
          is_transfer: newCat.is_transfer,
        },
      });
      toast.success(`«${newCat.name}» opprettet`);
      setNewCat({ name: "", color: CAT_COLORS[0], monthly_budget: "", is_income: false, is_transfer: false });
      setAdding(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => setAdding((v) => !v)} variant="secondary" className="w-full">
        <Plus className="w-4 h-4 mr-1" /> Ny kategori
      </Button>
      {adding && (
        <Card className="p-3 space-y-2 border-amber-500/40">
          <Input
            placeholder="Navn (f.eks. Hobby, Strøm…)"
            value={newCat.name}
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="kr / mnd (valgfri)"
              value={newCat.monthly_budget}
              onChange={(e) => setNewCat({ ...newCat, monthly_budget: e.target.value })}
            />
            <Select
              value={newCat.is_income ? "income" : newCat.is_transfer ? "transfer" : "expense"}
              onValueChange={(v) =>
                setNewCat({
                  ...newCat,
                  is_income: v === "income",
                  is_transfer: v === "transfer",
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Utgift</SelectItem>
                <SelectItem value="income">Inntekt</SelectItem>
                <SelectItem value="transfer">Overføring</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Farge</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CAT_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setNewCat({ ...newCat, color: col })}
                  className={`w-6 h-6 rounded-full border-2 ${
                    newCat.color === col ? "border-amber-300 scale-110" : "border-transparent"
                  } transition-transform`}
                  style={{ background: col }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => setAdding(false)}>
              Avbryt
            </Button>
            <Button size="sm" className="flex-1" onClick={createCat}>
              Opprett
            </Button>
          </div>
        </Card>
      )}
      <p className="text-sm text-muted-foreground mb-2">
        Sett månedsbudsjett per kategori. Tomt = ingen grense. AI bruker disse navnene når den
        kategoriserer importerte rader.
      </p>
      {cats.map((c) => (
        <Card key={c.id} className="p-3 flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ background: c.color }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {c.name}
              {c.is_income && <span className="text-[10px] text-emerald-400 ml-1">(inntekt)</span>}
              {c.is_transfer && <span className="text-[10px] text-sky-400 ml-1">(overføring)</span>}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {c.monthly_budget ? `${fmt(Number(c.monthly_budget))} /mnd` : "— /mnd"}
            </p>
          </div>
          <Input
            type="number"
            placeholder="kr/mnd"
            className="w-28 h-8"
            defaultValue={c.monthly_budget ?? ""}
            onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })}
            onBlur={() => draft[c.id] !== undefined && save(c)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={async () => {
              if (!confirm(`Slette ${c.name}?`)) return;
              await del({ data: { id: c.id } });
              reload();
            }}
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </Button>
        </Card>
      ))}
    </div>
  );
}

// ---------------- Import ----------------

function ImportTab({ cats, reload }: { cats: OkonomiCategory[]; reload: () => void }) {
  const importFn = useServerFn(importOkonomiTransactions);
  const findDupes = useServerFn(findOkonomiDuplicates);
  const parseAi = useServerFn(parseStatementWithAI);
  const categorizeAi = useServerFn(categorizeTransactionsWithAI);
  const learn = useServerFn(learnMerchantRule);
  const STORAGE_KEY = "okonomi:import:preview:v1";
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [aiLog, setAiLog] = useState<string[]>([]);
  const [preview, setPreview] = useState<ParsedTxn[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.preview) ? parsed.preview : [];
    } catch {
      return [];
    }
  });
  const [source, setSource] = useState<"csv" | "pdf">(() => {
    if (typeof window === "undefined") return "csv";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.source === "pdf" ? "pdf" : "csv";
    } catch {
      return "csv";
    }
  });
  const csvRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  // Persistér preview lokalt slik at den ligger igjen ved navigasjon
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (preview.length === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ preview, source }),
        );
      }
    } catch {
      /* ignore quota */
    }
  }, [preview, source]);

  function pushLog(msg: string) {
    setAiLog((l) => [...l, `${new Date().toLocaleTimeString("nb-NO")} · ${msg}`]);
  }

  async function autoCategorize(rows: ParsedTxn[]): Promise<ParsedTxn[]> {
    const needIdx: number[] = [];
    rows.forEach((r, i) => {
      if (!r.category_id) needIdx.push(i);
    });
    if (needIdx.length === 0) return rows;
    setBusyMsg(`AI kategoriserer ${needIdx.length} rader mot ${cats.length} kategorier…`);
    pushLog(`AI kategoriserer ${needIdx.length} rader mot ${cats.length} kategorier`);
    try {
      const res = await categorizeAi({
        data: {
          rows: needIdx.map((i) => ({
            description: rows[i].description,
            amount: rows[i].amount,
          })),
        },
      });
      const out = [...rows];
      needIdx.forEach((rowIdx, i) => {
        const cid = res.category_ids[i];
        if (cid) out[rowIdx] = { ...out[rowIdx], category_id: cid };
      });
      pushLog(`AI svarte — ${out.filter((r, i) => needIdx.includes(i)).length} forsøkt kategorisert`);
      return out;
    } catch (e) {
      pushLog(`AI feilet: ${e instanceof Error ? e.message : "ukjent"}`);
      toast.error(`AI-kategorisering feilet: ${e instanceof Error ? e.message : ""}`);
      return rows;
    }
  }

  async function extractRowsFromXlsx(file: File): Promise<string[][]> {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("Tomt regneark");
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
    return aoa.map((row) => row.map((c) => (c == null ? "" : String(c))));
  }

  async function handleCsv(file: File) {
    setBusy(true);
    setSource("csv");
    setAiLog([]);
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
    const kind = isXlsx ? "Excel" : "CSV";
    pushLog(`Leser ${kind}-fil «${file.name}» (${Math.round(file.size / 1024)} kB)`);
    setBusyMsg(`Leser ${kind}…`);
    try {
      let grid: string[][];
      if (isXlsx) {
        grid = await extractRowsFromXlsx(file);
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        const sep = lines[0]?.includes(";") ? ";" : ",";
        grid = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
      }
      pushLog(`Fant ${grid.length} linjer i filen`);
      if (grid.length < 2) throw new Error(`Tom ${kind}`);
      // Finn header-rad (første rad som har dato/tekst/beløp)
      let headerIdx = 0;
      let idxDate = -1, idxDesc = -1, idxAmt = -1;
      for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const h = grid[i].map((c) => c.trim().toLowerCase().replace(/"/g, ""));
        const d = h.findIndex((c) => /dato|date/.test(c));
        const t = h.findIndex((c) => /tekst|beskriv|descr|tittel|melding|text/.test(c));
        const a = h.findIndex((c) => /beløp|belop|amount|sum/.test(c));
        if (d >= 0 && t >= 0 && a >= 0) {
          headerIdx = i; idxDate = d; idxDesc = t; idxAmt = a; break;
        }
      }
      if (idxDate < 0 || idxDesc < 0 || idxAmt < 0)
        throw new Error("Fant ikke dato/tekst/beløp-kolonner");
      const rows: ParsedTxn[] = [];
      let skipped = 0;
      for (let i = headerIdx + 1; i < grid.length; i++) {
        const cells = grid[i];
        const date = parseNorDate(cells[idxDate]);
        const desc = cells[idxDesc];
        const amt = parseNorNum(cells[idxAmt]);
        if (!date || !desc || !isFinite(amt)) {
          skipped++;
          continue;
        }
        rows.push({
          txn_date: date,
          description: desc,
          amount: amt,
          external_ref: `${isXlsx ? "xlsx" : "csv"}:${date}:${desc}:${amt}`,
        });
      }
      pushLog(`Tolket ${rows.length} gyldige posteringer (${skipped} hoppet over)`);
      const enriched = await autoCategorize(rows);
      setPreview(enriched);
      const cat = enriched.filter((r) => r.category_id).length;
      pushLog(`Klar — ${cat}/${enriched.length} har fått kategori`);
      toast.success(`${enriched.length} rader klare — ${cat} kategorisert`);
    } catch (e) {
      pushLog(`Feil: ${e instanceof Error ? e.message : "ukjent"}`);
      toast.error(e instanceof Error ? e.message : `${kind}-feil`);
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  async function handlePdfImage(file: File) {
    setBusy(true);
    setSource("pdf");
    setAiLog([]);
    pushLog(`Sender «${file.name}» (${Math.round(file.size / 1024)} kB) til AI`);
    setBusyMsg("AI leser kontoutskrift…");
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      pushLog("AI analyserer dokumentet — dette tar gjerne 10–40 sek");
      const res = await parseAi({
        data: { fileBase64: b64, mimeType: file.type || "application/pdf" },
      });
      pushLog(`AI fant ${res.rows.length} posteringer i utskriften`);
      const rows = res.rows.map((r) => ({
        ...r,
        external_ref: `ai:${r.txn_date}:${r.description}:${r.amount}`,
      }));
      const enriched = await autoCategorize(rows);
      setPreview(enriched);
      const cat = enriched.filter((r) => r.category_id).length;
      pushLog(`Klar — ${cat}/${enriched.length} har fått kategori`);
      toast.success(`AI fant ${enriched.length} posteringer — ${cat} kategorisert`);
    } catch (e) {
      pushLog(`Feil: ${e instanceof Error ? e.message : "ukjent"}`);
      toast.error(e instanceof Error ? e.message : "AI-feil");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  function updateRow(i: number, patch: Partial<ParsedTxn>) {
    setPreview((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    // Lær regelen straks brukeren velger en kategori — neste import bruker den
    if (patch.category_id) {
      const desc = preview[i]?.description;
      if (desc) {
        learn({ data: { description: desc, category_id: patch.category_id } }).catch(() => {});
      }
    }
  }
  function removeRow(i: number) {
    setPreview((p) => p.filter((_, idx) => idx !== i));
  }

  async function commitOne(i: number) {
    const r = preview[i];
    setBusy(true);
    try {
      const dupRes = await findDupes({
        data: {
          rows: [{ txn_date: r.txn_date, description: r.description, amount: r.amount, account: r.account ?? null }],
        },
      });
      if (dupRes.duplicates.length > 0) {
        const ok = window.confirm(
          `Mulig duplikat funnet:\n\n${r.txn_date} · ${r.description} · ${r.amount} kr${r.account ? " · " + r.account : ""}\n\nDenne posten finnes allerede med samme dato, tekst, konto og beløp. Vil du importere den likevel?`,
        );
        if (!ok) {
          toast.message("Hoppet over duplikat");
          removeRow(i);
          setBusy(false);
          return;
        }
      }
      const res = await importFn({
        data: {
          rows: [
            {
              txn_date: r.txn_date,
              description: r.description,
              amount: r.amount,
              account: r.account ?? null,
              external_ref: dupRes.duplicates.length > 0 ? null : r.external_ref ?? null,
              category_id: r.category_id ?? null,
            },
          ],
          source,
        },
      });
      if (res.inserted > 0) {
        toast.success("Postert");
        removeRow(i);
        reload();
      } else {
        toast.message("Allerede registrert");
        removeRow(i);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  async function commitAll() {
    if (preview.length === 0) return;
    setBusy(true);
    setBusyMsg(`Sjekker duplikater…`);
    try {
      const dupRes = await findDupes({
        data: {
          rows: preview.map((r) => ({
            txn_date: r.txn_date,
            description: r.description,
            amount: r.amount,
            account: r.account ?? null,
          })),
        },
      });
      const dupIdx = new Set(dupRes.duplicates.map((d) => d.index));
      let includeDupes = false;
      if (dupIdx.size > 0) {
        const sample = dupRes.duplicates
          .slice(0, 8)
          .map((d) => {
            const r = preview[d.index]!;
            return `• ${r.txn_date} · ${r.description} · ${r.amount} kr${r.account ? " · " + r.account : ""}`;
          })
          .join("\n");
        const more = dupRes.duplicates.length > 8 ? `\n…og ${dupRes.duplicates.length - 8} til` : "";
        includeDupes = window.confirm(
          `${dupIdx.size} mulige duplikater funnet (samme dato, tekst, konto og beløp finnes fra før):\n\n${sample}${more}\n\nVil du importere disse likevel?\n\nOK = importer alt inkl. duplikater\nAvbryt = importer kun de ${preview.length - dupIdx.size} unike`,
        );
      }
      const rowsToImport = preview
        .map((r, i) => ({ r, i }))
        .filter(({ i }) => includeDupes || !dupIdx.has(i))
        .map(({ r, i }) => ({
          txn_date: r.txn_date,
          description: r.description,
          amount: r.amount,
          account: r.account ?? null,
          // bypass external_ref-dedupe når brukeren bevisst godtar duplikat
          external_ref: dupIdx.has(i) ? null : r.external_ref ?? null,
          category_id: r.category_id ?? null,
        }));
      if (rowsToImport.length === 0) {
        toast.message("Ingen rader å importere");
        setBusy(false);
        setBusyMsg("");
        return;
      }
      setBusyMsg(`Importerer ${rowsToImport.length}…`);
      const res = await importFn({ data: { rows: rowsToImport, source } });
      toast.success(`Importert ${res.inserted} (${res.skipped} duplikater)`);
      setPreview([]);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  async function recategorize() {
    setBusy(true);
    try {
      const cleared = preview.map((r) => ({ ...r, category_id: null as string | null }));
      const enriched = await autoCategorize(cleared);
      setPreview(enriched);
      toast.success("Kategorisert på nytt");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  const uncategorized = preview.filter((r) => !r.category_id).length;

  // Auto-sjekk duplikater i bakgrunnen hver gang preview endres
  const [dupIdx, setDupIdx] = useState<Set<number>>(new Set());
  const [dupBusy, setDupBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (preview.length === 0) {
      setDupIdx(new Set());
      return;
    }
    setDupBusy(true);
    findDupes({
      data: {
        rows: preview.map((r) => ({
          txn_date: r.txn_date,
          description: r.description,
          amount: r.amount,
          account: r.account ?? null,
        })),
      },
    })
      .then((res) => {
        if (cancelled) return;
        setDupIdx(new Set(res.duplicates.map((d) => d.index)));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDupBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  function removeAllDuplicates() {
    if (dupIdx.size === 0) return;
    setPreview((p) => p.filter((_, i) => !dupIdx.has(i)));
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 border-amber-500/30 space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wider">CSV / Excel fra norsk bank</Label>
          <p className="text-[11px] text-muted-foreground mb-2">
            DNB, Sparebank1, Nordea m.fl. Forventer kolonner: dato, tekst, beløp. Støtter .csv, .xlsx og .xls.
          </p>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])}
          />
          <Button onClick={() => csvRef.current?.click()} disabled={busy} variant="secondary" className="w-full">
            <Upload className="w-4 h-4 mr-1" /> Velg CSV / Excel
          </Button>
        </div>
        <div className="border-t border-border/40 pt-3">
          <Label className="text-xs uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> PDF / bilde av kontoutskrift
          </Label>
          <p className="text-[11px] text-muted-foreground mb-2">
            AI leser ut posteringene og kategoriserer automatisk.
          </p>
          <input
            ref={pdfRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePdfImage(e.target.files[0])}
          />
          <Button onClick={() => pdfRef.current?.click()} disabled={busy} variant="secondary" className="w-full">
            <FileText className="w-4 h-4 mr-1" /> Velg PDF/bilde
          </Button>
        </div>
      </Card>

      {busy && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {busyMsg || "Jobber…"}
        </div>
      )}

      {aiLog.length > 0 && (
        <Card className="p-3 border-amber-500/20 bg-background/40">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[11px] uppercase tracking-wider text-amber-400/80">AI-logg</h4>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setAiLog([])}>
              Skjul
            </Button>
          </div>
          <ul className="space-y-0.5 text-[11px] font-mono text-muted-foreground max-h-40 overflow-auto">
            {aiLog.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Card>
      )}

      {preview.length > 0 && (
        <Card className="p-3 border-amber-500/30">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-amber-100">
                Forhåndsvisning ({preview.length})
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {uncategorized > 0 ? `${uncategorized} mangler kategori` : "Alle kategorisert ✓"}
                {" · "}
                {dupBusy
                  ? "sjekker duplikater…"
                  : dupIdx.size > 0
                    ? `${dupIdx.size} duplikat${dupIdx.size === 1 ? "" : "er"} oppdaget`
                    : "ingen duplikater"}
                {" · "}ligger her til du importerer eller sletter
              </p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant="ghost" onClick={recategorize} disabled={busy}>
                <Sparkles className="w-3 h-3 mr-1" /> AI på nytt
              </Button>
              {dupIdx.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-300 hover:text-amber-200"
                  onClick={removeAllDuplicates}
                  disabled={busy}
                  title="Fjern alle duplikater fra forhåndsvisningen"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Fjern duplikater ({dupIdx.size})
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={() => {
                  if (confirm(`Forkaste alle ${preview.length} radene?`)) setPreview([]);
                }}
                disabled={busy}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Forkast alle
              </Button>
              <Button size="sm" onClick={commitAll} disabled={busy}>
                Importer alle
              </Button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto space-y-1.5">
            {preview.map((r, i) => {
              const cat = cats.find((c) => c.id === r.category_id);
              const isDup = dupIdx.has(i);
              return (
                <div
                  key={i}
                  className={`text-xs border rounded p-2 space-y-1.5 ${
                    isDup
                      ? "border-red-500/60 bg-red-950/30"
                      : "border-border/40 bg-background/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: cat?.color ?? "#64748b" }}
                    />
                    <span className="flex-1 truncate font-medium">{r.description}</span>
                    {isDup && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 shrink-0">
                        Duplikat
                      </span>
                    )}
                    <span
                      className={`tabular-nums font-semibold ${r.amount < 0 ? "text-red-400" : "text-emerald-400"}`}
                    >
                      {r.amount > 0 ? "+" : ""}
                      {fmt(r.amount)}
                    </span>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <span className="text-[10px] text-muted-foreground w-16 shrink-0">
                      {r.txn_date}
                    </span>
                    <Select
                      value={r.category_id ?? ""}
                      onValueChange={(v) => updateRow(i, { category_id: v || null })}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Velg kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {cats.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-emerald-400 hover:text-emerald-300"
                      onClick={() => commitOne(i)}
                      disabled={busy}
                      title="Poster denne"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-400 hover:text-red-300"
                      onClick={() => removeRow(i)}
                      title="Fjern"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}


function parseNorDate(s: string): string | null {
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD.MM.YYYY
  const m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = "20" + y;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function parseNorNum(s: string): number {
  return Number(s.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
}
