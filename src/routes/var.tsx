import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import heroImg from "@/assets/hero-westeros.jpg";

export const Route = createFileRoute("/var")({
  head: () => ({
    meta: [
      { title: "Værens budskap — Vær & Pollen | House Riis" },
      { name: "description", content: "Værmelding og pollenvarsel for Skien." },
      { property: "og:title", content: "Værens budskap | House Riis" },
      { property: "og:description", content: "Sjusiffret værmelding og pollenestimat for Skien." },
    ],
  }),
  component: WeatherPage,
});

// Lokasjoner
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
  }, []);

  const pollen = pollenForToday();

  return (
    <PageShell>
      <PageHero
        eyebrow="Skien & Numedal · Norge"
        title="Værens budskap"
        subtitle="Ravnen kommer fra MET.no med varsler om vind, snø og pollen."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-12 space-y-12">
        <div>
          <div className="ornate-divider mb-6">
            <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
              Pollenvarsel
            </span>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {pollen.map((p) => (
              <div key={p.name} className="panel rounded-lg p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg text-foreground">{p.name}</h3>
                  <span
                    className="text-xs uppercase tracking-wider px-2 py-0.5 rounded border"
                    style={{ borderColor: p.color, color: p.color }}
                  >
                    {p.level}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{p.note}</p>
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${p.intensity}%`, backgroundColor: p.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground italic">
            Estimat basert på sesong (NAAF). For sanntidsvarsel se naaf.no.
          </p>
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
          Data fra MET.no (Meteorologisk institutt).
        </p>
      </section>
    </PageShell>
  );
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

type Pollen = {
  name: string;
  level: string;
  intensity: number;
  color: string;
  note: string;
};

// Approx seasonal pollen for Sør-Norge / Skien (NAAF veiledning)
function pollenForToday(): Pollen[] {
  const month = new Date().getMonth() + 1; // 1-12
  const items = [
    {
      name: "Or",
      ...rate(month, [
        { months: [2, 3], level: "Høy", intensity: 80 },
        { months: [1, 4], level: "Lav", intensity: 25 },
      ]),
      note: "Or blomstrer tidlig vår.",
    },
    {
      name: "Hassel",
      ...rate(month, [
        { months: [2, 3], level: "Moderat", intensity: 55 },
        { months: [1, 4], level: "Lav", intensity: 20 },
      ]),
      note: "Hassel kommer ofte sammen med or.",
    },
    {
      name: "Bjørk",
      ...rate(month, [
        { months: [4, 5], level: "Høy", intensity: 90 },
        { months: [6], level: "Moderat", intensity: 40 },
      ]),
      note: "Den vanligste pollenallergien i Norge.",
    },
    {
      name: "Gress",
      ...rate(month, [
        { months: [6, 7], level: "Høy", intensity: 85 },
        { months: [5, 8], level: "Moderat", intensity: 50 },
      ]),
      note: "Toppsesong midtsommer.",
    },
    {
      name: "Burot",
      ...rate(month, [
        { months: [7, 8], level: "Moderat", intensity: 60 },
        { months: [9], level: "Lav", intensity: 25 },
      ]),
      note: "Sensommer-allergen.",
    },
    {
      name: "Salix",
      ...rate(month, [
        { months: [4, 5], level: "Moderat", intensity: 50 },
      ]),
      note: "Selje/vier om våren.",
    },
  ];
  return items;
}

function rate(
  month: number,
  rules: { months: number[]; level: string; intensity: number }[],
): { level: string; intensity: number; color: string } {
  for (const r of rules) {
    if (r.months.includes(month)) {
      return { level: r.level, intensity: r.intensity, color: levelColor(r.level) };
    }
  }
  return { level: "Ingen", intensity: 5, color: "oklch(0.55 0.04 240)" };
}

function levelColor(level: string) {
  switch (level) {
    case "Høy":
      return "oklch(0.65 0.20 25)";
    case "Moderat":
      return "oklch(0.78 0.15 70)";
    case "Lav":
      return "oklch(0.72 0.15 140)";
    default:
      return "oklch(0.55 0.04 240)";
  }
}
