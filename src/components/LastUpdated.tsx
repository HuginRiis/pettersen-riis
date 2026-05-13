import { useEffect, useState } from "react";

type Props = {
  /** Timestamp the data was fetched/refreshed (Date or ISO string). */
  timestamp: Date | string | null;
  /** Short label, e.g. "Vær", "Homey", "Pollen". */
  label: string;
};

/**
 * Tiny pill that shows when data was last refreshed.
 * Re-renders every 30s so the relative time stays fresh.
 */
export function LastUpdated({ timestamp, label }: Props) {
  const [, force] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const ts = timestamp ? (typeof timestamp === "string" ? new Date(timestamp) : timestamp) : null;
  const valid = ts && !Number.isNaN(ts.getTime());

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 backdrop-blur-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
        {label} · sist oppdatert
      </span>
      <span className="text-[11px] text-foreground font-medium">
        {valid ? (hydrated ? formatRelative(ts!) : "oppdatert") : "—"}
      </span>
      {valid && (
        <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
          ({hydrated ? formatClock(ts!) : "--:--"})
        </span>
      )}
    </div>
  );
}

function formatRelative(d: Date): string {
  const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (diffSec < 10) return "nå";
  if (diffSec < 60) return `for ${diffSec} s siden`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `for ${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `for ${h} t siden`;
  const days = Math.round(h / 24);
  return `for ${days} d siden`;
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
}
