import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { getHomeySnapshot } from "@/lib/homey.functions";
import { findDeviceFuzzy, type DeviceLike } from "@/lib/homey-match";
import { getTollnesAlerts, type AlertsResult, type MetAlert } from "@/lib/lightning.functions";
import { getNetatmoWeatherStation, type WeatherModule } from "@/lib/netatmo-weather.functions";
import { useUserLocation, UserLocationBar } from "@/hooks/use-user-location";
import { useUvSun, uvLevel } from "@/hooks/use-uv-sun";
import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";
import { reverseGeocode } from "@/lib/user-locations.functions";
import type { ActiveLocation } from "@/components/LocationPicker";
import {
  RainFX, SnowFX, CloudFX, WindFX, HeatwaveFX, HumidityFX, PressureFX, GustFX, SunFX, StarFX, MoonFX, ThunderFX,
  GlassPaneFX, glassKindFromSymbol, type GlassKind, TileSplashFX, CloudCoverFX,
} from "@/components/weather/WeatherFX";
import { SpaceWeatherCard } from "@/components/weather/SpaceWeatherCard";
import { AirPollutionCard } from "@/components/weather/AirPollutionCard";
import { RadonCard } from "@/components/weather/RadonCard";
import { VocCard } from "@/components/weather/VocCard";
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
  CloudFog,
  Map as MapIcon,
  ChevronDown,
  ChevronUp,
  Navigation,
  Zap,
  Volume2,
  VolumeX,
  Search as SearchIcon,
  ChevronRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useWeatherSound, type WeatherSoundKind } from "@/components/weather/useWeatherSound";
import { TileToneProvider, TileToneToggle, useTileTone, tileToneClasses, type TileTone } from "@/components/weather/TileTone";
import { TileOpacityProvider, TileOpacityToggle, useTileOpacity } from "@/components/weather/TileOpacity";
import { TileColorProvider, TileColorToggle, TileGlassToggle, useTileColor } from "@/components/weather/TileColor";
import { AnimTogglesProvider, AnimTogglesPanel, useAnimToggles } from "@/components/weather/AnimToggles";
import moonBlueAsset from "@/assets/moon-blue.png.asset.json";
import moonRealAsset from "@/assets/moon-real.png.asset.json";
import { useWindUnit, formatWind, windUnitShort, WIND_UNITS, type WindUnit } from "@/hooks/use-wind-unit";
import { useTempUnit, formatTemp, TEMP_UNITS } from "@/hooks/use-temp-unit";

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
  // Ikke la trege eksterne API-kall (Homey/Netatmo) blokkere navigasjonen til
  // vær-siden. Vi kjører dem i parallell med en kort timeout og lar
  // komponenten håndtere manglende/etterslepende data. Dette fikser tilfellene
  // der siden "henger" ved åpning og man må lukke appen.
  loader: async () => {
    const LOADER_TIMEOUT_MS = 1500;
    const timeout = <T,>(p: Promise<T>, fallback: T) =>
      Promise.race<T>([
        p.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), LOADER_TIMEOUT_MS)),
      ]);
    const [homey, netatmo] = await Promise.all([
      timeout(getHomeySnapshot(), null as Awaited<ReturnType<typeof getHomeySnapshot>> | null),
      timeout(
        getNetatmoWeatherStation({ data: { stationMatch: "tollnes" } }),
        { ok: false as const, error: "Laster…" } as Awaited<ReturnType<typeof getNetatmoWeatherStation>>,
      ),
    ]);
    return { homey, netatmo };
  },
  pendingMs: 0,
  pendingComponent: () => (
    <PageShell>
      <section className="container mx-auto px-4 py-16 text-center">
        <p className="text-white/70">Laster vær…</p>
      </section>
    </PageShell>
  ),
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

const FAV_KEY = "loc:fav:var";

function readFavs(): ActiveLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.label === "string") : [];
  } catch {
    return [];
  }
}


type ForecastDay = {
  date: string;
  symbol: string | null;
  tempMin: number;
  tempMax: number;
  precip: number;
  precipProbability: number;
  windMax: number;
};

type Hour = {
  time: string;
  temp: number;
  precip: number;
  precipMin: number;
  precipMax: number;
  precipProbability: number;
  wind: number;
  windGust: number;
  windDir: number;
  pressure: number;
  humidity: number;
  cloud: number;
  thunder: number;
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
  const [soundEnabled, setSoundEnabled] = usePerUserPersistedState<boolean>("var.tile.sound.enabled", false);
  const [nightModeOverride, setNightModeOverride] = usePerUserPersistedState<boolean>("var.nightMode.override", false);
  const [showThunderProbability, setShowThunderProbability] = usePerUserPersistedState<boolean>("var.thunder.showProbability", false);

  const LOCATIONS = useMemo(
    () => [
      { key: "skien" as const, name: userLoc.active.label, subtitle: "Mitt sted", lat: userLoc.active.lat, lon: userLoc.active.lon },
      HYTTA_LOC,
    ],
    [userLoc.active.label, userLoc.active.lat, userLoc.active.lon],
  );

  const [state, setState] = useState<Record<string, LocationState>>(() => ({
    skien: { days: null, hours: null, error: null, loading: true },
    hytta: { days: null, hours: null, error: null, loading: true },
  }));
  const [refreshTick, setRefreshTick] = useState(0);

  // Refresh når fanen kommer tilbake i forgrunn + hver halvtime
  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        setRefreshTick((t) => t + 1);
      }
    };
    const onFocus = () => setRefreshTick((t) => t + 1);
    window.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    const interval = setInterval(() => setRefreshTick((t) => t + 1), 30 * 60 * 1000);
    return () => {
      window.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, skien: { ...s.skien, loading: true, error: null } }));
    LOCATIONS.forEach(async (loc) => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${loc.lat}&lon=${loc.lon}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        );
        if (!res.ok) throw new Error("Kunne ikke hente værmelding");
        const json = await res.json();
        if (cancelled) return;
        const { days, hours } = parseForecast(json, { showThunderProbability });
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
  }, [fetchAlerts, LOCATIONS, refreshTick, showThunderProbability]);

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

  // Bakgrunnsgradient basert på sol opp/ned og skydekke / symbol
  const bgGradient = useMemo(() => {
    if (nightModeOverride) return "from-[#0b1426] via-[#142340] to-[#1c2e4f]";
    const t = now.getTime();
    const sym = currentHour?.symbol ?? "";
    const isClearSymbol = sym.includes("clearsky") || sym.includes("fair");
    const cloudy = !isClearSymbol && (currentHour?.cloud ?? 50) > 60;
    const sr = sun.sunrise?.getTime();
    const ss = sun.sunset?.getTime();
    // Natt: før soloppgang eller etter solnedgang
    if (sr && ss && (t < sr || t >= ss)) return "from-[#0b1426] via-[#142340] to-[#1c2e4f]";
    // Morgen: første time etter soloppgang
    if (sr && t < sr + 60 * 60 * 1000) return "from-[#3a4a6b] via-[#5d7a9e] to-[#a8b5c8]";
    // Kveld: siste time før solnedgang
    if (ss && t > ss - 60 * 60 * 1000) return "from-[#1c2e4f] via-[#3a4a6b] to-[#6d4e3a]";
    return cloudy
      ? "from-[#4a5a72] via-[#6b7b91] to-[#8a98ad]"
      : "from-[#3478c4] via-[#5a9bd4] to-[#9ec5e8]";
  }, [now, currentHour, sun, nightModeOverride]);


  const headline = useMemo(() => {
    if (!skienHours) return null;
    const startOfTomorrow = new Date(now);
    startOfTomorrow.setHours(24, 0, 0, 0);
    const startOfDayAfter = new Date(startOfTomorrow);
    startOfDayAfter.setHours(24, 0, 0, 0);

    const todayHours = skienHours.filter((h) => {
      const t = new Date(h.time).getTime();
      return t >= now.getTime() && t < startOfTomorrow.getTime();
    });
    const tomorrowHours = skienHours.filter((h) => {
      const t = new Date(h.time).getTime();
      return t >= startOfTomorrow.getTime() && t < startOfDayAfter.getTime();
    });

    const summarize = (hours: typeof skienHours, label: "I dag" | "I morgen"): string | null => {
      if (!hours || hours.length === 0) return null;
      const rain = hours.find((h) => h.precip >= 0.2 || h.precipProbability >= 50);
      if (rain) {
        const t = new Date(rain.time);
        const hh = t.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
        const total = hours.reduce((s, h) => s + (h.precip || 0), 0);
        const totalStr = total >= 0.5 ? ` (ca. ${total.toFixed(1)} mm totalt)` : "";
        return `${label}: nedbør fra kl. ${hh}${totalStr}.`;
      }
      const avgCloud = hours.reduce((s, h) => s + (h.cloud ?? 0), 0) / hours.length;
      if (avgCloud < 25) return `${label}: klart og oppholdsvær.`;
      if (avgCloud < 60) return `${label}: delvis skyet, oppholdsvær.`;
      return `${label}: skyet, men oppholdsvær.`;
    };

    const parts = [summarize(todayHours, "I dag"), summarize(tomorrowHours, "I morgen")].filter(Boolean);
    return parts.length ? parts.join(" ") : null;
  }, [skienHours, now]);

  const todayDay = skienDays?.[0];
  const condition = currentHour ? conditionFromSymbol(currentHour.symbol) : "—";

  // Glassplate-overlay: velg effekt fra symbol + dag/natt
  const isDay = useMemo(() => {
    if (nightModeOverride) return false;
    const t = now.getTime();
    const sr = sun.sunrise?.getTime();
    const ss = sun.sunset?.getTime();
    if (sr && ss) return t >= sr && t < ss;
    const h = now.getHours();
    return h >= 6 && h < 20;
  }, [now, sun, nightModeOverride]);

  const glassKind = useMemo(() => {
    return glassKindFromSymbol(currentHour?.symbol ?? null, isDay);
  }, [currentHour, isDay]);
  const glassIntensity = useMemo(() => {
    const mm = currentHour?.precip ?? 0;
    const pp = (currentHour?.precipProbability ?? 0) / 100;
    return Math.max(0.4, Math.min(1, mm / 3 + pp * 0.6));
  }, [currentHour]);

  return (
    <TileToneProvider>
      <TileOpacityProvider>
        <TileColorProvider>
          <WeatherPageInner
            data={data}
            netatmoData={netatmoData}
            userLoc={userLoc}
            state={state}
            setState={setState}
            alerts={alerts}
            now={now}
            bgGradient={bgGradient}
            glassKind={glassKind}
            glassIntensity={glassIntensity}
            currentHour={currentHour}
            headline={headline}
            todayDay={todayDay}
            condition={condition}
            borgenTemp={borgenTemp}
            borgenHumidity={borgenHumidity}
            tollnesRainToday={tollnesRainToday}
            hyttaRainToday={hyttaRainToday}
            tollnesWind={tollnesWind}
            hyttaWind={hyttaWind}
            tollnesPressure={tollnesPressure}
            hyttaPressure={hyttaPressure}
            tollnesTemp={tollnesTemp}
            hyttaTemp={hyttaTemp}
            hyttaHumidity={hyttaHumidity}
            skienHours={skienHours}
            skienDays={skienDays}
            hyttaHours={hyttaHours}
            hyttaDays={hyttaDays}
            moon={moon}
            sun={sun}
            rangeHours={rangeHours}
            setRangeHours={setRangeHours}
            allAlerts={allAlerts}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
            nightModeOverride={nightModeOverride}
            setNightModeOverride={setNightModeOverride}
            showThunderProbability={showThunderProbability}
            setShowThunderProbability={setShowThunderProbability}
          />
        </TileColorProvider>
      </TileOpacityProvider>
    </TileToneProvider>
  );
}

type WeatherPageInnerProps = {
  data: Awaited<ReturnType<typeof getHomeySnapshot>>;
  netatmoData: Awaited<ReturnType<typeof getNetatmoWeatherStation>>;
  userLoc: ReturnType<typeof useUserLocation>;
  state: Record<string, LocationState>;
  setState: React.Dispatch<React.SetStateAction<Record<string, LocationState>>>;
  alerts: AlertsResult | null;
  now: Date;
  bgGradient: string;
  glassKind: GlassKind;
  glassIntensity: number;
  currentHour: Hour | null;
  headline: string | null;
  todayDay: ForecastDay | undefined;
  condition: string;
  borgenTemp: number | null;
  borgenHumidity: number | null;
  tollnesRainToday: number | null;
  hyttaRainToday: number | null;
  tollnesWind: number | null;
  hyttaWind: number | null;
  tollnesPressure: number | null;
  hyttaPressure: number | null;
  tollnesTemp: number | null;
  hyttaTemp: number | null;
  hyttaHumidity: number | null;
  skienHours: Hour[] | null;
  skienDays: ForecastDay[] | null;
  hyttaHours: Hour[] | null;
  hyttaDays: ForecastDay[] | null;
  moon: { name: string; icon: string; illumination: number; phaseFraction: number };
  sun: ReturnType<typeof sunTimes>;
  rangeHours: 24 | 72 | 168;
  setRangeHours: (v: 24 | 72 | 168) => void;
  allAlerts: MetAlert[];
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  nightModeOverride: boolean;
  setNightModeOverride: React.Dispatch<React.SetStateAction<boolean>>;
  showThunderProbability: boolean;
  setShowThunderProbability: React.Dispatch<React.SetStateAction<boolean>>;
};

function WeatherPageInner(props: WeatherPageInnerProps) {
  const {
    data, netatmoData, userLoc, alerts, now, bgGradient, glassKind, glassIntensity,
    currentHour, headline, todayDay, condition, borgenTemp, borgenHumidity,
    tollnesRainToday, hyttaRainToday, tollnesWind, hyttaWind, tollnesPressure, hyttaPressure,
    tollnesTemp, hyttaTemp, hyttaHumidity, skienHours, skienDays, hyttaHours, hyttaDays, moon, sun,
    rangeHours, setRangeHours, allAlerts, soundEnabled, setSoundEnabled,
    nightModeOverride, setNightModeOverride,
    showThunderProbability, setShowThunderProbability,
  } = props;

  const [tempUnit] = useTempUnit();


  const isDay = useMemo(() => {
    if (nightModeOverride) return false;
    const t = now.getTime();
    const sr = sun.sunrise?.getTime();
    const ss = sun.sunset?.getTime();
    if (sr && ss) return t >= sr && t < ss;
    const h = now.getHours();
    return h >= 6 && h < 20;
  }, [now, sun, nightModeOverride]);

  const homeyOk = data?.ok === true;
  const { opacity } = useTileOpacity();
  const { color: tileColor } = useTileColor();
  const { tone } = useTileTone();


  // Scroll-drevet inn/ut-fading på sammendragsboksen (replaces hero shrink)
  const heroRef = useRef<HTMLDivElement>(null);
  const [showSummary, setShowSummary] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const hero = heroRef.current;
      if (!hero) {
        setShowSummary(false);
        return;
      }
      const rect = hero.getBoundingClientRect();
      // Vis når hero er scrollet forbi toppmenyen (56px + liten margin)
      setShowSummary(rect.bottom < 80);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  return (
    <PageShell>
      <div
        className={`min-h-screen bg-gradient-to-b ${bgGradient} transition-colors duration-1000 relative ${tileColor ? "has-tile-color" : ""}`}
        style={{
          ["--tile-opacity" as string]: opacity / 100,
          ...(tileColor ? { ["--tile-color-bg" as string]: tileColor } : {}),
        }}
      >
        <GlassPaneFX kind={glassKind} intensity={glassIntensity} sun={sun} now={now} />
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-16 space-y-4 text-white relative z-10">

          {/* Innstillinger er flyttet til menyknappen nederst til høyre */}

          {/* HERO — normal i flyten, krymper ikke lenger */}
          <div ref={heroRef} className="relative z-10 -mx-4 px-4">
            <header className="text-center pt-4 pb-2">
              <h1
                className="font-medium tracking-wide text-white/90 drop-shadow-md text-lg mt-1 min-h-[1.2em]"
                suppressHydrationWarning
              >
                {userLoc.ready ? userLoc.active.label : "\u00A0"}
              </h1>
              {userLoc.ready && userLoc.active.source === "gps" ? (
                <div className="inline-flex items-center justify-center gap-3 mt-2">
                  <div className="leading-none font-thin drop-shadow-lg tabular-nums text-[88px]">
                    {currentHour ? formatTemp(currentHour.temp, tempUnit) : "—"}
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/20 text-white/90 text-[10px] tracking-[0.2em] uppercase backdrop-blur-sm">
                    <Navigation size={10} /> Min posisjon
                  </div>
                </div>
              ) : (
                <div
                  className="leading-none font-thin drop-shadow-lg tabular-nums text-[88px] mt-2 inline-block"
                  suppressHydrationWarning
                >
                  {userLoc.ready && currentHour ? formatTemp(currentHour.temp, tempUnit) : "—"}
                </div>
              )}
              <div className="font-medium text-xl mt-2 block">{condition}</div>
              {todayDay && (
                <div className="text-base font-medium mt-1 tabular-nums">
                  H: {formatTemp(todayDay.tempMax, tempUnit)}  L: {formatTemp(todayDay.tempMin, tempUnit)}
                </div>
              )}
              {headline && (
                <div className="text-sm text-white/90 mt-3">{headline}</div>
              )}
            </header>
          </div>

          {/* Sticky sammendragsbar som glir ned når hero scroller ut — følger flis-farge/tone/gjennomsiktighet */}
          <div
            className={`fixed top-[56px] left-0 right-0 z-40 px-4 transition-all duration-300 ease-out ${
              showSummary ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
            }`}
          >
            <div className="max-w-3xl mx-auto">
              <div className={`${tileToneClasses(tone)} tile-bg-${tone} backdrop-blur-xl border border-t-0 shadow-lg py-2.5 px-4 rounded-b-xl`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-sm font-medium truncate" suppressHydrationWarning>
                      {userLoc.ready ? userLoc.active.label : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-2xl font-thin tabular-nums" suppressHydrationWarning>
                      {currentHour ? formatTemp(currentHour.temp, tempUnit) : "—"}
                    </div>
                    <div className="text-sm font-medium">{condition}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>


          {/* Kompakte farevarsler — rett over søkeboksen */}
          {allAlerts.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {allAlerts.slice(0, 2).map((alert) => (
                <AlertCompactTile key={alert.id} alert={alert} />
              ))}
            </div>
          )}

          {/* Søke-knapp → åpner favoritt-siden med animert vær pr sted */}
          <Link
            to="/varfavoritter"
            className={`${toneCardCn(tone)} relative z-10 flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors`}
          >
            <TileSplashFX kind={glassKind} intensity={glassIntensity} />
            <div className="relative z-10 flex items-center gap-3 w-full">
              <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                <SearchIcon size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.25em] uppercase text-white/60">Søk sted</div>
              </div>
              <ChevronRight size={18} className="text-white/60" />
            </div>
          </Link>

          {/* ROTERENDE 48-TIMERS PROGNOSE: nedbør · værforhold · vind · lyn */}
          <RotatingForecastCard hours={skienHours} soundEnabled={soundEnabled} />


          {/* 10-DAGERS PROGNOSE */}
          <DailyListCard days={skienDays} hours={skienHours} title={`${userLoc.active.label} · 10 dager`} />

          {/* VIND DETALJ */}
          <WindDetailCard hour={currentHour} />

          {/* MÅNE */}
          <MoonCard moon={moon} now={now} />

          {/* SOL */}
          <SunsetCard sun={sun} now={now} moon={moon} />

          {/* FØLES SOM + SKYDEKKE */}
          <div className="grid grid-cols-2 gap-3">
            <FeelsLikeCard hour={currentHour} isDay={isDay} />
            <CloudCard hour={currentHour} />
          </div>

          {/* NEDBØR I DAG + VINDKAST */}
          <div className="grid grid-cols-2 gap-3">
            <PrecipTodayCard day={todayDay} days={skienDays} />
            <GustCard hour={currentHour} />
          </div>

          {/* GJENNOMSNITT TEMPERATUR + SIKT */}
          <div className="grid grid-cols-2 gap-3">
            <AvgTempCard hours={skienHours} />
            <VisibilityCard hour={currentHour} />
          </div>

          {/* LUFTFUKTIGHET + LUFTTRYKK */}
          <div className="grid grid-cols-2 gap-3">
            <HumidityCard hour={currentHour} />
            <PressureCard hour={currentHour} />
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

          {/* Romvær — solstormer, solvind, geomagnetiske stormer, nordlys, stråling */}
          <SpaceWeatherCard refreshKey={`${userLoc.active.lat.toFixed(3)},${userLoc.active.lon.toFixed(3)}`} />

          {/* Radon — Airthings via Homey */}
          <RadonCard refreshKey={`${userLoc.active.lat.toFixed(3)},${userLoc.active.lon.toFixed(3)}`} />

          {/* VOC — Airthings via Homey (stua) */}
          <VocCard refreshKey={`${userLoc.active.lat.toFixed(3)},${userLoc.active.lon.toFixed(3)}`} />


          {/* Luftkvalitet — PM2.5, PM10, NO2, O3, SO2, CO */}
          <AirPollutionCard lat={userLoc.active.lat} lon={userLoc.active.lon} locationLabel={userLoc.active.label} />


          {/* VINDROSE */}
          <GlassCard eyebrow={`Vindrose · ${rangeLabel(rangeHours)}`} icon={<Navigation size={14} />}>
            <WindRose name={userLoc.active.label} hours={skienHours} rangeHours={rangeHours} />
          </GlassCard>


          {/* WINDY KART */}
          <CollapsibleMap />

          <p className="text-[10px] text-white/50 text-center pt-4">
            Værdata fra MET.no. Live målinger fra Netatmo via Homey. Astronomi beregnet lokalt. Kart fra Windy.com.
          </p>
        </div>
        <LocationDots userLoc={userLoc} />
        <Link
          to="/varkart"
          aria-label="Åpne værkart"
          title="Værkart"
          className="fixed bottom-6 left-6 z-50 w-12 h-12 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-black/55 active:scale-95 transition-all"
        >
          <MapIcon size={20} />
        </Link>
        <WeatherMenuButton
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          nightModeOverride={nightModeOverride}
          setNightModeOverride={setNightModeOverride}
          showThunderProbability={showThunderProbability}
          setShowThunderProbability={setShowThunderProbability}
        />

      </div>
    </PageShell>
  );
}

function LocationDots({
  userLoc,
}: {
  userLoc: ReturnType<typeof useUserLocation>;
}) {
  const [favs, setFavs] = useState<ActiveLocation[]>([]);
  const reverse = useServerFn(reverseGeocode);
  // -1 = GPS, 0..n-1 = favoritt-index. null = ingen forhåndsvisning.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFavs(readFavs());
    const refresh = () => setFavs(readFavs());
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAV_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("loc-favs-changed", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("loc-favs-changed", refresh);
    };
  }, []);

  const activeFavIndex = useMemo(() => {
    if (userLoc.active.source === "gps") return -1;
    return favs.findIndex((f) => f.label === userLoc.active.label);
  }, [favs, userLoc.active]);

  const isGpsActive = userLoc.active.source === "gps";

  const selectGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          const r = await reverse({ data: { lat, lon } });
          userLoc.setActive({ label: r.label, lat: r.lat, lon: r.lon, source: "gps" });
        } catch {
          userLoc.setActive({ label: `${lat.toFixed(3)}°N ${lon.toFixed(3)}°Ø`, lat, lon, source: "gps" });
        }
      },
      () => {
        // ignore denied
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const selectFav = (index: number) => {
    const fav = favs[index];
    if (fav) userLoc.setActive({ ...fav, source: "favorite" });
  };

  const commitSelection = (idx: number | null) => {
    if (idx === null) return;
    if (idx === -1) selectGps();
    else selectFav(idx);
  };

  // Finn nærmeste dot/pil basert på x-koordinat (fungerer også når fingeren
  // dras ut av selve knappen, så lenge man er innenfor stripen).
  const hitTest = (clientX: number, clientY: number): number | null => {
    // Direkte treff først
    for (let i = 0; i < itemsRef.current.length; i++) {
      const el = itemsRef.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top - 20 && clientY <= r.bottom + 20) {
        return i === 0 ? -1 : i - 1;
      }
    }
    // Fallback: nærmeste senter i x, dersom vi er innenfor bar-en vertikalt (+padding)
    const bar = barRef.current?.getBoundingClientRect();
    if (!bar) return null;
    if (clientY < bar.top - 40 || clientY > bar.bottom + 40) return null;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < itemsRef.current.length; i++) {
      const el = itemsRef.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cx = (r.left + r.right) / 2;
      const d = Math.abs(clientX - cx);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx < 0 ? null : bestIdx === 0 ? -1 : bestIdx - 1;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const idx = hitTest(e.clientX, e.clientY);
    if (idx !== null) setPreviewIndex(idx);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (previewIndex === null) return;
    const idx = hitTest(e.clientX, e.clientY);
    if (idx !== null && idx !== previewIndex) setPreviewIndex(idx);
  };
  const handlePointerEnd = (e: React.PointerEvent) => {
    if (previewIndex === null) return;
    const idx = hitTest(e.clientX, e.clientY) ?? previewIndex;
    commitSelection(idx);
    setPreviewIndex(null);
  };
  const handlePointerCancel = () => setPreviewIndex(null);

  const previewLabel = (() => {
    if (previewIndex === null) return null;
    if (previewIndex === -1) return "Min posisjon";
    return favs[previewIndex]?.label ?? null;
  })();

  return (
    <div
      ref={barRef}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={(e) => {
        // Hvis brukeren slipper utenfor: behold preview til pointerup skjer.
        // Ingenting her.
        void e;
      }}
    >
      {previewLabel && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-xl border border-white/15 text-white text-xs font-medium shadow-lg pointer-events-none">
          {previewLabel}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-black/80 border-r border-b border-white/15" />
        </div>
      )}
      <button
        ref={(el) => { itemsRef.current[0] = el; }}
        type="button"
        aria-label="Min posisjon"
        title="Min posisjon"
        className={`rounded-full transition-all ${
          previewIndex === -1
            ? "bg-white text-slate-900 scale-125 shadow-[0_0_14px_rgba(255,255,255,0.8)]"
            : isGpsActive
              ? "bg-white/90 text-slate-900 scale-110 shadow-[0_0_12px_rgba(255,255,255,0.6)]"
              : "text-white/70 hover:text-white hover:bg-white/20"
        }`}
      >
        <Navigation size={20} className="p-1" />
      </button>
      <div className="flex items-center gap-2.5">
        {favs.map((fav, i) => {
          const isActive = i === activeFavIndex;
          const isPreview = previewIndex === i;
          return (
            <button
              key={i}
              ref={(el) => { itemsRef.current[i + 1] = el; }}
              type="button"
              aria-label={fav.label}
              title={fav.label}
              className={`w-3 h-3 rounded-full transition-all ${
                isPreview
                  ? "bg-white scale-150 shadow-[0_0_12px_rgba(255,255,255,0.9)]"
                  : isActive
                    ? "bg-white scale-125 shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                    : "bg-white/40 hover:bg-white/70"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

function WeatherMenuButton({
  soundEnabled,
  setSoundEnabled,
  nightModeOverride,
  setNightModeOverride,
  showThunderProbability,
  setShowThunderProbability,
}: {
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  nightModeOverride: boolean;
  setNightModeOverride: React.Dispatch<React.SetStateAction<boolean>>;
  showThunderProbability: boolean;
  setShowThunderProbability: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Værmeny"
        aria-expanded={open}
        title="Værmeny"
        className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-black/55 active:scale-95 transition-all"
      >
        <span className="flex flex-col gap-[5px]" aria-hidden="true">
          <span className="flex items-center gap-[5px]">
            <span className="w-1 h-1 rounded-full bg-current" />
            <span className="w-[18px] h-[2px] rounded-full bg-current" />
          </span>
          <span className="flex items-center gap-[5px]">
            <span className="w-1 h-1 rounded-full bg-current" />
            <span className="w-[18px] h-[2px] rounded-full bg-current" />
          </span>
          <span className="flex items-center gap-[5px]">
            <span className="w-1 h-1 rounded-full bg-current" />
            <span className="w-[18px] h-[2px] rounded-full bg-current" />
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute bottom-14 right-0 p-3 rounded-2xl bg-black/50 backdrop-blur-xl border border-white/10 shadow-2xl flex flex-col gap-2.5 w-[260px] max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-white/70">Værlyd</span>
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              aria-pressed={soundEnabled}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all ${
                soundEnabled
                  ? "bg-white text-slate-900"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              <span>{soundEnabled ? "På" : "Av"}</span>
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-white/70">Overstyr nattmodus</span>
            <button
              type="button"
              onClick={() => setNightModeOverride((v) => !v)}
              aria-pressed={nightModeOverride}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all ${
                nightModeOverride
                  ? "bg-white text-slate-900"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              {nightModeOverride ? <Moon size={12} /> : <Sun size={12} />}
              <span>{nightModeOverride ? "På" : "Av"}</span>
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-white/70 pr-2 leading-tight">Vis torden-% uten MET-symbol</span>
            <button
              type="button"
              onClick={() => setShowThunderProbability((v) => !v)}
              aria-pressed={showThunderProbability}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all shrink-0 ${
                showThunderProbability
                  ? "bg-white text-slate-900"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              <Zap size={12} />
              <span>{showThunderProbability ? "På" : "Av"}</span>
            </button>
          </div>

          <WindUnitSelect />
          <TempUnitSelect />

          <div className="h-px bg-white/10" />

          <TileColorToggle />

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-white/50 uppercase tracking-wider">Flis-stil</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <TileGlassToggle />
              <TileOpacityToggle />
              <TileToneToggle />
            </div>
          </div>

          <div className="h-px bg-white/10 mx-2" />

          <Link
            to="/varfavoritter"
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <SearchIcon size={14} />
            <span>Søk / favoritter</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function WindUnitSelect() {
  const [unit, setUnit] = useWindUnit();
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <span className="text-[10px] text-white/50 uppercase tracking-wider">Vind-enhet</span>
      <div className="flex flex-wrap gap-1">
        {WIND_UNITS.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setUnit(u.id)}
            aria-pressed={unit === u.id}
            title={u.label}
            className={`rounded-full px-2 py-1 text-[10px] font-medium transition-all ${
              unit === u.id
                ? "bg-white text-slate-900"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            }`}
          >
            {u.short}
          </button>
        ))}
      </div>
    </div>
  );
}

function TempUnitSelect() {
  const [unit, setUnit] = useTempUnit();
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <span className="text-[10px] text-white/50 uppercase tracking-wider">Temp-enhet</span>
      <div className="flex flex-wrap gap-1">
        {TEMP_UNITS.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setUnit(u.id)}
            aria-pressed={unit === u.id}
            title={u.label}
            className={`rounded-full px-2 py-1 text-[10px] font-medium transition-all ${
              unit === u.id
                ? "bg-white text-slate-900"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            }`}
          >
            {u.short}
          </button>
        ))}
      </div>
    </div>
  );
}

function toneCardCn(tone: TileTone, extra = ""): string {
  return `relative overflow-hidden rounded-2xl backdrop-blur-xl shadow-lg shadow-black/10 p-4 ${tileToneClasses(tone)} ${extra}`;
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
  const { tone } = useTileTone();
  return (
    <article className={toneCardCn(tone, className)}>
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
// ROTERENDE 48-TIMERS PROGNOSE
// Én flis som veksler mellom: Nedbør · Værforhold · Vind · Lyn
// ============================================================

type PanelKey = "nedbor" | "vaer" | "skydekke" | "vind" | "lyn";

function RotatingForecastCard({ hours, soundEnabled }: { hours: Hour[] | null; soundEnabled: boolean }) {
  const [panel, setPanel] = usePerUserPersistedState<PanelKey>("var:rotating:panel", "nedbor");
  const [rangeHours, setRangeHours] = usePerUserPersistedState<24 | 48 | 96>("var:rotating:rangeHours", 48);
  const { tone } = useTileTone();
  useWeatherSound(soundEnabled ? (panel as WeatherSoundKind) : null, soundEnabled);

  const panels: { key: PanelKey; label: string; icon: React.ReactNode }[] = [
    { key: "vaer", label: "Værforhold", icon: <Cloud size={14} /> },
    { key: "nedbor", label: "Nedbør", icon: <Droplets size={14} /> },
    { key: "skydekke", label: "Skydekke", icon: <CloudFog size={14} /> },
    { key: "vind", label: "Vind", icon: <Wind size={14} /> },
    { key: "lyn", label: "Lyn & torden", icon: <Zap size={14} /> },
  ];

  if (!hours)
    return (
      <GlassCard icon={<TrendingUp size={14} />}>
        <Skeleton />
      </GlassCard>
    );

  const nextHours = hours.slice(0, rangeHours);
  const maxRain = Math.max(1, ...nextHours.map((h) => h.precip));
  const rawMaxRain = Math.max(0, ...nextHours.map((h) => h.precip));
  const totalRain = nextHours.reduce((s, h) => s + Math.max(0, h.precip), 0);
  // Sparse when dry (totalRain < 0.1mm), escalating up to heavy rain (~6mm peak or 20mm total)
  const rainIntensity = Math.min(1, Math.max(rawMaxRain / 6, totalRain / 20));
  const maxWind = Math.max(8, ...nextHours.map((h) => Math.max(h.wind, h.windGust)));
  const maxThunder = Math.max(0, ...nextHours.map((h) => h.thunder));
  const avgCloud = nextHours.reduce((s, h) => s + (h.cloud ?? 0), 0) / Math.max(1, nextHours.length);

  const fx =
    panel === "nedbor" ? <RainFX intensity={rainIntensity} /> :
    panel === "vaer" ? <CloudFX intensity={0.4} /> :
    panel === "skydekke" ? <CloudCoverFX intensity={Math.min(1, avgCloud / 100)} rainIntensity={rainIntensity} /> :
    panel === "vind" ? <WindFX intensity={Math.min(1, maxWind / 14)} /> :
    maxThunder < 10 ? null :
    <ThunderFX intensity={Math.min(1, Math.max(0.3, maxThunder / 60))} />;


  const active = panels.find((p) => p.key === panel)!;

  return (
    <article className={toneCardCn(tone)}>
      {fx}
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-[11px] tracking-[0.15em] font-semibold text-white/80 uppercase">
            {active.icon}
            <span>{active.label} · neste {rangeHours} t</span>
          </div>
          <div className="flex items-center gap-1">
            {panels.map((p) => {
              const isActive = p.key === panel;
              return (
                <button
                  key={p.key}
                  onClick={() => setPanel(p.key)}
                  aria-label={p.label}
                  title={p.label}
                  className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-all ${
                    isActive
                      ? "bg-white text-slate-900 shadow"
                      : "bg-white/15 text-white/70 hover:bg-white/25 hover:text-white"
                  }`}
                >
                  {p.icon}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] tracking-[0.1em] text-white/60 uppercase">Horisont</span>
          {[24, 48, 96].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setRangeHours(h as 24 | 48 | 96)}
              aria-pressed={rangeHours === h}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                rangeHours === h
                  ? "bg-white text-slate-900 shadow"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              {h === 96 ? "10d" : `${h}t`}
            </button>
          ))}
        </div>

        <style>{`
          @keyframes panelFlyRight { 0% { opacity:0; transform: translateX(120%) rotate(6deg) scale(.9); } 60% { opacity:1; } 100% { opacity:1; transform: translateX(0) rotate(0) scale(1); } }
          @keyframes panelFlyLeft  { 0% { opacity:0; transform: translateX(-120%) rotate(-6deg) scale(.9); } 60% { opacity:1; } 100% { opacity:1; transform: translateX(0) rotate(0) scale(1); } }
          @keyframes panelFlyUp    { 0% { opacity:0; transform: translateY(80%) scale(.92); filter: blur(6px); } 100% { opacity:1; transform: translateY(0) scale(1); filter: blur(0); } }
          @keyframes panelFlyZoom  { 0% { opacity:0; transform: scale(.6) rotate(-3deg); filter: blur(8px); } 100% { opacity:1; transform: scale(1) rotate(0); filter: blur(0); } }
          @keyframes hourPop { 0% { opacity:0; transform: translateY(14px) scale(.7); filter: blur(4px); } 60% { opacity:1; transform: translateY(-2px) scale(1.05); filter: blur(0); } 100% { opacity:1; transform: translateY(0) scale(1); } }
          @keyframes hourSlide { 0% { opacity:0; transform: translateX(24px); } 100% { opacity:1; transform: translateX(0); } }
          @keyframes hourDrop { 0% { opacity:0; transform: translateY(-18px) rotate(-8deg); } 70% { opacity:1; transform: translateY(2px) rotate(2deg); } 100% { opacity:1; transform: translateY(0) rotate(0); } }
          @keyframes pathDraw { 0% { stroke-dashoffset: 1200; opacity:0; } 30% { opacity:1; } 100% { stroke-dashoffset: 0; opacity:1; } }
          @keyframes barGrow { 0% { transform: scaleY(0); } 100% { transform: scaleY(1); } }
        `}</style>
        <div
          key={panel}
          style={{
            animation:
              panel === "nedbor"  ? "panelFlyRight 0.6s cubic-bezier(.2,.8,.2,1) both" :
              panel === "vaer"    ? "panelFlyLeft 0.6s cubic-bezier(.2,.8,.2,1) both" :
              panel === "skydekke"? "panelFlyUp 0.55s cubic-bezier(.2,.8,.2,1) both" :
              panel === "vind"    ? "panelFlyUp 0.55s cubic-bezier(.2,.8,.2,1) both" :
                                    "panelFlyZoom 0.6s cubic-bezier(.2,.8,.2,1) both",
            willChange: "transform, opacity, filter",
          }}
        >
          {panel === "nedbor" && <NedborPanel hours={nextHours} maxP={maxRain} />}
          {panel === "vaer" && <VaerPanel hours={nextHours} />}
          {panel === "skydekke" && <SkydekkePanel hours={nextHours} />}
          {panel === "vind" && <VindPanel hours={nextHours} maxW={maxWind} />}
          {panel === "lyn" && <LynPanel hours={nextHours} />}
        </div>
      </div>
    </article>
  );
}

function HourLabel({ time, index }: { time: string; index: number }) {
  if (index === 0) return <>Nå</>;
  const d = new Date(time);
  const hh = d.getHours().toString().padStart(2, "0");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  if (dayStart.getTime() !== today.getTime()) {
    const wd = d.toLocaleDateString("nb-NO", { weekday: "short" });
    return <>{wd.slice(0, 2)} {hh}</>;
  }
  return <>{hh}</>;
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

// Formater nedbør som Yr: "0,2" eller "0–0,2" (komma-desimal, bindestrek for range)
function fmtPrecipYr(min: number, max: number): string {
  const lo = Math.max(0, min ?? 0);
  const hi = Math.max(0, max ?? 0);
  const fmt = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1)).replace(".", ",");
  if (hi <= 0) return "";
  if (Math.abs(hi - lo) < 0.05) return fmt(hi);
  return `${fmt(lo)}–${fmt(hi)}`;
}

function NedborPanel({ hours, maxP }: { hours: Hour[]; maxP: number }) {
  const total = hours.reduce((s, h) => s + h.precip, 0);
  const firstRain = hours.find((h) => h.precip >= 0.1);
  const peakIdx = hours.reduce((best, h, i, arr) => (h.precip > arr[best].precip ? i : best), 0);
  const peak = hours[peakIdx];
  const summary = !firstRain
    ? `Ingen nedbør ventet de neste ${hours.length} timene.`
    : `Regn fra ${fmtWhen(firstRain.time)} · mest ${peak.precip.toFixed(1)} mm rundt ${fmtWhen(peak.time)} · totalt ${total.toFixed(1)} mm`;

  return (
    <div className="space-y-2">
      <div className="text-[12px] text-white/90">{summary}</div>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex items-end gap-2 min-w-max pb-1">
          {hours.map((h, i) => {
            const heightPct = Math.max(4, (h.precip / maxP) * 70);
            const mmLabel = fmtPrecipYr(h.precipMin, h.precipMax);
            return (
              <div
                key={h.time}
                className="flex flex-col items-center w-10"
                style={{ animation: `hourPop 0.45s cubic-bezier(.2,.8,.2,1) ${(0.45 + i * 0.05).toFixed(2)}s both` }}
              >
                <div className="text-[10px] text-white/80 mb-1">
                  <HourLabel time={h.time} index={i} />
                </div>
                <div className="relative w-6 h-20 rounded-md bg-white/15 overflow-hidden border-t border-dashed border-white/20">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sky-300 to-sky-200 rounded-md"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <div className="text-[9px] text-sky-200 tabular-nums mt-1 leading-tight min-h-[10px]">
                  {mmLabel}
                </div>
                <div className="flex items-center gap-0.5 mt-0.5 text-[10px] text-sky-100 font-medium tabular-nums">
                  <Droplets size={8} />
                  {Math.round(h.precipProbability)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VaerPanel({ hours }: { hours: Hour[] }) {
  const [tempUnit] = useTempUnit();
  const temps = hours.map((h) => h.temp);
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  const warmIdx = temps.indexOf(tMax);
  const coldIdx = temps.indexOf(tMin);
  const summary = `Temp ${formatTemp(tMin, tempUnit)} – ${formatTemp(tMax, tempUnit)} · varmest ${fmtWhen(hours[warmIdx].time)} · kaldest ${fmtWhen(hours[coldIdx].time)}`;

  return (
    <div className="space-y-2">
      <div className="text-[12px] text-white/90">{summary}</div>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex items-center gap-3 min-w-max pb-1">
          {hours.map((h, i) => (
            <div
              key={h.time}
              className="flex flex-col items-center w-10"
              style={{ animation: `hourDrop 0.5s cubic-bezier(.2,.8,.2,1) ${(0.45 + i * 0.05).toFixed(2)}s both` }}
            >
              <div className="text-[10px] text-white/80 mb-1.5">
                <HourLabel time={h.time} index={i} />
              </div>
              <div className="text-xl mb-0.5">{symbolEmoji(h.symbol)}</div>
              {h.precipProbability >= 20 && (
                <div className="text-[9px] text-sky-200 tabular-nums">
                  {Math.round(h.precipProbability)}%
                </div>
              )}
              <div className="text-sm font-medium tabular-nums mt-0.5">{formatTemp(h.temp, tempUnit)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkydekkePanel({ hours }: { hours: Hour[] }) {
  const next = hours;
  const clouds = next.map((h) => Math.max(0, Math.min(100, h.cloud ?? 0)));
  const avg = clouds.reduce((s, v) => s + v, 0) / Math.max(1, clouds.length);
  const peakIdx = clouds.reduce((b, v, i) => (v > clouds[b] ? i : b), 0);
  const clearIdx = clouds.reduce((b, v, i) => (v < clouds[b] ? i : b), 0);
  const peak = next[peakIdx];
  const clear = next[clearIdx];
  const label = avg < 25 ? "Stort sett klart" : avg < 60 ? "Vekslende skydekke" : avg < 85 ? "Mye skyet" : "Tett overskyet";
  const summary = `${label} · snitt ${Math.round(avg)} % · tettest ${Math.round(clouds[peakIdx])} % ${fmtWhen(peak.time)} · klarest ${Math.round(clouds[clearIdx])} % ${fmtWhen(clear.time)}`;

  return (
    <div className="space-y-2">
      <div className="text-[12px] text-white/90">{summary}</div>

      <div className="flex items-baseline gap-3 px-1">
        <div className="text-3xl font-semibold tabular-nums text-white">{Math.round(avg)}<span className="text-base text-white/70">%</span></div>
        <div className="text-[11px] text-white/70">snitt skydekke neste {hours.length} t</div>
      </div>

      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex items-end gap-2 min-w-max pb-1">
          {next.map((h, i) => {
            const v = clouds[i];
            // mørk farge ved tett dekke
            const l = Math.round(240 - v * 1.9); // 240 → 50
            const col = `rgb(${l},${l},${Math.min(255, l + 10)})`;
            return (
              <div
                key={h.time}
                className="flex flex-col items-center w-10"
                style={{ animation: `hourPop 0.45s cubic-bezier(.2,.8,.2,1) ${(0.4 + i * 0.04).toFixed(2)}s both` }}
              >
                <div className="text-[10px] text-white/80 mb-1"><HourLabel time={h.time} index={i} /></div>
                <div className="relative w-6 h-16 rounded-md bg-white/10 overflow-hidden border-t border-dashed border-white/20">
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-md"
                    style={{ height: `${Math.max(4, v)}%`, background: `linear-gradient(to top, ${col}, rgba(255,255,255,0.15))` }}
                  />
                </div>
                <div className="text-[10px] text-white/85 font-medium tabular-nums mt-1">{Math.round(v)}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function VindPanel({ hours, maxW }: { hours: Hour[]; maxW: number }) {
  const [unit] = useWindUnit();
  const maxG = Math.max(maxW, ...hours.map((h) => h.windGust));
  const peakIdx = hours.reduce((b, h, i, a) => (h.windGust > a[b].windGust ? i : b), 0);
  const peak = hours[peakIdx];
  const summary =
    peak.windGust >= 10
      ? `Sterkest kast ${formatWind(peak.windGust, unit, { digits: 0 })} rundt ${fmtWhen(peak.time)} · middelvind opp til ${formatWind(Math.max(...hours.map((h) => h.wind)), unit, { digits: 0 })}`
      : `Rolig vind · maks ${formatWind(peak.windGust, unit, { digits: 0 })} neste ${hours.length} t`;
  return (
    <div className="space-y-2">
      <div className="text-[12px] text-white/90">{summary}</div>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex items-end gap-2 min-w-max pb-1">
        {hours.map((h, i) => {
          const heightPct = Math.max(4, (h.wind / maxG) * 70);
          const gustPct = Math.max(heightPct, (h.windGust / maxG) * 70);
          const strong = h.wind >= 10;
          return (
            <div
              key={h.time}
              className="flex flex-col items-center w-10"
              style={{ animation: `hourSlide 0.45s cubic-bezier(.2,.8,.2,1) ${(0.45 + i * 0.05).toFixed(2)}s both` }}
            >
              <div className="text-[10px] text-white/80 mb-1">
                <HourLabel time={h.time} index={i} />
              </div>
              <div className="relative w-6 h-20 rounded-md bg-white/15 overflow-hidden border-t border-dashed border-white/20">
                <div
                  className="absolute bottom-0 left-0 right-0 bg-white/25 rounded-md origin-bottom"
                  style={{
                    height: `${gustPct}%`,
                    animation: `barGrow 0.4s cubic-bezier(.2,.8,.2,1) ${(0.53 + i * 0.05).toFixed(2)}s both`,
                  }}
                />
                <div
                  className={`absolute bottom-0 left-0 right-0 rounded-md origin-bottom ${
                    strong
                      ? "bg-gradient-to-t from-emerald-500 via-emerald-300 to-emerald-100"
                      : "bg-gradient-to-t from-emerald-400 to-emerald-200"
                  }`}
                  style={{
                    height: `${heightPct}%`,
                    animation: `barGrow 0.45s cubic-bezier(.2,.8,.2,1) ${(0.45 + i * 0.05).toFixed(2)}s both`,
                  }}
                />
              </div>
              <div className="text-[10px] text-emerald-100 font-medium tabular-nums mt-1">
                {formatWind(h.wind, unit, { digits: 0, withUnit: false })}
              </div>
              <div className="text-[9px] text-emerald-200/80 tabular-nums leading-none">
                kast {formatWind(h.windGust, unit, { digits: 0, withUnit: false })}
              </div>
              <div
                className="text-[9px] text-white/60 leading-none"
                style={{ transform: `rotate(${h.windDir}deg)`, display: "inline-block" }}
              >
                ↓
              </div>
            </div>
          );
        })}
        </div>
      </div>
      <div className="text-[10px] text-white/60 mt-1 px-1">■ vind &nbsp; ▒ kast ({windUnitShort(unit)})</div>
    </div>
  );
}

function LynPanel({ hours }: { hours: Hour[] }) {
  const maxT = Math.max(5, ...hours.map((h) => h.thunder));
  const peakIdx = hours.reduce(
    (best, h, i, arr) => (h.thunder > arr[best].thunder ? i : best),
    0,
  );
  const peak = hours[peakIdx];
  const peakTime = new Date(peak.time);
  const peakLabel =
    peak.thunder >= 5
      ? `Høyeste sjanse ${Math.round(peak.thunder)} % rundt ${peakTime.toLocaleString("nb-NO", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
      : `Ingen torden ventet de neste ${hours.length} timene.`;

  return (
    <div className="space-y-2">
      <div className="text-[12px] text-white/90">{peakLabel}</div>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="flex items-end gap-2 min-w-max pb-1">
          {hours.map((h, i) => {
            const pct = Math.max(3, (h.thunder / maxT) * 70);
            const hot = h.thunder >= 30;
            return (
              <div
                key={h.time}
                className="flex flex-col items-center w-10"
                style={{ animation: `hourPop 0.45s cubic-bezier(.2,.8,.2,1) ${(0.45 + i * 0.05).toFixed(2)}s both` }}
              >
                <div className="text-[10px] text-white/80 mb-1">
                  <HourLabel time={h.time} index={i} />
                </div>
                <div className="relative w-6 h-20 rounded-md bg-white/15 overflow-hidden border-t border-dashed border-white/20">
                  <div
                    className={`absolute bottom-0 left-0 right-0 rounded-md ${
                      hot
                        ? "bg-gradient-to-t from-amber-500 via-yellow-300 to-yellow-100"
                        : "bg-gradient-to-t from-indigo-400/70 to-indigo-200/70"
                    }`}
                    style={{ height: `${pct}%` }}
                  />
                  {hot && (
                    <Zap size={10} className="absolute top-1 left-1/2 -translate-x-1/2 text-yellow-200" />
                  )}
                </div>
                <div className="text-[10px] text-yellow-100 font-medium tabular-nums mt-1">
                  {Math.round(h.thunder)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
            const mmLabel = fmtPrecipYr(h.precipMin, h.precipMax);
            return (
              <div key={h.time} className="flex flex-col items-center w-12">
                <div className="text-[11px] text-white/80 mb-1.5">{hourLabel}</div>
                <div className="relative w-7 h-20 rounded-md bg-white/15 overflow-hidden border-t border-dashed border-white/20">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sky-300 to-sky-200 rounded-md"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <div className="text-[10px] text-sky-200 tabular-nums mt-1 leading-tight min-h-[12px]">
                  {mmLabel}
                </div>
                <div className="flex items-center gap-0.5 mt-0.5 text-[11px] text-sky-100 font-medium tabular-nums">
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
  const [tempUnit] = useTempUnit();
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
              <div className="text-base font-medium tabular-nums mt-1">{formatTemp(h.temp, tempUnit)}</div>
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
  const [unit] = useWindUnit();
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
    <GlassCard eyebrow={`Vind · Hastighet (${windUnitShort(unit)})`} icon={<Wind size={14} />} fx={<WindFX intensity={Math.min(1, maxW / 12)} />}>
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="min-w-max">
          <div className="flex items-end gap-4 mb-1">
            {next.filter((_, i) => i % 1 === 0).slice(0, 24).map((h, i) => (
              <div key={h.time} className="w-12 text-center">
                <div className="text-[11px] text-white/80">{i === 0 ? "Nå" : h.time.slice(11, 16)}</div>
                <div className="text-base font-medium tabular-nums mt-1">{formatWind(h.wind, unit, { digits: 0, withUnit: false })}</div>
                <div className="text-[10px] text-white/60">{windUnitShort(unit)}</div>
                <div className="text-[10px] text-emerald-200/80 tabular-nums mt-0.5">kast {formatWind(h.windGust, unit, { digits: 0, withUnit: false })}</div>
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

function AnimatedWeatherIconStyles() {
  return (
    <style>{`
      @keyframes wxSunPulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: .9; } }
      @keyframes wxSunRays { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes wxCloudDrift { 0%,100% { transform: translateX(0); } 50% { transform: translateX(2px); } }
      @keyframes wxRainFall { 0% { transform: translateY(-6px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(10px); opacity: 0; } }
      @keyframes wxSnowFall { 0% { transform: translateY(-6px) rotate(0); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(10px) rotate(180deg); opacity: 0; } }
      @keyframes wxBoltFlash { 0%,70%,100% { opacity: .85; filter: drop-shadow(0 0 0 transparent); } 75%,85% { opacity: 1; filter: drop-shadow(0 0 4px #fde047); } }
      @keyframes wxFogDrift { 0%,100% { transform: translateX(-2px); opacity: .7; } 50% { transform: translateX(2px); opacity: 1; } }
      @keyframes wxWindFlow { 0% { stroke-dashoffset: 20; opacity: .4; } 50% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: .4; } }
      @keyframes wxMoonGlow { 0%,100% { filter: drop-shadow(0 0 1px #fff8); } 50% { filter: drop-shadow(0 0 4px #fff); } }
      @keyframes wxMoonFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
      @keyframes wxMoonHalo { 0%,100% { opacity: .75; transform: scale(1) } 50% { opacity: 1; transform: scale(1.08) } }
      @keyframes wxMoonTwinkle { 0%,100% { opacity: .2; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.2) } }
    `}</style>
  );
}

function AnimatedWeatherIcon({ symbol, size = 36 }: { symbol: string | null; size?: number }) {
  const s = symbol ?? "";
  const isNight = s.includes("_night");
  const hasThunder = s.includes("thunder");
  const hasSnow = s.includes("snow");
  const hasSleet = s.includes("sleet");
  const hasRain = s.includes("rain") || s.includes("showers");
  const hasFog = s.includes("fog");
  const cloudy = s.includes("cloudy") || s.includes("partlycloudy") || hasRain || hasSnow || hasSleet || hasThunder;
  const fair = s.includes("fair") || s.includes("partlycloudy");
  const clear = s.includes("clearsky") || (!cloudy && !hasFog && s !== "");

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {/* Sun / Moon */}
      {(clear || fair) && !isNight && (
        <g style={{ transformOrigin: "22px 24px", animation: "wxSunPulse 3s ease-in-out infinite" }}>
          <g style={{ transformOrigin: "22px 24px", animation: "wxSunRays 18s linear infinite" }}>
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i * 45) * Math.PI / 180;
              const x1 = 22 + Math.cos(a) * 14;
              const y1 = 24 + Math.sin(a) * 14;
              const x2 = 22 + Math.cos(a) * 19;
              const y2 = 24 + Math.sin(a) * 19;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fde047" strokeWidth="2" strokeLinecap="round" />;
            })}
          </g>
          <circle cx="22" cy="24" r="9" fill="#fcd34d" stroke="#f59e0b" strokeWidth="1" />
        </g>
      )}
      {(clear || fair) && isNight && (
        <g style={{ animation: "wxMoonGlow 3s ease-in-out infinite" }}>
          <circle cx="22" cy="22" r="10" fill="#fef9c3" />
          <circle cx="26" cy="19" r="9" fill="hsl(220 35% 18%)" />
        </g>
      )}
      {/* Cloud */}
      {cloudy && (
        <g style={{ animation: "wxCloudDrift 4s ease-in-out infinite" }}>
          <ellipse cx="34" cy="32" rx="18" ry="10" fill="#e2e8f0" />
          <circle cx="24" cy="30" r="7" fill="#e2e8f0" />
          <circle cx="42" cy="28" r="8" fill="#f1f5f9" />
        </g>
      )}
      {hasFog && !cloudy && (
        <g style={{ animation: "wxFogDrift 4s ease-in-out infinite" }}>
          <rect x="10" y="22" width="44" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="14" y="30" width="40" height="3" rx="1.5" fill="#cbd5e1" opacity="0.85" />
          <rect x="10" y="38" width="44" height="3" rx="1.5" fill="#cbd5e1" opacity="0.7" />
        </g>
      )}
      {hasFog && cloudy && (
        <g style={{ animation: "wxFogDrift 4s ease-in-out infinite" }}>
          <rect x="14" y="44" width="36" height="2" rx="1" fill="#cbd5e1" opacity="0.7" />
          <rect x="18" y="49" width="32" height="2" rx="1" fill="#cbd5e1" opacity="0.6" />
        </g>
      )}
      {/* Rain */}
      {hasRain && !hasSnow && (
        <g>
          {[18, 28, 38, 46].map((x, i) => (
            <line key={i} x1={x} y1={42} x2={x - 2} y2={50} stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"
              style={{ transformOrigin: `${x}px 46px`, animation: `wxRainFall 1.1s ${i * 0.15}s linear infinite` }} />
          ))}
        </g>
      )}
      {/* Sleet (rain + flake) */}
      {hasSleet && (
        <g>
          <line x1="20" y1="42" x2="18" y2="50" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"
            style={{ animation: "wxRainFall 1.1s 0s linear infinite" }} />
          <line x1="40" y1="42" x2="38" y2="50" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"
            style={{ animation: "wxRainFall 1.1s 0.4s linear infinite" }} />
          <text x="28" y="52" fontSize="9" fill="#e0f2fe" style={{ animation: "wxSnowFall 1.4s 0.2s linear infinite" }}>❄</text>
        </g>
      )}
      {/* Snow */}
      {hasSnow && !hasSleet && (
        <g>
          {[20, 32, 44].map((x, i) => (
            <text key={i} x={x} y={52} fontSize="10" fill="#e0f2fe" textAnchor="middle"
              style={{ animation: `wxSnowFall 1.6s ${i * 0.25}s linear infinite` }}>❄</text>
          ))}
        </g>
      )}
      {/* Thunder */}
      {hasThunder && (
        <polygon points="30,40 36,40 32,48 38,48 28,60 32,50 26,50" fill="#fde047" stroke="#f59e0b" strokeWidth="0.6"
          style={{ animation: "wxBoltFlash 1.8s ease-in-out infinite" }} />
      )}
      {/* Wind hint when clear */}
      {clear && !cloudy && !hasRain && !hasSnow && !hasFog && false}
    </svg>
  );
}

function DailyRollInStyles() {
  return (
    <style>{`
      @keyframes wx-roll-in {
        0% { opacity: 0; transform: translateX(-24px); }
        60% { opacity: 1; }
        100% { opacity: 1; transform: translateX(0); }
      }
      .wx-roll-in { animation: wx-roll-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
    `}</style>
  );
}

function DailyListCard({ days, hours, title }: { days: ForecastDay[] | null; hours?: Hour[] | null; title: string }) {
  const [panel] = usePerUserPersistedState<PanelKey>("var:rotating:panel", "nedbor");
  const [tempUnit] = useTempUnit();
  if (!days) return <GlassCard eyebrow={title} icon={<TrendingUp size={14} />}><Skeleton /></GlassCard>;
  const list = days.slice(0, 10);


  // Nedbør-modus: bytt ut radene med 12 to-timers barer per dag
  if (panel === "nedbor" && hours && hours.length > 0) {
    return (
      <GlassCard eyebrow={title} icon={<Droplets size={14} />}>
        <DailyRollInStyles />
        <div className="divide-y divide-white/10">
          {list.map((d, i) => (
            <div key={d.date} className="wx-roll-in" style={{ animationDelay: `${i * 70}ms` }}>
              <DailyRainRow day={d} hours={hours} index={i} />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  // Vind-modus: graf med vind + vindkast per dag
  if (panel === "vind" && hours && hours.length > 0) {
    const globalMaxG = Math.max(
      4,
      ...list.map((d) =>
        hours
          .filter((h) => h.time.slice(0, 10) === d.date)
          .reduce((m, h) => Math.max(m, h.windGust || h.wind || 0), 0),
      ),
    );
    return (
      <GlassCard eyebrow={title} icon={<Wind size={14} />}>
        <DailyRollInStyles />
        <div className="divide-y divide-white/10">
          {list.map((d, i) => (
            <div key={d.date} className="wx-roll-in" style={{ animationDelay: `${i * 70}ms` }}>
              <DailyWindRow day={d} hours={hours} index={i} globalMaxG={globalMaxG} />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  // Skydekke-modus: 12 to-timers barer per dag som viser %-tildekke + animerte skyer til venstre
  if (panel === "skydekke" && hours && hours.length > 0) {
    return (
      <GlassCard eyebrow={title} icon={<Cloud size={14} />}>
        <DailyRollInStyles />
        <div className="divide-y divide-white/10">
          {list.map((d, i) => (
            <div key={d.date} className="wx-roll-in" style={{ animationDelay: `${i * 70}ms` }}>
              <DailyCloudRow day={d} hours={hours} index={i} />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  if (panel === "lyn" && hours && hours.length > 0) {
    return (
      <GlassCard eyebrow={title} icon={<Zap size={14} />}>
        <DailyRollInStyles />
        <div className="divide-y divide-white/10">
          {list.map((d, i) => (
            <div key={d.date} className="wx-roll-in" style={{ animationDelay: `${i * 70}ms` }}>
              <DailyLynRow day={d} hours={hours} index={i} />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }







  const allMins = list.map((d) => d.tempMin);
  const allMaxs = list.map((d) => d.tempMax);
  const globalMin = Math.min(...allMins);
  const globalMax = Math.max(...allMaxs);
  const range = Math.max(1, globalMax - globalMin);

  return (
    <GlassCard eyebrow={title} icon={<TrendingUp size={14} />}>
      <AnimatedWeatherIconStyles />
      <DailyRollInStyles />

      <div className="divide-y divide-white/10">
        {list.map((d, i) => {
          const startPct = ((d.tempMin - globalMin) / range) * 100;
          const widthPct = ((d.tempMax - d.tempMin) / range) * 100;
          const label = i === 0 ? "I dag" : weekdayShort(d.date);
          return (
            <div key={d.date} className="grid grid-cols-[60px_42px_40px_56px_1fr_44px] items-center gap-3 py-2.5 wx-roll-in" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="text-[15px] capitalize">{label}</div>
              <DailyLeafFX wind={d.windMax} seed={i} />
              <div className="flex items-center justify-center"><AnimatedWeatherIcon symbol={d.symbol} size={34} /></div>
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
                {formatTemp(d.tempMin, tempUnit)} <span className="text-white/60">·</span> {formatTemp(d.tempMax, tempUnit)}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// Client-only "nå"-tid brukt til å markere aktuell 2-timers boks / kolonne i
// 10-dagers-radene. Returnerer null på SSR for å unngå hydration-mismatch.
function useCurrentBucket() {
  const [now, setNow] = useState<{ date: string; bucket: number; hour: number; minute: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      setNow({ date, bucket: Math.floor(d.getHours() / 2), hour: d.getHours(), minute: d.getMinutes() });
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function DailyRainRow({ day, hours, index }: { day: ForecastDay; hours: Hour[]; index: number }) {
  const now = useCurrentBucket();
  const isToday = now?.date === day.date;
  const label = index === 0 ? "I dag" : weekdayShort(day.date);

  // 12 buckets × 2 timer = 24 timer (00-02, 02-04, ..., 22-24)
  const buckets = Array.from({ length: 12 }, (_, b) => {
    const startHour = b * 2;
    const slot = hours.filter((h) => {
      if (h.time.slice(0, 10) !== day.date) return false;
      const hh = parseInt(h.time.slice(11, 13));
      return hh >= startHour && hh < startHour + 2;
    });
    // Natt = 22-06
    const isNight = startHour < 6 || startHour >= 22;
    const precip = slot.reduce((s, h) => s + (h.precip || 0), 0);
    const prob = slot.reduce((m, h) => Math.max(m, h.precipProbability || 0), 0);
    return { startHour, isNight, precip, prob };
  });
  const hasAnyHours = buckets.some((b) => b.precip > 0 || b.prob > 0);
  // Animasjon: kun på dager med regn, intensitet skalert mot total mm
  const dayPrecip = day.precip || 0;
  const dropCount = dayPrecip <= 0 ? 0 : dayPrecip < 1 ? 4 : dayPrecip < 4 ? 8 : dayPrecip < 10 ? 14 : 20;
  const dropDur = dayPrecip < 1 ? 1.6 : dayPrecip < 4 ? 1.1 : dayPrecip < 10 ? 0.75 : 0.5;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setFilled(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setFilled(true); io.disconnect(); break; }
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={rowRef} className="grid grid-cols-[52px_46px_1fr_56px] items-center gap-2 py-2.5">
      <div className="text-[15px] capitalize">{label}</div>
      <div className="relative w-[46px] h-9 overflow-hidden" aria-hidden>
        {Array.from({ length: dropCount }, (_, i) => {
          // Seeded random fra dato + index for naturlig spredning uten hydration-mismatch
          const seed = (day.date.charCodeAt(8) * 131 + day.date.charCodeAt(9) * 17 + i * 2654435761) >>> 0;
          const r1 = ((seed % 1000) / 1000);
          const r2 = (((seed >>> 7) % 1000) / 1000);
          const r3 = (((seed >>> 13) % 1000) / 1000);
          const left = (r1 * 44).toFixed(2);
          const dur = (dropDur * (0.7 + r2 * 0.6)).toFixed(2);
          const delay = (r3 * dropDur * 1.5).toFixed(2);
          const baseLen = dayPrecip < 4 ? 6 : dayPrecip < 10 ? 9 : 12;
          const len = (baseLen * (0.75 + r2 * 0.5)).toFixed(1);
          const op = (dayPrecip < 1 ? 0.5 : 0.75) + r3 * 0.2;
          return (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${left}px`,
                top: 0,
                width: 1.5,
                height: `${len}px`,
                background: "linear-gradient(to bottom, rgba(186,230,253,0) 0%, rgba(125,211,252,0.95) 60%, rgba(56,189,248,1) 100%)",
                opacity: op.toFixed(2),
                animation: `dailyRainDrop ${dur}s linear ${delay}s infinite`,
                filter: "drop-shadow(0 0 2px rgba(56,189,248,0.6))",
              }}
            />
          );
        })}
        <style>{`@keyframes dailyRainDrop { 0% { transform: translateY(-12px); opacity: 0; } 15% { opacity: var(--rd-op,0.9); } 85% { opacity: var(--rd-op,0.9); } 100% { transform: translateY(40px); opacity: 0; } }`}</style>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-end gap-[3px] h-8">
          {buckets.map((b, i) => {
            const rainFill = b.precip > 0 ? Math.max(6, Math.min(100, (b.precip / 6) * 100)) : 0;
            const probAlpha = Math.max(0.12, Math.min(0.42, (b.prob / 100) * 0.42));
            const baseBg = b.isNight
              ? `rgba(148, 163, 184, ${probAlpha * 0.6 + 0.08})`
              : `rgba(186, 230, 253, ${probAlpha + 0.08})`;
            const intense = b.precip >= 2;
            const isNow = isToday && now != null && i === now.bucket;
            return (
              <div
                key={i}
                className={`relative flex-1 h-full rounded-md overflow-hidden ring-1 ${isNow ? "ring-2 ring-white/90" : "ring-white/10"}`}
                style={{ background: baseBg, boxShadow: isNow ? "0 0 0 1px rgba(56,189,248,0.6), 0 0 10px rgba(56,189,248,0.55)" : undefined }}
                title={`${String(b.startHour).padStart(2, "0")}–${String(b.startHour + 2).padStart(2, "0")} · ${b.precip.toFixed(1)} mm · ${Math.round(b.prob)}%${isNow ? " · nå" : ""}`}
              >
                {rainFill > 0 && (
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-b-md"
                    style={{
                      height: `${filled ? rainFill : 0}%`,
                      transition: "height 10s cubic-bezier(0.22, 1, 0.36, 1)",
                      background: intense
                        ? "linear-gradient(to top, #1d4ed8 0%, #3b82f6 60%, #60a5fa 100%)"
                        : "linear-gradient(to top, #0284c7 0%, #38bdf8 70%, #7dd3fc 100%)",
                      boxShadow: intense
                        ? "inset 0 1px 0 rgba(255,255,255,0.4), 0 0 6px rgba(59,130,246,0.5)"
                        : "inset 0 1px 0 rgba(255,255,255,0.35)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-[3px]">
          {buckets.map((b, i) => (
            <div
              key={i}
              className="flex-1 text-center tabular-nums leading-none"
              style={{ fontSize: 8 }}
            >
              {b.precip >= 0.05 ? (
                <span className="text-sky-200/90">{b.precip.toFixed(1)}</span>
              ) : (
                <span className="text-white/25">·</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="text-right leading-tight">
        <div className="text-[13px] tabular-nums text-white/90">
          {hasAnyHours ? (() => {
            const total = buckets.reduce((s, b) => s + b.precip, 0);
            return `${total.toFixed(total >= 10 ? 0 : 1)} mm`;
          })() : <span className="text-white/40">0 mm</span>}
        </div>
        <div className="text-[11px] tabular-nums">
          {day.precipProbability >= 20 ? (
            <span className="text-sky-300">💧 {Math.round(day.precipProbability)}%</span>
          ) : (
            <span className="text-white/40">{Math.round(day.precipProbability)}%</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DriftingClouds({ intensity, seed = 0, className = "", rainy = false }: { intensity: number; seed?: number; className?: string; rainy?: boolean }) {
  const i = Math.max(0, Math.min(1, intensity));
  const count = Math.round(2 + i * 6);
  const clouds = useMemo(() => {
    // deterministisk pseudorandom pr seed, så det ikke re-shuffles hver render
    let s = (seed * 9301 + 49297) % 233280 || 1;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    return Array.from({ length: count }, (_, k) => ({
      top: rnd() * 78,           // tilfeldig høyde i hele flisen
      width: 32 + rnd() * 58,    // px
      dur: 14 + rnd() * 22,      // s
      delay: -rnd() * 40,        // negativ → tilfeldig utgangspunkt
      opacity: 0.35 + i * 0.45 + rnd() * 0.15,
      blur: rnd() * 1.2,
      key: k,
    }));
  }, [count, seed, i]);
  if (count === 0) return null;
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden>
      {clouds.map((c) => (
        <svg
          key={c.key}
          viewBox="0 0 64 28"
          className="absolute animate-wx-cloud-cross"
          style={{
            top: `${c.top}%`,
            width: c.width,
            opacity: Math.min(0.9, c.opacity),
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
            filter: `blur(${c.blur.toFixed(2)}px)`,
          }}
        >
          <path
            d="M10 22 Q4 22 4 16 Q4 10 11 10 Q12 4 20 4 Q28 4 30 10 Q38 8 42 14 Q52 14 52 20 Q52 24 46 24 L12 24 Q10 24 10 22 Z"
            fill={rainy ? "#334155" : "white"}
          />
        </svg>
      ))}
    </div>
  );
}

function DailyCloudRow({ day, hours, index }: { day: ForecastDay; hours: Hour[]; index: number }) {
  const now = useCurrentBucket();
  const isToday = now?.date === day.date;
  const label = index === 0 ? "I dag" : weekdayShort(day.date);
  // 12 buckets × 2 timer
  const buckets = Array.from({ length: 12 }, (_, b) => {
    const startHour = b * 2;
    const slot = hours.filter((h) => {
      if (h.time.slice(0, 10) !== day.date) return false;
      const hh = parseInt(h.time.slice(11, 13));
      return hh >= startHour && hh < startHour + 2;
    });
    const isNight = startHour < 6 || startHour >= 22;
    const cloud = slot.length > 0
      ? slot.reduce((s, h) => s + (h.cloud || 0), 0) / slot.length
      : 0;
    return { startHour, isNight, cloud };
  });
  const dayHours = hours.filter((h) => h.time.slice(0, 10) === day.date);
  const avgCloud = dayHours.length > 0
    ? dayHours.reduce((s, h) => s + (h.cloud || 0), 0) / dayHours.length
    : 0;

  // Seed pr dag så clouds har unik random-fordeling pr rad
  const seed = index * 131 + Math.round(avgCloud);
  const rainy = day.precipProbability >= 20 || day.precip >= 0.2;

  return (
    <div className="relative grid grid-cols-[56px_1fr_56px] items-center gap-3 py-2.5">
      {/* Skyer drifter over hele raden */}
      <DriftingClouds intensity={Math.min(1, avgCloud / 100)} seed={seed} className="rounded-md" rainy={rainy} />

      <div className="relative z-10 text-[15px] capitalize">{label}</div>
      <div className="relative z-10 flex items-end gap-[3px] h-8">
        {buckets.map((b, i) => {
          const fill = Math.max(4, Math.min(100, b.cloud));
          const baseBg = b.isNight
            ? "rgba(30, 41, 59, 0.35)"
            : "rgba(148, 163, 184, 0.18)";
          const grad = b.isNight
            ? "linear-gradient(to top, rgba(71,85,105,0.85) 0%, rgba(148,163,184,0.85) 100%)"
            : "linear-gradient(to top, rgba(148,163,184,0.85) 0%, rgba(226,232,240,0.95) 100%)";
          const isNow = isToday && now != null && i === now.bucket;
          return (
            <div
              key={i}
              className={`relative flex-1 h-full rounded-md overflow-hidden ring-1 ${isNow ? "ring-2 ring-white/90" : "ring-white/10"}`}
              style={{ background: baseBg, boxShadow: isNow ? "0 0 0 1px rgba(56,189,248,0.6), 0 0 10px rgba(56,189,248,0.55)" : undefined }}
              title={`${String(b.startHour).padStart(2, "0")}–${String(b.startHour + 2).padStart(2, "0")} · ${Math.round(b.cloud)} %${isNow ? " · nå" : ""}`}
            >
              <div
                className="absolute bottom-0 left-0 right-0 rounded-b-md transition-all"
                style={{
                  height: `${fill}%`,
                  background: grad,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="relative z-10 text-[13px] tabular-nums text-right text-white/90">
        {Math.round(avgCloud)} <span className="text-white/60 text-[11px]">%</span>
      </div>
    </div>
  );
}


function DailyLynRow({ day, hours, index }: { day: ForecastDay; hours: Hour[]; index: number }) {
  const now = useCurrentBucket();
  const isToday = now?.date === day.date;
  const label = index === 0 ? "I dag" : weekdayShort(day.date);
  const buckets = Array.from({ length: 12 }, (_, b) => {
    const startHour = b * 2;
    const slot = hours.filter((h) => {
      if (h.time.slice(0, 10) !== day.date) return false;
      const hh = parseInt(h.time.slice(11, 13));
      return hh >= startHour && hh < startHour + 2;
    });
    const isNight = startHour < 6 || startHour >= 22;
    const thunder = slot.length > 0
      ? slot.reduce((m, h) => Math.max(m, h.thunder || 0), 0)
      : 0;
    return { startHour, isNight, thunder };
  });
  const dayHours = hours.filter((h) => h.time.slice(0, 10) === day.date);
  const avgThunder = dayHours.length > 0
    ? dayHours.reduce((m, h) => Math.max(m, h.thunder || 0), 0)
    : 0;
  const boltCount = avgThunder < 5 ? 0 : avgThunder < 25 ? 1 : avgThunder < 55 ? 2 : 3;

  return (
    <div className="grid grid-cols-[56px_46px_1fr_56px] items-center gap-3 py-2.5">
      <div className="text-[15px] capitalize">{label}</div>
      <div className="relative w-[46px] h-9 overflow-hidden" aria-hidden>
        {Array.from({ length: boltCount }, (_, i) => {
          const top = 2 + i * 8;
          const left = 4 + i * 10;
          const dur = 1.4 + i * 0.5;
          const delay = (i * 0.35).toFixed(2);
          const scale = 0.8 + i * 0.15;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                top: `${top}px`,
                left: `${left}px`,
                transform: `scale(${scale})`,
                animation: `dailyBoltFlash ${dur}s ease-in-out ${delay}s infinite`,
                filter: "drop-shadow(0 0 4px rgba(250,204,21,0.85))",
              }}
            >
              <svg width="12" height="20" viewBox="0 0 12 20">
                <path d="M7 0 L0 12 L4 12 L2 20 L12 7 L7 7 L9 0 Z" fill="#fde047" stroke="#fbbf24" strokeWidth="0.5" />
              </svg>
            </div>
          );
        })}
        <style>{`@keyframes dailyBoltFlash { 0%,40%,100% { opacity: 0.15; } 50%,55% { opacity: 1; } 60% { opacity: 0.3; } 70% { opacity: 0.95; } }`}</style>
      </div>
      <div className="flex items-end gap-[3px] h-8">
        {buckets.map((b, i) => {
          const fill = b.thunder > 0 ? Math.max(6, Math.min(100, b.thunder)) : 0;
          const baseBg = b.isNight
            ? "rgba(30, 27, 75, 0.45)"
            : "rgba(71, 85, 105, 0.22)";
          const hot = b.thunder >= 40;
          const grad = hot
            ? "linear-gradient(to top, #b45309 0%, #f59e0b 50%, #fde047 100%)"
            : "linear-gradient(to top, #4338ca 0%, #818cf8 60%, #c7d2fe 100%)";
          const isNow = isToday && now != null && i === now.bucket;
          return (
            <div
              key={i}
              className={`relative flex-1 h-full rounded-md overflow-hidden ring-1 ${isNow ? "ring-2 ring-white/90" : "ring-white/10"}`}
              style={{ background: baseBg, boxShadow: isNow ? "0 0 0 1px rgba(56,189,248,0.6), 0 0 10px rgba(56,189,248,0.55)" : undefined }}
              title={`${String(b.startHour).padStart(2, "0")}–${String(b.startHour + 2).padStart(2, "0")} · ${Math.round(b.thunder)} %${isNow ? " · nå" : ""}`}
            >
              {fill > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-b-md transition-all"
                  style={{
                    height: `${fill}%`,
                    background: grad,
                    boxShadow: hot
                      ? "inset 0 1px 0 rgba(255,255,255,0.5), 0 0 6px rgba(250,204,21,0.6)"
                      : "inset 0 1px 0 rgba(255,255,255,0.35)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[13px] tabular-nums text-right">
        {avgThunder >= 5 ? (
          <span className="text-amber-300">⚡ {Math.round(avgThunder)} %</span>
        ) : (
          <span className="text-white/40">{Math.round(avgThunder)} %</span>
        )}
      </div>
    </div>
  );
}



function DailyWindRow({ day, hours, index, globalMaxG }: { day: ForecastDay; hours: Hour[]; index: number; globalMaxG: number }) {
  const [unit] = useWindUnit();
  const now = useCurrentBucket();
  const isToday = now?.date === day.date;
  const label = index === 0 ? "I dag" : weekdayShort(day.date);
  const dayHours = hours.filter((h) => h.time.slice(0, 10) === day.date);

  // Bygg 24 timesverdier (0..23). Fyll manglende timer med nærmeste verdi så grafen
  // strekker seg over hele døgnet (00–24), ikke bare der API-en har data.
  const samples: ({ hh: number; wind: number; gust: number } | null)[] = Array.from({ length: 24 }, (_, hh) => {
    const h = dayHours.find((x) => parseInt(x.time.slice(11, 13)) === hh);
    return h ? { hh, wind: h.wind || 0, gust: h.windGust || h.wind || 0 } : null;
  });
  // Fyll hull fra venstre med første gyldige verdi, fra høyre med siste gyldige verdi.
  let firstVal: { wind: number; gust: number } | null = null;
  for (let i = 0; i < 24; i++) {
    if (samples[i]) {
      firstVal = samples[i]!;
      break;
    }
  }
  let lastVal: { wind: number; gust: number } | null = null;
  for (let i = 23; i >= 0; i--) {
    if (samples[i]) {
      lastVal = samples[i]!;
      break;
    }
  }
  const filled = samples.map((s, hh) => {
    if (s) return s;
    const val = hh < 12 ? firstVal : lastVal;
    return val ? { hh, wind: val.wind, gust: val.gust } : { hh, wind: 0, gust: 0 };
  });

  const maxWind = filled.reduce((m, s) => Math.max(m, s.wind), 0);
  const maxGust = filled.reduce((m, s) => Math.max(m, s.gust), 0);

  const W = 220;
  const H = 36;
  const maxY = Math.max(4, globalMaxG);
  const x = (hh: number) => (hh / 23) * W;
  const y = (v: number) => H - (v / maxY) * (H - 4) - 2;

  const toPath = (pts: { hh: number; v: number }[], close: boolean) => {
    if (pts.length === 0) return "";
    let d = `M ${x(pts[0].hh).toFixed(1)} ${y(pts[0].v).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const mx = (x(p0.hh) + x(p1.hh)) / 2;
      d += ` Q ${x(p0.hh).toFixed(1)} ${y(p0.v).toFixed(1)} ${mx.toFixed(1)} ${((y(p0.v) + y(p1.v)) / 2).toFixed(1)}`;
      d += ` T ${x(p1.hh).toFixed(1)} ${y(p1.v).toFixed(1)}`;
    }
    if (close) {
      d += ` L ${x(pts[pts.length - 1].hh).toFixed(1)} ${H} L ${x(pts[0].hh).toFixed(1)} ${H} Z`;
    }
    return d;
  };

  const gustPts = filled.map((s) => ({ hh: s.hh, v: s.gust }));
  const windPts = filled.map((s) => ({ hh: s.hh, v: s.wind }));

  return (
    <div className="grid grid-cols-[56px_42px_1fr_88px] items-center gap-3 py-2.5">
      <div className="text-[15px] capitalize">{label}</div>
      <DailyLeafFX wind={maxWind} seed={index} />
      <div className="relative h-9">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {/* Dag-bånd: 06–22 — lys grå */}
          <rect x={x(6)} y={0} width={x(22) - x(6)} height={H} fill="rgba(255,255,255,0.22)" />
          {/* Natt-bånd: 00–06 og 22–24 — mørkere grå */}
          <rect x={0} y={0} width={x(6)} height={H} fill="rgba(0,0,0,0.28)" />
          <rect x={x(22)} y={0} width={W - x(22)} height={H} fill="rgba(0,0,0,0.28)" />
          {filled.length >= 2 && (
            <>
              <path d={toPath(gustPts, true)} fill="rgba(167,243,208,0.30)" />
              <path d={toPath(gustPts, false)} fill="none" stroke="#a7f3d0" strokeWidth="1.2" />
              <path d={toPath(windPts, false)} fill="none" stroke="#2dd4bf" strokeWidth="1.6" />
            </>
          )}
          {isToday && now && (() => {
            const nx = x(Math.min(23, now.hour + now.minute / 60));
            return (
              <g>
                <line x1={nx} x2={nx} y1={0} y2={H} stroke="rgba(255,255,255,0.9)" strokeWidth="1" strokeDasharray="2 2" />
                <circle cx={nx} cy={2} r="1.6" fill="rgba(255,255,255,0.95)" />
              </g>
            );
          })()}
        </svg>
      </div>
      <div className="text-[13px] tabular-nums text-right text-white/90">
        {formatWind(maxWind, unit, { digits: 0, withUnit: false })} <span className="text-white/60">({formatWind(maxGust, unit, { digits: 0, withUnit: false })})</span> <span className="text-white/60 text-[11px]">{windUnitShort(unit)}</span>
      </div>
    </div>
  );
}


function DailyLeafFX({ wind, seed }: { wind: number; seed: number }) {
  // Leaf count = floor(wind m/s). 0.9 → 0, 8.5 → 8 osv. Cap på 15.
  const count = Math.max(0, Math.min(15, Math.floor(wind || 0)));
  if (count === 0) {
    return <div className="w-[42px] h-[34px]" aria-hidden />;
  }

  // Deterministic layout — no Math.random (avoids SSR hydration mismatch)
  const leaves = Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / (count + 1);
    const top = 4 + t * 22; // 4–26 px, evenly distributed → no overlap
    const delay = (i * 0.55).toFixed(2);
    const dur = (2.8 + ((seed + i) % 3) * 0.4).toFixed(2);
    const size = 8 + ((seed + i) % 2) * 2;
    const rot = 180 + ((seed * 37 + i * 53) % 180);
    const dy = -6 + ((seed + i) % 3) * 4;
    return { top, delay, dur, size, rot, dy, i };
  });
  return (
    <div className="relative w-[42px] h-[34px] overflow-hidden" aria-hidden>
      {leaves.map((l) => (
        <span
          key={l.i}
          className="absolute animate-wx-leaf"
          style={{
            top: `${l.top}px`,
            left: -10,
            width: l.size,
            height: l.size,
            color: "#9ccc65",
            animationDelay: `${l.delay}s`,
            animationDuration: `${l.dur}s`,
            ["--lx" as any]: "52px",
            ["--ly" as any]: `${l.dy}px`,
            ["--lr" as any]: `${l.rot}deg`,
          }}
        >
          <svg viewBox="0 0 16 16" width={l.size} height={l.size} fill="currentColor">
            <path d="M2 14 C 4 6, 10 2, 14 2 C 14 8, 10 14, 2 14 Z" />
          </svg>
        </span>
      ))}
    </div>
  );
}



// ============================================================
// WIND DETAIL CARD with compass
// ============================================================

function WindDetailCard({ hour }: { hour: Hour | null }) {
  const [unit] = useWindUnit();
  const dir = hour?.windDir ?? 0;
  const speed = hour?.wind ?? 0;
  const gust = hour?.windGust ?? speed;
  const month = new Date().getMonth();
  const normal = SKIEN_MONTHLY_WIND_NORMAL_MS[month];
  const delta = speed - normal;
  const unitSuffix = ` ${windUnitShort(unit)}`;
  return (
    <GlassCard eyebrow="Vind" icon={<Wind size={14} />} fx={<WindFX intensity={Math.min(1, speed / 12)} />}>
      <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="space-y-2 text-sm">
          <Row label="Vind" value={formatWind(speed, unit)} />
          <Row label="Vindkast" value={formatWind(gust, unit)} />
          <Row label="Retning" value={`${Math.round(dir)}° ${dirCardinal(dir)}`} />
          <NormalDelta delta={delta} unit={unitSuffix} normal={normal} upIsBad />
        </div>
        <div className="relative w-28 h-28">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            {Array.from({ length: 36 }).map((_, i) => {
              const a = (i * 10 - 90) * (Math.PI / 180);
              const x1 = (50 + 44 * Math.cos(a)).toFixed(1);
              const y1 = (50 + 44 * Math.sin(a)).toFixed(1);
              const x2 = (50 + (i % 9 === 0 ? 36 : 40) * Math.cos(a)).toFixed(1);
              const y2 = (50 + (i % 9 === 0 ? 36 : 40) * Math.sin(a)).toFixed(1);
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
            <div className="text-xl font-light tabular-nums leading-none">{formatWind(speed, unit, { digits: 0, withUnit: false })}</div>
            <div className="text-[9px] text-white/70">{windUnitShort(unit)}</div>
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

function MoonCard({ moon, now }: { moon: { name: string; icon: string; illumination: number; phaseFraction: number }; now: Date }) {
  const nextSet = useMemo(() => nextMoonset(now), [now]);
  const daysToFull = useMemo(() => daysUntilFullMoon(now), [now]);
  return (
    <GlassCard eyebrow="Månefase" icon={<Moon size={14} />} fx={<StarFX />}>
      <div className="grid grid-cols-[1fr_auto] gap-4 items-center" suppressHydrationWarning>
        <div className="space-y-2 text-sm">
          <Row label="Fase" value={`${moon.icon} ${moon.name}`} />
          <Row label="Lyst" value={`${Math.round(moon.illumination * 100)} %`} />
          <Row label="Neste månenedgang" value={nextSet ? formatTime(nextSet) : "—"} />
          <Row label="Neste fullmåne" value={`${daysToFull} d`} />
        </div>
        <MoonVisual phaseFraction={moon.phaseFraction} illumination={moon.illumination} />
      </div>
    </GlassCard>
  );
}

function MoonVisual({ phaseFraction, illumination }: { phaseFraction: number; illumination: number }) {
  const r = 36;
  const cx = 50, cy = 50;
  // Rund av for å unngå ørsmå SSR/klient-forskjeller som gir hydration-mismatch
  const p = Math.round(phaseFraction * 10000) / 10000;
  const waxing = p < 0.5;
  const gibbous = p > 0.25 && p < 0.75;
  const rx = Math.round(Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * p)) * r) * 1000) / 1000;
  const outerSweep = waxing ? 1 : 0;
  const innerSweep = gibbous ? (waxing ? 0 : 1) : outerSweep;
  const litPath = `M ${cx},${cy - r} A ${r},${r} 0 0,${outerSweep} ${cx},${cy + r} A ${rx},${r} 0 0,${innerSweep} ${cx},${cy - r} Z`;
  const glow = 0.35 + illumination * 0.65;
  return (
    <div
      className="relative w-28 h-28"
      style={{ animation: "wxMoonFloat 6s ease-in-out infinite" }}
      aria-label={`Måne, ${Math.round(illumination * 100)} % lyst`}
    >
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, rgba(255,247,220,${0.25 * glow}) 0%, rgba(255,247,220,${0.10 * glow}) 35%, transparent 70%)`,
          animation: "wxMoonHalo 4s ease-in-out infinite",
          filter: "blur(2px)",
        }}
        suppressHydrationWarning
      />
      <span className="absolute" style={{ top: "10%", left: "8%", width: 2, height: 2, background: "#fff", borderRadius: "50%", animation: "wxMoonTwinkle 2.4s ease-in-out infinite", opacity: 0.8 }} />
      <span className="absolute" style={{ top: "78%", left: "12%", width: 1.5, height: 1.5, background: "#fff", borderRadius: "50%", animation: "wxMoonTwinkle 3.1s ease-in-out infinite", animationDelay: "0.7s", opacity: 0.7 }} />
      <span className="absolute" style={{ top: "18%", right: "6%", width: 2, height: 2, background: "#fff", borderRadius: "50%", animation: "wxMoonTwinkle 2.8s ease-in-out infinite", animationDelay: "1.2s", opacity: 0.8 }} />
      <span className="absolute" style={{ top: "82%", right: "10%", width: 1.5, height: 1.5, background: "#fff", borderRadius: "50%", animation: "wxMoonTwinkle 3.6s ease-in-out infinite", animationDelay: "0.3s", opacity: 0.6 }} />

      <svg viewBox="0 0 100 100" className="w-full h-full relative">
        <defs>
          <radialGradient id="moonG" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#0c0c14" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#020204" stopOpacity="0.70" />
          </radialGradient>
          <clipPath id="moonClip"><circle cx={cx} cy={cy} r={r} /></clipPath>
        </defs>
        {/* Blå måne-bilde som base */}
        <g clipPath="url(#moonClip)" style={{ animation: "wxMoonGlow 4s ease-in-out infinite" }}>
          <image href={moonRealAsset.url} x={cx - r} y={cy - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" />
          {/* Mørk skygge for fase — gjennomsiktig så månen skimtes gjennom */}
          <path d={litPath} fill="url(#moonG)" style={{ mixBlendMode: "multiply" }} />
        </g>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(170,210,255,0.35)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

// ============================================================
// SUNSET CARD with arc
// ============================================================

function SunsetCard({ sun, now, moon }: { sun: ReturnType<typeof sunTimes>; now: Date; moon: { name: string; icon: string; illumination: number; phaseFraction: number } }) {
  const sunrise = sun.sunrise;
  const sunset = sun.sunset;
  // Full døgn-progress 0..1 (sol under horisont = utenfor [riseP..setP])
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayMs = 24 * 3600 * 1000;
  const nowP = (now.getTime() - dayStart.getTime()) / dayMs;
  const riseP = sunrise ? (sunrise.getTime() - dayStart.getTime()) / dayMs : 0.25;
  const setP = sunset ? (sunset.getTime() - dayStart.getTime()) / dayMs : 0.75;

  const W = 200, H = 92;
  const horizonY = 62;
  const peakY = 14;
  const dipY = 84;
  // Sol-bue: sinus mellom riseP og setP
  const sunPath = (() => {
    const pts: string[] = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const p = i / N;
      const x = p * W;
      let y: number;
      if (p < riseP) {
        const k = (p - riseP) / Math.max(0.001, riseP); // negativ
        y = horizonY + Math.sin(-k * Math.PI) * (dipY - horizonY) * 0.6;
      } else if (p > setP) {
        const k = (p - setP) / Math.max(0.001, 1 - setP);
        y = horizonY + Math.sin(k * Math.PI) * (dipY - horizonY) * 0.6;
      } else {
        const k = (p - riseP) / (setP - riseP);
        y = horizonY - Math.sin(k * Math.PI) * (horizonY - peakY);
      }
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return "M " + pts.join(" L ");
  })();
  // Sol-posisjon
  let sx = 0, sy = horizonY, above = false;
  {
    const p = nowP;
    sx = p * W;
    if (p < riseP) {
      const k = (p - riseP) / Math.max(0.001, riseP);
      sy = horizonY + Math.sin(-k * Math.PI) * (dipY - horizonY) * 0.6;
    } else if (p > setP) {
      const k = (p - setP) / Math.max(0.001, 1 - setP);
      sy = horizonY + Math.sin(k * Math.PI) * (dipY - horizonY) * 0.6;
    } else {
      const k = (p - riseP) / (setP - riseP);
      sy = horizonY - Math.sin(k * Math.PI) * (horizonY - peakY);
      above = true;
    }
  }
  // Gjenstående dagslys
  let remainingLabel = "";
  if (sunrise && sunset) {
    const t = now.getTime();
    if (t < sunrise.getTime()) {
      const m = Math.round((sunrise.getTime() - t) / 60000);
      remainingLabel = `Sol opp om ${Math.floor(m / 60)} t, ${m % 60} min`;
    } else if (t < sunset.getTime()) {
      const m = Math.round((sunset.getTime() - t) / 60000);
      remainingLabel = `Dagslys som gjenstår: ${Math.floor(m / 60)} t, ${m % 60} min`;
    } else {
      remainingLabel = "Solen har gått ned";
    }
  }
  const gid = "sunset-arc";
  // Solens høyeste punkt = midt mellom oppgang og nedgang
  const peakP = (riseP + setP) / 2;
  const peakX = peakP * W;
  const peakTime = sunrise && sunset
    ? new Date((sunrise.getTime() + sunset.getTime()) / 2)
    : null;
  const riseX = riseP * W;
  const setX = setP * W;

  // Natt-modus: solen er under horisonten
  const night = !above;
  const eyebrow = night ? "Måne · natt" : "Sol ned";
  const headlineLabel = night
    ? sunrise && now.getTime() < sunrise.getTime()
      ? `Sol opp ${formatTime(sunrise)}`
      : `Sol ned ${sunset ? formatTime(sunset) : "—"}`
    : sunset ? formatTime(sunset) : "—";

  return (
    <GlassCard
      eyebrow={eyebrow}
      icon={night ? <Moon size={14} /> : <Sunrise size={14} />}
      fx={night ? <MoonFX intensity={0.9} /> : <SunFX intensity={above ? 1 : 0.3} />}
      className={night ? "bg-[#0a1024]/70 border-white/10 shadow-black/40" : ""}
    >
      <div className="text-3xl font-light tabular-nums" suppressHydrationWarning>{headlineLabel}</div>
      {remainingLabel && <div className="text-[11px] text-white/70 mt-0.5" suppressHydrationWarning>{remainingLabel}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 mt-2 overflow-visible" suppressHydrationWarning>
        <defs>
          <linearGradient id={`${gid}-sky`} x1="0" x2="0" y1="0" y2="1">
            {night ? (
              <>
                <stop offset="0%" stopColor="rgba(30,40,80,0.55)" />
                <stop offset="100%" stopColor="rgba(10,15,35,0.2)" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="rgba(80,120,180,0.45)" />
                <stop offset="100%" stopColor="rgba(20,30,55,0.15)" />
              </>
            )}
          </linearGradient>
          <linearGradient id={`${gid}-stroke`} x1="0" x2="1" y1="0" y2="0">
            {night ? (
              <>
                <stop offset="0%" stopColor="rgba(180,200,255,0.35)" />
                <stop offset="50%" stopColor="rgba(220,230,255,0.85)" />
                <stop offset="100%" stopColor="rgba(150,170,220,0.5)" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
                <stop offset="50%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="100%" stopColor="rgba(255,200,140,0.6)" />
              </>
            )}
          </linearGradient>
          <radialGradient id={`${gid}-glow`} cx="50%" cy="50%" r="50%">
            {night ? (
              <>
                <stop offset="0%" stopColor="rgba(220,230,255,0.85)" />
                <stop offset="50%" stopColor="rgba(160,180,230,0.4)" />
                <stop offset="100%" stopColor="rgba(120,140,200,0)" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="40%" stopColor="rgba(255,235,180,0.55)" />
                <stop offset="100%" stopColor="rgba(255,200,120,0)" />
              </>
            )}
          </radialGradient>
        </defs>
        {/* Sky-fyll over horisont */}
        <rect x="0" y="0" width={W} height={horizonY} fill={`url(#${gid}-sky)`} rx="6" />
        {/* Stjerner i natt-modus */}
        {night && [
          { x: 18, y: 12, r: 0.7, d: 0 },
          { x: 42, y: 22, r: 0.5, d: 0.6 },
          { x: 78, y: 8, r: 0.9, d: 1.1 },
          { x: 118, y: 18, r: 0.6, d: 0.3 },
          { x: 152, y: 28, r: 0.5, d: 1.4 },
          { x: 180, y: 14, r: 0.8, d: 0.9 },
          { x: 96, y: 36, r: 0.55, d: 1.7 },
        ].map((s, i) => (
          <circle
            key={i} cx={s.x} cy={s.y} r={s.r} fill="rgba(255,255,255,0.85)"
            style={{ animation: `wx-sun-pulse 3.4s ease-in-out ${s.d}s infinite`, transformOrigin: `${s.x}px ${s.y}px` }}
          />
        ))}
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={p * W} x2={p * W} y1="0" y2={H} stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" strokeDasharray="1 2" />
        ))}
        {/* Horisont */}
        <line x1="0" x2={W} y1={horizonY} y2={horizonY} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
        {/* Bue */}
        <path
          d={sunPath}
          fill="none"
          stroke={`url(#${gid}-stroke)`}
          strokeWidth="1.6"
          strokeLinecap="round"
          style={{
            strokeDasharray: 600,
            strokeDashoffset: 600,
            animation: "wx-arc-draw 1.6s ease-out 0.1s forwards",
          }}
        />
        {/* Peak-markør (solens høyeste punkt) */}
        {peakTime && (
          <g style={{ opacity: 0, animation: "wx-sun-in 0.8s ease-out 1.5s forwards" }}>
            <line x1={peakX} x2={peakX} y1={peakY - 2} y2={peakY + 6} stroke="rgba(255,255,255,0.6)" strokeWidth="0.6" />
            <circle cx={peakX} cy={peakY} r="1.6" fill="rgba(255,255,255,0.9)" />
            <text x={peakX} y={peakY - 4} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.9)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatTime(peakTime)}
            </text>
          </g>
        )}
        {/* Oppgang-/nedgang-merker */}
        {sunrise && (
          <g style={{ opacity: 0, animation: "wx-sun-in 0.8s ease-out 1.7s forwards" }}>
            <circle cx={riseX} cy={horizonY} r="1.4" fill="rgba(255,255,255,0.85)" />
            <text x={riseX} y={horizonY + 9} textAnchor="middle" fontSize="6.5" fill="rgba(255,255,255,0.75)" style={{ fontVariantNumeric: "tabular-nums" }}>
              ↑ {formatTime(sunrise)}
            </text>
          </g>
        )}
        {sunset && (
          <g style={{ opacity: 0, animation: "wx-sun-in 0.8s ease-out 1.9s forwards" }}>
            <circle cx={setX} cy={horizonY} r="1.4" fill="rgba(255,200,140,0.9)" />
            <text x={setX} y={horizonY + 9} textAnchor="middle" fontSize="6.5" fill="rgba(255,220,180,0.85)" style={{ fontVariantNumeric: "tabular-nums" }}>
              ↓ {formatTime(sunset)}
            </text>
          </g>
        )}
        {/* Glød rundt sol/måne */}
        <circle
          cx={sx} cy={sy} r={night ? 11 : 14} fill={`url(#${gid}-glow)`}
          style={{ animation: "wx-sun-pulse 2.6s ease-in-out infinite", transformOrigin: `${sx}px ${sy}px` }}
        />
        {/* Sol eller måne */}
        {night ? (() => {
          const mr = 6.5;
          const p = moon.phaseFraction;
          const waxing = p < 0.5;
          const gibbous = p > 0.25 && p < 0.75;
          const rx = Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * p)) * mr);
          const outerSweep = waxing ? 1 : 0;
          const innerSweep = gibbous ? (waxing ? 0 : 1) : outerSweep;
          const litPath = `M ${sx},${sy - mr} A ${mr},${mr} 0 0,${outerSweep} ${sx},${sy + mr} A ${rx},${mr} 0 0,${innerSweep} ${sx},${sy - mr} Z`;
          const clipId = `${gid}-moonclip`;
          const shadeId = `${gid}-moonshade`;
          return (
            <g
              style={{
                opacity: 0,
                animation: "wx-sun-in 1.2s ease-out 1.1s forwards",
                filter: "drop-shadow(0 0 5px rgba(220,230,255,0.7))",
              }}
            >
              <defs>
                <clipPath id={clipId}><circle cx={sx} cy={sy} r={mr} /></clipPath>
                <radialGradient id={shadeId} cx="50%" cy="50%">
                  <stop offset="0%" stopColor="#05060a" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#01010a" stopOpacity="0.98" />
                </radialGradient>
              </defs>
              <g clipPath={`url(#${clipId})`}>
                <image href={moonRealAsset.url} x={sx - mr} y={sy - mr} width={mr * 2} height={mr * 2} preserveAspectRatio="xMidYMid slice" />
                <path d={litPath} fill={`url(#${shadeId})`} />
              </g>
            </g>
          );
        })() : (
          <circle
            cx={sx} cy={sy} r="4.5" fill="#fff"
            style={{
              opacity: 0,
              animation: "wx-sun-in 1.2s ease-out 1.1s forwards",
              filter: "drop-shadow(0 0 6px rgba(255,235,180,0.9))",
            }}
          />
        )}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-white/80 mt-1" suppressHydrationWarning>
        <span>Sol opp: {sunrise ? formatTime(sunrise) : "—"}</span>
        {sun.dayLengthMinutes ? (
          <span className="text-white/60">
            {Math.floor(sun.dayLengthMinutes / 60)} t {Math.round(sun.dayLengthMinutes % 60)} min
          </span>
        ) : null}
      </div>
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
    <GlassCard eyebrow="UV-indeks" icon={<Sun size={14} />} fx={null} className="overflow-visible">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-light tabular-nums">{uvNow?.toFixed(0) ?? "—"}</span>
            <span className="text-lg font-medium">{level?.label ?? ""}</span>
          </div>
          <div className="text-[11px] text-white/60 mt-1">UVI fra Verdens helseorganisasjon</div>
        </div>
        <UvOrb uv={uvNow ?? 0} color={level?.color ?? "#94a3b8"} />
      </div>

      {/* Chart (med tall over hver kurvepunkt) */}
      <UvIosChart hours={slice} nowProgress={nowProgress} uvNow={uvNow ?? 0} />


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
              <div className="flex-1 h-8 rounded bg-white/10 flex items-center px-2 relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${Math.min(100, (uvMaxToday / 11) * 100)}%`, backgroundColor: uvLevel(uvMaxToday).color, opacity: 0.55 }}
                />
                <span className="text-[11px] relative z-10 font-medium text-white/90">I dag</span>
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

/**
 * Liten orb i UV-kortets hjørne. Animasjonens intensitet (pulshastighet,
 * glød, antall stråler, fargemetning) skalerer med UV-verdien. Ved 0
 * pulserer den fortsatt mildt for å vise at kortet er live.
 */
function UvOrb({ uv, color }: { uv: number; color: string }) {
  // 0..1 intensitet (UV 0 → 0.0, UV 11+ → 1.0)
  const t = Math.max(0, Math.min(1, uv / 11));
  // Pulshastighet: 0 → 3.6s (rolig), 11 → 0.9s (rask)
  const pulseDur = (3.6 - t * 2.7).toFixed(2) + "s";
  // Glød-radius i px — 5x sterkere enn før (doblet igjen)
  const glow = ((8 + t * 24) * 5).toFixed(1);
  const glowSoft = ((14 + t * 40) * 5).toFixed(1);
  // Ytre halo-opasitet
  const haloOpacity = Math.min(0.95, 0.6 + t * 0.35);
  const haloOpacityMid = Math.min(1.0, 0.9 + t * 0.1);
  const haloOpacityLow = Math.min(1.0, 0.5 + t * 0.5);
  // Stråler vises fra UV ≥ 3
  const showRays = uv >= 3;
  const rayOpacity = Math.max(0, Math.min(1, (uv - 2) / 8));
  // Indre kjerne — ved UV 0 er den blek/grålig, ellers fargen
  const coreColor = uv < 0.5 ? "rgba(203, 213, 225, 0.85)" : color;

  return (
    <div className="relative w-10 h-10 flex items-center justify-center -mt-6" aria-hidden>
      {/* Ytre myk halo */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
          opacity: haloOpacity,
          animation: `uvOrbHalo ${pulseDur} ease-in-out infinite`,
        }}
      />
      {/* Roterende stråle-ring ved høyere UV */}
      {showRays && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${color} 12deg, transparent 24deg, transparent 90deg, ${color} 102deg, transparent 114deg, transparent 180deg, ${color} 192deg, transparent 204deg, transparent 270deg, ${color} 282deg, transparent 294deg)`,
            opacity: rayOpacity * 1.1,
            animation: `uvOrbSpin ${(8 - t * 5).toFixed(2)}s linear infinite`,
            maskImage: "radial-gradient(circle, transparent 35%, black 45%, black 70%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 35%, black 45%, black 70%, transparent 78%)",
          }}
        />
      )}
      {/* Kjerne */}
      <div
        className="relative rounded-full"
        style={{
          width: 14 + t * 6,
          height: 14 + t * 6,
          background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${coreColor} 100%, white 25%), ${coreColor})`,
          boxShadow: `0 0 ${glow}px ${color}, 0 0 ${glowSoft}px color-mix(in oklab, ${color} 60%, transparent)`,
          animation: `uvOrbPulse ${pulseDur} ease-in-out infinite`,
        }}
      />
      <style>{`
        @keyframes uvOrbPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(${(1.08 + t * 0.18).toFixed(3)}); filter: brightness(${(1.25 + t * 0.75).toFixed(2)}); }
        }
        @keyframes uvOrbHalo {
          0%, 100% { transform: scale(0.9); opacity: ${haloOpacityLow.toFixed(2)}; }
          50% { transform: scale(${(1.1 + t * 0.25).toFixed(2)}); opacity: ${haloOpacityMid.toFixed(2)}; }
        }
        @keyframes uvOrbSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function UvIosChart({ hours, nowProgress, uvNow }: { hours: { time: string; uv: number }[]; nowProgress: number | null; uvNow: number }) {
  const W = 340;
  const H = 130;
  const padL = 70;
  const padR = 20;
  const padT = 28;
  const padB = 18;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxUV = 11;
  const uvColor = uvLevel(uvNow).color;
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
          {/* Én farge basert på nåværende UV-nivå. */}
          <stop offset="0%" stopColor={uvColor} stopOpacity="0.55" />
          <stop offset="100%" stopColor={uvColor} stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="uvLineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={uvColor} stopOpacity="0.95" />
          <stop offset="100%" stopColor={uvColor} stopOpacity="0.65" />
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
      <path d={`M${points}`} fill="none" stroke="url(#uvLineGrad)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

      {/* Per-time UV numbers — plassert rett over hver kurvepunkt */}
      {hours.map((h, i) => {
        const p = pt(i);
        return (
          <text
            key={`uvn-${h.time}`}
            x={p.x}
            y={Math.max(8, p.y - 6)}
            fontSize="7"
            fill="rgba(255,255,255,0.7)"
            textAnchor="middle"
            className="tabular-nums"
          >
            {Math.round(h.uv)}
          </text>
        );
      })}


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

function FeelsLikeCard({ hour, isDay }: { hour: Hour | null; isDay: boolean }) {
  const [tempUnit] = useTempUnit();
  const t = hour?.temp ?? 0;
  const w = hour?.wind ?? 0;
  const hum = hour?.humidity ?? 0;
  // Basis-følelse (skygge): kombinerer vindavkjøling ved kulde og fuktighetsvarme ved varme
  const windChill = t <= 10 && w > 1.5 ? -Math.min(5, w * 0.5) : 0;
  const humidex = t >= 18 && hum >= 50 ? ((hum - 50) / 50) * Math.min(4, (t - 18) * 0.4) : 0;
  const base = t + windChill + humidex;
  // Solbonus ved dagslys: kraftigere når det allerede er varmt
  const sunBoost = isDay ? Math.min(8, 2 + Math.max(0, t - 5) * 0.35) : 0;
  // Overskyet/skyet: ingen solbidrag, ofte litt kjøligere enn i skygge en solskinnsdag
  const overcast = base - (isDay ? 0.5 : 0);
  const sun = base + sunBoost;
  const shade = base;
  const cloudy = overcast;
  const hint = feelsLikeReason(hour, isDay);
  const cold = shade <= 5;
  const fx = cold ? <SnowFX intensity={0.5} /> : sun >= 18 ? <HeatwaveFX intensity={1} /> : <HeatwaveFX intensity={-1} />;
  const month = new Date().getMonth();
  const normal = SKIEN_MONTHLY_FEELS_NORMAL_C[month];
  const delta = shade - normal;
  return (
    <GlassCard eyebrow="Føles som" icon={<Thermometer size={14} />} fx={fx}>
      {hour ? (
        <div className="grid grid-cols-3 gap-1 text-center">
          <div>
            <div className="text-[10px] text-white/70 leading-none whitespace-nowrap">☀️ Sol</div>
            <div className="text-xl font-light tabular-nums mt-1">{formatTemp(sun, tempUnit)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/70 leading-none whitespace-nowrap">🌳 Skygge</div>
            <div className="text-xl font-light tabular-nums mt-1">{formatTemp(shade, tempUnit)}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/70 leading-none whitespace-nowrap">☁️ Skyet</div>
            <div className="text-xl font-light tabular-nums mt-1">{formatTemp(cloudy, tempUnit)}</div>
          </div>
        </div>
      ) : (
        <div className="text-3xl font-light tabular-nums">—</div>
      )}
      <div className="mt-2">
        <NormalDelta delta={delta} unit="°" normal={normal} upIsBad={false} />
      </div>
      <div className="text-[12px] text-white/80 mt-3 leading-snug">{hint}</div>
    </GlassCard>
  );
}

function feelsLikeReason(hour: Hour | null, isDay: boolean): string {
  if (!hour) return "—";
  const t = hour.temp;
  const w = hour.wind;
  const hum = hour.humidity;
  const cloud = hour.cloud;
  const precip = hour.precip;
  const precipProb = hour.precipProbability;
  const clear = isClearSymbol(hour.symbol);
  const rainy = precip >= 0.2 || precipProb >= 40;

  // Sterk vind + kulde: vindavkjøling
  if (w >= 5 && t < 10) return "Vinden gjør at det føles kaldere.";
  if (w >= 3 && t < 15) return "Vinden gjør at det føles kjøligere.";

  // Nedbør gjør det kjøligere
  if (rainy && t < 12) return "Nedbør gjør at det føles kaldere.";
  if (rainy && t >= 12) return "Nedbør gjør at det føles kjøligere.";

  // Luftfuktighet
  if (hum >= 80 && t >= 18) return "Høy luftfuktighet gjør varmen tyngre.";
  if (hum >= 85 && t < 5) return "Fuktig kald luft føles rå.";

  // Solvarme
  if (clear && isDay && t >= 10) return "Sol gjør at det føles varmere.";

  // Skygge
  if (cloud > 75 && t >= 12) return "Skyggen gjør at det føles kjøligere.";

  // Tørr luft
  if (hum < 40 && t >= 22) return "Tørr varme føles lettere.";
  if (hum < 40 && t < 0) return "Tørr kulde føles skarp.";

  // Enkle temperaturbeskrivelser (ikke komfort-vurderinger)
  if (t < -5) return "Kaldt.";
  if (t < 5) return "Kjølig.";
  if (t >= 25) return "Varmt.";
  return "Mildt.";
}

function isClearSymbol(symbol: string | null): boolean {
  return !!symbol && (symbol.includes("clearsky") || symbol.includes("fair"));
}

function SkydekkeSceneFX({
  cloud,
  wind,
  rainIntensity,
  rainProb,
}: {
  cloud: number;
  wind: number;
  rainIntensity: number;
  rainProb: number;
}) {
  // 0..1 dekning
  const cov = Math.max(0, Math.min(1, cloud / 100));
  // Vind → farts-multiplikator (1 = normal, opp mot 4x ved storm)
  const windMult = Math.min(4, Math.max(0.6, 1 + wind / 6));
  const baseDur = 26; // sekunder tvers over ved windMult=1
  // Antall skyer skalerer med dekning
  const cloudCount = Math.round(2 + cov * 6); // 2..8
  // Sol synlig helt opp mot 80 % skydekke (også på delvis skyet). Full styrke
  // under 30 %, fader lineært ut mot 80 %.
  const sunOpacity = cov <= 0.3 ? 1 : cov < 0.8 ? 1 - (cov - 0.3) / 0.5 : 0;
  // Skyfarge blir mørkere jo mer regn
  const rainMix = Math.max(rainIntensity, rainProb / 100);
  const cloudTop = `hsl(210 15% ${Math.round(96 - rainMix * 40)}%)`;
  const cloudBot = `hsl(215 18% ${Math.round(78 - rainMix * 42)}%)`;
  const cloudShadow = `hsl(220 25% ${Math.round(55 - rainMix * 30)}%)`;

  const clouds = useMemo(() => {
    const arr: { top: number; scale: number; delay: number; dur: number; opacity: number; z: number }[] = [];
    for (let i = 0; i < cloudCount; i++) {
      // deterministisk pseudo-random via i og cov
      const r = (n: number) => {
        const x = Math.sin((i + 1) * 12.9898 + n * 78.233 + cov * 43.7) * 43758.5453;
        return x - Math.floor(x);
      };
      const top = 8 + r(1) * 72; // %
      const scale = 0.75 + r(2) * 0.9;
      const delay = -(r(3) * baseDur);
      const dur = (baseDur + r(4) * 14) / windMult;
      // Mye mer gjennomsiktige skyer så prosent-tallet er lett å lese
      const opacity = 0.28 + r(5) * 0.22 + rainMix * 0.15;
      arr.push({ top, scale, delay, dur, opacity, z: Math.round(r(6) * 10) });
    }
    return arr.sort((a, b) => a.scale - b.scale);
  }, [cloudCount, cov, windMult]);

  const rainDropCount = rainMix > 0.1 ? Math.round(20 + rainMix * 70) : 0;
  const rainDrops = useMemo(() => {
    return Array.from({ length: rainDropCount }).map((_, i) => {
      const left = (i / Math.max(1, rainDropCount)) * 100 + ((i * 37) % 5);
      const delay = ((i * 53) % 100) / 100;
      const dur = 0.55 + ((i * 17) % 40) / 100;
      const len = 10 + ((i * 23) % 14);
      return { left, delay, dur, len };
    });
  }, [rainDropCount]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Sol som titter frem kun når det er under 40 % skydekke */}
      {sunOpacity > 0 && (
        <div
          className="absolute"
          style={{
            top: "8%",
            right: "10%",
            width: 140,
            height: 140,
            opacity: sunOpacity,
            transition: "opacity 800ms ease",
            pointerEvents: "none",
          }}
        >
          {/* Ytre glød / haze */}
          <div
            className="absolute inset-0"
            style={{
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9) 0%, rgba(255,246,200,0.55) 18%, rgba(180,210,255,0.25) 42%, rgba(180,210,255,0) 70%)",
              filter: "blur(2px)",
              animation: "skyDekkeSunPulse 6s ease-in-out infinite",
            }}
          />
          {/* Solstråler */}
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 w-full h-full"
            style={{ animation: "skyDekkeSunSpin 60s linear infinite" }}
            aria-hidden
          >
            <defs>
              <radialGradient id="sdSunRayFade" cx="50%" cy="50%" r="50%">
                <stop offset="30%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="70%" stopColor="rgba(255,240,180,0.35)" />
                <stop offset="100%" stopColor="rgba(255,240,180,0)" />
              </radialGradient>
            </defs>
            <g stroke="url(#sdSunRayFade)" strokeLinecap="round">
              {Array.from({ length: 16 }).map((_, i) => {
                const a = (i * Math.PI * 2) / 16;
                const x1 = 100 + Math.cos(a) * 32;
                const y1 = 100 + Math.sin(a) * 32;
                const x2 = 100 + Math.cos(a) * 96;
                const y2 = 100 + Math.sin(a) * 96;
                const w = i % 2 === 0 ? 3.2 : 1.4;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w} />;
              })}
            </g>
          </svg>
          {/* Hvit kjerne */}
          <div
            className="absolute"
            style={{
              top: "50%",
              left: "50%",
              width: 58,
              height: 58,
              marginLeft: -29,
              marginTop: -29,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 45% 40%, #ffffff 0%, #ffffff 32%, #fff5c8 62%, rgba(255,220,140,0) 100%)",
              boxShadow: `0 0 30px rgba(255,255,255,${0.9 * sunOpacity}), 0 0 60px rgba(255,220,140,${0.7 * sunOpacity}), 0 0 100px rgba(255,190,90,${0.45 * sunOpacity})`,
              animation: "skyDekkeSunPulse 4s ease-in-out infinite",
            }}
          />
          {/* Liten lens-flare prikk */}
          <div
            className="absolute"
            style={{
              top: "78%",
              left: "18%",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(180,210,255,0.6) 0%, rgba(180,210,255,0) 70%)",
            }}
          />
        </div>
      )}
      {/* Regn */}
      {rainDrops.length > 0 && (
        <div className="absolute inset-0" style={{ opacity: Math.min(1, 0.5 + rainMix * 0.6) }}>
          {rainDrops.map((d, i) => (
            <span
              key={i}
              className="absolute"
              style={{
                left: `${d.left}%`,
                top: "-12px",
                width: 1.2,
                height: d.len,
                background: "linear-gradient(180deg, rgba(210,230,255,0) 0%, rgba(210,230,255,0.85) 100%)",
                animation: `skyDekkeRain ${d.dur}s linear ${d.delay}s infinite`,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      )}
      {/* Skyer */}
      {clouds.map((c, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: `${c.top}%`,
            left: "-30%",
            transform: `scale(${c.scale})`,
            opacity: c.opacity,
            animation: `skyDekkeDrift ${c.dur}s linear ${c.delay}s infinite`,
            zIndex: c.z,
            filter: `drop-shadow(0 4px 6px rgba(15,25,45,${0.08 + rainMix * 0.2}))`,
          }}
        >
          <svg width="120" height="60" viewBox="0 0 120 60" aria-hidden>
            <defs>
              <linearGradient id={`sd-cg-${i}-${Math.round(rainMix * 100)}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cloudTop} />
                <stop offset="100%" stopColor={cloudBot} />
              </linearGradient>
            </defs>
            <g fill={`url(#sd-cg-${i}-${Math.round(rainMix * 100)})`}>
              <ellipse cx="30" cy="38" rx="22" ry="14" />
              <ellipse cx="55" cy="30" rx="26" ry="18" />
              <ellipse cx="82" cy="36" rx="24" ry="15" />
              <ellipse cx="65" cy="42" rx="34" ry="10" />
            </g>
            <ellipse cx="60" cy="52" rx="42" ry="4" fill={cloudShadow} opacity={0.15 + rainMix * 0.3} />
          </svg>
        </div>
      ))}
      <style>{`
        @keyframes skyDekkeDrift {
          0% { transform: translateX(0) scale(var(--s,1)); }
          100% { transform: translateX(160%) scale(var(--s,1)); }
        }
        @keyframes skyDekkeRain {
          0% { transform: translateY(-10px); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(220px); opacity: 0; }
        }
        @keyframes skyDekkeSunPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes skyDekkeSunSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function CloudCard({ hour }: { hour: Hour | null }) {
  const c = Math.round(hour?.cloud ?? 0);
  const rainProb = hour?.precipProbability ?? 0;
  const rainMm = hour?.precip ?? 0;
  const rainIntensity = Math.min(1, rainMm / 4);
  const wind = hour?.wind ?? 0;
  const label = c < 25 ? "Klar himmel" : c < 60 ? "Delvis skyet" : c < 85 ? "Skyet" : "Overskyet";
  return (
    <GlassCard
      eyebrow="Skydekke"
      icon={<Cloud size={14} />}
      fx={<SkydekkeSceneFX cloud={c} wind={wind} rainIntensity={rainIntensity} rainProb={rainProb} />}
    >
      <div className="text-3xl font-light tabular-nums">{hour ? `${c} %` : "—"}</div>
      <div className="text-[12px] text-white/80 mt-3 leading-snug">{label}</div>
    </GlassCard>
  );
}

// Klimanormaler for Skien — månedlig gjennomsnittlig døgnnedbør (mm/dag),
// grovt anslag basert på månedsnormaler ~55–105 mm delt på antall dager.
const SKIEN_MONTHLY_PRECIP_NORMAL_MM_PER_DAY = [1.8, 1.6, 1.8, 1.5, 1.9, 2.7, 2.8, 2.9, 3.0, 3.4, 3.0, 2.4];
// Klimanormaler for Skien — typisk vindkast (m/s) per måned, innlandet.
const SKIEN_MONTHLY_GUST_NORMAL_MS = [7, 7, 6.5, 6, 5.5, 5, 5, 5, 5.5, 6.5, 7, 7];
// Klimanormaler for Skien — typisk middelvind (m/s) per måned, innlandet.
const SKIEN_MONTHLY_WIND_NORMAL_MS = [4.5, 4.5, 4.2, 3.8, 3.5, 3.2, 3.0, 3.1, 3.5, 4.2, 4.5, 4.5];
// Klimanormaler for Skien — typisk månedlig gjennomsnittstemperatur / følt temperatur (°C).
const SKIEN_MONTHLY_FEELS_NORMAL_C = [-2.5, -2.0, 1.0, 6.0, 11.5, 15.5, 17.0, 16.0, 12.0, 7.0, 2.0, -1.5];

function NormalDelta({
  delta,
  unit,
  normal,
  upIsBad = true,
}: {
  delta: number;
  unit: string;
  normal: number;
  upIsBad?: boolean;
}) {
  const threshold = unit === "°" ? 0.5 : 0.5;
  const above = delta >= threshold;
  const below = delta <= -threshold;
  const upColor = upIsBad ? "text-orange-300" : "text-emerald-300";
  const downColor = upIsBad ? "text-sky-300" : "text-rose-300";
  const arrowUpColor = upIsBad ? "text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.6)]" : "text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]";
  const arrowDownColor = upIsBad ? "text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]" : "text-rose-400 drop-shadow-[0_0_6px_rgba(251,113,133,0.6)]";
  return (
    <div className={`text-sm flex items-center gap-1.5 ${above ? upColor : below ? downColor : "text-white/85"}`}>
      {above ? (
        <span
          className={`inline-flex flex-col items-center leading-none ${arrowUpColor}`}
          style={{ animation: "normalDeltaArrowUp 1.4s ease-in-out infinite" }}
          aria-hidden
        >
          <ArrowUp size={16} strokeWidth={2.6} />
        </span>
      ) : below ? (
        <span
          className={`inline-flex flex-col items-center leading-none ${arrowDownColor}`}
          style={{ animation: "normalDeltaArrowDown 1.4s ease-in-out infinite" }}
          aria-hidden
        >
          <ArrowDown size={16} strokeWidth={2.6} />
        </span>
      ) : null}
      <span className="tabular-nums">
        {delta >= threshold ? "+" : ""}
        {delta.toFixed(1)}
        {unit} vs normalt ({normal.toFixed(unit === "mm" ? 1 : 1)}
        {unit})
      </span>
      <style>{`
        @keyframes normalDeltaArrowUp { 0%,100% { transform: translateY(2px); opacity: .75 } 50% { transform: translateY(-3px); opacity: 1 } }
        @keyframes normalDeltaArrowDown { 0%,100% { transform: translateY(-2px); opacity: .75 } 50% { transform: translateY(3px); opacity: 1 } }
      `}</style>
    </div>
  );
}

function PrecipTodayCard({ day, days }: { day: ForecastDay | undefined; days: ForecastDay[] | null }) {
  const mm = day?.precip ?? 0;
  const nextRainDay = days?.slice(1, 7).find((d) => d.precip >= 0.2);
  const hint = nextRainDay
    ? `${nextRainDay.precip.toFixed(1)} mm ventes ${weekdayShort(nextRainDay.date)}.`
    : "Tørt de neste dagene.";
  const month = new Date().getMonth();
  const normal = SKIEN_MONTHLY_PRECIP_NORMAL_MM_PER_DAY[month];
  const delta = mm - normal;
  return (
    <GlassCard eyebrow="Nedbør" icon={<CloudRain size={14} />} fx={<RainFX intensity={Math.min(1, mm / 8)} />}>
      <div className="relative">
        <div className="text-3xl font-light tabular-nums">{mm.toFixed(mm < 10 ? 1 : 0)} mm</div>
        <div className="text-sm text-white/85">I dag</div>
        <NormalDelta delta={delta} unit="mm" normal={normal} upIsBad />
        <div className="text-[12px] text-white/75 mt-2 leading-snug">{hint}</div>
      </div>
    </GlassCard>
  );
}

function GustCard({ hour }: { hour: Hour | null }) {
  const [unit] = useWindUnit();
  const w = hour?.wind ?? 0;
  const g = hour?.windGust ?? w;
  const month = new Date().getMonth();
  const normal = SKIEN_MONTHLY_GUST_NORMAL_MS[month];
  const delta = g - normal;
  const suf = ` ${windUnitShort(unit)}`;
  return (
    <GlassCard eyebrow="Vindkast" icon={<Wind size={14} />} fx={<GustFX intensity={Math.min(1, g / 15)} />}>
      <div className="text-3xl font-light tabular-nums">{formatWind(g, unit, { withUnit: false })}</div>
      <div className="text-sm text-white/85">{windUnitShort(unit)}</div>
      <NormalDelta delta={delta} unit={suf} normal={normal} upIsBad />
      <div className="text-[12px] text-white/75 mt-2 leading-snug">Gjennomsnitt {formatWind(w, unit)}.</div>
    </GlassCard>
  );
}

function HumidityCard({ hour }: { hour: Hour | null }) {
  const [tempUnit] = useTempUnit();
  const h = Math.round(hour?.humidity ?? 0);
  const dew = (hour?.temp ?? 0) - (100 - h) / 5;
  return (
    <GlassCard eyebrow="Luftfuktighet" icon={<Droplets size={14} />} fx={<HumidityFX intensity={h / 100} />}>
      <div className="text-3xl font-light tabular-nums">{h} %</div>
      <div className="text-[12px] text-white/75 mt-3 leading-snug">
        Duggpunkt ca {formatTemp(dew, tempUnit)}.
      </div>
    </GlassCard>
  );
}

function PressureCard({ hour }: { hour: Hour | null }) {
  const p = hour?.pressure ?? 0;
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

// Klimanormaler for Skien (grovt månedsgjennomsnitt, °C)
const SKIEN_MONTHLY_NORMALS = [-3, -3, 1, 6, 11, 15, 17, 16, 12, 7, 2, -2];

function AvgTempCard({ hours }: { hours: Hour[] | null }) {
  const [tempUnit] = useTempUnit();
  if (!hours || hours.length === 0) {
    return (
      <GlassCard eyebrow="Snittemp. i dag" icon={<Thermometer size={14} />}>
        <div className="text-3xl font-light tabular-nums">—</div>
      </GlassCard>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayHours = hours.filter((h) => h.time.slice(0, 10) === today);
  const src = todayHours.length >= 4 ? todayHours : hours.slice(0, 24);
  const avg = src.reduce((s, h) => s + (h.temp ?? 0), 0) / src.length;
  const month = new Date().getMonth();
  const normal = SKIEN_MONTHLY_NORMALS[month];
  const delta = avg - normal;
  const deltaAbs = Math.abs(delta);
  const dir = delta >= 0.5 ? "over" : delta <= -0.5 ? "under" : "på";
  const normalTxt = formatTemp(normal, tempUnit);
  const hint = dir === "på"
    ? `Omtrent som normalen (${normalTxt}) for måneden.`
    : `${deltaAbs.toFixed(1)}° ${dir} normalen (${normalTxt}) for måneden.`;
  const fx = avg <= 2
    ? <SnowFX intensity={0.5} />
    : avg >= 18
      ? <HeatwaveFX intensity={1} />
      : delta >= 3
        ? <HeatwaveFX intensity={0.6} />
        : delta <= -3
          ? <SnowFX intensity={0.3} />
          : <HeatwaveFX intensity={-1} />;
  return (
    <GlassCard eyebrow="Snittemp. i dag" icon={<Thermometer size={14} />} fx={fx}>
      <div className="text-3xl font-light tabular-nums">{formatTemp(avg, tempUnit, { digits: 1 })}</div>
      <div className={`text-sm flex items-center gap-1.5 ${delta >= 0.5 ? "text-orange-300" : delta <= -0.5 ? "text-sky-300" : "text-white/85"}`}>
        {delta >= 0.5 ? (
          <span
            className="inline-flex flex-col items-center leading-none text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.6)]"
            style={{ animation: "avgTempArrowUp 1.4s ease-in-out infinite" }}
            aria-hidden
          >
            <ArrowUp size={16} strokeWidth={2.6} />
          </span>
        ) : delta <= -0.5 ? (
          <span
            className="inline-flex flex-col items-center leading-none text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]"
            style={{ animation: "avgTempArrowDown 1.4s ease-in-out infinite" }}
            aria-hidden
          >
            <ArrowDown size={16} strokeWidth={2.6} />
          </span>
        ) : null}
        <span>{delta >= 0.5 ? "+" : ""}{delta.toFixed(1)}° vs normalt</span>
        <style>{`
          @keyframes avgTempArrowUp { 0%,100% { transform: translateY(2px); opacity: .75 } 50% { transform: translateY(-3px); opacity: 1 } }
          @keyframes avgTempArrowDown { 0%,100% { transform: translateY(-2px); opacity: .75 } 50% { transform: translateY(3px); opacity: 1 } }
        `}</style>
      </div>
      <div className="text-[12px] text-white/75 mt-2 leading-snug">{hint}</div>
    </GlassCard>
  );
}

// Estimert sikt fra MET.no (locationforecast har ikke direkte sikt),
// heuristikk: symbol/nedbør/fuktighet/skydekke.
function VisibilityCard({ hour }: { hour: Hour | null }) {
  if (!hour) {
    return (
      <GlassCard eyebrow="Sikt" icon={<Eye size={14} />}>
        <div className="text-3xl font-light tabular-nums">—</div>
      </GlassCard>
    );
  }
  const sym = (hour.symbol ?? "").toLowerCase();
  const precip = hour.precip ?? 0;
  const rh = hour.humidity ?? 0;
  const cloud = hour.cloud ?? 0;

  let vis = 40; // km, klar dag
  if (sym.includes("fog")) vis = 0.4;
  else if (sym.includes("heavysnow") || precip >= 3) vis = 1.5;
  else if (sym.includes("snow") || sym.includes("sleet")) vis = 4;
  else if (sym.includes("heavyrain") || precip >= 2) vis = 3;
  else if (precip >= 0.5) vis = 10;
  else if (rh >= 97) vis = 2;
  else if (rh >= 92) vis = 8;
  else if (rh >= 85) vis = 18;
  else if (cloud >= 90) vis = 25;

  const label =
    vis < 1 ? "Tett tåke" :
    vis < 4 ? "Svært redusert sikt" :
    vis < 10 ? "Redusert sikt" :
    vis < 20 ? "Moderat sikt" :
    vis < 35 ? "God sikt" : "Meget god sikt";

  const fxIntensity = Math.max(0, Math.min(1, (40 - vis) / 40));
  const fx = (
    <>
      {vis < 10
        ? <DriftingClouds intensity={0.9} seed={17} rainy={precip >= 0.5} />
        : <HumidityFX intensity={fxIntensity} />}
      <VisibilityBeamFX vis={vis} />
    </>
  );

  const display = vis < 1 ? `${(vis * 1000).toFixed(0)} m` : `${vis.toFixed(vis < 10 ? 1 : 0)} km`;

  return (
    <GlassCard eyebrow="Sikt" icon={<Eye size={14} />} fx={fx}>
      <div className="text-3xl font-light tabular-nums">{display}</div>
      <div className="text-sm text-white/85">{label}</div>
      <div className="text-[12px] text-white/75 mt-2 leading-snug">Estimert fra fuktighet, nedbør og skydekke.</div>
    </GlassCard>
  );
}

/**
 * Kulere sikt-animasjon: en roterende fyrlykt-kjegle som sveiper gjennom disen,
 * partikler som glir innover (som å kjøre inn i tåke), og en pulserende
 * distanse-vignette. Tettere dis → kortere kjegle og saktere sveip.
 */
function VisibilityBeamFX({ vis }: { vis: number }) {
  const clarity = Math.max(0, Math.min(1, (vis - 0.5) / 40));
  const beamReach = 30 + clarity * 55; // %
  const sweepDur = (14 - clarity * 6).toFixed(1); // s
  const beamOpacity = 0.18 + clarity * 0.35;
  const particles = Array.from({ length: 14 }, (_, i) => ({
    top: (i * 37 + 11) % 100,
    delay: -((i * 0.9) % 7).toFixed(2),
    dur: (5 + ((i * 1.7) % 4)).toFixed(1),
    size: 1 + ((i * 3) % 3),
  }));
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "60%",
          width: `${beamReach}%`,
          height: `${beamReach * 1.6}%`,
          transformOrigin: "0% 50%",
          background:
            "conic-gradient(from -14deg at 0% 50%, transparent 0deg, rgba(180,220,255,0.55) 14deg, rgba(255,255,255,0.0) 22deg, transparent 360deg)",
          filter: "blur(6px)",
          opacity: beamOpacity,
          animation: `sikt-sweep ${sweepDur}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: "calc(50% - 4px)",
          top: "calc(60% - 4px)",
          width: 8,
          height: 8,
          background: "radial-gradient(circle, rgba(200,230,255,0.9), rgba(200,230,255,0) 70%)",
          filter: "blur(1px)",
        }}
      />
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white/70"
          style={{
            top: `${p.top}%`,
            left: "-6%",
            width: p.size,
            height: p.size,
            filter: "blur(0.5px)",
            opacity: 0.35 + clarity * 0.35,
            animation: `sikt-drift ${p.dur}s linear infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.08), transparent 55%)",
          animation: "sikt-pulse 6s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes sikt-sweep {
          0%,100% { transform: rotate(-55deg); }
          50%     { transform: rotate(55deg); }
        }
        @keyframes sikt-drift {
          0%   { transform: translateX(0) scale(1);   opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateX(112vw) scale(1.6); opacity: 0; }
        }
        @keyframes sikt-pulse {
          0%,100% { opacity: .6; }
          50%     { opacity: 1; }
        }
      `}</style>
    </div>
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
  const [unit] = useWindUnit();
  const [tUnit] = useTempUnit();
  return (
    <div className="rounded-xl bg-black/15 border border-white/10 p-3">
      <div className="text-[11px] tracking-wider text-white/75 uppercase mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-y-1.5 text-[12px]">
        {temp !== null && (<><span className="text-white/70">Temp</span><span className="text-right tabular-nums">{formatTemp(temp, tUnit, { digits: 1 })}</span></>)}
        <span className="text-white/70">Vind</span><span className="text-right tabular-nums">{wind !== null ? formatWind(wind, unit) : "—"}</span>
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

function alertFxFor(alert: MetAlert): React.ReactNode {
  const k = `${alert.event} ${alert.title}`.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => k.includes(n));
  if (has("thunder", "torden", "lyn", "lightning")) return <ThunderFX intensity={0.9} />;
  if (has("forest", "skogbrann", "wildfire", "brann")) return <HeatwaveFX intensity={0.9} />;
  if (has("drought", "tørke")) return <HeatwaveFX intensity={0.7} />;
  if (has("rain", "regn", "flood", "flom")) return <RainFX intensity={0.85} />;
  if (has("snow", "snø", "blowing")) return <SnowFX intensity={0.85} />;
  if (has("avalanche", "skred")) return <SnowFX intensity={0.7} />;
  if (has("ice", "is ", "glatt", "icing")) return <SnowFX intensity={0.4} />;
  if (has("wind", "vind", "gale", "storm", "kuling", "polar")) return <WindFX intensity={0.9} />;
  if (has("fog", "tåke")) return <CloudFX intensity={0.9} />;
  return <CloudFX intensity={0.6} />;
}

function AlertCompactTile({ alert }: { alert: MetAlert }) {
  const color = alertColor(alert.awarenessColor);
  const { tone } = useTileTone();
  const [open, setOpen] = usePerUserPersistedState<boolean>(
    `var:alert-open:${alert.id}`,
    false,
  );
  const fx = open ? alertFxFor(alert) : null;
  return (
    <div
      className={toneCardCn(tone, "border-l-[4px] relative overflow-hidden p-0")}
      style={{ borderLeftColor: color }}
    >

      {fx}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative w-full flex items-center gap-2 text-left p-2 hover:bg-white/5 transition-colors"
      >
        <AlertTriangle size={14} style={{ color }} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[9px] tracking-[0.15em] uppercase font-semibold text-white/70">Fare for</div>
          <div className="text-[11px] font-medium leading-tight truncate">{alert.title}</div>
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-white/70 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="relative px-2 pb-2 pl-7 -mt-0.5">
          {alert.description && (
            <p className="text-[11px] text-white/85">{alert.description}</p>
          )}
          {alert.area && (
            <div className="text-[9px] text-white/70 mt-1">{alert.area}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Wind rose (light theme adapted)
// ============================================================

function WindRose({ name, hours, rangeHours }: { name: string; hours: Hour[] | null; rangeHours: number }) {
  const [unit] = useWindUnit();
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
          <div><div className="text-white/70 uppercase tracking-wider text-[10px]">Snitt</div><div className="text-xl font-light tabular-nums">{formatWind(avgWind, unit, { withUnit: false })}</div><div className="text-[10px] text-white/60">{windUnitShort(unit)}</div></div>
          <div><div className="text-white/70 uppercase tracking-wider text-[10px]">Maks</div><div className="text-base font-light tabular-nums">{formatWind(maxWind, unit, { withUnit: false })}</div></div>
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
      lat: "59.6", lon: "9.2", zoom: "8",
      level: "surface", overlay, product: "ecmwf", menu: "", message: "", marker: "", calendar: "now", pressure: "", type: "map", location: "coordinates",
      metricWind: "m/s", metricTemp: "°C", radarRange: "-1",
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
      <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: "4 / 3" }}>
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

function parseForecast(data: any, opts: { showThunderProbability?: boolean } = {}): { days: ForecastDay[]; hours: Hour[] } {
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
    // MET.no gir både mean (precipitation_amount) og min/max — samme som Yr viser som "0–0,2 mm".
    const d1 = next1?.details ?? {};
    const d6 = next6?.details ?? {};
    const meanPrecip = d1.precipitation_amount ?? d6.precipitation_amount ?? 0;
    const minPrecip = d1.precipitation_amount_min ?? d6.precipitation_amount_min ?? meanPrecip;
    const maxPrecip = d1.precipitation_amount_max ?? d6.precipitation_amount_max ?? meanPrecip;
    // Bruk max som "har det regn?"-indikator slik Yr gjør, så lett nedbør ikke skjules.
    const precip = Math.max(meanPrecip, maxPrecip);
    const precipProbability = d1.probability_of_precipitation ?? d6.probability_of_precipitation ?? 0;
    const thunderProbability =
      next1?.details?.probability_of_thunder ??
      next6?.details?.probability_of_thunder ??
      null;
    const hasThunderSymbol = Boolean(symbol?.includes("thunder"));

    hours.push({
      time, temp, precip, precipMin: minPrecip, precipMax: maxPrecip, precipProbability,
      wind: inst.wind_speed ?? 0,
      windGust: inst.wind_speed_of_gust ?? inst.wind_speed ?? 0,
      windDir: inst.wind_from_direction ?? 0,
      pressure: inst.air_pressure_at_sea_level ?? 0,
      humidity: inst.relative_humidity ?? 0,
      cloud: inst.cloud_area_fraction ?? 0,
      thunder: hasThunderSymbol ? (thunderProbability ?? 60) : (opts.showThunderProbability ? (thunderProbability ?? 0) : 0),
      symbol,
    });
    const existing = dayMap.get(date);
    const wind = inst.wind_speed ?? 0;
    if (!existing) {
      dayMap.set(date, { date, tempMin: temp, tempMax: temp, symbol, precip, precipProbability, windMax: wind });
    } else {
      existing.tempMin = Math.min(existing.tempMin, temp);
      existing.tempMax = Math.max(existing.tempMax, temp);
      existing.precip += precip;
      existing.precipProbability = Math.max(existing.precipProbability, precipProbability);
      existing.windMax = Math.max(existing.windMax, wind);
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
  const phaseFraction = phase / synodic; // 0=new, .25=first quarter, .5=full, .75=last
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
  return { name, icon, illumination, phaseFraction };
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
