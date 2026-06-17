import { useMemo } from "react";

/**
 * Dekorative bakgrunns-animasjoner for værfliser.
 * Plasseres absolutt bak innholdet i en GlassCard (overflow-hidden).
 * Alle effekter er rene CSS-keyframes — ingen JS-loop.
 */

type Common = { intensity?: number; className?: string };

const wrap = "pointer-events-none absolute inset-0 overflow-hidden";

/* ---------------- RAIN ---------------- */
export function RainFX({ intensity = 0.5, className = "" }: Common) {
  const count = Math.max(6, Math.round(8 + intensity * 22));
  const drops = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        left: (i / count) * 100 + (Math.random() * 6 - 3),
        delay: Math.random() * 1.6,
        dur: 0.9 + Math.random() * 0.9,
        h: 8 + Math.random() * 10,
        op: 0.45 + Math.random() * 0.45,
      })),
    [count],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {drops.map((d, i) => (
        <span
          key={i}
          className="absolute top-0 animate-wx-rain"
          style={{
            left: `${d.left}%`,
            width: 1.2,
            height: d.h,
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(180,220,255,0.9) 60%, rgba(140,200,255,0.95) 100%)",
            borderRadius: 2,
            opacity: d.op,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- SNOW ---------------- */
export function SnowFX({ intensity = 0.5, className = "" }: Common) {
  const count = Math.max(8, Math.round(10 + intensity * 18));
  const flakes = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 4,
        dur: 4 + Math.random() * 4,
        size: 2 + Math.random() * 3,
        sx: (Math.random() * 24 - 12).toFixed(0) + "px",
      })),
    [count],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {flakes.map((f, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-full bg-white/85 animate-wx-snow"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            boxShadow: "0 0 4px rgba(255,255,255,0.6)",
            animationDuration: `${f.dur}s`,
            animationDelay: `${f.delay}s`,
            ["--sx" as any]: f.sx,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- CLOUDS ---------------- */
export function CloudFX({ intensity = 0.5, className = "" }: Common) {
  const count = Math.max(2, Math.round(2 + intensity * 4));
  const clouds = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        top: 8 + i * (60 / count) + Math.random() * 10,
        delay: -Math.random() * 18,
        dur: 14 + Math.random() * 14,
        scale: 0.7 + Math.random() * 0.6,
        op: 0.25 + Math.random() * 0.25,
      })),
    [count],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {clouds.map((c, i) => (
        <svg
          key={i}
          viewBox="0 0 64 28"
          className="absolute animate-wx-cloud"
          style={{
            top: `${c.top}%`,
            width: 90 * c.scale,
            opacity: c.op,
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
            filter: "blur(0.5px)",
          }}
        >
          <path
            d="M10 22 Q4 22 4 16 Q4 10 11 10 Q12 4 20 4 Q28 4 30 10 Q38 8 42 14 Q52 14 52 20 Q52 24 46 24 L12 24 Q10 24 10 22 Z"
            fill="white"
          />
        </svg>
      ))}
    </div>
  );
}

/* ---------------- WIND ---------------- */
export function WindFX({ intensity = 0.5, className = "" }: Common) {
  const count = Math.max(3, Math.round(3 + intensity * 5));
  const lines = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        top: 18 + i * (70 / count) + Math.random() * 6,
        delay: Math.random() * 2,
        dur: 1.6 + Math.random() * 1.6,
        w: 30 + Math.random() * 50,
      })),
    [count],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {lines.map((l, i) => (
        <span
          key={i}
          className="absolute h-px animate-wx-wind"
          style={{
            top: `${l.top}%`,
            left: 0,
            width: `${l.w}%`,
            background:
              "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0) 100%)",
            animationDuration: `${l.dur}s`,
            animationDelay: `${l.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- HEATWAVE ---------------- */
export function HeatwaveFX({ intensity = 0.5, className = "" }: Common) {
  const cold = intensity < 0;
  const color = cold ? "rgba(170,210,255,0.55)" : "rgba(255,200,120,0.55)";
  const bands = useMemo(
    () =>
      Array.from({ length: 4 }).map((_, i) => ({
        bottom: 8 + i * 18,
        delay: i * 0.4,
        dur: 2.6 + i * 0.4,
      })),
    [],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {bands.map((b, i) => (
        <span
          key={i}
          className="absolute left-0 right-0 h-[2px] rounded-full animate-wx-heatwave"
          style={{
            bottom: `${b.bottom}%`,
            background: `linear-gradient(to right, transparent, ${color}, transparent)`,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
            filter: "blur(1.5px)",
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- HUMIDITY (rising droplets) ---------------- */
export function HumidityFX({ intensity = 0.5, className = "" }: Common) {
  const count = Math.max(4, Math.round(4 + intensity * 8));
  const drops = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        left: 6 + Math.random() * 88,
        delay: Math.random() * 3.2,
        dur: 3.2 + Math.random() * 2.4,
        size: 3 + Math.random() * 3,
      })),
    [count],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {drops.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full animate-wx-droplet"
          style={{
            left: `${d.left}%`,
            bottom: 0,
            width: d.size,
            height: d.size * 1.25,
            background:
              "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95), rgba(170,210,255,0.55) 70%, rgba(170,210,255,0) 100%)",
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- PRESSURE (pulse rings) ---------------- */
export function PressureFX({ intensity = 0.5, className = "" }: Common) {
  const rings = [0, 0.6, 1.2];
  const color = intensity > 0.6 ? "rgba(255,180,140,0.45)" : intensity < 0.4 ? "rgba(140,200,255,0.45)" : "rgba(255,255,255,0.4)";
  return (
    <div className={`${wrap} flex items-center justify-center ${className}`} aria-hidden>
      {rings.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full border animate-wx-pressure"
          style={{
            width: 90,
            height: 90,
            borderColor: color,
            animationDuration: "3s",
            animationDelay: `${d}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- GUST (sweeping puffs) ---------------- */
export function GustFX({ intensity = 0.5, className = "" }: Common) {
  const count = Math.max(2, Math.round(2 + intensity * 4));
  const puffs = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        top: 20 + i * (60 / count) + Math.random() * 8,
        delay: Math.random() * 1.8,
        dur: 1.4 + Math.random() * 1.2,
        scale: 0.5 + Math.random() * 0.6,
      })),
    [count],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {puffs.map((p, i) => (
        <svg
          key={i}
          viewBox="0 0 48 12"
          className="absolute animate-wx-gust"
          style={{
            top: `${p.top}%`,
            left: 0,
            width: 60 * p.scale,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            opacity: 0.6,
          }}
        >
          <path
            d="M2 6 H22 Q28 6 28 3 Q28 1 26 1"
            fill="none"
            stroke="white"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M2 10 H30 Q38 10 38 7 Q38 5 36 5"
            fill="none"
            stroke="white"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.7"
          />
        </svg>
      ))}
    </div>
  );
}

/* ---------------- SUN (rays + sparkles) ---------------- */
export function SunFX({ intensity = 0.5, className = "" }: Common) {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 6 }).map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 2.4,
        dur: 1.6 + Math.random() * 1.6,
        size: 2 + Math.random() * 3,
      })),
    [],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,220,140,0.45) 0%, rgba(255,200,100,0.18) 40%, transparent 70%)",
          filter: "blur(4px)",
          opacity: 0.6 + intensity * 0.4,
        }}
      />
      {sparkles.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-wx-sparkle"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            boxShadow: "0 0 6px rgba(255,230,160,0.9)",
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- MOON (stars) ---------------- */
export function StarFX({ intensity = 0.5, className = "" }: Common) {
  const stars = useMemo(
    () =>
      Array.from({ length: 14 }).map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 3,
        dur: 1.6 + Math.random() * 2.2,
        size: 1 + Math.random() * 2,
      })),
    [],
  );
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-wx-sparkle"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            opacity: 0.6,
            boxShadow: "0 0 4px rgba(255,255,255,0.8)",
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
