import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import heroImg from "@/assets/hero-westeros.jpg";
import { getHomeySnapshot } from "@/server/homey";
import { findDeviceFuzzy, type DeviceLike } from "@/lib/homey-match";

export const Route = createFileRoute("/var")({
  head: () => ({
    meta: [
      { title: "Værens budskap — Vær | House Riis" },
      { name: "description", content: "Værmelding, regn og vind for Skien og hytta." },
      { property: "og:title", content: "Værens budskap | House Riis" },
      { property: "og:description", content: "Sjusiffret værmelding, regn og vind fra Tollnes og Numedal." },
    ],
  }),
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

const LOCATIONS = [
  { key: "skien", name: "Skien", subtitle: "Tollnes · House Pettersen Riis", lat: 59.2096, lon: 9.609 },
  { key: "hytta", name: "Hytta", subtitle: "Lyngdal i Numedal · Øvre Bjørkesethvegen", lat: 59.92, lon: 9.30 },
] as const;

type ForecastDay = {
  date: string;
  symbol: string | null;
  tempMin: number;
  tempMax: number;
  precip: number;
};

type LocationState = {
  days: ForecastDay[] | null;
  error: string | null;
  loading: boolean;
};

function WeatherPage() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getHomeySnapshot>>;
  const router = useRouter();
  const [state, setState] = useState<Record<string, LocationState>>(() =>
    Object.fromEntries(
      LOCATIONS.map((l) => [l.key, { days: null, error: null, loading: true }]),
    ),
  );

  useEffect(() => {
    LOCATIONS.forEach(async (loc) => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${loc.lat}&lon=${loc.lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("Kunne ikke hente værmelding");
        const data = await res.json();
        setState((s) => ({
          ...s,
          [loc.key]: { days: parseForecast(data), error: null, loading: false },
        }));
      } catch (e) {
        setState((s) => ({
          ...s,
          [loc.key]: {
            days: null,
            error: e instanceof Error ? e.message : "Ukjent feil",
            loading: false,
          },
        }));
      }
    });
    // Oppfrisk Homey-data hvert 60. sek
    const t = setInterval(() => router.invalidate(), 60_000);
    return () => clearInterval(t);
  }, [router]);

  // ---- Homey-sensorer (regn + vind) ----
  const homeyOk = data?.ok === true;
  const devices = homeyOk ? data.devices : [];
  const zones = homeyOk ? data.zones : [];

  const tollnesRain = readCap(
    findDeviceFuzzy(devices, zones, "tollnes", (d) => hasCap(d, "measure_rain")),
    "measure_rain",
  );
  const tollnesWind = readCap(
    findDeviceFuzzy(devices, zones, "tollnes", (d) => hasCap(d, "measure_wind_strength")),
    "measure_wind_strength",
  );
  const hyttaRain = readCap(
    findDeviceFuzzy(devices, zones, "hytta", (d) => hasCap(d, "measure_rain")),
    "measure_rain",
  );
  const hyttaWind = readCap(
    findDeviceFuzzy(devices, zones, "hytta", (d) => hasCap(d, "measure_wind_strength")),
    "measure_wind_strength",
  );

  return (
    <PageShell>
      <PageHero
        eyebrow="Skien & Numedal · Norge"
        title="Værens budskap"
        subtitle="Ravnen kommer fra MET.no. Live regn- og vindmålinger fra Netatmo via Homey."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-12 space-y-12">
        {/* Live målinger fra Homey */}
        <div>
          <div className="ornate-divider mb-6">
            <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
              Live målinger · Netatmo
            </span>
          </div>
          {!homeyOk ? (
            <p className="text-muted-foreground italic text-sm">
              Smarthuset er ikke bundet — gå til <a href="/smarthus" className="text-primary underline">Smarthus</a> for å koble til Homey.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <LiveMetric label="Regn · Tollnes" value={tollnesRain} unit="mm/t" icon="🌧" />
              <LiveMetric label="Vind · Tollnes" value={tollnesWind} unit="m/s" icon="💨" />
              <LiveMetric label="Regn · Hytta" value={hyttaRain} unit="mm/t" icon="🌧" />
              <LiveMetric label="Vind · Hytta" value={hyttaWind} unit="m/s" icon="💨" />
            </div>
          )}
        </div>

        {LOCATIONS.map((loc) => {
          const s = state[loc.key];
          return (
            <div key={loc.key}>
              <div className="ornate-divider mb-6">
                <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
                  {loc.name} · 7 dager
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-4 -mt-3">
                {loc.subtitle}
              </p>

              {s?.loading && (
                <p className="text-muted-foreground">Sender ravn til MET.no...</p>
              )}
              {s?.error && <p className="text-destructive">{s.error}</p>}
              {s?.days && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                  {s.days.slice(0, 7).map((d) => (
                    <div
                      key={d.date}
                      className="panel rounded-lg p-4 text-center"
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
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground italic">
          Værdata fra MET.no. Live målinger fra Netatmo via Homey.
        </p>
      </section>
    </PageShell>
  );
}

function LiveMetric({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: number | null;
  unit: string;
  icon: string;
}) {
  return (
    <article className="panel rounded-lg p-5 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="text-display text-primary text-3xl mt-2">
        {value !== null ? value.toFixed(1) : "—"}
      </div>
      <div className="text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase mt-1">
        {unit}
      </div>
    </article>
  );
}

function hasCap(d: DeviceLike | null | undefined, cap: string): boolean {
  return typeof d?.capabilities?.[cap]?.value === "number";
}

function readCap(d: DeviceLike | null | undefined, cap: string): number | null {
  const v = d?.capabilities?.[cap]?.value;
  return typeof v === "number" ? v : null;
}

function parseForecast(data: any): ForecastDay[] {
  const series = data?.properties?.timeseries ?? [];
  const map = new Map<string, ForecastDay>();
  for (const entry of series) {
    const date = entry.time.slice(0, 10);
    const inst = entry.data?.instant?.details ?? {};
    const next6 = entry.data?.next_6_hours;
    const next1 = entry.data?.next_1_hours;
    const temp = inst.air_temperature;
    if (typeof temp !== "number") continue;
    const symbol = next6?.summary?.symbol_code ?? next1?.summary?.symbol_code ?? null;
    const precip = next6?.details?.precipitation_amount ?? next1?.details?.precipitation_amount ?? 0;
    const existing = map.get(date);
    if (!existing) {
      map.set(date, { date, tempMin: temp, tempMax: temp, symbol, precip });
    } else {
      existing.tempMin = Math.min(existing.tempMin, temp);
      existing.tempMax = Math.max(existing.tempMax, temp);
      existing.precip += precip;
      const hour = parseInt(entry.time.slice(11, 13));
      if (hour >= 11 && hour <= 14 && symbol) existing.symbol = symbol;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
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
