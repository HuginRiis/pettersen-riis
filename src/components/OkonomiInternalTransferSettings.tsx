import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowLeftRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  getOkonomiSettings,
  updateOkonomiSettings,
  listImportedAccounts,
  type ImportedAccount,
} from "@/lib/okonomi.functions";

export function OkonomiInternalTransferSettings() {
  const get = useServerFn(getOkonomiSettings);
  const update = useServerFn(updateOkonomiSettings);
  const listImp = useServerFn(listImportedAccounts);
  const [enabled, setEnabled] = useState(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [imp, setImp] = useState<ImportedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newAcc, setNewAcc] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, ia] = await Promise.all([get(), listImp()]);
        setEnabled(s.internal_transfer_filter_enabled);
        setAccounts(s.internal_transfer_accounts ?? []);
        setImp(ia);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Feil");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(next: { enabled?: boolean; accounts?: string[] }) {
    setBusy(true);
    try {
      await update({
        data: {
          internal_transfer_filter_enabled: next.enabled ?? enabled,
          internal_transfer_accounts: next.accounts ?? accounts,
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  function toggleAcc(a: string) {
    const next = accounts.includes(a) ? accounts.filter((x) => x !== a) : [...accounts, a];
    setAccounts(next);
    persist({ accounts: next });
  }

  function removeAcc(a: string) {
    const next = accounts.filter((x) => x !== a);
    setAccounts(next);
    persist({ accounts: next });
  }

  function addManual() {
    const v = newAcc.trim();
    if (!v) return;
    if (accounts.includes(v)) {
      setNewAcc("");
      return;
    }
    const next = [...accounts, v];
    setAccounts(next);
    setNewAcc("");
    persist({ accounts: next });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Laster…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Skjul interne overføringer
          </Label>
          <p className="text-[11px] text-muted-foreground mt-1">
            Skjuler posteringer som går mellom kontoene under (matcher par av motsatt fortegn
            innen ±3 dager).
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          onCheckedChange={(v) => {
            setEnabled(v);
            persist({ enabled: v });
          }}
        />
      </div>

      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Egne kontoer ({accounts.length})
        </Label>
        {accounts.length === 0 ? (
          <p className="text-[11px] text-muted-foreground mt-1">Ingen kontoer valgt enda.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {accounts.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200"
              >
                {a}
                <button
                  onClick={() => removeAcc(a)}
                  className="hover:text-rose-300"
                  aria-label={`Fjern ${a}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {imp.length > 0 && (
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Velg fra importerte kontoer
          </Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-32 overflow-y-auto">
            {imp.map((a) => {
              const on = accounts.includes(a.account);
              return (
                <button
                  key={a.account}
                  onClick={() => toggleAcc(a.account)}
                  disabled={busy}
                  className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                    on
                      ? "bg-amber-500/25 border-amber-500/60 text-amber-100"
                      : "bg-card/40 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a.account}
                  <span className="ml-1 opacity-60">({a.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        <Input
          value={newAcc}
          onChange={(e) => setNewAcc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addManual();
            }
          }}
          placeholder="Legg til manuelt, f.eks. 1234.56.78901"
          className="h-8 text-xs"
        />
        <Button size="sm" variant="secondary" className="h-8" onClick={addManual} disabled={busy}>
          <Plus className="w-3 h-3 mr-1" /> Legg til
        </Button>
      </div>
    </div>
  );
}
