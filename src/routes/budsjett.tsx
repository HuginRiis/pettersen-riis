import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, ArrowRight, Calendar, CheckCircle2, Loader2, PiggyBank, Plus, Trash2,
  TrendingDown, TrendingUp, Trophy, Upload, Wallet, Wand2, Users, Settings2,
  FileSpreadsheet, BarChart3, PieChart as PieIcon, Sparkles, RefreshCw,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import heroImg from "@/assets/got-budsjett.jpg";
import {
  ACCOUNT_KEYS, ACCOUNT_LABELS, applyRules, fmtNok, monthLabel, monthRange,
  toLocalISO, yearRange,
  type AccountsConfig, type BudCategory, type BudExpense, type BudRule,
} from "@/lib/budsjett-shared";
import {
  loadBudsjett, saveBudCategory, deleteBudCategory, setCategoryBudgets,
  insertBudExpenses, updateBudExpenses, deleteBudExpenses, upsertBudRule,
  saveAccountsConfig, extractBankStatement,
} from "@/lib/budsjett.functions";
import { BudAccountsTab } from "@/components/budsjett/BudAccountsTab";
import { BudFamilyCompare } from "@/components/budsjett/BudFamilyCompare";
import { BudBulkEditDialog } from "@/components/budsjett/BudBulkEditDialog";

export const Route = createFileRoute("/budsjett")({
  head: () => ({
    meta: [
      { title: "Regnskap og budsjett — husets pengekammer | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Importer kontoutskrifter med AI, følg budsjett per kategori, se kontoer og sammenlign forbruket med en typisk norsk familie.",
      },
      { property: "og:title", content: "Regnskap og budsjett | House Pettersen Riis" },
      {
        property: "og:description",
        content: "AI-import av kontoutskrift, budsjett per kategori, kontooversikt og familiesammenligning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BudsjettPage,
});

type TabKey = "oversikt" | "posteringer" | "import" | "budsjett" | "kontoer" | "familie";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "oversikt", label: "Oversikt", icon: Wallet },
  { key: "posteringer", label: "Posteringer", icon: FileSpreadsheet },
  { key: "import", label: "Import", icon: Upload },
  { key: "budsjett", label: "Budsjett", icon: Settings2 },
  { key: "kontoer", label: "Kontoer", icon: PiggyBank },
  { key: "familie", label: "Familie", icon: Users },
];

function BudsjettPage() {
  const [tab, setTab] = useState<TabKey>("oversikt");
  const [cats, setCats] = useState<BudCategory[]>([]);
  const [expenses, setExpenses] = useState<BudExpense[]>([]);
  const [rules, setRules] = useState<BudRule[]>([]);
  const [accounts, setAccounts] = useState<AccountsConfig>({
    monthly: { john: {}, hege: {}, utgift: {} },
    yearly: { john: {}, hege: {}, utgift: {} },
  });
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<"month" | "year">("month");
  const [refDate, setRefDate] = useState<Date>(new Date());

  const loadFn = useServerFn(loadBudsjett);

  const load = async () => {
    setLoading(true);
    try {
      const d = await loadFn();
      setCats(d.cats);
      setExpenses(d.expenses);
      setRules(d.rules);
      setAccounts(d.accounts);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke laste data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const range = useMemo(
    () => (period === "month" ? monthRange(refDate) : yearRange(refDate)),
    [period, refDate],
  );
  const prevRange = useMemo(() => {
    const d = new Date(refDate);
    if (period === "month") d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return period === "month" ? monthRange(d) : yearRange(d);
  }, [period, refDate]);

  const shiftPeriod = (dir: 1 | -1) => {
    const d = new Date(refDate);
    if (period === "month") d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    setRefDate(d);
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Pengekammeret"
        title="Regnskap og budsjett"
        subtitle="Importer kontoutskrifter med AI, styr budsjettet per kategori og se hvordan huset ligger an mot en typisk norsk familie."
        image={heroImg}
      />

      <div className="container mx-auto space-y-6 px-4 py-8">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </Button>
        </div>

        {tab === "oversikt" && (
          <Oversikt
            cats={cats}
            expenses={expenses}
            period={period}
            setPeriod={setPeriod}
            refDate={refDate}
            shiftPeriod={shiftPeriod}
            range={range}
            prevRange={prevRange}
            reload={load}
          />
        )}
        {tab === "posteringer" && (
          <Posteringer cats={cats} expenses={expenses} rules={rules} reload={load} />
        )}
        {tab === "import" && (
          <ImportPanel cats={cats} expenses={expenses} rules={rules} reload={load} />
        )}
        {tab === "budsjett" && (
          <BudsjettTab cats={cats} expenses={expenses} period={period} reload={load} />
        )}
        {tab === "kontoer" && (
          <BudAccountsTab
            cats={cats}
            expenses={expenses}
            accounts={accounts}
            onSaveAccounts={async (cfg) => {
              await saveAccountsConfig({ data: { cfg } });
              setAccounts(cfg);
            }}
          />
        )}
        {tab === "familie" && (
          <BudFamilyCompare cats={cats} expenses={expenses} year={refDate.getFullYear()} />
        )}
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ Oversikt */

function Oversikt({
  cats, expenses, period, setPeriod, refDate, shiftPeriod, range, prevRange, reload,
}: {
  cats: BudCategory[];
  expenses: BudExpense[];
  period: "month" | "year";
  setPeriod: (p: "month" | "year") => void;
  refDate: Date;
  shiftPeriod: (d: 1 | -1) => void;
  range: { start: string; end: string };
  prevRange: { start: string; end: string };
  reload: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");

  const inRange = useMemo(
    () =>
      expenses.filter(
        (e) => e.status === "approved" && e.occurred_on >= range.start && e.occurred_on < range.end,
      ),
    [expenses, range],
  );
  const inPrev = useMemo(
    () =>
      expenses.filter(
        (e) =>
          e.status === "approved" && e.occurred_on >= prevRange.start && e.occurred_on < prevRange.end,
      ),
    [expenses, prevRange],
  );
  const pending = useMemo(() => expenses.filter((e) => e.status === "pending"), [expenses]);

  const sum = (rows: BudExpense[], k: "expense" | "income") =>
    rows.filter((e) => e.kind === k).reduce((s, e) => s + Number(e.amount), 0);

  const totalSpent = sum(inRange, "expense");
  const totalIncome = sum(inRange, "income");
  const prevSpent = sum(inPrev, "expense");
  const prevIncome = sum(inPrev, "income");
  const prevNet = prevIncome - prevSpent;
  const spendDeltaPct = prevSpent > 0 ? ((totalSpent - prevSpent) / prevSpent) * 100 : 0;

  const totalBudget = useMemo(
    () =>
      cats
        .filter((c) => c.kind === "expense")
        .reduce(
          (s, c) => s + Number((period === "month" ? c.monthly_budget : c.yearly_budget) ?? 0),
          0,
        ),
    [cats, period],
  );

  const net = totalIncome - totalSpent;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
  const savingsTarget = Math.round(totalIncome * 0.2);
  const savingsSuggestion = Math.max(0, Math.min(savingsTarget, Math.round(net)));
  const carryover = Math.max(0, Math.round(prevNet));

  const daysInfo = useMemo(() => {
    const now = new Date();
    if (period === "month") {
      const same =
        refDate.getFullYear() === now.getFullYear() && refDate.getMonth() === now.getMonth();
      const total = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
      return { elapsed: same ? now.getDate() : total, total, current: same };
    }
    const same = refDate.getFullYear() === now.getFullYear();
    const total = 365;
    const start = new Date(refDate.getFullYear(), 0, 1).getTime();
    const elapsed = same ? Math.max(1, Math.ceil((now.getTime() - start) / 86400000)) : total;
    return { elapsed, total, current: same };
  }, [period, refDate]);

  const avgPerDay = daysInfo.elapsed > 0 ? totalSpent / daysInfo.elapsed : 0;
  const projection = daysInfo.current ? avgPerDay * daysInfo.total : totalSpent;

  const kindRows = useMemo(() => {
    const m = new Map<string | null, number>();
    inRange.filter((e) => e.kind === kind).forEach((e) => {
      m.set(e.category_id, (m.get(e.category_id) ?? 0) + Number(e.amount));
    });
    return Array.from(m.entries())
      .map(([catId, value]) => {
        const c = cats.find((x) => x.id === catId);
        return {
          id: catId ?? "none",
          name: c?.name ?? "Ingen kategori",
          color: c?.color ?? "#94a3b8",
          budget:
            c && kind === "expense"
              ? Number((period === "month" ? c.monthly_budget : c.yearly_budget) ?? 0)
              : 0,
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [inRange, cats, kind, period]);

  const approveAll = async () => {
    const ids = pending.map((e) => e.id);
    if (!ids.length) return;
    await updateBudExpenses({ data: { ids, patch: { status: "approved" } } });
    toast.success(`Postet ${ids.length} posteringer`);
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => shiftPeriod(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[170px] text-center text-lg font-bold text-primary">
            {period === "month" ? monthLabel(refDate) : refDate.getFullYear()}
          </div>
          <Button size="icon" variant="outline" onClick={() => shiftPeriod(1)}>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={period === "month" ? "default" : "outline"} onClick={() => setPeriod("month")}>
            Måned
          </Button>
          <Button size="sm" variant={period === "year" ? "default" : "outline"} onClick={() => setPeriod("year")}>
            År
          </Button>
          <Button size="sm" variant={kind === "expense" ? "default" : "outline"} onClick={() => setKind("expense")}>
            Utgift
          </Button>
          <Button size="sm" variant={kind === "income" ? "default" : "outline"} onClick={() => setKind("income")}>
            Inntekt
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChartType((c) => (c === "bar" ? "pie" : "bar"))}>
            {chartType === "bar" ? <PieIcon size={14} /> : <BarChart3 size={14} />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Brukt" value={fmtNok(totalSpent)} tone="text-destructive" />
        <Kpi label="Inntekt" value={fmtNok(totalIncome)} tone="text-emerald-400" />
        <Kpi label="Budsjett" value={fmtNok(totalBudget)} tone="text-primary" />
        <Kpi
          label="Igjen"
          value={fmtNok(totalBudget - totalSpent)}
          tone={totalBudget - totalSpent < 0 ? "text-destructive" : "text-accent"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Netto"
          value={`${net >= 0 ? "+" : ""}${fmtNok(net)}`}
          tone={net >= 0 ? "text-emerald-400" : "text-destructive"}
          icon={net >= 0 ? TrendingUp : TrendingDown}
        />
        <Kpi
          label="Sparerate"
          value={totalIncome > 0 ? `${savingsRate.toFixed(0)} %` : "—"}
          tone={savingsRate >= 0 ? "text-emerald-400" : "text-destructive"}
          icon={PiggyBank}
        />
        <Kpi label="Snitt/dag" value={fmtNok(avgPerDay)} tone="" icon={Calendar} />
        <Kpi
          label={`Estimat ${period === "month" ? "mnd" : "år"}`}
          value={fmtNok(projection)}
          tone={totalBudget > 0 && projection > totalBudget ? "text-destructive" : ""}
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1 rounded-xl border border-border bg-card/50 p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary">
            <PiggyBank size={14} /> Forslag sparing
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-400">{fmtNok(savingsSuggestion)}</p>
          <p className="text-xs leading-snug text-muted-foreground">
            {totalIncome <= 0
              ? "Registrer inntekt for å få et spareforslag."
              : net <= 0
                ? `Overskuddet er negativt – prøv å kutte ${fmtNok(Math.abs(net))}.`
                : `Sett av ${fmtNok(savingsSuggestion)} til sparing denne perioden.`}
          </p>
        </div>
        <div className="space-y-1 rounded-xl border border-border bg-card/50 p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary">
            <ArrowRight size={14} /> Overført fra forrige {period === "month" ? "mnd" : "år"}
          </p>
          <p className={`text-2xl font-bold tabular-nums ${carryover > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
            {fmtNok(carryover)}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {prevNet >= 0
              ? `Overskudd forrige periode (${fmtNok(prevIncome)} − ${fmtNok(prevSpent)}).`
              : `Forrige periode endte ${fmtNok(prevNet)}. Ingenting overført.`}
          </p>
        </div>
        <div className="space-y-1 rounded-xl border border-border bg-card/50 p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary">
            {spendDeltaPct <= 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />} Mot forrige{" "}
            {period === "month" ? "mnd" : "år"}
          </p>
          <p className={`text-2xl font-bold tabular-nums ${spendDeltaPct <= 0 ? "text-emerald-400" : "text-destructive"}`}>
            {prevSpent > 0 ? `${spendDeltaPct >= 0 ? "+" : ""}${spendDeltaPct.toFixed(0)} %` : "—"}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {prevSpent > 0
              ? `Brukt ${fmtNok(totalSpent)} nå mot ${fmtNok(prevSpent)} sist.`
              : "Mangler data fra forrige periode."}
          </p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 p-4">
          <p className="text-sm">
            <b>{pending.length}</b> posteringer venter på å bli postert.
          </p>
          <Button size="sm" onClick={approveAll}>
            <CheckCircle2 size={14} className="mr-1" /> Poster alle
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card/50 p-4">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">
          {kind === "expense" ? "Utgifter" : "Inntekter"} per kategori
        </h3>
        {kindRows.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Ingen data i perioden.</p>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <BarChart data={kindRows.slice(0, 14)}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RTooltip formatter={(v: any) => fmtNok(Number(v))} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {kindRows.slice(0, 14).map((r) => (
                      <Cell key={r.id} fill={r.color} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie data={kindRows.slice(0, 12)} dataKey="value" nameKey="name" outerRadius={110} label={false}>
                    {kindRows.slice(0, 12).map((r) => (
                      <Cell key={r.id} fill={r.color} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <RTooltip formatter={(v: any) => fmtNok(Number(v))} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-4">
        <h3 className="mb-2 flex items-center gap-1 text-sm font-bold uppercase tracking-widest text-primary">
          <Trophy size={15} /> Topp 10
        </h3>
        <ol className="space-y-1.5">
          {kindRows.slice(0, 10).map((r, i) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-4 text-right text-muted-foreground">{i + 1}.</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                <span className="truncate">{r.name}</span>
              </span>
              <span className="tabular-nums">
                {fmtNok(r.value)}
                {r.budget > 0 && (
                  <span className={`ml-2 text-xs ${r.value > r.budget ? "text-destructive" : "text-emerald-400"}`}>
                    {r.value > r.budget ? "over" : "innenfor"} budsjett
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Kpi({
  label, value, sub, tone, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <p className="flex items-center gap-1 text-xs uppercase text-muted-foreground">
        {Icon ? <Icon size={12} /> : null} {label}
      </p>
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- Posteringer */

function Posteringer({
  cats, expenses, rules, reload,
}: {
  cats: BudCategory[];
  expenses: BudExpense[];
  rules: BudRule[];
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [sort, setSort] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc">("date-desc");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    occurred_on: toLocalISO(new Date()),
    amount: "",
    kind: "expense" as "expense" | "income",
    store: "",
    note: "",
    category_id: "",
    account: "utgift",
  });

  const rows = useMemo(() => {
    let list = [...expenses];
    if (catFilter === "none") list = list.filter((e) => !e.category_id);
    else if (catFilter !== "all") list = list.filter((e) => e.category_id === catFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (e) => (e.store ?? "").toLowerCase().includes(s) || (e.note ?? "").toLowerCase().includes(s),
      );
    }
    list.sort((a, b) => {
      if (sort === "date-desc") return a.occurred_on < b.occurred_on ? 1 : -1;
      if (sort === "date-asc") return a.occurred_on > b.occurred_on ? 1 : -1;
      if (sort === "amount-desc") return Number(b.amount) - Number(a.amount);
      return Number(a.amount) - Number(b.amount);
    });
    return list.slice(0, 400);
  }, [expenses, search, catFilter, sort]);

  const setCategory = async (e: BudExpense, categoryId: string | null) => {
    await updateBudExpenses({ data: { ids: [e.id], patch: { category_id: categoryId } } });
    if (categoryId) await upsertBudRule({ data: { desc: e.store ?? e.note, categoryId } });
    toast.success("Kategori oppdatert");
    await reload();
  };

  const addExpense = async () => {
    const amount = Number(form.amount.replace(/\s/g, "").replace(",", "."));
    if (!amount || !form.occurred_on) {
      toast.error("Fyll inn dato og beløp");
      return;
    }
    setSaving(true);
    try {
      await insertBudExpenses({
        data: {
          rows: [
            {
              occurred_on: form.occurred_on,
              amount: Math.abs(amount),
              kind: form.kind,
              store: form.store || null,
              note: form.note || null,
              category_id: form.category_id || applyRules(form.store, rules),
              account: form.account,
              source: "manual",
              status: "approved",
            },
          ],
        },
      });
      toast.success("Postering lagt til");
      setShowNew(false);
      setForm({ ...form, amount: "", store: "", note: "" });
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke lagre");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await deleteBudExpenses({ data: { ids: [id] } });
    toast.success("Slettet");
    await reload();
  };

  const pendingIds = useMemo(
    () => expenses.filter((e) => e.status === "pending").map((e) => e.id),
    [expenses],
  );

  const postIds = async (ids: string[]) => {
    if (!ids.length) return;
    await updateBudExpenses({ data: { ids, patch: { status: "approved" } } });
    toast.success(`Postet ${ids.length} ${ids.length === 1 ? "postering" : "posteringer"}`);
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card/50 p-4">
        <div className="min-w-[180px] flex-1">
          <Label className="text-xs text-muted-foreground">Søk</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Butikk eller notat…" />
        </div>
        <select
          className="h-10 rounded-md border border-border bg-background px-2 text-sm"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
        >
          <option value="all">Alle kategorier</option>
          <option value="none">Uten kategori</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-border bg-background px-2 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
        >
          <option value="date-desc">Nyeste først</option>
          <option value="date-asc">Eldste først</option>
          <option value="amount-desc">Høyest beløp</option>
          <option value="amount-asc">Lavest beløp</option>
        </select>
        <Button size="sm" onClick={() => setShowNew((v) => !v)}>
          <Plus size={14} className="mr-1" /> Ny postering
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
          <Wand2 size={14} className="mr-1" /> Bulk-rediger
        </Button>
        <Button
          size="sm"
          variant={pendingIds.length ? "default" : "outline"}
          disabled={!pendingIds.length}
          onClick={() => postIds(pendingIds)}
        >
          <CheckCircle2 size={14} className="mr-1" /> Poster ventende ({pendingIds.length})
        </Button>
      </div>

      {showNew && (
        <div className="grid gap-3 rounded-xl border border-border bg-card/50 p-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Dato</Label>
            <Input type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Beløp</Label>
            <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as any })}
            >
              <option value="expense">Utgift</option>
              <option value="income">Inntekt</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Butikk/mottaker</Label>
            <Input value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Kategori</Label>
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            >
              <option value="">Automatisk</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Konto</Label>
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            >
              {ACCOUNT_KEYS.map((a) => (
                <option key={a} value={a}>{ACCOUNT_LABELS[a]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <Button onClick={addExpense} disabled={saving}>
              {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
              Lagre postering
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Dato</th>
              <th className="p-2 text-left">Beskrivelse</th>
              <th className="p-2 text-left">Kategori</th>
              <th className="p-2 text-left">Konto</th>
              <th className="p-2 text-right">Beløp</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-border/60">
                <td className="whitespace-nowrap p-2 text-muted-foreground">{e.occurred_on}</td>
                <td className="max-w-[240px] truncate p-2">
                  {e.store ?? e.note ?? "—"}
                  {e.status === "pending" && (
                    <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">venter</span>
                  )}
                </td>
                <td className="p-2">
                  <select
                    className="rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                    value={e.category_id ?? ""}
                    onChange={(ev) => setCategory(e, ev.target.value || null)}
                  >
                    <option value="">Uten kategori</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2 text-xs text-muted-foreground">{e.account ?? "—"}</td>
                <td className={`p-2 text-right tabular-nums ${e.kind === "income" ? "text-emerald-400" : ""}`}>
                  {e.kind === "income" ? "+" : "−"}
                  {fmtNok(Number(e.amount))}
                </td>
                <td className="p-2 text-right">
                  <div className="flex justify-end gap-1">
                    {e.status === "pending" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Poster"
                        onClick={() => postIds([e.id])}
                      >
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => remove(e.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Ingen posteringer å vise.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BudBulkEditDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        expenses={expenses}
        cats={cats}
        onApply={async (changes) => {
          for (const ch of changes) {
            const patch: Record<string, unknown> = {};
            if (ch.categoryId) patch.category_id = ch.categoryId;
            if (ch.account) patch.account = ch.account;
            await updateBudExpenses({ data: { ids: ch.ids, patch: patch as any } });
            if (ch.categoryId) await upsertBudRule({ data: { desc: ch.label, categoryId: ch.categoryId } });
          }
          toast.success("Posteringer oppdatert");
          await reload();
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- Import */

function ImportPanel({
  cats, expenses, rules, reload,
}: {
  cats: BudCategory[];
  expenses: BudExpense[];
  rules: BudRule[];
  reload: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setLog([`Leser ${file.name} med AI…`]);
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      const categories = cats.map((c) => c.name);
      let payload: { csvText?: string; fileDataUrl?: string; fileName?: string; categories: string[] };
      if (isCsv) {
        const csvText = await file.text();
        payload = { csvText, categories };
      } else if (isPdf) {
        setLog((l) => [...l, "Henter ut tekst fra PDF-en…"]);
        const { extractPdfText } = await import("@/lib/pdf-text");
        const text = await extractPdfText(file);
        if (text.trim().length < 40) {
          throw new Error(
            "Fant ingen tekst i PDF-en (den er trolig skannet). Last opp CSV eller et bilde i stedet.",
          );
        }
        setLog((l) => [...l, `Fant ${text.split("\n").length} linjer — sender til AI i mindre biter…`]);
        payload = { csvText: text, fileName: file.name, categories };
      } else {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        payload = { fileDataUrl: dataUrl, fileName: file.name, categories };
      }

      const res = await extractBankStatement({ data: payload });
      const txs = res.transactions ?? [];
      if (!txs.length) {
        toast.warning("Fant ingen transaksjoner");
        return;
      }
      const account =
        res.account === "john" || res.account === "hege" ? res.account : "utgift";
      const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
      const annet = cats.find((c) => c.name === "Annet")?.id ?? null;

      const candidates = txs
        .map((t) => ({
          occurred_on: t.date,
          category_id:
            applyRules(t.description, rules) ??
            catByName.get(String(t.category || "").toLowerCase()) ??
            annet,
          amount: Math.abs(Number(t.amount) || 0),
          kind: (t.type === "income" ? "income" : "expense") as "income" | "expense",
          store: t.description,
          note: t.note ?? null,
          account,
          source: "bank-statement",
          status: "pending" as const,
        }))
        .filter((r) => r.amount > 0 && r.occurred_on);

      // Duplikatkontroll: dato + beskrivelse + beløp
      const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
      const key = (d: string, a: number, s: string) => `${d}|${Math.round(a * 100)}|${norm(s)}`;
      const remaining = new Map<string, number>();
      for (const e of expenses) {
        const k = key(e.occurred_on, Number(e.amount), e.store ?? "");
        remaining.set(k, (remaining.get(k) ?? 0) + 1);
      }
      const fresh = candidates.filter((r) => {
        const k = key(r.occurred_on, r.amount, r.store);
        const n = remaining.get(k) ?? 0;
        if (n > 0) {
          remaining.set(k, n - 1);
          return false;
        }
        return true;
      });
      const skipped = candidates.length - fresh.length;

      if (!fresh.length) {
        toast.info(`Alle ${candidates.length} transaksjoner finnes fra før`);
        setLog((l) => [...l, `${candidates.length} duplikater — ingen importert`]);
        return;
      }

      const { inserted } = await insertBudExpenses({ data: { rows: fresh } });
      toast.success(`${inserted} posteringer importert${skipped ? `, ${skipped} duplikat` : ""}`);
      setLog((l) => [
        ...l,
        `AI leste ${res.stats?.inputRows ?? txs.length} linjer, hentet ut ${txs.length}`,
        `${inserted} importert som «venter», ${skipped} duplikater hoppet over`,
      ]);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Import feilet");
      setLog((l) => [...l, `Feil: ${e?.message ?? "ukjent"}`]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
        <Sparkles className="mx-auto mb-2 text-primary" />
        <h3 className="text-lg font-bold">Importer kontoutskrift</h3>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
          Last opp CSV fra nettbanken, eller en PDF/bilde av kontoutskriften. AI leser ut alle
          transaksjoner, foreslår kategori og hopper over duplikater. Importerte rader legges inn som
          «venter» til du poster dem.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button className="mt-4" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Upload size={15} className="mr-1" />}
          Velg fil
        </Button>
      </div>

      {expenses.some((e) => e.status === "pending") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
          <p className="text-sm">
            <span className="font-bold text-primary">
              {expenses.filter((e) => e.status === "pending").length}
            </span>{" "}
            importerte posteringer venter på å bli postert i regnskapet.
          </p>
          <Button
            onClick={async () => {
              const ids = expenses.filter((e) => e.status === "pending").map((e) => e.id);
              setBusy(true);
              try {
                await updateBudExpenses({ data: { ids, patch: { status: "approved" } } });
                toast.success(`Postet ${ids.length} posteringer`);
                await reload();
              } catch (err: any) {
                toast.error(err?.message ?? "Kunne ikke postere");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            {busy ? <Loader2 size={15} className="mr-1 animate-spin" /> : <CheckCircle2 size={15} className="mr-1" />}
            Poster i regnskapet
          </Button>
        </div>
      )}

      {log.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-4 text-sm">
          {log.map((l, i) => (
            <p key={i} className="text-muted-foreground">
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Budsjett */

function BudsjettTab({
  cats, expenses, period, reload,
}: {
  cats: BudCategory[];
  expenses: BudExpense[];
  period: "month" | "year";
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"expense" | "income">("expense");

  const spentByCat = useMemo(() => {
    const now = new Date();
    const start = period === "month" ? monthRange(now).start : yearRange(now).start;
    const end = period === "month" ? monthRange(now).end : yearRange(now).end;
    const m = new Map<string, number>();
    for (const e of expenses) {
      if (e.status !== "approved" || e.kind !== "expense" || !e.category_id) continue;
      if (e.occurred_on < start || e.occurred_on >= end) continue;
      m.set(e.category_id, (m.get(e.category_id) ?? 0) + Number(e.amount));
    }
    return m;
  }, [expenses, period]);

  const saveOne = async (c: BudCategory) => {
    const raw = draft[c.id];
    if (raw === undefined) return;
    const monthly = Math.round(Number(raw.replace(/\s/g, "").replace(",", ".")) || 0);
    await saveBudCategory({
      data: {
        id: c.id,
        name: c.name,
        kind: c.kind,
        color: c.color,
        monthly_budget: monthly,
        yearly_budget: monthly * 12,
        position: c.position,
      },
    });
    setDraft((p) => {
      const n = { ...p };
      delete n[c.id];
      return n;
    });
    toast.success(`Budsjett lagret for ${c.name}`);
    await reload();
  };

  const generate = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const start = toLocalISO(new Date(now.getFullYear(), now.getMonth() - months, 1));
      const end = toLocalISO(new Date(now.getFullYear(), now.getMonth(), 1));
      const sums = new Map<string, number>();
      expenses
        .filter(
          (e) =>
            e.status === "approved" &&
            e.kind === "expense" &&
            e.category_id &&
            e.occurred_on >= start &&
            e.occurred_on < end,
        )
        .forEach((e) => sums.set(e.category_id!, (sums.get(e.category_id!) ?? 0) + Number(e.amount)));
      const updates = cats
        .filter((c) => c.kind === "expense")
        .map((c) => {
          const avg = Math.round((sums.get(c.id) ?? 0) / months);
          return { id: c.id, monthly_budget: avg, yearly_budget: avg * 12 };
        })
        .filter((u) => u.monthly_budget > 0);
      if (!updates.length) {
        toast.warning(`Ingen utgiftsdata siste ${months} mnd`);
        return;
      }
      await setCategoryBudgets({ data: { updates } });
      toast.success(`Budsjett oppdatert for ${updates.length} kategorier`);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke generere budsjett");
    } finally {
      setBusy(false);
    }
  };

  const addCategory = async () => {
    if (!newName.trim()) return;
    await saveBudCategory({
      data: { name: newName, kind: newKind, position: cats.length + 1 },
    });
    setNewName("");
    toast.success("Kategori lagt til");
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card/50 p-4">
        <div>
          <Label className="text-xs text-muted-foreground">Snitt fra siste (mnd)</Label>
          <Input
            type="number"
            min={1}
            max={24}
            className="w-24"
            value={months}
            onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 3))}
          />
        </div>
        <Button onClick={generate} disabled={busy}>
          {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
          Lag budsjett fra historikk
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Kategori</th>
              <th className="p-2 text-right">Brukt {period === "month" ? "denne mnd" : "i år"}</th>
              <th className="p-2 text-right">Budsjett/mnd</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => {
              const spent = spentByCat.get(c.id) ?? 0;
              const budget = Number(
                (period === "month" ? c.monthly_budget : c.yearly_budget) ?? 0,
              );
              const over = budget > 0 && spent > budget;
              return (
                <tr key={c.id} className="border-t border-border/60">
                  <td className="p-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      {c.name}
                      <span className="text-xs text-muted-foreground">
                        {c.kind === "income" ? "(inntekt)" : ""}
                      </span>
                    </span>
                  </td>
                  <td className={`p-2 text-right tabular-nums ${over ? "text-destructive" : ""}`}>
                    {fmtNok(spent)}
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      className="ml-auto w-28 text-right"
                      inputMode="decimal"
                      value={draft[c.id] ?? String(c.monthly_budget ?? "")}
                      onChange={(e) => setDraft((p) => ({ ...p, [c.id]: e.target.value }))}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => saveOne(c)} disabled={draft[c.id] === undefined}>
                        Lagre
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          await deleteBudCategory({ data: { id: c.id } });
                          toast.success("Kategori slettet");
                          await reload();
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card/50 p-4">
        <div>
          <Label className="text-xs text-muted-foreground">Ny kategori</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Navn" />
        </div>
        <select
          className="h-10 rounded-md border border-border bg-background px-2 text-sm"
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as any)}
        >
          <option value="expense">Utgift</option>
          <option value="income">Inntekt</option>
        </select>
        <Button onClick={addCategory}>
          <Plus size={14} className="mr-1" /> Legg til
        </Button>
      </div>
    </div>
  );
}
