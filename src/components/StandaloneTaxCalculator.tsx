import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Calculator } from "lucide-react";
import { calculateNorwegianTax } from "@/server/skatt.functions";

const fmt = (n: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Math.round(n));

type Result = Awaited<ReturnType<typeof calculateNorwegianTax>>;

export function StandaloneTaxCalculator({ defaultYear, profile }: { defaultYear: number; profile?: "arne" | "rebekka" }) {
  const fn = useServerFn(calculateNorwegianTax);
  const [year, setYear] = useState(defaultYear);
  const [brutto, setBrutto] = useState(700000);
  const [pensjon, setPensjon] = useState(0);
  const [fagforening, setFagforening] = useState(0);
  const [renter, setRenter] = useState(0);
  const [andreFradrag, setAndreFradrag] = useState(0);
  const [sivilstand, setSivilstand] = useState<"enslig" | "gift">("enslig");
  const [skatteklasse, setSkatteklasse] = useState<1 | 2>(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fn({
        data: { year, brutto, pensjon, fagforening, renter, andreFradrag, sivilstand, skatteklasse, notes },
      });
      setRes(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Klarte ikke beregne");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 space-y-5 border-2 border-dashed">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calculator className="size-5" /> Skatteberegning (frittstående)
          {profile && (
            <span className="text-xs font-normal text-muted-foreground capitalize ml-2 px-2 py-0.5 rounded-full border border-border">
              {profile}
            </span>
          )}
        </h2>
        <p className="text-xs text-muted-foreground">
          Estimat basert på norske skatteregler for valgt år. Påvirker ikke tabellen over.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Field label="År">
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || defaultYear)} />
        </Field>
        <Field label="Bruttolønn (kr)">
          <Input type="number" value={brutto} onChange={(e) => setBrutto(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Pensjonsinnbetaling (kr)">
          <Input type="number" value={pensjon} onChange={(e) => setPensjon(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Fagforening (kr)">
          <Input type="number" value={fagforening} onChange={(e) => setFagforening(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Gjeldsrenter (kr)">
          <Input type="number" value={renter} onChange={(e) => setRenter(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Andre fradrag (kr)">
          <Input type="number" value={andreFradrag} onChange={(e) => setAndreFradrag(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Sivilstand">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={sivilstand}
            onChange={(e) => setSivilstand(e.target.value as any)}
          >
            <option value="enslig">Enslig</option>
            <option value="gift">Gift</option>
          </select>
        </Field>
        <Field label="Skatteklasse">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={skatteklasse}
            onChange={(e) => setSkatteklasse(Number(e.target.value) as 1 | 2)}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </Field>
      </div>

      <Field label="Tilleggsinfo (valgfritt)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="F.eks. BSU, pendler, formue …" />
      </Field>

      <div>
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Calculator />}
          Beregn skatt
        </Button>
      </div>

      {err && (
        <div className="text-sm rounded-md border border-red-600/40 bg-red-600/10 px-3 py-2 text-red-500">
          {err}
        </div>
      )}

      {res && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Total skatt" value={fmt(res.totalSkatt) + " kr"} />
            <Stat label="Netto utbetalt" value={fmt(res.nettoUtbetalt) + " kr"} />
            <Stat label="Snitt skatte%" value={(res.gjennomsnittSkattProsent ?? 0).toFixed(1) + " %"} />
            <Stat label="Marginalskatt" value={(res.marginalSkatt ?? 0).toFixed(1) + " %"} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <KV k="Minstefradrag" v={fmt(res.minstefradrag) + " kr"} />
            <KV k="Personfradrag" v={fmt(res.personfradrag) + " kr"} />
            <KV k="Alminnelig inntekt" v={fmt(res.alminneligInntekt) + " kr"} />
            <KV k="Skatt 22% alminnelig" v={fmt(res.skattAlminnelig) + " kr"} />
            <KV k="Trinnskatt" v={fmt(res.trinnskatt) + " kr"} />
            <KV k="Trygdeavgift" v={fmt(res.trygdeavgift) + " kr"} />
            <KV k="Sum fradrag" v={fmt(res.fradragSum) + " kr"} />
            <KV k="År" v={String(res.year)} />
          </div>
          {res.forklaring && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-3">
              {res.forklaring}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/50 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular-nums font-medium">{v}</span>
    </div>
  );
}
