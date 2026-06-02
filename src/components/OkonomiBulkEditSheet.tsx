import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  bulkUpsertOkonomiTransactions,
  type OkonomiCategory,
  type OkonomiTransaction,
  type OkonomiAccount,
} from "@/lib/okonomi.functions";

type EditRow = {
  id: string;
  txn_date: string;
  description: string;
  amount: string;
  category_id: string;
  account: string;
  note: string;
};

function rowFromTxn(t: OkonomiTransaction): EditRow {
  return {
    id: t.id,
    txn_date: t.txn_date,
    description: t.description,
    amount: String(t.amount),
    category_id: t.category_id ?? "",
    account: t.account ?? "",
    note: t.note ?? "",
  };
}

const NONE_CAT = "__none__";

export function OkonomiBulkEditSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  txns,
  cats,
  accounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  txns: OkonomiTransaction[];
  cats: OkonomiCategory[];
  accounts: OkonomiAccount[];
  onSaved: () => void;
}) {
  const bulk = useServerFn(bulkUpsertOkonomiTransactions);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [origRows, setOrigRows] = useState<EditRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const r = txns.map(rowFromTxn);
      setRows(r);
      setOrigRows(r);
    }
  }, [open, txns]);

  const accountOptions = useMemo(() => {
    const s = new Set<string>();
    for (const a of accounts) {
      for (const p of a.account_patterns) if (p) s.add(p);
    }
    for (const t of txns) if (t.account) s.add(t.account);
    return Array.from(s).sort();
  }, [accounts, txns]);

  function update(id: string, patch: Partial<EditRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const dirtyIds = useMemo(() => {
    const map = new Map(origRows.map((r) => [r.id, r]));
    return rows
      .filter((r) => {
        const o = map.get(r.id);
        if (!o) return false;
        return (
          r.txn_date !== o.txn_date ||
          r.description !== o.description ||
          r.amount !== o.amount ||
          r.category_id !== o.category_id ||
          r.account !== o.account ||
          r.note !== o.note
        );
      })
      .map((r) => r.id);
  }, [rows, origRows]);

  async function saveAll() {
    if (dirtyIds.length === 0) {
      toast.info("Ingen endringer");
      return;
    }
    setBusy(true);
    try {
      const payload = rows
        .filter((r) => dirtyIds.includes(r.id))
        .map((r) => ({
          id: r.id,
          txn_date: r.txn_date,
          description: r.description,
          amount: Number(r.amount),
          category_id: r.category_id || null,
          account: r.account || null,
          note: r.note || null,
        }));
      const res = await bulk({ data: { rows: payload } });
      toast.success(`Lagret ${res.count} posteringer`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-hidden flex flex-col p-0 border-amber-500/40">
        <SheetHeader className="p-4 pb-2 border-b border-amber-500/20">
          <SheetTitle className="text-amber-300 text-base">{title}</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {subtitle ? `${subtitle} · ` : ""}{rows.length} posteringer · sum {new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(total)} kr
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Ingen posteringer.</p>
          )}
          {rows.map((r) => {
            const dirty = dirtyIds.includes(r.id);
            return (
              <div
                key={r.id}
                className={`rounded border p-2 space-y-1.5 ${dirty ? "border-amber-400/60 bg-amber-950/20" : "border-amber-500/15 bg-card/40"}`}
              >
                <div className="grid grid-cols-[120px_1fr_120px] gap-1.5">
                  <Input
                    type="date"
                    value={r.txn_date}
                    onChange={(e) => update(r.id, { txn_date: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Input
                    value={r.description}
                    onChange={(e) => update(r.id, { description: e.target.value })}
                    className="h-8 text-xs"
                    placeholder="Beskrivelse"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={r.amount}
                    onChange={(e) => update(r.id, { amount: e.target.value })}
                    className={`h-8 text-xs tabular-nums text-right ${Number(r.amount) < 0 ? "text-red-400" : "text-emerald-400"}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Select
                    value={r.category_id || NONE_CAT}
                    onValueChange={(v) => update(r.id, { category_id: v === NONE_CAT ? "" : v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_CAT}>— Uten kategori —</SelectItem>
                      {cats.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    {accountOptions.length > 0 ? (
                      <Select
                        value={r.account || NONE_CAT}
                        onValueChange={(v) => update(r.id, { account: v === NONE_CAT ? "" : v })}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue placeholder="Konto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_CAT}>— Ingen konto —</SelectItem>
                          {accountOptions.map((a) => (
                            <SelectItem key={a} value={a}>{a}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={r.account}
                        onChange={(e) => update(r.id, { account: e.target.value })}
                        className="h-8 text-xs flex-1"
                        placeholder="Konto"
                      />
                    )}
                  </div>
                </div>
                <Input
                  value={r.note}
                  onChange={(e) => update(r.id, { note: e.target.value })}
                  className="h-7 text-[11px]"
                  placeholder="Notat (valgfritt)"
                />
              </div>
            );
          })}
        </div>

        <div className="border-t border-amber-500/20 p-3 flex items-center gap-2 bg-card/60">
          <Label className="text-[11px] text-muted-foreground flex-1">
            {dirtyIds.length > 0 ? (
              <span className="text-amber-300">{dirtyIds.length} endret</span>
            ) : (
              "Ingen endringer"
            )}
          </Label>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            <X className="w-4 h-4 mr-1" /> Lukk
          </Button>
          <Button size="sm" onClick={saveAll} disabled={busy || dirtyIds.length === 0}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Lagre {dirtyIds.length > 0 ? `(${dirtyIds.length})` : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
