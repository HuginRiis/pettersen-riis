import { useEffect, useState } from "react";

type Hour = {
  time: string;
  temp: number;
  precip: number;
  wind: number;
  symbol: string | null;
};

type Day = {
  date: string;
  tempMin: number;
  tempMax: number;
  precip: number;
  symbol: string | null;
};

type Props = {
  label: string;
  lat: number;
  lon: number;
};

/**
 * Kompakt værpanel for et valgfritt sted (Kartverket-koordinat). Henter MET.no
 * og viser nå-status, 24 timer og 7 dager. Tegner inn i panel-stil.
 */
export function DynamicForecastPanel({ label, lat, lon }: Props) {
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("Kunne ikke hente værmelding");
        const data = await res.json();
        if (cancelled) return;
        const parsed = parse(data);
        setHours(parsed.hours);
        setDays(parsed.days);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ukjent feil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  const now = hours?.[0] ?? null;
  const next24 = hours?.slice(0, 24) ?? [];
  const week = days?.slice(0, 7) ?? [];

  return (
    <div className="panel rounded-lg p-5 md:p-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            Mitt sted · MET.no
          </div>
          <h3 className="text-display text-2xl text-primary tracking-wider">{label}</h3>
        </div>
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          {lat.toFixed(3)}°N · {lon.toFixed(3)}°Ø
        </div>
      </div>

      {loading && !hours && (
        <p className="text-sm text-muted-foreground italic">Sender ravn…</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {now && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <NowCard
            label="Nå"
            value={`${Math.round(now.temp)}°`}
            sub={symbolEmoji(now.symbol)}
          />
          <NowCard label="Vind" value={`${now.wind.toFixed(1)} m/s`} sub="💨" />
          <NowCard
            label="Regn 1t"
            value={`${now.precip.toFixed(1)} mm`}
            sub="🌧"
          />
          <NowCard
            label="Topp i dag"
            value={
              days?.[0] ? `${Math.round(days[0].tempMax)}°` : "—"
            }
            sub={days?.[0] ? symbolEmoji(days[0].symbol) : "—"}
          />
        </div>
      )}

      {next24.length > 0 && (
        <div className="mb-5">
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
            Neste 24 timer
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
            {next24.filter((_, i) => i % 3 === 0).map((h, i) => (
              <div
                key={`${h.time}-${i}`}
                className="bg-card/50 rounded p-1.5 text-center"
              >
                <div className="text-[9px] text-muted-foreground tracking-wider">
                  {h.time.slice(11, 13)}
                </div>
                <div className="text-base">{symbolEmoji(h.symbol)}</div>
                <div className="text-xs text-foreground">
                  {Math.round(h.temp)}°
                </div>
                <div className="text-[9px] text-muted-foreground/80 mt-0.5">
                  🌬 {Math.round(h.wind)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {week.length > 0 && (
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
            7 dager
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {week.map((d) => (
              <div
                key={d.date}
                className="rounded-md border border-border/60 bg-background/40 p-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {weekdayShort(d.date)}
                </div>
                <div className="text-medieval text-sm text-primary mt-0.5">
                  {dayMonth(d.date)}
                </div>
                <div className="text-xl my-1">{symbolEmoji(d.symbol)}</div>
                <div className="text-foreground text-sm font-semibold">
                  {Math.round(d.tempMax)}°
                </div>
                <div className="text-[10px] text-muted-foreground">
                  min {Math.round(d.tempMin)}°
                </div>
                {d.precip > 0 && (
                  <div className="text-[10px] text-ice mt-0.5">
                    {d.precip.toFixed(1)} mm
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NowCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-center">
      <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-display text-primary text-2xl mt-1">{value}</div>
      <div className="text-base mt-0.5">{sub}</div>
    </div>
  );
}

function parse(data: any): { hours: Hour[]; days: Day[] } {
  const series: any[] = data?.properties?.timeseries ?? [];
  const hours: Hour[] = [];
  const dayMap = new Map<string, Day>();
  for (const e of series) {
    const time: string = e.time;
    const inst = e.data?.instant?.details ?? {};
    const next1 = e.data?.next_1_hours;
    const next6 = e.data?.next_6_hours;
    const temp = inst.air_temperature;
    if (typeof temp !== "number") continue;
    const symbol =
      next1?.summary?.symbol_code ?? next6?.summary?.symbol_code ?? null;
    const precip =
      next1?.details?.precipitation_amount ??
      next6?.details?.precipitation_amount ??
      0;
    const wind = inst.wind_speed ?? 0;
    hours.push({ time, temp, precip, wind, symbol });

    const date = time.slice(0, 10);
    const existing = dayMap.get(date);
    if (!existing) {
      dayMap.set(date, { date, tempMin: temp, tempMax: temp, precip, symbol });
    } else {
      existing.tempMin = Math.min(existing.tempMin, temp);
      existing.tempMax = Math.max(existing.tempMax, temp);
      existing.precip += precip;
      const hour = parseInt(time.slice(11, 13));
      if (hour >= 11 && hour <= 14 && symbol) existing.symbol = symbol;
    }
  }
  return {
    hours,
    days: Array.from(dayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
  };
}

function symbolEmoji(s: string | null): string {
  if (!s) return "—";
  if (s.includes("clearsky")) return "☀️";
  if (s.includes("fair")) return "🌤";
  if (s.includes("partlycloudy")) return "⛅";
  if (s.includes("cloudy")) return "☁️";
  if (s.includes("snow")) return "❄️";
  if (s.includes("sleet")) return "🌨";
  if (s.includes("rain")) return "🌧";
  if (s.includes("thunder")) return "⛈";
  if (s.includes("fog")) return "🌫";
  return "🌥";
}

function weekdayShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
    weekday: "short",
  });
}
function dayMonth(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
  });
}
