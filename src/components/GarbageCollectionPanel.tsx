import { useEffect, useState, useCallback } from "react";
import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";
import { Trash2, Bell, BellOff, Loader2, MapPin, Settings, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { getGarbageOverview, setGarbageAddress, updateGarbagePref } from "@/lib/garbage-collection";

type Pickup = {
  fraksjonId: number;
  fraksjonNavn: string;
  date: string;
  daysUntil: number;
};

type Pref = {
  id: string;
  fraksjon_id: number;
  fraksjon_navn: string;
  enabled: boolean;
  days_before: number;
  notify_hour: number;
  notify_minute: number;
  who: string;
};

type AddressRow = {
  id: string;
  label: string;
  address_text: string;
  kommunenr: string;
  gatenavn: string;
  gatekode: string;
  husnr: string;
};

type Overview = {
  address: AddressRow | null;
  fraksjoner: { Id: number; Navn: string; Ikon: string }[];
  pickups: Pickup[];
  prefs: Pref[];
  error?: string;
};
const FRAKSJON_EMOJI: Record<number, string> = {
  1: "🗑",
  2: "📦",
  3: "🥬",
  4: "🍷",
  5: "🥛",
  6: "☣️",
  7: "♻️",
};

function FraksjonIcon({ id, navn, size = 28 }: { id: number; navn?: string; size?: number }) {
  const emoji = FRAKSJON_EMOJI[id];
  return (
    <span
      className="shrink-0 inline-block leading-none"
      title={navn}
      style={{ fontSize: size }}
    >
      {emoji ?? "🗑"}
    </span>
  );
}

function formatDateLabel(date: string, daysUntil: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = dateObj.toLocaleDateString("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "long",
  });
  const dm = dateObj.toLocaleDateString("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "numeric",
    month: "short",
  });
  let rel = `om ${daysUntil} dager`;
  if (daysUntil === 0) rel = "i dag";
  else if (daysUntil === 1) rel = "i morgen";
  return `${weekday} ${dm} · ${rel}`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function GarbageCollectionPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addrEdit, setAddrEdit] = usePerUserPersistedState<boolean>("garbage:addrEdit", false);
  const [prefsOpen, setPrefsOpen] = usePerUserPersistedState<boolean>("garbage:prefs", false);
  const [showAll, setShowAll] = useState(false);
  const [addrForm, setAddrForm] = useState({
    address_text: "",
    kommunenr: "",
    gatenavn: "",
    gatekode: "",
    husnr: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await getGarbageOverview();
      setData(res as Overview);
      if (res.address) {
        setAddrForm({
          address_text: res.address.address_text,
          kommunenr: res.address.kommunenr,
          gatenavn: res.address.gatenavn,
          gatekode: res.address.gatekode,
          husnr: res.address.husnr,
        });
      }
    } catch (err) {
      console.error("garbage load failed", err);
      toast.error("Kunne ikke hente tømmekalender");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSaveAddress = async () => {
    try {
      setRefreshing(true);
      await setGarbageAddress({ data: addrForm });
      toast.success("Adresse lagret");
      setAddrEdit(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke lagre adresse");
      setRefreshing(false);
    }
  };

  const updatePref = async (
    fraksjon_id: number,
    fraksjon_navn: string,
    patch: Partial<Pick<Pref, "enabled" | "days_before" | "notify_hour" | "notify_minute" | "who">>,
  ) => {
    try {
      await updateGarbagePref({ data: { fraksjon_id, fraksjon_navn, ...patch } });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunne ikke oppdatere varsel");
    }
  };

  if (loading) {
    return (
      <div className="panel rounded-lg p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Henter tømmekalender …
      </div>
    );
  }

  const pickups = data?.pickups ?? [];
  const prefs = data?.prefs ?? [];
  const prefMap = new Map(prefs.map((p) => [p.fraksjon_id, p]));
  const visiblePickups = showAll ? pickups : pickups.slice(0, 6);

  const fraksjonForPref = (id: number): { Id: number; Navn: string } => {
    const f = data?.fraksjoner.find((x) => x.Id === id);
    return { Id: id, Navn: f?.Navn ?? prefMap.get(id)?.fraksjon_navn ?? `Fraksjon ${id}` };
  };

  return (
    <section className="container mx-auto px-4 pt-8">
      <div
        className="panel rounded-lg p-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--gold) 6%, transparent), var(--gradient-iron))",
          borderColor: "color-mix(in oklab, var(--gold) 25%, transparent)",
        }}
      >
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Trash2 size={20} className="text-primary" />
            <div>
              <div className="text-display text-primary text-base sm:text-lg tracking-[0.2em] uppercase">
                Søppeltømming
              </div>
              <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-0.5 flex items-center gap-1.5">
                <MapPin size={11} />
                {data?.address?.address_text ?? "Ingen adresse satt"}
              </div>
            </div>
          </div>
          <span className="text-[10px] tracking-[0.3em] text-primary/80 uppercase border border-primary/30 rounded px-2 py-1">
            ~1,5 mnd frem
          </span>
        </div>

        {data?.error && (
          <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            Kunne ikke hente tømmekalender fra RiG: {data.error}
          </div>
        )}

        {pickups.length === 0 && !data?.error ? (
          <p className="text-sm text-muted-foreground">Ingen kommende tømminger funnet for denne adressen.</p>
        ) : (
          <ul className="space-y-2">
            {visiblePickups.map((p) => (
              <li
                key={`${p.fraksjonId}-${p.date}`}
                className="flex items-center justify-between gap-3 rounded border border-border/50 bg-background/40 px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FraksjonIcon id={p.fraksjonId} navn={p.fraksjonNavn} size={32} />
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">{p.fraksjonNavn}</div>
                    <div className="text-[11px] text-muted-foreground">{formatDateLabel(p.date, p.daysUntil)}</div>
                  </div>
                </div>
                <span
                  className={
                    "text-[10px] tracking-[0.2em] uppercase shrink-0 rounded px-1.5 py-0.5 " +
                    (p.daysUntil <= 1
                      ? "bg-primary/20 text-primary border border-primary/40"
                      : "text-muted-foreground border border-border/50")
                  }
                >
                  {p.daysUntil === 0 ? "I dag" : p.daysUntil === 1 ? "I morgen" : `${p.daysUntil}d`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {pickups.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-[11px] tracking-[0.2em] uppercase text-primary/80 hover:text-primary inline-flex items-center gap-1"
          >
            <ChevronDown size={12} className={showAll ? "rotate-180 transition-transform" : "transition-transform"} />
            {showAll ? "Skjul" : `Vis alle (${pickups.length})`}
          </button>
        )}

        <Collapsible open={prefsOpen} onOpenChange={setPrefsOpen} className="mt-5 border-t border-border/40 pt-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 text-[11px] tracking-[0.25em] uppercase text-muted-foreground hover:text-primary"
            >
              <span className="inline-flex items-center gap-2">
                <Settings size={12} />
                Varsel-innstillinger
              </span>
              <ChevronDown size={14} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-3">
            {prefs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ingen varsler er satt opp ennå.</p>
            ) : (
              prefs.map((pref) => {
                const f = fraksjonForPref(pref.fraksjon_id);
                return (
                  <div
                    key={pref.id}
                    className="rounded border border-border/40 bg-background/40 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FraksjonIcon id={pref.fraksjon_id} navn={f.Navn} size={24} />
                        <span className="text-sm text-foreground">{f.Navn}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {pref.enabled ? (
                          <Bell size={12} className="text-primary" />
                        ) : (
                          <BellOff size={12} className="text-muted-foreground" />
                        )}
                        <Switch
                          checked={pref.enabled}
                          onCheckedChange={(v) =>
                            updatePref(pref.fraksjon_id, f.Navn, { enabled: v })
                          }
                        />
                      </div>
                    </div>
                    {pref.enabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                            Når
                          </Label>
                          <Select
                            value={String(pref.days_before)}
                            onValueChange={(v) =>
                              updatePref(pref.fraksjon_id, f.Navn, { days_before: Number(v) })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Samme dag</SelectItem>
                              <SelectItem value="1">1 dag før</SelectItem>
                              <SelectItem value="2">2 dager før</SelectItem>
                              <SelectItem value="3">3 dager før</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                            Klokkeslett
                          </Label>
                          <Select
                            value={String(pref.notify_hour)}
                            onValueChange={(v) =>
                              updatePref(pref.fraksjon_id, f.Navn, {
                                notify_hour: Number(v),
                                notify_minute: 0,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {HOURS.map((h) => (
                                <SelectItem key={h} value={String(h)}>
                                  kl {String(h).padStart(2, "0")}:00
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                            Mottaker
                          </Label>
                          <Select
                            value={pref.who || "Alle"}
                            onValueChange={(v) =>
                              updatePref(pref.fraksjon_id, f.Navn, { who: v })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"].map((w) => (
                                <SelectItem key={w} value={w}>
                                  {w}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CollapsibleContent>
        </Collapsible>

        <Collapsible className="mt-3 border-t border-border/40 pt-4" open={addrEdit} onOpenChange={setAddrEdit}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 text-[11px] tracking-[0.25em] uppercase text-muted-foreground hover:text-primary"
            >
              <span className="inline-flex items-center gap-2">
                <MapPin size={12} />
                Endre adresse
              </span>
              <ChevronDown size={14} className={addrEdit ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <Label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Adresse (tekst)</Label>
                <Input
                  value={addrForm.address_text}
                  onChange={(e) => setAddrForm((s) => ({ ...s, address_text: e.target.value }))}
                  placeholder="Nordre Lensmannsveg 17, 3736 Skien"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Gatenavn</Label>
                <Input
                  value={addrForm.gatenavn}
                  onChange={(e) => setAddrForm((s) => ({ ...s, gatenavn: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Husnr</Label>
                <Input
                  value={addrForm.husnr}
                  onChange={(e) => setAddrForm((s) => ({ ...s, husnr: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Gatekode</Label>
                <Input
                  value={addrForm.gatekode}
                  onChange={(e) => setAddrForm((s) => ({ ...s, gatekode: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Kommunenr</Label>
                <Input
                  value={addrForm.kommunenr}
                  onChange={(e) => setAddrForm((s) => ({ ...s, kommunenr: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Tips: Skien = kommunenr <code className="text-primary">4003</code>. Slå opp gatekode på{" "}
              <a
                className="text-primary underline"
                href="https://ws.geonorge.no/adresser/v1/sok"
                target="_blank"
                rel="noreferrer"
              >
                Geonorge
              </a>
              .
            </p>
            <div className="flex justify-end">
              <Button size="sm" onClick={onSaveAddress} disabled={refreshing}>
                {refreshing ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                Lagre adresse
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </section>
  );
}
