// Detaljvisning for én kategori i «Topp 10» på budsjett-siden.
import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtNok, ACCOUNT_LABELS, resolveAccount, type BudExpense } from "@/lib/budsjett-shared";

export type TopRow = {
  id: string;
  name: string;
  color: string;
  value: number;
  budget: number;
};

export function BudCategoryDetail({
  row,
  onClose,
  items,
  prevValue,
  totalKind,
  kind,
  periodLabel,
  days,
}: {
  row: TopRow | null;
  onClose: () => void;
  items: BudExpense[];
  prevValue: number;
  totalKind: number;
  kind: "expense" | "income";
  periodLabel: string;
  days: number;
}) {
  const stats = useMemo(() => {
    const amounts = items.map((e) => Number(e.amount));
    const count = amounts.length;
    const sum = amounts.reduce((s, v) => s + v, 0);
    const share = totalKind > 0 ? (sum / totalKind) * 100 : 0;
    const avg = count ? sum / count : 0;
    const max = count ? Math.max(...amounts) : 0;
    const perDay = days > 0 ? sum / days : 0;
    const deltaPct = prevValue > 0 ? ((sum - prevValue) / prevValue) * 100 : null;
    const budgetPct = row && row.budget > 0 ? (sum / row.budget) * 100 : null;

    const byStore = new Map<string, { sum: number; count: number }>();
    for (const e of items) {
      const k = (e.store ?? e.note ?? "Ukjent").trim() || "Ukjent";
      const cur = byStore.get(k) ?? { sum: 0, count: 0 };
      cur.sum += Number(e.amount);
      cur.count += 1;
      byStore.set(k, cur);
    }
    const stores = Array.from(byStore.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 8);

    const byAccount = new Map<string, number>();
    for (const e of items) {
      const a = resolveAccount(e.account, e.created_by);
      byAccount.set(a, (byAccount.get(a) ?? 0) + Number(e.amount));
    }

    return { count, sum, share, avg, max, perDay, deltaPct, budgetPct, stores, byAccount };
  }, [items, totalKind, prevValue, days, row]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(b.amount) - Number(a.amount)),
    [items],
  );

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[92vh] overflow-hidden p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: row?.color }} />
            <span className="min-w-0 truncate">{row?.name}</span>
            <span className="text-xs font-normal text-muted-foreground sm:text-sm">· {periodLabel}</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(92vh-5rem)] pr-2 sm:pr-3">

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Totalt" value={fmtNok(stats.sum)} />
              <Stat
                label={kind === "expense" ? "Andel av utgifter" : "Andel av inntekter"}
                value={`${stats.share.toFixed(1)} %`}
              />
              <Stat label="Antall poster" value={String(stats.count)} />
              <Stat label="Snitt pr. post" value={fmtNok(stats.avg)} />
              <Stat label="Snitt pr. dag" value={fmtNok(stats.perDay)} />
              <Stat label="Største post" value={fmtNok(stats.max)} />
              <Stat
                label="Mot forrige periode"
                value={stats.deltaPct == null ? "—" : `${stats.deltaPct >= 0 ? "+" : ""}${stats.deltaPct.toFixed(0)} %`}
                tone={stats.deltaPct == null ? "" : stats.deltaPct <= 0 ? "text-emerald-400" : "text-destructive"}
              />
              <Stat
                label="Budsjett"
                value={row && row.budget > 0 ? fmtNok(row.budget) : "Ikke satt"}
                sub={
                  stats.budgetPct == null
                    ? undefined
                    : `${stats.budgetPct.toFixed(0)} % brukt · ${fmtNok((row?.budget ?? 0) - stats.sum)} igjen`
                }
                tone={stats.budgetPct != null && stats.budgetPct > 100 ? "text-destructive" : "text-emerald-400"}
              />
            </div>

            {stats.budgetPct != null && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${stats.budgetPct > 100 ? "bg-destructive" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, stats.budgetPct)}%` }}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card/50 p-3">
                <p className="mb-2 text-xs uppercase tracking-widest text-primary">Største steder</p>
                <ul className="space-y-1 text-sm">
                  {stats.stores.map((s) => (
                    <li key={s.name} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {s.name} <span className="text-xs text-muted-foreground">({s.count})</span>
                      </span>
                      <span className="tabular-nums">
                        {fmtNok(s.sum)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {stats.sum > 0 ? `${((s.sum / stats.sum) * 100).toFixed(0)} %` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                  {!stats.stores.length && (
                    <li className="italic text-muted-foreground">Ingen data.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-border bg-card/50 p-3">
                <p className="mb-2 text-xs uppercase tracking-widest text-primary">Fordelt på konto</p>
                <ul className="space-y-1 text-sm">
                  {Array.from(stats.byAccount.entries()).map(([acc, v]) => (
                    <li key={acc} className="flex items-center justify-between gap-2">
                      <span>{ACCOUNT_LABELS[acc as keyof typeof ACCOUNT_LABELS] ?? acc}</span>
                      <span className="tabular-nums">
                        {fmtNok(v)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {stats.sum > 0 ? `${((v / stats.sum) * 100).toFixed(0)} %` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                  {!stats.byAccount.size && <li className="italic text-muted-foreground">Ingen data.</li>}
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/50 p-3">
              <p className="mb-2 text-xs uppercase tracking-widest text-primary">
                Alle poster ({sorted.length})
              </p>
              <div className="space-y-1">
                {sorted.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b border-border/50 py-1 text-sm last:border-0"
                  >
                    <span className="w-20 shrink-0 tabular-nums text-xs text-muted-foreground">
                      {e.occurred_on}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {e.store ?? e.note ?? "—"}
                      {e.store && e.note ? (
                        <span className="ml-1 text-xs text-muted-foreground">{e.note}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ACCOUNT_LABELS[resolveAccount(e.account, e.created_by)]}
                    </span>
                    <span className="shrink-0 tabular-nums">{fmtNok(Number(e.amount))}</span>
                    <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                      {stats.sum > 0 ? `${((Number(e.amount) / stats.sum) * 100).toFixed(1)}%` : ""}
                    </span>
                  </div>
                ))}
                {!sorted.length && <p className="italic text-muted-foreground">Ingen poster.</p>}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-2.5">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
