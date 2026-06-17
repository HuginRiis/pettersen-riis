import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { getHomeySnapshot } from "@/lib/homey.functions";
import { findDeviceFuzzy, type DeviceLike } from "@/lib/homey-match";
import { getTollnesAlerts, type AlertsResult, type MetAlert } from "@/lib/lightning.functions";
import { getNetatmoWeatherStation, type WeatherModule } from "@/lib/netatmo-weather.functions";
import { useUserLocation, UserLocationBar } from "@/hooks/use-user-location";
import { useUvSun, uvLevel } from "@/hooks/use-uv-sun";
import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";
import {
  RainFX, SnowFX, CloudFX, WindFX, HeatwaveFX, HumidityFX, PressureFX, GustFX, SunFX, StarFX,
  GlassPaneFX, glassKindFromSymbol, TileSplashFX,
} from "@/components/weather/WeatherFX";
import { WeatherVideoBackground } from "@/components/weather/WeatherVideoBackground";
import {
  Wind,
  Droplets,
  Eye,
  Gauge,
  Thermometer,
  Sunrise,
  Sun,
  Moon,
  CloudRain,
  TrendingUp,
  AlertTriangle,
  Cloud,
  Map as MapIcon,
  ChevronDown,
  ChevronUp,
  Navigation,
} from "lucide-react";

export const Route = createFileRoute("/var")({
  head: () => ({
    meta: [
      { title: "Vær — Skien & Numedal | House Pettersen Riis" },
      { name: "description", content: "Værmelding, nedbør og vind for Skien og hytta, time for time fra MET.no." },
      { property: "og:title", content: "Vær | House Pettersen Riis" },
      { property: "og:description", content: "iOS-inspirert værvisning med MET.no, Netatmo og UV-indeks." },
    ],
  }),
  staleTime: 3 * 60_000,
  preloadStaleTime: 3 * 60_000,
  loader: async () => {
    const homey = await getHomeySnapshot();
    const netatmo = await getNetatmoWeatherStation({ data: { stationMatch: "tollnes" } }).catch(
      (e) => ({ ok: false as const, error: e?.message ?? "Netatmo-feil" })
    );
    return { homey, netatmo };
  },
  component: WeatherPage,
  errorComponent: ({ error }) => (
    <PageShell>
      <section className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl mb-4 text-white">Værdata utilgjengelig</h1>
        <p className="text-white/70">{error.message}</p>
      </section>
    </PageShell>
  ),
});

const HYTTA_LOC = { key: "hytta", name: "Hytta · Numedal", subtitle: "Lyngdal · Øvre Bjørkesethvegen", lat: 59.92, lon: 9.30 } as const;

type ForecastDay = {
  date: string;
  symbol: string | null;
  tempMin: number;
  tempMax: number;
  precip: number;
  precipProbability: number;
};

type Hour = {
  time: string;
  temp: number;
  precip: number;
  precipProbability: number;
  wind: number;
  windGust: number;
  windDir: number;
  pressure: number;
  humidity: number;
  cloud: number;
  symbol: string | null;
};

type LocationState = {
  days: ForecastDay[] | null;
  hours: Hour[] | null;
  error: string | null;
  loading: boolean;
};

function WeatherPage() {
  const loaderData = Route.useLoaderData() as { homey: Awaited<ReturnType<typeof getHomeySnapshot>>; netatmo: Awaited<ReturnType<typeof getNetatmoWeatherStation>> };
  const data = loaderData.homey;
  const netatmoData = loaderData.netatmo;
  const fetchAlerts = useServerFn(getTollnesAlerts);
  const userLoc = useUserLocation("var");
  const [alerts, setAlerts] = useState<AlertsResult | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [rangeHours, setRangeHours] = useState<24 | 72 | 168>(24);

  const LOCATIONS = useMemo(
    () => [
      { key: "skien" as const, name: userLoc.active.label, subtitle: "Mitt sted · MET.no", lat: userLoc.active.lat, lon: userLoc.active.lon },
      HYTTA_LOC,
    ],
    [userLoc.active.label, userLoc.active.lat, userLoc.active.lon],
  );

  const [state, setState] = useState<Record<string, LocationState>>(() => ({
    skien: { days: null, hours: null, error: null, loading: true },
    hytta: { days: null, hours: null, error: null, loading: true },
  }));

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, skien: { ...s.skien, loading: true, error: null } }));
    LOCATIONS.forEach(async (loc) => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${loc.lat}&lon=${loc.lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("Kunne ikke hente værmelding");
        const json = await res.json();
        if (cancelled) return;
        const { days, hours } = parseForecast(json);
        setState((s) => ({ ...s, [loc.key]: { days, hours, error: null, loading: false } }));
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          [loc.key]: { days: null, hours: null, error: e instanceof Error ? e.message : "Ukjent feil", loading: false },
        }));
      }
    });
    (async () => {
      try {
        const res = await fetchAlerts();
        if (!cancelled) setAlerts(res);
      } catch (e: any) {
        if (!cancelled) setAlerts({ ok: false, error: e?.message ?? "Feil" });
      }
    })();
    const c = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelled = true;
      clearInterval(c);
    };
  }, [fetchAlerts, LOCATIONS]);

  const homeyOk = data?.ok === true;
  const devices = homeyOk ? data.devices : [];
  const zones = homeyOk ? data.zones : [];

  const tollnesRainSensor =
    findDeviceFuzzy(devices, zones, "regn tollnes", () => true) ??
    findDeviceFuzzy(devices, zones, "regnsensor tollnes", () => true) ??
    findDeviceFuzzy(devices, zones, "tollnes", (d) => hasAnyRainCap(d));
  const hyttaRainSensor =
    findDeviceFuzzy(devices, zones, "regn hytta", () => true) ??
    findDeviceFuzzy(devices, zones, "regnsensor hytta", () => true) ??
    findDeviceFuzzy(devices, zones, "hytta", (d) => hasAnyRainCap(d));

  const tollnesRainToday = readDailyRain(tollnesRainSensor);
  const hyttaRainToday = readDailyRain(hyttaRainSensor);
  const tollnesWind = readCap(findDeviceFuzzy(devices, zones, "tollnes", (d) => hasCap(d, "measure_wind_strength")), "measure_wind_strength");
  const hyttaWind = readCap(findDeviceFuzzy(devices, zones, "hytta", (d) => hasCap(d, "measure_wind_strength")), "measure_wind_strength");
  const tollnesPressure = readCap(findDeviceFuzzy(devices, zones, "tollnes", (d) => hasCap(d, "measure_pressure")), "measure_pressure");
  const hyttaPressure = readCap(findDeviceFuzzy(devices, zones, "hytta", (d) => hasCap(d, "measure_pressure")), "measure_pressure");
  const tollnesHumidity = readCap(findDeviceFuzzy(devices, zones, "tollnes", (d) => hasCap(d, "measure_humidity")), "measure_humidity");
  const hyttaHumidity = readCap(findDeviceFuzzy(devices, zones, "hytta", (d) => hasCap(d, "measure_humidity")), "measure_humidity");
  const tollnesTemp = readCap(findDeviceFuzzy(devices, zones, "tollnes", (d) => hasCap(d, "measure_temperature")), "measure_temperature");
  const hyttaTemp = readCap(findDeviceFuzzy(devices, zones, "hytta", (d) => hasCap(d, "measure_temperature")), "measure_temperature");

  // Netatmo ute-modul (Nordre Lensmannsveg / Tollnes) — prioriteres for temp/fukt
  const netatmoModules: WeatherModule[] = netatmoData?.ok === true ? netatmoData.modules : [];
  const tollnesOutdoor = netatmoModules.find((m) => m.type === "NAModule1");
  const tollnesNetatmoTemp = tollnesOutdoor?.metrics.temperature ?? null;
  const tollnesNetatmoHumidity = tollnesOutdoor?.metrics.humidity ?? null;

  const borgenTemp = tollnesNetatmoTemp ?? tollnesTemp;
  const borgenHumidity = tollnesNetatmoHumidity ?? tollnesHumidity;

  const skienHours = state.skien?.hours ?? null;
  const skienDays = state.skien?.days ?? null;
  const hyttaHours = state.hytta?.hours ?? null;
  const hyttaDays = state.hytta?.days ?? null;

  const currentHour = skienHours?.[0] ?? null;
  const sun = useMemo(() => sunTimes(now, userLoc.active.lat, userLoc.active.lon), [now, userLoc.active.lat, userLoc.active.lon]);
  const moon = useMemo(() => moonPhase(now), [now]);
  const allAlerts = alerts?.ok === true ? alerts.alerts : [];

  // Bakgrunnsgradient basert på tid på døgnet og skydekke
  const bgGradient = useMemo(() => {
    const h = now.getHours();
    const cloudy = (currentHour?.cloud ?? 50) > 60;
    if (h < 5 || h >= 22) return "from-[#0b1426] via-[#142340] to-[#1c2e4f]"; // natt
    if (h < 8) return "from-[#3a4a6b] via-[#5d7a9e] to-[#a8b5c8]"; // morgen
    if (h >= 19) return "from-[#1c2e4f] via-[#3a4a6b] to-[#6d4e3a]"; // kveld
    return cloudy
      ? "from-[#4a5a72] via-[#6b7b91] to-[#8a98ad]"
      : "from-[#3478c4] via-[#5a9bd4] to-[#9ec5e8]";
  }, [now, currentHour]);

  const headline = useMemo(() => {
    if (!skienHours) return null;
    // Finn neste time med signifikant nedbør
    const nextRain = skienHours.slice(1, 24).find((h) => h.precip >= 0.2 || h.precipProbability >= 50);
    if (nextRain) {
      const t = new Date(nextRain.time);
      const hh = t.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
      return `Regnvær ventes rundt kl. ${hh}.`;
    }
    if ((currentHour?.cloud ?? 0) < 25) return "Klar himmel resten av dagen.";
    return null;
  }, [skienHours, currentHour]);

  const todayDay = skienDays?.[0];
  const condition = currentHour ? conditionFromSymbol(currentHour.symbol) : "—";

  // Glassplate-overlay: velg effekt fra symbol + dag/natt
  const isDay = useMemo(() => {
    const h = now.getHours();
    return h >= 6 && h < 20;
  }, [now]);
  const glassKind = useMemo(
    () => glassKindFromSymbol(currentHour?.symbol ?? null, isDay),
    [currentHour, isDay],
  );
  const glassIntensity = useMemo(() => {
    const mm = currentHour?.precip ?? 0;
    const pp = (currentHour?.precipProbability ?? 0) / 100;
    return Math.max(0.4, Math.min(1, mm / 3 + pp * 0.6));
  }, [currentHour]);

  return (
    <PageShell>
      <div className={`min-h-screen bg-gradient-to-b ${bgGradient} transition-colors duration-1000 relative`}>
        <WeatherVideoBackground kind={glassKind} />
        <GlassPaneFX kind={glassKind} intensity={glassIntensity} />
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-16 space-y-4 text-white relative z-10">

          {/* HERO */}
          <header className="text-center pt-4 pb-2">
            <h1 className="text-lg font-medium tracking-wide text-white/90 mt-1 drop-shadow-md">{userLoc.active.label}</h1>
            <div className="text-[88px] leading-none font-thin mt-2 drop-shadow-lg tabular-nums">
              {currentHour ? `${Math.round(currentHour.temp)}°` : "—"}
            </div>
            <div className="text-xl font-medium mt-2">{condition}</div>
            {todayDay && (
              <div className="text-base font-medium mt-1 tabular-nums">
                H: {Math.round(todayDay.tempMax)}°  L: {Math.round(todayDay.tempMin)}°
              </div>
            )}
            {headline && <div className="text-sm text-white/90 mt-3">{headline}</div>}
          </header>

          {/* Sted-bytter (samme stil som øvrige fliser) */}
          <div className="relative z-50 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 shadow-lg shadow-black/10">
            <TileSplashFX kind={glassKind} intensity={glassIntensity} />
            <UserLocationBar page="var" state={userLoc} transparent />
          </div>

          {/* MET-VARSLER */}
          {allAlerts.length > 0 && (
            <div className="space-y-2">
              {allAlerts.map((a) => <AlertCard key={a.id} alert={a} />)}
            </div>
          )}

          {/* NEDBØR (hourly precip %) */}
          <NedborCard hours={skienHours} />

          {/* VÆRFORHOLD (hourly icons + temp) */}
          <HourlyForecastCard hours={skienHours} />

          {/* VIND (hourly m/s + chart) */}
          <WindHourlyCard hours={skienHours} />

          {/* 10-DAGERS PROGNOSE */}
          <DailyListCard days={skienDays} title="10-dagers prognose" />

          {/* VIND DETALJ */}
          <WindDetailCard hour={currentHour} />

          {/* MÅNE */}
          <MoonCard moon={moon} now={now} />

          {/* SOL */}
          <SunsetCard sun={sun} now={now} />

          {/* FØLES SOM + SKYDEKKE */}
          <div className="grid grid-cols-2 gap-3">
            <FeelsLikeCard hour={currentHour} />
            <CloudCard hour={currentHour} />
          </div>

          {/* NEDBØR I DAG + VINDKAST */}
          <div className="grid grid-cols-2 gap-3">
            <PrecipTodayCard day={todayDay} liveMm={tollnesRainToday} days={skienDays} />
            <GustCard hour={currentHour} />
          </div>

          {/* LUFTFUKTIGHET + LUFTTRYKK */}
          <div className="grid grid-cols-2 gap-3">
            <HumidityCard hour={currentHour} liveValue={tollnesHumidity} />
            <PressureCard hour={currentHour} liveValue={tollnesPressure} />
          </div>

          {/* LIVE MÅLINGER — Netatmo */}
          {(homeyOk || netatmoData?.ok === true) && (
            <GlassCard
              eyebrow="Live målinger · Netatmo"
              icon={<Thermometer size={14} />}
            >
              <div className="grid grid-cols-2 gap-3 -mx-1">
                <NetatmoTile label="Ute · Borgen · Tollnes" temp={borgenTemp} wind={tollnesWind} rain={tollnesRainToday} humidity={borgenHumidity} pressure={tollnesPressure} />
                <NetatmoTile label="Hytta · Numedal" temp={hyttaTemp} wind={hyttaWind} rain={hyttaRainToday} humidity={hyttaHumidity} pressure={hyttaPressure} />
              </div>
            </GlassCard>
          )}

          {/* UV-indeks · iOS-style */}
          <IosUvCard lat={userLoc.active.lat} lon={userLoc.active.lon} now={now} />

          {/* VINDROSE */}
          <GlassCard eyebrow={`Vindrose · ${rangeLabel(rangeHours)}`} icon={<Navigation size={14} />}>
            <div className="grid sm:grid-cols-2 gap-4">
              <WindRose name={userLoc.active.label} hours={skienHours} rangeHours={rangeHours} />
              <WindRose name="Hytta · Numedal" hours={hyttaHours} rangeHours={rangeHours} />
            </div>
          </GlassCard>

          {/* HYTTA prognose */}
          <DailyListCard days={hyttaDays} title="Hytta · Numedal · 10 dager" />

          {/* WINDY KART */}
          <CollapsibleMap />

          <p className="text-[10px] text-white/50 text-center pt-4">
            Værdata fra MET.no. Live målinger fra Netatmo via Homey. Astronomi beregnet lokalt. Kart fra Windy.com.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

// ============================================================
// Glass card primitive (iOS-style)
// ============================================================

function GlassCard({
  eyebrow,
  icon,
  children,
  className = "",
  fx,
}: {
  eyebrow?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  fx?: React.ReactNode;
}) {
  return (
    <article className={`relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 shadow-lg shadow-black/10 p-4 ${className}`}>
      {fx}
      <div className="relative">
        {eyebrow && (
          <div className="flex items-center gap-1.5 text-[11px] tracking-[0.15em] font-semibold text-white/70 uppercase mb-3">
            {icon}
            <span>{eyebrow}</span>
          </div>
        )}
        {children}
      </div>
    </article>
  );
}

// ============================================================
// NEDBØR — hourly precip bars
// ============================================================

function NedborCard({ hours }: { hours: Hour[] | null }) {
  if (!hours) return <GlassCard eyebrow="Nedbør" icon={<Droplets size={14} />}><Skeleton /></GlassCard>;
  const next = hours.slice(0, 12);
  const maxP = Math.max(1, ...next.map((h) => h.precip));

  return (
    <GlassCard eyebrow="Nedbør · sjanse for regn" icon={<Droplets size={14} />} fx={<RainFX intensity={Math.min(1, maxP / 4)} />}>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex items-end gap-3 min-w-max pb-1">
          {next.map((h, i) => {
            const heightPct = Math.max(4, (h.precip / maxP) * 70);
            const hourLabel = i === 0 ? "Nå" : h.time.slice(11, 16);
            return (
              <div key={h.time} className="flex flex-col items-center w-12">
                <div className="text-[11px] text-white/80 mb-1.5">{hourLabel}</div>
                <div className="relative w-7 h-20 rounded-md bg-white/15 overflow-hidden border-t border-dashed border-white/20">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sky-300 to-sky-200 rounded-md"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <div className="flex items-center gap-0.5 mt-1.5 text-[11px] text-sky-100 font-medium tabular-nums">
                  <Droplets size={9} />
                  {Math.round(h.precipProbability)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

// ============================================================
// HOURLY FORECAST — Værforhold
// ============================================================

function HourlyForecastCard({ hours }: { hours: Hour[] | null }) {
  if (!hours) return <GlassCard eyebrow="Værforhold" icon={<Cloud size={14} />}><Skeleton /></GlassCard>;
  const next = hours.slice(0, 24);
  return (
    <GlassCard eyebrow="Værforhold · Temperatur" icon={<Cloud size={14} />} fx={<CloudFX intensity={0.4} />}>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex items-center gap-4 min-w-max pb-1">
          {next.map((h, i) => (
            <div key={h.time} className="flex flex-col items-center w-12">
              <div className="text-[11px] text-white/80 mb-2">
                {i === 0 ? "Nå" : h.time.slice(11, 16)}
              </div>
              <div className="text-2xl mb-1">{symbolEmoji(h.symbol)}</div>
              {h.precipProbability >= 20 && (
                <div className="text-[10px] text-sky-200 font-medium tabular-nums">
                  {Math.round(h.precipProbability)}%
                </div>
              )}
              <div className="text-base font-medium tabular-nums mt-1">{Math.round(h.temp)}°</div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

// ============================================================
// WIND HOURLY CARD
// ============================================================

function WindHourlyCard({ hours }: { hours: Hour[] | null }) {
  if (!hours) return <GlassCard eyebrow="Vind" icon={<Wind size={14} />}><Skeleton /></GlassCard>;
  const next = hours.slice(0, 24);
  const W = 600, H = 80, pad = 4;
  const winds = next.map((h) => h.wind);
  const maxW = Math.max(8, ...winds);
  const xFor = (i: number) => pad + (i / (next.length - 1)) * (W - pad * 2);
  const yFor = (v: number) => H - pad - (v / maxW) * (H - pad * 2);
  const path = next.map((h, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(h.wind).toFixed(1)}`).join(" ");
  const fillPath = `${path} L ${xFor(next.length - 1).toFixed(1)} ${H} L ${pad} ${H} Z`;

  return (
    <GlassCard eyebrow="Vind · Hastighet (m/s)" icon={<Wind size={14} />} fx={<WindFX intensity={Math.min(1, maxW / 12)} />}>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="min-w-max">
          <div className="flex items-end gap-4 mb-1">
            {next.filter((_, i) => i % 1 === 0).slice(0, 24).map((h, i) => (
              <div key={h.time} className="w-12 text-center">
                <div className="text-[11px] text-white/80">{i === 0 ? "Nå" : h.time.slice(11, 16)}</div>
                <div className="text-base font-medium tabular-nums mt-1">{Math.round(h.wind)}</div>
                <div className="text-[10px] text-white/60">m/s</div>
              </div>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none">
            <defs>
              <linearGradient id="windGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <path d={fillPath} fill="url(#windGrad)" />
            <path d={path} fill="none" stroke="#34d399" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </GlassCard>
  );
}

// ============================================================
// DAILY LIST CARD (10 days)
// ============================================================

function DailyListCard({ days, title }: { days: ForecastDay[] | null; title: string }) {
  if (!days) return <GlassCard eyebrow={title} icon={<TrendingUp size={14} />}><Skeleton /></GlassCard>;
  const list = days.slice(0, 10);
  const allMins = list.map((d) => d.tempMin);
  const allMaxs = list.map((d) => d.tempMax);
  const globalMin = Math.min(...allMins);
  const globalMax = Math.max(...allMaxs);
  const range = Math.max(1, globalMax - globalMin);

  return (
    <GlassCard eyebrow={title} icon={<TrendingUp size={14} />}>
      <div className="divide-y divide-white/10">
        {list.map((d, i) => {
          const startPct = ((d.tempMin - globalMin) / range) * 100;
          const widthPct = ((d.tempMax - d.tempMin) / range) * 100;
          const label = i === 0 ? "I dag" : weekdayShort(d.date);
          return (
            <div key={d.date} className="grid grid-cols-[60px_36px_56px_1fr_44px] items-center gap-3 py-2.5">
              <div className="text-[15px] capitalize">{label}</div>
              <div className="text-xl text-center">{symbolEmoji(d.symbol)}</div>
              <div className="text-[11px] text-sky-200 tabular-nums text-right">
                {d.precipProbability >= 20 ? `${Math.round(d.precipProbability)}%` : ""}
              </div>
              <div className="relative h-1.5">
                <div className="absolute inset-0 rounded-full bg-white/15" />
                <div
                  className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-sky-400 via-yellow-300 to-orange-400"
                  style={{ left: `${startPct}%`, width: `${Math.max(8, widthPct)}%` }}
                />
              </div>
              <div className="text-[13px] tabular-nums text-right text-white/90">
                {Math.round(d.tempMin)}° <span className="text-white/60">·</span> {Math.round(d.tempMax)}°
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ============================================================
// WIND DETAIL CARD with compass
// ============================================================

function WindDetailCard({ hour }: { hour: Hour | null }) {
  const dir = hour?.windDir ?? 0;
  const speed = hour?.wind ?? 0;
  const gust = hour?.windGust ?? speed;
  return (
    <GlassCard eyebrow="Vind" icon={<Wind size={14} />} fx={<WindFX intensity={Math.min(1, speed / 12)} />}>
      <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="space-y-2 text-sm">
          <Row label="Vind" value={`${speed.toFixed(1)} m/s`} />
          <Row label="Vindkast" value={`${gust.toFixed(1)} m/s`} />
          <Row label="Retning" value={`${Math.round(dir)}° ${dirCardinal(dir)}`} />
        </div>
        <div className="relative w-28 h-28">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            {Array.from({ length: 36 }).map((_, i) => {
              const a = (i * 10 - 90) * (Math.PI / 180);
              const x1 = 50 + 44 * Math.cos(a);
              const y1 = 50 + 44 * Math.sin(a);
              const x2 = 50 + (i % 9 === 0 ? 36 : 40) * Math.cos(a);
              const y2 = 50 + (i % 9 === 0 ? 36 : 40) * Math.sin(a);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />;
            })}
            {["N", "Ø", "S", "V"].map((d, i) => {
              const a = (i * 90 - 90) * (Math.PI / 180);
              const x = 50 + 30 * Math.cos(a);
              const y = 50 + 30 * Math.sin(a) + 2.5;
              return <text key={d} x={x} y={y} fontSize="7" fill="white" textAnchor="middle">{d}</text>;
            })}
            <g transform={`rotate(${dir} 50 50)`}>
              <polygon points="50,12 47,22 53,22" fill="white" />
              <circle cx="50" cy="50" r="2" fill="white" />
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-xl font-light tabular-nums leading-none">{speed.toFixed(0)}</div>
            <div className="text-[9px] text-white/70">m/s</div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-white/10 last:border-0 pb-1.5">
      <span className="text-white/80">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// ============================================================
// MOON CARD
// ============================================================

function MoonCard({ moon, now }: { moon: { name: string; icon: string; illumination: number }; now: Date }) {
  const nextSet = useMemo(() => nextMoonset(now), [now]);
  const daysToFull = useMemo(() => daysUntilFullMoon(now), [now]);
  return (
    <GlassCard eyebrow={moon.name} icon={<Moon size={14} />} fx={<StarFX />}>
      <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="space-y-2 text-sm">
          <Row label="Opplysning" value={`${Math.round(moon.illumination * 100)} %`} />
          <Row label="Neste månenedgang" value={nextSet ? formatTime(nextSet) : "—"} />
          <Row label="Neste fullmåne" value={`${daysToFull} d`} />
        </div>
        <MoonVisual illumination={moon.illumination} phase={moon.name} />
      </div>
    </GlassCard>
  );
}

function MoonVisual({ illumination, phase }: { illumination: number; phase: string }) {
  const waning = phase.includes("Avtagende") || phase.includes("Siste");
  const r = 36;
  // Terminator-ellipse offset
  const offset = (1 - 2 * illumination) * r * (waning ? -1 : 1);
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24">
      <defs>
        <radialGradient id="moonG" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#f5f5f0" />
          <stop offset="100%" stopColor="#c8c4b8" />
        </radialGradient>
        <clipPath id="moonClip"><circle cx="50" cy="50" r={r} /></clipPath>
      </defs>
      <circle cx="50" cy="50" r={r} fill="rgba(255,255,255,0.15)" />
      <g clipPath="url(#moonClip)">
        <ellipse cx={50 + offset} cy="50" rx={r} ry={r} fill="url(#moonG)" />
      </g>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      {/* mare-prikker */}
      <circle cx="42" cy="45" r="3" fill="rgba(0,0,0,0.06)" />
      <circle cx="58" cy="52" r="2" fill="rgba(0,0,0,0.06)" />
      <circle cx="48" cy="60" r="2.5" fill="rgba(0,0,0,0.06)" />
    </svg>
  );
}

// ============================================================
// SUNSET CARD with arc
// ============================================================

function SunsetCard({ sun, now }: { sun: ReturnType<typeof sunTimes>; now: Date }) {
  const sunrise = sun.sunrise;
  const sunset = sun.sunset;
  // Sol-posisjon: progress 0..1 mellom rise og set
  let progress = 0;
  if (sunrise && sunset) {
    const tNow = now.getTime();
    progress = Math.max(0, Math.min(1, (tNow - sunrise.getTime()) / (sunset.getTime() - sunrise.getTime())));
  }
  // Arc-koordinater
  const W = 160, H = 70;
  const cx = W / 2, cy = H - 4, r = 60;
  const ang = Math.PI - progress * Math.PI;
  const sx = cx + r * Math.cos(ang);
  const sy = cy - r * Math.sin(ang);

  return (
    <GlassCard eyebrow="Sol ned" icon={<Sunrise size={14} />} fx={<SunFX intensity={progress > 0 && progress < 1 ? 1 : 0.3} />}>
      <div className="text-3xl font-light tabular-nums">{sunset ? formatTime(sunset) : "—"}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16 mt-2">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx={sx} cy={sy} r="5" fill="#fff" />
      </svg>
      <div className="text-[11px] text-white/80 mt-1">Sol opp: {sunrise ? formatTime(sunrise) : "—"}</div>
    </GlassCard>
  );
}

// ============================================================
// UV INDEX CARD — iOS Weather style
// ============================================================

function IosUvCard({ lat, lon, now }: { lat: number; lon: number; now: Date }) {
  const { uvNow, uvMaxToday, uvMaxTimeToday, hours, loading, error } = useUvSun(lat, lon);
  const level = uvNow != null ? uvLevel(uvNow) : null;

  // Filter to today's hours (or first 14 forecast entries with UV)
  const todayStr = now.toISOString().slice(0, 10);
  const todayHours = hours.filter((h) => h.time.startsWith(todayStr));
  const displayHours = todayHours.length >= 6 ? todayHours : hours.slice(0, 14);

  // Current time position in chart (0..1)
  const nowProgress = useMemo(() => {
    if (displayHours.length < 2) return null;
    const t0 = new Date(displayHours[0].time).getTime();
    const tN = new Date(displayHours[displayHours.length - 1].time).getTime();
    const n = now.getTime();
    if (n < t0 || n > tN) return null;
    return (n - t0) / (tN - t0);
  }, [displayHours, now]);

  // Description about UV levels today
  const description = useMemo(() => {
    if (!displayHours.length) return null;
    const moderateOrHigher = displayHours.filter((h) => h.uv >= 3);
    if (!moderateOrHigher.length) return "Lavt gjennom hele dagen.";
    const start = moderateOrHigher[0].time;
    const end = moderateOrHigher[moderateOrHigher.length - 1].time;
    const startH = new Date(start).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
    const endH = new Date(end).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
    if (uvNow != null && uvNow < 3) {
      return `Lavt gjennom resten av dagen. Moderat eller høyt nivå ble nådd fra kl. ${startH} til ${endH}.`;
    }
    return `Moderat eller høyt nivå fra kl. ${startH} til ${endH}.`;
  }, [displayHours, uvNow]);

  if (loading) {
    return (
      <GlassCard eyebrow="UV-indeks" icon={<Sun size={14} />}>
        <Skeleton />
      </GlassCard>
    );
  }
  if (error) {
    return (
      <GlassCard eyebrow="UV-indeks" icon={<Sun size={14} />}>
        <div className="text-sm text-white/70">{error}</div>
      </GlassCard>
    );
  }

  const slice = displayHours.slice(0, 12);

  return (
    <GlassCard eyebrow="UV-indeks" icon={<Sun size={14} />} fx={<SunFX intensity={Math.min(1, (uvNow ?? 0) / 8)} />}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-light tabular-nums">{uvNow?.toFixed(0) ?? "—"}</span>
            <span className="text-lg font-medium">{level?.label ?? ""}</span>
          </div>
          <div className="text-[11px] text-white/60 mt-1">UVI fra Verdens helseorganisasjon</div>
        </div>
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
          <Sun size={20} className="text-yellow-300" />
        </div>
      </div>

      {/* Hourly UV numbers */}
      {slice.length > 0 && (
        <div className="flex justify-between mt-4 px-0.5">
          {slice.map((h) => (
            <div key={h.time} className="text-[11px] text-white/50 tabular-nums text-center flex-1">
              {Math.round(h.uv)}
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <UvIosChart hours={slice} nowProgress={nowProgress} />

      {/* Now + description */}
      {description && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="text-sm font-medium text-white/90">
            Nå, {now.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="text-[13px] text-white/75 mt-1 leading-snug">{description}</div>
        </div>
      )}

      {/* Day comparison */}
      <div className="mt-4 rounded-xl bg-black/15 p-3">
        <div className="text-[11px] tracking-wider text-white/70 uppercase mb-2">Dagsforskjeller</div>
        <div className="text-[13px] text-white/90 mb-2">
          {uvMaxToday != null
            ? `UV-strålingen nådde toppen på ${uvMaxToday.toFixed(0)} i dag.`
            : "Ingen UV-data tilgjengelig."}
        </div>
        {uvMaxToday != null && uvMaxTimeToday && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-6 rounded bg-white/10 flex items-center px-2 relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-yellow-400/30 rounded"
                  style={{ width: `${Math.min(100, (uvMaxToday / 11) * 100)}%` }}
                />
                <span className="text-[11px] relative z-10">I dag</span>
              </div>
              <span className="text-lg font-light tabular-nums w-6 text-right">{uvMaxToday.toFixed(0)}</span>
            </div>
            {uvMaxTimeToday && (
              <div className="text-[11px] text-white/50">
                Topp kl. {new Date(uvMaxTimeToday).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

function UvIosChart({ hours, nowProgress }: { hours: { time: string; uv: number }[]; nowProgress: number | null }) {
  const W = 340;
  const H = 130;
  const padL = 70;
  const padR = 20;
  const padT = 16;
  const padB = 18;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxUV = 11;
  const n = hours.length;
  if (n < 2) return null;

  const stepX = chartW / (n - 1);
  const pt = (i: number) => ({
    x: padL + i * stepX,
    y: padT + chartH - (hours[i].uv / maxUV) * chartH,
  });

  const points = hours
    .map((_, i) => {
      const p = pt(i);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `M${padL},${padT + chartH} L${points} L${padL + chartW},${padT + chartH} Z`;

  // WHO level reference lines + labels
  const levels = [
    { uv: 3, label: "Moderat" },
    { uv: 6, label: "Høyt nivå" },
    { uv: 8, label: "Svært høy" },
    { uv: 11, label: "Ekstremt nivå" },
  ];

  // X-axis ticks (pick ~4 evenly spaced)
  const tickCount = 4;
  const tickStep = Math.max(1, Math.floor((n - 1) / (tickCount - 1)));
  const ticks: { time: string; idx: number }[] = [];
  for (let i = 0; i < n; i += tickStep) ticks.push({ time: hours[i].time, idx: i });
  if (ticks[ticks.length - 1].idx !== n - 1) ticks.push({ time: hours[n - 1].time, idx: n - 1 });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32 mt-1">
      <defs>
        <linearGradient id="uvAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde047" stopOpacity="0.5" />
          <stop offset="40%" stopColor="#f97316" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Reference lines + left labels */}
      {levels.map((l) => {
        const y = padT + chartH - (l.uv / maxUV) * chartH;
        return (
          <g key={l.uv}>
            <line x1={padL} x2={padL + chartW} y1={y} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
            <text x={padL - 4} y={y + 3} fontSize="7" fill="rgba(255,255,255,0.4)" textAnchor="end">
              {l.label}
            </text>
          </g>
        );
      })}

      {/* Y-axis numbers right */}
      {[0, 3, 6, 8, 11].map((v) => {
        const y = padT + chartH - (v / maxUV) * chartH;
        return (
          <text key={v} x={padL + chartW + 3} y={y + 3} fontSize="7" fill="rgba(255,255,255,0.3)" textAnchor="start">
            {v}
          </text>
        );
      })}

      {/* X-axis time labels */}
      {ticks.map((t, i) => {
        const x = padL + t.idx * stepX;
        return (
          <text key={i} x={x} y={H - 3} fontSize="7" fill="rgba(255,255,255,0.35)" textAnchor="middle">
            {t.time.slice(11, 16)}
          </text>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="url(#uvAreaGrad)" />

      {/* Line */}
      <path d={`M${points}`} fill="none" stroke="#fde047" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Now marker */}
      {nowProgress != null && (
        <>
          <line
            x1={padL + nowProgress * chartW}
            x2={padL + nowProgress * chartW}
            y1={padT}
            y2={padT + chartH}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.8"
            strokeDasharray="3 2"
          />
          {(() => {
            const idx = Math.min(n - 1, Math.round(nowProgress * (n - 1)));
            const h = hours[idx];
            const x = padL + nowProgress * chartW;
            const y = padT + chartH - (h.uv / maxUV) * chartH;
            return <circle cx={x} cy={y} r="3" fill="white" />;
          })()}
        </>
      )}
    </svg>
  );
}

// ============================================================
// SIMPLE STAT CARDS
// ============================================================

function FeelsLikeCard({ hour }: { hour: Hour | null }) {
  const t = hour?.temp ?? 0;
  const w = hour?.wind ?? 0;
  // Enkel vindavkjøling (Norge JAG-Steadman approximation): bare for visning
  const feels = w > 1.5 && t < 15 ? Math.round(t - w * 0.5) : Math.round(t);
  const hint = w > 1.5 && t < 15 ? "Vinden gjør at det føles kaldere." : "Komfortabelt.";
  const cold = feels <= 5;
  const fx = cold ? <SnowFX intensity={0.5} /> : feels >= 18 ? <HeatwaveFX intensity={1} /> : <HeatwaveFX intensity={-1} />;
  return (
    <GlassCard eyebrow="Føles som" icon={<Thermometer size={14} />} fx={fx}>
      <div className="text-3xl font-light tabular-nums">{hour ? `${feels}°` : "—"}</div>
      <div className="text-[12px] text-white/80 mt-3 leading-snug">{hint}</div>
    </GlassCard>
  );
}

function CloudCard({ hour }: { hour: Hour | null }) {
  const c = Math.round(hour?.cloud ?? 0);
  const label = c < 25 ? "Klar himmel" : c < 60 ? "Delvis skyet" : c < 85 ? "Skyet" : "Overskyet";
  const fx = c < 25 ? <SunFX intensity={0.8} /> : <CloudFX intensity={Math.min(1, c / 100)} />;
  return (
    <GlassCard eyebrow="Skydekke" icon={<Cloud size={14} />} fx={fx}>
      <div className="text-3xl font-light tabular-nums">{hour ? `${c} %` : "—"}</div>
      <div className="text-[12px] text-white/80 mt-3 leading-snug">{label}</div>
    </GlassCard>
  );
}

function PrecipTodayCard({ day, liveMm, days }: { day: ForecastDay | undefined; liveMm: number | null; days: ForecastDay[] | null }) {
  const mm = liveMm ?? day?.precip ?? 0;
  const nextRainDay = days?.slice(1, 7).find((d) => d.precip >= 0.2);
  const hint = nextRainDay
    ? `${nextRainDay.precip.toFixed(1)} mm ventes ${weekdayShort(nextRainDay.date)}.`
    : "Tørt de neste dagene.";
  return (
    <GlassCard eyebrow="Nedbør" icon={<CloudRain size={14} />} fx={<RainFX intensity={Math.min(1, mm / 8)} />}>
      <div className="text-3xl font-light tabular-nums">{mm.toFixed(mm < 10 ? 1 : 0)} mm</div>
      <div className="text-sm text-white/85">I dag</div>
      <div className="text-[12px] text-white/75 mt-2 leading-snug">{hint}</div>
    </GlassCard>
  );
}

function GustCard({ hour }: { hour: Hour | null }) {
  const w = hour?.wind ?? 0;
  const g = hour?.windGust ?? w;
  return (
    <GlassCard eyebrow="Vindkast" icon={<Wind size={14} />} fx={<GustFX intensity={Math.min(1, g / 15)} />}>
      <div className="text-3xl font-light tabular-nums">{g.toFixed(1)}</div>
      <div className="text-sm text-white/85">m/s</div>
      <div className="text-[12px] text-white/75 mt-2 leading-snug">Gjennomsnitt {w.toFixed(1)} m/s.</div>
    </GlassCard>
  );
}

function HumidityCard({ hour, liveValue }: { hour: Hour | null; liveValue: number | null }) {
  const h = Math.round(liveValue ?? hour?.humidity ?? 0);
  return (
    <GlassCard eyebrow="Luftfuktighet" icon={<Droplets size={14} />} fx={<HumidityFX intensity={h / 100} />}>
      <div className="text-3xl font-light tabular-nums">{h} %</div>
      <div className="text-[12px] text-white/75 mt-3 leading-snug">
        Duggpunkt ca {Math.round((hour?.temp ?? 0) - (100 - h) / 5)}°.
      </div>
    </GlassCard>
  );
}

function PressureCard({ hour, liveValue }: { hour: Hour | null; liveValue: number | null }) {
  const p = liveValue ?? hour?.pressure ?? 0;
  const min = 980, max = 1040;
  const pct = Math.max(0, Math.min(1, (p - min) / (max - min)));
  return (
    <GlassCard eyebrow="Lufttrykk" icon={<Gauge size={14} />} fx={<PressureFX intensity={pct} />}>
      <div className="relative h-16 mt-1">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
          {Array.from({ length: 21 }).map((_, i) => {
            const a = Math.PI + (i / 20) * Math.PI;
            const x1 = 50 + 38 * Math.cos(a);
            const y1 = 45 + 38 * Math.sin(a);
            const x2 = 50 + (i % 5 === 0 ? 32 : 35) * Math.cos(a);
            const y2 = 45 + (i % 5 === 0 ? 32 : 35) * Math.sin(a);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />;
          })}
          {(() => {
            const a = Math.PI + pct * Math.PI;
            const x = 50 + 36 * Math.cos(a);
            const y = 45 + 36 * Math.sin(a);
            return <line x1="50" y1="45" x2={x} y2={y} stroke="white" strokeWidth="1.5" strokeLinecap="round" />;
          })()}
        </svg>
      </div>
      <div className="text-center -mt-3">
        <div className="text-2xl font-light tabular-nums">{Math.round(p)}</div>
        <div className="text-[11px] text-white/70">hPa</div>
      </div>
      <div className="flex justify-between text-[10px] text-white/70 -mt-1">
        <span>Lavt</span><span>Høyt</span>
      </div>
    </GlassCard>
  );
}

// ============================================================
// Netatmo tiles
// ============================================================

function NetatmoTile({
  label, temp, wind, rain, humidity, pressure,
}: {
  label: string; temp: number | null; wind: number | null; rain: number | null; humidity: number | null; pressure: number | null;
}) {
  return (
    <div className="rounded-xl bg-black/15 border border-white/10 p-3">
      <div className="text-[11px] tracking-wider text-white/75 uppercase mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-y-1.5 text-[12px]">
        {temp !== null && (<><span className="text-white/70">Temp</span><span className="text-right tabular-nums">{temp.toFixed(1)}°</span></>)}
        <span className="text-white/70">Vind</span><span className="text-right tabular-nums">{wind !== null ? `${wind.toFixed(1)} m/s` : "—"}</span>
        <span className="text-white/70">Regn i dag</span><span className="text-right tabular-nums">{rain !== null ? `${rain.toFixed(1)} mm` : "—"}</span>
        <span className="text-white/70">Fukt</span><span className="text-right tabular-nums">{humidity !== null ? `${Math.round(humidity)} %` : "—"}</span>
        <span className="text-white/70">Trykk</span><span className="text-right tabular-nums">{pressure !== null ? `${Math.round(pressure)} hPa` : "—"}</span>
      </div>
    </div>
  );
}

// ============================================================
// Alert card (iOS-style)
// ============================================================

function AlertCard({ alert }: { alert: MetAlert }) {
  const color = alertColor(alert.awarenessColor);
  return (
    <div
      className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 p-4 border-l-[6px]"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} style={{ color }} />
        <div className="flex-1">
          <div className="text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color }}>
            {alert.awarenessColor} · {alert.severity}
          </div>
          <div className="text-base font-medium mt-1">{alert.title}</div>
          {alert.description && <p className="text-[13px] text-white/85 mt-1 line-clamp-3">{alert.description}</p>}
          {alert.area && <div className="text-[11px] text-white/70 mt-2">{alert.area}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Wind rose (light theme adapted)
// ============================================================

function WindRose({ name, hours, rangeHours }: { name: string; hours: Hour[] | null; rangeHours: number }) {
  if (!hours) return <div className="text-white/70 italic text-sm">{name}: laster…</div>;
  const next = hours.slice(0, rangeHours);
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  const buckets = new Array(8).fill(0).map(() => ({ count: 0, sumWind: 0 }));
  for (const h of next) {
    const idx = Math.round(((h.windDir % 360) / 45)) % 8;
    buckets[idx].count += 1;
    buckets[idx].sumWind += h.wind;
  }
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const maxWind = Math.max(...next.map((h) => h.wind));
  const avgWind = next.reduce((sum, h) => sum + h.wind, 0) / next.length;
  const dominantIdx = buckets.indexOf(buckets.reduce((a, b) => (b.count > a.count ? b : a)));
  const cx = 100, cy = 100, rOuter = 80;
  return (
    <div className="rounded-xl bg-black/10 p-3">
      <div className="text-[11px] text-white/80 uppercase tracking-wider mb-2">{name}</div>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <svg viewBox="0 0 200 200" className="w-full max-w-[220px] mx-auto">
          {[0.33, 0.66, 1].map((f) => (
            <circle key={f} cx={cx} cy={cy} r={rOuter * f} fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 3" />
          ))}
          <line x1={cx} y1={cy - rOuter} x2={cx} y2={cy + rOuter} stroke="rgba(255,255,255,0.2)" />
          <line x1={cx - rOuter} y1={cy} x2={cx + rOuter} y2={cy} stroke="rgba(255,255,255,0.2)" />
          {buckets.map((b, i) => {
            if (b.count === 0) return null;
            const startAngle = i * 45 - 22.5 - 90;
            const endAngle = startAngle + 45;
            const r = (b.count / maxCount) * rOuter;
            const a1 = (startAngle * Math.PI) / 180;
            const a2 = (endAngle * Math.PI) / 180;
            const x1 = cx + r * Math.cos(a1);
            const y1 = cy + r * Math.sin(a1);
            const x2 = cx + r * Math.cos(a2);
            const y2 = cy + r * Math.sin(a2);
            const path = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
            const intensity = b.sumWind / Math.max(1, b.count) / Math.max(1, maxWind);
            return <path key={i} d={path} fill="#7dd3fc" opacity={0.4 + intensity * 0.5} stroke="#7dd3fc" strokeWidth="0.5" />;
          })}
          {dirs.map((d, i) => {
            const angle = (i * 45 - 90) * (Math.PI / 180);
            const x = cx + (rOuter + 12) * Math.cos(angle);
            const y = cy + (rOuter + 12) * Math.sin(angle) + 3;
            return (
              <text key={d} x={x} y={y} fontSize="10" fill={i === dominantIdx ? "#fde68a" : "white"} textAnchor="middle" fontWeight={i === dominantIdx ? 700 : 400}>
                {d}
              </text>
            );
          })}
        </svg>
        <div className="space-y-2 text-center text-xs">
          <div><div className="text-white/70 uppercase tracking-wider text-[10px]">Snitt</div><div className="text-xl font-light tabular-nums">{avgWind.toFixed(1)}</div><div className="text-[10px] text-white/60">m/s</div></div>
          <div><div className="text-white/70 uppercase tracking-wider text-[10px]">Maks</div><div className="text-base font-light tabular-nums">{maxWind.toFixed(1)}</div></div>
          <div><div className="text-white/70 uppercase tracking-wider text-[10px]">Fra</div><div className="text-base font-light">{dirs[dominantIdx]}</div></div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Range selector (compact)
// ============================================================

function RangeSelector({ value, onChange }: { value: 24 | 72 | 168; onChange: (v: 24 | 72 | 168) => void }) {
  const opts: { v: 24 | 72 | 168; label: string }[] = [
    { v: 24, label: "24t" },
    { v: 72, label: "3d" },
    { v: 168, label: "7d" },
  ];
  return (
    <div className="inline-flex rounded-md bg-black/20 p-0.5 gap-0.5">
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button key={o.v} onClick={() => onChange(o.v)}
            className={"px-3 py-1 text-[11px] uppercase tracking-wider rounded transition-colors " + (active ? "bg-white text-slate-800" : "text-white/80")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Collapsible Windy map (kept)
// ============================================================

const WINDY_OVERLAYS: { key: string; label: string; icon: string }[] = [
  { key: "wind", label: "Vind", icon: "💨" },
  { key: "rain", label: "Regn", icon: "🌧" },
  { key: "rainAccu", label: "Akk. nedbør", icon: "☔" },
  { key: "snowAccu", label: "Snø", icon: "❄️" },
  { key: "temp", label: "Temperatur", icon: "🌡" },
  { key: "clouds", label: "Skyer", icon: "☁️" },
  { key: "thunder", label: "Torden", icon: "⚡" },
  { key: "pressure", label: "Trykk", icon: "🜨" },
  { key: "gust", label: "Vindkast", icon: "🌬" },
  { key: "rh", label: "Fuktighet", icon: "💧" },
  { key: "visibility", label: "Sikt", icon: "👁" },
  { key: "fog", label: "Tåke", icon: "🌫" },
  { key: "uvIndex", label: "UV-indeks", icon: "🔆" },
  { key: "cape", label: "CAPE", icon: "🌩" },
  { key: "satellite", label: "Satellitt", icon: "🛰" },
  { key: "radar", label: "Radar", icon: "📡" },
];

function CollapsibleMap() {
  const [open, setOpen] = usePerUserPersistedState<boolean>("var:windyMap", false);
  return (
    <GlassCard eyebrow="Live værkart · Windy" icon={<MapIcon size={14} />}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-sm">
        <span>{open ? "Lukk kartet" : "Åpne live værkart"}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <WindyMap />}
    </GlassCard>
  );
}

function WindyMap() {
  const [overlay, setOverlay] = useState("wind");
  const src = useMemo(() => {
    const params = new URLSearchParams({
      lat: "59.6", lon: "9.2", detailLat: "59.21", detailLon: "9.61", zoom: "8",
      level: "surface", overlay, product: "ecmwf", menu: "", message: "true",
      marker: "", calendar: "now", pressure: "", type: "map", location: "coordinates",
      detail: "true", metricWind: "m/s", metricTemp: "°C", radarRange: "-1",
    });
    return `https://embed.windy.com/embed2.html?${params.toString()}`;
  }, [overlay]);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {WINDY_OVERLAYS.map((o) => {
          const active = o.key === overlay;
          return (
            <button key={o.key} onClick={() => setOverlay(o.key)}
              className={"px-2 py-1 rounded-md text-[11px] uppercase tracking-wider border transition-colors " + (active ? "bg-white text-slate-800 border-white" : "bg-white/5 border-white/20 text-white/80 hover:bg-white/10")}
            >
              <span className="mr-1">{o.icon}</span>{o.label}
            </button>
          );
        })}
      </div>
      <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: "16 / 11" }}>
        <iframe key={overlay} title={`Windy — ${overlay}`} src={src} className="absolute inset-0 w-full h-full border-0" loading="lazy" referrerPolicy="no-referrer" allow="fullscreen" />
      </div>
    </div>
  );
}

// ============================================================
// Skeleton
// ============================================================

function Skeleton() {
  return <div className="h-16 rounded-lg bg-white/5 animate-pulse" />;
}

// ============================================================
// Helpers (preserved)
// ============================================================

function rangeLabel(h: number): string {
  if (h <= 24) return "24 timer";
  if (h <= 72) return "3 dager";
  return "7 dager";
}

function alertColor(c: string): string {
  switch (c) {
    case "red": return "#ef4444";
    case "orange": return "#fb923c";
    case "yellow": return "#fde047";
    default: return "#86efac";
  }
}

function hasCap(d: DeviceLike | null | undefined, cap: string): boolean {
  return typeof d?.capabilities?.[cap]?.value === "number";
}
function readCap(d: DeviceLike | null | undefined, cap: string): number | null {
  const v = d?.capabilities?.[cap]?.value;
  return typeof v === "number" ? v : null;
}
function hasAnyRainCap(d: DeviceLike | null | undefined): boolean {
  if (!d?.capabilities) return false;
  for (const k of Object.keys(d.capabilities)) {
    if (k.toLowerCase().includes("rain") && typeof d.capabilities[k]?.value === "number") return true;
  }
  return false;
}
function readDailyRain(d: DeviceLike | null | undefined): number | null {
  if (!d?.capabilities) return null;
  const caps = d.capabilities;
  const priority = ["meter_rain.today","meter_rain.daily","meter_rain.day","measure_rain.today","measure_rain.daily","measure_rain.day","meter_rain","measure_rain.24h","measure_rain.1h","measure_rain"];
  for (const cap of priority) { const v = caps[cap]?.value; if (typeof v === "number") return v; }
  for (const [k, val] of Object.entries(caps)) {
    if (k.toLowerCase().includes("rain") && typeof val?.value === "number") return val.value as number;
  }
  return null;
}

function parseForecast(data: any): { days: ForecastDay[]; hours: Hour[] } {
  const series = data?.properties?.timeseries ?? [];
  const dayMap = new Map<string, ForecastDay>();
  const hours: Hour[] = [];
  for (const entry of series) {
    const time: string = entry.time;
    const date = time.slice(0, 10);
    const inst = entry.data?.instant?.details ?? {};
    const next6 = entry.data?.next_6_hours;
    const next1 = entry.data?.next_1_hours;
    const temp = inst.air_temperature;
    if (typeof temp !== "number") continue;
    const symbol = next1?.summary?.symbol_code ?? next6?.summary?.symbol_code ?? null;
    const precip = next1?.details?.precipitation_amount ?? next6?.details?.precipitation_amount ?? 0;
    const precipProbability = next1?.details?.probability_of_precipitation ?? next6?.details?.probability_of_precipitation ?? 0;
    hours.push({
      time, temp, precip, precipProbability,
      wind: inst.wind_speed ?? 0,
      windGust: inst.wind_speed_of_gust ?? inst.wind_speed ?? 0,
      windDir: inst.wind_from_direction ?? 0,
      pressure: inst.air_pressure_at_sea_level ?? 0,
      humidity: inst.relative_humidity ?? 0,
      cloud: inst.cloud_area_fraction ?? 0,
      symbol,
    });
    const existing = dayMap.get(date);
    if (!existing) {
      dayMap.set(date, { date, tempMin: temp, tempMax: temp, symbol, precip, precipProbability });
    } else {
      existing.tempMin = Math.min(existing.tempMin, temp);
      existing.tempMax = Math.max(existing.tempMax, temp);
      existing.precip += precip;
      existing.precipProbability = Math.max(existing.precipProbability, precipProbability);
      const hour = parseInt(time.slice(11, 13));
      if (hour >= 11 && hour <= 14 && symbol) existing.symbol = symbol;
    }
  }
  return { days: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)), hours };
}

function symbolEmoji(symbol: string | null): string {
  if (!symbol) return "—";
  if (symbol.includes("clearsky")) return "☀️";
  if (symbol.includes("fair")) return "🌤";
  if (symbol.includes("partlycloudy")) return "⛅";
  if (symbol.includes("cloudy")) return "☁️";
  if (symbol.includes("snow")) return "❄️";
  if (symbol.includes("sleet")) return "🌨";
  if (symbol.includes("rain")) return "🌧";
  if (symbol.includes("thunder")) return "⛈";
  if (symbol.includes("fog")) return "🌫";
  return "🌥";
}

function conditionFromSymbol(symbol: string | null): string {
  if (!symbol) return "—";
  if (symbol.includes("clearsky")) return "Klart";
  if (symbol.includes("fair")) return "Lettskyet";
  if (symbol.includes("partlycloudy")) return "Delvis skyet";
  if (symbol.includes("cloudy")) return "Skyet";
  if (symbol.includes("snow")) return "Snø";
  if (symbol.includes("sleet")) return "Sludd";
  if (symbol.includes("thunder")) return "Tordenvær";
  if (symbol.includes("rain")) return "Regn";
  if (symbol.includes("fog")) return "Tåke";
  return "Vekslende";
}

function weekdayShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { weekday: "short" }).replace(".", ".");
}
function formatTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}
function dirCardinal(deg: number): string {
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return dirs[Math.round((deg % 360) / 45) % 8];
}

// --- Sun position ---
function sunTimes(date: Date, lat: number, lon: number) {
  const today = computeSunForDate(date, lat, lon);
  const yesterday = computeSunForDate(new Date(date.getTime() - 86_400_000), lat, lon);
  return {
    sunrise: today.sunrise,
    sunset: today.sunset,
    dayLengthMinutes: today.dayLengthMinutes,
    deltaMinutes: today.dayLengthMinutes - yesterday.dayLengthMinutes,
  };
}
function computeSunForDate(date: Date, lat: number, lon: number) {
  const rad = Math.PI / 180;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const JDN = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const n = JDN - 2451545.0 + 0.0008;
  const Jstar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const delta = Math.asin(Math.sin(lambda * rad) * Math.sin(23.44 * rad));
  const cosH = (Math.sin(-0.83 * rad) - Math.sin(lat * rad) * Math.sin(delta)) / (Math.cos(lat * rad) * Math.cos(delta));
  if (cosH > 1 || cosH < -1) {
    return { sunrise: null, sunset: null, dayLengthMinutes: cosH > 1 ? 0 : 24 * 60 };
  }
  const H = Math.acos(cosH) / rad;
  const Jrise = Jtransit - H / 360;
  const Jset = Jtransit + H / 360;
  const sunrise = new Date((Jrise - 2440587.5) * 86_400_000);
  const sunset = new Date((Jset - 2440587.5) * 86_400_000);
  const dayLengthMinutes = (sunset.getTime() - sunrise.getTime()) / 60_000;
  return { sunrise, sunset, dayLengthMinutes };
}

// --- Moon ---
function moonPhase(date: Date) {
  const synodic = 29.53058867;
  const ref = Date.UTC(2000, 0, 6, 18, 14, 0);
  const days = (date.getTime() - ref) / 86_400_000;
  const phase = ((days % synodic) + synodic) % synodic;
  const illumination = (1 - Math.cos((2 * Math.PI * phase) / synodic)) / 2;
  let name: string, icon: string;
  if (phase < 1.84566) { name = "Nymåne"; icon = "🌑"; }
  else if (phase < 5.53699) { name = "Voksende månesigd"; icon = "🌒"; }
  else if (phase < 9.22831) { name = "Første kvarter"; icon = "🌓"; }
  else if (phase < 12.91963) { name = "Voksende halvmåne"; icon = "🌔"; }
  else if (phase < 16.61096) { name = "Fullmåne"; icon = "🌕"; }
  else if (phase < 20.30228) { name = "Avtagende halvmåne"; icon = "🌖"; }
  else if (phase < 23.99361) { name = "Siste kvarter"; icon = "🌗"; }
  else if (phase < 27.68493) { name = "Avtagende månesigd"; icon = "🌘"; }
  else { name = "Nymåne"; icon = "🌑"; }
  return { name, icon, illumination };
}
function nextMoonset(now: Date): Date | null {
  // Approksimasjon: månenedgang ca 50 min senere hver dag, basert på en kjent fullmåne-nedgang
  // For ikon-formål — bruker tidspunkt mellom 21:00 og 02:00 forskjøvet med faseprogresjon
  const synodic = 29.53058867;
  const ref = Date.UTC(2000, 0, 6, 18, 14, 0);
  const phase = (((now.getTime() - ref) / 86_400_000) % synodic + synodic) % synodic;
  const offset = (phase / synodic) * 24 * 60; // minutter
  const base = new Date(now);
  base.setHours(20, 0, 0, 0);
  const set = new Date(base.getTime() + offset * 60_000);
  if (set < now) set.setDate(set.getDate() + 1);
  return set;
}
function daysUntilFullMoon(now: Date): number {
  const synodic = 29.53058867;
  const ref = Date.UTC(2000, 0, 6, 18, 14, 0);
  const phase = (((now.getTime() - ref) / 86_400_000) % synodic + synodic) % synodic;
  const full = 14.77;
  let d = full - phase;
  if (d < 0) d += synodic;
  return Math.round(d);
}
