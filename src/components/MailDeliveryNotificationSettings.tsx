import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Mail, Save, Send, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  getMailDeliveryOverview,
  sendMailDeliveryTestPush,
} from "@/server/mail-delivery-push.functions";

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;
const DAYS_BEFORE_OPTIONS = [
  { v: 0, l: "Samme dag" },
  { v: 1, l: "1 dag før" },
  { v: 2, l: "2 dager før" },
  { v: 3, l: "3 dager før" },
] as const;

type Pref = {
  id: string;
  postal_code: string;
  enabled: boolean;
  recipient: string;
  days_before: number;
  notify_hour: number;
  notify_minute: number;
};

export function MailDeliveryNotificationSettings() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [days, setDays] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("3736");

  const load = async () => {
    setLoading(true);
    try {
      const ov = await getMailDeliveryOverview();
      setPrefs(ov.prefs as Pref[]);
      setDays(ov.deliveryDaysByPostal);
    } catch (e) {
      toast.error("Klarte ikke laste innstillinger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  async function patch(id: string, changes: Partial<Pref>) {
    setSaving(id);
    const { error } = await supabase
      .from("mail_delivery_prefs" as never)
      .update({ ...changes, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    setPrefs((p) => p.map((x) => x.id === id ? { ...x, ...changes } : x));
  }

  async function addPostal() {
    const code = newCode.trim();
    if (!/^\d{4}$/.test(code)) { toast.error("Postnummer må være 4 sifre"); return; }
    const { data, error } = await supabase
      .from("mail_delivery_prefs" as never)
      .insert({ postal_code: code } as never)
      .select("*")
      .single();
    if (error) { toast.error(error.message); return; }
    toast.success(`La til ${code}`);
    setNewCode("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Slette denne varslingen?")) return;
    const { error } = await supabase.from("mail_delivery_prefs" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setPrefs((p) => p.filter((x) => x.id !== id));
  }

  async function test(id: string) {
    try {
      const res = await sendMailDeliveryTestPush({ data: { prefId: id } });
      toast.success(`Sendt: ${res.sent}, feil: ${res.errors}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laster…</div>;
  }

  return (
    <div className="space-y-3">
      {prefs.map((p) => {
        const next = days[p.postal_code]?.[0];
        const nextLabel = next
          ? new Date(next).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })
          : "ukjent";
        return (
          <div key={p.id} className="rounded-md border border-border/60 bg-background/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Mail size={16} className="text-primary" />
              <span className="font-semibold">Postnummer {p.postal_code}</span>
              <span className="text-[11px] text-muted-foreground ml-auto">Neste levering: {nextLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2">
                <Switch checked={p.enabled} onCheckedChange={(v) => patch(p.id, { enabled: v })} />
                <span className="text-muted-foreground">{p.enabled ? <Bell size={12} className="inline" /> : <BellOff size={12} className="inline" />} {p.enabled ? "På" : "Av"}</span>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Mottaker:</span>
                <select
                  value={p.recipient}
                  onChange={(e) => patch(p.id, { recipient: e.target.value })}
                  className="bg-background border border-border/60 rounded px-2 py-1 text-xs"
                >
                  {WHO_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Når:</span>
                <select
                  value={p.days_before}
                  onChange={(e) => patch(p.id, { days_before: Number(e.target.value) })}
                  className="bg-background border border-border/60 rounded px-2 py-1 text-xs"
                >
                  {DAYS_BEFORE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">Kl:</span>
                <input
                  type="number" min={0} max={23}
                  value={p.notify_hour}
                  onChange={(e) => patch(p.id, { notify_hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })}
                  className="w-14 bg-background border border-border/60 rounded px-2 py-1 text-xs tabular-nums"
                />
                <span>:</span>
                <input
                  type="number" min={0} max={59}
                  value={p.notify_minute}
                  onChange={(e) => patch(p.id, { notify_minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
                  className="w-14 bg-background border border-border/60 rounded px-2 py-1 text-xs tabular-nums"
                />
              </label>
              <div className="ml-auto flex items-center gap-2">
                {saving === p.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => test(p.id)}>
                  <Send size={12} className="mr-1" /> Test
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => remove(p.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          placeholder="Postnr"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="w-24 bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
        />
        <Button size="sm" variant="outline" onClick={addPostal} className="text-xs">
          <Plus size={12} className="mr-1" /> Legg til postnummer
        </Button>
      </div>
    </div>
  );
}
