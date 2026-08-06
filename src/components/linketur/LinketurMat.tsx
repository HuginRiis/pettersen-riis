import { useMemo, useState } from "react";
import { useSharedLinketurState } from "@/hooks/use-linketur-state";
import { LINKETUR_CREW } from "@/lib/linketur-crew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UtensilsCrossed,
  ShoppingCart,
  Wallet,
  Plus,
  Trash2,
  Check,
  Loader2,
  Coins,
} from "lucide-react";

type Meal = {
  id: string;
  day: string;
  meal: string;
  dish: string;
  shopper: string;
  cost: string;
};

type Payment = {
  id: string;
  person: string;
  to: string;
  amount: string;
  paid: boolean;
};

type Rent = {
  amount: string;
  payer: string;
  paid: Record<string, boolean>;
};

type FoodState = {
  meals?: Meal[];
  payments?: Payment[];
  rent?: Rent;
};


const DEFAULT_DAYS = ["Fredag", "Lørdag", "Søndag"];
const MEALS = ["Frokost", "Lunsj", "Middag", "Kveldsmat", "Snacks"];
const PEOPLE = LINKETUR_CREW.map((c) => c.name);

const uid = () => Math.random().toString(36).slice(2, 10);

function num(v: string): number {
  const n = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const nok = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(n));

export function LinketurMat() {
  const [state, setState, sync] = useSharedLinketurState<FoodState>("food", {});
  const [newDay, setNewDay] = useState("");

  const meals = state.meals ?? [];
  const payments = state.payments ?? [];

  const days = useMemo(() => {
    const set = new Set<string>(DEFAULT_DAYS);
    meals.forEach((m) => set.add(m.day));
    return Array.from(set);
  }, [meals]);

  const total = meals.reduce((s, m) => s + num(m.cost), 0);
  const perPerson = PEOPLE.length > 0 ? total / PEOPLE.length : 0;

  const spentBy = useMemo(() => {
    const map: Record<string, number> = {};
    meals.forEach((m) => {
      if (!m.shopper) return;
      map[m.shopper] = (map[m.shopper] ?? 0) + num(m.cost);
    });
    return map;
  }, [meals]);

  /** Den som har lagt ut mest på mat — det er hen de andre skal betale til. */
  const foodCreditor = useMemo(
    () => Object.entries(spentBy).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
    [spentBy],
  );

  const rent: Rent = state.rent ?? { amount: "", payer: PEOPLE[0] ?? "", paid: {} };
  const rentTotal = num(rent.amount);
  const rentPerPerson = PEOPLE.length > 0 ? rentTotal / PEOPLE.length : 0;
  const rentOutstanding = PEOPLE.filter(
    (p) => p !== rent.payer && !rent.paid[p],
  ).length * rentPerPerson;

  const setRent = (patch: Partial<Rent>) =>
    setState((prev) => ({
      ...prev,
      rent: { ...(prev.rent ?? { amount: "", payer: PEOPLE[0] ?? "", paid: {} }), ...patch },
    }));

  const toggleRentPaid = (person: string) =>
    setState((prev) => {
      const cur = prev.rent ?? { amount: "", payer: PEOPLE[0] ?? "", paid: {} };
      return {
        ...prev,
        rent: { ...cur, paid: { ...cur.paid, [person]: !cur.paid[person] } },
      };
    });


  const addMeal = (day: string) =>
    setState((prev) => ({
      ...prev,
      meals: [
        ...(prev.meals ?? []),
        { id: uid(), day, meal: "Middag", dish: "", shopper: "", cost: "" },
      ],
    }));

  const updateMeal = (id: string, patch: Partial<Meal>) =>
    setState((prev) => ({
      ...prev,
      meals: (prev.meals ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));

  const removeMeal = (id: string) =>
    setState((prev) => ({ ...prev, meals: (prev.meals ?? []).filter((m) => m.id !== id) }));

  const addPayment = () =>
    setState((prev) => ({
      ...prev,
      payments: [
        ...(prev.payments ?? []),
        { id: uid(), person: PEOPLE[0] ?? "", to: PEOPLE[0] ?? "", amount: "", paid: false },
      ],
    }));

  const updatePayment = (id: string, patch: Partial<Payment>) =>
    setState((prev) => ({
      ...prev,
      payments: (prev.payments ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const removePayment = (id: string) =>
    setState((prev) => ({
      ...prev,
      payments: (prev.payments ?? []).filter((p) => p.id !== id),
    }));

  const fillFromSplit = () =>
    setState((prev) => {
      const spent: Record<string, number> = {};
      (prev.meals ?? []).forEach((m) => {
        if (m.shopper) spent[m.shopper] = (spent[m.shopper] ?? 0) + num(m.cost);
      });
      const tot = (prev.meals ?? []).reduce((s, m) => s + num(m.cost), 0);
      const share = PEOPLE.length > 0 ? tot / PEOPLE.length : 0;
      const existing = prev.payments ?? [];
      // Den som har lagt ut mest får pengene
      const creditor =
        Object.entries(spent).sort((a, b) => b[1] - a[1])[0]?.[0] ?? PEOPLE[0] ?? "";
      const rows: Payment[] = PEOPLE.filter((p) => p !== creditor).map((p) => {
        const owe = Math.max(0, share - (spent[p] ?? 0));
        const prevRow = existing.find((e) => e.person === p && e.to === creditor);
        return {
          id: prevRow?.id ?? uid(),
          person: p,
          to: creditor,
          amount: String(Math.round(owe)),
          paid: prevRow?.paid ?? false,
        };
      });
      return { ...prev, payments: rows };
    });

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatBox
          icon={<ShoppingCart size={14} />}
          label="Totalt handlet"
          value={`${nok(total)} kr`}
        />
        <StatBox
          icon={<Coins size={14} />}
          label={`Pr. person (${PEOPLE.length})`}
          value={`${nok(perPerson)} kr`}
        />
        <StatBox
          icon={<Wallet size={14} />}
          label="Utestående"
          value={`${nok(
            payments.filter((p) => !p.paid).reduce((s, p) => s + num(p.amount), 0),
          )} kr`}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl text-foreground inline-flex items-center gap-2">
            <UtensilsCrossed size={18} className="text-primary" /> Matplan
          </h2>
          <div className="flex items-center gap-2">
            <Input
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
              placeholder="Ny dag…"
              className="h-9 w-36"
              aria-label="Ny dag"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const d = newDay.trim();
                if (!d) return;
                addMeal(d);
                setNewDay("");
              }}
              className="gap-1.5"
            >
              <Plus size={14} /> Legg til dag
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {days.map((day) => {
            const rows = meals.filter((m) => m.day === day);
            const daySum = rows.reduce((s, m) => s + num(m.cost), 0);
            return (
              <div key={day} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base text-foreground">{day}</h3>
                  <span className="text-xs text-muted-foreground">{nok(daySum)} kr</span>
                </div>

                <div className="space-y-2">
                  {rows.map((m) => (
                    <div
                      key={m.id}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-background/50 p-2 sm:grid-cols-[7rem_1fr]"
                    >
                      <select
                        value={m.meal}
                        onChange={(e) => updateMeal(m.id, { meal: e.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                        aria-label="Måltid"
                      >
                        {MEALS.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={m.dish}
                        onChange={(e) => updateMeal(m.id, { dish: e.target.value })}
                        placeholder="Hva skal vi ha?"
                        className="h-9 text-sm"
                        aria-label="Rett"
                      />
                      <select
                        value={m.shopper}
                        onChange={(e) => updateMeal(m.id, { shopper: e.target.value })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                        aria-label="Hvem handler"
                      >
                        <option value="">Hvem handler?</option>
                        {PEOPLE.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <Input
                          value={m.cost}
                          onChange={(e) => updateMeal(m.id, { cost: e.target.value })}
                          placeholder="kr"
                          inputMode="decimal"
                          className="h-9 text-sm"
                          aria-label="Beløp"
                        />
                        <button
                          onClick={() => removeMeal(m.id)}
                          className="rounded-md border border-border p-2 text-muted-foreground hover:text-destructive"
                          aria-label="Slett rad"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <p className="text-xs text-muted-foreground">Ingen måltider lagt inn ennå.</p>
                  )}
                </div>

                <Button size="sm" variant="ghost" onClick={() => addMeal(day)} className="gap-1.5">
                  <Plus size={14} /> Legg til måltid
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl text-foreground inline-flex items-center gap-2">
            <Wallet size={18} className="text-primary" /> Oppgjør
          </h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={fillFromSplit} className="gap-1.5">
              <Coins size={14} /> Regn ut spleis
            </Button>
            <Button size="sm" variant="ghost" onClick={addPayment} className="gap-1.5">
              <Plus size={14} /> Ny rad
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          {payments.map((p) => (
            <div
              key={p.id}
              className={`grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_1fr_8rem_auto_auto] sm:items-center ${
                p.paid ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/70"
              }`}
            >
              <select
                value={p.person}
                onChange={(e) => updatePayment(p.id, { person: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Hvem betaler"
              >
                {PEOPLE.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              <select
                value={p.to}
                onChange={(e) => updatePayment(p.id, { to: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                aria-label="Til hvem"
              >
                {PEOPLE.map((x) => (
                  <option key={x} value={x}>
                    til {x}
                  </option>
                ))}
              </select>
              <Input
                value={p.amount}
                onChange={(e) => updatePayment(p.id, { amount: e.target.value })}
                placeholder="kr"
                inputMode="decimal"
                className="h-9 text-sm"
                aria-label="Beløp"
              />
              <button
                onClick={() => updatePayment(p.id, { paid: !p.paid })}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  p.paid
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                aria-pressed={p.paid}
              >
                <Check size={13} /> {p.paid ? "Betalt" : "Marker betalt"}
              </button>
              <button
                onClick={() => removePayment(p.id)}
                className="justify-self-end rounded-md border border-border p-2 text-muted-foreground hover:text-destructive"
                aria-label="Slett rad"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {payments.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ingen oppgjør ennå — trykk «Regn ut spleis» for å fordele utgiftene.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PEOPLE.map((p) => (
            <div key={p} className="rounded-lg border border-border bg-card p-3">
              <div className="text-sm text-foreground">{p}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Handlet for {nok(spentBy[p] ?? 0)} kr · andel {nok(perPerson)} kr
              </div>
              <div
                className={`mt-1 text-xs ${
                  (spentBy[p] ?? 0) - perPerson >= 0 ? "text-emerald-400" : "text-orange-400"
                }`}
              >
                {(spentBy[p] ?? 0) - perPerson >= 0
                  ? `Har til gode ${nok((spentBy[p] ?? 0) - perPerson)} kr`
                  : `Skylder ${nok(perPerson - (spentBy[p] ?? 0))} kr`}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="text-xs text-muted-foreground">
        {sync.saving ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Lagrer til huset…
          </span>
        ) : sync.error ? (
          <span className="text-destructive">{sync.error}</span>
        ) : sync.loaded ? (
          "Alt lagret og delt med gjengen."
        ) : (
          "Henter…"
        )}
      </div>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-xl text-foreground">{value}</div>
    </div>
  );
}
