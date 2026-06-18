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
  const i = Math.max(0, Math.min(1, intensity));
  const count = Math.max(4, Math.round(5 + i * 8));
  // Calmer baseline: low wind drifts gently, storm wind zips fast
  const baseDur = 3.8;
  const speedMult = 0.6 + i * 1.8; // 0.6x at calm → 2.4x at storm
  const lines = useMemo(
    () =>
      Array.from({ length: count }).map((_, k) => ({
        top: 12 + k * (76 / count) + Math.random() * 8,
        // Positive, staggered delays so streaks fly IN after the panel switches
        delay: 0.15 + k * 0.12 + Math.random() * 0.6,
        dur: (baseDur / speedMult) * (0.7 + Math.random() * 0.6),
        w: 18 + Math.random() * 40,
        op: 0.35 + Math.random() * 0.45,
        thin: 1 + Math.random() * 1.5,
        angle: -2 + Math.random() * 4,
      })),
    [count, speedMult],
  );

  // Leaves — blown left → right by the wind (borrowed from GustFX)
  const leafCount = Math.max(3, Math.round(3 + i * 14));
  const leafDur = 3.2 - i * 1.8; // 3.2s → 1.4s
  const leaves = useMemo(
    () =>
      Array.from({ length: leafCount }).map((_, k) => ({
        startX: 8 + Math.random() * 25,
        startY: 10 + Math.random() * 55,
        lx: 40 + Math.random() * 140 + i * 80,
        ly: 30 + Math.random() * 70,
        lr: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360),
        size: 5 + Math.random() * 4,
        delay: 0.25 + k * 0.18 + Math.random() * 0.8,
        dur: leafDur * (0.7 + Math.random() * 0.6),
        hue: 28 + Math.random() * 30,
      })),
    [leafCount, leafDur, i],
  );

  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {lines.map((l, k) => (
        <span
          key={`w${k}`}
          className="absolute animate-wx-wind"
          style={{
            top: `${l.top}%`,
            left: 0,
            width: `${l.w}%`,
            height: l.thin,
            background:
              "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 40%, rgba(255,255,255,0.85) 60%, rgba(255,255,255,0) 100%)",
            opacity: l.op,
            animationDuration: `${l.dur}s`,
            animationDelay: `${l.delay}s`,
            animationFillMode: "backwards",
            transform: `rotate(${l.angle}deg)`,
            borderRadius: 1,
            filter: "blur(0.3px)",
          }}
        />
      ))}
      {leaves.map((lf, k) => (
        <span
          key={`l${k}`}
          className="absolute animate-wx-leaf"
          style={{
            left: `${lf.startX}%`,
            top: `${lf.startY}%`,
            width: lf.size,
            height: lf.size * 1.3,
            background: `hsl(${lf.hue}, 70%, 55%)`,
            borderRadius: "60% 10% 60% 10%",
            opacity: 0.9,
            animationDuration: `${lf.dur}s`,
            animationDelay: `${lf.delay}s`,
            animationFillMode: "backwards",
            ["--lx" as any]: `${lf.lx}px`,
            ["--ly" as any]: `${lf.ly}px`,
            ["--lr" as any]: `${lf.lr}deg`,
            boxShadow: "0 0 1px rgba(0,0,0,0.2)",
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

/* ---------------- GUST (flying leaves blowing right) ---------------- */
export function GustFX({ intensity = 0.5, className = "" }: Common) {
  const i = Math.max(0, Math.min(1, intensity));
  // Straight wind streaks — more and faster with higher gusts
  const streakCount = Math.max(3, Math.round(4 + i * 8));
  const streakDur = 1.6 - i * 1.0; // 1.6s calm → 0.6s storm
  const streaks = useMemo(
    () =>
      Array.from({ length: streakCount }).map((_, k) => ({
        top: 14 + k * (70 / streakCount) + Math.random() * 6,
        delay: Math.random() * streakDur,
        dur: streakDur * (0.75 + Math.random() * 0.5),
        w: 22 + Math.random() * 38,
        op: 0.45 + Math.random() * 0.4,
        thin: 1 + Math.random() * 1.2,
      })),
    [streakCount, streakDur],
  );

  // Leaves — blown from left to right by the wind
  const leafCount = Math.max(3, Math.round(3 + i * 14));
  const leafDur = 3.2 - i * 1.8; // 3.2s → 1.4s
  const leaves = useMemo(
    () =>
      Array.from({ length: leafCount }).map(() => ({
        // start from left side, blown right by wind
        startX: 8 + Math.random() * 25, // %
        startY: 10 + Math.random() * 55, // %
        lx: 40 + Math.random() * 140 + i * 80, // drift right with wind
        ly: 30 + Math.random() * 70,
        lr: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360),
        size: 5 + Math.random() * 4,
        delay: -Math.random() * leafDur,
        dur: leafDur * (0.7 + Math.random() * 0.6),
        hue: 28 + Math.random() * 30, // warm autumn
      })),
    [leafCount, leafDur, i],
  );

  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {/* Wind streaks — straight horizontal */}
      {streaks.map((l, k) => (
        <span
          key={`s${k}`}
          className="absolute animate-wx-gust"
          style={{
            top: `${l.top}%`,
            left: 0,
            width: `${l.w}%`,
            height: l.thin,
            background:
              "linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) 100%)",
            opacity: l.op,
            animationDuration: `${l.dur}s`,
            animationDelay: `${l.delay}s`,
            borderRadius: 1,
            filter: "blur(0.3px)",
          }}
        />
      ))}

      {/* Flying leaves blown right by wind */}
      {leaves.map((lf, k) => (
        <span
          key={`l${k}`}
          className="absolute animate-wx-leaf"
          style={{
            left: `${lf.startX}%`,
            top: `${lf.startY}%`,
            width: lf.size,
            height: lf.size * 1.3,
            background: `hsl(${lf.hue}, 70%, 55%)`,
            borderRadius: "60% 10% 60% 10%",
            opacity: 0.9,
            animationDuration: `${lf.dur}s`,
            animationDelay: `${lf.delay}s`,
            ["--lx" as any]: `${lf.lx}px`,
            ["--ly" as any]: `${lf.ly}px`,
            ["--lr" as any]: `${lf.lr}deg`,
            boxShadow: "0 0 1px rgba(0,0,0,0.2)",
          }}
        />
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

/* ---------------- THUNDER / LIGHTNING ---------------- */
function makeBoltPath(seed: number, segments: number, jitter: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const w = 24;
  const h = 100;
  let x = w / 2 + (rnd() - 0.5) * 4;
  const pts: string[] = [`M ${x.toFixed(2)} 0`];
  const branches: string[] = [];
  for (let i = 1; i <= segments; i++) {
    const ny = (i / segments) * h;
    const nx = Math.max(2, Math.min(22, x + (rnd() - 0.5) * jitter));
    pts.push(`L ${nx.toFixed(2)} ${ny.toFixed(2)}`);
    if (i > 1 && i < segments - 1 && rnd() < 0.3) {
      const bx = Math.max(0, Math.min(24, nx + (rnd() - 0.5) * jitter * 1.8));
      const by = ny + 5 + rnd() * 10;
      branches.push(`M ${nx.toFixed(2)} ${ny.toFixed(2)} L ${bx.toFixed(2)} ${by.toFixed(2)}`);
    }
    x = nx;
  }
  return { main: pts.join(" "), branches };
}

export function ThunderFX({ intensity = 0.5, className = "" }: Common) {
  const bolts = useMemo(() => {
    const count = Math.max(2, Math.round(2 + intensity * 3));
    return Array.from({ length: count }).map((_, i) => {
      const seed = (i + 1) * 9173 + Math.floor(Math.random() * 99991);
      const { main, branches } = makeBoltPath(seed, 9 + Math.floor(Math.random() * 4), 6);
      const dur = Math.max(3.5, 6 + Math.random() * 6 - intensity * 2);
      // Backwards fill + delay keeps bolts hidden when tile first opens
      const delay = 1.4 + i * (1.8 + Math.random() * 1.6);
      return {
        left: 6 + (i / Math.max(1, count - 1)) * 84 + (Math.random() * 8 - 4),
        top: 2 + Math.random() * 10,
        scale: 0.85 + Math.random() * 0.7,
        delay,
        dur,
        hue: 50 + Math.random() * 10,
        main,
        branches,
      };
    });
  }, [intensity]);

  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      <div
        className="absolute inset-x-0 top-0 h-14"
        style={{
          background:
            "linear-gradient(to bottom, rgba(15,15,30,0.55), rgba(15,15,30,0))",
        }}
      />
      {bolts.map((b, i) => (
        <div
          key={`sky-${i}`}
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at ${b.left}% 25%, rgba(220,235,255,0.7), rgba(220,235,255,0) 55%)`,
            opacity: 0,
            animation: `wx-sky-flash ${b.dur}s linear ${b.delay}s infinite both`,
            mixBlendMode: "screen",
          }}
        />
      ))}
      {bolts.map((b, i) => (
        <svg
          key={i}
          viewBox="0 0 24 100"
          preserveAspectRatio="none"
          className="absolute"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: 18 * b.scale,
            height: 70 * b.scale,
            opacity: 0,
            animation: `wx-bolt-strike ${b.dur}s linear ${b.delay}s infinite both`,
            filter: `drop-shadow(0 0 8px hsla(${b.hue},100%,80%,0.95)) drop-shadow(0 0 16px hsla(${b.hue},100%,70%,0.6))`,
          }}
        >
          <path d={b.main} fill="none" stroke={`hsla(${b.hue},100%,75%,0.45)`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={b.main} fill="none" stroke="rgba(255,255,255,0.98)" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
          {b.branches.map((bp, j) => (
            <path key={j} d={bp} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.6" strokeLinecap="round" />
          ))}
        </svg>
      ))}
    </div>
  );
}



/* ============================================================
   GLASS PANE OVERLAY — covers the entire weather page like a
   pane of glass with weather-appropriate effects.
   ============================================================ */

export type GlassKind =
  | "rain" | "sleet" | "thunder" | "snow"
  | "clear" | "fair" | "partly" | "cloudy"
  | "fog" | "night" | "night-clear";

export function GlassPaneFX({
  kind,
  intensity = 0.6,
}: {
  kind: GlassKind;
  intensity?: number;
}) {
  const isWet = kind === "rain" || kind === "sleet" || kind === "thunder";
  const isSnow = kind === "snow" || kind === "sleet";
  const isClearDay = kind === "clear" || kind === "fair";
  const isNight = kind === "night" || kind === "night-clear";
  const isCloudy = kind === "cloudy" || kind === "partly";
  const isFog = kind === "fog";
  const isThunder = kind === "thunder";

  // Static glass beads — randomly scattered "stuck" droplets
  const beadCount = isWet ? Math.round(28 + intensity * 24) : 0;
  const beads = useMemo(
    () =>
      Array.from({ length: beadCount }).map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 2 + Math.random() * 5,
        delay: Math.random() * 4,
        dur: 3 + Math.random() * 4,
      })),
    [beadCount],
  );

  // Sliding drips down the glass
  const dripCount = isWet ? Math.round(8 + intensity * 14) : 0;
  const drips = useMemo(
    () =>
      Array.from({ length: dripCount }).map(() => ({
        left: Math.random() * 100,
        w: 3 + Math.random() * 4,
        h: 10 + Math.random() * 28,
        delay: -Math.random() * 9,
        dur: 4 + Math.random() * 7,
        op: 0.5 + Math.random() * 0.4,
      })),
    [dripCount],
  );

  // Snowflakes drifting across the pane
  const snowCount = isSnow ? Math.round(22 + intensity * 18) : 0;
  const snow = useMemo(
    () =>
      Array.from({ length: snowCount }).map(() => ({
        left: Math.random() * 100,
        size: 2 + Math.random() * 3,
        delay: -Math.random() * 8,
        dur: 7 + Math.random() * 8,
        sx: (Math.random() * 60 - 30).toFixed(0) + "px",
      })),
    [snowCount],
  );

  // Stars at night
  const starCount = isNight ? 36 : 0;
  const stars = useMemo(
    () =>
      Array.from({ length: starCount }).map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 70,
        size: 1 + Math.random() * 2,
        delay: Math.random() * 4,
        dur: 2 + Math.random() * 3,
      })),
    [starCount],
  );

  // Drifting clouds for cloudy/fair
  const cloudCount = isCloudy ? 4 : 0;
  const clouds = useMemo(
    () =>
      Array.from({ length: cloudCount }).map((_, i) => ({
        top: 8 + (i * 70) / Math.max(1, cloudCount) + Math.random() * 8,
        delay: -Math.random() * 60,
        dur: 60 + Math.random() * 60,
        scale: 1.2 + Math.random() * 1.4,
        op: 0.18 + Math.random() * 0.18,
      })),
    [cloudCount],
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden
      style={{ zIndex: 1 }}
    >
      {/* Subtle glass tint + soft top/bottom vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.0) 30%, rgba(0,0,0,0.10) 100%)",
        }}
      />

      {/* RAIN: beads + sliding drips */}
      {isWet && (
        <>
          {beads.map((b, i) => (
            <span
              key={`b${i}`}
              className="absolute rounded-full animate-wx-bead"
              style={{
                left: `${b.left}%`,
                top: `${b.top}%`,
                width: b.size,
                height: b.size,
                background:
                  "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(200,225,255,0.55) 55%, rgba(160,200,240,0.15) 100%)",
                boxShadow:
                  "inset -0.5px -0.5px 1px rgba(0,0,0,0.18), 0 0 1px rgba(255,255,255,0.5)",
                animationDuration: `${b.dur}s`,
                animationDelay: `${b.delay}s`,
              }}
            />
          ))}
          {drips.map((d, i) => (
            <span
              key={`d${i}`}
              className="absolute animate-wx-drip"
              style={{
                left: `${d.left}%`,
                top: 0,
                width: d.w,
                height: d.h,
                borderRadius: 999,
                background:
                  "linear-gradient(180deg, rgba(220,235,255,0.15) 0%, rgba(220,235,255,0.55) 60%, rgba(255,255,255,0.95) 100%)",
                boxShadow:
                  "inset -0.5px -0.5px 1px rgba(0,0,0,0.2), 0 0 2px rgba(255,255,255,0.4)",
                opacity: d.op,
                animationDuration: `${d.dur}s`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </>
      )}

      {/* SNOW */}
      {isSnow &&
        snow.map((f, i) => (
          <span
            key={`s${i}`}
            className="absolute top-0 rounded-full bg-white animate-wx-snow"
            style={{
              left: `${f.left}%`,
              width: f.size,
              height: f.size,
              opacity: 0.85,
              boxShadow: "0 0 6px rgba(255,255,255,0.7)",
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
              ["--sx" as any]: f.sx,
            }}
          />
        ))}

      {/* CLEAR DAY: sun glow + shine sweep */}
      {isClearDay && (
        <>
          <div
            className="absolute -top-32 -right-24 rounded-full"
            style={{
              width: 420,
              height: 420,
              background:
                "radial-gradient(circle, rgba(255,225,150,0.45) 0%, rgba(255,200,110,0.18) 40%, transparent 70%)",
              filter: "blur(8px)",
            }}
          />
          <div
            className="absolute top-0 bottom-0 w-[35%] animate-wx-shine"
            style={{
              left: 0,
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%)",
              animationDuration: "14s",
            }}
          />
        </>
      )}

      {/* CLOUDY / PARTLY: large drifting clouds */}
      {(isCloudy || isClearDay) &&
        clouds.map((c, i) => (
          <svg
            key={`c${i}`}
            viewBox="0 0 64 28"
            className="absolute animate-wx-cloud"
            style={{
              top: `${c.top}%`,
              width: 260 * c.scale,
              opacity: c.op,
              animationDuration: `${c.dur}s`,
              animationDelay: `${c.delay}s`,
              filter: "blur(1.5px)",
            }}
          >
            <path
              d="M10 22 Q4 22 4 16 Q4 10 11 10 Q12 4 20 4 Q28 4 30 10 Q38 8 42 14 Q52 14 52 20 Q52 24 46 24 L12 24 Q10 24 10 22 Z"
              fill="white"
            />
          </svg>
        ))}

      {/* FOG */}
      {isFog && (
        <>
          {[0, 25, 50, 75].map((top, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 animate-wx-fog"
              style={{
                top: `${top}%`,
                height: "30%",
                background:
                  "linear-gradient(180deg, transparent, rgba(255,255,255,0.18), transparent)",
                filter: "blur(14px)",
                animationDuration: `${10 + i * 3}s`,
                animationDelay: `-${i * 2}s`,
              }}
            />
          ))}
        </>
      )}

      {/* NIGHT: stars + moon glow */}
      {isNight && (
        <>
          <div
            className="absolute top-12 left-12 rounded-full"
            style={{
              width: 120,
              height: 120,
              background:
                "radial-gradient(circle, rgba(230,235,255,0.35) 0%, rgba(200,210,255,0.10) 45%, transparent 70%)",
              filter: "blur(6px)",
            }}
          />
          {stars.map((s, i) => (
            <span
              key={`st${i}`}
              className="absolute rounded-full bg-white animate-wx-sparkle"
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: s.size,
                height: s.size,
                opacity: 0.7,
                boxShadow: "0 0 4px rgba(255,255,255,0.8)",
                animationDuration: `${s.dur}s`,
                animationDelay: `${s.delay}s`,
              }}
            />
          ))}
        </>
      )}

      {/* THUNDER: rare full-screen flash */}
      {isThunder && (
        <div
          className="absolute inset-0 animate-wx-flash"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.3) 30%, transparent 60%)",
            animationDuration: "9s",
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   TILE SPLASH FX — droplets/snow/leaves that splash against the
   top edge of a tile (e.g. the search tile). Render as a child
   of a `relative` container; overlays full tile bounds and
   spills slightly above it.
   ============================================================ */
export function TileSplashFX({
  kind,
  intensity = 0.6,
}: {
  kind: GlassKind;
  intensity?: number;
}) {
  const isWet = kind === "rain" || kind === "sleet" || kind === "thunder";
  const isSnow = kind === "snow" || kind === "sleet";
  const isWindy = kind === "cloudy" || kind === "fog";

  const dropCount = isWet ? Math.round(8 + intensity * 10) : 0;
  const drops = useMemo(
    () =>
      Array.from({ length: dropCount }).map(() => ({
        left: Math.random() * 100,
        delay: -Math.random() * 2.2,
        dur: 1.2 + Math.random() * 1.0,
        w: 1.4 + Math.random() * 1.4,
        h: 9 + Math.random() * 10,
        sx: (Math.random() * 26 - 13).toFixed(0) + "px",
      })),
    [dropCount],
  );

  const ringCount = isWet ? Math.round(5 + intensity * 6) : 0;
  const rings = useMemo(
    () =>
      Array.from({ length: ringCount }).map(() => ({
        left: 4 + Math.random() * 92,
        delay: -Math.random() * 2.2,
        dur: 1.1 + Math.random() * 0.9,
        w: 10 + Math.random() * 12,
      })),
    [ringCount],
  );

  const snowCount = isSnow ? Math.round(7 + intensity * 8) : 0;
  const snow = useMemo(
    () =>
      Array.from({ length: snowCount }).map(() => ({
        left: Math.random() * 100,
        delay: -Math.random() * 4,
        dur: 2.6 + Math.random() * 2.4,
        size: 3 + Math.random() * 3,
        sx: (Math.random() * 30 - 15).toFixed(0) + "px",
      })),
    [snowCount],
  );

  const leafCount = isWindy ? 3 : 0;
  const leaves = useMemo(
    () =>
      Array.from({ length: leafCount }).map((_, i) => ({
        top: 20 + i * 22 + Math.random() * 10,
        delay: -Math.random() * 5,
        dur: 5 + Math.random() * 3,
      })),
    [leafCount],
  );

  return (
    <div
      className="pointer-events-none absolute -inset-x-2 -top-6 bottom-0 overflow-visible"
      aria-hidden
    >
      {/* Rain drops slamming into top edge */}
      {isWet &&
        drops.map((d, i) => (
          <span
            key={`sd${i}`}
            className="absolute top-0 animate-wx-splash-drop"
            style={{
              left: `${d.left}%`,
              width: d.w,
              height: d.h,
              borderRadius: 2,
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(200,225,255,0.85) 70%, rgba(255,255,255,0.95) 100%)",
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
              ["--sx" as any]: d.sx,
            }}
          />
        ))}
      {/* Splash rings on impact */}
      {isWet &&
        rings.map((r, i) => (
          <span
            key={`sr${i}`}
            className="absolute animate-wx-splash-ring"
            style={{
              left: `${r.left}%`,
              top: 22,
              width: r.w,
              height: 3,
              borderRadius: 999,
              borderBottom: "1px solid rgba(220,235,255,0.85)",
              transformOrigin: "center",
              animationDuration: `${r.dur}s`,
              animationDelay: `${r.delay}s`,
            }}
          />
        ))}
      {/* Snowflakes landing on top edge */}
      {isSnow &&
        snow.map((s, i) => (
          <span
            key={`ss${i}`}
            className="absolute top-0 rounded-full bg-white animate-wx-splash-snow"
            style={{
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              boxShadow: "0 0 5px rgba(255,255,255,0.8)",
              animationDuration: `${s.dur}s`,
              animationDelay: `${s.delay}s`,
              ["--sx" as any]: s.sx,
            }}
          />
        ))}
      {/* Wind-blown leaves drifting across */}
      {isWindy &&
        leaves.map((l, i) => (
          <span
            key={`sl${i}`}
            className="absolute animate-wx-splash-leaf text-white/40"
            style={{
              top: `${l.top}%`,
              left: 0,
              width: 8,
              height: 8,
              borderRadius: "0 100% 0 100%",
              background: "rgba(220,235,255,0.45)",
              animationDuration: `${l.dur}s`,
              animationDelay: `${l.delay}s`,
              ["--sy" as any]: "0px",
            }}
          />
        ))}
    </div>
  );
}

export function glassKindFromSymbol(symbol: string | null, isDay: boolean): GlassKind {
  if (!symbol) return isDay ? "fair" : "night";
  if (symbol.includes("thunder")) return "thunder";
  if (symbol.includes("sleet")) return "sleet";
  if (symbol.includes("snow")) return "snow";
  if (symbol.includes("rain")) return "rain";
  if (symbol.includes("fog")) return "fog";
  if (symbol.includes("cloudy") && !symbol.includes("partly")) return "cloudy";
  if (symbol.includes("partlycloudy")) return isDay ? "partly" : "night";
  if (symbol.includes("fair")) return isDay ? "fair" : "night";
  if (symbol.includes("clearsky")) return isDay ? "clear" : "night-clear";
  return isDay ? "fair" : "night";
}
