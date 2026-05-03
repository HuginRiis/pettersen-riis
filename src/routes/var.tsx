import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PageHero } from "@/components/PageShell";
import { LastUpdated } from "@/components/LastUpdated";
import heroImg from "@/assets/got-var.jpg";
import { getHomeySnapshot } from "@/server/homey";
import { findDeviceFuzzy, type DeviceLike } from "@/lib/homey-match";
import { getTollnesAlerts, type AlertsResult, type MetAlert } from "@/server/lightning";
import { useUserLocation, UserLocationBar } from "@/hooks/use-user-location";
import { UvPanel } from "@/components/UvPanel";
import { UvNotificationSettings } from "@/components/UvNotificationSettings";
import { WeatherNotificationSettings } from "@/components/WeatherNotificationSettings";


export const Route = createFileRoute("/var")({
  head: () => ({
    meta: [
      { title: "Værens budskap — Vær | House Pettersen Riis" },
      { name: "description", content: "Værmelding, regn og vind for Skien og hytta." },
      { property: "og:title", content: "Værens budskap | House Pettersen Riis" },
      { property: "og:description", content: "Sjusiffret værmelding, regn og vind fra Tollnes og Numedal." },
    ],
  }),
  // Cache i 3 minutter for å spare Homey API-kall
  staleTime: 3 * 60_000,
  preloadStaleTime: 3 * 60_000,
  loader: () => getHomeySnapshot(),
  component: WeatherPage,
  errorComponent: ({ error }) => (
    <PageShell>
      <section className="container mx-auto px-4 py-16 text-center">
        <h1 className="heading-hero text-3xl mb-4">Værravnen er forsinket</h1>
        <p className="text-muted-foreground">{error.message}</p>
      </section>
    </PageShell>
  ),
});

// Hytta er en fast lokasjon. "Mitt sted" er dynamisk fra userLoc og erstatter
// den tidligere Tollnes-prognosen.
const HYTTA_LOC = { key: "hytta", name: "Hytta · Numedal", subtitle: "Lyngdal · Øvre Bjørkesethvegen", lat: 59.92, lon: 9.30 } as const;

type ForecastDay = {
  date: string;
  symbol: string | null;
  tempMin: number;
  tempMax: number;
  precip: number;
};

type Hour = {
  time: string;
  temp: number;
  precip: number;
  wind: number;
  windDir: number;
  pressure: number;
  humidity: number;
  cloud: number;
  symbol: string | null;
};

type LocationState = {
  days: ForecastDay[] | null;
  hours: Hour[] | null;
  meta: { sunrise: string | null; sunset: string | null } | null;
  error: string | null;
  loading: boolean;
};

function WeatherPage() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getHomeySnapshot>>;
  const fetchAlerts = useServerFn(getTollnesAlerts);
  const userLoc = useUserLocation("var");
  const [alerts, setAlerts] = useState<AlertsResult | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [weatherUpdated, setWeatherUpdated] = useState<Date | null>(null);
  const [homeyUpdated, setHomeyUpdated] = useState<Date | null>(() => new Date());
  const [rangeHours, setRangeHours] = useState<24 | 72 | 168>(24);

  // Dynamiske lokasjoner: "skien"-nøkkelen følger valgt sted (fra UserLocationBar),
  // "hytta" er fast. Vi beholder nøkkelen "skien" for å minimere endringer i resten
  // av siden, men label/koordinater følger userLoc.
  const LOCATIONS = useMemo(
    () =>
      [
        {
          key: "skien" as const,
          name: userLoc.active.label,
          subtitle: "Mitt sted · MET.no",
          lat: userLoc.active.lat,
          lon: userLoc.active.lon,
        },
        HYTTA_LOC,
      ],
    [userLoc.active.label, userLoc.active.lat, userLoc.active.lon],
  );

  const [state, setState] = useState<Record<string, LocationState>>(() => ({
    skien: { days: null, hours: null, meta: null, error: null, loading: true },
    hytta: { days: null, hours: null, meta: null, error: null, loading: true },
  }));

  // Homey-data oppdateres ved hver router.invalidate — merk tidspunktet.
  useEffect(() => {
    setHomeyUpdated(new Date());
  }, [data]);

  useEffect(() => {
    setNow(new Date());
    let pending = LOCATIONS.length;
    let cancelled = false;
    // Marker alle som loading når valgt sted endrer seg
    setState((s) => ({
      ...s,
      skien: { ...(s.skien ?? {} as LocationState), loading: true, error: null },
    }));
    LOCATIONS.forEach(async (loc) => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${loc.lat}&lon=${loc.lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("Kunne ikke hente værmelding");
        const data = await res.json();
        if (cancelled) return;
        const { days, hours } = parseForecast(data);
        setState((s) => ({
          ...s,
          [loc.key]: { days, hours, meta: null, error: null, loading: false },
        }));
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          [loc.key]: {
            days: null,
            hours: null,
            meta: null,
            error: e instanceof Error ? e.message : "Ukjent feil",
            loading: false,
          },
        }));
      } finally {
        pending -= 1;
        if (pending === 0 && !cancelled) setWeatherUpdated(new Date());
      }
    });
    // Hent varsler fra MET
    (async () => {
      try {
        const res = await fetchAlerts();
        if (!cancelled) setAlerts(res);
      } catch (e: any) {
        if (!cancelled) setAlerts({ ok: false, error: e?.message ?? "Feil" });
      }
    })();

    const c = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      cancelled = true;
      clearInterval(c);
    };
  }, [fetchAlerts, LOCATIONS]);

  // ---- Homey-sensorer ----
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

  const tollnesWind = readCap(
    findDeviceFuzzy(devices, zones, "tollnes", (d) => hasCap(d, "measure_wind_strength")),
    "measure_wind_strength",
  );
  const hyttaWind = readCap(
    findDeviceFuzzy(devices, zones, "hytta", (d) => hasCap(d, "measure_wind_strength")),
    "measure_wind_strength",
  );

  const tollnesPressureDev = findDeviceFuzzy(devices, zones, "tollnes", (d) =>
    hasCap(d, "measure_pressure"),
  );
  const hyttaPressureDev = findDeviceFuzzy(devices, zones, "hytta", (d) =>
    hasCap(d, "measure_pressure"),
  );
  const tollnesPressure = readCap(tollnesPressureDev, "measure_pressure");
  const hyttaPressure = readCap(hyttaPressureDev, "measure_pressure");

  const tollnesHumidityDev = findDeviceFuzzy(devices, zones, "tollnes", (d) =>
    hasCap(d, "measure_humidity"),
  );
  const hyttaHumidityDev = findDeviceFuzzy(devices, zones, "hytta", (d) =>
    hasCap(d, "measure_humidity"),
  );
  const tollnesHumidity = readCap(tollnesHumidityDev, "measure_humidity");
  const hyttaHumidity = readCap(hyttaHumidityDev, "measure_humidity");

  const skienHours = state.skien?.hours ?? null;
  const hyttaHours = state.hytta?.hours ?? null;

  // ---- Astronomi: sol & måne ----
  const sun = useMemo(() => (now ? sunTimes(now, 59.2096, 9.609) : null), [now]);
  const moon = useMemo(() => (now ? moonPhase(now) : null), [now]);

  const allAlerts = alerts?.ok === true ? alerts.alerts : [];

  return (
    <PageShell>
      <PageHero
        eyebrow="Skien & Numedal · Norge"
        title="Værens budskap"
        subtitle="Ravnen kommer fra MET.no. Live regn- og vindmålinger fra Netatmo via Homey."
        image={heroImg}
      />

      <section className="container mx-auto px-4 pt-6 flex flex-wrap gap-2 justify-center">
        <LastUpdated label="Vær (MET.no)" timestamp={weatherUpdated} />
        <LastUpdated label="Homey" timestamp={homeyUpdated} />
      </section>

      <section className="container mx-auto px-4 pt-8 space-y-5">
        <UserLocationBar page="var" state={userLoc} />
        <RangeSelector value={rangeHours} onChange={setRangeHours} />
      </section>

      <section className="container mx-auto px-4 py-12 space-y-12">
        {/* === VARSLER FRA MAESTERNE === */}
        <Block title="Varselravnen · MET.no">
          {alerts === null && (
            <p className="text-muted-foreground italic text-sm">Sender ravn…</p>
          )}
          {alerts?.ok === false && (
            <p className="text-destructive text-sm">{alerts.error}</p>
          )}
          {alerts?.ok === true && allAlerts.length === 0 && (
            <div className="panel rounded-lg p-6 text-center">
              <div className="text-3xl mb-2">🕊</div>
              <div className="text-display tracking-[0.3em] text-primary text-sm uppercase">
                Stille over Riket
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Ingen aktive farevarsler fra Maesternes Citadel.
              </p>
            </div>
          )}
          {alerts?.ok === true && allAlerts.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {allAlerts.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          )}
        </Block>

        {/* === LIVE MÅLINGER FRA NETATMO === */}
        <Block title="Borgens målere · Netatmo Live">
          {!homeyOk ? (
            <p className="text-muted-foreground italic text-sm">
              Smarthuset er ikke bundet — gå til{" "}
              <a href="/smarthus" className="text-primary underline">Smarthus</a> for å koble til Homey.
            </p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <LiveMetric
                label="Regn i dag · Tollnes"
                value={tollnesRainToday}
                unit="mm"
                icon="🌧"
                source={tollnesRainSensor?.name ?? null}
              />
              <LiveMetric label="Vind · Tollnes" value={tollnesWind} unit="m/s" icon="💨" />
              <LiveMetric label="Trykk · Tollnes" value={tollnesPressure} unit="hPa" icon="🜨" digits={0} />
              <LiveMetric label="Fuktighet · Tollnes" value={tollnesHumidity} unit="%" icon="💧" digits={0} />
              <LiveMetric
                label="Regn i dag · Hytta"
                value={hyttaRainToday}
                unit="mm"
                icon="🌧"
                source={hyttaRainSensor?.name ?? null}
              />
              <LiveMetric label="Vind · Hytta" value={hyttaWind} unit="m/s" icon="💨" />
              <LiveMetric label="Trykk · Hytta" value={hyttaPressure} unit="hPa" icon="🜨" digits={0} />
              <LiveMetric label="Fuktighet · Hytta" value={hyttaHumidity} unit="%" icon="💧" digits={0} />
            </div>
          )}
        </Block>

        {/* === UV-INDEKS === */}
        <Block title="Solens stråler · UV-indeks">
          <div className="grid lg:grid-cols-2 gap-6">
            <UvPanel
              title="Borgen · Tollnes"
              subtitle="Skien · MET.no"
              lat={59.1789}
              lon={9.5732}
              rangeHours={rangeHours}
            />
            <UvPanel
              title="Hytta · Flesberg"
              subtitle="Numedal · MET.no"
              lat={59.8733}
              lon={9.4297}
              rangeHours={rangeHours}
            />
          </div>
          <div className="mt-6 pt-5 border-t border-border/40">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span>🧴 Solkrem-varsler</span>
              <span className="text-xs font-normal text-muted-foreground">push-varsel når UV stiger</span>
            </h3>
            <UvNotificationSettings />
          </div>
        </Block>

        {/* === SOL OG MÅNE OVER WESTEROS === */}
        <Block title="Himmelens Vandrere · Sol & Måne">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SkyCard
              label="Soloppgang"
              value={sun ? formatTime(sun.sunrise) : "—"}
              icon="🌅"
              hint="Tollnes"
            />
            <SkyCard
              label="Solnedgang"
              value={sun ? formatTime(sun.sunset) : "—"}
              icon="🌇"
              hint="Tollnes"
            />
            <SkyCard
              label="Dagens lengde"
              value={sun ? formatDuration(sun.dayLengthMinutes) : "—"}
              icon="☀️"
              hint={sun ? `${sun.deltaMinutes >= 0 ? "+" : ""}${Math.round(sun.deltaMinutes)} min siden i går` : "—"}
            />
            <SkyCard
              label="Månefase"
              value={moon ? moon.name : "—"}
              icon={moon ? moon.icon : "🌑"}
              hint={moon ? `${Math.round(moon.illumination * 100)}% opplyst` : "—"}
            />
          </div>
        </Block>

        {/* === 24-TIMERS KURVER === */}
        <Block title={`MET.no · ${rangeLabel(rangeHours)} · time for time`}>
          <div className="grid lg:grid-cols-2 gap-6">
            <HourPanel name={userLoc.active.label} hours={skienHours} accent="primary" rangeHours={rangeHours} />
            <HourPanel name="Hytta · Numedal" hours={hyttaHours} accent="ice" rangeHours={rangeHours} />
          </div>
        </Block>

        {/* === VINDROSE === */}
        <Block title={`Stormvaktens Rose · Vindretning ${rangeLabel(rangeHours)}`}>
          <div className="grid sm:grid-cols-2 gap-6">
            <WindRoseCard name={userLoc.active.label} hours={skienHours} rangeHours={rangeHours} />
            <WindRoseCard name="Hytta" hours={hyttaHours} rangeHours={rangeHours} />
          </div>
        </Block>

        {/* === 7 DAGER === */}
        {LOCATIONS.map((loc) => {
          const s = state[loc.key];
          return (
            <Block key={loc.key} title={`${loc.name} · 7 dager`}>
              <p className="text-xs text-muted-foreground mb-4 -mt-2">{loc.subtitle}</p>
              {s?.loading && (
                <p className="text-muted-foreground">Sender ravn til MET.no...</p>
              )}
              {s?.error && <p className="text-destructive">{s.error}</p>}
              {s?.days && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                  {s.days.slice(0, 7).map((d) => (
                    <div
                      key={d.date}
                      className="panel rounded-lg p-4 text-center glow-on-hover"
                    >
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        {weekdayShort(d.date)}
                      </div>
                      <div className="text-medieval text-lg text-primary mt-1">
                        {dayMonth(d.date)}
                      </div>
                      <div className="text-3xl my-3">{symbolEmoji(d.symbol)}</div>
                      <div className="text-foreground font-semibold">
                        {Math.round(d.tempMax)}°
                      </div>
                      <div className="text-xs text-muted-foreground">
                        min {Math.round(d.tempMin)}°
                      </div>
                      {d.precip > 0 && (
                        <div className="text-xs text-ice mt-1">
                          {d.precip.toFixed(1)} mm
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Block>
          );
        })}

        {/* === LIVE VÆRKART === */}
        <Block title="Stormvaktens Kart · Live vær over Telemark & Buskerud">
          <CollapsibleMap />
        </Block>

        {/* === VÆR-VARSLER (push) === */}
        <Block title="Værvaktens Ravner · Push-varsler">
          <WeatherNotificationSettings />
        </Block>

        <p className="text-xs text-muted-foreground italic">
          Værdata fra MET.no. Live målinger fra Netatmo via Homey. Astronomi beregnet lokalt. Kart fra Windy.com.
        </p>
      </section>
    </PageShell>
  );
}

// ============================================================
// Building blocks — Game of Thrones-stil
// ============================================================

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="ornate-divider mb-6">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function LiveMetric({
  label,
  value,
  unit,
  icon,
  source,
  digits = 1,
}: {
  label: string;
  value: number | null;
  unit: string;
  icon: string;
  source?: string | null;
  digits?: number;
}) {
  return (
    <article className="panel rounded-lg p-3 sm:p-5 text-center glow-on-hover">
      <div className="text-xl sm:text-2xl mb-1">{icon}</div>
      <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-muted-foreground uppercase leading-tight">
        {label}
      </div>
      <div className="text-display text-primary text-2xl sm:text-3xl mt-1 sm:mt-2">
        {value !== null ? value.toFixed(digits) : "—"}
      </div>
      <div className="text-[9px] sm:text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase mt-1">
        {unit}
      </div>
      {source && (
        <div className="text-[9px] tracking-[0.15em] text-muted-foreground/60 uppercase mt-1 sm:mt-2 truncate">
          {source}
        </div>
      )}
    </article>
  );
}

function SkyCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  hint?: string;
}) {
  return (
    <article className="panel rounded-lg p-3 sm:p-5 text-center glow-on-hover">
      <div className="text-2xl sm:text-3xl mb-1 sm:mb-2">{icon}</div>
      <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="text-display text-primary text-lg sm:text-2xl mt-1 sm:mt-2">{value}</div>
      {hint && (
        <div className="text-[9px] sm:text-[10px] tracking-[0.1em] sm:tracking-[0.15em] text-muted-foreground/70 uppercase mt-1 sm:mt-2">
          {hint}
        </div>
      )}
    </article>
  );
}

function AlertCard({ alert }: { alert: MetAlert }) {
  const color = alertColor(alert.awarenessColor);
  const isThunder = alert.isThunder;
  return (
    <article
      className="panel rounded-lg p-5 border-l-4"
      style={{
        borderLeftColor: color,
        boxShadow: isThunder
          ? `0 0 24px color-mix(in oklab, ${color} 25%, transparent)`
          : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl">{isThunder ? "⚡" : "⚠️"}</div>
        <div className="flex-1">
          <div
            className="text-[10px] tracking-[0.3em] uppercase font-semibold"
            style={{ color }}
          >
            {alert.awarenessColor} · {alert.severity}
          </div>
          <div className="text-display text-foreground text-lg mt-1">{alert.title}</div>
          {alert.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
              {alert.description}
            </p>
          )}
          {alert.area && (
            <div className="text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase mt-2">
              {alert.area}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function HourPanel({
  name,
  hours,
  accent,
  rangeHours = 24,
}: {
  name: string;
  hours: Hour[] | null;
  accent: "primary" | "ice";
  rangeHours?: number;
}) {
  if (!hours) {
    return (
      <article className="panel rounded-lg p-6">
        <h3 className="text-display text-primary text-lg">{name}</h3>
        <p className="text-sm text-muted-foreground italic mt-2">Sender ravn…</p>
      </article>
    );
  }
  const next = hours.slice(0, rangeHours);
  const color = accent === "ice" ? "var(--ice)" : "var(--primary)";
  const longRange = rangeHours > 24;
  // For tabellrad: vis ca 8 kolonner uavhengig av lengde
  const stride = Math.max(1, Math.round(next.length / 8));
  return (
    <article className="panel rounded-lg p-5 glow-on-hover">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-display text-primary text-lg">{name}</h3>
        <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          {rangeLabel(rangeHours)}
        </span>
      </div>
      <TempPrecipChart hours={next} color={color} showNow={rangeHours <= 24} longRange={longRange} />
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 mt-4">
        {next.filter((_, i) => i % stride === 0).slice(0, 8).map((h) => (
          <div key={h.time} className="text-center">
            <div className="text-[9px] text-muted-foreground tracking-wider">
              {longRange
                ? new Date(h.time).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit" })
                : h.time.slice(11, 13)}
            </div>
            <div className="text-base">{symbolEmoji(h.symbol)}</div>
            <div className="text-xs text-foreground">{Math.round(h.temp)}°</div>
          </div>
        ))}
      </div>
    </article>
  );
}

function TempPrecipChart({
  hours,
  color,
  showNow = false,
  longRange = false,
}: {
  hours: Hour[];
  color: string;
  showNow?: boolean;
  longRange?: boolean;
}) {
  const W = 600;
  const H = 140;
  const pad = { l: 28, r: 16, t: 12, b: 22 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  if (hours.length < 2) return null;

  const temps = hours.map((h) => h.temp);
  const tMin = Math.floor(Math.min(...temps) - 1);
  const tMax = Math.ceil(Math.max(...temps) + 1);
  const tRange = Math.max(1, tMax - tMin);

  const precips = hours.map((h) => h.precip);
  const pMax = Math.max(2, Math.ceil(Math.max(...precips) * 1.2));

  const xFor = (i: number) => pad.l + (i / (hours.length - 1)) * innerW;
  const yForT = (t: number) => pad.t + innerH - ((t - tMin) / tRange) * innerH;
  const yForP = (p: number) => pad.t + innerH - (p / pMax) * innerH;

  const path = hours
    .map((h, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yForT(h.temp).toFixed(1)}`)
    .join(" ");

  const barW = innerW / hours.length;

  // X-tick stride så vi får ca 8 etiketter
  const stride = Math.max(1, Math.round(hours.length / 8));

  // Now-linje basert på faktisk tid
  let nowX: number | null = null;
  if (showNow && hours.length > 1) {
    const now = Date.now();
    const t0 = new Date(hours[0].time).getTime();
    const tN = new Date(hours[hours.length - 1].time).getTime();
    if (now >= t0 && now <= tN) {
      nowX = pad.l + ((now - t0) / (tN - t0)) * innerW;
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
      {[tMin, Math.round((tMin + tMax) / 2), tMax].map((v) => (
        <g key={v}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={yForT(v)}
            y2={yForT(v)}
            stroke="var(--border)"
            strokeDasharray="2 4"
            opacity="0.5"
          />
          <text x={4} y={yForT(v) + 4} fontSize="10" fill="var(--muted-foreground)">
            {v}°
          </text>
        </g>
      ))}
      {hours.map((h, i) => {
        if (h.precip <= 0) return null;
        const x = xFor(i) - barW / 2;
        const y = yForP(h.precip);
        return (
          <rect
            key={h.time}
            x={x}
            y={y}
            width={Math.max(2, barW - 1)}
            height={pad.t + innerH - y}
            fill="var(--ice)"
            opacity="0.55"
            rx="1"
          />
        );
      })}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {nowX != null && (
        <g>
          <line
            x1={nowX}
            x2={nowX}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke="var(--primary)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.85"
          />
          <text x={nowX} y={pad.t - 2} fontSize="9" fill="var(--primary)" textAnchor="middle">
            nå
          </text>
        </g>
      )}
      {hours.filter((_, i) => i % stride === 0).map((h, idx) => {
        const i = idx * stride;
        return (
          <text
            key={h.time}
            x={xFor(i)}
            y={H - 6}
            fontSize="10"
            fill="var(--muted-foreground)"
            textAnchor="middle"
          >
            {longRange
              ? new Date(h.time).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit" })
              : h.time.slice(11, 13)}
          </text>
        );
      })}
    </svg>
  );
}

function WindRoseCard({
  name,
  hours,
  rangeHours = 24,
}: {
  name: string;
  hours: Hour[] | null;
  rangeHours?: number;
}) {
  if (!hours) {
    return (
      <article className="panel rounded-lg p-6">
        <h3 className="text-display text-primary text-lg">{name}</h3>
        <p className="text-sm text-muted-foreground italic mt-2">Sender ravn…</p>
      </article>
    );
  }
  const next = hours.slice(0, rangeHours);
  // 8 hovedretninger
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

  const cx = 100;
  const cy = 100;
  const rOuter = 80;
  return (
    <article className="panel rounded-lg p-5 glow-on-hover">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-display text-primary text-lg">{name}</h3>
        <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          {rangeLabel(rangeHours)} · vindrose
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
        <svg viewBox="0 0 200 200" className="w-full max-w-[220px] mx-auto">
          {/* Ringer */}
          {[0.33, 0.66, 1].map((f) => (
            <circle
              key={f}
              cx={cx}
              cy={cy}
              r={rOuter * f}
              fill="none"
              stroke="var(--border)"
              strokeDasharray="2 3"
              opacity="0.5"
            />
          ))}
          {/* Akser N-S, E-W */}
          <line x1={cx} y1={cy - rOuter} x2={cx} y2={cy + rOuter} stroke="var(--border)" opacity="0.4" />
          <line x1={cx - rOuter} y1={cy} x2={cx + rOuter} y2={cy} stroke="var(--border)" opacity="0.4" />
          {/* Sektorer */}
          {buckets.map((b, i) => {
            if (b.count === 0) return null;
            const startAngle = i * 45 - 22.5 - 90; // North up
            const endAngle = startAngle + 45;
            const r = (b.count / maxCount) * rOuter;
            const a1 = (startAngle * Math.PI) / 180;
            const a2 = (endAngle * Math.PI) / 180;
            const x1 = cx + r * Math.cos(a1);
            const y1 = cy + r * Math.sin(a1);
            const x2 = cx + r * Math.cos(a2);
            const y2 = cy + r * Math.sin(a2);
            const largeArc = 0;
            const path = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
            const intensity = b.sumWind / Math.max(1, b.count) / Math.max(1, maxWind);
            return (
              <path
                key={i}
                d={path}
                fill="var(--primary)"
                opacity={0.3 + intensity * 0.5}
                stroke="var(--primary)"
                strokeWidth="0.5"
              />
            );
          })}
          {/* Retnings-labels */}
          {dirs.map((d, i) => {
            const angle = (i * 45 - 90) * (Math.PI / 180);
            const x = cx + (rOuter + 12) * Math.cos(angle);
            const y = cy + (rOuter + 12) * Math.sin(angle) + 3;
            return (
              <text
                key={d}
                x={x}
                y={y}
                fontSize="10"
                fill={i === dominantIdx ? "var(--primary)" : "var(--muted-foreground)"}
                textAnchor="middle"
                fontWeight={i === dominantIdx ? "700" : "400"}
              >
                {d}
              </text>
            );
          })}
        </svg>
        <div className="space-y-3 text-center">
          <div>
            <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
              Snitt
            </div>
            <div className="text-display text-primary text-2xl">{avgWind.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground tracking-wider uppercase">m/s</div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
              Maks
            </div>
            <div className="text-display text-foreground text-xl">{maxWind.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground tracking-wider uppercase">m/s</div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
              Fra
            </div>
            <div className="text-display text-primary text-xl">{dirs[dominantIdx]}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// Helpers
// ============================================================

function rangeLabel(h: number): string {
  if (h <= 24) return "24 timer";
  if (h <= 72) return "3 dager";
  return "7 dager";
}

function RangeSelector({
  value,
  onChange,
}: {
  value: 24 | 72 | 168;
  onChange: (v: 24 | 72 | 168) => void;
}) {
  const options: { v: 24 | 72 | 168; label: string }[] = [
    { v: 24, label: "24 timer" },
    { v: 72, label: "3 dager" },
    { v: 168, label: "7 dager" },
  ];
  return (
    <div className="flex justify-center">
      <div
        role="tablist"
        aria-label="Tidsrom for værvarsel"
        className="inline-flex rounded-md border border-border/60 bg-background/40 p-1 gap-1"
      >
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={o.v}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.v)}
              className={
                "px-4 py-1.5 text-[11px] tracking-[0.25em] uppercase rounded transition-colors " +
                (active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function alertColor(c: string): string {
  switch (c) {
    case "red": return "oklch(0.55 0.22 25)";
    case "orange": return "oklch(0.70 0.18 50)";
    case "yellow": return "oklch(0.80 0.16 90)";
    default: return "oklch(0.65 0.10 150)";
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
    if (k.toLowerCase().includes("rain") && typeof d.capabilities[k]?.value === "number") {
      return true;
    }
  }
  return false;
}

function readDailyRain(d: DeviceLike | null | undefined): number | null {
  if (!d?.capabilities) return null;
  const caps = d.capabilities;
  const priority = [
    "meter_rain.today",
    "meter_rain.daily",
    "meter_rain.day",
    "measure_rain.today",
    "measure_rain.daily",
    "measure_rain.day",
    "meter_rain",
    "measure_rain.24h",
    "measure_rain.1h",
    "measure_rain",
  ];
  for (const cap of priority) {
    const v = caps[cap]?.value;
    if (typeof v === "number") return v;
  }
  for (const [k, val] of Object.entries(caps)) {
    if (k.toLowerCase().includes("rain") && typeof val?.value === "number") {
      return val.value as number;
    }
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
    const precip =
      next1?.details?.precipitation_amount ??
      next6?.details?.precipitation_amount ??
      0;
    hours.push({
      time,
      temp,
      precip,
      wind: inst.wind_speed ?? 0,
      windDir: inst.wind_from_direction ?? 0,
      pressure: inst.air_pressure_at_sea_level ?? 0,
      humidity: inst.relative_humidity ?? 0,
      cloud: inst.cloud_area_fraction ?? 0,
      symbol,
    });
    const existing = dayMap.get(date);
    if (!existing) {
      dayMap.set(date, { date, tempMin: temp, tempMax: temp, symbol, precip });
    } else {
      existing.tempMin = Math.min(existing.tempMin, temp);
      existing.tempMax = Math.max(existing.tempMax, temp);
      existing.precip += precip;
      const hour = parseInt(time.slice(11, 13));
      if (hour >= 11 && hour <= 14 && symbol) existing.symbol = symbol;
    }
  }
  return {
    days: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    hours,
  };
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

function weekdayShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { weekday: "short" });
}
function dayMonth(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}
function formatTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}
function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}t ${m}m`;
}

// --- Sun position (NOAA approximation) ---
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
  // Julian date for noon UTC
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

// --- Moon phase ---
function moonPhase(date: Date) {
  const synodic = 29.53058867;
  const ref = Date.UTC(2000, 0, 6, 18, 14, 0); // Known new moon
  const days = (date.getTime() - ref) / 86_400_000;
  const phase = ((days % synodic) + synodic) % synodic;
  const illumination = (1 - Math.cos((2 * Math.PI * phase) / synodic)) / 2;
  let name: string;
  let icon: string;
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

// ============================================================
// Windy live-kart med valgbare lag og tidslinje
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
  { key: "waves", label: "Bølger", icon: "🌊" },
  { key: "visibility", label: "Sikt", icon: "👁" },
  { key: "fog", label: "Tåke", icon: "🌫" },
  { key: "uvIndex", label: "UV-indeks", icon: "🔆" },
  { key: "cape", label: "CAPE (uvær)", icon: "🌩" },
  { key: "satellite", label: "Satellitt", icon: "🛰" },
  { key: "radar", label: "Radar", icon: "📡" },
];

function CollapsibleMap() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full panel rounded-lg p-4 flex items-center justify-between hover:bg-card/70 transition-colors"
      >
        <span className="text-display tracking-[0.2em] text-primary text-sm uppercase flex items-center gap-2">
          <span>🗺</span>
          {open ? "Lukk kartet" : "Åpne live værkart"}
        </span>
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <WindyMap />}
    </div>
  );
}

function WindyMap() {
  const [overlay, setOverlay] = useState<string>("wind");

  const src = useMemo(() => {
    const params = new URLSearchParams({
      lat: "59.6",
      lon: "9.2",
      detailLat: "59.21",
      detailLon: "9.61",
      zoom: "8",
      level: "surface",
      overlay,
      product: "ecmwf",
      menu: "",
      message: "true",
      marker: "",
      calendar: "now",
      pressure: "",
      type: "map",
      location: "coordinates",
      detail: "true",
      metricWind: "m/s",
      metricTemp: "°C",
      radarRange: "-1",
    });
    return `https://embed.windy.com/embed2.html?${params.toString()}`;
  }, [overlay]);

  return (
    <article className="panel rounded-lg p-2 sm:p-3 overflow-hidden">
      <div className="flex flex-wrap gap-1.5 mb-3 px-1">
        {WINDY_OVERLAYS.map((o) => {
          const active = o.key === overlay;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setOverlay(o.key)}
              className={
                "px-2.5 py-1 rounded-md text-xs tracking-wider uppercase border transition-colors " +
                (active
                  ? "bg-primary/20 border-primary text-primary shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_30%,transparent)]"
                  : "bg-background/40 border-border text-muted-foreground hover:text-foreground hover:border-primary/50")
              }
              aria-pressed={active}
            >
              <span className="mr-1">{o.icon}</span>
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: "16 / 11" }}>
        <iframe
          key={overlay}
          title={`Windy live værkart — ${overlay}`}
          src={src}
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
          allow="fullscreen"
        />
      </div>
      <p className="text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase mt-2 text-center">
        Kart fra Windy.com · Velg lag over · Tidslinje nederst i kartet
      </p>
    </article>
  );
}
