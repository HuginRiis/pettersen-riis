import { useEffect, useMemo, useState } from "react";

type Hour = {
  time: string;
  temp: number;
  precip: number;
  wind: number;
  symbol: string | null;
  thunderProb: number;
};

type Day = {
  date: string;
  thunderProb: number;
  tempMin: number;
  tempMax: number;
  precip: number;
  symbol: string | null;
  hours: Hour[];
};

type TabKey = "today" | "tomorrow" | "weekend";

type Props = {
  label: string;
  lat: number;
  lon: number;
};

/**
 * Stor, "fancy" værflis kun for iPhone-app. Animert bakgrunn som matcher
 * været (sol, skyer, regn, snø, torden, natt) og faner for I dag / I morgen /
 * Kommende helg. Henter MET.no compact direkte (cachet av nettleseren).
 */
export function FancyWeatherTile({ label, lat, lon }: Props) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("today");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error("Kunne ikke hente værmelding");
        const data = await res.json();
        if (cancelled) return;
        setDays(parse(data));
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Ukjent feil");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  const active = useMemo(() => pickActive(days ?? [], tab), [days, tab]);

  const symbol = active?.symbol ?? null;
  const isNight = isNightNow(symbol);
  const mood = symbolMood(symbol);

  // Gjennomsnittlig vind for valgt periode → styrer skyfart
  const avgWind = useMemo(() => {
    if (!active?.hours?.length) return 3;
    const s = active.hours.reduce((a, h) => a + (h.wind || 0), 0);
    return s / active.hours.length;
  }, [active]);
  // Kartlegg vind (m/s) til hastighetsmultiplikator (1 = normal, 3 = veldig fort)
  const windMult = Math.min(4, Math.max(0.5, 1 + avgWind / 6));

  const tileStyle = { ["--wx-wind" as any]: windMult } as React.CSSProperties;

  return (
    <div
      className={`fancy-wx fancy-wx--${mood} ${isNight ? "fancy-wx--night" : "fancy-wx--day"}`}
      style={tileStyle}
    >
      <div className="fancy-wx__bg">
        {/* lag — kjøres alltid, CSS skjuler etter mood */}
        <div className="fancy-wx__sky" />
        <div className="fancy-wx__sun" />
        <div className="fancy-wx__moon" />
        <div className="fancy-wx__stars" />
        <div className="fancy-wx__cloud fancy-wx__cloud--a" />
        <div className="fancy-wx__cloud fancy-wx__cloud--b" />
        <div className="fancy-wx__cloud fancy-wx__cloud--c" />
        {(mood === "rain" || mood === "sleet") && (
          <>
            <RainLayer drops={22} />
            <SplashLayer count={10} />
          </>
        )}
        {mood === "snow" && <SnowLayer flakes={26} />}
        {mood === "thunder" && (
          <>
            <RainLayer drops={22} />
            <SplashLayer count={10} />
            <div className="fancy-wx__bolt" />
            <BoltShape />
          </>
        )}
        {mood === "fog" && <div className="fancy-wx__fog" />}
      </div>

      <div className="fancy-wx__content">
        <div className="fancy-wx__top">
          <div>
            <div className="fancy-wx__place">{label}</div>
          </div>
          <div className="fancy-wx__tabs">
            {(
              [
                { k: "today", t: "I dag" },
                { k: "tomorrow", t: "I morgen" },
                { k: "weekend", t: "Helg" },
              ] as const
            ).map((o) => (
              <button
                key={o.k}
                onClick={() => setTab(o.k)}
                className={`fancy-wx__tab ${tab === o.k ? "is-active" : ""}`}
              >
                {o.t}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="fancy-wx__error">{error}</div>}

        {active ? (
          <div className="fancy-wx__main">
            <div className="fancy-wx__emoji">{symbolEmoji(symbol)}</div>
            <div className="fancy-wx__big">
              <div className="fancy-wx__temp">
                {Math.round(active.tempMax)}°
                <span className="fancy-wx__tempmin">
                  / {Math.round(active.tempMin)}°
                </span>
              </div>
              <div className="fancy-wx__desc">
                {symbolText(symbol)}
                {active.precip > 0.1 && (
                  <span> · {active.precip.toFixed(1)} mm</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="fancy-wx__loading">Henter vær…</div>
        )}
      </div>
    </div>
  );
}

function SplashLayer({ count }: { count: number }) {
  return (
    <div className="fancy-wx__splashes">
      {Array.from({ length: count }).map((_, i) => {
        const left = (i / count) * 100 + Math.random() * 4;
        const delay = Math.random() * 1.4;
        const dur = 0.9 + Math.random() * 0.6;
        return (
          <span
            key={i}
            className="fancy-wx__splash"
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function BoltShape() {
  return (
    <svg className="fancy-wx__boltShape" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <polygon
        points="55,0 20,110 45,110 30,200 80,80 55,80 75,0"
        fill="#fffbe0"
      />
    </svg>
  );
}

function RainLayer({ drops }: { drops: number }) {
  return (
    <div className="fancy-wx__rain">
      {Array.from({ length: drops }).map((_, i) => {
        const left = (i / drops) * 100 + Math.random() * 2;
        const delay = Math.random() * 1.2;
        const dur = 0.65 + Math.random() * 0.5;
        return (
          <span
            key={i}
            className="fancy-wx__drop"
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function SnowLayer({ flakes }: { flakes: number }) {
  return (
    <div className="fancy-wx__snow">
      {Array.from({ length: flakes }).map((_, i) => {
        const left = (i / flakes) * 100 + Math.random() * 2;
        const delay = Math.random() * 4;
        const dur = 5 + Math.random() * 5;
        const size = 4 + Math.random() * 6;
        return (
          <span
            key={i}
            className="fancy-wx__flake"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function parse(data: any): Day[] {
  const series: any[] = data?.properties?.timeseries ?? [];
  const map = new Map<string, Day>();
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
    const thunderProb =
      next1?.details?.probability_of_thunder ??
      next6?.details?.probability_of_thunder ??
      0;
    const date = time.slice(0, 10);
    const hour: Hour = { time, temp, precip, wind, symbol, thunderProb };
    const existing = map.get(date);
    if (!existing) {
      map.set(date, {
        date,
        thunderProb,
        tempMin: temp,
        tempMax: temp,
        precip,
        symbol,
        hours: [hour],
      });
    } else {
      existing.tempMin = Math.min(existing.tempMin, temp);
      existing.tempMax = Math.max(existing.tempMax, temp);
      existing.precip += precip;
      existing.thunderProb = Math.max(existing.thunderProb, thunderProb);
      const h = parseInt(time.slice(11, 13));
      if (h >= 11 && h <= 14 && symbol) existing.symbol = symbol;
      existing.hours.push(hour);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function pickActive(days: Day[], tab: TabKey): Day | null {
  if (!days.length) return null;
  if (tab === "today") return days[0];
  if (tab === "tomorrow") return days[1] ?? days[0];
  // weekend: find next saturday + sunday and merge
  const sat = days.find((d) => new Date(d.date + "T12:00").getDay() === 6);
  const sun = days.find((d) => new Date(d.date + "T12:00").getDay() === 0);
  const picks = [sat, sun].filter(Boolean) as Day[];
  if (!picks.length) return days[days.length - 1];
  const hours = picks.flatMap((d) => d.hours);
  return {
    date: picks[0].date,
    thunderProb: Math.max(...picks.map((d) => d.thunderProb)),
    tempMin: Math.min(...picks.map((d) => d.tempMin)),
    tempMax: Math.max(...picks.map((d) => d.tempMax)),
    precip: picks.reduce((s, d) => s + d.precip, 0),
    symbol: picks[0].symbol,
    hours,
  };
}

function pickHours(hours: Hour[]): Hour[] {
  // ~6 representative points
  if (hours.length <= 6) return hours;
  const step = Math.max(1, Math.floor(hours.length / 6));
  const out: Hour[] = [];
  for (let i = 0; i < hours.length && out.length < 6; i += step) out.push(hours[i]);
  return out;
}

function weekdayHour(iso: string) {
  const d = new Date(iso);
  const wd = d.toLocaleDateString("nb-NO", { weekday: "short" });
  return `${wd.slice(0, 2)} ${iso.slice(11, 13)}`;
}

function symbolEmoji(s: string | null): string {
  if (!s) return "—";
  if (s.includes("thunder")) return "⛈";
  if (s.includes("snow")) return "❄️";
  if (s.includes("sleet")) return "🌨";
  if (s.includes("rain")) return "🌧";
  if (s.includes("fog")) return "🌫";
  if (s.includes("clearsky")) return s.includes("_night") ? "🌙" : "☀️";
  if (s.includes("fair")) return s.includes("_night") ? "🌙" : "🌤";
  if (s.includes("partlycloudy")) return "⛅";
  if (s.includes("cloudy")) return "☁️";
  return "🌥";
}

function symbolText(s: string | null): string {
  if (!s) return "—";
  if (s.includes("thunder")) return "Torden";
  if (s.includes("snow")) return "Snø";
  if (s.includes("sleet")) return "Sludd";
  if (s.includes("rain")) return "Regn";
  if (s.includes("fog")) return "Tåke";
  if (s.includes("clearsky")) return "Klart";
  if (s.includes("fair")) return "Lettskyet";
  if (s.includes("partlycloudy")) return "Delvis skyet";
  if (s.includes("cloudy")) return "Skyet";
  return "Vekslende";
}

function symbolMood(
  s: string | null,
): "clear" | "fair" | "cloudy" | "rain" | "snow" | "sleet" | "thunder" | "fog" {
  if (!s) return "fair";
  if (s.includes("thunder")) return "thunder";
  if (s.includes("snow")) return "snow";
  if (s.includes("sleet")) return "sleet";
  if (s.includes("rain")) return "rain";
  if (s.includes("fog")) return "fog";
  if (s.includes("clearsky")) return "clear";
  if (s.includes("fair")) return "fair";
  return "cloudy";
}

function isNightNow(s: string | null): boolean {
  if (s && s.includes("_night")) return true;
  const h = new Date().getHours();
  return h < 6 || h >= 21;
}
