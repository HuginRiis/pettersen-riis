import { useEffect, useState } from "react";
import { Bell, Loader2, Plus, Send, Trash2, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  listLightIdlePrefs,
  listLightIdleZones,
  upsertLightIdlePref,
  deleteLightIdlePref,
  testLightIdlePref,
  type LightIdlePref,
} from "@/server/light-idle-push.functions";

const RECIPIENTS = ["Alle", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

type Zone = { zoneId: string; zoneName: string; lights: number; motionSensors: number };

export function LightIdleNotificationSettings() {
  const [prefs, setPrefs] = useState<LightIdlePref[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Ny-regel-skjema
  const [newZone, setNewZone] = useState<string>("");
  const [newRecipient, setNewRecipient] = useState<string>("Alle");
  const [newLightsOn, setNewLightsOn] = useState(30);
  const [newNoMotion, setNewNoMotion] = useState(15);
  const [newCooldown, setNewCooldown] = useState(60);

  async function refresh() {
    try {
      const [p, z] = await Promise.all([listLightIdlePrefs(), listLightIdleZones()]);
      setPrefs(p);
      setZones(z);
    } catch (err) {
      console.error(err);
      toast.error("Kunne ikke laste varslingsregler");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd() {
    const zone = zones.find((z) => z.zoneId === newZone);
    if (!zone) {
      toast.error("Velg et rom");
      return;
    }
    setAdding(true);
    try {
      await upsertLightIdlePref({
        data: {
          homey_zone_id: zone.zoneId,
          zone_name: zone.zoneName,
          recipient: newRecipient,
          lights_on_minutes: newLightsOn,
          no_motion_minutes: newNoMotion,
          enabled: true,
          cooldown_minutes: newCooldown,
        },
      });
      toast.success(`Regel lagret for ${zone.zoneName}`);
      setNewZone("");
      setNewRecipient("Alle");
      setNewLightsOn(30);
      setNewNoMotion(15);
      setNewCooldown(60);
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error("Kunne ikke lagre regel");
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdate(p: LightIdlePref, patch: Partial<LightIdlePref>) {
    setSavingId(p.id);
    try {
      const merged = { ...p, ...patch };
      await upsertLightIdlePref({
        data: {
          id: merged.id,
          homey_zone_id: merged.homey_zone_id,
          zone_name: merged.zone_name,
          recipient: merged.recipient,
          lights_on_minutes: merged.lights_on_minutes,
          no_motion_minutes: merged.no_motion_minutes,
          enabled: merged.enabled,
          cooldown_minutes: merged.cooldown_minutes,
        },
      });
      setPrefs((cur) => cur.map((x) => (x.id === p.id ? merged : x)));
    } catch (err) {
      console.error(err);
      toast.error("Kunne ikke lagre");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Slette denne varslingsregelen?")) return;
    try {
      await deleteLightIdlePref({ data: { id } });
      setPrefs((cur) => cur.filter((x) => x.id !== id));
      toast.success("Regel slettet");
    } catch {
      toast.error("Kunne ikke slette");
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const res = await testLightIdlePref({ data: { id } });
      toast.success(`Test sendt — ${res.sent} mottaker(e)${res.errors ? `, ${res.errors} feil` : ""}`);
    } catch (err) {
      console.error(err);
      toast.error("Test feilet");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div
      className="panel rounded-lg p-5 mt-5"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--gold) 5%, transparent), transparent)",
        borderColor: "color-mix(in oklab, var(--gold) 25%, transparent)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Bell size={16} className="text-primary" />
        <div className="text-display text-primary text-sm tracking-[0.2em] uppercase">
          Varsling · Lys på uten bevegelse
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Få push når lysene i et rom har stått på en stund og det ikke er noe folk der.
        Kun rom med både lys og bevegelsessensor i Homey kan velges.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Laster …
        </div>
      ) : (
        <>
          {/* Eksisterende regler */}
          {prefs.length > 0 && (
            <div className="space-y-3 mb-5">
              {prefs.map((p) => (
                <div
                  key={p.id}
                  className="rounded border border-primary/15 p-3 bg-background/40"
                >
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Lightbulb size={14} className="text-primary" />
                      <span className="text-xs tracking-[0.2em] uppercase text-primary">
                        {p.zone_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={(v) => handleUpdate(p, { enabled: v })}
                        disabled={savingId === p.id}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTest(p.id)}
                        disabled={testingId === p.id}
                        className="h-7 px-2"
                      >
                        {testingId === p.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Send size={12} />
                        )}
                        <span className="ml-1 text-[10px]">Test</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(p.id)}
                        className="h-7 px-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Mottaker
                      </span>
                      <Select
                        value={p.recipient}
                        onValueChange={(v) => handleUpdate(p, { recipient: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RECIPIENTS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Lys på (min)
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={p.lights_on_minutes}
                        onChange={(e) =>
                          handleUpdate(p, {
                            lights_on_minutes: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Ingen bevegelse (min)
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={p.no_motion_minutes}
                        onChange={(e) =>
                          handleUpdate(p, {
                            no_motion_minutes: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Cooldown (min)
                      </span>
                      <Input
                        type="number"
                        min={5}
                        max={1440}
                        value={p.cooldown_minutes}
                        onChange={(e) =>
                          handleUpdate(p, {
                            cooldown_minutes: Math.max(5, Number(e.target.value) || 5),
                          })
                        }
                        className="h-8 text-xs"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ny regel */}
          <div className="rounded border border-dashed border-primary/30 p-3">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
              Legg til regel
            </div>
            {zones.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Fant ingen rom med både lys og bevegelsessensor.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <label className="flex flex-col gap-1 col-span-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Rom
                  </span>
                  <Select value={newZone} onValueChange={setNewZone}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Velg rom" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((z) => (
                        <SelectItem key={z.zoneId} value={z.zoneId}>
                          {z.zoneName} · {z.lights} lys · {z.motionSensors} sensor
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Mottaker
                  </span>
                  <Select value={newRecipient} onValueChange={setNewRecipient}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECIPIENTS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Lys på (min)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={newLightsOn}
                    onChange={(e) => setNewLightsOn(Math.max(1, Number(e.target.value) || 1))}
                    className="h-8 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Uten bevegelse (min)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={newNoMotion}
                    onChange={(e) => setNewNoMotion(Math.max(1, Number(e.target.value) || 1))}
                    className="h-8 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Cooldown (min)
                  </span>
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={newCooldown}
                    onChange={(e) => setNewCooldown(Math.max(5, Number(e.target.value) || 5))}
                    className="h-8 text-xs"
                  />
                </label>
                <div className="col-span-2 sm:col-span-5 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAdd}
                    disabled={adding || !newZone}
                  >
                    {adding ? (
                      <Loader2 size={14} className="animate-spin mr-1" />
                    ) : (
                      <Plus size={14} className="mr-1" />
                    )}
                    Legg til
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
