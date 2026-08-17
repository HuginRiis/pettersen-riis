import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload, Loader2, Search, Sparkles, Trash2, RefreshCw, Receipt as ReceiptIcon,
  Wallet, TrendingDown, TrendingUp, Repeat, AlertTriangle, Settings2, Plus, Link2,
  ChevronDown, ChevronRight, FileSpreadsheet, PiggyBank,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { toast } from "sonner";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import heroImg from "@/assets/got-regnskap.jpg";
import { parseBankCsv, readCsvFile, type ParsedTx } from "@/lib/regnskap-csv";
import {
  listFinCategories, listFinTransactions, updateFinTransaction, deleteFinTransaction,
  importFinTransactions, categorizeFinTransactions, getFinStats, getFinRecurring,
  listFinImports, listFinReceipts, autoMatchReceipts, createFinCategory,
  type FinCategory, type FinTx, type FinReceipt,
} from "@/lib/regnskap.functions";

export const Route = createFileRoute("/regnskap")({
  head: () => ({
    meta: [
      { title: "Regnskap — Husets pengekammer | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Importer banktransaksjoner, få dem kategorisert av AI, koble kvitteringer og se hvor pengene faktisk går.",
      },
      { property: "og:title", content: "Regnskap | House Pettersen Riis" },
      { property: "og:description", content: "Bankimport, AI-kategorisering, kvitteringer og full utgiftsoversikt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegnskapPage,
});

const nok = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? `kr ${Math.round(n).toLocaleString("nb-NO")}`
    : "—";
const nok2 = (n: number) => `kr ${n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const COLORS = ["#d4af37", "#22c55e", "#38bdf8", "#f472b6", "#fb923c", "#a78bfa", "#eab308", "#ef4444",
  "#34d399", "#60a5fa", "#c084fc", "#94a3b8", "#10b981", "#f59e0b", "#22d3ee"];

type TabKey =
  | "oversikt" | "transaksjoner" | "import" | "kvitteringer" | "veiviser" | "faste" | "innstillinger";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "oversikt", label: "Oversikt", icon: Wallet },
  { key: "transaksjoner", label: "Transaksjoner", icon: FileSpreadsheet },
  { key: "import", label: "Import", icon: Upload },
  { key: "veiviser", label: "Kategori-veiviser", icon: Sparkles },
  { key: "kvitteringer", label: "Kvitteringer", icon: ReceiptIcon },
  { key: "faste", label: "Faste utgifter", icon: Repeat },
  { key: "innstillinger", label: "Innstillinger", icon: Settings2 },
];

function RegnskapPage() {
  const [tab, setTab] = useState<TabKey>("oversikt");
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [loadingStats, setLoadingStats] = useState(true);

  const catsFn = useServerFn(listFinCategories);
  const statsFn = useServerFn(getFinStats);

  const loadCats = async () => {
    try {
      setCategories(await catsFn());
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke laste kategorier");
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      setStats(await statsFn({ data: { from: from || null, to: to || null } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke laste statistikk");
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadCats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Pengekammeret"
        title="Regnskap"
        subtitle="Bankimport, AI-kategorisering, kvitteringer og full oversikt over hvor kronene tar veien."
        image={heroImg}
      />

      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Faner */}
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
        </div>

        {/* Periodefilter */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card/50 p-4">
          <div>
            <Label className="text-xs text-muted-foreground">Fra</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Til</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Alt</Button>
            <Button variant="secondary" size="sm" onClick={() => {
              const y = new Date().getFullYear();
              setFrom(`${y}-01-01`); setTo(`${y}-12-31`);
            }}>I år</Button>
            <Button variant="secondary" size="sm" onClick={() => {
              const d = new Date(); d.setMonth(d.getMonth() - 12);
              setFrom(d.toISOString().slice(0, 10)); setTo("");
            }}>Siste 12 mnd</Button>
            <Button variant="ghost" size="sm" onClick={loadStats}><RefreshCw size={14} /></Button>
          </div>
        </div>

        {tab === "oversikt" && <Oversikt stats={stats} loading={loadingStats} />}
        {tab === "transaksjoner" && (
          <Transaksjoner categories={categories} from={from} to={to} onChanged={loadStats} />
        )}
        {tab === "import" && <ImportPanel onDone={() => { loadStats(); }} />}
        {tab === "kvitteringer" && <Kvitteringer onChanged={loadStats} />}
        {tab === "veiviser" && <Veiviser categories={categories} onChanged={loadStats} />}
        {tab === "faste" && <FasteUtgifter />}
        {tab === "innstillinger" && <Innstillinger categories={categories} reload={loadCats} />}
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ Oversikt */

function Kpi({ label, value, sub, icon: Icon, tone }: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>; tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon size={16} className={tone} />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Oversikt({ stats, loading }: { stats: any; loading: boolean }) {
  if (loading && !stats) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" size={16} /> Laster tall…</div>;
  }
  if (!stats) return null;

  const months = Math.max(Number(stats.months ?? 1), 1);
  const monthly = (stats.monthly ?? []).map((m: any) => ({
    month: m.month, Inntekt: Number(m.income), Utgift: Number(m.expense), Netto: Number(m.net),
  }));
  const byCat = (stats.by_category ?? []).map((c: any) => ({ name: c.category, value: Number(c.amount) }));
  const top10 = byCat.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Inntekter" value={nok(Number(stats.income))} icon={TrendingUp} tone="text-emerald-400"
          sub={`${nok(Number(stats.income) / months)} / mnd`} />
        <Kpi label="Utgifter" value={nok(Number(stats.expense))} icon={TrendingDown} tone="text-red-400"
          sub={`${nok(Number(stats.expense) / months)} / mnd`} />
        <Kpi label="Netto" value={nok(Number(stats.net))} icon={PiggyBank}
          tone={Number(stats.net) >= 0 ? "text-emerald-400" : "text-red-400"}
          sub={`${stats.tx_count} transaksjoner`} />
        <Kpi label="Til kontroll" value={String(stats.needs_review ?? 0)} icon={AlertTriangle} tone="text-amber-400"
          sub={`${stats.uncategorized} ukategorisert · ${stats.possible_dups} mulige duplikater`} />
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Måned for måned</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: any) => nok(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Bar dataKey="Inntekt" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Utgift" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Utgifter per kategori</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={top10} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                  {top10.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => nok(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Snitt per måned per kategori</h2>
          <div className="space-y-2">
            {byCat.slice(0, 12).map((c: any, i: number) => {
              const max = Number(byCat[0]?.value ?? 1);
              return (
                <div key={c.name}>
                  <div className="flex justify-between text-xs">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground">{nok(c.value)} · {nok(c.value / months)}/mnd</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-muted/40">
                    <div className="h-2 rounded transition-all" style={{ width: `${(c.value / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Største enkeltutgifter</h2>
          <ul className="space-y-2 text-sm">
            {(stats.top_expenses ?? []).map((t: any) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-b border-border/50 pb-1">
                <span className="truncate">{t.description}</span>
                <span className="shrink-0 text-muted-foreground">{fmtDate(t.date)}</span>
                <span className="shrink-0 font-medium text-red-400">{nok(Number(t.amount))}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mest brukt hos</h2>
          <ul className="space-y-2 text-sm">
            {(stats.top_merchants ?? []).map((m: any) => (
              <li key={m.merchant} className="flex items-center justify-between gap-3 border-b border-border/50 pb-1">
                <span className="truncate">{m.merchant}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{m.count}×</span>
                <span className="shrink-0 font-medium">{nok(Number(m.amount))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(stats.yearly ?? []).length > 1 && (
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">År for år</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={(stats.yearly ?? []).map((y: any) => ({ year: y.year, Inntekt: Number(y.income), Utgift: Number(y.expense) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: any) => nok(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Line dataKey="Inntekt" stroke="#22c55e" strokeWidth={2} />
                <Line dataKey="Utgift" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Transaksjoner */

function Transaksjoner({ categories, from, to, onChanged }: {
  categories: FinCategory[]; from: string; to: string; onChanged: () => void;
}) {
  const listFn = useServerFn(listFinTransactions);
  const updFn = useServerFn(updateFinTransaction);
  const delFn = useServerFn(deleteFinTransaction);
  const aiFn = useServerFn(categorizeFinTransactions);

  const [rows, setRows] = useState<FinTx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyUncategorized, setOnlyUncat] = useState(false);
  const [onlyReview, setOnlyReview] = useState(false);
  const [onlyDups, setOnlyDups] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 200;

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listFn({
        data: {
          from: from || null, to: to || null, search: search || null,
          onlyUncategorized, onlyReview, onlyDups, limit: pageSize, offset: page * pageSize,
        },
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke laste transaksjoner");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, search, onlyUncategorized, onlyReview, onlyDups, page]);

  const setCategory = async (tx: FinTx, categoryId: string) => {
    try {
      const updated = await updFn({ data: { id: tx.id, category_id: categoryId || null, learn: true } });
      setRows((prev) => prev.map((r) => (r.id === tx.id ? updated : r)));
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke lagre");
    }
  };

  const runAi = async () => {
    setAiBusy(true);
    try {
      const res = await aiFn({ data: { limit: 60 } });
      toast.success(`AI kategoriserte ${res.updated} transaksjoner. ${res.remaining} igjen.`);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "AI-kategorisering feilet");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Søk beskrivelse, mottaker, kommentar…"
            value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} />
        </div>
        <FilterChip active={onlyUncategorized} onClick={() => { setPage(0); setOnlyUncat((v) => !v); }}>Ukategorisert</FilterChip>
        <FilterChip active={onlyReview} onClick={() => { setPage(0); setOnlyReview((v) => !v); }}>Til kontroll</FilterChip>
        <FilterChip active={onlyDups} onClick={() => { setPage(0); setOnlyDups((v) => !v); }}>Mulige duplikater</FilterChip>
        <Button onClick={runAi} disabled={aiBusy} size="sm">
          {aiBusy ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />} Kategoriser med AI
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">{total} treff{loading && " · laster…"}</div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Dato</th>
              <th className="px-3 py-2 text-left">Beskrivelse</th>
              <th className="px-3 py-2 text-left">Kategori</th>
              <th className="px-3 py-2 text-right">Beløp</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <Fragment key={t.id}>
                <tr className="border-t border-border/50 hover:bg-muted/20">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDate(t.tx_date)}</td>
                  <td className="px-3 py-2">
                    <button className="flex items-center gap-1 text-left" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                      {expanded === t.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span className="truncate">{t.description}</span>
                    </button>
                    <div className="flex flex-wrap gap-1 pl-4 pt-1">
                      {t.needs_review && <Tag tone="amber">kontroll</Tag>}
                      {t.dup_status === "possible" && <Tag tone="red">mulig duplikat</Tag>}
                      {t.tx_type === "internal" && <Tag tone="slate">intern</Tag>}
                      {t.receipt_id && <Tag tone="emerald">kvittering</Tag>}
                      {t.ai_confidence != null && <Tag tone="slate">AI {Math.round(Number(t.ai_confidence) * 100)}%</Tag>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs"
                      value={t.category_id ?? ""}
                      onChange={(e) => setCategory(t, e.target.value)}
                    >
                      <option value="">— velg —</option>
                      {categories.filter((c) => !c.parent_id).map((c) => (
                        <optgroup key={c.id} label={c.name}>
                          <option value={c.id}>{c.name}</option>
                          {categories.filter((s) => s.parent_id === c.id).map((s) => (
                            <option key={s.id} value={s.id}>&nbsp;&nbsp;{s.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${Number(t.amount) < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {nok2(Number(t.amount))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={async () => {
                      await delFn({ data: { id: t.id } });
                      setRows((p) => p.filter((r) => r.id !== t.id));
                      onChanged();
                    }}><Trash2 size={14} /></Button>
                  </td>
                </tr>
                {expanded === t.id && (
                  <tr className="border-t border-border/30 bg-muted/10">
                    <td colSpan={5} className="px-6 py-3 text-xs">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1 text-muted-foreground">
                          <div>Mottaker: {t.counterparty ?? "—"}</div>
                          <div>Konto: {t.account ?? "—"} · Referanse: {t.reference ?? "—"}</div>
                          <div>Banktype: {t.bank_type ?? "—"} · Bokført: {fmtDate(t.booked_date)}</div>
                          {t.ai_reason && <div>AI: {t.ai_reason}</div>}
                          <div>Kategori: {t.category_id ? catName.get(t.category_id) : "ukategorisert"}</div>
                        </div>
                        <div className="space-y-2">
                          <Textarea placeholder="Kommentar…" defaultValue={t.comment ?? ""}
                            onBlur={async (e) => {
                              if (e.target.value !== (t.comment ?? "")) {
                                await updFn({ data: { id: t.id, comment: e.target.value } });
                                toast.success("Kommentar lagret");
                              }
                            }} />
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={async () => {
                              const updated = await updFn({ data: { id: t.id, tx_type: t.tx_type === "internal" ? (Number(t.amount) < 0 ? "expense" : "income") : "internal" } });
                              setRows((p) => p.map((r) => (r.id === t.id ? updated : r)));
                              onChanged();
                            }}>{t.tx_type === "internal" ? "Ikke intern" : "Marker som intern overføring"}</Button>
                            {t.dup_status === "possible" && (
                              <Button size="sm" variant="secondary" onClick={async () => {
                                const updated = await updFn({ data: { id: t.id, dup_status: "ok" } });
                                setRows((p) => p.map((r) => (r.id === t.id ? updated : r)));
                              }}>Ikke duplikat</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Ingen transaksjoner. Importer en CSV-fil fra banken.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Forrige</Button>
          <span className="text-xs text-muted-foreground">Side {page + 1} av {Math.ceil(total / pageSize)}</span>
          <Button size="sm" variant="secondary" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Neste</Button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
      }`}>{children}</button>
  );
}

function Tag({ tone, children }: { tone: "amber" | "red" | "slate" | "emerald"; children: React.ReactNode }) {
  const map = {
    amber: "border-amber-500/40 text-amber-400",
    red: "border-red-500/40 text-red-400",
    slate: "border-border text-muted-foreground",
    emerald: "border-emerald-500/40 text-emerald-400",
  };
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${map[tone]}`}>{children}</span>;
}

/* -------------------------------------------------------------------- Import */

function ImportPanel({ onDone }: { onDone: () => void }) {
  const importFn = useServerFn(importFinTransactions);
  const aiFn = useServerFn(categorizeFinTransactions);
  const importsFn = useServerFn(listFinImports);

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ rows: ParsedTx[]; errors: number; filename: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [imports, setImports] = useState<any[]>([]);

  const loadImports = async () => {
    try { setImports(await importsFn()); } catch { /* ignorer */ }
  };
  useEffect(() => { loadImports(); /* eslint-disable-next-line */ }, []);

  const onFile = async (file: File) => {
    try {
      const text = await readCsvFile(file);
      const parsed = parseBankCsv(text);
      if (parsed.rows.length === 0) {
        toast.error("Fant ingen transaksjoner i filen");
        return;
      }
      setPreview({ rows: parsed.rows, errors: parsed.errors.length, filename: file.name });
      setResult(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke lese filen");
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await importFn({ data: { filename: preview.filename, rows: preview.rows, errors: preview.errors } });
      setResult(res);
      toast.success(`${res.inserted} nye · ${res.duplicates} duplikater hoppet over`);
      setPreview(null);
      onDone();
      loadImports();
    } catch (e: any) {
      toast.error(e?.message ?? "Import feilet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}>
        <Upload className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Dra CSV-filen fra banken hit, eller</p>
        <Button className="mt-3" onClick={() => inputRef.current?.click()}>Velg fil</Button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        <p className="mt-3 text-xs text-muted-foreground">
          Støtter semikolon/komma, norske datoer og beløp, «Beløp inn»/«Beløp ut» og ISO-8859-tegnsett.
        </p>
      </div>

      {preview && (
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">{preview.filename}</div>
              <div className="text-xs text-muted-foreground">
                {preview.rows.length} rader klare {preview.errors > 0 && `· ${preview.errors} rader kunne ikke leses`}
              </div>
            </div>
            <Button onClick={doImport} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />} Importer
            </Button>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-border/60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/40 text-muted-foreground">
                <tr><th className="px-2 py-1 text-left">Dato</th><th className="px-2 py-1 text-left">Beskrivelse</th>
                  <th className="px-2 py-1 text-left">Mottaker</th><th className="px-2 py-1 text-right">Beløp</th></tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="px-2 py-1">{r.tx_date}</td>
                    <td className="px-2 py-1">{r.description}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.counterparty ?? "—"}</td>
                    <td className={`px-2 py-1 text-right ${r.amount < 0 ? "text-red-400" : "text-emerald-400"}`}>{nok2(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-border bg-card/60 p-4 text-sm">
          <div className="mb-2 font-medium">Import fullført</div>
          <ul className="space-y-1 text-muted-foreground">
            <li>{result.inserted} nye transaksjoner lagret</li>
            <li>{result.duplicates} duplikater ble hoppet over (dato + beskrivelse + beløp)</li>
            <li>{result.possible} markert som mulige duplikater til kontroll</li>
          </ul>
          <Button className="mt-3" size="sm" onClick={async () => {
            try {
              const r = await aiFn({ data: { limit: 60 } });
              toast.success(`AI kategoriserte ${r.updated}. ${r.remaining} igjen.`);
              onDone();
            } catch (e: any) { toast.error(e?.message ?? "AI feilet"); }
          }}><Sparkles size={14} /> Kategoriser nye med AI</Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card/60 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tidligere importer</h2>
        <ul className="space-y-1 text-sm">
          {imports.map((i) => (
            <li key={i.id} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-1">
              <span className="truncate">{i.filename}</span>
              <span className="text-xs text-muted-foreground">
                {fmtDate(i.imported_at)} · {i.inserted} nye · {i.duplicates} dupl.
              </span>
            </li>
          ))}
          {imports.length === 0 && <li className="text-muted-foreground">Ingen importer ennå.</li>}
        </ul>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Kvitteringer */

function Kvitteringer({ onChanged }: { onChanged: () => void }) {
  const receiptsFn = useServerFn(listFinReceipts);
  const matchFn = useServerFn(autoMatchReceipts);
  const linkFn = useServerFn(linkReceiptToTx);
  const [receipts, setReceipts] = useState<FinReceipt[]>([]);
  const [matches, setMatches] = useState<any[] | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    receiptsFn().then(setReceipts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findMatches = async () => {
    setBusy(true);
    try {
      const res = await matchFn({ data: { apply: false } });
      setMatches(res.matches);
      toast.success(`${res.count} mulige koblinger funnet`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kobling feilet");
    } finally {
      setBusy(false);
    }
  };

  const linkOne = async (m: any) => {
    try {
      await linkFn({ data: { tx_id: m.tx_id, receipt_id: m.receipt_id } });
      setLinked((p) => new Set(p).add(m.tx_id));
      toast.success("Kvittering koblet");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Kobling feilet");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={findMatches}>
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />} Finn forslag til kobling
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Kvitteringer kobles aldri automatisk. Du får kun forslag (samme beløp innen ±3 dager) og velger selv hvilke som
        skal kobles.
      </p>

      {matches && (
        <div className="rounded-xl border border-border bg-card/60 p-4 text-sm">
          <div className="mb-2 font-medium">{matches.length} forslag</div>
          <ul className="space-y-1 text-xs">
            {matches.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-1">
                <span className="text-muted-foreground">
                  {fmtDate(m.date)} · {m.store ?? "kvittering"} · {nok2(Number(m.amount))}
                </span>
                {linked.has(m.tx_id) ? (
                  <span className="text-emerald-400">Koblet</span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => linkOne(m)}>
                    <Link2 size={13} /> Koble
                  </Button>
                )}
              </li>
            ))}
            {matches.length === 0 && <li className="text-muted-foreground">Ingen forslag.</li>}
          </ul>
        </div>
      )}


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {receipts.map((r) => (
          <a key={r.id} href={r.image_url} target="_blank" rel="noreferrer"
            className="overflow-hidden rounded-xl border border-border bg-card/60 transition-transform hover:scale-[1.02]">
            <img src={r.image_url} alt={r.store ?? "Kvittering"} loading="lazy" className="h-36 w-full object-cover" />
            <div className="p-2 text-xs">
              <div className="truncate font-medium">{r.store ?? "Ukjent butikk"}</div>
              <div className="text-muted-foreground">{fmtDate(r.purchased_at)} · {nok(r.total_nok)}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Faste utgifter */

function FasteUtgifter() {
  const fn = useServerFn(getFinRecurring);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fn().then(setRows).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearly = rows.reduce((a, r) => a + Number(r.yearly_cost || 0), 0);

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" size={16} /> Analyserer…</div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Faste utgifter funnet" value={String(rows.length)} icon={Repeat} tone="text-sky-400" />
        <Kpi label="Estimert per år" value={nok(yearly)} icon={TrendingDown} tone="text-red-400" />
        <Kpi label="Estimert per måned" value={nok(yearly / 12)} icon={Wallet} tone="text-amber-400" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Mottaker</th>
              <th className="px-3 py-2 text-left">Frekvens</th>
              <th className="px-3 py-2 text-right">Snittbeløp</th>
              <th className="px-3 py-2 text-right">Per år</th>
              <th className="px-3 py-2 text-left">Neste forventet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="px-3 py-2">{r.merchant}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.frequency} ({r.count}×)</td>
                <td className="px-3 py-2 text-right">{nok2(Number(r.avg_amount))}</td>
                <td className="px-3 py-2 text-right text-red-400">{nok(Number(r.yearly_cost))}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.next_expected)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Ingen faste utgifter oppdaget ennå.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Innstillinger */

function Innstillinger({ categories, reload }: { categories: FinCategory[]; reload: () => void }) {
  const createFn = useServerFn(createFinCategory);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    try {
      await createFn({ data: { name, parent_id: parent || null } });
      setName("");
      reload();
      toast.success("Kategori lagt til");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke lagre");
    }
  };

  const tops = categories.filter((c) => !c.parent_id);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ny kategori</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Navn</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="F.eks. Hobby" className="w-56" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Under</Label>
            <select value={parent} onChange={(e) => setParent(e.target.value)}
              className="block h-9 w-56 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">(hovedkategori)</option>
              {tops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Button onClick={add}><Plus size={14} /> Legg til</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tops.map((c, i) => (
          <div key={c.id} className="rounded-xl border border-border bg-card/60 p-3">
            <div className="flex items-center gap-2 font-medium">
              <span className="h-3 w-3 rounded-full" style={{ background: c.color ?? COLORS[i % COLORS.length] }} />
              {c.name}
              <span className="ml-auto text-[10px] uppercase text-muted-foreground">{c.kind}</span>
            </div>
            <ul className="mt-2 space-y-1 pl-5 text-xs text-muted-foreground">
              {categories.filter((s) => s.parent_id === c.id).map((s) => <li key={s.id}>{s.name}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
