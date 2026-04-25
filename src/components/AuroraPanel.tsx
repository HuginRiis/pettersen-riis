/**
 * AuroraPanel — Nordlysvarsling for Hytta (Lyngdal i Numedal, ~60°N).
 *
 * Datakilder (gratis, ingen nøkkel):
 *  - NOAA SWPC Kp (siste 1-min estimat):
 *      https://services.swpc.noaa.gov/json/planetary_k_index_1m.json
 *  - NOAA SWPC Kp 3-døgns prognose (3-timers blokker):
 *      https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
 *  - NOAA SWPC OVATION aurora (sannsynlighet i %, samme kilde Aurora Now bruker):
 *      https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
 *  - NOAA SWPC sanntids solvind (DSCOVR/ACE plasma + magnetfelt):
 *      https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json
 *      https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json
 *  - MET Norway locationforecast (skydekke + temp, samme API som ellers på siden):
 *      https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=&lon=
 *  - Soloppgang/-nedgang via NOAA solformel (lokal beregning, ingen API).
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCw, Wind, Cloud, Moon } from "lucide-react";

// Hytta: Øvre Bjørkesetvegen 122, Lyngdal i Numedal (~60.05°N, 9.10°E)
const HYTTA_LAT = 60.05;
const HYTTA_LON = 9.10;

type KpNow = { kp: number; observedAt: string };
type KpForecast = {
  timeTag: string;
  kp: number;
  obsOrPredicted: "observed" | "estimated" | "predicted";
};
type SolarWind = {
  bz: number | null; // nT (negative = sør, bra for nordlys)
  bt: number | null; // nT (total magnetfelt)
  speed: number | null; // km/s
  density: number | null; // p/cm³
  observedAt: string;
};
type CloudHour = { time: string; cloudPct: number };
type Ovation = {
  // Aggregert sannsynlighet (%) i sør-Norge-båndet rundt Hytta
  probabilityHere: number;
  observedAt: string;
};
type LongRangeDay = {
  date: Date;        // UTC dato (00:00 UTC)
  largestKp: number; // 0..9
  aIndex: number;    // planetary A index
};

type FetchState =
  | { status: "loading" }
  | {
      status: "ready";
      now: KpNow;
      forecast: KpForecast[];
      wind: SolarWind | null;
      ovation: Ovation | null;
      clouds: CloudHour[];
      sun: { sunset: Date | null; sunrise: Date | null };
      longRange: LongRangeDay[];
    }
  | { status: "error"; message: string };

function classifyKp(kp: number, lat: number) {
  if (kp < 3) {
    return {
      level: "minimal" as const,
      label: "Stille himmel",
      color: "oklch(0.55 0.04 240)",
      prose: `Den nordlige himmel hviler. Liten sjanse for nordlys ved ${lat.toFixed(0)}°N i natt.`,
    };
  }
  if (kp < 4) {
    return {
      level: "mulig" as const,
      label: "Spirende uro",
      color: "oklch(0.70 0.12 160)",
      prose: "Svake bånd kan vise seg lavt mot nord — om himmelen er klar og mørk.",
    };
  }
  if (kp < 5) {
    return {
      level: "god" as const,
      label: "Lysene våkner",
      color: "oklch(0.78 0.18 145)",
      prose: "Gode utsikter til synlig nordlys over Hytta. Mørke himler nordover anbefales.",
    };
  }
  if (kp < 6) {
    return {
      level: "sterk" as const,
      label: "Storm i himmelen",
      color: "oklch(0.78 0.20 130)",
      prose: "Geomagnetisk storm — nordlyset kan danse rett over hodet. Ut av peisens varme!",
    };
  }
  return {
    level: "ekstrem" as const,
    label: "Himmelens flammer",
    color: "oklch(0.75 0.22 25)",
    prose: "Ekstrem aktivitet — sjelden og spektakulær. Grip kappen, kall ravnene og se opp.",
  };
}

function formatOsloTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("nb-NO", {
      timeZone: "Europe/Oslo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatOsloDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("nb-NO", {
      timeZone: "Europe/Oslo",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatOsloHM(iso: string | Date): string {
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    return new Intl.DateTimeFormat("nb-NO", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(iso);
  }
}

// --- Soloppgang/-nedgang (NOAA solar position, presisjon ±1 min) ---
function sunTimes(date: Date, lat: number, lon: number): { sunrise: Date | null; sunset: Date | null } {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  // Dager siden 2000-01-01 12:00 UT
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0 + 0.0008;

  function calc(isSunset: boolean): Date | null {
    const Jstar = n - lon / 360;
    const M = (357.5291 + 0.98560028 * Jstar) % 360;
    const Mrad = M * rad;
    const C = 1.9148 * Math.sin(Mrad) + 0.02 * Math.sin(2 * Mrad) + 0.0003 * Math.sin(3 * Mrad);
    const lambda = (M + C + 180 + 102.9372) % 360;
    const lamRad = lambda * rad;
    const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(Mrad) - 0.0069 * Math.sin(2 * lamRad);
    const sinDec = Math.sin(lamRad) * Math.sin(23.44 * rad);
    const dec = Math.asin(sinDec);
    const cosH =
      (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) /
      (Math.cos(lat * rad) * Math.cos(dec));
    if (cosH > 1 || cosH < -1) return null; // polarnatt/-dag
    const H = Math.acos(cosH) * deg;
    const Jevent = isSunset ? Jtransit + H / 360 : Jtransit - H / 360;
    return new Date((Jevent - 2440587.5) * 86400000);
  }

  return { sunrise: calc(false), sunset: calc(true) };
}

async function fetchAuroraData(): Promise<{
  now: KpNow;
  forecast: KpForecast[];
  wind: SolarWind | null;
  ovation: Ovation | null;
  clouds: CloudHour[];
  sun: { sunset: Date | null; sunrise: Date | null };
  longRange: LongRangeDay[];
}> {
  // 1) Kp nå
  const nowRes = await fetch(
    "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
    { cache: "no-store" },
  );
  if (!nowRes.ok) throw new Error(`Kp-now HTTP ${nowRes.status}`);
  const nowJson = (await nowRes.json()) as Array<{
    time_tag?: string;
    kp_index?: number;
    estimated_kp?: number;
  }>;
  if (!Array.isArray(nowJson) || nowJson.length === 0) throw new Error("Tomt Kp-svar");
  const last = nowJson[nowJson.length - 1] ?? {};
  const kpVal =
    typeof last.estimated_kp === "number"
      ? last.estimated_kp
      : typeof last.kp_index === "number"
        ? last.kp_index
        : NaN;
  if (!Number.isFinite(kpVal)) throw new Error("Ugyldig Kp-verdi");
  const kpNow: KpNow = {
    kp: kpVal,
    observedAt: typeof last.time_tag === "string" ? last.time_tag : new Date().toISOString(),
  };

  // 2) Kp prognose
  const fcRes = await fetch(
    "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
    { cache: "no-store" },
  );
  if (!fcRes.ok) throw new Error(`Kp-forecast HTTP ${fcRes.status}`);
  const fcJson = (await fcRes.json()) as Array<Array<unknown>>;
  const rows = Array.isArray(fcJson) ? fcJson.slice(1) : [];
  const nowMs = Date.now();
  const horizonMs = nowMs + 1000 * 60 * 60 * 72;
  const forecast: KpForecast[] = rows
    .map((r): KpForecast | null => {
      if (!Array.isArray(r)) return null;
      const timeTagRaw = r[0];
      const kp = Number(r[1]);
      const obsRaw = r[2];
      if (typeof timeTagRaw !== "string" || timeTagRaw.length === 0) return null;
      if (!Number.isFinite(kp)) return null;
      const obs = (typeof obsRaw === "string" ? obsRaw : "predicted").toLowerCase() as KpForecast["obsOrPredicted"];
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

  // 3) OVATION (kan feile uten å rive ned panelet)
  let ovation: Ovation | null = null;
  try {
    const ovRes = await fetch(
      "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
      { cache: "no-store" },
    );
    if (ovRes.ok) {
      const ov = (await ovRes.json()) as {
        "Observation Time"?: string;
        "Forecast Time"?: string;
        coordinates?: Array<[number, number, number]>; // [lon(0..359), lat(-90..90), aurora%]
      };
      const coords = Array.isArray(ov.coordinates) ? ov.coordinates : [];
      // Hent maks-sannsynlighet i ±2° lat × ±5° lon rundt Hytta
      const lonTarget = ((HYTTA_LON % 360) + 360) % 360;
      let maxP = 0;
      for (const c of coords) {
        if (!Array.isArray(c) || c.length < 3) continue;
        const [lon, lat, p] = c;
        if (typeof lon !== "number" || typeof lat !== "number" || typeof p !== "number") continue;
        if (Math.abs(lat - HYTTA_LAT) > 2) continue;
        const dLon = Math.abs(((lon - lonTarget + 540) % 360) - 180);
        if (dLon > 5) continue;
        if (p > maxP) maxP = p;
      }
      ovation = {
        probabilityHere: Math.round(maxP),
        observedAt: ov["Forecast Time"] ?? ov["Observation Time"] ?? new Date().toISOString(),
      };
    }
  } catch {
    ovation = null;
  }

  // 4) Solvind: Bz (mag) + speed/density (plasma)
  let wind: SolarWind | null = null;
  try {
    const [magRes, plasmaRes] = await Promise.all([
      fetch("https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json", { cache: "no-store" }),
      fetch("https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json", { cache: "no-store" }),
    ]);
    let bz: number | null = null;
    let bt: number | null = null;
    let observedAt = new Date().toISOString();
    if (magRes.ok) {
      const mag = (await magRes.json()) as Array<Array<unknown>>;
      // Header: ["time_tag","bx_gsm","by_gsm","bz_gsm","lon_gsm","lat_gsm","bt"]
      for (let i = mag.length - 1; i >= 1; i--) {
        const r = mag[i];
        if (!Array.isArray(r)) continue;
        const t = r[0];
        const bzV = Number(r[3]);
        const btV = Number(r[6]);
        if (typeof t === "string" && Number.isFinite(bzV)) {
          bz = bzV;
          bt = Number.isFinite(btV) ? btV : null;
          observedAt = t.includes("T") ? `${t}Z` : `${t.replace(" ", "T")}Z`;
          break;
        }
      }
    }
    let speed: number | null = null;
    let density: number | null = null;
    if (plasmaRes.ok) {
      const plasma = (await plasmaRes.json()) as Array<Array<unknown>>;
      // Header: ["time_tag","density","speed","temperature"]
      for (let i = plasma.length - 1; i >= 1; i--) {
        const r = plasma[i];
        if (!Array.isArray(r)) continue;
        const d = Number(r[1]);
        const s = Number(r[2]);
        if (Number.isFinite(s)) {
          speed = s;
          density = Number.isFinite(d) ? d : null;
          break;
        }
      }
    }
    if (bz !== null || speed !== null) {
      wind = { bz, bt, speed, density, observedAt };
    }
  } catch {
    wind = null;
  }

  // 5) Skydekke fra MET (samme API som siden bruker ellers)
  const clouds: CloudHour[] = [];
  try {
    const metRes = await fetch(
      `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${HYTTA_LAT}&lon=${HYTTA_LON}`,
      { headers: { accept: "application/json" } },
    );
    if (metRes.ok) {
      const met = (await metRes.json()) as {
        properties?: { timeseries?: Array<{ time?: string; data?: { instant?: { details?: { cloud_area_fraction?: number } } } }> };
      };
      const ts = met.properties?.timeseries ?? [];
      // Hent ~96 timer for å dekke skydekke for de neste 3-4 nettene
      for (const t of ts.slice(0, 96)) {
        const time = t.time;
        const c = t.data?.instant?.details?.cloud_area_fraction;
        if (typeof time === "string" && typeof c === "number") {
          clouds.push({ time, cloudPct: c });
        }
      }
    }
  } catch {
    /* ignorer — værdata er ikke kritisk */
  }

  // 6) Sol opp/ned for i kveld/natt
  const today = new Date();
  const tonight = sunTimes(today, HYTTA_LAT, HYTTA_LON);
  const tomorrow = new Date(today.getTime() + 86400000);
  const tomorrowTimes = sunTimes(tomorrow, HYTTA_LAT, HYTTA_LON);
  const sun = {
    sunset: tonight.sunset,
    sunrise: tomorrowTimes.sunrise ?? tonight.sunrise,
  };

  // 7) NOAA 27-dagers prognose (daglig "Largest Kp")
  const longRange: LongRangeDay[] = [];
  try {
    const lrRes = await fetch(
      "https://services.swpc.noaa.gov/text/27-day-outlook.txt",
      { cache: "no-store" },
    );
    if (lrRes.ok) {
      const text = await lrRes.text();
      const lines = text.split("\n");
      const monthMap: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      };
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || line.startsWith(":")) continue;
        // Format: "2026 Apr 20     105          18          4"
        const m = line.match(/^(\d{4})\s+(\w{3})\s+(\d{1,2})\s+(\d+)\s+(\d+)\s+(\d+)\s*$/);
        if (!m) continue;
        const year = Number(m[1]);
        const mon = monthMap[m[2]!];
        const day = Number(m[3]);
        const aIndex = Number(m[5]);
        const largestKp = Number(m[6]);
        if (mon === undefined || !Number.isFinite(year) || !Number.isFinite(day)) continue;
        const date = new Date(Date.UTC(year, mon, day));
        longRange.push({ date, largestKp, aIndex });
      }
    }
  } catch {
    /* ignorer — langtidsprognose er ikke kritisk */
  }

  return { now: kpNow, forecast, wind, ovation, clouds, sun, longRange };
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

  // Vurder visuell sjanse i natt: kombiner Kp/OVATION med skydekke i mørketiden
  const tonightVerdict = useMemo(() => {
    if (state.status !== "ready") return null;
    const { sun, clouds, now, ovation } = state;
    if (!sun.sunset || !sun.sunrise) return null;
    const darkClouds = clouds.filter((c) => {
      const t = new Date(c.time).getTime();
      return t >= sun.sunset!.getTime() && t <= sun.sunrise!.getTime();
    });
    const avgCloud = darkClouds.length
      ? Math.round(darkClouds.reduce((s, c) => s + c.cloudPct, 0) / darkClouds.length)
      : null;
    const auroraPotential = ovation ? Math.max(now.kp * 12, ovation.probabilityHere) : now.kp * 12;
    const skyClearFactor = avgCloud === null ? 0.6 : Math.max(0, 1 - avgCloud / 100);
    const score = Math.round(auroraPotential * skyClearFactor);
    let verdict = "Liten sjanse i natt";
    let color = "oklch(0.55 0.04 240)";
    if (score >= 50) {
      verdict = "Stor sjanse — opp på taket!";
      color = "oklch(0.78 0.20 130)";
    } else if (score >= 30) {
      verdict = "God mulighet — hold utkikk";
      color = "oklch(0.78 0.18 145)";
    } else if (score >= 15) {
      verdict = "Mulig svake bånd";
      color = "oklch(0.70 0.12 160)";
    }
    return { score, verdict, color, avgCloud };
  }, [state]);

  return (
    <section className="container mx-auto px-4 pb-12">
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Nordlysets Vakt
        </span>
      </div>

      <div className="panel rounded-lg p-5 sm:p-7 relative overflow-hidden glow-on-hover">
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
            <p className="text-muted-foreground italic">Henter ravner fra NOAA og MET…</p>
          )}

          {state.status === "error" && (
            <p className="text-sm text-destructive">
              Ravnene fant ikke veien hjem: {state.message}
            </p>
          )}

          {state.status === "ready" && (
            <div className="space-y-5">
              <NowCard kp={state.now.kp} observedAt={state.now.observedAt} />

              {tonightVerdict && (
                <TonightCard
                  verdict={tonightVerdict.verdict}
                  color={tonightVerdict.color}
                  score={tonightVerdict.score}
                  avgCloud={tonightVerdict.avgCloud}
                  sunset={state.sun.sunset}
                  sunrise={state.sun.sunrise}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {state.ovation && <OvationCard ovation={state.ovation} />}
                {state.wind && <SolarWindCard wind={state.wind} />}
              </div>

              {peak && peak.kp >= 3 && <PeakCard peak={peak} />}

              <NightlyOutlook forecast={state.forecast} clouds={state.clouds} />

              <MultiDayKpChart forecast={state.forecast} />

              <ForecastTimeline forecast={state.forecast} />

              <p className="text-[11px] text-muted-foreground/70 italic pt-1 border-t border-border/40">
                Kilder: NOAA SWPC (Kp · OVATION · DSCOVR solvind) og MET Norway (skydekke).
                Nordlys krever klar himmel og mørke — vurderingen kombinerer alle fire.
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
            <div className="text-medieval text-5xl leading-none" style={{ color: c.color }}>
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

function TonightCard({
  verdict,
  color,
  score,
  avgCloud,
  sunset,
  sunrise,
}: {
  verdict: string;
  color: string;
  score: number;
  avgCloud: number | null;
  sunset: Date | null;
  sunrise: Date | null;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${color} 14%, transparent), transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 30%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Moon className="h-4 w-4" style={{ color }} />
        <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80">
          I natt over Hytta
        </div>
      </div>
      <div className="text-medieval text-xl mb-2" style={{ color }}>
        {verdict}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat
          icon={<Sparkles className="h-3 w-3" />}
          label="Sjanse-poeng"
          value={`${score}`}
        />
        <Stat
          icon={<Cloud className="h-3 w-3" />}
          label="Snittsky natt"
          value={avgCloud === null ? "—" : `${avgCloud}%`}
        />
        <Stat
          icon={<Moon className="h-3 w-3" />}
          label="Mørketid"
          value={sunset && sunrise ? `${formatOsloHM(sunset)}–${formatOsloHM(sunrise)}` : "—"}
        />
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded bg-card/40 border border-border/50 p-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-foreground/95 text-sm tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function OvationCard({ ovation }: { ovation: Ovation }) {
  const p = ovation.probabilityHere;
  const color =
    p >= 40 ? "oklch(0.78 0.20 130)" : p >= 20 ? "oklch(0.78 0.18 145)" : p >= 8 ? "oklch(0.70 0.12 160)" : "oklch(0.55 0.04 240)";
  return (
    <div className="rounded-lg p-4 bg-card/40 border border-border/60">
      <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80 mb-1">
        OVATION · sannsynlighet her
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-medieval text-3xl" style={{ color }}>
          {p}%
        </div>
        <div className="text-xs text-muted-foreground">aurora over Hytta nå</div>
      </div>
      <div className="mt-2 h-1.5 rounded bg-border/50 overflow-hidden">
        <div
          className="h-full rounded transition-all"
          style={{ width: `${Math.min(100, p)}%`, background: color }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground/70 mt-2">
        Modell: {formatOsloDateTime(ovation.observedAt)}
      </div>
    </div>
  );
}

function SolarWindCard({ wind }: { wind: SolarWind }) {
  const bzGood = wind.bz !== null && wind.bz <= -5;
  const bzMaybe = wind.bz !== null && wind.bz <= -2;
  const bzColor = bzGood
    ? "oklch(0.78 0.20 130)"
    : bzMaybe
      ? "oklch(0.78 0.18 145)"
      : "oklch(0.55 0.04 240)";
  return (
    <div className="rounded-lg p-4 bg-card/40 border border-border/60">
      <div className="flex items-center gap-2 mb-1">
        <Wind className="h-3.5 w-3.5 text-primary/80" />
        <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80">
          Solvind · DSCOVR
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Bz</div>
          <div className="text-medieval text-xl tabular-nums" style={{ color: bzColor }}>
            {wind.bz === null ? "—" : `${wind.bz.toFixed(1)}`}
          </div>
          <div className="text-[9px] text-muted-foreground">nT</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Fart</div>
          <div className="text-medieval text-xl tabular-nums text-foreground/95">
            {wind.speed === null ? "—" : `${Math.round(wind.speed)}`}
          </div>
          <div className="text-[9px] text-muted-foreground">km/s</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Tetthet</div>
          <div className="text-medieval text-xl tabular-nums text-foreground/95">
            {wind.density === null ? "—" : wind.density.toFixed(1)}
          </div>
          <div className="text-[9px] text-muted-foreground">p/cm³</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/85 mt-2 leading-snug">
        {bzGood
          ? "Bz peker sør — magnetfeltet kobler seg på, nordlys kan blomstre."
          : bzMaybe
            ? "Bz svakt sør — koblingen er lunken, hold et øye med utviklingen."
            : "Bz nord — solvinden glir forbi uten å vekke himmelen."}
      </p>
      <div className="text-[10px] text-muted-foreground/70 mt-1">
        {formatOsloDateTime(wind.observedAt)}
      </div>
    </div>
  );
}

function PeakCard({ peak }: { peak: KpForecast }) {
  const c = classifyKp(peak.kp, HYTTA_LAT);
  return (
    <div className="rounded-lg p-4 border border-border/60 bg-card/40">
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

// --- Per-natt-utsikt: høyeste Kp i mørketiden, kombinert med skydekke ---
type NightSummary = {
  dateLabel: string;          // "I natt", "Natt til ons" osv.
  sunset: Date;
  sunrise: Date;
  peakKp: number | null;
  peakAt: Date | null;
  avgCloud: number | null;    // %
  score: number;              // 0..100
};

function buildNightlyOutlook(
  forecast: KpForecast[],
  clouds: CloudHour[],
): NightSummary[] {
  const out: NightSummary[] = [];
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const t = sunTimes(d, HYTTA_LAT, HYTTA_LON);
    const next = sunTimes(new Date(d.getTime() + 86400000), HYTTA_LAT, HYTTA_LON);
    const sunset = t.sunset;
    const sunrise = next.sunrise ?? t.sunrise;
    if (!sunset || !sunrise) continue;
    if (sunrise.getTime() < Date.now()) continue; // natten er over

    // Høyeste Kp-prognose i dette mørke-vinduet
    let peakKp: number | null = null;
    let peakAt: Date | null = null;
    for (const f of forecast) {
      const ft = new Date(f.timeTag).getTime();
      if (ft < sunset.getTime() || ft > sunrise.getTime()) continue;
      if (peakKp === null || f.kp > peakKp) {
        peakKp = f.kp;
        peakAt = new Date(ft);
      }
    }

    // Snittsky i samme vindu (MET-data dekker ~24 t — kan mangle for natt 2-3)
    const cloudPts = clouds.filter((c) => {
      const ct = new Date(c.time).getTime();
      return ct >= sunset.getTime() && ct <= sunrise.getTime();
    });
    const avgCloud = cloudPts.length
      ? Math.round(cloudPts.reduce((s, c) => s + c.cloudPct, 0) / cloudPts.length)
      : null;

    const skyClear = avgCloud === null ? 0.6 : Math.max(0, 1 - avgCloud / 100);
    const auroraPotential = peakKp !== null ? peakKp * 12 : 0;
    const score = Math.round(auroraPotential * skyClear);

    let label: string;
    if (i === 0) label = "I natt";
    else {
      const wd = new Intl.DateTimeFormat("nb-NO", {
        timeZone: "Europe/Oslo",
        weekday: "short",
      }).format(sunset);
      label = `Natt til ${wd}`;
    }

    out.push({
      dateLabel: label,
      sunset,
      sunrise,
      peakKp,
      peakAt,
      avgCloud,
      score,
    });
  }
  return out;
}

function NightlyOutlook({
  forecast,
  clouds,
}: {
  forecast: KpForecast[];
  clouds: CloudHour[];
}) {
  const nights = useMemo(() => buildNightlyOutlook(forecast, clouds), [forecast, clouds]);
  if (nights.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80 mb-2">
        Sjanse de neste nettene · Hytta
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {nights.map((n, i) => {
          const c = n.peakKp !== null ? classifyKp(n.peakKp, HYTTA_LAT) : null;
          const scoreColor =
            n.score >= 50
              ? "oklch(0.78 0.20 130)"
              : n.score >= 30
                ? "oklch(0.78 0.18 145)"
                : n.score >= 15
                  ? "oklch(0.70 0.12 160)"
                  : "oklch(0.55 0.04 240)";
          return (
            <div
              key={i}
              className="rounded-lg p-3 bg-card/40 border border-border/60"
            >
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="text-[10px] tracking-[0.25em] uppercase text-foreground/85">
                  {n.dateLabel}
                </div>
                <div
                  className="text-medieval text-xs tabular-nums"
                  style={{ color: scoreColor }}
                  title="Sjanse-poeng (Kp × klarhet)"
                >
                  {n.score}
                </div>
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <div
                  className="text-medieval text-2xl tabular-nums"
                  style={{ color: c?.color ?? "oklch(0.55 0.04 240)" }}
                >
                  Kp {n.peakKp !== null ? n.peakKp.toFixed(0) : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {n.peakAt ? `kl. ${formatOsloHM(n.peakAt)}` : "—"}
                </div>
              </div>

              {/* Sjanse-bar */}
              <div className="h-1.5 rounded bg-border/50 overflow-hidden mb-2">
                <div
                  className="h-full rounded transition-all"
                  style={{ width: `${Math.min(100, n.score)}%`, background: scoreColor }}
                />
              </div>

              <div className="flex items-center justify-between text-[9px] tracking-[0.15em] uppercase text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Cloud className="h-2.5 w-2.5" />
                  {n.avgCloud === null ? "—" : `${n.avgCloud}% sky`}
                </span>
                <span className="flex items-center gap-1">
                  <Moon className="h-2.5 w-2.5" />
                  {formatOsloHM(n.sunset)}–{formatOsloHM(n.sunrise)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- 3-dagers Kp-prognose med dato-skille og natt-skygger ---
function MultiDayKpChart({ forecast }: { forecast: KpForecast[] }) {
  if (forecast.length === 0) return null;

  // Bygg natt-vinduer for skygging i bakgrunnen
  const nights = useMemo(() => {
    const list: Array<{ start: number; end: number }> = [];
    const today = new Date();
    for (let i = -1; i < 4; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const t = sunTimes(d, HYTTA_LAT, HYTTA_LON);
      const next = sunTimes(new Date(d.getTime() + 86400000), HYTTA_LAT, HYTTA_LON);
      if (t.sunset && next.sunrise) {
        list.push({ start: t.sunset.getTime(), end: next.sunrise.getTime() });
      }
    }
    return list;
  }, []);

  const items = forecast;
  const maxKp = Math.max(5, ...items.map((f) => f.kp));
  const startMs = new Date(items[0]!.timeTag).getTime();
  const endMs = new Date(items[items.length - 1]!.timeTag).getTime() + 3 * 60 * 60 * 1000;
  const span = Math.max(1, endMs - startMs);

  // Dato-grupper for x-aksen
  const dateLabels = new Map<string, { left: number; label: string }>();
  for (const f of items) {
    const t = new Date(f.timeTag);
    const key = new Intl.DateTimeFormat("nb-NO", {
      timeZone: "Europe/Oslo",
      day: "2-digit",
      month: "2-digit",
    }).format(t);
    if (!dateLabels.has(key)) {
      const left = ((t.getTime() - startMs) / span) * 100;
      dateLabels.set(key, { left, label: key });
    }
  }

  return (
    <div>
      <div className="text-[10px] tracking-[0.3em] uppercase text-primary/80 mb-2">
        3-dagers Kp-prognose · m/ natt-vinduer
      </div>
      <div className="relative rounded-lg border border-border/60 bg-card/30 p-3 pb-7">
        {/* Y-akse referanselinjer (Kp 5 = G1 storm) */}
        <div className="relative h-32">
          {/* Natt-vinduer som skyggebakgrunn */}
          {nights.map((n, i) => {
            const left = ((n.start - startMs) / span) * 100;
            const width = ((n.end - n.start) / span) * 100;
            if (left + width < 0 || left > 100) return null;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: `${Math.max(0, left)}%`,
                  width: `${Math.min(100, left + width) - Math.max(0, left)}%`,
                  background:
                    "linear-gradient(180deg, oklch(0.45 0.10 280 / 0.18), oklch(0.30 0.06 280 / 0.10))",
                }}
                title="Mørketid (best for nordlys)"
              />
            );
          })}

          {/* Kp 5 referanselinje */}
          <div
            className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
            style={{
              bottom: `${(5 / maxKp) * 100}%`,
              borderColor: "oklch(0.78 0.20 130 / 0.4)",
            }}
          >
            <span className="absolute -top-3 right-0 text-[8px] uppercase tracking-wider text-primary/70 bg-card/70 px-1 rounded-sm">
              Kp 5 · storm
            </span>
          </div>

          {/* Søyler */}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {items.map((f, i) => {
              const c = classifyKp(f.kp, HYTTA_LAT);
              const heightPct = Math.max(6, (f.kp / maxKp) * 100);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-all relative group"
                  style={{
                    height: `${heightPct}%`,
                    background: c.color,
                    opacity: f.obsOrPredicted === "observed" ? 1 : 0.7,
                    minWidth: "4px",
                  }}
                  title={`${formatOsloDateTime(f.timeTag)} — Kp ${f.kp.toFixed(0)} (${c.label})`}
                />
              );
            })}
          </div>
        </div>

        {/* X-akse: dato-merker */}
        <div className="relative h-4 mt-1">
          {Array.from(dateLabels.values()).map((d, i) => (
            <div
              key={i}
              className="absolute top-0 text-[9px] tabular-nums text-muted-foreground"
              style={{ left: `${d.left}%` }}
            >
              <div className="w-px h-1 bg-border/60 mb-0.5" />
              {d.label}
            </div>
          ))}
        </div>

        {/* Tegnforklaring */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[9px] uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ background: "oklch(0.45 0.10 280 / 0.4)" }}
            />
            Mørketid
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ background: "oklch(0.78 0.20 130)" }}
            />
            Storm (Kp ≥ 5)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-0.5 border-t border-dashed border-primary/60" />
            Observert vs. predikert (mørkere)
          </span>
        </div>
      </div>
    </div>
  );
}
