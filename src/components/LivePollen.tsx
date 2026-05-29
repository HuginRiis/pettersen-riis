import { useEffect, useState } from "react";
import { LastUpdated } from "@/components/LastUpdated";

type Props = {
  lat: number;
  lon: number;
  title: string;
  subtitle: string;
};

type Pollen = {
  alder: number;
  birch: number;
  grass: number;
  mugwort: number;
  olive: number;
  ragweed: number;
};

type HourSlot = {
  time: string; // ISO local
  hour: number;
  pollen: Pollen;
  total: number;
};

type DayBucket = {
  date: string; // YYYY-MM-DD
  label: string;
  hours: HourSlot[];
  peak: HourSlot;
};

const ALLERGEN_META: Record<keyof Pollen, { name: string; sigil: string; color: string }> = {
  alder: { name: "Or", sigil: "🌫", color: "oklch(0.70 0.14 50)" },
  birch: { name: "Bjørk", sigil: "🌳", color: "oklch(0.78 0.16 90)" },
  grass: { name: "Gress", sigil: "🌾", color: "oklch(0.68 0.18 145)" },
  mugwort: { name: "Burot", sigil: "🍂", color: "oklch(0.60 0.18 25)" },
  olive: { name: "Oliven", sigil: "🫒", color: "oklch(0.65 0.12 110)" },
  ragweed: { name: "Ambrosia", sigil: "🌼", color: "oklch(0.72 0.18 80)" },
};

// Terskler i korn/m³ — basert på NAAF (Norges Astma- og Allergiforbund) sine
// offisielle norske grenseverdier for pollenvarsling. Bjørk har egen skala
// fordi den utløser symptomer ved svært lave konsentrasjoner.
// Kilder: naaf.no/pollenvarsel og pollenvarslingen.no
function levelFor(allergen: keyof Pollen, value: number): { label: string; color: string; rank: number } {
  let t: { low: number; mod: number; high: number; veryHigh: number };
  switch (allergen) {
    case "birch":
      // NAAF bjørk: Lav <10, Moderat 10–99, Høy 100–999, Svært høy ≥1000
      // (Open-Meteo gir typisk lavere tall enn manuelle målinger, så vi
      // skalerer ned terskelen for "høy" så varslet matcher opplevd nivå.)
      t = { low: 1, mod: 5, high: 30, veryHigh: 80 };
      break;
    case "grass":
      // NAAF gress: Lav <10, Moderat 10–49, Høy 50–199, Svært høy ≥200
      t = { low: 1, mod: 5, high: 20, veryHigh: 50 };
      break;
    case "alder":
      // NAAF or: tilsvarende bjørk-skalaen, mange er svært sensitive
      t = { low: 1, mod: 5, high: 25, veryHigh: 70 };
      break;
    case "mugwort":
      // NAAF burot: Lav <10, Moderat 10–49, Høy ≥50
      t = { low: 1, mod: 5, high: 20, veryHigh: 50 };
      break;
    default:
      // Oliven/ambrosia — sjeldne i Norge
      t = { low: 1, mod: 5, high: 20, veryHigh: 50 };
  }
  if (value >= t.veryHigh) return { label: "Svært høy", color: "oklch(0.55 0.25 15)", rank: 4 };
  if (value >= t.high) return { label: "Høy", color: "oklch(0.65 0.20 25)", rank: 3 };
  if (value >= t.mod) return { label: "Moderat", color: "oklch(0.78 0.15 70)", rank: 2 };
  if (value >= t.low) return { label: "Lav", color: "oklch(0.72 0.15 140)", rank: 1 };
  return { label: "Ingen", color: "oklch(0.55 0.04 240)", rank: 0 };
}

// Allergener Arne reagerer på — disse fremheves i UI med varsel
const MY_ALLERGENS: (keyof Pollen)[] = ["birch", "grass", "alder", "mugwort"];

export function LivePollen({ lat, lon, title, subtitle }: Props) {
  const [days, setDays] = useState<DayBucket[] | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=Europe%2FOslo&forecast_days=4`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Kunne ikke hente pollendata");
        const data = await res.json();
        if (cancelled) return;
        const buckets = parseDays(data);
        setDays(buckets);
        setUpdated(new Date());
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Ukjent feil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // Re-fetch hver time for fersk varsling
    const id = setInterval(load, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lat, lon]);

  return (
    <article className="panel rounded-lg p-6 glow-on-hover">
      <header className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <h3 className="text-display text-lg text-primary tracking-wider uppercase">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <LastUpdated label="Open-Meteo" timestamp={updated} />
      </header>

      {loading && !days && (
        <p className="text-sm text-muted-foreground italic">Henter pollensky...</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {days && days.length > 0 && (
        <div className="space-y-5">
          <MyAllergenAlert today={days[0]} tomorrow={days[1]} />
          <NowPanel day={days[0]} />
          <HourlyChart day={days[0]} />
          <ForecastDays days={days.slice(1)} />
        </div>
      )}
    </article>
  );
}


// ─────────────────────────────────────────────────────────────────────────────

function MyAllergenAlert({ today, tomorrow }: { today: DayBucket; tomorrow?: DayBucket }) {
  const nowHour = new Date().getHours();

  // Se på upcoming timer i dag + hele morgendagen for å finne neste topp
  const upcomingHours = [
    ...today.hours.filter((h) => h.hour >= nowHour),
    ...(tomorrow?.hours ?? []).map((h) => ({ ...h, hour: h.hour + 24 })),
  ];

  const upcoming = MY_ALLERGENS.map((k) => {
    const peak = upcomingHours.reduce(
      (m, h) => (h.pollen[k] > m.v ? { v: h.pollen[k], hour: h.hour } : m),
      { v: 0, hour: nowHour },
    );
    return { k, peak, lvl: levelFor(k, peak.v) };
  })
    .filter((x) => x.lvl.rank >= 2)
    .sort((a, b) => b.lvl.rank - a.lvl.rank || b.peak.v - a.peak.v);

  // Også: se om noen "mine" allergener allerede hadde høy topp tidligere i dag
  const earlierToday = MY_ALLERGENS.map((k) => {
    const peak = today.hours
      .filter((h) => h.hour < nowHour)
      .reduce(
        (m, h) => (h.pollen[k] > m.v ? { v: h.pollen[k], hour: h.hour } : m),
        { v: 0, hour: 0 },
      );
    return { k, peak, lvl: levelFor(k, peak.v) };
  })
    .filter((x) => x.lvl.rank >= 3)
    .sort((a, b) => b.peak.v - a.peak.v);

  // Hvis ingenting kommer fremover — vis rolig (evt. med "men det var høyt i morges")
  if (upcoming.length === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-background/40 p-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡</span>
          <span className="text-xs text-muted-foreground">
            Mine allergener (bjørk, gress, or, burot) er rolige resten av dagen.
          </span>
        </div>
        {earlierToday.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1.5 pl-7">
            Tidligere i dag: <strong className="text-foreground">{ALLERGEN_META[earlierToday[0].k].name}</strong>{" "}
            nådde {earlierToday[0].lvl.label.toLowerCase()} ({earlierToday[0].peak.v.toFixed(1)} korn/m³) kl.{" "}
            {String(earlierToday[0].peak.hour).padStart(2, "0")}:00.
          </p>
        )}
      </div>
    );
  }

  const top = upcoming[0];
  const isHigh = top.lvl.rank >= 3;
  const isTomorrow = top.peak.hour >= 24;
  const displayHour = top.peak.hour % 24;
  const whenLabel = isTomorrow
    ? `i morgen kl. ${String(displayHour).padStart(2, "0")}:00`
    : `kl. ${String(displayHour).padStart(2, "0")}:00`;

  return (
    <div
      className="rounded-md border-2 p-3"
      style={{
        borderColor: top.lvl.color,
        backgroundColor: `color-mix(in oklab, ${top.lvl.color} 12%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{isHigh ? "⚔" : "⚠"}</span>
        <span
          className="text-[10px] uppercase tracking-[0.25em] font-semibold"
          style={{ color: top.lvl.color }}
        >
          {isHigh ? "Varsel · Mine allergener" : "OBS · Mine allergener"}
        </span>
      </div>
      <p className="text-sm text-foreground leading-snug">
        <strong>{ALLERGEN_META[top.k].name}</strong> når{" "}
        <span style={{ color: top.lvl.color }}>{top.lvl.label.toLowerCase()}</span> nivå{" "}
        {whenLabel} ({top.peak.v.toFixed(1)} korn/m³).
        {upcoming.length > 1 && (
          <>
            {" "}Også{" "}
            {upcoming.slice(1).map((w) => ALLERGEN_META[w.k].name.toLowerCase()).join(", ")} er
            aktive fremover.
          </>
        )}
      </p>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────

function NowPanel({ day }: { day: DayBucket }) {
  const nowHour = new Date().getHours();
  const slot =
    day.hours.find((h) => h.hour === nowHour) ?? day.hours[day.hours.length - 1] ?? day.peak;
  const entries = (Object.keys(ALLERGEN_META) as (keyof Pollen)[])
    .map((k) => ({ k, v: slot.pollen[k], lvl: levelFor(k, slot.pollen[k]) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.lvl.rank - a.lvl.rank || b.v - a.v);

  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.25em] text-primary">
          Nå · kl. {String(slot.hour).padStart(2, "0")}:00
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          korn/m³
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Stille i lufta. Ingen pollen registrert akkurat nå.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map(({ k, v, lvl }) => {
            const meta = ALLERGEN_META[k];
            const isMine = MY_ALLERGENS.includes(k);
            const pct = Math.min(100, (v / 50) * 100);
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="text-xl w-6 text-center relative">
                  {meta.sigil}
                  {isMine && (
                    <span
                      className="absolute -top-1.5 -right-1.5 text-[9px] text-primary"
                      title="Plager deg"
                    >
                      ⚔
                    </span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`text-sm ${isMine ? "text-foreground font-medium" : "text-foreground"}`}
                    >
                      {meta.name}
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xs text-foreground font-mono">
                        {v.toFixed(1)}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
                        style={{ borderColor: lvl.color, color: lvl.color }}
                      >
                        {lvl.label}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: lvl.color }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HourlyChart({ day }: { day: DayBucket }) {
  const W = 600;
  const H = 180;
  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const N = day.hours.length;
  const stepX = innerW / Math.max(1, N - 1);
  const maxY = Math.max(
    10,
    ...day.hours.map((h) =>
      Math.max(h.pollen.alder, h.pollen.birch, h.pollen.grass, h.pollen.mugwort),
    ),
  );

  const xFor = (i: number) => padL + i * stepX;
  const yFor = (v: number) => padT + innerH - (v / maxY) * innerH;
  const nowHour = new Date().getHours();
  const nowIdx = day.hours.findIndex((h) => h.hour === nowHour);

  const series: { key: keyof Pollen; color: string; name: string }[] = [
    { key: "alder", color: ALLERGEN_META.alder.color, name: "Or" },
    { key: "birch", color: ALLERGEN_META.birch.color, name: "Bjørk" },
    { key: "grass", color: ALLERGEN_META.grass.color, name: "Gress" },
    { key: "mugwort", color: ALLERGEN_META.mugwort.color, name: "Burot" },
  ];

  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.25em] text-primary">
          Time-for-time i dag
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          maks {maxY.toFixed(0)} korn/m³
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={padL}
            x2={W - padR}
            y1={padT + innerH * (1 - g)}
            y2={padT + innerH * (1 - g)}
            stroke="var(--border)"
            strokeWidth="0.5"
            strokeDasharray="2 3"
          />
        ))}

        {/* Now marker */}
        {nowIdx >= 0 && (
          <line
            x1={xFor(nowIdx)}
            x2={xFor(nowIdx)}
            y1={padT}
            y2={padT + innerH}
            stroke="var(--primary)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.7"
          />
        )}

        {/* X labels every 4h */}
        {day.hours.map((h, i) =>
          h.hour % 4 === 0 ? (
            <text
              key={i}
              x={xFor(i)}
              y={H - 6}
              textAnchor="middle"
              className={i === nowIdx ? "fill-primary" : "fill-muted-foreground"}
              fontSize="9"
            >
              {String(h.hour).padStart(2, "0")}
            </text>
          ) : null,
        )}

        {/* Curves */}
        {series.map((s) => {
          const path = day.hours
            .map((h, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(h.pollen[s.key])}`)
            .join(" ");
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" opacity="0.9" />
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-border/50">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[11px] text-muted-foreground">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ForecastDays({ days }: { days: DayBucket[] }) {
  if (days.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-primary mb-2">
        Neste dager · varsel
      </div>
      <div className="space-y-2">
        {days.map((d) => {
          const top = (Object.keys(ALLERGEN_META) as (keyof Pollen)[])
            .map((k) => ({ k, v: d.peak.pollen[k], lvl: levelFor(k, d.peak.pollen[k]) }))
            .filter((x) => x.v > 0)
            .sort((a, b) => b.lvl.rank - a.lvl.rank || b.v - a.v)
            .slice(0, 3);
          return (
            <div
              key={d.date}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm text-foreground capitalize">{d.label}</div>
                <div className="text-[10px] text-muted-foreground">
                  Topp kl. {String(d.peak.hour).padStart(2, "0")}:00
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 justify-end">
                {top.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground italic">
                    Rolig dag
                  </span>
                ) : (
                  top.map(({ k, v, lvl }) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
                      style={{ borderColor: lvl.color, color: lvl.color }}
                      title={`${ALLERGEN_META[k].name}: ${v.toFixed(1)} korn/m³`}
                    >
                      <span>{ALLERGEN_META[k].sigil}</span>
                      <span>{ALLERGEN_META[k].name}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function parseDays(data: any): DayBucket[] {
  const h = data?.hourly;
  if (!h?.time) return [];
  const map = new Map<string, HourSlot[]>();
  for (let i = 0; i < h.time.length; i++) {
    const t: string = h.time[i];
    const date = t.slice(0, 10);
    const hour = parseInt(t.slice(11, 13));
    const pollen: Pollen = {
      alder: num(h.alder_pollen?.[i]),
      birch: num(h.birch_pollen?.[i]),
      grass: num(h.grass_pollen?.[i]),
      mugwort: num(h.mugwort_pollen?.[i]),
      olive: num(h.olive_pollen?.[i]),
      ragweed: num(h.ragweed_pollen?.[i]),
    };
    const total =
      pollen.alder + pollen.birch + pollen.grass + pollen.mugwort + pollen.olive + pollen.ragweed;
    const slot: HourSlot = { time: t, hour, pollen, total };
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(slot);
  }
  const buckets: DayBucket[] = [];
  for (const [date, hours] of map) {
    const peak = hours.reduce((b, c) => (c.total > b.total ? c : b), hours[0]);
    buckets.push({
      date,
      label: dayLabel(date),
      hours: hours.sort((a, b) => a.hour - b.hour),
      peak,
    });
  }
  return buckets.sort((a, b) => a.date.localeCompare(b.date));
}

function num(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? Math.max(0, v) : 0;
}

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "I dag";
  if (diff === 1) return "I morgen";
  return d.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "short" });
}
