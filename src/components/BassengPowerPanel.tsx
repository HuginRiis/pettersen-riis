import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Zap, Plug } from "lucide-react";
import { getBassengPowerStats } from "@/server/basseng-power.functions";

type Stats = Awaited<ReturnType<typeof getBassengPowerStats>>;

function fmtKwh(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} MWh`;
  if (v >= 10) return `${v.toFixed(1)} kWh`;
  return `${v.toFixed(2)} kWh`;
}

function fmtWatts(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(2)} kW`;
  return `${Math.round(v)} W`;
}

export function BassengPowerPanel() {
  const fetchStats = useServerFn(getBassengPowerStats);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await fetchStats();
        if (!cancelled) setStats(s);
      } catch {
        /* ignorer */
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchStats]);

  if (stats && !stats.ok) return null;

  const live = stats?.liveWatts ?? null;
  const isOn = live !== null && live > 1;

  return (
    <section className="container mx-auto px-4 pt-3 sm:pt-4">
      <div className="panel rounded-lg p-4 sm:p-5 bg-gradient-to-br from-amber-500/10 to-transparent">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-muted-foreground uppercase mb-0.5">
              Smedens regnskap
            </div>
            <h3 className="text-display text-primary text-sm sm:text-lg tracking-[0.2em] sm:tracking-[0.25em] uppercase flex items-center gap-2">
              <Plug size={14} className="text-[var(--gold)]" />
              Basseng — effekt &amp; forbruk
            </h3>
            {stats?.deviceName && (
              <div className="hidden sm:block text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70 mt-1">
                {stats.deviceName}
              </div>
            )}
          </div>
          <div className={`text-right ${isOn ? "text-amber-300" : "text-muted-foreground"}`}>
            <div className="flex items-center gap-1.5 justify-end">
              <Zap size={16} className={isOn ? "animate-pulse" : ""} />
              <span className="text-2xl sm:text-3xl text-display tabular-nums leading-none">
                {fmtWatts(live)}
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] uppercase mt-1">
              {isOn ? "Aktiv nå" : "Hviler"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="Siste døgn" value={stats ? fmtKwh(stats.kwh24h) : "—"} />
          <Stat label="Siste uke" value={stats ? fmtKwh(stats.kwh7d) : "—"} />
          <Stat label="Totalt" value={stats ? fmtKwh(stats.kwhTotal) : "—"} />
        </div>

        {stats && stats.sampleCount < 5 && (
          <p className="text-[10px] sm:text-xs italic text-muted-foreground/80 mt-3">
            Samler målinger — tall blir mer presise etter noen timer.
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2 sm:p-3 text-center">
      <div className="text-[9px] sm:text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm sm:text-lg text-display tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
