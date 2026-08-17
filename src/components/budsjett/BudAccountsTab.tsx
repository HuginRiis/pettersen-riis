import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowDownCircle, ArrowUpCircle, PiggyBank, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_COLORS,
  ACCOUNT_KEYS,
  ACCOUNT_LABELS,
  fmtNok,
  getStartBalance,
  monthKey,
  monthLabel,
  monthRange,
  resolveAccount,
  yearKey,
  yearRange,
  type AccountKey,
  type AccountsConfig,
  type BudCategory,
  type BudExpense,
} from "@/lib/budsjett-shared";

export function BudAccountsTab({
  expenses,
  cats,
  accounts,
  onSaveAccounts,
}: {
  expenses: BudExpense[];
  cats: BudCategory[];
  accounts: AccountsConfig;
  onSaveAccounts: (cfg: AccountsConfig) => Promise<void>;
}) {
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const range = useMemo(
    () => (period === "month" ? monthRange(refDate) : yearRange(refDate)),
    [period, refDate],
  );
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);

  const inRange = useMemo(
    () =>
      expenses.filter(
        (e) => e.status === "approved" && e.occurred_on >= range.start && e.occurred_on < range.end,
      ),
    [expenses, range],
  );

  const perAccount = useMemo(() => {
    const map: Record<AccountKey, { income: number; expense: number; rows: BudExpense[] }> = {
      john: { income: 0, expense: 0, rows: [] },
      hege: { income: 0, expense: 0, rows: [] },
      utgift: { income: 0, expense: 0, rows: [] },
    };
    for (const e of inRange) {
      const acc = resolveAccount(e.account, e.created_by);
      map[acc].rows.push(e);
      if (e.kind === "income") map[acc].income += Number(e.amount);
      else map[acc].expense += Number(e.amount);
    }
    return map;
  }, [inRange]);

  const shift = (delta: number) => {
    const d = new Date(refDate);
    if (period === "month") d.setMonth(d.getMonth() + delta);
    else d.setFullYear(d.getFullYear() + delta);
    setRefDate(d);
  };

  const pKey = period === "month" ? monthKey(refDate) : yearKey(refDate);

  const saveStart = async () => {
    setSaving(true);
    try {
      const cfg: AccountsConfig = {
        monthly: { ...accounts.monthly },
        yearly: { ...accounts.yearly },
      };
      for (const acc of ACCOUNT_KEYS) {
        const raw = draft[acc];
        if (raw === undefined) continue;
        const num = Number(raw.replace(/\s/g, "").replace(",", ".")) || 0;
        if (period === "month") cfg.monthly[acc] = { ...cfg.monthly[acc], [pKey]: num };
        else cfg.yearly[acc] = { ...cfg.yearly[acc], [pKey]: num };
      }
      await onSaveAccounts(cfg);
      setDraft({});
      toast.success("Startsaldo lagret");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke lagre");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/50 p-4">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => shift(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[170px] text-center text-lg font-bold text-primary">
            {period === "month" ? monthLabel(refDate) : refDate.getFullYear()}
          </div>
          <Button size="icon" variant="outline" onClick={() => shift(1)}>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={period === "month" ? "default" : "outline"} onClick={() => setPeriod("month")}>
            Måned
          </Button>
          <Button size="sm" variant={period === "year" ? "default" : "outline"} onClick={() => setPeriod("year")}>
            År
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {ACCOUNT_KEYS.map((acc) => {
          const a = perAccount[acc];
          const start = getStartBalance(accounts, acc, period, refDate);
          const saldo = start + a.income - a.expense;
          return (
            <div key={acc} className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: ACCOUNT_COLORS[acc] }} />
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary">
                  {ACCOUNT_LABELS[acc]}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-muted/30 p-2">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowDownCircle className="h-3 w-3" /> Inn
                  </p>
                  <p className="font-bold text-emerald-400">{fmtNok(a.income)}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowUpCircle className="h-3 w-3" /> Ut
                  </p>
                  <p className="font-bold text-destructive">{fmtNok(a.expense)}</p>
                </div>
              </div>
              <div className="rounded-lg bg-muted/30 p-2">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <PiggyBank className="h-3 w-3" /> Saldo (start {fmtNok(start)})
                </p>
                <p className={`text-lg font-bold ${saldo < 0 ? "text-destructive" : "text-primary"}`}>
                  {fmtNok(saldo)}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Startsaldo for perioden</label>
                <Input
                  inputMode="decimal"
                  value={draft[acc] ?? String(start || "")}
                  onChange={(e) => setDraft((p) => ({ ...p, [acc]: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                {a.rows.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {r.store ?? catName.get(r.category_id ?? "") ?? "Postering"}
                    </span>
                    <span className={r.kind === "income" ? "text-emerald-400" : ""}>
                      {r.kind === "income" ? "+" : "−"}
                      {fmtNok(Number(r.amount))}
                    </span>
                  </div>
                ))}
                {a.rows.length > 5 && (
                  <p className="text-xs italic text-muted-foreground">+{a.rows.length - 5} flere</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={saveStart} disabled={saving || Object.keys(draft).length === 0}>
        <Save size={14} className="mr-1" /> Lagre startsaldo
      </Button>
    </div>
  );
}
