import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Wallet, Home, TrendingDown, Building2 } from "lucide-react";
import type {
  OkonomiAccount,
  OkonomiTransaction,
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
  onPickAccount,
}: {
  accounts: OkonomiAccount[];
  txns: OkonomiTransaction[];
  onPickAccount: (acc: OkonomiAccount, items: OkonomiTransaction[]) => void;
}) {
  const today = new Date();
  const ymPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const ytdPrefix = `${today.getFullYear()}-`;

  const grouped = useMemo(() => {
    const map = new Map<string, OkonomiTransaction[]>();
    for (const a of accounts) map.set(a.id, []);
    for (const t of txns) {
      const a = classifyAccount(t.account, accounts);
      if (a) map.get(a.id)!.push(t);
    }
    return map;
  }, [accounts, txns]);

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
        Kontotilknytning bestemmes av tekstmønstre du legger inn under innstillinger.
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
              <Mini label="Inn (mnd)" value={fmt(monthIn)} tone="ok" />
              <Mini label="Ut (mnd)" value={fmt(monthOut)} tone="warn" />
              <Mini
                label="Netto (år)"
                value={fmtSigned(ytdNet)}
                tone={ytdNet >= 0 ? "ok" : "warn"}
              />
            </div>

            <button
              type="button"
              onClick={() => onPickAccount(a, items)}
              className="w-full text-[11px] tracking-[0.2em] uppercase text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded py-2 hover:bg-amber-500/5 transition"
            >
              Vis & rediger {items.length} posteringer
            </button>
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
