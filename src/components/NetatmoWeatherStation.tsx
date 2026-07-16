import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Flame } from "lucide-react";
import {
  getNetatmoWeatherStation,
  type WeatherModule,
  type WeatherStationResult,
} from "@/lib/netatmo-weather.functions";
import { useWindUnit, formatWindFromKmh } from "@/hooks/use-wind-unit";

const REFRESH_MS = 10 * 60_000; // 10 min

/**
 * Pyrelys — drage-ild som markerer batteri-nivå på borgens sensorer.
 * Lavt = blod-rødt, middels = gull, fullt = rolig amber. Ikke et batteri-emoji.
 */
function BatteryFlame({ value, size = 11 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const tone =
    v < 20 ? "text-destructive" : v < 40 ? "text-amber-400" : "text-emerald-400";
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Flame
        size={size}
        className={`${tone} shrink-0`}
        strokeWidth={1.75}
        fill="currentColor"
        fillOpacity={v < 20 ? 0.35 : v < 40 ? 0.25 : 0.2}
        aria-hidden
      />
      {Math.round(v)}%
    </span>
  );
}

const TYPE_META: Record<
  string,
  { sigil: string; banner: string; accent: string }
> = {
  NAMain: {
    sigil: "🏰",
    banner: "Den indre sal",
    accent: "from-primary/20 to-primary/5",
  },
  NAModule1: {
    sigil: "❄️",
    banner: "Ute-vakten",
    accent: "from-sky-500/20 to-sky-500/5",
  },
  NAModule2: {
    sigil: "🌬️",
    banner: "Vindrytter",
    accent: "from-emerald-500/20 to-emerald-500/5",
  },
  NAModule3: {
    sigil: "🌧️",
    banner: "Regnvokter",
    accent: "from-blue-500/20 to-blue-500/5",
  },
  NAModule4: {
    sigil: "🛏️",
    banner: "Sovekammeret",
    accent: "from-purple-500/20 to-purple-500/5",
  },
};

function metaFor(type: string) {
  return (
    TYPE_META[type] ?? {
      sigil: "📜",
      banner: "Ukjent modul",
      accent: "from-muted/40 to-muted/10",
    }
  );
}

function fmt(n: number | undefined, digits = 1, suffix = "") {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

function compass(angle?: number): string {
  if (angle === undefined) return "—";
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return dirs[Math.round(((angle % 360) / 45)) % 8];
}

function ago(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "nå";
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} t siden`;
  return `${Math.round(hrs / 24)} d siden`;
}

function co2Tone(co2?: number): { label: string; cls: string } {
  if (co2 === undefined) return { label: "—", cls: "text-muted-foreground" };
  if (co2 < 800) return { label: "Frisk luft", cls: "text-emerald-400" };
  if (co2 < 1200) return { label: "Tålelig", cls: "text-yellow-400" };
  return { label: "Tungt", cls: "text-destructive" };
}

function ModuleCard({ m }: { m: WeatherModule }) {
  const [unit] = useWindUnit();
  const meta = metaFor(m.type);
  const co2 = co2Tone(m.metrics.co2);
  const isOutdoor = m.type === "NAModule1";
  const isWind = m.type === "NAModule2";
  const isRain = m.type === "NAModule3";

  return (
    <article className="panel rounded-lg overflow-hidden flex flex-col">
      <div
        className={`bg-gradient-to-br ${meta.accent} px-2 py-2 sm:px-4 sm:py-3 border-b border-border flex items-center justify-between gap-1`}
      >
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <span className="text-base sm:text-2xl shrink-0">{meta.sigil}</span>
          <div className="min-w-0">
            <div className="text-[8px] sm:text-[9px] tracking-[0.25em] sm:tracking-[0.3em] uppercase text-primary/80 truncate">
              {meta.banner}
            </div>
            <div className="text-[11px] sm:text-sm text-foreground leading-tight truncate">{m.name}</div>
          </div>
        </div>
        {!m.reachable && (
          <span className="text-[8px] sm:text-[9px] tracking-[0.2em] uppercase text-destructive shrink-0">
            Borte
          </span>
        )}
      </div>

      <div className="p-2 sm:p-4 flex-1 flex flex-col gap-2 sm:gap-3">
        {!isWind && !isRain && m.metrics.temperature !== undefined && (
          <div>
            <div className="flex items-baseline gap-1.5 sm:gap-2 flex-wrap">
              <span className="text-display text-xl sm:text-3xl text-foreground leading-none">
                {fmt(m.metrics.temperature, 1)}°
              </span>
              {m.metrics.humidity !== undefined && (
                <span className="text-[11px] sm:text-sm text-muted-foreground">
                  {fmt(m.metrics.humidity, 0, "%")} fukt
                </span>
              )}
            </div>
            {(m.metrics.minTemp !== undefined || m.metrics.maxTemp !== undefined) && (
              <div className="text-[9px] sm:text-[10px] tracking-[0.15em] sm:tracking-[0.2em] uppercase text-muted-foreground mt-0.5 sm:mt-1">
                ▼ {fmt(m.metrics.minTemp, 1)}° &nbsp;·&nbsp; ▲{" "}
                {fmt(m.metrics.maxTemp, 1)}°
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px]">
          {m.metrics.co2 !== undefined && (
            <Stat
              label="CO₂"
              value={`${m.metrics.co2} ppm`}
              hint={co2.label}
              hintCls={co2.cls}
            />
          )}
          {m.metrics.noise !== undefined && (
            <Stat label="Lyd" value={`${m.metrics.noise} dB`} />
          )}
          {m.metrics.pressure !== undefined && (
            <Stat label="Trykk" value={`${fmt(m.metrics.pressure, 0)} mb`} />
          )}
          {isOutdoor && m.metrics.humidity !== undefined && m.metrics.temperature === undefined && (
            <Stat label="Fukt" value={fmt(m.metrics.humidity, 0, "%")} />
          )}
          {isWind && (
            <>
              <Stat
                label="Vind"
                value={formatWindFromKmh(m.metrics.windStrength, unit, { digits: 0 })}
                hint={compass(m.metrics.windAngle)}
              />
              <Stat
                label="Kast"
                value={formatWindFromKmh(m.metrics.gustStrength, unit, { digits: 0 })}
                hint={compass(m.metrics.gustAngle)}
              />
            </>
          )}
          {isRain && (
            <>
              <Stat label="Siste time" value={`${fmt(m.metrics.rain, 1)} mm`} />
              <Stat label="Siste døgn" value={`${fmt(m.metrics.rainDay, 1)} mm`} />
            </>
          )}
        </div>
      </div>

      <div className="px-2 py-1.5 sm:px-4 sm:py-2 border-t border-border flex items-center justify-between text-[9px] sm:text-[10px] tracking-[0.15em] sm:tracking-[0.2em] uppercase text-muted-foreground">
        <span>↻ {ago(m.lastSeen)}</span>
        {m.battery !== undefined && <BatteryFlame value={m.battery} />}
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  hint,
  hintCls,
}: {
  label: string;
  value: string;
  hint?: string;
  hintCls?: string;
}) {
  return (
    <div className="rounded border border-border/60 bg-background/40 px-1.5 py-1 sm:px-2 sm:py-1.5">
      <div className="text-[8px] sm:text-[9px] tracking-[0.2em] sm:tracking-[0.25em] uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-foreground font-medium text-[11px] sm:text-sm">{value}</div>
      {hint && (
        <div className={`text-[8px] sm:text-[9px] tracking-[0.15em] sm:tracking-[0.2em] uppercase mt-0.5 ${hintCls ?? "text-muted-foreground"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function NetatmoWeatherStationSection({
  title = "Værstasjonen — Tollnes",
  stationMatch,
}: {
  title?: string;
  stationMatch?: string;
} = {}) {
  const fetchData = useServerFn(getNetatmoWeatherStation);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ok"; data: Extract<WeatherStationResult, { ok: true }> }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const inFlight = useRef(false);

  const load = async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inFlight.current = true;
    try {
      const res = await fetchData({ data: { stationMatch } });
      if (res.ok) {
        setState({ status: "ok", data: res });
      } else {
        setState((prev) =>
          prev.status === "ok" ? prev : { status: "error", message: res.error },
        );
      }
    } catch (e: any) {
      setState((prev) =>
        prev.status === "ok"
          ? prev
          : { status: "error", message: e?.message ?? "Ukjent feil" },
      );
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

  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="ornate-divider mb-8">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          {title}
        </span>
      </div>

      {state.status === "loading" && (
        <div className="text-center text-xs tracking-[0.3em] uppercase text-muted-foreground">
          Sender ravn til værstasjonen…
        </div>
      )}

      {state.status === "error" && (
        <div className="panel rounded-lg p-6 text-center">
          <div className="text-xs tracking-[0.3em] text-destructive uppercase mb-2">
            Værstasjonen tier
          </div>
          <p className="text-xs text-muted-foreground">{state.message}</p>
        </div>
      )}

      {state.status === "ok" && (
        <>
          <div className="grid gap-2 sm:gap-4 grid-cols-2 lg:grid-cols-3">
            {state.data.modules.map((m) => (
              <ModuleCard key={m.id} m={m} />
            ))}
          </div>
          <div className="text-center mt-4 text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            {state.data.stationName} · oppdatert {ago(state.data.fetchedAt)}
          </div>
        </>
      )}
    </section>
  );
}
