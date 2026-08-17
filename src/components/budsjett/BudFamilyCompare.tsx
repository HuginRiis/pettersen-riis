import { useEffect, useMemo, useState } from "react";
import { Users, TrendingDown, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_HOUSEHOLD,
  loadHousehold,
  saveHousehold,
  referenceForPeriod,
  type HouseholdConfig,
} from "@/lib/budsjett-family";
import { fmtNok, type BudCategory, type BudExpense } from "@/lib/budsjett-shared";

export function BudFamilyCompare({
  expenses,
  cats,
  year,
}: {
  expenses: BudExpense[];
  cats: BudCategory[];
  year: number;
}) {
  const [hh, setHh] = useState<HouseholdConfig>(DEFAULT_HOUSEHOLD);

  useEffect(() => {
    setHh(loadHousehold());
  }, []);

  const update = (patch: Partial<HouseholdConfig>) => {
    const next = { ...hh, ...patch };
    setHh(next);
    saveHousehold(next);
  };

  const now = new Date();
  const monthsFromJan = now.getFullYear() === year ? now.getMonth() + 1 : 12;

  const rows = useMemo(() => {
    const sums = new Map<string, number>();
    for (const e of expenses) {
      if (e.status !== "approved" || e.kind !== "expense") continue;
      if (new Date(e.occurred_on).getFullYear() !== year) continue;
      const name = cats.find((c) => c.id === e.category_id)?.name ?? "Annet";
      sums.set(name, (sums.get(name) ?? 0) + Number(e.amount));
    }
    return Array.from(sums.entries())
      .map(([name, actual]) => {
        const reference = referenceForPeriod(name, hh, monthsFromJan);
        const diff = reference == null ? null : actual - reference;
        return { name, actual, reference, diff };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [expenses, cats, hh, year, monthsFromJan]);

  const totals = rows.reduce(
    (acc, r) => ({
      actual: acc.actual + r.actual,
      reference: acc.reference + (r.reference ?? 0),
    }),
    { actual: 0, reference: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
          <Users size={15} /> Husholdning
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Voksne</Label>
            <Input
              type="number"
              min={1}
              value={hh.adults}
              onChange={(e) => update({ adults: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Barn under 18</Label>
            <Input
              type="number"
              min={0}
              value={hh.childrenU18}
              onChange={(e) => update({ childrenU18: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Barn over 18</Label>
            <Input
              type="number"
              min={0}
              value={hh.childrenO18}
              onChange={(e) => update({ childrenO18: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Referansetall er basert på SSBs forbruksundersøkelse, skalert etter husholdningens
          størrelse og periode ({monthsFromJan} mnd av {year}).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs uppercase text-muted-foreground">Dere har brukt</p>
          <p className="text-xl font-bold text-destructive">{fmtNok(totals.actual)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs uppercase text-muted-foreground">Typisk familie</p>
          <p className="text-xl font-bold text-primary">{fmtNok(totals.reference)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs uppercase text-muted-foreground">Differanse</p>
          <p
            className={`text-xl font-bold ${
              totals.actual - totals.reference <= 0 ? "text-emerald-400" : "text-destructive"
            }`}
          >
            {totals.actual - totals.reference >= 0 ? "+" : ""}
            {fmtNok(totals.actual - totals.reference)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Kategori</th>
              <th className="p-2 text-right">Dere</th>
              <th className="p-2 text-right">Typisk</th>
              <th className="p-2 text-right">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-border/60">
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right tabular-nums">{fmtNok(r.actual)}</td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">
                  {r.reference == null ? "—" : fmtNok(r.reference)}
                </td>
                <td
                  className={`p-2 text-right tabular-nums ${
                    r.diff == null ? "" : r.diff <= 0 ? "text-emerald-400" : "text-destructive"
                  }`}
                >
                  {r.diff == null ? (
                    "—"
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {r.diff <= 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                      {r.diff >= 0 ? "+" : ""}
                      {fmtNok(r.diff)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                  Ingen posteringer for {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
