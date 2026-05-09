import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Plus, Send, Trash2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sendGarminTestPush } from "@/server/garmin-push.functions";

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;
const SENDER_OPTIONS = ["Garmin", "Arne", "Rebekka", "Helse-vakta", "Husmesteren"] as const;

type Pref = {
  id: string;
  recipient: string;
  sender_label: string;
  enabled: boolean;
  notify_daily: boolean;
  daily_time: string;
  notify_step_goal: boolean;
  notify_low_sleep: boolean;
  low_sleep_hours: number;
  notify_high_resting_hr: boolean;
  high_rhr_bpm: number;
  garmin_owner: "arne" | "rebekka";
};

const OWNER_OPTIONS = [
  { value: "arne", label: "Arne" },
  { value: "rebekka", label: "Rebekka" },
] as const;

export function GarminNotificationSettings() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("garmin_notification_prefs" as never)
      .select("id, recipient, sender_label, enabled, notify_daily, daily_time, notify_step_goal, notify_low_sleep, low_sleep_hours, notify_high_resting_hr, high_rhr_bpm, garmin_owner")
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
      .from("garmin_notification_prefs" as never)
      .update(patch as never)
      .eq("id", id);
    setSaving(null);
    if (error) { setPrefs(prev); toast.error("Kunne ikke lagre"); }
  };

  const remove = async (id: string) => {
    if (!confirm("Slett denne Garmin-varsel-regelen?")) return;
    const { error } = await supabase.from("garmin_notification_prefs" as never).delete().eq("id", id);
    if (error) toast.error("Kunne ikke slette");
    else { toast.success("Slettet"); void load(); }
  };

  const add = async () => {
    const { error } = await supabase
      .from("garmin_notification_prefs" as never)
      .insert({ recipient: "Arne", sender_label: "Garmin", enabled: true, notify_daily: true, daily_time: "07:30", garmin_owner: "arne" } as never);
    if (error) toast.error("Kunne ikke opprette");
    else { toast.success("Ny regel opprettet"); void load(); }
  };

  const test = async (id: string) => {
    setTesting(id);
    try {
      const r = await sendGarminTestPush({ data: { prefId: id } });
      toast.success(`Sendt: ${r.sent} · feil: ${r.errors}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setTesting(null); }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Laster Garmin-varsler …
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" /> Garmin push-varsler
        </p>
        <ul className="space-y-0.5">
          <li>• <span className="text-foreground">Daglig sammendrag</span> — skritt, søvn, hvilepuls og kalorier på valgt klokkeslett</li>
          <li>• <span className="text-foreground">Skritt-mål nådd</span> — varsel én gang per dag når dagens skritt-mål er passert</li>
          <li>• <span className="text-foreground">Lav søvn</span> — varsler hvis natten ble kortere enn grensa</li>
          <li>• <span className="text-foreground">Høy hvilepuls</span> — varsler hvis hvilepulsen er over grensa</li>
        </ul>
      </div>

      <div className="space-y-3">
        {prefs.map((p) => (
          <div key={p.id} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {p.enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                <span className="font-medium">{p.sender_label} → {p.recipient}</span>
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

            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <label className="space-y-1">
                <span className="text-muted-foreground">Til (mottaker)</span>
                <Select value={p.recipient} onValueChange={(v) => update(p.id, { recipient: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WHO_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">Fra (avsender-etikett i tittel)</span>
                <Select value={p.sender_label} onValueChange={(v) => update(p.id, { sender_label: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SENDER_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="rounded-md border border-border/40 p-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Daglig sammendrag</span>
                <Switch checked={p.notify_daily} onCheckedChange={(v) => update(p.id, { notify_daily: v })} />
              </div>
              {p.notify_daily && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Klokkeslett:</span>
                  <Input
                    type="time"
                    value={(p.daily_time || "07:30").slice(0, 5)}
                    onChange={(e) => update(p.id, { daily_time: `${e.target.value}:00` })}
                    className="h-8 w-28"
                  />
                </div>
              )}
            </div>

            <div className="rounded-md border border-border/40 p-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Skritt-mål nådd</span>
                <Switch checked={p.notify_step_goal} onCheckedChange={(v) => update(p.id, { notify_step_goal: v })} />
              </div>
            </div>

            <div className="rounded-md border border-border/40 p-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Lav søvn</span>
                <Switch checked={p.notify_low_sleep} onCheckedChange={(v) => update(p.id, { notify_low_sleep: v })} />
              </div>
              {p.notify_low_sleep && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Under:</span>
                  <Input
                    type="number" min={3} max={10} step={0.5}
                    value={p.low_sleep_hours}
                    onChange={(e) => update(p.id, { low_sleep_hours: Number(e.target.value) })}
                    className="h-8 w-20"
                  />
                  <span className="text-muted-foreground">timer</span>
                </div>
              )}
            </div>

            <div className="rounded-md border border-border/40 p-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Høy hvilepuls</span>
                <Switch checked={p.notify_high_resting_hr} onCheckedChange={(v) => update(p.id, { notify_high_resting_hr: v })} />
              </div>
              {p.notify_high_resting_hr && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Over:</span>
                  <Input
                    type="number" min={40} max={120} step={1}
                    value={p.high_rhr_bpm}
                    onChange={(e) => update(p.id, { high_rhr_bpm: Number(e.target.value) })}
                    className="h-8 w-20"
                  />
                  <span className="text-muted-foreground">bpm</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" variant="outline" onClick={add}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Ny Garmin-regel
      </Button>
    </div>
  );
}
