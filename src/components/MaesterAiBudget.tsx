import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Pencil, Sparkles } from "lucide-react";
import { getAiUsageStats } from "@/server/ai-usage.functions";
import {
  getAiBudgetActual,
  setAiBudgetActual,
  type AiBudgetActual,
} from "@/server/ai-budget-actual.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Stats = Awaited<ReturnType<typeof getAiUsageStats>>;

type FeatureMeta = { label: string; description: string };

const FEATURE_META: Record<string, FeatureMeta> = {
  kvittering: {
    label: "Kvittering-tolkning",
    description:
      "Når du importerer en kvittering (fra Kassalapp eller bilde) leser AI-en ut dato, butikk, varelinjer, mva og totalsum slik at den kan lagres strukturert.",
  },
  receipt: {
    label: "Kvittering-tolkning",
    description: "Samme som «Kvittering» — AI tolker innholdet i en importert kvittering.",
  },
  receipts: {
    label: "Kvittering-tolkning (batch)",
    description: "Tolking av flere kvitteringer i samme runde.",
  },
  lonnslipp: {
    label: "Lønnslipp-tolkning",
    description:
      "AI leser PDF-en av lønnslippen og henter ut brutto, netto, skattetrekk, feriepenger og pensjon — brukes til Skattekammeret og lønnshistorikken.",
  },
  payslip: {
    label: "Lønnslipp-tolkning",
    description: "Samme som «Lønnslipp» — AI henter beløp og poster fra PDF-lønnslipp.",
  },
  skatt: {
    label: "Skatte-utregning",
    description:
      "AI hjelper med skatteberegningen: forklarer poster, sammenligner år og foreslår justeringer i Skatte-utregningen.",
  },
  turer: {
    label: "Tur-rådgiver",
    description:
      "Når du ber om turtips i Ferden bruker AI værdata, sesong og posisjon til å foreslå en konkret tur med rute og pakkeliste.",
  },
  pollen: {
    label: "Pollen-orakel",
    description: "Tolker pollen-målinger og forklarer hva de betyr for dagen.",
  },
  saga: {
    label: "Sagaskriver",
    description: "Genererer Game of Thrones-stilet tekst for Westeros-sagaen.",
  },
  "got-saga": {
    label: "Sagaskriver",
    description: "Genererer Game of Thrones-stilet tekst for Westeros-sagaen.",
  },
  agenda: {
    label: "Agenda-magiker",
    description:
      "Tolker meldinger og kalenderoppføringer (søppel, bursdager, meldinger) og foreslår dato/emne.",
  },
  matvarer: {
    label: "Handlelistens skribent",
    description: "Foreslår handleliste-elementer basert på kvitteringer og forbruk.",
  },
  briefing: {
    label: "Daglig briefing",
    description:
      "Sammenfatning av dagens vær, varsler, kalender og hendelser — generert av AI hver morgen.",
  },
  "daily-briefing": {
    label: "Daglig briefing",
    description: "Daglig AI-sammendrag av vær, varsler og kalender.",
  },
};

function metaFor(feature: string): FeatureMeta {
  return (
    FEATURE_META[feature] ?? {
      label: feature.charAt(0).toUpperCase() + feature.slice(1),
      description: "Annet AI-kall — ingen beskrivelse er registrert ennå.",
    }
  );
}

function fmtUsd(v: number): string {
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

export function MaesterAiBudget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [actual, setActual] = useState<AiBudgetActual | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [costInput, setCostInput] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [openFeatures, setOpenFeatures] = useState<Set<string>>(new Set());

  function toggleFeature(key: string) {
    setOpenFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, a] = await Promise.all([getAiUsageStats(), getAiBudgetActual()]);
        if (cancelled) return;
        setStats(s);
        setActual(a);
        setCostInput(String(a.actualCostUsd));
        setBudgetInput(String(a.monthlyBudgetUsd));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ukjent feil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const a = await setAiBudgetActual({
        data: {
          actualCostUsd: Number(costInput) || 0,
          monthlyBudgetUsd: Number(budgetInput) || 1,
        },
      });
      setActual(a);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lagring feilet");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Hærmesteren teller sine glasskuler …
      </div>
    );
  }
  if (error || !stats || !actual) {
    return (
      <div className="text-sm text-destructive">
        Kunne ikke lese AI-skattkammeret: {error ?? "ukjent"}
      </div>
    );
  }

  const monthlyBudget = actual.monthlyBudgetUsd || 1;
  const usedMonth = actual.actualCostUsd; // FAKTISK fra Lovable
  const estimatedMonth = stats.costMonth; // estimat fra tokens
  const remaining = Math.max(0, monthlyBudget - usedMonth);
  const pct = Math.min(100, (usedMonth / monthlyBudget) * 100);

  const totalFeatureCost =
    stats.byFeature.reduce((s, f) => s + (f.costUsd ?? 0), 0) || 1;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h4 className="text-[11px] tracking-[0.3em] uppercase text-primary">
            AI-skattkammeret
          </h4>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil className="w-3 h-3 mr-1" />
          {editing ? "Lukk" : "Rediger"}
        </Button>
      </div>

      {editing && (
        <div className="rounded border border-border/60 bg-background/30 p-3 mb-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Lim inn faktisk forbruk fra Lovable Cloud → Settings → Cloud & AI balance.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              Brukt denne måned (USD)
              <Input
                type="number"
                step="0.01"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className="h-8 mt-1"
              />
            </label>
            <label className="text-xs">
              Månedlig budsjett (USD)
              <Input
                type="number"
                step="0.01"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="h-8 mt-1"
              />
            </label>
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Lagre
          </Button>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Brukt denne måned" value={fmtUsd(usedMonth)} accent />
        <Stat
          label={`Igjen av ${fmtUsd(monthlyBudget)}`}
          value={fmtUsd(remaining)}
          tone={remaining <= monthlyBudget * 0.1 ? "warn" : "ok"}
        />
        <Stat label="Estimert (tokens)" value={fmtUsd(estimatedMonth)} />
      </div>

      <div className="mb-4">
        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`h-full transition-all ${
              pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-orange-500" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{pct.toFixed(1)}% brukt</span>
          <span>$0 — {fmtUsd(monthlyBudget)} / mnd</span>
        </div>
      </div>

      <div>
        <p className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
          Per funksjon (alle tider, estimat)
        </p>
        {stats.byFeature.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Ingen AI-kall loggført ennå.
          </p>
        ) : (
          <ul className="space-y-2">
            {stats.byFeature.map((f) => {
              const share = ((f.costUsd ?? 0) / totalFeatureCost) * 100;
              return (
                <li key={f.feature} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-foreground/90 truncate">
                      {labelFor(f.feature)}
                    </span>
                    <span className="text-muted-foreground tabular-nums text-xs">
                      {fmtUsd(f.costUsd ?? 0)} · {f.count} kall
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted/30 mt-1 overflow-hidden">
                    <div
                      className="h-full bg-primary/60"
                      style={{ width: `${Math.min(100, share)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/70 italic mt-4">
        Lovable har ingen offentlig API for AI-saldo. Tallet "Brukt denne måned" oppdateres
        manuelt fra Lovable Cloud-dashbordet. Estimatet baserer seg på loggede tokens.
        {actual.updatedAt ? ` Sist oppdatert: ${new Date(actual.updatedAt).toLocaleString("nb-NO")}.` : ""}
      </p>
    </div>
  );
}

function Stat({
  label, value, accent, tone,
}: { label: string; value: string; accent?: boolean; tone?: "ok" | "warn" }) {
  const valueClass = tone === "warn"
    ? "text-destructive"
    : accent ? "text-primary" : "text-foreground";
  return (
    <div className="rounded border border-border/60 bg-background/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
