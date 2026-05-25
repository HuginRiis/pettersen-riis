import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Home } from "lucide-react";
import {
  getNetatmoWeatherStation,
  type WeatherStationResult,
} from "@/server/netatmo-weather";

const REFRESH_MS = 10 * 60_000;

type OkData = Extract<WeatherStationResult, { ok: true }>;

function fmt(n: number | undefined | null, digits = 1, suffix = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return `${n.toFixed(digits)}${suffix}`;
}

function co2Tone(co2?: number): string {
  if (co2 === undefined) return "text-muted-foreground";
  if (co2 < 800) return "text-emerald-400";
  if (co2 < 1200) return "text-yellow-400";
  return "text-destructive";
}

export function IndoorWeatherStrip({
  stationMatch = "tollnes",
  label = "Inne nå · Tollnes",
}: { stationMatch?: string; label?: string } = {}) {
  const fetchData = useServerFn(getNetatmoWeatherStation);
  const cacheKey = `indoor-strip:${stationMatch}`;
  const [data, setData] = useState<OkData | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as OkData) : null;
    } catch {
      return null;
    }
  });
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
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationMatch]);

  // Alle innemoduler: hovedmodulen (NAMain) + ekstra innemoduler (NAModule4)
  const indoors =
    data?.modules.filter(
      (m) => m.type === "NAMain" || m.type === "NAModule4",
    ) ?? [];

  if (indoors.length === 0) {
    return null;
  }

  // Dynamisk grid — opp til 4 kolonner, ellers wrap pent på mobil
  const cols =
    indoors.length >= 4
      ? "grid-cols-2 sm:grid-cols-4"
      : indoors.length === 3
        ? "grid-cols-3"
        : indoors.length === 2
          ? "grid-cols-2"
          : "grid-cols-1";

  return (
    <section className="container mx-auto px-4 pt-2">
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

        <div className={`grid ${cols} gap-2 sm:gap-4`}>
          {indoors.map((m) => {
            const t = m.metrics.temperature ?? null;
            const h = m.metrics.humidity ?? null;
            const co2 = m.metrics.co2;
            return (
              <div
                key={m.id}
                className="flex flex-col items-center text-center px-1"
              >
                <Home className="h-4 w-4 text-primary mb-1" />
                <div className="text-[10px] sm:text-xs text-muted-foreground tracking-wide truncate max-w-full">
                  {m.name}
                </div>
                <div className="text-lg sm:text-2xl font-semibold text-foreground tabular-nums leading-none mt-0.5">
                  {fmt(t, 1, "°")}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground tabular-nums">
                  {h !== null && <span>{fmt(h, 0, "%")}</span>}
                  {co2 !== undefined && (
                    <span className={co2Tone(co2)}>{co2} ppm</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
