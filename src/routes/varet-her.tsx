import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Loader2, ArrowDown, ArrowUp, Wind, Droplets, RefreshCw, Home } from "lucide-react";
import { GlassPaneFX, glassKindFromSymbol } from "@/components/weather/WeatherFX";
import { getMetForecastComplete } from "@/lib/met-forecast.functions";
import { useTempUnit, formatTemp } from "@/hooks/use-temp-unit";
import { useWindUnit, formatWind } from "@/hooks/use-wind-unit";

export const Route = createFileRoute("/varet-her")({
  head: () => ({
    meta: [
      { title: "Været her og nå — din posisjon" },
      {
        name: "description",
        content:
          "Live vær for stedet du står på: temperatur nå, maks og min neste døgn, med naturtro væranimasjon.",
      },
      { property: "og:title", content: "Været her og nå" },
      {
        property: "og:description",
        content: "Temperatur nå, maks og min neste døgn for din posisjon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VaretHerPage,
});

type Hour = {
  time: string;
  temp: number;
  symbol: string | null;
  precip: number;
  wind: number;
  gust: number | null;
  humidity: number | null;
  cloud: number | null;
};

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

function VaretHerPage() {
  const fetchForecast = useServerFn(getMetForecastComplete);
  const [tUnit] = useTempUnit();
  const [wUnit] = useWindUnit();

  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [sun, setSun] = useState<{ sunrise: Date | null; sunset: Date | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // 1) Hvor er jeg?
  const locate = useCallback(() => {
    setError(null);
    setLoading(true);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Nettleseren din støtter ikke posisjon.");
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setError("Fikk ikke tilgang til posisjonen din. Tillat posisjon og prøv igjen.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  // 2) Stedsnavn
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=no`,
        );
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        const name =
          j?.locality || j?.city || j?.principalSubdivision || j?.countryName || null;
        setPlace(name);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coords]);

  // 3) Værdata + soltider
  const load = useCallback(async () => {
    if (!coords) return;
    try {
      setError(null);
      const today = new Date().toISOString().slice(0, 10);
      const [fc, sunRes] = await Promise.all([
        fetchForecast({ data: { lat: coords.lat, lon: coords.lon } }),
        fetch(
          `https://api.met.no/weatherapi/sunrise/3.0/sun?lat=${coords.lat.toFixed(4)}&lon=${coords.lon.toFixed(4)}&date=${today}`,
          { headers: { Accept: "application/json" } },
        ).catch(() => null),
      ]);
      const series: any[] = fc?.properties?.timeseries ?? [];
      const list: Hour[] = [];
      for (const e of series.slice(0, 48)) {
        const d = e?.data?.instant?.details ?? {};
        const n1 = e?.data?.next_1_hours;
        const n6 = e?.data?.next_6_hours;
        if (typeof d.air_temperature !== "number") continue;
        list.push({
          time: e.time,
          temp: d.air_temperature,
          symbol: n1?.summary?.symbol_code ?? n6?.summary?.symbol_code ?? null,
          precip:
            n1?.details?.precipitation_amount ?? n6?.details?.precipitation_amount ?? 0,
          wind: d.wind_speed ?? 0,
          gust: d.wind_speed_of_gust ?? null,
          humidity: d.relative_humidity ?? null,
          cloud: d.cloud_area_fraction ?? null,
        });
      }
      setHours(list);
      setUpdatedAt(new Date());
      if (sunRes && sunRes.ok) {
        const sj = await sunRes.json();
        const sr = sj?.properties?.sunrise?.time;
        const ss = sj?.properties?.sunset?.time;
        setSun({ sunrise: sr ? new Date(sr) : null, sunset: ss ? new Date(ss) : null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente værdata");
    } finally {
      setLoading(false);
    }
  }, [coords, fetchForecast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const now = hours?.[0] ?? null;
  const next24 = useMemo(() => (hours ? hours.slice(0, 24) : []), [hours]);
  const tMax = next24.length ? Math.max(...next24.map((h) => h.temp)) : null;
  const tMin = next24.length ? Math.min(...next24.map((h) => h.temp)) : null;
  const tMaxAt = next24.find((h) => h.temp === tMax)?.time ?? null;
  const tMinAt = next24.find((h) => h.temp === tMin)?.time ?? null;
  const precip24 = next24.reduce((s, h) => s + (h.precip || 0), 0);
  const maxGust = next24.reduce((m, h) => Math.max(m, h.gust ?? h.wind), 0);

  const isDay = useMemo(() => {
    const t = Date.now();
    const sr = sun?.sunrise?.getTime();
    const ss = sun?.sunset?.getTime();
    if (!sr || !ss) {
      const h = new Date().getHours();
      return h >= 7 && h < 19;
    }
    return t >= sr && t <= ss;
  }, [sun]);

  const kind = glassKindFromSymbol(now?.symbol ?? null, isDay);

  const hhmm = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })
      : "–";

  return (
    <main className="relative min-h-screen overflow-hidden">
      <GlassPaneFX
        kind={kind}
        intensity={0.7}
        sun={sun}
        wind={now?.wind ?? 0}
        precipMm={now?.precip ?? 0}
      />

      <Link
        to="/"
        className="absolute top-4 left-4 z-50 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-xl border transition-all bg-white/10 text-white/90 border-white/20 hover:bg-white/25"
      >
        <Home className="h-4 w-4" />
        <span>Hjem</span>
      </Link>

      <div className="relative z-10 container mx-auto px-4 py-8 pt-20 max-w-3xl">
        <header className="text-center">
          <p className="text-[10px] tracking-[0.35em] uppercase text-primary/80">
            Været der du er
          </p>
          <h1 className="text-3xl sm:text-4xl text-medieval text-primary mt-1 flex items-center justify-center gap-2">
            <MapPin className="h-6 w-6" />
            {place ?? (coords ? "Din posisjon" : "Finner deg…")}
          </h1>
          {coords && (
            <p className="text-[11px] text-muted-foreground tabular-nums mt-1">
              {coords.lat.toFixed(3)}°N {coords.lon.toFixed(3)}°Ø
              {updatedAt && (
                <> · oppdatert {updatedAt.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}</>
              )}
            </p>
          )}
        </header>

        {loading && !now && (
          <div className="mt-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm italic">Sender ravn til din posisjon…</p>
          </div>
        )}

        {error && (
          <div className="mt-10 panel rounded-lg p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={locate}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Prøv igjen
            </button>
          </div>
        )}

        {now && (
          <>
            {/* NÅ */}
            <section className="mt-8 panel rounded-2xl p-6 sm:p-10 text-center animate-fade-in">
              <div className="text-6xl sm:text-7xl mb-2 animate-scale-in">
                {symbolEmoji(now.symbol)}
              </div>
              <div className="text-6xl sm:text-8xl font-semibold text-foreground tabular-nums leading-none">
                {formatTemp(now.temp, tUnit, { digits: 1 })}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Føles roligst akkurat nå · {formatWind(now.wind, wUnit)} vind
                {now.humidity !== null && <> · {Math.round(now.humidity)}% luftfuktighet</>}
              </p>
            </section>

            {/* MAKS / MIN NESTE DØGN */}
            <section className="mt-4 grid grid-cols-2 gap-3">
              <div className="panel rounded-xl p-5 text-center glow-on-hover">
                <ArrowUp className="h-5 w-5 mx-auto text-orange-400 mb-1 animate-fade-in" />
                <div className="text-3xl font-semibold text-foreground tabular-nums leading-none">
                  {tMax !== null ? formatTemp(tMax, tUnit, { digits: 1 }) : "–"}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                  maks · {hhmm(tMaxAt)}
                </div>
              </div>
              <div className="panel rounded-xl p-5 text-center glow-on-hover">
                <ArrowDown className="h-5 w-5 mx-auto text-sky-400 mb-1 animate-fade-in" />
                <div className="text-3xl font-semibold text-foreground tabular-nums leading-none">
                  {tMin !== null ? formatTemp(tMin, tUnit, { digits: 1 }) : "–"}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                  min · {hhmm(tMinAt)}
                </div>
              </div>
            </section>

            <section className="mt-3 grid grid-cols-2 gap-3">
              <div className="panel rounded-xl p-4 flex items-center gap-3">
                <Droplets className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xl font-semibold tabular-nums text-foreground leading-none">
                    {precip24.toFixed(1)} mm
                  </div>
                  <div className="text-[11px] text-muted-foreground">nedbør neste døgn</div>
                </div>
              </div>
              <div className="panel rounded-xl p-4 flex items-center gap-3">
                <Wind className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xl font-semibold tabular-nums text-foreground leading-none">
                    {formatWind(maxGust, wUnit)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">sterkeste kast</div>
                </div>
              </div>
            </section>

            {/* TIMER */}
            <section className="mt-4 panel rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-primary/80 mb-3">
                Neste 24 timer
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {next24.map((h) => (
                  <div
                    key={h.time}
                    className="shrink-0 w-16 rounded-lg bg-background/40 border border-border p-2 text-center hover-scale"
                  >
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(h.time).toLocaleTimeString("nb-NO", { hour: "2-digit" })}
                    </div>
                    <div className="text-lg">{symbolEmoji(h.symbol)}</div>
                    <div className="text-xs text-foreground tabular-nums">
                      {formatTemp(h.temp, tUnit, { digits: 0 })}
                    </div>
                    <div className="text-[9px] text-sky-400 tabular-nums">
                      {h.precip > 0 ? `${h.precip.toFixed(1)}` : "0"} mm
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <p className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Data fra MET.no
            </p>
          </>
        )}
      </div>
    </main>
  );
}
