import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  listOkonomiAccounts,
  upsertOkonomiAccount,
  deleteOkonomiAccount,
  type OkonomiAccount,
} from "@/server/okonomi.functions";

export function OkonomiAccountsSettings() {
  const list = useServerFn(listOkonomiAccounts);
  const upsert = useServerFn(upsertOkonomiAccount);
  const del = useServerFn(deleteOkonomiAccount);
  const [rows, setRows] = useState<OkonomiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      setRows(await list());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, []);

  async function save(a: OkonomiAccount) {
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
          account_patterns: a.account_patterns,
          color: a.color,
          sort_order: a.sort_order,
        },
      });
      toast.success(`Lagret ${a.name}`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusyId(null);
    }
  }

  async function addNew() {
    const slug = prompt("Slug (kort id, f.eks. 'sparing')")?.trim();
    if (!slug) return;
    const name = prompt("Navn")?.trim() || slug;
    try {
      await upsert({
        data: {
          slug,
          name,
          start_balance: 0,
          start_date: new Date().toISOString().slice(0, 10),
          monthly_change: 0,
          yearly_change: 0,
          account_patterns: [],
          color: "#f59e0b",
          sort_order: 100,
        },
      });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  function patch(id: string, p: Partial<OkonomiAccount>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Laster kontoer…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5" /> Kontoer
        </Label>
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={addNew}>
          <Plus className="w-3 h-3 mr-1" /> Ny konto
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Startsaldo + månedlig endring danner forventet utvikling. Tekstmønstre matcher
        mot «konto»-feltet på posteringene (komma-separert).
      </p>

      {rows.map((a) => (
        <div key={a.id} className="rounded border border-amber-500/30 p-3 space-y-2 bg-card/40">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={a.color}
              onChange={(e) => patch(a.id, { color: e.target.value })}
              className="w-7 h-7 rounded border border-border"
            />
            <Input
              value={a.name}
              onChange={(e) => patch(a.id, { name: e.target.value })}
              className="h-8 text-sm flex-1"
              placeholder="Navn"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={async () => {
                if (!confirm(`Slett ${a.name}?`)) return;
                await del({ data: { id: a.id } });
                reload();
              }}
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Startsaldo (kr)</Label>
              <Input
                type="number"
                value={a.start_balance}
                onChange={(e) => patch(a.id, { start_balance: Number(e.target.value) || 0 })}
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Startdato</Label>
              <Input
                type="date"
                value={a.start_date}
                onChange={(e) => patch(a.id, { start_date: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pr måned (kr)</Label>
              <Input
                type="number"
                value={a.monthly_change}
                onChange={(e) => patch(a.id, { monthly_change: Number(e.target.value) || 0 })}
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pr år (kr)</Label>
              <Input
                type="number"
                value={a.yearly_change}
                onChange={(e) => patch(a.id, { yearly_change: Number(e.target.value) || 0 })}
                className="h-8 text-xs tabular-nums"
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Tekstmønstre (komma-separert) — matcher mot konto-feltet
            </Label>
            <Input
              value={a.account_patterns.join(", ")}
              onChange={(e) =>
                patch(a.id, {
                  account_patterns: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="h-8 text-xs"
              placeholder="f.eks. 1234.56.78901, lønnskonto"
            />
          </div>
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => save(a)}
            disabled={busyId === a.id}
          >
            {busyId === a.id ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Save className="w-3 h-3 mr-1" />
            )}
            Lagre
          </Button>
        </div>
      ))}
    </div>
  );
}
