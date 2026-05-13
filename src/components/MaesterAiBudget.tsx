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
  const [purchasedInput, setPurchasedInput] = useState("");
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
        setPurchasedInput(String(a.purchasedCreditsUsd));
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
          purchasedCreditsUsd: Number(purchasedInput) || 0,
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
  const purchased = actual.purchasedCreditsUsd || 0;
  const estimatedMonth = stats.costMonth; // automatisk fra loggede tokens
  // Bruk manuell verdi hvis registrert, ellers automatisk estimat
  const usedMonth = actual.actualCostUsd > 0 ? actual.actualCostUsd : estimatedMonth;
  const totalAvailable = monthlyBudget + purchased;
  const remaining = Math.max(0, totalAvailable - usedMonth);
  const pct = Math.min(100, (usedMonth / Math.max(totalAvailable, 0.01)) * 100);

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
            Lovable har dessverre ingen offentlig API for AI-saldo, så «Brukt» og «Kjøpte
            credits» fylles inn manuelt fra Lovable Cloud → Settings → Workspace → Usage.
            La «Brukt» stå på 0 om du vil bruke det automatiske estimatet fra loggene.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs">
              Brukt mnd (USD)
              <Input
                type="number"
                step="0.01"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className="h-8 mt-1"
              />
            </label>
            <label className="text-xs">
              Mnd-budsjett (USD)
              <Input
                type="number"
                step="0.01"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="h-8 mt-1"
              />
            </label>
            <label className="text-xs">
              Kjøpte credits (USD)
              <Input
                type="number"
                step="0.01"
                value={purchasedInput}
                onChange={(e) => setPurchasedInput(e.target.value)}
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

      <div className="grid sm:grid-cols-4 gap-3 mb-4">
        <Stat
          label={actual.actualCostUsd > 0 ? "Brukt denne måned" : "Brukt (estimat)"}
          value={fmtUsd(usedMonth)}
          accent
        />
        <Stat
          label={`Igjen av ${fmtUsd(totalAvailable)}`}
          value={fmtUsd(remaining)}
          tone={remaining <= totalAvailable * 0.1 ? "warn" : "ok"}
        />
        <Stat label="Kjøpte credits" value={fmtUsd(purchased)} />
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
          <span>$0 — {fmtUsd(totalAvailable)} tilgjengelig</span>
        </div>
      </div>

      <div>
        <p className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
          Per funksjon (alle tider, estimat)
        </p>
        {(() => {
          // Slå sammen kjente features med faktisk loggførte features
          const usageMap = new Map(
            stats.byFeature.map((f) => [f.feature, f]),
          );
          const knownKeys = Object.keys(FEATURE_META);
          const allKeys = Array.from(
            new Set([...knownKeys, ...stats.byFeature.map((f) => f.feature)]),
          );
          const rows = allKeys.map((key) => {
            const u = usageMap.get(key);
            return {
              key,
              meta: metaFor(key),
              count: u?.count ?? 0,
              costUsd: u?.costUsd ?? 0,
            };
          });
          // Sortér: brukt først (etter kostnad), deretter ubrukte alfabetisk
          rows.sort((a, b) => {
            if (a.count > 0 && b.count === 0) return -1;
            if (b.count > 0 && a.count === 0) return 1;
            if (a.count > 0 && b.count > 0) return b.costUsd - a.costUsd;
            return a.meta.label.localeCompare(b.meta.label, "nb");
          });
          return (
            <ul className="space-y-1.5">
              {rows.map((r) => {
                const isOpen = openFeatures.has(r.key);
                const share = (r.costUsd / totalFeatureCost) * 100;
                const used = r.count > 0;
                return (
                  <li
                    key={r.key}
                    className="rounded border border-border/50 bg-background/30 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFeature(r.key)}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-muted/30 transition-colors"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${
                          isOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={`text-sm truncate ${
                              used ? "text-foreground/90" : "text-muted-foreground"
                            }`}
                          >
                            {r.meta.label}
                          </span>
                          <span className="text-muted-foreground tabular-nums text-xs shrink-0">
                            {used
                              ? `${fmtUsd(r.costUsd)} · ${r.count} kall`
                              : "ikke brukt"}
                          </span>
                        </div>
                        {used && (
                          <div className="h-1 rounded-full bg-muted/30 mt-1 overflow-hidden">
                            <div
                              className="h-full bg-primary/60"
                              style={{ width: `${Math.min(100, share)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-0 text-xs text-muted-foreground leading-relaxed border-t border-border/40">
                        <p className="mt-2">{r.meta.description}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          );
        })()}
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
