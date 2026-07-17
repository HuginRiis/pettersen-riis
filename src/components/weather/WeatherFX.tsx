import { useEffect, useMemo, useState } from "react";
import moonRealAsset from "@/assets/moon-real.png.asset.json";

/**
 * Alle FX-komponenter bruker Math.random() ved rendering, noe som gir
 * hydration-mismatch mellom SSR og klient. React kaster da hele treet og
 * rebuilder — det gir stygg hakking første sekundet på siden. Vi gater
 * derfor alle FX bak en klient-mount slik at SSR sender tomt og klienten
 * bygger dem én gang etter hydration.
 */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/**
 * Deterministisk pseudo-random-generator for SSR/CLI-hydrering.
 * Samme seed gir samme sekvens på server og klient.
 */
function seededRng(seed: number) {
  let s = seed >>> 0;
  if (s === 0) s = 12345;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Dekorative bakgrunns-animasjoner for værfliser.
 * Plasseres absolutt bak innholdet i en GlassCard (overflow-hidden).
 * Alle effekter er rene CSS-keyframes — ingen JS-loop.
 */

type Common = { intensity?: number; className?: string };

const wrap = "pointer-events-none absolute inset-0 overflow-hidden";

/* ---------------- INSIDE RAIN (drops inside the content box) ---------------- */
export function InsideRainFX({ intensity = 0.5, className = "" }: Common) {
  const _mounted = useMounted();
  const i = Math.max(0, Math.min(1, intensity));
  // 0 dråper når intensitet = 0, ellers eskalerer raskt: 2 → 18
  const count = i === 0 ? 0 : Math.max(2, Math.round(2 + i * 16));
  const drops = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        left: 10 + Math.random() * 80,
        delay: Math.random() * 2,
        dur: 1.2 + Math.random() * 1.4,
        size: 2 + Math.random() * 2.5,
        op: 0.35 + Math.random() * 0.35,
      })),
    [count],
  );
  if (count === 0) return null;
  if (!_mounted) return null;
  return (
    <div className={`pointer-events-none absolute inset-x-4 top-8 bottom-4 overflow-hidden ${className}`} aria-hidden>
      {drops.map((d, idx) => (
        <span
          key={idx}
          className="absolute animate-wx-inside-rain"
          style={{
            left: `${d.left}%`,
            top: 0,
            width: d.size,
            height: d.size * 1.6,
            borderRadius: "0 0 50% 50%",
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(180,220,255,0.85) 60%, rgba(140,200,255,0.95) 100%)",
            opacity: d.op,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- RAIN ---------------- */
export function RainFX({ intensity = 0.5, className = "" }: Common) {
  const _mounted = useMounted();
  const clamped = Math.max(0, Math.min(1, intensity));
  const drops = useMemo(() => {
    // Synlig selv når det er tørt: 26–34 dråper totalt gir ~10–14 synlige på én gang.
    // Øker raskt til ~55–65 når regnet kommer.
    const count = Math.round(26 + Math.random() * 8 + clamped * 30);

    return Array.from({ length: count }).map(() => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.8,
      // Faster fall when more intense
      dur: 1.6 - clamped * 0.7 + Math.random() * 0.6,
      h: 10 + Math.random() * 14,
      w: 0.8 + Math.random() * 1.2,
      op: 0.55 + clamped * 0.35 + Math.random() * 0.25,
    }));
  }, [clamped]);
  if (!_mounted) return null;
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {drops.map((d, i) => (
        <span
          key={i}
          className="absolute animate-wx-rain"
          style={{
            top: -20,
            // Start litt til venstre for skjermen, driver mot høyre — vi kompenserer for skråstillingen
            left: `${d.left - 12}%`,
            width: d.w,
            height: d.h,
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(200,235,255,0.95) 55%, rgba(170,220,255,0.95) 100%)",
            borderRadius: 2,
            opacity: d.op,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
            animationFillMode: "backwards",
            filter: "drop-shadow(0 0 1px rgba(200,235,255,0.5))",
            ["--rain-angle" as never]: "14deg",
            ["--rain-drift" as never]: "160px",
          }}
        />
      ))}
    </div>
  );
}

/* ---------------- SNOW ---------------- */
export function SnowFX({ intensity = 0.5, className = "" }: Common) {
  const _mounted = useMounted();
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
  if (!_mounted) return null;
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
  const _mounted = useMounted();
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
  if (!_mounted) return null;
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

/* ---------------- CLOUD COVER (realistic layered sky) ---------------- */
type CloudCoverProps = { intensity?: number; rainIntensity?: number; className?: string };

export function CloudCoverFX({ intensity = 0.5, rainIntensity = 0, className = "" }: CloudCoverProps) {
  const _mounted = useMounted();
  const i = Math.max(0, Math.min(1, intensity));
  const rain = Math.max(0, Math.min(1, rainIntensity));
  // 0 = blå klar himmel, 1 = mørk, tett dekke. Regn gjør skyene mørkere.
  const count = Math.round(8 + i * 18 + rain * 4);
  const blobs = useMemo(
    () =>
      Array.from({ length: count }).map((_, k) => {
        const layer = k % 3; // 0=bak, 1=midt, 2=front
        // ved tett dekke presses skyene utover hele flisen
        const fullCover = i > 0.8;
        const baseTop = fullCover
          ? layer === 0 ? -14 : layer === 1 ? 14 : 44
          : layer === 0 ? 4 : layer === 1 ? 18 : 38;
        return {
          top: baseTop + Math.random() * (fullCover ? 48 : 28),
          left: Math.random() * 140 - 20,
          width: (fullCover ? 240 : 140) + Math.random() * (fullCover ? 380 : 220) + layer * 90,
          height: (fullCover ? 130 : 60) + Math.random() * (fullCover ? 160 : 80) + layer * 50,
          dur: 50 + Math.random() * 70 - layer * 8,
          delay: -Math.random() * 80,
          blur: (fullCover ? 8 : 14) + layer * 6 + Math.random() * 8,
          // mørkere skyer jo høyere intensitet, regn og jo lenger fram
          darkness: Math.min(0.95, 0.12 + i * (0.5 + layer * 0.12) + rain * 0.35 + Math.random() * 0.1),
          op: Math.min(1, 0.45 + i * 0.45 + layer * 0.05 + rain * 0.15),
        };
      }),
    [count, i, rain],
  );

  // himmelfarge bak skyene: klarblå → mørk grå/blå. Regn trekker mot blygrå.
  const skyTop = `rgba(${Math.round(120 - i * 100 - rain * 60)}, ${Math.round(170 - i * 140 - rain * 50)}, ${Math.round(220 - i * 170 - rain * 40)}, ${0.35 + i * 0.45 + rain * 0.2})`;
  const skyBot = `rgba(${Math.round(80 - i * 70 - rain * 50)}, ${Math.round(110 - i * 95 - rain * 40)}, ${Math.round(160 - i * 135 - rain * 30)}, ${0.25 + i * 0.5 + rain * 0.25})`;

  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, ${skyTop}, ${skyBot})` }}
      />
      {blobs.map((b, k) => {
        // sky-fargen: lys topp, mørk bunn — mørkere overall ved høy intensitet / regn
        const lightL = Math.round(255 - b.darkness * 160);
        const darkL = Math.round(255 - b.darkness * 235);
        const lightCol = `rgb(${lightL},${lightL},${Math.min(255, lightL + 8)})`;
        const darkCol = `rgb(${darkL},${darkL},${Math.min(255, darkL + 12)})`;
        if (!_mounted) return null;
        return (
          <div
            key={k}
            className="absolute rounded-full animate-wx-cloud"
            style={{
              top: `${b.top}%`,
              left: `${b.left}%`,
              width: b.width,
              height: b.height,
              background: `radial-gradient(ellipse at 50% 35%, ${lightCol} 0%, ${darkCol} 70%, rgba(0,0,0,0) 88%)`,
              opacity: Math.min(1, b.op),
              filter: `blur(${b.blur}px)`,
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.delay}s`,
              mixBlendMode: "normal",
            }}
          />
        );
      })}
      {/* mørk underbelysning / tak ved tungt dekke og regn */}
      {(i > 0.6 || rain > 0.3) && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 110%, rgba(10,12,20,${Math.min(0.85, (i - 0.6) * 1.0 + rain * 0.6)}) 0%, rgba(0,0,0,0) 65%)`,
          }}
        />
      )}
    </div>
  );
}

/* ---------------- WIND ---------------- */
export function WindFX({ intensity = 0.5, className = "" }: Common) {
  const _mounted = useMounted();
  const i = Math.max(0, Math.min(1, intensity));
  const count = Math.max(4, Math.round(5 + i * 8));
  // Calmer baseline: low wind drifts gently, storm wind zips fast
  const baseDur = 3.8;
  const speedMult = 0.6 + i * 1.8; // 0.6x at calm → 2.4x at storm
  const lines = useMemo(() => {
    const rng = seededRng(Math.floor(i * 100000));
    return Array.from({ length: count }).map((_, k) => ({
      top: 12 + k * (76 / count) + rng() * 8,
      // Positive, staggered delays so streaks fly IN after the panel switches
      delay: 0.15 + k * 0.12 + rng() * 0.6,
      dur: (baseDur / speedMult) * (0.7 + rng() * 0.6),
      w: 18 + rng() * 40,
      op: 0.35 + rng() * 0.45,
      thin: 1 + rng() * 1.5,
      angle: -2 + rng() * 4,
    }));
  }, [count, speedMult, i]);


  // Leaves — blown left → right by the wind (borrowed from GustFX)
  const leafCount = Math.max(3, Math.round(3 + i * 14));
  const leafDur = 3.2 - i * 1.8; // 3.2s → 1.4s
  const leaves = useMemo(() => {
    const rng = seededRng(Math.floor(i * 100000) + 1);
    return Array.from({ length: leafCount }).map((_, k) => ({
      startX: 8 + rng() * 25,
      startY: 10 + rng() * 55,
      lx: 40 + rng() * 140 + i * 80,
      ly: 30 + rng() * 70,
      lr: (rng() > 0.5 ? 1 : -1) * (180 + rng() * 360),
      size: 5 + rng() * 4,
      delay: 0.25 + k * 0.18 + rng() * 0.8,
      dur: leafDur * (0.7 + rng() * 0.6),
      hue: 28 + rng() * 30,
    }));
  }, [leafCount, leafDur, i]);


  if (!_mounted) return null;


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
  const _mounted = useMounted();
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
  if (!_mounted) return null;
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

/* ---------------- HUMIDITY (rising droplets + steam) ---------------- */
export function HumidityFX({ intensity = 0.5, className = "" }: Common) {
  const _mounted = useMounted();
  const i = Math.max(0, Math.min(1, intensity));
  const count = Math.max(4, Math.round(4 + i * 8));
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

  // Steam: more puffs and higher opacity with higher humidity.
  const steamCount = Math.round(3 + i * 14);
  const steamOpacity = 0.18 + i * 0.55;
  // Rise distance: low humidity dies quickly (~25% of tile), high humidity drifts higher (~65%)
  const steamRise = -(25 + i * 40);
  const puffs = useMemo(
    () =>
      Array.from({ length: steamCount }).map(() => ({
        left: 4 + Math.random() * 92,
        delay: Math.random() * 4,
        dur: 3.5 + Math.random() * 3,
        size: 10 + Math.random() * 18,
      })),
    [steamCount],
  );

  if (!_mounted) return null;

  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {puffs.map((p, i) => (
        <span
          key={`s${i}`}
          className="absolute rounded-full animate-wx-steam"
          style={{
            left: `${p.left}%`,
            bottom: 0,
            width: p.size,
            height: p.size,
            background:
              "radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(220,235,255,0.45) 40%, rgba(220,235,255,0) 75%)",
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            ["--steam-opacity" as string]: steamOpacity.toFixed(2),
            ["--steam-rise" as string]: `${steamRise}%`,
          }}
        />
      ))}
      {drops.map((d, i) => (
        <span
          key={`d${i}`}
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
  const _mounted = useMounted();
  const rings = [0, 0.6, 1.2];
  const color = intensity > 0.6 ? "rgba(255,180,140,0.45)" : intensity < 0.4 ? "rgba(140,200,255,0.45)" : "rgba(255,255,255,0.4)";
  if (!_mounted) return null;
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
  const _mounted = useMounted();
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

  if (!_mounted) return null;

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
  const _mounted = useMounted();
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
  if (!_mounted) return null;
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
  const _mounted = useMounted();
  const stars = useMemo(() => {
    const rng = seededRng(42);
    return Array.from({ length: 14 }).map(() => ({
      left: rng() * 100,
      top: rng() * 100,
      delay: rng() * 3,
      dur: 1.6 + rng() * 2.2,
      size: 1 + rng() * 2,
    }));
  }, []);
  if (!_mounted) return null;
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

/* ---------------- MOON FX (måne øverst til høyre) ---------------- */
export function MoonFX({ intensity = 0.5, className = "" }: Common) {
  const _mounted = useMounted();
  if (!_mounted) return null;
  return (
    <div className={`${wrap} ${className}`} aria-hidden>
      {/* Måne-glød øverst til høyre */}
      <div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(220,230,255,0.45) 0%, rgba(180,200,240,0.18) 40%, transparent 70%)",
          filter: "blur(6px)",
          opacity: 0.55 + intensity * 0.35,
        }}
      />
      {/* Selve halvmånen */}
      <svg
        className="absolute top-3 right-3"
        width="46"
        height="46"
        viewBox="0 0 46 46"
        style={{ filter: "drop-shadow(0 0 8px rgba(200,215,255,0.7))" }}
      >
        <defs>
          <radialGradient id="moonfx-body" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fefeff" />
            <stop offset="70%" stopColor="#e6ebff" />
            <stop offset="100%" stopColor="#b9c4e8" />
          </radialGradient>
        </defs>
        <circle cx="23" cy="23" r="13" fill="url(#moonfx-body)" />
        <circle cx="27" cy="21" r="10.5" fill="rgba(15,22,45,0.92)" />
        <circle cx="18" cy="26" r="1.4" fill="rgba(160,175,210,0.55)" />
        <circle cx="21" cy="20" r="0.9" fill="rgba(160,175,210,0.45)" />
        <circle cx="16" cy="22" r="0.7" fill="rgba(160,175,210,0.4)" />
      </svg>
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
  const _mounted = useMounted();
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

  if (!_mounted) return null;

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
  sun,
  now,
}: {
  kind: GlassKind;
  intensity?: number;
  sun?: { sunrise: Date | null; sunset: Date | null } | null;
  now?: Date | null;
}) {
  const _mounted = useMounted();
  const isWet = kind === "rain" || kind === "sleet" || kind === "thunder";
  const isSnow = kind === "snow" || kind === "sleet";
  const isClearDay = kind === "clear" || kind === "fair" || kind === "partly";
  const isNight = kind === "night" || kind === "night-clear";
  const isCloudy = kind === "cloudy" || kind === "partly";
  const isFog = kind === "fog";
  const isThunder = kind === "thunder";

  // Client-only sol-posisjon (0..1 sunrise→sunset) — null på SSR og før mount
  // for å unngå hydration-mismatch. Oppdaterer hvert minutt.
  const [sunProgress, setSunProgress] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => {
      const sr = sun?.sunrise?.getTime();
      const ss = sun?.sunset?.getTime();
      const t = (now ?? new Date()).getTime();
      if (!sr || !ss || ss <= sr) {
        setSunProgress(null);
        return;
      }
      if (t < sr || t > ss) {
        setSunProgress(null);
        return;
      }
      setSunProgress((t - sr) / (ss - sr));
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [sun?.sunrise, sun?.sunset, now]);


  // Static glass beads — randomly scattered "stuck" droplets (små, realistiske)
  const beadCount = isWet ? Math.round(32 + intensity * 28) : 0;
  const beads = useMemo(
    () =>
      Array.from({ length: beadCount }).map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 2.5,
        delay: Math.random() * 4,
        dur: 3 + Math.random() * 4,
      })),
    [beadCount],
  );

  // Sliding drips down the glass (tynnere/mindre)
  const dripCount = isWet ? Math.round(8 + intensity * 14) : 0;
  const drips = useMemo(
    () =>
      Array.from({ length: dripCount }).map(() => ({
        left: Math.random() * 100,
        w: 1.5 + Math.random() * 2,
        h: 8 + Math.random() * 20,
        delay: -Math.random() * 9,
        dur: 4 + Math.random() * 7,
        op: 0.45 + Math.random() * 0.35,
      })),
    [dripCount],
  );

  // Splash på toppen av øverste flis — små sprut + krusninger som en vannpytt
  const splashCount = isWet ? Math.round(10 + intensity * 14) : 0;
  const splashes = useMemo(
    () =>
      Array.from({ length: splashCount }).map(() => {
        const dur = 0.9 + Math.random() * 0.9;
        const delay = -Math.random() * 3;
        // Ligger langs en horisontal linje der topp-flisen begynner (ca. 128px fra topp),
        // med litt variasjon slik at det ikke ser plassert ut.
        const topPx = 118 + Math.random() * 18;
        // Antall sprut-dråper pr. treff
        const bits = 3 + Math.floor(Math.random() * 3);
        const shards = Array.from({ length: bits }).map(() => ({
          sx: (Math.random() * 2 - 1) * 14, // -14..14 px
          sy: -(8 + Math.random() * 14), // opp
          size: 1.4 + Math.random() * 1.6,
          d: 0.15 + Math.random() * 0.25,
        }));
        return {
          left: Math.random() * 100,
          topPx,
          dur,
          delay,
          shards,
        };
      }),
    [splashCount],
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

  if (!_mounted) return null;

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

      {/* RAIN: fritt fallende dråper — samme stil som Nedbør-flisen */}
      {isWet && (
        <>
          <RainFX intensity={intensity} />
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

          {/* SPLASHES — regnet treffer topp-flisen og spruter opp som en vannpytt */}
          {splashes.map((sp, i) => (
            <span
              key={`sp${i}`}
              className="absolute"
              style={{
                left: `${sp.left}%`,
                top: sp.topPx,
                width: 0,
                height: 0,
              }}
            >
              {/* krusning / ripple */}
              <span
                className="absolute animate-wx-splash-ring rounded-full"
                style={{
                  left: 0,
                  top: 0,
                  width: 14,
                  height: 4,
                  border: "1px solid rgba(200,230,255,0.75)",
                  boxShadow: "0 0 3px rgba(200,230,255,0.5)",
                  animationDuration: `${sp.dur}s`,
                  animationDelay: `${sp.delay}s`,
                }}
              />
              {/* sprut-dråper som skyter opp og til sidene */}
              {sp.shards.map((s, k) => (
                <span
                  key={k}
                  className="absolute animate-wx-splash-drop rounded-full"
                  style={{
                    left: 0,
                    top: 0,
                    width: s.size,
                    height: s.size,
                    background:
                      "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95) 0%, rgba(200,230,255,0.85) 60%, rgba(160,205,240,0.4) 100%)",
                    boxShadow: "0 0 2px rgba(200,230,255,0.6)",
                    animationDuration: `${sp.dur * 0.9}s`,
                    animationDelay: `${sp.delay + s.d}s`,
                    ["--sx" as never]: `${s.sx}px`,
                    ["--sy" as never]: `${s.sy}px`,
                  }}
                />
              ))}
            </span>
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

      {/* CLEAR DAY: Skydekke-style sun (haze + rotating rays + bright core + lens flare) */}
      {isClearDay && (
        <>
          {/* Slow sky shimmer (subtle color drift across clear blue) */}
          <div
            className="absolute inset-0 animate-wx-sky-shimmer"
            style={{
              background:
                "linear-gradient(120deg, rgba(255,240,200,0) 0%, rgba(255,235,180,0.12) 40%, rgba(180,220,255,0.14) 60%, rgba(255,240,200,0) 100%)",
              backgroundSize: "220% 220%",
              mixBlendMode: "screen",
            }}
          />
          {/* Sun container — plassert på sin faktiske posisjon på himmelen
              (bue fra soloppgang venstre → zenit midt → solnedgang høyre).
              Lens-flare-spøkelser genereres langs anti-diagonalen fra sola
              gjennom bildesenteret slik ekte kamera-flare oppfører seg. */}
          {(() => {
            const p = sunProgress; // 0..1 eller null
            // Sola går lenger ut av bildet: på toppen vises kun en kvart,
            // ute på sidene vises nesten halve skiva.
            const leftPct = p == null ? 98 : 2 + p * 96; // 2% → 98%
            const topPct = p == null ? 2 : 80 - Math.sin(p * Math.PI) * 88; // 80% → -8%
            // Ghost-posisjoner: senter + (senter - sol) * k
            const cx = 50, cy = 50;
            const dx = cx - leftPct;
            const dy = cy - topPct;
            const ghosts: Array<{ k: number; size: number; color: string; blur: number; opacity: number }> = [
              { k: 0.35, size: 32, color: "rgba(255,215,120,0.55)", blur: 1, opacity: 0.9 },
              { k: 0.7,  size: 20, color: "rgba(255,255,255,0.6)",  blur: 0, opacity: 0.85 },
              { k: 1.0,  size: 70, color: "rgba(255,140,190,0.4)",  blur: 2, opacity: 0.85 },
              { k: 1.35, size: 28, color: "rgba(140,220,255,0.55)", blur: 1, opacity: 0.9 },
              { k: 1.7,  size: 96, color: "rgba(120,200,220,0.28)", blur: 3, opacity: 0.85 },
              { k: 2.0,  size: 42, color: "rgba(180,210,255,0.45)", blur: 1, opacity: 0.85 },
            ];
            return (
              <>
              <div
                className="absolute"
                style={{
                  left: `calc(${leftPct}% - 140px)`,
                  top: `calc(${topPct}% - 140px)`,
                  width: 280,
                  height: 280,
                  pointerEvents: "none",
                  transition: "left 800ms ease, top 800ms ease",
                }}
              >
            {/* Ytre glød / haze */}
            <div
              className="absolute inset-0"
              style={{
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9) 0%, rgba(255,246,200,0.55) 18%, rgba(180,210,255,0.25) 42%, rgba(180,210,255,0) 70%)",
                filter: "blur(3px)",
                animation: "wxFxSunPulse 6s ease-in-out infinite",
              }}
            />
            {/* Solstråler */}
            <svg
              viewBox="0 0 200 200"
              className="absolute inset-0 w-full h-full"
              style={{ animation: "wxFxSunSpin 60s linear infinite" }}
              aria-hidden
            >
              <defs>
                <radialGradient id="wxFxSunRayFade" cx="50%" cy="50%" r="50%">
                  <stop offset="30%" stopColor="rgba(255,255,255,0.95)" />
                  <stop offset="70%" stopColor="rgba(255,240,180,0.35)" />
                  <stop offset="100%" stopColor="rgba(255,240,180,0)" />
                </radialGradient>
              </defs>
              <g stroke="url(#wxFxSunRayFade)" strokeLinecap="round">
                {Array.from({ length: 16 }).map((_, i) => {
                  const a = (i * Math.PI * 2) / 16;
                  const x1 = 100 + Math.cos(a) * 32;
                  const y1 = 100 + Math.sin(a) * 32;
                  const x2 = 100 + Math.cos(a) * 96;
                  const y2 = 100 + Math.sin(a) * 96;
                  const w = i % 2 === 0 ? 3.2 : 1.4;
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w} />;
                })}
              </g>
            </svg>
            {/* Hvit kjerne */}
            <div
              className="absolute"
              style={{
                top: "50%",
                left: "50%",
                width: 116,
                height: 116,
                marginLeft: -58,
                marginTop: -58,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 45% 40%, #ffffff 0%, #ffffff 32%, #fff5c8 62%, rgba(255,220,140,0) 100%)",
                boxShadow:
                  "0 0 40px rgba(255,255,255,0.9), 0 0 90px rgba(255,220,140,0.7), 0 0 160px rgba(255,190,90,0.45)",
                animation: "wxFxSunPulse 4s ease-in-out infinite",
              }}
            />
          </div>
          {/* Lens flare ghosts — langs anti-diagonalen fra sola gjennom senter */}
          <div className="absolute inset-0 pointer-events-none">
            {ghosts.map((g, gi) => {
              const gx = leftPct + dx * g.k;
              const gy = topPct + dy * g.k;
              return (
                <div
                  key={gi}
                  className="absolute rounded-full animate-wx-flare-drift"
                  style={{
                    left: `calc(${gx}% - ${g.size / 2}px)`,
                    top: `calc(${gy}% - ${g.size / 2}px)`,
                    width: g.size,
                    height: g.size,
                    background: `radial-gradient(circle, ${g.color} 0%, ${g.color.replace(/[\d.]+\)$/, "0)")} 70%)`,
                    mixBlendMode: "screen",
                    filter: g.blur ? `blur(${g.blur}px)` : undefined,
                    opacity: g.opacity,
                    transition: "left 800ms ease, top 800ms ease",
                    animationDelay: `${gi * 0.4}s`,
                  }}
                />
              );
            })}
          </div>
              </>
            );
          })()}

          <div
            className="absolute top-0 bottom-0 w-[35%] animate-wx-shine"
            style={{
              left: 0,
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
              animationDuration: "14s",
            }}
          />
          <style>{`
            @keyframes wxFxSunPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
            @keyframes wxFxSunSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
        </>
      )}


      {/* CLOUDY / PARTLY: large drifting clouds */}
      {isCloudy &&
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
          {/* Glød bak månen */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              top: 24,
              left: 24,
              width: 200,
              height: 200,
              background:
                "radial-gradient(circle, rgba(230,235,255,0.45) 0%, rgba(200,210,255,0.15) 45%, transparent 70%)",
              filter: "blur(10px)",
            }}
          />
          {/* Ekte måne (samme bilde som månefase-flisen) */}
          <div
            className="absolute rounded-full pointer-events-none animate-wx-moon-float"
            style={{
              top: 46,
              left: 46,
              width: 156,
              height: 156,
              backgroundImage: `url(${moonRealAsset.url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              boxShadow:
                "0 0 50px 14px rgba(220,225,245,0.28), 0 0 110px 40px rgba(180,200,240,0.16), inset -10px -12px 26px rgba(0,0,0,0.5)",
              filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.55))",
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

      {/* THUNDER: full-screen flash + faktiske lyn-slag */}
      {isThunder && (
        <>
          <div
            className="absolute inset-0 animate-wx-flash"
            style={{
              background:
                "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.3) 30%, transparent 60%)",
              animationDuration: "7s",
            }}
          />
          <ThunderFX intensity={Math.max(0.7, intensity)} />
        </>
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
  const _mounted = useMounted();
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

  if (!_mounted) return null;

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
