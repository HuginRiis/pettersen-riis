import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Plus, Send, Trash2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sendLoginTestPush } from "@/server/login-push.functions";

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

type Pref = {
  id: string;
  recipient: string;
  enabled: boolean;
  notify_on_success: boolean;
  notify_on_failure: boolean;
};

export function LoginNotificationSettings() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("login_notification_prefs" as never)
      .select("id, recipient, enabled, notify_on_success, notify_on_failure")
      .order("created_at", { ascending: true });
    if (error) toast.error("Kunne ikke laste regler");
    else setPrefs((data ?? []) as unknown as Pref[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const update = async (id: string, patch: Partial<Pref>) => {
    setSaving(id);
    const prev = prefs;
    setPrefs((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase
      .from("login_notification_prefs" as never)
      .update(patch as never)
      .eq("id", id);
    setSaving(null);
    if (error) { setPrefs(prev); toast.error("Kunne ikke lagre"); }
  };

  const remove = async (id: string) => {
    if (!confirm("Slett denne innloggings-varsel-regelen?")) return;
    const { error } = await supabase.from("login_notification_prefs" as never).delete().eq("id", id);
    if (error) toast.error("Kunne ikke slette");
    else { toast.success("Slettet"); void load(); }
  };

  const add = async () => {
    const { error } = await supabase
      .from("login_notification_prefs" as never)
      .insert({ recipient: "Arne", enabled: true, notify_on_success: true, notify_on_failure: true } as never);
    if (error) toast.error("Kunne ikke opprette");
    else { toast.success("Ny regel opprettet"); void load(); }
  };

  const test = async (id: string) => {
    setTesting(id);
    try {
      const r = await sendLoginTestPush({ data: { prefId: id } });
      toast.success(`Sendt: ${r.sent} · feil: ${r.errors}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setTesting(null); }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Laster innloggings-varsler …
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> Innlogging — push-varsler
        </p>
        <ul className="space-y-0.5">
          <li>• <span className="text-foreground">Vellykket innlogging</span> — varsel hver gang noen logger seg på</li>
          <li>• <span className="text-foreground">Feilet forsøk</span> — varsel når noen prøver med feil passord</li>
          <li>• Hver regel har egen mottaker — bruk filteret for å velge hvem som skal motta varselet</li>
        </ul>
      </div>

      <div className="space-y-3">
        {prefs.map((p) => (
          <div key={p.id} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {p.enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium">Vakttårn → {p.recipient}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => test(p.id)} disabled={testing === p.id}>
                  {testing === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  <span className="ml-1 text-xs">Test</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)} className="text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
                <Switch checked={p.enabled} disabled={saving === p.id} onCheckedChange={(v) => update(p.id, { enabled: v })} />
              </div>
            </div>

            <label className="space-y-1 text-xs block">
              <span className="text-muted-foreground">Til (mottaker)</span>
              <Select value={p.recipient} onValueChange={(v) => update(p.id, { recipient: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WHO_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>

            <div className="rounded-md border border-border/40 p-2 flex items-center justify-between text-xs">
              <span className="font-medium">Varsle ved vellykket innlogging</span>
              <Switch checked={p.notify_on_success} onCheckedChange={(v) => update(p.id, { notify_on_success: v })} />
            </div>

            <div className="rounded-md border border-border/40 p-2 flex items-center justify-between text-xs">
              <span className="font-medium">Varsle ved feilet forsøk</span>
              <Switch checked={p.notify_on_failure} onCheckedChange={(v) => update(p.id, { notify_on_failure: v })} />
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" variant="outline" onClick={add}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Ny innloggings-regel
      </Button>
    </div>
  );
}
