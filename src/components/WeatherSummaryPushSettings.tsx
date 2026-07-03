import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Plus, Send, Sunrise, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useCurrentWho } from "@/hooks/use-current-who";
import { sendWeatherSummaryTestPush } from "@/lib/weather-summary-push.functions";

const WHO_OPTIONS = ["Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

type Target = "today" | "tomorrow";

type Pref = {
  id: string;
  who: string;
  enabled: boolean;
  slot1_enabled: boolean; slot1_hour: number; slot1_minute: number; slot1_target: Target;
  slot2_enabled: boolean; slot2_hour: number; slot2_minute: number; slot2_target: Target;
  include_symbol: boolean;
  include_temp_range: boolean;
  include_precip: boolean;
  include_wind: boolean;
  include_sunrise_sunset: boolean;
  include_uv: boolean;
  include_summary: boolean;
  last_sent_slot1_date: string | null;
  last_sent_slot2_date: string | null;
};

const CONTENT_TOGGLES: { key: keyof Pref; label: string; emoji: string }[] = [
  { key: "include_symbol", label: "Værsymbol", emoji: "🌤" },
  { key: "include_temp_range", label: "Temperatur (min–maks)", emoji: "🌡️" },
  { key: "include_precip", label: "Nedbør (sum)", emoji: "💧" },
  { key: "include_wind", label: "Vind (maks)", emoji: "💨" },
  { key: "include_sunrise_sunset", label: "Sol opp/ned", emoji: "☀️" },
  { key: "include_uv", label: "UV-indeks", emoji: "🧴" },
  { key: "include_summary", label: "Værsammendrag (skyet, klart …)", emoji: "📝" },
];

function pad(n: number) { return n.toString().padStart(2, "0"); }

export function WeatherSummaryPushSettings() {
  const currentWho = useCurrentWho();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newWho, setNewWho] = useState<string>(currentWho !== "anon" ? currentWho : "Arne");

  useEffect(() => {
    if (currentWho && currentWho !== "anon") setNewWho(currentWho);
  }, [currentWho]);

  const load = async () => {
    const { data, error } = await supabase
      .from("weather_summary_push_prefs" as never)
      .select("*")
      .order("who");
    if (error) { toast.error("Kunne ikke laste"); setLoading(false); return; }
    setPrefs((data ?? []) as unknown as Pref[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const update = async (id: string, patch: Partial<Pref>) => {
    setSaving(id);
    const prev = prefs;
    setPrefs((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase
      .from("weather_summary_push_prefs" as never)
      .update(patch as never)
      .eq("id", id);
    setSaving(null);
    if (error) { setPrefs(prev); toast.error("Kunne ikke lagre"); }
  };

  const remove = async (id: string) => {
    if (!confirm("Slett denne værmeldings-innstillingen?")) return;
    const { error } = await supabase.from("weather_summary_push_prefs" as never).delete().eq("id", id);
    if (error) toast.error("Kunne ikke slette");
    else { toast.success("Slettet"); load(); }
  };

  const create = async () => {
    const { error } = await supabase.from("weather_summary_push_prefs" as never).insert({ who: newWho } as never);
    if (error) { toast.error("Kunne ikke opprette: " + error.message); return; }
    toast.success("Opprettet");
    setShowNew(false);
    load();
  };

  const existingWho = new Set(prefs.map((p) => p.who));
  const availableWho = WHO_OPTIONS.filter((w) => !existingWho.has(w));

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Laster …
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <Sunrise className="h-3.5 w-3.5" /> Daglig værmelding
        </p>
        <p>
          Én rad per person. To tidsluker per dag — velg klokkeslett og om det er
          <b> dagens</b> eller <b>morgendagens</b> vær som skal sendes. Lokasjonen
          hentes automatisk fra der brukeren sist var på værsiden (ellers Borgen).
          Skru på/av hva som skal med i varselet.
        </p>
      </div>

      {prefs.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          Ingen brukere har daglig værmelding ennå. Trykk «Legg til bruker».
        </div>
      )}

      <div className="space-y-3">
        {prefs.map((p) => (
          <PrefCard
            key={p.id}
            pref={p}
            saving={saving === p.id}
            onUpdate={(patch) => update(p.id, patch)}
            onDelete={() => remove(p.id)}
          />
        ))}
      </div>

      {!showNew ? (
        <Button size="sm" variant="outline" disabled={availableWho.length === 0} onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Legg til bruker
        </Button>
      ) : (
        <div className="rounded-lg border border-primary/40 bg-card/60 p-3 space-y-3">
          <div className="text-sm font-semibold">Ny værmelding-innstilling</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-20">Bruker</span>
            <Select value={newWho} onValueChange={setNewWho}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableWho.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={create}>Opprett</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Avbryt</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotEditor({
  slot, pref, onUpdate, disabled,
}: {
  slot: 1 | 2;
  pref: Pref;
  onUpdate: (patch: Partial<Pref>) => void;
  disabled: boolean;
}) {
  const enabledKey = slot === 1 ? "slot1_enabled" : "slot2_enabled";
  const hourKey = slot === 1 ? "slot1_hour" : "slot2_hour";
  const minKey = slot === 1 ? "slot1_minute" : "slot2_minute";
  const targetKey = slot === 1 ? "slot1_target" : "slot2_target";
  const enabled = Boolean(pref[enabledKey]);
  const hour = pref[hourKey] as number;
  const minute = pref[minKey] as number;
  const target = pref[targetKey] as Target;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Tidsluke {slot}</span>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(v) => onUpdate({ [enabledKey]: v } as Partial<Pref>)}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground shrink-0 w-14">Kl</span>
        <Input
          type="time"
          className="h-8 text-sm"
          value={`${pad(hour)}:${pad(minute)}`}
          disabled={!enabled || disabled}
          onChange={(e) => {
            const [hh, mm] = e.target.value.split(":").map(Number);
            if (Number.isFinite(hh) && Number.isFinite(mm)) {
              onUpdate({ [hourKey]: hh, [minKey]: mm } as Partial<Pref>);
            }
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground shrink-0 w-14">Vær for</span>
        <Select
          value={target}
          disabled={!enabled || disabled}
          onValueChange={(v) => onUpdate({ [targetKey]: v as Target } as Partial<Pref>)}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">I dag</SelectItem>
            <SelectItem value="tomorrow">I morgen</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function PrefCard({
  pref, saving, onUpdate, onDelete,
}: {
  pref: Pref;
  saving: boolean;
  onUpdate: (patch: Partial<Pref>) => void;
  onDelete: () => void;
}) {
  const test = async (slot: 1 | 2) => {
    try {
      const r = await sendWeatherSummaryTestPush({ data: { prefId: pref.id, slot } });
      if (r.sent > 0) toast.success(`Test sendt til ${r.recipient}`);
      else toast.error(`Ingen abonnenter for ${r.recipient}.`);
    } catch (e) {
      toast.error("Test feilet: " + (e as Error).message);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {pref.enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
          <span className="font-medium">{pref.who}</span>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={pref.enabled}
            disabled={saving}
            onCheckedChange={(v) => onUpdate({ enabled: v })}
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <SlotEditor slot={1} pref={pref} onUpdate={onUpdate} disabled={saving || !pref.enabled} />
        <SlotEditor slot={2} pref={pref} onUpdate={onUpdate} disabled={saving || !pref.enabled} />
      </div>

      <div className="space-y-1.5 pt-1 border-t border-border/40">
        <div className="text-[11px] text-muted-foreground mb-1">Innhold i varselet</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {CONTENT_TOGGLES.map((t) => (
            <label key={String(t.key)} className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch
                checked={Boolean(pref[t.key])}
                disabled={saving || !pref.enabled}
                onCheckedChange={(v) => onUpdate({ [t.key]: v } as Partial<Pref>)}
              />
              <span><span className="mr-1">{t.emoji}</span>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!pref.enabled || saving} onClick={() => test(1)}>
          <Send className="h-3 w-3 mr-1" /> Test tidsluke 1
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!pref.enabled || saving} onClick={() => test(2)}>
          <Send className="h-3 w-3 mr-1" /> Test tidsluke 2
        </Button>
      </div>
    </div>
  );
}
