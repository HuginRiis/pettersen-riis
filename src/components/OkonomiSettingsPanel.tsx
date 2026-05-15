import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Coins, Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const VAULT_PIN = "9272";
const VAULT_OWNER = "Arne";
const VAULT_UNLOCK_KEY = "okonomi_vault_unlocked";
import {
  getOkonomiSettings,
  updateOkonomiSettings,
  generateOkonomiBenchmarks,
  type OkonomiSettings,
} from "@/server/okonomi.functions";
import { OkonomiAccountsSettings } from "./OkonomiAccountsSettings";

type NumKey = "payday_day" | "household_adults" | "household_children_under18" | "household_children_over18";

function NumField({
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
}) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => {
    setTxt(String(value));
  }, [value]);
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={txt}
      onChange={(e) => setTxt(e.target.value.replace(/[^0-9]/g, ""))}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (txt === "") {
          setTxt(String(value));
          return;
        }
        const n = Math.max(min, Math.min(max, Number(txt) || min));
        setTxt(String(n));
        if (n !== value) onCommit(n);
      }}
      className="h-8"
      disabled={disabled}
    />
  );
}

export function OkonomiSettingsPanel() {
  const [who, setWho] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      setWho(localStorage.getItem("agenda_push_who"));
      setUnlocked(sessionStorage.getItem(VAULT_UNLOCK_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  if (who !== VAULT_OWNER) {
    return (
      <section id="sec-okonomi" className="container mx-auto px-4 pb-4 scroll-mt-24">
        <div className="panel rounded-lg p-4 border border-amber-500/40 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Coins className="w-4 h-4" /> Husholdningens hvelv
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Hvelvet er låst til <span className="text-amber-300 font-semibold">{VAULT_OWNER}</span>.
              {who ? <> Innlogget som <span className="text-foreground">{who}</span>.</> : <> Velg bruker for push-varsler først.</>}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!unlocked) {
    function tryUnlock(e: React.FormEvent) {
      e.preventDefault();
      if (pin === VAULT_PIN) {
        try { sessionStorage.setItem(VAULT_UNLOCK_KEY, "1"); } catch { /* ignore */ }
        setUnlocked(true);
        setPinErr(null);
      } else {
        setPinErr("Feil kode");
      }
    }
    return (
      <section id="sec-okonomi" className="container mx-auto px-4 pb-4 scroll-mt-24">
        <div className="panel rounded-lg p-4 border border-amber-500/40">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-2">
            <Lock className="w-4 h-4" /> Husholdningens hvelv — låst
          </h2>
          <p className="text-[11px] text-muted-foreground mb-3">
            Skriv inn 4-sifret kode for å åpne hvelvet.
          </p>
          <form onSubmit={tryUnlock} className="flex gap-2 items-start">
            <Input
              autoFocus
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)); setPinErr(null); }}
              placeholder="••••"
              className="h-9 w-28 tracking-[0.4em] text-center"
            />
            <Button type="submit" variant="secondary" className="h-9">Åpne</Button>
          </form>
          {pinErr && <p className="text-xs text-destructive mt-2">{pinErr}</p>}
        </div>
      </section>
    );
  }

  return <OkonomiSettingsPanelInner />;
}

function OkonomiSettingsPanelInner() {
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

  async function save(patch: Partial<Record<NumKey, number>>) {
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
            <div className="w-24">
              <NumField
                value={s.payday_day}
                min={1}
                max={31}
                disabled={busy}
                onCommit={(n) => save({ payday_day: n })}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Husholdning</Label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Antall personer — brukes for å sammenligne med en typisk norsk familie.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Voksne</Label>
                <NumField
                  value={s.household_adults}
                  min={0}
                  max={10}
                  disabled={busy}
                  onCommit={(n) => save({ household_adults: n })}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Barn &lt; 18</Label>
                <NumField
                  value={s.household_children_under18}
                  min={0}
                  max={15}
                  disabled={busy}
                  onCommit={(n) => save({ household_children_under18: n })}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Barn ≥ 18</Label>
                <NumField
                  value={s.household_children_over18}
                  min={0}
                  max={15}
                  disabled={busy}
                  onCommit={(n) => save({ household_children_over18: n })}
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
