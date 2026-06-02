import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Plus, Send, Trash2, CloudRain, Pencil, Check, X } from "lucide-react";
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
import { sendWeatherTestPush, getWeatherForecast } from "@/lib/weather-push.functions";

type Kind = "rain" | "wind" | "snow" | "frost" | "thunder" | "heat" | "fog";

const KIND_META: Record<Kind, { label: string; emoji: string; unit: string; defaultThreshold: number; symbolBased: boolean }> = {
  rain:    { label: "Regn",    emoji: "🌧",  unit: "mm/t", defaultThreshold: 1,  symbolBased: false },
  wind:    { label: "Vind",    emoji: "💨", unit: "m/s",  defaultThreshold: 10, symbolBased: false },
  snow:    { label: "Snø",     emoji: "❄️", unit: "mm/t", defaultThreshold: 1,  symbolBased: false },
  frost:   { label: "Frost",   emoji: "🥶", unit: "°C",   defaultThreshold: 0,  symbolBased: false },
  heat:    { label: "Hete",    emoji: "🥵", unit: "°C",   defaultThreshold: 25, symbolBased: false },
  thunder: { label: "Torden",  emoji: "⛈",  unit: "",     defaultThreshold: 0,  symbolBased: true  },
  fog:     { label: "Tåke",    emoji: "🌫", unit: "",     defaultThreshold: 0,  symbolBased: true  },
};

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

const PRESET_LOCATIONS = [
  { location: "borgen", label: "Borgen · Tollnes", lat: 59.1789, lon: 9.5732 },
  { location: "hytta",  label: "Hytta · Numedal",  lat: 59.8733, lon: 9.4297 },
] as const;

type Pref = {
  id: string;
  location: string;
  label: string;
  lat: number;
  lon: number;
  kind: Kind;
  threshold: number | null;
  recipient: string;
  days_ahead: number;
  notify_hour: number;
  notify_minute: number;
  enabled: boolean;
};

type Forecast = {
  id: string;
  label: string;
  kind: Kind;
  enabled: boolean;
  nextAt: string | null;
  value: number | null;
  threshold: number;
  reason: string;
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function formatOsloDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
}

export function WeatherNotificationSettings() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // Skjema for ny regel
  const [newLoc, setNewLoc] = useState<string>(PRESET_LOCATIONS[0].location);
  const [newKind, setNewKind] = useState<Kind>("rain");
  const [newThreshold, setNewThreshold] = useState<string>("1");
  const [newRecipient, setNewRecipient] = useState<string>("Alle");
  const [newDays, setNewDays] = useState<number>(1);
  const [newHour, setNewHour] = useState<number>(7);
  const [newMinute, setNewMinute] = useState<number>(0);

  const loadAll = async () => {
    const { data, error } = await supabase
      .from("weather_notification_prefs" as never)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Kunne ikke laste vær-varsler");
      setLoading(false);
      return;
    }
    setPrefs((data ?? []) as unknown as Pref[]);
    setLoading(false);
    try {
      const f = await getWeatherForecast();
      setForecasts(f as Forecast[]);
    } catch {
      // stille
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = async (id: string, patch: Partial<Pref>) => {
    setSaving(id);
    const prev = prefs;
    setPrefs((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase
      .from("weather_notification_prefs" as never)
      .update(patch as never)
      .eq("id", id);
    setSaving(null);
    if (error) {
      setPrefs(prev);
      toast.error("Kunne ikke lagre");
    } else {
      loadAll();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Slett denne vær-regelen?")) return;
    const { error } = await supabase
      .from("weather_notification_prefs" as never)
      .delete()
      .eq("id", id);
    if (error) toast.error("Kunne ikke slette");
    else {
      toast.success("Slettet");
      loadAll();
    }
  };

  const create = async () => {
    const loc = PRESET_LOCATIONS.find((l) => l.location === newLoc);
    if (!loc) return;
    const meta = KIND_META[newKind];
    const threshold = meta.symbolBased ? null : Number(newThreshold);
    if (!meta.symbolBased && (!Number.isFinite(threshold) || threshold == null)) {
      toast.error("Ugyldig terskel");
      return;
    }
    const { error } = await supabase.from("weather_notification_prefs" as never).insert({
      location: loc.location,
      label: loc.label,
      lat: loc.lat,
      lon: loc.lon,
      kind: newKind,
      threshold,
      recipient: newRecipient,
      days_ahead: newDays,
      notify_hour: newHour,
      notify_minute: newMinute,
      enabled: true,
    } as never);
    if (error) {
      toast.error("Kunne ikke opprette: " + error.message);
      return;
    }
    toast.success("Vær-regel opprettet");
    setShowNew(false);
    setNewThreshold(String(KIND_META[newKind].defaultThreshold));
    loadAll();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laster vær-varsler …
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <CloudRain className="h-3.5 w-3.5" /> Vær-push (MET.no)
        </p>
        <p>
          Bygg dine egne regler: regn, vind, snø, frost, torden, hete eller tåke for Borgen
          eller Hytta. «Dager før» bestemmer hvor lenge før hendelsen varselet sendes –
          f.eks. regn i morgen kl 13:00 + «1 dag før» = varsel i dag på valgt klokkeslett.
          Maks ett varsel per regel per dag.
        </p>
      </div>

      <div className="space-y-3">
        {prefs.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            Ingen vær-regler ennå. Trykk «Ny regel» for å lage den første.
          </div>
        )}
        {prefs.map((p) => {
          const meta = KIND_META[p.kind];
          const f = forecasts.find((x) => x.id === p.id);
          return (
            <PrefCard
              key={p.id}
              pref={p}
              meta={meta}
              forecast={f}
              saving={saving === p.id}
              onToggleEnabled={(v) => update(p.id, { enabled: v })}
              onSave={(patch) => update(p.id, patch)}
              onDelete={() => remove(p.id)}
              onTest={async () => {
                setSaving(p.id);
                try {
                  const res = await sendWeatherTestPush({ data: { prefId: p.id } });
                  if (res.sent > 0) toast.success(`Test sendt → ${res.recipient}`);
                  else toast.error(`Ingen abonnenter for ${res.recipient}. Abonner i Innstillinger → Push.`);
                } catch (e) {
                  toast.error("Test feilet: " + (e as Error).message);
                } finally {
                  setSaving(null);
                }
              }}
            />
          );
        })}
      </div>

      {!showNew ? (
        <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Ny regel
        </Button>
      ) : (
        <div className="rounded-lg border border-primary/40 bg-card/60 p-3 space-y-3">
          <div className="text-sm font-semibold">Ny vær-regel</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0 w-20">Lokasjon</span>
              <Select value={newLoc} onValueChange={setNewLoc}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESET_LOCATIONS.map((l) => <SelectItem key={l.location} value={l.location}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0 w-20">Værtype</span>
              <Select value={newKind} onValueChange={(v) => {
                const k = v as Kind;
                setNewKind(k);
                setNewThreshold(String(KIND_META[k].defaultThreshold));
              }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_META) as Kind[]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_META[k].emoji} {KIND_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!KIND_META[newKind].symbolBased && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0 w-20">Terskel</span>
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 text-sm"
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">{KIND_META[newKind].unit}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0 w-20">Mottaker</span>
              <Select value={newRecipient} onValueChange={setNewRecipient}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WHO_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0 w-20">Dager før</span>
              <Select value={String(newDays)} onValueChange={(v) => setNewDays(Number(v))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d === 0 ? "Samme dag" : d === 1 ? "1 dag før" : `${d} dager før`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0 w-20">Klokkeslett</span>
              <Input
                type="time"
                className="h-8 text-sm"
                value={`${pad(newHour)}:${pad(newMinute)}`}
                onChange={(e) => {
                  const [hh, mm] = e.target.value.split(":").map(Number);
                  if (Number.isFinite(hh) && Number.isFinite(mm)) {
                    setNewHour(hh);
                    setNewMinute(mm);
                  }
                }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={create}>Lagre regel</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Avbryt</Button>
          </div>
        </div>
      )}
    </div>
  );
}

type PrefCardProps = {
  pref: Pref;
  meta: typeof KIND_META[Kind];
  forecast: Forecast | undefined;
  saving: boolean;
  onToggleEnabled: (v: boolean) => void;
  onSave: (patch: Partial<Pref>) => void;
  onDelete: () => void;
  onTest: () => void;
};

function PrefCard({ pref: p, meta, forecast: f, saving, onToggleEnabled, onSave, onDelete, onTest }: PrefCardProps) {
  const [editing, setEditing] = useState(false);
  const [recipient, setRecipient] = useState(p.recipient);
  const [daysAhead, setDaysAhead] = useState(p.days_ahead);
  const [hour, setHour] = useState(p.notify_hour);
  const [minute, setMinute] = useState(p.notify_minute);
  const [threshold, setThreshold] = useState<string>(String(p.threshold ?? meta.defaultThreshold));

  useEffect(() => {
    if (!editing) {
      setRecipient(p.recipient);
      setDaysAhead(p.days_ahead);
      setHour(p.notify_hour);
      setMinute(p.notify_minute);
      setThreshold(String(p.threshold ?? meta.defaultThreshold));
    }
  }, [p, editing, meta.defaultThreshold]);

  const save = () => {
    const patch: Partial<Pref> = {
      recipient,
      days_ahead: daysAhead,
      notify_hour: hour,
      notify_minute: minute,
    };
    if (!meta.symbolBased) {
      const t = Number(threshold);
      if (!Number.isFinite(t)) {
        toast.error("Ugyldig terskel");
        return;
      }
      patch.threshold = t;
    }
    onSave(patch);
    setEditing(false);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {p.enabled ? (
            <Bell className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-base">{meta.emoji}</span>
          <span className="font-medium truncate">
            {p.label} · {meta.label}
            {!meta.symbolBased && p.threshold != null && (
              <span className="text-muted-foreground font-normal"> ≥ {p.threshold} {meta.unit}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Switch checked={p.enabled} disabled={saving} onCheckedChange={onToggleEnabled} />
          {!editing ? (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={saving}>
                <Check className="h-3.5 w-3.5 text-primary" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {!editing && p.enabled && (
        <div className="rounded-md bg-muted/30 px-2.5 py-1.5 text-[11px] leading-snug">
          {f && f.nextAt ? (
            <>
              <div className="text-foreground">
                Neste treff: <span className="font-semibold">{formatOsloDateTime(f.nextAt)}</span>
                {f.value != null && <span className="text-muted-foreground"> ({f.value.toFixed(1)} {meta.unit})</span>}
              </div>
              <div className="text-muted-foreground">
                Sender kl <span className="font-semibold">{pad(p.notify_hour)}:{pad(p.notify_minute)}</span> til {p.recipient}
              </div>
            </>
          ) : (
            <span className="text-muted-foreground">{f?.reason || "Ingen treff i prognosen"}</span>
          )}
        </div>
      )}

      {!editing ? (
        <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1">
          <div>Mottaker: <span className="text-foreground">{p.recipient}</span></div>
          <div>Dager før: <span className="text-foreground">{p.days_ahead === 0 ? "Samme dag" : p.days_ahead}</span></div>
          <div>Klokkeslett: <span className="text-foreground">{pad(p.notify_hour)}:{pad(p.notify_minute)}</span></div>
          {!meta.symbolBased && (
            <div>Terskel: <span className="text-foreground">{p.threshold ?? meta.defaultThreshold} {meta.unit}</span></div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-20">Mottaker</span>
            <Select value={recipient} onValueChange={setRecipient}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WHO_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-20">Dager før</span>
            <Select value={String(daysAhead)} onValueChange={(v) => setDaysAhead(Number(v))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d === 0 ? "Samme dag" : d === 1 ? "1 dag før" : `${d} dager før`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0 w-20">Klokkeslett</span>
            <Input
              type="time"
              className="h-8 text-sm"
              value={`${pad(hour)}:${pad(minute)}`}
              onChange={(e) => {
                const [hh, mm] = e.target.value.split(":").map(Number);
                if (Number.isFinite(hh) && Number.isFinite(mm)) {
                  setHour(hh);
                  setMinute(mm);
                }
              }}
            />
          </div>
          {!meta.symbolBased && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0 w-20">Terskel</span>
              <Input
                type="number"
                step="0.5"
                className="h-8 text-sm"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">{meta.unit}</span>
            </div>
          )}
        </div>
      )}

      {!editing && (
        <div className="pt-1">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={saving} onClick={onTest}>
            <Send className="h-3 w-3 mr-1" /> Send test-push nå
          </Button>
        </div>
      )}
    </div>
  );
}
