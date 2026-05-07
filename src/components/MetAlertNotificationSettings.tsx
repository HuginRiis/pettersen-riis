import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Plus, Send, Trash2, Pencil, Check, X, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sendMetAlertTestPush, getMetAlertEventTypes } from "@/server/met-alert-push.functions";

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

const COUNTY_OPTIONS = [
  "Oslo", "Akershus", "Østfold", "Buskerud", "Vestfold", "Telemark",
  "Vestfold og Telemark", "Innlandet", "Agder", "Viken",
];

const COLOR_OPTIONS = [
  { value: "Yellow", label: "🟡 Gul (lav)" },
  { value: "Orange", label: "🟠 Oransje (moderat)" },
  { value: "Red", label: "🔴 Rød (alvorlig)" },
];

type Pref = {
  id: string;
  recipient: string;
  counties: string[];
  event_types: string[];
  min_color: string;
  enabled: boolean;
};

export function MetAlertNotificationSettings() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [eventTypes, setEventTypes] = useState<{ event: string; label: string }[]>([]);

  // skjema for ny regel
  const [recipient, setRecipient] = useState<string>("Alle");
  const [counties, setCounties] = useState<string[]>([]);
  const [eventTypeSel, setEventTypeSel] = useState<string[]>([]);
  const [minColor, setMinColor] = useState<string>("Yellow");

  const load = async () => {
    const { data, error } = await supabase
      .from("met_alert_notification_prefs" as never)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast.error("Kunne ikke laste regler");
    else setPrefs((data ?? []) as unknown as Pref[]);
    setLoading(false);
    try {
      const ev = await getMetAlertEventTypes();
      setEventTypes(ev);
    } catch {
      // stille
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleArr = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const update = async (id: string, patch: Partial<Pref>) => {
    setSaving(id);
    const prev = prefs;
    setPrefs((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase
      .from("met_alert_notification_prefs" as never)
      .update(patch as never)
      .eq("id", id);
    setSaving(null);
    if (error) {
      setPrefs(prev);
      toast.error("Kunne ikke lagre");
    } else {
      void load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Slett denne farevarsel-regelen?")) return;
    const { error } = await supabase
      .from("met_alert_notification_prefs" as never)
      .delete()
      .eq("id", id);
    if (error) toast.error("Kunne ikke slette");
    else {
      toast.success("Slettet");
      void load();
    }
  };

  const create = async () => {
    const { error } = await supabase.from("met_alert_notification_prefs" as never).insert({
      recipient,
      counties,
      event_types: eventTypeSel,
      min_color: minColor,
      enabled: true,
    } as never);
    if (error) {
      toast.error("Kunne ikke opprette: " + error.message);
      return;
    }
    toast.success("Regel opprettet");
    setShowNew(false);
    setCounties([]);
    setEventTypeSel([]);
    setMinColor("Yellow");
    setRecipient("Alle");
    void load();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laster regler …
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" /> Push-varsler for farevarsler (Met.no)
        </p>
        <p>
          Lag regler for hvem som skal få push når Met.no publiserer nye farevarsler.
          Velg mottaker, ett eller flere fylker, type vær og minste farenivå
          (gul/oransje/rød). Tomt fylke- eller type-valg betyr «alle».
        </p>
      </div>

      <div className="space-y-3">
        {prefs.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            Ingen regler ennå.
          </div>
        )}
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
              } catch (e) {
                toast.error("Test feilet: " + (e as Error).message);
              } finally {
                setSaving(null);
              }
            }}
          />
        ))}
      </div>

      {!showNew ? (
        <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Ny regel
        </Button>
      ) : (
        <div className="rounded-lg border border-primary/40 bg-card/60 p-3 space-y-3">
          <div className="text-sm font-semibold">Ny farevarsel-regel</div>

          <Field label="Mottaker">
            <Select value={recipient} onValueChange={setRecipient}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WHO_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Minste farenivå">
            <Select value={minColor} onValueChange={setMinColor}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <ChipSelect
            label="Fylker (tomt = alle)"
            options={COUNTY_OPTIONS}
            selected={counties}
            onToggle={(v) => setCounties((s) => toggleArr(s, v))}
          />

          <ChipSelect
            label="Varseltyper (tomt = alle)"
            options={eventTypes.length ? eventTypes.map((e) => e.event) : []}
            renderLabel={(v) => eventTypes.find((e) => e.event === v)?.label ?? v}
            selected={eventTypeSel}
            onToggle={(v) => setEventTypeSel((s) => toggleArr(s, v))}
            empty="Ingen aktive varseltyper akkurat nå — la stå tomt for å gjelde alle."
          />

          <div className="flex gap-2">
            <Button size="sm" onClick={create}>Lagre regel</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Avbryt</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground shrink-0 w-32">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ChipSelect({
  label, options, selected, onToggle, renderLabel, empty,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  renderLabel?: (v: string) => string;
  empty?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      {options.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{empty ?? "Ingen valg."}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((v) => {
            const on = selected.includes(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => onToggle(v)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-foreground/80 hover:border-primary/60"
                }`}
              >
                {renderLabel ? renderLabel(v) : v}
              </button>
            );
          })}
        </div>
      )}
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
  const [minColor, setMinColor] = useState(p.min_color);

  useEffect(() => {
    if (!editing) {
      setRecipient(p.recipient);
      setCounties(p.counties ?? []);
      setEventTypeSel(p.event_types ?? []);
      setMinColor(p.min_color);
    }
  }, [p, editing]);

  const toggleArr = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const colorLabel = COLOR_OPTIONS.find((c) => c.value === p.min_color)?.label ?? p.min_color;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {p.enabled ? <Bell className="h-4 w-4 text-primary shrink-0" /> : <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="font-medium truncate">
            {p.recipient} · {colorLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Switch checked={p.enabled} disabled={saving} onCheckedChange={onToggle} />
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
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { onSave({ recipient, counties, event_types: eventTypeSel, min_color: minColor }); setEditing(false); }} disabled={saving}>
                <Check className="h-3.5 w-3.5 text-primary" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {!editing ? (
        <div className="text-xs text-muted-foreground space-y-1">
          <div>Fylker: <span className="text-foreground">{p.counties?.length ? p.counties.join(", ") : "alle"}</span></div>
          <div>Typer: <span className="text-foreground">{p.event_types?.length ? p.event_types.map((e) => eventTypes.find((x) => x.event === e)?.label ?? e).join(", ") : "alle"}</span></div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Mottaker">
            <Select value={recipient} onValueChange={setRecipient}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WHO_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Minste farenivå">
            <Select value={minColor} onValueChange={setMinColor}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <ChipSelect
            label="Fylker (tomt = alle)"
            options={COUNTY_OPTIONS}
            selected={counties}
            onToggle={(v) => setCounties((s) => toggleArr(s, v))}
          />
          <ChipSelect
            label="Varseltyper (tomt = alle)"
            options={eventTypes.map((e) => e.event)}
            renderLabel={(v) => eventTypes.find((e) => e.event === v)?.label ?? v}
            selected={eventTypeSel}
            onToggle={(v) => setEventTypeSel((s) => toggleArr(s, v))}
            empty="Ingen aktive varseltyper — la stå tomt for å gjelde alle."
          />
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
