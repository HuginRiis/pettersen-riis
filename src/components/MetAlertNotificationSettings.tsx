import { useEffect, useState } from "react";
import { Loader2, Plus, Send, Trash2, Pencil, Check, X, AlertTriangle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sendMetAlertTestPush, getMetAlertEventTypes, getActiveMetAlerts } from "@/server/met-alert-push.functions";

type ActiveAlert = {
  id: string;
  event: string;
  label: string;
  color: string | null;
  area: string | null;
  countyNames: string[];
  description: string | null;
  start: string | null;
  end: string | null;
};

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

const SECTOR_OPTIONS: { label: string; counties: string[] }[] = [
  { label: "Sør-Øst Norge", counties: ["Oslo", "Akershus", "Østfold", "Buskerud", "Vestfold", "Telemark", "Vestfold og Telemark", "Innlandet", "Agder", "Viken"] },
  { label: "Hele landet", counties: [] },
  { label: "Oslo", counties: ["Oslo"] },
  { label: "Telemark", counties: ["Telemark", "Vestfold og Telemark"] },
  { label: "Agder", counties: ["Agder"] },
  { label: "Innlandet", counties: ["Innlandet"] },
];

const COLOR_OPTIONS = [
  { value: "Yellow", label: "Gult nivå", dot: "bg-yellow-400 border-yellow-400" },
  { value: "Orange", label: "Oransje nivå", dot: "bg-orange-500 border-orange-500" },
  { value: "Red", label: "Rødt nivå", dot: "bg-red-500 border-red-500" },
];

type Pref = {
  id: string;
  recipient: string;
  counties: string[];
  event_types: string[];
  min_color: string;
  colors: string[];
  enabled: boolean;
};

function sectorLabelFromCounties(counties: string[]): string {
  for (const s of SECTOR_OPTIONS) {
    if (s.counties.length === counties.length && s.counties.every((c) => counties.includes(c))) return s.label;
  }
  return counties.length === 0 ? "Hele landet" : counties.join(", ");
}

export function MetAlertNotificationSettings() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [eventTypes, setEventTypes] = useState<{ event: string; label: string }[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);

  const load = async () => {
    const { data, error } = await supabase
      .from("met_alert_notification_prefs" as never)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast.error("Kunne ikke laste regler");
    else setPrefs((data ?? []) as unknown as Pref[]);
    setLoading(false);
    try {
      const [ev, active] = await Promise.all([getMetAlertEventTypes(), getActiveMetAlerts()]);
      setEventTypes(ev);
      setActiveAlerts(active as ActiveAlert[]);
    } catch {
      // stille
    }
  };

  useEffect(() => { void load(); }, []);

  const update = async (id: string, patch: Partial<Pref>) => {
    setSaving(id);
    const prev = prefs;
    setPrefs((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase
      .from("met_alert_notification_prefs" as never)
      .update(patch as never)
      .eq("id", id);
    setSaving(null);
    if (error) { setPrefs(prev); toast.error("Kunne ikke lagre"); }
    else void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Slett denne farevarsel-regelen?")) return;
    const { error } = await supabase.from("met_alert_notification_prefs" as never).delete().eq("id", id);
    if (error) toast.error("Kunne ikke slette");
    else { toast.success("Slettet"); void load(); }
  };

  const create = async (data: { recipient: string; counties: string[]; event_types: string[]; colors: string[] }) => {
    const min_color = data.colors.includes("Yellow") ? "Yellow" : data.colors.includes("Orange") ? "Orange" : "Red";
    const { error } = await supabase.from("met_alert_notification_prefs" as never).insert({
      ...data, min_color, enabled: true,
    } as never);
    if (error) { toast.error("Kunne ikke opprette: " + error.message); return; }
    toast.success("Regel opprettet");
    setShowNew(false);
    void load();
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laster …</div>;
  }

  return (
    <div className="space-y-3">
      <ActiveAlertsList alerts={activeAlerts} />
      {prefs.map((p) => (
        <PrefCard
          key={p.id}
          pref={p}
          saving={saving === p.id}
          eventTypes={eventTypes}
          onToggle={(v) => update(p.id, { enabled: v })}
          onSave={(patch) => update(p.id, patch)}
          onDelete={() => remove(p.id)}
          onTest={async () => {
            setSaving(p.id);
            try {
              const res = await sendMetAlertTestPush({ data: { prefId: p.id } });
              if (res.sent > 0) toast.success(`Test sendt → ${res.recipient}`);
              else toast.error(`Ingen abonnenter for ${res.recipient}.`);
            } catch (e) { toast.error("Test feilet: " + (e as Error).message); }
            finally { setSaving(null); }
          }}
        />
      ))}

      {showNew ? (
        <NewRuleForm
          eventTypes={eventTypes}
          onCancel={() => setShowNew(false)}
          onCreate={create}
        />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Ny regel
        </Button>
      )}
    </div>
  );
}

function CircleCheck({ on, color = "primary" }: { on: boolean; color?: "primary" | "yellow" | "orange" | "red" }) {
  const ring =
    color === "yellow" ? "border-yellow-400"
    : color === "orange" ? "border-orange-500"
    : color === "red" ? "border-red-500"
    : "border-primary";
  const fill =
    color === "yellow" ? "bg-yellow-400 text-black"
    : color === "orange" ? "bg-orange-500 text-black"
    : color === "red" ? "bg-red-500 text-white"
    : "bg-primary text-primary-foreground";
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 ${ring} ${on ? fill : "bg-transparent"} shrink-0 transition`}>
      {on && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
  );
}

function RuleEditor({
  recipient, setRecipient,
  counties, setCounties,
  colors, setColors,
  eventTypeSel, setEventTypeSel,
  eventTypes,
}: {
  recipient: string; setRecipient: (v: string) => void;
  counties: string[]; setCounties: (v: string[]) => void;
  colors: string[]; setColors: (v: string[]) => void;
  eventTypeSel: string[]; setEventTypeSel: (v: string[]) => void;
  eventTypes: { event: string; label: string }[];
}) {
  const currentSector = sectorLabelFromCounties(counties);
  const knownSector = SECTOR_OPTIONS.find((s) => s.label === currentSector);

  // Komplett liste over MET sine farevarsel-typer (CAP awareness types)
  const ALL_MET_TYPES = [
    { event: "wind", label: "Vind" },
    { event: "gale", label: "Kuling / storm til havs" },
    { event: "polarLow", label: "Polart lavtrykk" },
    { event: "rain", label: "Regn" },
    { event: "rainFlood", label: "Regnflom" },
    { event: "flood", label: "Flom" },
    { event: "stormSurge", label: "Stormflo" },
    { event: "snow", label: "Snø" },
    { event: "blowingSnow", label: "Snøfokk" },
    { event: "ice", label: "Is / glatte veier" },
    { event: "icing", label: "Ising på fartøy" },
    { event: "lightning", label: "Lyn / torden" },
    { event: "forestFire", label: "Skogbrann" },
    { event: "drought", label: "Tørke" },
    { event: "avalanches", label: "Snøskred" },
    { event: "landslide", label: "Jord- og flomskred" },
    { event: "drivingConditions", label: "Kjøreforhold" },
    { event: "fog", label: "Tåke" },
  ];
  const merged = new Map<string, string>();
  for (const t of ALL_MET_TYPES) merged.set(t.event, t.label);
  for (const t of eventTypes) merged.set(t.event, t.label || merged.get(t.event) || t.event);
  const types = Array.from(merged.entries()).map(([event, label]) => ({ event, label }));

  const toggle = <T,>(arr: T[], v: T): T[] => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Mottaker</p>
        <Select value={recipient} onValueChange={setRecipient}>
          <SelectTrigger className="h-9 text-sm rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WHO_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Sektor</p>
        <Select
          value={knownSector?.label ?? "custom"}
          onValueChange={(label) => {
            const s = SECTOR_OPTIONS.find((x) => x.label === label);
            if (s) setCounties(s.counties);
          }}
        >
          <SelectTrigger className="h-9 text-sm rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SECTOR_OPTIONS.map((s) => <SelectItem key={s.label} value={s.label}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Farenivå (skru av/på hver farge)</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {COLOR_OPTIONS.map((c) => {
            const on = colors.includes(c.value);
            const colorKey = c.value.toLowerCase() as "yellow" | "orange" | "red";
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setColors(toggle(colors, c.value))}
                className="flex items-center gap-2 text-sm"
              >
                <CircleCheck on={on} color={colorKey} />
                <span className="text-foreground">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">Typer farevarsel</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {types.map((t) => {
            const on = eventTypeSel.length === 0 || eventTypeSel.includes(t.event);
            return (
              <button
                key={t.event}
                type="button"
                onClick={() => {
                  // Hvis tom = "alle på". Første klikk: gjør om til eksplisitt liste minus denne.
                  if (eventTypeSel.length === 0) {
                    setEventTypeSel(types.map((x) => x.event).filter((e) => e !== t.event));
                  } else {
                    const next = toggle(eventTypeSel, t.event);
                    // Hvis alle blir på igjen → tøm (= alle)
                    if (next.length === types.length) setEventTypeSel([]);
                    else setEventTypeSel(next);
                  }
                }}
                className="flex items-center gap-2 text-sm text-left"
              >
                <CircleCheck on={on} />
                <span className="text-foreground">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NewRuleForm({
  eventTypes, onCancel, onCreate,
}: {
  eventTypes: { event: string; label: string }[];
  onCancel: () => void;
  onCreate: (data: { recipient: string; counties: string[]; event_types: string[]; colors: string[] }) => void;
}) {
  const [recipient, setRecipient] = useState<string>("Alle");
  const [counties, setCounties] = useState<string[]>(SECTOR_OPTIONS[0].counties);
  const [eventTypeSel, setEventTypeSel] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>(["Orange", "Red"]);

  return (
    <div className="rounded-2xl border border-orange-500/40 bg-card/60 p-4 space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-orange-400 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Ny vær-farevarsel-regel
      </h3>
      <RuleEditor
        recipient={recipient} setRecipient={setRecipient}
        counties={counties} setCounties={setCounties}
        colors={colors} setColors={setColors}
        eventTypeSel={eventTypeSel} setEventTypeSel={setEventTypeSel}
        eventTypes={eventTypes}
      />
      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={colors.length === 0} onClick={() => onCreate({ recipient, counties, event_types: eventTypeSel, colors })}>Lagre</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Avbryt</Button>
      </div>
    </div>
  );
}

function PrefCard({
  pref: p, saving, eventTypes, onToggle, onSave, onDelete, onTest,
}: {
  pref: Pref;
  saving: boolean;
  eventTypes: { event: string; label: string }[];
  onToggle: (v: boolean) => void;
  onSave: (patch: Partial<Pref>) => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [recipient, setRecipient] = useState(p.recipient);
  const [counties, setCounties] = useState<string[]>(p.counties ?? []);
  const [eventTypeSel, setEventTypeSel] = useState<string[]>(p.event_types ?? []);
  const initialColors = p.colors && p.colors.length > 0
    ? p.colors
    : (p.min_color === "Yellow" ? ["Yellow","Orange","Red"] : p.min_color === "Orange" ? ["Orange","Red"] : ["Red"]);
  const [colors, setColors] = useState<string[]>(initialColors);

  useEffect(() => {
    if (!editing) {
      setRecipient(p.recipient);
      setCounties(p.counties ?? []);
      setEventTypeSel(p.event_types ?? []);
      const next = p.colors && p.colors.length > 0
        ? p.colors
        : (p.min_color === "Yellow" ? ["Yellow","Orange","Red"] : p.min_color === "Orange" ? ["Orange","Red"] : ["Red"]);
      setColors(next);
    }
  }, [p, editing]);

  const colorLabels = colors.length === 0
    ? "ingen"
    : COLOR_OPTIONS.filter(c => colors.includes(c.value)).map(c => c.label).join(", ");

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-card/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-orange-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Vær farevarsel — av/på
        </h3>
        <Switch checked={p.enabled} disabled={saving} onCheckedChange={onToggle} />
      </div>

      <div>
        <p className="text-sm font-medium">Push-varsel ved farevarsel fra MET</p>
        <p className="text-xs text-muted-foreground">
          Gjelder <span className="text-foreground font-semibold">{p.recipient}</span>. Velg sektor, farger og typer under.
        </p>
      </div>

      {editing ? (
        <RuleEditor
          recipient={recipient} setRecipient={setRecipient}
          counties={counties} setCounties={setCounties}
          colors={colors} setColors={setColors}
          eventTypeSel={eventTypeSel} setEventTypeSel={setEventTypeSel}
          eventTypes={eventTypes}
        />
      ) : (
        <div className="text-xs text-muted-foreground space-y-1">
          <div>Sektor: <span className="text-foreground">{sectorLabelFromCounties(p.counties ?? [])}</span></div>
          <div>Farger: <span className="text-foreground">{colorLabels}</span></div>
          <div>Typer: <span className="text-foreground">{p.event_types?.length ? p.event_types.map((e) => eventTypes.find((x) => x.event === e)?.label ?? e).join(", ") : "alle"}</span></div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {!editing ? (
          <>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={saving} onClick={onTest}>
              <Send className="h-3 w-3 mr-1" /> Test
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Endre
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3 mr-1" /> Slett
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" className="h-7 px-2 text-xs" disabled={saving || colors.length === 0}
              onClick={() => {
                const min_color = colors.includes("Yellow") ? "Yellow" : colors.includes("Orange") ? "Orange" : "Red";
                onSave({ recipient, counties, event_types: eventTypeSel, colors, min_color });
                setEditing(false);
              }}>
              <Check className="h-3 w-3 mr-1" /> Lagre
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
              <X className="h-3 w-3 mr-1" /> Avbryt
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ActiveAlertsList({ alerts }: { alerts: ActiveAlert[] }) {
  const [open, setOpen] = useState(true);
  if (!alerts || alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5" /> Ingen aktive farevarsler akkurat nå.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-orange-500/40 bg-card/50 p-3 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-sm font-bold uppercase tracking-wider text-orange-400"
      >
        <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Aktive farevarsler ({alerts.length})</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="space-y-1.5">
          {alerts.map((a) => {
            const dot =
              a.color === "Red" ? "bg-red-500"
              : a.color === "Orange" ? "bg-orange-500"
              : a.color === "Yellow" ? "bg-yellow-400"
              : "bg-muted";
            return (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-1 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground font-medium truncate">{a.label}</div>
                  <div className="text-muted-foreground truncate">
                    {a.area || a.countyNames.join(", ") || "—"}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
