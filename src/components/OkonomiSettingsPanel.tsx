import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Coins } from "lucide-react";
import { toast } from "sonner";
import {
  getOkonomiSettings,
  updateOkonomiSettings,
  generateOkonomiBenchmarks,
  type OkonomiSettings,
} from "@/server/okonomi.functions";

export function OkonomiSettingsPanel() {
  const get = useServerFn(getOkonomiSettings);
  const update = useServerFn(updateOkonomiSettings);
  const generate = useServerFn(generateOkonomiBenchmarks);
  const [s, setS] = useState<OkonomiSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);

  useEffect(() => {
    get().then(setS).catch((e) => toast.error(e.message));
  }, []);

  if (!s) {
    return (
      <div className="container mx-auto px-4 pb-4">
        <div className="panel rounded-lg p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Laster…
        </div>
      </div>
    );
  }

  async function save(patch: Partial<OkonomiSettings>) {
    if (!s) return;
    const next = { ...s, ...patch };
    setS(next);
    setBusy(true);
    try {
      await update({ data: patch as any });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  async function regen() {
    setGenBusy(true);
    try {
      const res = await generate();
      toast.success(`Genererte snitt for ${res.updated} kategorier`);
      const fresh = await get();
      setS(fresh);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <section id="sec-okonomi" className="container mx-auto px-4 pb-4 scroll-mt-24">
      <div className="panel rounded-lg p-4 border border-amber-500/40">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
          <Coins className="w-4 h-4" /> Husholdningens hvelv
        </h2>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lønnsdag</Label>
            <p className="text-[11px] text-muted-foreground mb-1">
              Dagen i måneden lønn kommer inn (1–31). Brukes til «igjen pr dag».
            </p>
            <Input
              type="number"
              min={1}
              max={31}
              value={s.payday_day}
              onChange={(e) => save({ payday_day: Math.max(1, Math.min(31, Number(e.target.value) || 15)) })}
              className="h-8 w-24"
              disabled={busy}
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Husholdning</Label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Antall personer — brukes for å sammenligne med en typisk norsk familie.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Voksne</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={s.household_adults}
                  onChange={(e) => save({ household_adults: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8"
                  disabled={busy}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Barn &lt; 18</Label>
                <Input
                  type="number"
                  min={0}
                  max={15}
                  value={s.household_children_under18}
                  onChange={(e) => save({ household_children_under18: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8"
                  disabled={busy}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Barn ≥ 18</Label>
                <Input
                  type="number"
                  min={0}
                  max={15}
                  value={s.household_children_over18}
                  onChange={(e) => save({ household_children_over18: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8"
                  disabled={busy}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              AI-snitt for typisk norsk familie
            </Label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Generer estimat (basert på SIFO/SSB) per kategori. Brukes som sammenligning på Oversikt.
              {s.benchmarks_generated_at && (
                <> Sist oppdatert: {new Date(s.benchmarks_generated_at).toLocaleString("nb-NO")}.</>
              )}
            </p>
            <Button onClick={regen} disabled={genBusy} variant="secondary" className="w-full">
              {genBusy ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1" />
              )}
              Generer nye snitt-tall
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2">
              {Object.keys(s.benchmarks).length} kategorier har snitt.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
