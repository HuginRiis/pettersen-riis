import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Thermometer, Wind, CloudRain, ArrowDown, ArrowUp } from "lucide-react";
import {
  getNetatmoWeatherStation,
  type WeatherStationResult,
} from "@/lib/netatmo-weather.functions";
import { useWindUnit, formatWindFromKmh, windUnitShort } from "@/hooks/use-wind-unit";

const REFRESH_MS = 10 * 60_000;

type OkData = Extract<WeatherStationResult, { ok: true }>;

function fmt(n: number | undefined | null, digits = 1, suffix = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return `${n.toFixed(digits)}${suffix}`;
}

export function OutdoorWeatherStrip({
  stationMatch = "tollnes",
  label = "Ute nå · Tollnes",
}: { stationMatch?: string; label?: string } = {}) {
  const fetchData = useServerFn(getNetatmoWeatherStation);
  const [unit] = useWindUnit();
  const cacheKey = `outdoor-strip:${stationMatch}`;
  const [data, setData] = useState<OkData | null>(null);
  const inFlight = useRef(false);

  const load = async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inFlight.current = true;
    try {
      const res = await fetchData({ data: { stationMatch } });
      if (res.ok) {
        setData(res);
        try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch {}
      }
    } catch {
      /* ignore */
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) setData(JSON.parse(raw) as OkData);
    } catch {
      /* ignore */
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationMatch]);

  const outdoor = data?.modules.find((m) => m.type === "NAModule1");
  const wind = data?.modules.find((m) => m.type === "NAModule2");
  const rain = data?.modules.find((m) => m.type === "NAModule3");

  const temp = outdoor?.metrics.temperature ?? null;
  const tMin = outdoor?.metrics.minTemp ?? null;
  const tMax = outdoor?.metrics.maxTemp ?? null;
  const gust = wind?.metrics.gustStrength ?? null;
  const windNow = wind?.metrics.windStrength ?? null;
  const rainDay = rain?.metrics.rainDay ?? null;

  const hasTemp = temp !== null;
  const hasWind = windNow !== null || gust !== null;
  const hasRain = rainDay !== null;

  // Stasjoner uten utemoduler (f.eks. hytta uten NAModule1/2/3) skal ikke
  // vise en strip full av "–".
  if (data && !hasTemp && !hasWind && !hasRain) return null;

  const tiles = [hasTemp, hasWind, hasRain].filter(Boolean).length;
  const gridCols = tiles === 3 ? "grid-cols-3" : tiles === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <section className="container mx-auto px-4 pt-4">
      <div className="panel rounded-lg p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] sm:text-[10px] tracking-[0.3em] text-primary/80 uppercase">
            {label}
          </span>
          {data?.fetchedAt && (
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {new Date(data.fetchedAt).toLocaleTimeString("nb-NO", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        <div className={`grid ${gridCols} gap-2 sm:gap-4`}>
          {hasTemp && (
            <div className="flex flex-col items-center text-center">
              <Thermometer className="h-4 w-4 text-primary mb-1" />
              <div className="text-lg sm:text-2xl font-semibold text-foreground tabular-nums leading-none">
                {fmt(temp, 1, "°")}
              </div>
              {(tMin !== null || tMax !== null) && (
                <div className="mt-1 flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground tabular-nums">
                  {tMin !== null && (
                    <span className="inline-flex items-center gap-0.5">
                      <ArrowDown className="h-3 w-3 text-sky-400" />
                      {fmt(tMin, 1, "°")}
                    </span>
                  )}
                  {tMax !== null && (
                    <span className="inline-flex items-center gap-0.5">
                      <ArrowUp className="h-3 w-3 text-orange-400" />
                      {fmt(tMax, 1, "°")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {hasWind && (
            <div className={`flex flex-col items-center text-center ${tiles === 3 ? "border-x border-border" : ""}`}>
              <Wind className="h-4 w-4 text-primary mb-1" />
              <div className="text-lg sm:text-2xl font-semibold text-foreground tabular-nums leading-none">
                {formatWindFromKmh(gust ?? windNow, unit, { digits: 0, withUnit: false })}
                <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">
                  {windUnitShort(unit)}
                </span>
              </div>
              <div className="mt-1 text-[10px] sm:text-xs text-muted-foreground tabular-nums">
                {gust !== null ? "maks kast" : "vind nå"}
                {gust !== null && windNow !== null && (
                  <> · {formatWindFromKmh(windNow, unit, { digits: 0, withUnit: false })} nå</>
                )}
              </div>
            </div>
          )}

          {hasRain && (
            <div className="flex flex-col items-center text-center">
              <CloudRain className="h-4 w-4 text-primary mb-1" />
              <div className="text-lg sm:text-2xl font-semibold text-foreground tabular-nums leading-none">
                {fmt(rainDay, 1)}
                <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">
                  mm
                </span>
              </div>
              <div className="mt-1 text-[10px] sm:text-xs text-muted-foreground">
                regn i dag
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
