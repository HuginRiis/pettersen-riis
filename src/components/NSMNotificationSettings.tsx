import { useEffect, useState } from "react";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listNsmPrefs, upsertNsmPref, deleteNsmPref, sendNsmTest, triggerNsmPoll } from "@/lib/nsm-alerts.functions";

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

type Pref = { id: string; recipient: string; enabled: boolean };

export function NSMNotificationSettings() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newRecipient, setNewRecipient] = useState<string>("Alle");
  const testFn = useServerFn(sendNsmTest);
  const pollFn = useServerFn(triggerNsmPoll);

  const load = async () => {
    try {
      const data = await listNsmPrefs();
      setPrefs(data);
    } catch {
      toast.error("Kunne ikke laste innstillinger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const onToggle = async (p: Pref, enabled: boolean) => {
    setPrefs((prev) => prev.map((x) => (x.id === p.id ? { ...x, enabled } : x)));
    try {
      await upsertNsmPref(p.recipient, enabled);
    } catch {
      toast.error("Kunne ikke lagre");
      void load();
    }
  };

  const onAdd = async () => {
    if (prefs.some((p) => p.recipient === newRecipient)) {
      toast.error("Mottaker finnes allerede");
      return;
    }
    setAdding(true);
    try {
      await upsertNsmPref(newRecipient, true);
      await load();
      toast.success("Abonnement lagt til");
    } catch {
      toast.error("Kunne ikke legge til");
    } finally {
      setAdding(false);
    }
  };

  const onDelete = async (p: Pref) => {
    try {
      await deleteNsmPref(p.id);
      setPrefs((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      toast.error("Kunne ikke slette");
    }
  };

  const onTest = async (p: Pref) => {
    try {
      const r = await testFn({ data: { recipient: p.recipient } });
      toast.success(`Sendt ${r.sent} (${r.errors} feil)`);
    } catch {
      toast.error("Test feilet");
    }
  };

  const onPollNow = async () => {
    try {
      const r = await pollFn({ data: undefined } as never);
      toast.success(`Hentet ${r.stored.fetched}, ${r.stored.inserted} nye. Push: ${r.pushed.sent}`);
    } catch {
      toast.error("Henting feilet");
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laster…</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Få push-varsler når NSM (Nasjonal sikkerhetsmyndighet) publiserer nye cybersikkerhetsvarsler. Sjekker NSM 5 ganger i døgnet.
      </p>

      <div className="space-y-2">
        {prefs.length === 0 && (
          <div className="text-xs text-muted-foreground italic">Ingen abonnenter ennå.</div>
        )}
        {prefs.map((p) => (
          <div key={p.id} className="flex items-center gap-2 panel rounded p-2">
            <div className="flex-1 text-sm">{p.recipient}</div>
            <Switch checked={p.enabled} onCheckedChange={(v) => onToggle(p, v)} />
            <Button size="sm" variant="ghost" onClick={() => onTest(p)} title="Send test">
              <Send className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(p)} title="Slett">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
        <Select value={newRecipient} onValueChange={setNewRecipient}>
          <SelectTrigger className="h-9 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WHO_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={onAdd} disabled={adding}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Legg til
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={onPollNow}>Hent NSM nå</Button>
      </div>
    </div>
  );
}
