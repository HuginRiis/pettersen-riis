import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_KEYS,
  ACCOUNT_LABELS,
  fmtNok,
  normalizeDesc,
  type BudCategory,
  type BudExpense,
} from "@/lib/budsjett-shared";

type Group = {
  key: string;
  label: string;
  expenses: BudExpense[];
  total: number;
};

export function BudBulkEditDialog({
  open,
  onClose,
  expenses,
  cats,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  expenses: BudExpense[];
  cats: BudCategory[];
  onApply: (
    changes: { ids: string[]; label: string; categoryId?: string; account?: string }[],
  ) => Promise<void>;
}) {
  const [filter, setFilter] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [accPicks, setAccPicks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPicks({});
      setAccPicks({});
      setFilter("");
    }
  }, [open]);

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const e of expenses) {
      const desc = e.store ?? e.note ?? "";
      const key = normalizeDesc(desc);
      if (!key) continue;
      const g = map.get(key) ?? { key, label: desc, expenses: [], total: 0 };
      g.expenses.push(e);
      g.total += Number(e.amount);
      if ((desc?.length ?? 0) > (g.label?.length ?? 0)) g.label = desc;
      map.set(key, g);
    }
    let arr = Array.from(map.values()).filter((g) => g.expenses.length >= 2);
    if (filter.trim()) {
      const f = filter.toLowerCase();
      arr = arr.filter((g) => g.label.toLowerCase().includes(f) || g.key.includes(f));
    }
    arr.sort((a, b) => b.expenses.length - a.expenses.length);
    return arr;
  }, [expenses, filter]);

  const apply = async () => {
    const keys = new Set([
      ...Object.entries(picks).filter(([, v]) => v).map(([k]) => k),
      ...Object.entries(accPicks).filter(([, v]) => v).map(([k]) => k),
    ]);
    if (!keys.size) {
      toast.info("Ingen endringer valgt");
      return;
    }
    setSaving(true);
    try {
      const changes = Array.from(keys).flatMap((key) => {
        const g = groups.find((x) => x.key === key);
        if (!g) return [];
        return [
          {
            ids: g.expenses.map((e) => e.id),
            label: g.label,
            categoryId: picks[key] || undefined,
            account: accPicks[key] || undefined,
          },
        ];
      });
      await onApply(changes);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke lagre");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Bulk-rediger posteringer
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Posteringer med lik beskrivelse grupperes. Velg kategori og/eller konto for hele gruppen —
          valget lagres også som regel for framtidige importer.
        </p>
        <Input
          placeholder="Søk i beskrivelser…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="space-y-2">
          {groups.slice(0, 100).map((g) => (
            <div
              key={g.key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/40 p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{g.label}</p>
                <p className="text-xs text-muted-foreground">
                  {g.expenses.length} posteringer · {fmtNok(g.total)}
                </p>
              </div>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                value={picks[g.key] ?? ""}
                onChange={(e) => setPicks((p) => ({ ...p, [g.key]: e.target.value }))}
              >
                <option value="">Kategori…</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                value={accPicks[g.key] ?? ""}
                onChange={(e) => setAccPicks((p) => ({ ...p, [g.key]: e.target.value }))}
              >
                <option value="">Konto…</option>
                {ACCOUNT_KEYS.map((a) => (
                  <option key={a} value={a}>
                    {ACCOUNT_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Fant ingen grupper med to eller flere like posteringer.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={apply} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Lagre endringer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
