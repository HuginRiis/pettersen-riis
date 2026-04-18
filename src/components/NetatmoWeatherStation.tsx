import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getNetatmoWeatherStation,
  type WeatherModule,
  type WeatherStationResult,
} from "@/server/netatmo-weather";

const REFRESH_MS = 5 * 60_000; // 5 min

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
  const meta = metaFor(m.type);
  const co2 = co2Tone(m.metrics.co2);
  const isOutdoor = m.type === "NAModule1";
  const isWind = m.type === "NAModule2";
  const isRain = m.type === "NAModule3";

  return (
    <article className="panel rounded-lg overflow-hidden flex flex-col">
      <div
        className={`bg-gradient-to-br ${meta.accent} px-4 py-3 border-b border-border flex items-center justify-between`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{meta.sigil}</span>
          <div>
            <div className="text-[9px] tracking-[0.3em] uppercase text-primary/80">
              {meta.banner}
            </div>
            <div className="text-sm text-foreground leading-tight">{m.name}</div>
          </div>
        </div>
        {!m.reachable && (
          <span className="text-[9px] tracking-[0.2em] uppercase text-destructive">
            Borte
          </span>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        {!isWind && !isRain && m.metrics.temperature !== undefined && (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-display text-3xl text-foreground">
                {fmt(m.metrics.temperature, 1)}°
              </span>
              {m.metrics.humidity !== undefined && (
                <span className="text-sm text-muted-foreground">
                  {fmt(m.metrics.humidity, 0, "%")} fukt
                </span>
              )}
            </div>
            {(m.metrics.minTemp !== undefined || m.metrics.maxTemp !== undefined) && (
              <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mt-1">
                ▼ {fmt(m.metrics.minTemp, 1)}° &nbsp;·&nbsp; ▲{" "}
                {fmt(m.metrics.maxTemp, 1)}°
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]">
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
                value={`${fmt(m.metrics.windStrength, 0)} km/t`}
                hint={compass(m.metrics.windAngle)}
              />
              <Stat
                label="Kast"
                value={`${fmt(m.metrics.gustStrength, 0)} km/t`}
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

      <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
        <span>↻ {ago(m.lastSeen)}</span>
        {m.battery !== undefined && (
          <span
            className={
              m.battery < 20 ? "text-destructive" : "text-muted-foreground"
            }
          >
            🔋 {m.battery}%
          </span>
        )}
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
    <div className="rounded border border-border/60 bg-background/40 px-2 py-1.5">
      <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-foreground font-medium">{value}</div>
      {hint && (
        <div className={`text-[9px] tracking-[0.2em] uppercase mt-0.5 ${hintCls ?? "text-muted-foreground"}`}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function NetatmoWeatherStationSection() {
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
      const res = await fetchData();
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
  }, []);

  return (
    <section className="container mx-auto px-4 pb-16">
      <div className="ornate-divider mb-8">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Værstasjonen — Tollnes
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
