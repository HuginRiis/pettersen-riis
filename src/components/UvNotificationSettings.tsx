import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sendUvTestPush } from "@/server/uv-push.functions";

type UvPref = {
  id: string;
  location: string;
  label: string;
  enabled: boolean;
  recipient: string;
};

const WHO_OPTIONS = ["Alle", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

/**
 * Panel for å styre push-varsler om solkrem (UV) per lokasjon.
 * Viser DSA-tersklene og lar bruker slå av/på + velge mottaker.
 */
export function UvNotificationSettings() {
  const [prefs, setPrefs] = useState<UvPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("uv_notification_prefs" as never)
        .select("id, location, label, enabled, recipient")
        .order("location");
      if (cancelled) return;
      if (error) {
        toast.error("Kunne ikke laste UV-varselinnstillinger");
        setLoading(false);
        return;
      }
      setPrefs((data ?? []) as unknown as UvPref[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (id: string, patch: Partial<UvPref>) => {
    setSaving(id);
    const prev = prefs;
    setPrefs((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase
      .from("uv_notification_prefs" as never)
      .update(patch as never)
      .eq("id", id);
    setSaving(null);
    if (error) {
      setPrefs(prev);
      toast.error("Kunne ikke lagre");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laster UV-varsler …
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <Sun className="h-3.5 w-3.5" /> Råd fra Direktoratet for strålevern (DSA)
        </p>
        <ul className="space-y-0.5">
          <li>• <span className="text-foreground">UV ≥ 3</span> — bruk solkrem SPF 30</li>
          <li>• <span className="text-foreground">UV ≥ 6</span> — SPF 30+, dekk til, søk skygge midt på dagen</li>
          <li>• <span className="text-foreground">UV ≥ 8</span> — unngå sol kl 12-15</li>
        </ul>
        <p className="mt-2 text-[11px]">
          Varsel sendes ca <span className="text-foreground">30 min før</span> hver terskel nås, så du rekker å smøre deg. Sjekkes hver time 08:30-17. Maks ett varsel per nivå per dag per lokasjon.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {prefs.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {p.enabled ? (
                  <Bell className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium truncate">{p.label}</span>
              </div>
              <Switch
                checked={p.enabled}
                disabled={saving === p.id}
                onCheckedChange={(v) => update(p.id, { enabled: v })}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Mottaker</span>
              <Select
                value={p.recipient}
                disabled={!p.enabled || saving === p.id}
                onValueChange={(v) => update(p.id, { recipient: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WHO_OPTIONS.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground self-center mr-1">Test:</span>
              {([3, 6, 8] as const).map((lvl) => (
                <Button
                  key={lvl}
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={saving === p.id}
                  onClick={async () => {
                    setSaving(p.id);
                    try {
                      const res = await sendUvTestPush({ data: { prefId: p.id, level: lvl } });
                      if (res.sent > 0) {
                        toast.success(`Test sendt (UV ${lvl}) → ${res.recipient}`);
                      } else {
                        toast.error(`Ingen abonnenter for ${res.recipient}. Abonner i Innstillinger → Push.`);
                      }
                    } catch (e) {
                      toast.error("Test feilet: " + (e as Error).message);
                    } finally {
                      setSaving(null);
                    }
                  }}
                >
                  <Send className="h-3 w-3 mr-1" />UV {lvl}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Test-knappene over sender et ekte push-varsel nå til mottakeren for lokasjonen. Krever at personen er abonnert (Innstillinger → Push).
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          const { error } = await supabase
            .from("uv_notification_prefs" as never)
            .update({ notified_date_3: null, notified_date_6: null, notified_date_8: null } as never)
            .neq("id", "00000000-0000-0000-0000-000000000000");
          if (error) toast.error("Kunne ikke nullstille");
          else toast.success("Nullstilt — neste sjekk kan sende varsel igjen i dag");
        }}
      >
        Nullstill dagens varsler (test)
      </Button>
    </div>
  );
}
