import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getTibberWeeklyMeter,
  type TibberWeeklyMeter,
} from "@/lib/tibber.functions";
import { useTibberLive } from "@/hooks/useTibberLive";

/**
 * Analog "gammeldags" strøm-VU for Borgen / Hytta.
 *
 *  - Nålen: live watt fra Tibber Pulse (samme WSS som Strømkrøniken bruker).
 *  - Fallback: snitt forrige time fra getTibberWeeklyMeter (kWh → W).
 *  - Markører på buen: "snitt uke" og "maks i dag".
 */
export function TibberVuTile({
  location,
  title,
  subtitle,
}: {
  location: "hytta" | "tollnes";
  title: string;
  subtitle?: string;
}) {
  const fetchMeter = useServerFn(getTibberWeeklyMeter);
  const live = useTibberLive();
  const homeLive = live.homes[location];

  const [meter, setMeter] = useState<TibberWeeklyMeter | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchMeter({ data: { location } });
        if (cancelled) return;
        setMeter(res);
        setUpdated(new Date());
      } catch (e) {
        console.error("[TibberVuTile] meter", e);
      }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchMeter, location]);

  // Watt nå: foretrekk live, fall tilbake på siste time fra meteret.
  const liveW = homeLive?.reading?.power ?? null;
  const fallbackW =
    meter?.latestHourKwh != null ? meter.latestHourKwh * 1000 : null;
  const nowW = liveW != null ? liveW : fallbackW;

  // Snitt uke og maks i dag → W
  const avgW =
    meter?.weeklyAvgHourKwh != null ? meter.weeklyAvgHourKwh * 1000 : null;
  // Maks i dag: bruk live maxPower (siden midnatt) hvis tilgjengelig, ellers meterets time-maks.
  const liveMaxW = homeLive?.reading?.maxPower ?? null;
  const meterMaxW =
    meter?.todayMaxHourKwh != null ? meter.todayMaxHourKwh * 1000 : null;
  const maxTodayW =
    liveMaxW != null && meterMaxW != null
      ? Math.max(liveMaxW, meterMaxW)
      : liveMaxW ?? meterMaxW;

  const todayKwh =
    homeLive?.reading?.accumulatedConsumption != null
      ? homeLive.reading.accumulatedConsumption
      : meter?.todayKwh ?? null;

  // Skala
  const candidates = [nowW, avgW, maxTodayW, 3000].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  const scaleMaxRaw = candidates.length > 0 ? Math.max(...candidates) * 1.15 : 5000;
  // Rund opp til pen verdi (nærmeste 1000 W)
  const scaleMax = Math.max(1000, Math.ceil(scaleMaxRaw / 1000) * 1000);

  const fmtW = (v: number | null) =>
    v == null ? "—" : `${Math.round(v).toLocaleString("nb-NO")} W`;
  const fmtKwh = (v: number | null) =>
    v == null ? "—" : `${v.toFixed(1)} kWh`;

  const status = homeLive?.status ?? "idle";
  const updatedLabel = updated
    ? updated.toLocaleTimeString("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const err = meter?.error ?? homeLive?.error ?? null;

  return (
    <article className="panel rounded-lg p-2 sm:p-3 flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-display tracking-[0.3em] text-primary text-[10px] sm:text-xs uppercase">
            {title}
          </div>
          {subtitle && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xl sm:text-2xl font-semibold tabular-nums text-foreground leading-none">
            {fmtW(nowW)}
          </div>
          <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground/70 mt-0.5">
            {liveW != null ? "Live · Tibber Pulse" : "Snitt forrige time"}
          </div>
        </div>
      </div>

      <AnalogPowerMeter
        nowW={nowW}
        avgW={avgW}
        maxTodayW={maxTodayW}
        scaleMax={scaleMax}
      />

      <div className="grid grid-cols-3 gap-2 mt-1 text-center">
        <div>
          <div className="text-[8px] tracking-[0.25em] uppercase text-muted-foreground/70">
            Snitt uke
          </div>
          <div className="text-[11px] sm:text-xs font-medium tabular-nums text-foreground">
            {fmtW(avgW)}
          </div>
        </div>
        <div>
          <div className="text-[8px] tracking-[0.25em] uppercase text-primary">
            Maks i dag
          </div>
          <div className="text-[11px] sm:text-xs font-medium tabular-nums text-foreground">
            {fmtW(maxTodayW)}
          </div>
        </div>
        <div>
          <div className="text-[8px] tracking-[0.25em] uppercase text-muted-foreground/70">
            I dag
          </div>
          <div className="text-[11px] sm:text-xs font-medium tabular-nums text-foreground">
            {fmtKwh(todayKwh)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-1">
        <span
          className={`text-[8px] tracking-[0.25em] uppercase ${
            status === "live"
              ? "text-emerald-400"
              : status === "stale"
                ? "text-amber-400"
                : status === "error"
                  ? "text-destructive"
                  : "text-muted-foreground/60"
          }`}
        >
          {status === "live"
            ? "● Live"
            : status === "stale"
              ? "● Pause"
              : status === "connecting"
                ? "● Kobler til"
                : status === "error"
                  ? "● Feil"
                  : "● Av"}
        </span>
        <span className="text-[8px] tracking-[0.25em] uppercase text-muted-foreground/60">
          Oppdatert {updatedLabel}
        </span>
      </div>

      {err && (
        <div className="text-[10px] text-destructive mt-1 truncate" title={err}>
          {err}
        </div>
      )}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Analog meter                                  */
/* -------------------------------------------------------------------------- */

function AnalogPowerMeter({
  nowW,
  avgW,
  maxTodayW,
  scaleMax,
}: {
  nowW: number | null;
  avgW: number | null;
  maxTodayW: number | null;
  scaleMax: number;
}) {
  const needleRef = useRef<SVGLineElement | null>(null);
  const smoothRef = useRef(0);

  const ANGLE_RANGE = 130; // -65 .. +65
  const cx = 100;
  const cy = 82;
  const r = 66;

  const valueToDeg = (v: number) => {
    const clamped = Math.max(0, Math.min(scaleMax, v));
    return (clamped / scaleMax) * ANGLE_RANGE - ANGLE_RANGE / 2;
  };

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = nowW ?? 0;
      const diff = target - smoothRef.current;
      const k = diff >= 0 ? 0.18 : 0.08;
      smoothRef.current += diff * k;
      const deg = valueToDeg(smoothRef.current);
      if (needleRef.current) {
        needleRef.current.setAttribute(
          "transform",
          `rotate(${deg.toFixed(2)} ${cx} ${cy})`,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowW, scaleMax]);

  const polar = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + Math.sin(rad) * radius, y: cy - Math.cos(rad) * radius };
  };

  const arcPath = (vFrom: number, vTo: number, radius: number) => {
    const a = polar(valueToDeg(vFrom), radius);
    const b = polar(valueToDeg(vTo), radius);
    const large =
      Math.abs(valueToDeg(vTo) - valueToDeg(vFrom)) > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
  };

  // Soner i % av skala
  const greenTo = scaleMax * 0.4;
  const yellowTo = scaleMax * 0.75;

  // Ticks: 5 hovedstreker
  const stepCount = 5;
  const ticks: { v: number; major: boolean; label: string }[] = [];
  for (let i = 0; i <= stepCount * 2; i++) {
    const v = (scaleMax / (stepCount * 2)) * i;
    const major = i % 2 === 0;
    ticks.push({
      v,
      major,
      label: major ? formatTickLabel(v) : "",
    });
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: "200 / 95" }}>
      <svg viewBox="0 0 200 95" className="w-full h-full">
        <defs>
          <linearGradient id="vu-bg-power" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef9e7" />
            <stop offset="100%" stopColor="#e9d8a6" />
          </linearGradient>
          <radialGradient id="vu-hub" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c9a86b" />
            <stop offset="100%" stopColor="#7a5a2a" />
          </radialGradient>
        </defs>

        <rect
          x="2"
          y="2"
          width="196"
          height="86"
          rx="6"
          fill="url(#vu-bg-power)"
          stroke="#8b6a3a"
          strokeWidth="0.8"
        />

        {/* Sone-buer: grønn / gul / rød */}
        <path
          d={arcPath(0, greenTo, r)}
          fill="none"
          stroke="#27ae60"
          strokeWidth="3"
          opacity="0.75"
        />
        <path
          d={arcPath(greenTo, yellowTo, r)}
          fill="none"
          stroke="#f1c40f"
          strokeWidth="3"
          opacity="0.8"
        />
        <path
          d={arcPath(yellowTo, scaleMax, r)}
          fill="none"
          stroke="#e74c3c"
          strokeWidth="3"
          opacity="0.85"
        />

        {/* Hoved skala-bue */}
        <path
          d={arcPath(0, scaleMax, r - 4)}
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="0.6"
        />

        {/* Ticks */}
        {ticks.map((t, i) => {
          const deg = valueToDeg(t.v);
          const rad = (deg * Math.PI) / 180;
          const inner = r - (t.major ? 9 : 4);
          const outer = r - 1;
          const x1 = cx + Math.sin(rad) * inner;
          const y1 = cy - Math.cos(rad) * inner;
          const x2 = cx + Math.sin(rad) * outer;
          const y2 = cy - Math.cos(rad) * outer;
          const lx = cx + Math.sin(rad) * (r - 17);
          const ly = cy - Math.cos(rad) * (r - 17);
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#3d2f1a"
                strokeWidth={t.major ? 1.2 : 0.6}
              />
              {t.label && (
                <text
                  x={lx}
                  y={ly + 3}
                  textAnchor="middle"
                  fontSize="6.5"
                  fill="#3d2f1a"
                  fontFamily="ui-monospace, monospace"
                >
                  {t.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Snitt-uke-markør (blå pil utenfor buen) */}
        {avgW != null && avgW > 0 && avgW <= scaleMax && (
          <MarkerArrow
            polar={polar}
            deg={valueToDeg(avgW)}
            r={r + 2}
            color="#1f4e8a"
            label="snitt"
          />
        )}

        {/* Maks-i-dag-markør (rød pil) */}
        {maxTodayW != null && maxTodayW > 0 && maxTodayW <= scaleMax && (
          <MarkerArrow
            polar={polar}
            deg={valueToDeg(maxTodayW)}
            r={r + 2}
            color="#a8321a"
            label="maks"
          />
        )}

        {/* Etikett */}
        <text
          x={cx}
          y="60"
          textAnchor="middle"
          fontSize="7"
          fill="#3d2f1a"
          fontFamily="serif"
          fontStyle="italic"
        >
          Watt
        </text>

        {/* Nål */}
        <line
          ref={needleRef}
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - r + 4}
          stroke="#1c1c1c"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="4.5" fill="url(#vu-hub)" stroke="#3d2f1a" strokeWidth="0.8" />
      </svg>
    </div>
  );
}

function MarkerArrow({
  polar,
  deg,
  r,
  color,
  label,
}: {
  polar: (deg: number, r: number) => { x: number; y: number };
  deg: number;
  r: number;
  color: string;
  label: string;
}) {
  const tip = polar(deg, r);
  const base1 = polar(deg - 2.2, r + 5);
  const base2 = polar(deg + 2.2, r + 5);
  const labelPos = polar(deg, r + 9);
  // Radial tick som krysser skala-buen for å gjøre markøren tydeligere
  const tickInner = polar(deg, r - 6);
  const tickOuter = polar(deg, r + 1);
  return (
    <g>
      <line
        x1={tickInner.x}
        y1={tickInner.y}
        x2={tickOuter.x}
        y2={tickOuter.y}
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <polygon
        points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`}
        fill={color}
        stroke="#1c1c1c"
        strokeWidth="0.3"
      />
      <text
        x={labelPos.x}
        y={labelPos.y + 1.5}
        textAnchor="middle"
        fontSize="4.5"
        fill={color}
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
      >
        {label}
      </text>
    </g>
  );
}

function formatTickLabel(w: number): string {
  if (w >= 1000) {
    const k = w / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(Math.round(w));
}
