import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send, Wind } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sendAirQualityTestPush } from "@/server/air-quality-push.functions";

type MetricKey = "aqi" | "pm25" | "pm10" | "no2" | "o3" | "so2" | "dust";

type AqPref = {
  id: string;
  location: string;
  label: string;
  enabled: boolean;
  recipient: string;
  cooldown_minutes: number;
  notify_aqi: boolean;
  aqi_threshold: number;
  notify_pm25: boolean;
  pm25_threshold: number;
  notify_pm10: boolean;
  pm10_threshold: number;
  notify_no2: boolean;
  no2_threshold: number;
  notify_o3: boolean;
  o3_threshold: number;
  notify_so2: boolean;
  so2_threshold: number;
  notify_dust: boolean;
  dust_threshold: number;
};

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

const METRICS: {
  key: MetricKey;
  label: string;
  emoji: string;
  unit: string;
  enabledField: keyof AqPref;
  thresholdField: keyof AqPref;
  hint: string;
}[] = [
  { key: "aqi", label: "Europeisk AQI", emoji: "🟧", unit: "", enabledField: "notify_aqi", thresholdField: "aqi_threshold", hint: "60 = dårlig, 80 = veldig dårlig" },
  { key: "pm25", label: "PM2.5", emoji: "💨", unit: "µg/m³", enabledField: "notify_pm25", thresholdField: "pm25_threshold", hint: "WHO 24t = 15, EU = 25" },
  { key: "pm10", label: "PM10", emoji: "🌫️", unit: "µg/m³", enabledField: "notify_pm10", thresholdField: "pm10_threshold", hint: "WHO 24t = 45" },
  { key: "no2", label: "NO₂", emoji: "🚗", unit: "µg/m³", enabledField: "notify_no2", thresholdField: "no2_threshold", hint: "WHO 24t = 25" },
  { key: "o3", label: "O₃ (ozon)", emoji: "☀️", unit: "µg/m³", enabledField: "notify_o3", thresholdField: "o3_threshold", hint: "WHO 8t = 100" },
  { key: "so2", label: "SO₂", emoji: "🏭", unit: "µg/m³", enabledField: "notify_so2", thresholdField: "so2_threshold", hint: "WHO 24t = 40" },
  { key: "dust", label: "Mineralstøv", emoji: "🏜️", unit: "µg/m³", enabledField: "notify_dust", thresholdField: "dust_threshold", hint: "Sahara-støv o.l." },
];

export function AirQualityNotificationSettings() {
  const [prefs, setPrefs] = useState<AqPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("air_quality_notification_prefs" as never)
        .select("*")
        .order("location");
      if (cancelled) return;
      if (error) {
        toast.error("Kunne ikke laste luftkvalitet-innstillinger");
        setLoading(false);
        return;
      }
      setPrefs((data ?? []) as unknown as AqPref[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (id: string, patch: Partial<AqPref>) => {
    setSaving(id);
    const prev = prefs;
    setPrefs((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase
      .from("air_quality_notification_prefs" as never)
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
        <Loader2 className="h-4 w-4 animate-spin" /> Laster luftkvalitet-varsler …
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <Wind className="h-3.5 w-3.5" /> Push-varsler om luftforurensning
        </p>
        <p>
          Sjekkes hver time fra Open-Meteo. Når en metrikk passerer terskelen sendes
          ett varsel til valgt mottaker — deretter holdes det stille til
          nedkjølings-tiden er ute, så du ikke får spam.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {prefs.map((p) => (
          <div key={p.id} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
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

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Nedkjøling</span>
              <Select
                value={String(p.cooldown_minutes ?? 180)}
                disabled={!p.enabled || saving === p.id}
                onValueChange={(v) => update(p.id, { cooldown_minutes: Number(v) })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[60, 120, 180, 360, 720, 1440].map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m >= 1440 ? "1 dag" : m >= 60 ? `${m / 60} t` : `${m} min`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-border/40">
              {METRICS.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <Switch
                    checked={Boolean(p[m.enabledField])}
                    disabled={!p.enabled || saving === p.id}
                    onCheckedChange={(v) =>
                      update(p.id, { [m.enabledField]: v } as Partial<AqPref>)
                    }
                  />
                  <span className="text-xs w-28 shrink-0" title={m.hint}>
                    <span className="mr-1">{m.emoji}</span>
                    {m.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">≥</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={m.key === "aqi" ? 5 : 1}
                    min={0}
                    value={String(p[m.thresholdField] ?? "")}
                    disabled={!p.enabled || !p[m.enabledField] || saving === p.id}
                    onChange={(e) =>
                      setPrefs((prev) =>
                        prev.map((x) =>
                          x.id === p.id
                            ? { ...x, [m.thresholdField]: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                    onBlur={(e) =>
                      update(p.id, {
                        [m.thresholdField]: Number(e.target.value),
                      } as Partial<AqPref>)
                    }
                    className="h-7 text-xs w-16 tabular-nums"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0 w-12">
                    {m.unit}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px] ml-auto"
                    disabled={!p.enabled || saving === p.id}
                    onClick={async () => {
                      setSaving(p.id);
                      try {
                        const res = await sendAirQualityTestPush({
                          data: { prefId: p.id, metric: m.key },
                        });
                        if (res.sent > 0) {
                          toast.success(`Test sendt (${m.label}) → ${res.recipient}`);
                        } else {
                          toast.error(`Ingen abonnenter for ${res.recipient}.`);
                        }
                      } catch (e) {
                        toast.error("Test feilet: " + (e as Error).message);
                      } finally {
                        setSaving(null);
                      }
                    }}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    Test
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
