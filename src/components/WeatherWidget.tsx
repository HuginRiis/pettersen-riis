import { useEffect, useState } from "react";
import { useWindUnit, formatWind } from "@/hooks/use-wind-unit";


type Props = {
  title: string;
  subtitle: string;
  lat: number;
  lon: number;
  mode: "tomorrow" | "weekend";
};

type Slot = {
  time: string;
  temp: number;
  symbol: string | null;
  precip: number;
  wind: number;
};

type DaySummary = {
  date: string;
  tempMin: number;
  tempMax: number;
  symbol: string | null;
  precip: number;
  slots: Slot[];
};

export function WeatherWidget({ title, subtitle, lat, lon, mode }: Props) {
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("Kunne ikke hente værmelding");
        const data = await res.json();
        const all = parseDays(data);
        const targets = mode === "tomorrow" ? pickTomorrow(all) : pickWeekend(all);
        setDays(targets);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ukjent feil");
      } finally {
        setLoading(false);
      }
    })();
  }, [lat, lon, mode]);

  return (
    <article className="panel rounded-lg p-6 glow-on-hover">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xl text-primary">{title}</h3>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          MET.no
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>

      <div className="mt-4">
        {loading && (
          <p className="text-sm text-muted-foreground italic">Sender ravn...</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {days && days.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Ingen data tilgjengelig.
          </p>
        )}
        {days && days.length > 0 && (
          <div className="space-y-3">
            {days.map((d) => (
              <DayRow key={d.date} day={d} compact={mode === "weekend"} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function DayRow({ day, compact }: { day: DaySummary; compact: boolean }) {
  void compact; // alltid detaljert nå — vi viser timeslot + sammendrag for begge modus
  const avgWind =
    day.slots.length > 0
      ? day.slots.reduce((s, x) => s + x.wind, 0) / day.slots.length
      : 0;
  const maxWind = day.slots.reduce((m, x) => Math.max(m, x.wind), 0);
  return (
    <div className="border border-border rounded-md p-3 bg-background/40">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-medieval text-lg text-primary leading-none">
            {weekday(day.date)}
          </div>
          <div className="text-[11px] text-muted-foreground tracking-wider uppercase">
            {dayMonth(day.date)}
          </div>
        </div>
        <div className="text-3xl">{symbolEmoji(day.symbol)}</div>
        <div className="text-right">
          <div className="text-foreground font-semibold">
            {Math.round(day.tempMax)}°
          </div>
          <div className="text-xs text-muted-foreground">
            min {Math.round(day.tempMin)}°
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mb-2">
        <span title="Total nedbør">💧 {day.precip.toFixed(1)} mm</span>
        <span title="Snittvind">🌬 {avgWind.toFixed(1)} m/s</span>
        {maxWind > avgWind + 1 && (
          <span title="Maks vindkast">↑ {maxWind.toFixed(1)} m/s</span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1 text-center">
        {pickHourSlots(day.slots).map((s) => (
          <div key={s.time} className="bg-card/60 rounded p-1.5">
            <div className="text-[10px] text-muted-foreground">
              {s.time.slice(11, 13)}:00
            </div>
            <div className="text-base">{symbolEmoji(s.symbol)}</div>
            <div className="text-xs text-foreground">
              {Math.round(s.temp)}°
            </div>
            <div className="text-[9px] text-muted-foreground/80 mt-0.5">
              🌬 {Math.round(s.wind)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pickHourSlots(slots: Slot[]): Slot[] {
  const targets = [6, 12, 18, 22];
  return targets
    .map((h) =>
      slots.reduce<Slot | null>((best, s) => {
        const sh = parseInt(s.time.slice(11, 13));
        if (best === null) return s;
        const bh = parseInt(best.time.slice(11, 13));
        return Math.abs(sh - h) < Math.abs(bh - h) ? s : best;
      }, null),
    )
    .filter((s): s is Slot => s !== null);
}

function parseDays(data: any): DaySummary[] {
  const series = data?.properties?.timeseries ?? [];
  const map = new Map<string, DaySummary>();
  for (const entry of series) {
    const time: string = entry.time;
    const date = time.slice(0, 10);
    const inst = entry.data?.instant?.details ?? {};
    const next6 = entry.data?.next_6_hours;
    const next1 = entry.data?.next_1_hours;
    const temp = inst.air_temperature;
    const wind = inst.wind_speed ?? 0;
    if (typeof temp !== "number") continue;
    const symbol =
      next1?.summary?.symbol_code ?? next6?.summary?.symbol_code ?? null;
    const precip =
      next1?.details?.precipitation_amount ??
      next6?.details?.precipitation_amount ??
      0;
    const slot: Slot = { time, temp, symbol, precip, wind };
    const existing = map.get(date);
    if (!existing) {
      map.set(date, {
        date,
        tempMin: temp,
        tempMax: temp,
        symbol,
        precip,
        slots: [slot],
      });
    } else {
      existing.tempMin = Math.min(existing.tempMin, temp);
      existing.tempMax = Math.max(existing.tempMax, temp);
      existing.precip += precip;
      const hour = parseInt(time.slice(11, 13));
      if (hour >= 11 && hour <= 14 && symbol) existing.symbol = symbol;
      existing.slots.push(slot);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function pickTomorrow(days: DaySummary[]): DaySummary[] {
  // Picks tomorrow + day after tomorrow (2 days forward).
  const targets: string[] = [];
  for (let i = 1; i <= 2; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    targets.push(d.toISOString().slice(0, 10));
  }
  return days.filter((d) => targets.includes(d.date));
}

function pickWeekend(days: DaySummary[]): DaySummary[] {
  // Find upcoming Friday, Saturday and Sunday from today.
  // If today is Fri/Sat/Sun, include the remaining days of this weekend.
  const today = new Date();
  const dow = today.getDay(); // 0 sun, 1 mon ... 5 fri, 6 sat
  let friOffset: number;
  if (dow === 0) friOffset = 5; // Sunday → next Friday
  else if (dow <= 5) friOffset = 5 - dow; // Mon-Fri → coming Friday
  else friOffset = -1; // Saturday → Friday was yesterday
  const fri = new Date(today);
  fri.setDate(fri.getDate() + friOffset);
  const sat = new Date(fri);
  sat.setDate(sat.getDate() + 1);
  const sun = new Date(fri);
  sun.setDate(sun.getDate() + 2);
  const targets = [
    fri.toISOString().slice(0, 10),
    sat.toISOString().slice(0, 10),
    sun.toISOString().slice(0, 10),
  ];
  return days.filter((d) => targets.includes(d.date));
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

function weekday(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
    weekday: "long",
  });
}
function dayMonth(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
  });
}
