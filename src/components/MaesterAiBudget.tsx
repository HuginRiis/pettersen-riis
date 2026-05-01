import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { getAiUsageStats } from "@/server/ai-usage.functions";

/**
 * Viser hvor mye av Lovable AI-budsjettet Hærmesteren har brukt denne måneden,
 * hvor mye som gjenstår og fordeling per funksjon (feature) som har trukket fra.
 *
 * Lovable AI gir hver workspace ~$1 gratis pr måned (frem til tidlig 2026).
 * Vi anslår forbruket basert på loggede tokens × modellpris (estimat) — eksakte
 * tall ligger i Lovable Cloud-fakturaen.
 */

const MONTHLY_BUDGET_USD = 1.0;

type Stats = Awaited<ReturnType<typeof getAiUsageStats>>;

const FEATURE_LABELS: Record<string, string> = {
  turer: "Tur-rådgiver",
  kvittering: "Kvittering-tolkning",
  receipt: "Kvittering-tolkning",
  receipts: "Kvittering-tolkning",
  pollen: "Pollen-orakel",
  saga: "Sagaskriver",
  "got-saga": "Sagaskriver",
  agenda: "Agenda-magiker",
  matvarer: "Handlelistens skribent",
};

function labelFor(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature.charAt(0).toUpperCase() + feature.slice(1);
}

function fmtUsd(v: number): string {
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

export function MaesterAiBudget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getAiUsageStats();
        if (!cancelled) setStats(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ukjent feil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Hærmesteren teller sine glasskuler …
      </div>
    );
  }
  if (error || !stats) {
    return (
      <div className="text-sm text-destructive">
        Kunne ikke lese AI-skattkammeret: {error ?? "ukjent"}
      </div>
    );
  }

  const usedMonth = stats.costMonth;
  const remaining = Math.max(0, MONTHLY_BUDGET_USD - usedMonth);
  const pct = Math.min(100, (usedMonth / MONTHLY_BUDGET_USD) * 100);
  const totalAllTime = stats.estimatedCostUsd;

  const totalFeatureCost =
    stats.byFeature.reduce((s, f) => s + (f.costUsd ?? 0), 0) || 1;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <h4 className="text-[11px] tracking-[0.3em] uppercase text-primary">
          AI-skattkammeret
        </h4>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Brukt denne måned" value={fmtUsd(usedMonth)} accent />
        <Stat
          label="Igjen av $1 gratis"
          value={fmtUsd(remaining)}
          tone={remaining <= 0.1 ? "warn" : "ok"}
        />
        <Stat label="Brukt totalt" value={fmtUsd(totalAllTime)} />
      </div>

      <div className="mb-4">
        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`h-full transition-all ${
              pct >= 90
                ? "bg-destructive"
                : pct >= 70
                  ? "bg-orange-500"
                  : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{pct.toFixed(1)}% brukt</span>
          <span>$0 — $1.00 / mnd</span>
        </div>
      </div>

      <div>
        <p className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
          Per funksjon (alle tider)
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
        Estimat basert på loggede tokens × pris pr modell. Eksakte tall ligger i
        Lovable Cloud-fakturaen.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "ok" | "warn";
}) {
  const valueClass = tone === "warn"
    ? "text-destructive"
    : accent
      ? "text-primary"
      : "text-foreground";
  return (
    <div className="rounded border border-border/60 bg-background/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
