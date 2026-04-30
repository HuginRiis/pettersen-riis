import { useUvSun, uvLevel } from "@/hooks/use-uv-sun";

type Props = {
  title: string;
  subtitle?: string;
  lat: number;
  lon: number;
  /** Antall timer å vise i grafen. Default 24. */
  rangeHours?: number;
};

/**
 * Viser UV-indeks for et sted: nå-verdi, dagens makspunkt, og en sparkline
 * for valgt antall timer (24 / 72 / 168). Henter fra MET.no.
 */
export function UvPanel({ title, subtitle, lat, lon, rangeHours = 24 }: Props) {
  const { uvNow, uvMaxToday, uvMaxTimeToday, hours: allHours, sunrise, sunset, loading, error } =
    useUvSun(lat, lon);
  const hours = allHours.slice(0, rangeHours);

  const level = uvNow != null ? uvLevel(uvNow) : null;
  const maxLevel = uvMaxToday != null ? uvLevel(uvMaxToday) : null;
  const peakHours = hours.length ? Math.max(...hours.map((h) => h.uv)) : 0;
  const chartMax = Math.max(3, Math.ceil(peakHours + 0.5));
  const rangeLabel =
    rangeHours <= 24 ? "Neste 24 timer" : rangeHours <= 72 ? "Neste 3 dager" : "Neste 7 dager";

  return (
    <article className="panel rounded-lg p-6 glow-on-hover">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            UV-indeks · MET.no
          </div>
          <h3 className="text-xl text-primary">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {level && (
          <div
            className="rounded-md px-3 py-2 text-center min-w-[88px]"
            style={{
              background: `color-mix(in oklab, ${level.color} 18%, transparent)`,
              border: `1px solid color-mix(in oklab, ${level.color} 45%, transparent)`,
            }}
          >
            <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground">
              Nå
            </div>
            <div
              className="text-display text-2xl leading-none"
              style={{ color: level.color }}
            >
              {uvNow!.toFixed(1)}
            </div>
            <div
              className="text-[10px] tracking-wider uppercase mt-0.5"
              style={{ color: level.color }}
            >
              {level.label}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground italic mt-3">Sender ravn…</p>
      )}
      {error && <p className="text-sm text-destructive mt-3">{error}</p>}

      {!loading && hours.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <MiniStat
              label="Maks i dag"
              value={uvMaxToday != null ? uvMaxToday.toFixed(1) : "—"}
              sub={
                uvMaxTimeToday
                  ? `kl. ${uvMaxTimeToday.slice(11, 13)}:00`
                  : undefined
              }
              color={maxLevel?.color}
            />
            <MiniStat
              label="Soloppgang"
              value={fmtClock(sunrise)}
              sub={sunrise ? "i dag" : undefined}
            />
            <MiniStat
              label="Solnedgang"
              value={fmtClock(sunset)}
              sub={sunset ? "i dag" : undefined}
            />
          </div>

          <div className="mt-4">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
              {rangeLabel}
            </div>
            <UvChart hours={hours} max={chartMax} showNow={rangeHours <= 24} />
          </div>
        </>
      )}
    </article>
  );
}

function MiniStat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2.5 text-center">
      <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground">
        {label}
      </div>
      <div
        className="text-display text-lg mt-0.5"
        style={color ? { color } : { color: "var(--color-primary)" }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function UvChart({ hours, max }: { hours: { time: string; uv: number }[]; max: number }) {
  const w = 100;
  const h = 36;
  const step = w / Math.max(1, hours.length - 1);
  const points = hours
    .map((p, i) => `${(i * step).toFixed(2)},${(h - (p.uv / max) * h).toFixed(2)}`)
    .join(" ");
  const areaPath = `M0,${h} L${points} L${w},${h} Z`;
  const linePath = `M${points}`;
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-20"
      >
        <defs>
          <linearGradient id="uvFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.16 55)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="oklch(0.72 0.16 150)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* threshold line at UV 3 (moderat) and 6 (høy) */}
        {[3, 6].map((t) =>
          t < max ? (
            <line
              key={t}
              x1="0"
              x2={w}
              y1={h - (t / max) * h}
              y2={h - (t / max) * h}
              stroke="oklch(0.55 0.02 250 / 0.35)"
              strokeDasharray="1 2"
              strokeWidth="0.3"
            />
          ) : null,
        )}
        <path d={areaPath} fill="url(#uvFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="oklch(0.78 0.16 55)"
          strokeWidth="0.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between text-[9px] text-muted-foreground/70 mt-1">
        {pickTicks(hours).map((t) => (
          <span key={t.time}>{t.time.slice(11, 13)}</span>
        ))}
      </div>
    </div>
  );
}

function pickTicks(hours: { time: string; uv: number }[]) {
  if (!hours.length) return [];
  const result: typeof hours = [];
  const step = Math.max(1, Math.floor(hours.length / 6));
  for (let i = 0; i < hours.length; i += step) result.push(hours[i]);
  if (result[result.length - 1]?.time !== hours[hours.length - 1].time)
    result.push(hours[hours.length - 1]);
  return result;
}

function fmtClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}
