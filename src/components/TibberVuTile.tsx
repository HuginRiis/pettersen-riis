import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTibberWeeklyMeter, type TibberWeeklyMeter } from "@/server/tibber";

export function TibberVuTile({
  location,
  title,
  subtitle,
}: {
  location: "hytta" | "tollnes";
  title: string;
  subtitle?: string;
}) {
  const fetchMeter = useServerFn(getTibberWeeklyMeter);
  const [state, setState] = useState<TibberWeeklyMeter | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchMeter({ data: { location } });
        if (cancelled) return;
        setState(res);
        setUpdated(new Date());
      } catch (e) {
        console.error("[TibberVuTile]", e);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchMeter, location]);

  const nowKwh = state?.latestHourKwh ?? null;
  const avgKwh = state?.weeklyAvgHourKwh ?? null;
  const maxToday = state?.todayMaxHourKwh ?? null;
  const maxWeek = state?.weeklyMaxHourKwh ?? null;
  const todayKwh = state?.todayKwh ?? null;

  // Skala for VU-meter: bruk max(uke, i dag, nå) som tak, med litt slack.
  const peakCandidates = [nowKwh, maxToday, maxWeek, avgKwh]
    .filter((v): v is number => typeof v === "number");
  const scaleMax = peakCandidates.length > 0
    ? Math.max(...peakCandidates) * 1.1
    : 1;
  const pct = (v: number | null) =>
    v == null ? 0 : Math.min(100, Math.max(0, (v / scaleMax) * 100));

  const watt = (kwh: number | null) =>
    kwh == null ? "—" : `${Math.round(kwh * 1000).toLocaleString("nb-NO")} W`;

  const updatedLabel = updated
    ? updated.toLocaleTimeString("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  // "Trafikklys"-farge basert på hvor mye over snittet vi er.
  const ratio = nowKwh != null && avgKwh && avgKwh > 0 ? nowKwh / avgKwh : 1;
  const barColor =
    ratio >= 1.5
      ? "var(--chart-series-3)" // rød
      : ratio >= 1.0
        ? "var(--chart-series-2)" // gul
        : "var(--chart-series-1)"; // grønn

  return (
    <article className="panel rounded-lg p-3 sm:p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-display tracking-[0.3em] text-primary text-[10px] sm:text-xs uppercase">
            {title}
          </div>
          {subtitle && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-foreground leading-none">
            {watt(nowKwh)}
          </div>
          <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground/70 mt-0.5">
            Nå · snitt forrige time
          </div>
        </div>
      </div>

      {state?.error ? (
        <div className="text-[11px] text-destructive">{state.error}</div>
      ) : (
        <>
          {/* VU-meter */}
          <div className="relative h-6 sm:h-7 rounded-md overflow-hidden bg-background/40 border border-border/40">
            {/* "nå"-bar */}
            <div
              className="absolute inset-y-0 left-0 transition-all duration-500"
              style={{
                width: `${pct(nowKwh)}%`,
                background: barColor,
                opacity: 0.85,
              }}
            />
            {/* Snitt-marker (uke) */}
            {avgKwh != null && (
              <div
                className="absolute inset-y-0 w-[2px] bg-foreground/80"
                style={{ left: `${pct(avgKwh)}%` }}
                title={`Snitt uke: ${watt(avgKwh)}`}
              />
            )}
            {/* Maks i dag-marker */}
            {maxToday != null && (
              <div
                className="absolute inset-y-0 w-[2px] bg-primary"
                style={{ left: `${pct(maxToday)}%` }}
                title={`Maks i dag: ${watt(maxToday)}`}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            <div>
              <div className="text-[8px] tracking-[0.25em] uppercase text-muted-foreground/70">
                Snitt uke
              </div>
              <div className="text-xs sm:text-sm font-medium tabular-nums text-foreground">
                {watt(avgKwh)}
              </div>
            </div>
            <div>
              <div className="text-[8px] tracking-[0.25em] uppercase text-primary">
                Maks i dag
              </div>
              <div className="text-xs sm:text-sm font-medium tabular-nums text-foreground">
                {watt(maxToday)}
              </div>
            </div>
            <div>
              <div className="text-[8px] tracking-[0.25em] uppercase text-muted-foreground/70">
                I dag
              </div>
              <div className="text-xs sm:text-sm font-medium tabular-nums text-foreground">
                {todayKwh != null ? `${todayKwh.toFixed(1)} kWh` : "—"}
              </div>
            </div>
          </div>

          <div className="text-[8px] tracking-[0.25em] uppercase text-muted-foreground/60 mt-2 text-right">
            Oppdatert {updatedLabel}
          </div>
        </>
      )}
    </article>
  );
}
