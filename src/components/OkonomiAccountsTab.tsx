import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wallet, Home, TrendingDown, Building2, Loader2, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  upsertOkonomiAccount,
  type ImportedAccount,
  type OkonomiAccount,
  type OkonomiTransaction,
} from "@/server/okonomi.functions";

const fmt = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n) + " kr";

const fmtSigned = (n: number) =>
  (n > 0 ? "+" : "") + new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n) + " kr";

export function classifyAccount(
  accountText: string | null | undefined,
  accounts: OkonomiAccount[],
): OkonomiAccount | null {
  if (!accountText) return null;
  const a = accountText.toLowerCase();
  for (const acc of accounts) {
    for (const p of acc.account_patterns) {
      if (p && a.includes(p.toLowerCase())) return acc;
    }
  }
  return null;
}

function iconFor(slug: string) {
  if (slug === "lonn") return Wallet;
  if (slug === "lan") return TrendingDown;
  if (slug === "hytte") return Home;
  return Building2;
}

function monthsBetween(fromIso: string, toDate: Date): number {
  const f = new Date(fromIso);
  return Math.max(
    0,
    (toDate.getFullYear() - f.getFullYear()) * 12 + (toDate.getMonth() - f.getMonth()),
  );
}

export function OkonomiAccountsTab({
  accounts,
  txns,
  importedAccounts,
  onPickAccount,
  reload,
}: {
  accounts: OkonomiAccount[];
  txns: OkonomiTransaction[];
  importedAccounts: ImportedAccount[];
  onPickAccount: (acc: OkonomiAccount, items: OkonomiTransaction[]) => void;
  reload: () => void;
}) {
  const today = new Date();
  const currentY = today.getFullYear();
  const currentM = today.getMonth() + 1;
  const [filterYear, setFilterYear] = usePersistedState<number>(
    "okonomi_konto_filter_year",
    currentY,
  );
  const [filterMonth, setFilterMonth] = usePersistedState<number | "all">(
    "okonomi_konto_filter_month",
    currentM,
  );
  const ymPrefix =
    filterMonth === "all"
      ? `${filterYear}-`
      : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
  const ytdPrefix = `${filterYear}-`;
  const periodLabel =
    filterMonth === "all"
      ? `hele ${filterYear}`
      : new Date(filterYear, (filterMonth as number) - 1, 1).toLocaleDateString("nb-NO", {
          month: "long",
          year: "numeric",
        });

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>([currentY, filterYear]);
    for (const t of txns) {
      const y = Number(t.txn_date.slice(0, 4));
      if (isFinite(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [txns, currentY, filterYear]);

  const upsert = useServerFn(upsertOkonomiAccount);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, OkonomiTransaction[]>();
    for (const a of accounts) map.set(a.id, []);
    for (const t of txns) {
      const a = classifyAccount(t.account, accounts);
      if (a) map.get(a.id)!.push(t);
    }
    return map;
  }, [accounts, txns]);

  async function togglePattern(a: OkonomiAccount, pattern: string) {
    const has = a.account_patterns.includes(pattern);
    const next = has
      ? a.account_patterns.filter((p) => p !== pattern)
      : [...a.account_patterns, pattern];
    setBusyId(a.id);
    try {
      await upsert({
        data: {
          id: a.id,
          slug: a.slug,
          name: a.name,
          start_balance: Number(a.start_balance) || 0,
          start_date: a.start_date,
          monthly_change: Number(a.monthly_change) || 0,
          yearly_change: Number(a.yearly_change) || 0,
          account_patterns: next,
          color: a.color,
          sort_order: a.sort_order,
        },
      });
      toast.success(has ? `Fjernet ${pattern}` : `Knyttet ${pattern} til ${a.name}`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusyId(null);
    }
  }

  if (accounts.length === 0) {
    return (
      <Card className="p-6 border-amber-500/30 text-center">
        <p className="text-sm text-muted-foreground">
          Ingen kontoer er satt opp. Gå til innstillinger for å legge til kontoer.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 border-amber-500/20 text-[11px] text-muted-foreground">
        Saldo = startsaldo + (måneder × månedlig endring) + sum av posteringer fra startdato.
        Trykk «Velg kontonummer» for å koble importerte kontonummer til hver konto.
      </Card>

      <Card className="p-3 border-amber-500/30 bg-card/60">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.2em] text-amber-300 mr-1">Periode</span>
          <Select
            value={String(filterMonth)}
            onValueChange={(v) => setFilterMonth(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hele året</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {new Date(2000, m - 1, 1).toLocaleDateString("nb-NO", { month: "long" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearsAvailable.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground ml-auto">Viser tall for {periodLabel}</span>
        </div>
      </Card>


      {accounts.map((a) => {
        const items = grouped.get(a.id) ?? [];
        const Icon = iconFor(a.slug);
        const since = items.filter((t) => t.txn_date >= a.start_date);
        const sumTxns = since.reduce((s, t) => s + Number(t.amount), 0);
        const months = monthsBetween(a.start_date, today);
        const projected = a.start_balance + months * a.monthly_change;
        const balance = projected + sumTxns;

        const monthIn = items
          .filter((t) => t.txn_date.startsWith(ymPrefix) && Number(t.amount) > 0)
          .reduce((s, t) => s + Number(t.amount), 0);
        const monthOut = items
          .filter((t) => t.txn_date.startsWith(ymPrefix) && Number(t.amount) < 0)
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        const ytdNet = items
          .filter((t) => t.txn_date.startsWith(ytdPrefix))
          .reduce((s, t) => s + Number(t.amount), 0);

        const isOpen = openId === a.id;
        const linked = a.account_patterns.filter(Boolean);

        return (
          <Card key={a.id} className="p-4 border-amber-500/30">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: a.color, color: a.color, background: `${a.color}15` }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm tracking-[0.2em] uppercase text-amber-300">{a.name}</h3>
                <p className="text-[10px] text-muted-foreground">
                  Startsaldo {fmt(a.start_balance)} fra {a.start_date} · {fmtSigned(a.monthly_change)}/mnd
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo nå</p>
                <p
                  className={`text-lg font-semibold tabular-nums ${balance < 0 ? "text-red-400" : "text-emerald-400"}`}
                >
                  {fmt(balance)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <Mini label={`Inn (${filterMonth === "all" ? "år" : "mnd"})`} value={fmt(monthIn)} tone="ok" />
              <Mini label={`Ut (${filterMonth === "all" ? "år" : "mnd"})`} value={fmt(monthOut)} tone="warn" />
              <Mini
                label="Netto (år)"
                value={fmtSigned(ytdNet)}
                tone={ytdNet >= 0 ? "ok" : "warn"}
              />
            </div>


            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : a.id)}
              className="w-full flex items-center justify-between text-[11px] tracking-[0.2em] uppercase text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded py-2 px-3 hover:bg-amber-500/5 transition mb-2"
            >
              <span>
                Velg kontonummer{" "}
                {linked.length > 0 && (
                  <span className="text-amber-200 normal-case tracking-normal ml-1">
                    ({linked.length} tilknyttet)
                  </span>
                )}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <div className="mb-3 rounded border border-amber-500/20 bg-card/40 p-2 space-y-1">
                {importedAccounts.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic px-1 py-2">
                    Ingen importerte kontonumre ennå.
                  </p>
                )}
                {importedAccounts.map((ia) => {
                  const checked = a.account_patterns.some(
                    (p) => p.toLowerCase() === ia.account.toLowerCase(),
                  );
                  const usedByOther = accounts.find(
                    (other) =>
                      other.id !== a.id &&
                      other.account_patterns.some(
                        (p) => p.toLowerCase() === ia.account.toLowerCase(),
                      ),
                  );
                  return (
                    <button
                      key={ia.account}
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => togglePattern(a, ia.account)}
                      className={`w-full flex items-center gap-2 text-left text-[12px] rounded px-2 py-1.5 transition ${
                        checked
                          ? "bg-amber-500/15 text-amber-100"
                          : "hover:bg-amber-500/5 text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          checked ? "border-amber-400 bg-amber-500/30" : "border-amber-500/40"
                        }`}
                      >
                        {checked && <Check className="w-3 h-3 text-amber-200" />}
                      </span>
                      <span className="flex-1 truncate tabular-nums">{ia.account}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {ia.count} posteringer
                      </span>
                      {usedByOther && !checked && (
                        <span className="text-[10px] text-amber-500/70 shrink-0">
                          → {usedByOther.name}
                        </span>
                      )}
                    </button>
                  );
                })}
                {busyId === a.id && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-2 pt-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Lagrer…
                  </div>
                )}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => onPickAccount(a, items)}
              className="w-full text-[11px] tracking-[0.2em] uppercase text-amber-400 hover:text-amber-300 border-amber-500/30 hover:bg-amber-500/5"
            >
              Vis & rediger {items.length} posteringer
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const c = tone === "warn" ? "text-red-400" : tone === "ok" ? "text-emerald-400" : "text-amber-200";
  return (
    <div className="rounded border border-amber-500/15 bg-card/40 p-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${c}`}>{value}</p>
    </div>
  );
}
