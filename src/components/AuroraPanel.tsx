/**
 * AuroraPanel — Nordlysvarsling for Hytta (Lyngdal i Numedal, ~60°N).
 *
 * Datakilder (gratis, ingen nøkkel):
 *  - NOAA SWPC: https://services.swpc.noaa.gov/json/planetary_k_index_1m.json
 *      (siste 1-min Kp-estimat, oppdateres kontinuerlig)
 *  - NOAA SWPC: https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
 *      (3-døgns Kp-prognose i 3-timers blokker)
 *
 * Synlighetsterskel for sør-Norge (~60°N): Kp ≥ 4 = mulig, Kp ≥ 5 = god, Kp ≥ 6 = sterk.
 *
 * Stilen følger borgens GoT-tema (panel + ornate-divider + medieval typografi).
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";

// Hytta: Øvre Bjørkesetvegen 122, Lyngdal i Numedal, ~60°N
const HYTTA_LAT = 60.0;

type KpNow = {
  kp: number;
  observedAt: string; // ISO
};

type KpForecast = {
  timeTag: string; // ISO
  kp: number;
  obsOrPredicted: "observed" | "estimated" | "predicted";
};

type FetchState =
  | { status: "loading" }
  | { status: "ready"; now: KpNow; forecast: KpForecast[] }
  | { status: "error"; message: string };

function classifyKp(kp: number, lat: number): {
  level: "minimal" | "mulig" | "god" | "sterk" | "ekstrem";
  label: string;
  color: string; // CSS color
  prose: string;
} {
  // Tilpasset for sør-Norge (~60°N). Auroral oval krysser ~60°N rundt Kp 4–5.
  if (kp < 3) {
    return {
      level: "minimal",
      label: "Stille himmel",
      color: "oklch(0.55 0.04 240)",
      prose: `Den nordlige himmel hviler. Liten sjanse for nordlys ved ${lat.toFixed(0)}°N i natt.`,
    };
  }
  if (kp < 4) {
    return {
      level: "mulig",
      label: "Spirende uro",
      color: "oklch(0.70 0.12 160)",
      prose: "Svake bånd kan vise seg lavt mot nord — om himmelen er klar og mørk.",
    };
  }
  if (kp < 5) {
    return {
      level: "god",
      label: "Lysene våkner",
      color: "oklch(0.78 0.18 145)",
      prose: "Gode utsikter til synlig nordlys over Hytta. Mørke himler nordover anbefales.",
    };
  }
  if (kp < 6) {
    return {
      level: "sterk",
      label: "Storm i himmelen",
      color: "oklch(0.78 0.20 130)",
      prose: "Geomagnetisk storm — nordlyset kan danse rett over hodet. Ut av peisens varme!",
    };
  }
  return {
    level: "ekstrem",
    label: "Himmelens flammer",
    color: "oklch(0.75 0.22 25)",
    prose: "Ekstrem aktivitet — sjelden og spektakulær. Grip kappen, kall ravnene og se opp.",
  };
}

function formatOsloTime(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("nb-NO", {
      timeZone: "Europe/Oslo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

function formatOsloDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("nb-NO", {
      timeZone: "Europe/Oslo",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

async function fetchAuroraData(): Promise<{ now: KpNow; forecast: KpForecast[] }> {
  // 1) Siste estimerte Kp (1-min)
  const nowRes = await fetch(
    "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
    { cache: "no-store" },
  );
  if (!nowRes.ok) throw new Error(`Kp-now HTTP ${nowRes.status}`);
  const nowJson = (await nowRes.json()) as Array<{
    time_tag: string;
    kp_index: number;
    estimated_kp?: number;
  }>;
  const last = nowJson[nowJson.length - 1];
  const kpNow: KpNow = {
    kp: typeof last.estimated_kp === "number" ? last.estimated_kp : last.kp_index,
    observedAt: last.time_tag,
  };

  // 2) 3-døgns prognose (3-timers blokker). Format: array of arrays.
  // Header: ["time_tag", "kp", "observed", "noaa_scale"]
  const fcRes = await fetch(
    "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
    { cache: "no-store" },
  );
  if (!fcRes.ok) throw new Error(`Kp-forecast HTTP ${fcRes.status}`);
  const fcJson = (await fcRes.json()) as Array<Array<unknown>>;
  const rows = Array.isArray(fcJson) ? fcJson.slice(1) : []; // hopp over header

  const nowMs = Date.now();
  const horizonMs = nowMs + 1000 * 60 * 60 * 48; // 48 timer fram

  const forecast: KpForecast[] = rows
    .map((r): KpForecast | null => {
      if (!Array.isArray(r)) return null;
      const timeTagRaw = r[0];
      const kpRaw = r[1];
      const obsRaw = r[2];
      if (typeof timeTagRaw !== "string" || timeTagRaw.length === 0) return null;
      const kp = Number(kpRaw);
      if (!Number.isFinite(kp)) return null;
      const obs = (typeof obsRaw === "string" ? obsRaw : "predicted").toLowerCase() as KpForecast["obsOrPredicted"];
      // time_tag fra NOAA er UTC uten "Z" — legg til for å unngå tolkning som lokaltid
      const iso =
        timeTagRaw.endsWith("Z") || timeTagRaw.includes("+")
          ? timeTagRaw
          : `${timeTagRaw.replace(" ", "T")}Z`;
      return { timeTag: iso, kp, obsOrPredicted: obs };
    })
    .filter((r): r is KpForecast => {
      if (!r) return false;
      const t = new Date(r.timeTag).getTime();
      return Number.isFinite(t) && t >= nowMs - 1000 * 60 * 60 && t <= horizonMs;
    });


  return { now: kpNow, forecast };
}

export function AuroraPanel() {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchAuroraData()
      .then((data) => {
        if (alive) setState({ status: "ready", ...data });
      })
      .catch((err) => {
        if (alive) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Ukjent feil",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Auto-oppdater hvert 15. minutt
  useEffect(() => {
    const id = setInterval(() => setReloadKey((k) => k + 1), 15 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const peak = useMemo(() => {
    if (state.status !== "ready") return null;
    let best: KpForecast | null = null;
    for (const f of state.forecast) {
      if (!best || f.kp > best.kp) best = f;
    }
    return best;
  }, [state]);

  return (
    <section className="container mx-auto px-4 pb-12">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Nordlysets Vakt
        </span>
      </div>

      <div className="panel rounded-lg p-5 sm:p-7 relative overflow-hidden glow-on-hover">
        {/* Atmosfærisk bakgrunn */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background:
              "radial-gradient(ellipse at 20% 0%, oklch(0.55 0.18 145 / 0.35), transparent 60%), radial-gradient(ellipse at 80% 100%, oklch(0.45 0.18 280 / 0.30), transparent 60%)",
          }}
        />

        <div className="relative">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-[10px] tracking-[0.3em] text-primary/80 uppercase mb-1">
                Hytta · Lyngdal i Numedal
              </div>
              <h3 className="text-medieval text-2xl sm:text-3xl text-foreground leading-tight">
                Nordlysvarsel
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="text-primary/70 hover:text-primary transition-colors p-2 -m-2"
              aria-label="Oppdater nordlysvarsel"
              title="Oppdater"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {state.status === "loading" && (
            <p className="text-muted-foreground italic">Henter ravner fra NOAA…</p>
          )}

          {state.status === "error" && (
            <p className="text-sm text-destructive">
              Ravnene fant ikke veien hjem: {state.message}
            </p>
          )}

          {state.status === "ready" && (
            <div className="space-y-5">
              <NowCard kp={state.now.kp} observedAt={state.now.observedAt} />

              {peak && peak.kp >= 3 && (
                <PeakCard peak={peak} />
              )}

              <ForecastTimeline forecast={state.forecast} />

              <p className="text-[11px] text-muted-foreground/70 italic pt-1 border-t border-border/40">
                Kilde: NOAA Space Weather Prediction Center · Synlighetsvurdering for ~{HYTTA_LAT.toFixed(0)}°N.
                Klar himmel og mørke kreves — sjekk skydekket før du går ut i kappen.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function NowCard({ kp, observedAt }: { kp: number; observedAt: string }) {
  const c = classifyKp(kp, HYTTA_LAT);
  return (
    <div
      className="rounded-lg p-4 sm:p-5"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${c.color} 18%, transparent), color-mix(in oklab, ${c.color} 4%, transparent))`,
        border: `1px solid color-mix(in oklab, ${c.color} 35%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80 mb-1">
            Nå · siste estimat
          </div>
          <div className="flex items-baseline gap-3">
            <div
              className="text-medieval text-5xl leading-none"
              style={{ color: c.color }}
            >
              Kp {kp.toFixed(1)}
            </div>
            <div className="text-medieval text-lg" style={{ color: c.color }}>
              {c.label}
            </div>
          </div>
        </div>
        <Sparkles className="h-8 w-8" style={{ color: c.color }} aria-hidden />
      </div>
      <p className="text-sm text-foreground/90 mt-3 leading-relaxed">{c.prose}</p>
      <div className="text-[11px] text-muted-foreground/70 mt-2">
        Observert: {formatOsloDateTime(observedAt)}
      </div>
    </div>
  );
}

function PeakCard({ peak }: { peak: KpForecast }) {
  const c = classifyKp(peak.kp, HYTTA_LAT);
  return (
    <div className="rounded-lg p-4 panel/50 border border-border/60 bg-card/40">
      <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80 mb-1">
        Neste 48 timer · høyeste prognose
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="text-medieval text-2xl" style={{ color: c.color }}>
          Kp {peak.kp.toFixed(0)}
        </div>
        <div className="text-foreground/90">{formatOsloTime(peak.timeTag)}</div>
        <div className="text-sm text-muted-foreground">— {c.label}</div>
      </div>
    </div>
  );
}

function ForecastTimeline({ forecast }: { forecast: KpForecast[] }) {
  if (forecast.length === 0) return null;

  // Vis maks ~16 blokker (ca. 48 timer × 3-timers blokker)
  const items = forecast.slice(0, 16);
  const maxKp = Math.max(5, ...items.map((f) => f.kp));

  return (
    <div>
      <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80 mb-2">
        Prognose · 3-timers blokker
      </div>
      <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
        {items.map((f, i) => {
          const c = classifyKp(f.kp, HYTTA_LAT);
          const heightPct = Math.max(8, (f.kp / maxKp) * 100);
          return (
            <div
              key={i}
              className="flex flex-col items-center min-w-[36px] flex-1"
              title={`${formatOsloTime(f.timeTag)} — Kp ${f.kp.toFixed(0)} (${c.label})`}
            >
              <div className="text-[9px] text-foreground/80 mb-1 tabular-nums">
                {f.kp.toFixed(0)}
              </div>
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${heightPct}%`,
                  background: c.color,
                  opacity: f.obsOrPredicted === "observed" ? 1 : 0.75,
                }}
              />
              <div className="text-[9px] text-muted-foreground mt-1 whitespace-nowrap">
                {new Intl.DateTimeFormat("nb-NO", {
                  timeZone: "Europe/Oslo",
                  hour: "2-digit",
                }).format(new Date(f.timeTag))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
