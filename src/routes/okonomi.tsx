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
import { Loader2, Upload, Plus, Trash2, Coins, FileText, Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";
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
  importOkonomiTransactions,
  parseStatementWithAI,
  categorizeTransactionsWithAI,
  getOkonomiSettings,
  type OkonomiCategory,
  type OkonomiTransaction,
  type OkonomiSettings,
  type ParsedTxn,
} from "@/server/okonomi.functions";

export const Route = createFileRoute("/okonomi")({
  head: () => ({
    meta: [
      { title: "Iron Bank of Braavos | House Pettersen Riis" },
      { name: "description", content: "Budsjett og forbruk — familieøkonomi i Iron Bank-stil." },
    ],
  }),
  component: OkonomiPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n) + " kr";

function OkonomiPage() {
  const listCats = useServerFn(listOkonomiCategories);
  const listTxns = useServerFn(listOkonomiTransactions);
  const getSettings = useServerFn(getOkonomiSettings);
  const [cats, setCats] = useState<OkonomiCategory[]>([]);
  const [txns, setTxns] = useState<OkonomiTransaction[]>([]);
  const [settings, setSettings] = useState<OkonomiSettings | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      // Hent 2 hele år tilbake — gir oss filter-mulighet uten ekstra rundtur
      const now = new Date();
      const from = `${now.getFullYear() - 1}-01-01`;
      const [c, t, s] = await Promise.all([
        listCats(),
        listTxns({ data: { from, limit: 2000 } }),
        getSettings(),
      ]);
      setCats(c);
      setTxns(t);
      setSettings(s);
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
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
              <TabsTrigger value="posteringer">Posteringer</TabsTrigger>
              <TabsTrigger value="budsjett">Budsjett</TabsTrigger>
              <TabsTrigger value="import">Importer</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="mt-4">
              <Oversikt cats={cats} txns={txns} settings={settings} />
            </TabsContent>
            <TabsContent value="posteringer" className="mt-4">
              <Posteringer cats={cats} txns={txns} reload={reload} />
            </TabsContent>
            <TabsContent value="budsjett" className="mt-4">
              <Budsjett cats={cats} reload={reload} />
            </TabsContent>
            <TabsContent value="import" className="mt-4">
              <ImportTab cats={cats} reload={reload} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageShell>
  );
}

// ---------------- Oversikt ----------------

function Oversikt({
  cats,
  txns,
  settings,
}: {
  cats: OkonomiCategory[];
  txns: OkonomiTransaction[];
  settings: OkonomiSettings | null;
}) {
  const today = new Date();
  const currentY = today.getFullYear();
  const currentM = today.getMonth() + 1;

  const [year, setYear] = useState<number>(currentY);
  const [month, setMonth] = useState<number | "all">(currentM);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>([currentY]);
    for (const t of txns) {
      const y = Number(t.txn_date.slice(0, 4));
      if (isFinite(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [txns, currentY]);

  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const isExpense = (t: OkonomiTransaction) => {
    const c = t.category_id ? catMap.get(t.category_id) : undefined;
    if (c?.is_transfer || c?.is_income) return false;
    return Number(t.amount) < 0;
  };
  const isIncome = (t: OkonomiTransaction) => {
    const c = t.category_id ? catMap.get(t.category_id) : undefined;
    if (c?.is_income) return true;
    return Number(t.amount) > 0 && !c?.is_transfer;
  };

  // Filtrer på valgt år/mnd
  const ymPrefix = month === "all" ? `${year}-` : `${year}-${String(month).padStart(2, "0")}`;
  const filtered = txns.filter((t) => t.txn_date.startsWith(ymPrefix));
  const isCurrentPeriod =
    year === currentY && (month === "all" || month === currentM);

  const brukt = filtered.filter(isExpense).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const inntekt = filtered.filter(isIncome).reduce((s, t) => s + Number(t.amount), 0);
  const monthsCount = month === "all" ? 12 : 1;
  const budsjett = cats.reduce((s, c) => s + (Number(c.monthly_budget) || 0), 0) * monthsCount;
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
  const igjenPrDag = daysUntilPayday > 0 ? igjen / daysUntilPayday : 0;

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

  // 6 mnd trend (tilbake fra valgt mnd, eller siste 6 mnd hvis "alle")
  const anchor =
    month === "all"
      ? new Date(year, 11, 1)
      : new Date(year, month - 1, 1);
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("nb-NO", { month: "short" }),
    });
  }
  const trend = months.map((m) => {
    const rows = txns.filter((t) => t.txn_date.startsWith(m.key));
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

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Brukt" value={fmt(brukt)} tone="warn" />
        <Stat label="Inntekt" value={fmt(inntekt)} tone="ok" />
        <Stat label="Budsjett" value={fmt(budsjett)} />
        <Stat
          label={netto >= 0 ? "Overskudd" : "Underskudd"}
          value={fmt(Math.abs(netto))}
          tone={netto >= 0 ? "ok" : "warn"}
        />
        <Stat label={`Snitt pr dag (${elapsedDays} d)`} value={fmt(snittPrDag)} />
        {daysUntilPayday > 0 ? (
          <Stat
            label={`Igjen pr dag (${daysUntilPayday} d til lønn)`}
            value={fmt(igjenPrDag)}
            tone={igjenPrDag <= 0 ? "warn" : "ok"}
          />
        ) : (
          <Stat label="Igjen" value={fmt(igjen)} />
        )}
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
            {top5.map((d, i) => (
              <li key={d.id} className="flex items-center gap-2">
                <span className="w-5 text-amber-400/70 tabular-nums text-xs">#{i + 1}</span>
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: d.color }}
                />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="tabular-nums text-amber-100">{fmt(d.sum)}</span>
              </li>
            ))}
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
        {catData.filter((d) => d.bench > 0).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ingen snitt-tall ennå. Gå til Innstillinger → Husholdningens hvelv og trykk «Generer
            nye snitt-tall».
          </p>
        ) : (
          <ul className="space-y-2">
            {catData
              .filter((d) => d.bench > 0)
              .map((d) => {
                const diff = d.sum - d.bench;
                const pct = d.bench > 0 ? (diff / d.bench) * 100 : 0;
                const over = diff > 0;
                return (
                  <li key={d.id} className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="truncate">{d.name}</span>
                      </span>
                      <span className="tabular-nums text-xs flex items-center gap-2">
                        <span className="text-amber-100">{fmt(d.sum)}</span>
                        <span className="text-muted-foreground">/ snitt {fmt(d.bench)}</span>
                        <span
                          className={`font-semibold ${over ? "text-red-400" : "text-emerald-400"}`}
                        >
                          {over ? "+" : ""}
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      <Card className="p-4 border-amber-500/30">
        <h3 className="text-sm tracking-[0.25em] uppercase text-amber-400 mb-3">
          Inntekt vs utgift — siste 6 mnd
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#3f2d10" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="label" stroke="#a78b4a" fontSize={11} />
              <YAxis stroke="#a78b4a" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "#1a1208", border: "1px solid #92651a" }}
                formatter={(v: any) => fmt(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Inntekt" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Utgift" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
                  <Pie data={catData} dataKey="sum" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {catData.map((d) => (
                      <Cell key={d.id} fill={d.color} stroke="#1a1208" />
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
              {catData.slice(0, 8).map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="tabular-nums text-amber-100">{fmt(d.sum)}</span>
                </li>
              ))}
            </ul>
          </div>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const c = tone === "warn" ? "text-red-400" : tone === "ok" ? "text-emerald-400" : "text-amber-200";
  return (
    <Card className="p-3 border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-transparent">
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
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    txn_date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    category_id: "",
  });

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
      <div className="space-y-1.5">
        {txns.slice(0, 100).map((t) => {
          const cat = cats.find((c) => c.id === t.category_id);
          return (
            <Card key={t.id} className="p-3 flex items-center gap-2">
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
                onClick={async () => {
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

// ---------------- Budsjett ----------------

function Budsjett({ cats, reload }: { cats: OkonomiCategory[]; reload: () => void }) {
  const upsert = useServerFn(upsertOkonomiCategory);
  const del = useServerFn(deleteOkonomiCategory);
  const [draft, setDraft] = useState<Record<string, string>>({});

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

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-2">
        Sett månedsbudsjett per kategori. Tomt = ingen grense.
      </p>
      {cats.map((c) => (
        <Card key={c.id} className="p-3 flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ background: c.color }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{c.name}</p>
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
  const parseAi = useServerFn(parseStatementWithAI);
  const categorizeAi = useServerFn(categorizeTransactionsWithAI);
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
      return out;
    } catch (e) {
      toast.error(`AI-kategorisering feilet: ${e instanceof Error ? e.message : ""}`);
      return rows;
    }
  }

  async function handleCsv(file: File) {
    setBusy(true);
    setSource("csv");
    setBusyMsg("Leser CSV…");
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) throw new Error("Tomt CSV");
      const sep = lines[0].includes(";") ? ";" : ",";
      const header = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const idxDate = header.findIndex((h) => /dato|date/.test(h));
      const idxDesc = header.findIndex((h) => /tekst|beskriv|descr|tittel|melding|text/.test(h));
      const idxAmt = header.findIndex((h) => /beløp|belop|amount|sum/.test(h));
      if (idxDate < 0 || idxDesc < 0 || idxAmt < 0)
        throw new Error("Fant ikke dato/tekst/beløp-kolonner");
      const rows: ParsedTxn[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
        const date = parseNorDate(cells[idxDate]);
        const desc = cells[idxDesc];
        const amt = parseNorNum(cells[idxAmt]);
        if (!date || !desc || !isFinite(amt)) continue;
        rows.push({
          txn_date: date,
          description: desc,
          amount: amt,
          external_ref: `csv:${date}:${desc}:${amt}`,
        });
      }
      const enriched = await autoCategorize(rows);
      setPreview(enriched);
      const cat = enriched.filter((r) => r.category_id).length;
      toast.success(`${enriched.length} rader klare — ${cat} kategorisert`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "CSV-feil");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  async function handlePdfImage(file: File) {
    setBusy(true);
    setSource("pdf");
    setBusyMsg("AI leser kontoutskrift…");
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await parseAi({
        data: { fileBase64: b64, mimeType: file.type || "application/pdf" },
      });
      const rows = res.rows.map((r) => ({
        ...r,
        external_ref: `ai:${r.txn_date}:${r.description}:${r.amount}`,
      }));
      const enriched = await autoCategorize(rows);
      setPreview(enriched);
      const cat = enriched.filter((r) => r.category_id).length;
      toast.success(`AI fant ${enriched.length} posteringer — ${cat} kategorisert`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI-feil");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  function updateRow(i: number, patch: Partial<ParsedTxn>) {
    setPreview((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setPreview((p) => p.filter((_, idx) => idx !== i));
  }

  async function commitOne(i: number) {
    const r = preview[i];
    setBusy(true);
    try {
      const res = await importFn({
        data: {
          rows: [
            {
              txn_date: r.txn_date,
              description: r.description,
              amount: r.amount,
              account: r.account ?? null,
              external_ref: r.external_ref ?? null,
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
    setBusyMsg(`Importerer ${preview.length}…`);
    try {
      const res = await importFn({
        data: {
          rows: preview.map((r) => ({
            txn_date: r.txn_date,
            description: r.description,
            amount: r.amount,
            account: r.account ?? null,
            external_ref: r.external_ref ?? null,
            category_id: r.category_id ?? null,
          })),
          source,
        },
      });
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

  return (
    <div className="space-y-3">
      <Card className="p-4 border-amber-500/30 space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wider">CSV fra norsk bank</Label>
          <p className="text-[11px] text-muted-foreground mb-2">
            DNB, Sparebank1, Nordea m.fl. Forventer kolonner: dato, tekst, beløp.
          </p>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])}
          />
          <Button onClick={() => csvRef.current?.click()} disabled={busy} variant="secondary" className="w-full">
            <Upload className="w-4 h-4 mr-1" /> Velg CSV
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

      {preview.length > 0 && (
        <Card className="p-3 border-amber-500/30">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-amber-100">
                Forhåndsvisning ({preview.length})
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {uncategorized > 0 ? `${uncategorized} mangler kategori` : "Alle kategorisert ✓"}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={recategorize} disabled={busy}>
                <Sparkles className="w-3 h-3 mr-1" /> AI på nytt
              </Button>
              <Button size="sm" onClick={commitAll} disabled={busy}>
                Importer alle
              </Button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto space-y-1.5">
            {preview.map((r, i) => {
              const cat = cats.find((c) => c.id === r.category_id);
              return (
                <div
                  key={i}
                  className="text-xs border border-border/40 rounded p-2 space-y-1.5 bg-background/40"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: cat?.color ?? "#64748b" }}
                    />
                    <span className="flex-1 truncate font-medium">{r.description}</span>
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
