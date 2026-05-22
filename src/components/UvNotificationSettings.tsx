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
import { sendUvTestPush, getUvForecast } from "@/server/uv-push.functions";

type UvPref = {
  id: string;
  location: string;
  label: string;
  enabled: boolean;
  recipient: string;
  lead_minutes: number;
  notify_fall_3: boolean;
  notify_fall_6: boolean;
  notify_fall_8: boolean;
};


type Forecast = {
  id: string;
  location: string;
  label: string;
  enabled: boolean;
  leadMinutes: number;
  nextSendAt: string | null;
  nextThresholdAt: string | null;
  threshold: 3 | 6 | 8 | null;
  uv: number | null;
  reason: string;
};

const LEAD_OPTIONS = [
  { value: 0, label: "Nå" },
  { value: 30, label: "30 min før" },
  { value: 60, label: "60 min før" },
] as const;

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

function formatOsloTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
}

/**
 * Panel for å styre push-varsler om solkrem (UV) per lokasjon.
 * Viser DSA-tersklene og lar bruker slå av/på + velge mottaker.
 */
export function UvNotificationSettings() {
  const [prefs, setPrefs] = useState<UvPref[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  

  const loadForecast = async () => {
    try {
      const data = await getUvForecast();
      setForecasts(data as Forecast[]);
    } catch {
      // stille — prognose er valgfri info
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("uv_notification_prefs" as never)
        .select(
          "id, location, label, enabled, recipient, lead_minutes, notify_fall_3, notify_fall_6, notify_fall_8",
        )
        .order("location");

      if (cancelled) return;
      if (error) {
        toast.error("Kunne ikke laste UV-varselinnstillinger");
        setLoading(false);
        return;
      }
      setPrefs((data ?? []) as unknown as UvPref[]);
      setLoading(false);
      loadForecast();
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
    } else {
      loadForecast();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laster UV-varsler …
      </div>
    );
  }

  const summaryLine = forecasts.length
    ? forecasts
        .map((f) => {
          if (!f.enabled) return `${f.label}: av`;
          if (!f.nextSendAt || f.threshold == null || f.uv == null)
            return `${f.label}: ingen varsel i dag`;
          return `${f.label} sender kl ${formatOsloTime(f.nextSendAt)} (UV ${f.uv.toFixed(1)} ≥ ${f.threshold})`;
        })
        .join(" • ")
    : null;

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
        {summaryLine && (
          <p className="mt-2 text-[11px] text-foreground">
            <span className="text-muted-foreground">Neste varsel: </span>
            {summaryLine}
          </p>
        )}
        <p className="mt-2 text-[11px]">
          Sjekkes hver time 08:30-17. Maks ett varsel per nivå per dag per lokasjon.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {prefs.map((p) => {
          const f = forecasts.find((x) => x.id === p.id);
          return (
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

              {p.enabled && (
                <div className="rounded-md bg-muted/30 px-2.5 py-1.5 text-[11px] leading-snug">
                  {f && f.nextSendAt && f.threshold != null && f.uv != null ? (
                    <>
                      <div className="text-foreground">
                        Sender kl <span className="font-semibold">{formatOsloTime(f.nextSendAt)}</span>
                      </div>
                      <div className="text-muted-foreground">
                        UV {f.uv.toFixed(1)} ≥ {f.threshold} kl{" "}
                        {f.nextThresholdAt ? formatOsloTime(f.nextThresholdAt) : "?"}
                        {f.leadMinutes > 0 ? ` (${f.leadMinutes} min før)` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {f?.reason || "Ingen varsel forventet i dag"}
                    </span>
                  )}
                </div>
              )}

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
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Varsle</span>
                <Select
                  value={String(p.lead_minutes ?? 30)}
                  disabled={!p.enabled || saving === p.id}
                  onValueChange={(v) => update(p.id, { lead_minutes: Number(v) })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border border-border/50 bg-muted/20 p-2 space-y-1.5">
                <div className="text-[11px] text-muted-foreground">
                  Varsle også når UV faller under nivå:
                </div>
                {([8, 6, 3] as const).map((lvl) => {
                  const key = `notify_fall_${lvl}` as const;
                  return (
                    <div key={lvl} className="flex items-center justify-between gap-2">
                      <span className="text-xs">UV under {lvl}</span>
                      <Switch
                        checked={Boolean(p[key])}
                        disabled={!p.enabled || saving === p.id}
                        onCheckedChange={(v) => update(p.id, { [key]: v } as Partial<UvPref>)}
                      />
                    </div>
                  );
                })}
              </div>



              <div className="pt-1">
                <div className="text-[11px] text-muted-foreground mb-1">Send test-push:</div>
                <div className="flex flex-wrap gap-1.5">
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
                            toast.error(
                              `Ingen abonnenter for ${res.recipient}. Abonner i Innstillinger → Push.`,
                            );
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
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          const { error } = await supabase
            .from("uv_notification_prefs" as never)
            .update({ notified_date_3: null, notified_date_6: null, notified_date_8: null } as never)
            .neq("id", "00000000-0000-0000-0000-000000000000");
          if (error) toast.error("Kunne ikke nullstille");
          else {
            toast.success("Nullstilt — neste sjekk kan sende varsel igjen i dag");
            loadForecast();
          }
        }}
      >
        Nullstill dagens varsler (test)
      </Button>
    </div>
  );
}
