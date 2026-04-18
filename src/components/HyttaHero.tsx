import { useEffect, useMemo, useState } from "react";

/**
 * HyttaHero — animert helteseksjon for Hytta-fanen.
 *
 * Variasjoner:
 *  - Årstid (vår, sommer, høst, vinter) bestemmer partikler og fargetone
 *  - Tid på døgnet (morgen, dag, kveld, natt) bestemmer himmel-overlay,
 *    sol/måne-posisjon og atmosfæriske detaljer
 *
 * Game of Thrones-preg: dyp blå/gull palett, ravner i silhuett, glødende
 * ember om kvelden, snøstorm om vinteren, gylne lysstråler om sommeren.
 */

type Season = "spring" | "summer" | "autumn" | "winter";
type DayPart = "morning" | "day" | "evening" | "night";

function getSeason(date: Date): Season {
  const m = date.getMonth(); // 0-11
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}

function getDayPart(date: Date): DayPart {
  const h = date.getHours();
  if (h >= 5 && h < 9) return "morning";
  if (h >= 9 && h < 17) return "day";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

const SEASON_LABEL: Record<Season, string> = {
  spring: "Vår",
  summer: "Sommer",
  autumn: "Høst",
  winter: "Vinter",
};

const DAYPART_LABEL: Record<DayPart, string> = {
  morning: "Morgengry",
  day: "Dagslys",
  evening: "Skumring",
  night: "Nattevakt",
};

// Atmosfærisk overlay per tid på døgnet
function dayPartOverlay(part: DayPart): string {
  switch (part) {
    case "morning":
      // Rosa/gylden morgengry
      return "linear-gradient(180deg, oklch(0.45 0.12 40 / 0.55) 0%, oklch(0.20 0.06 30 / 0.65) 55%, oklch(0.10 0.01 240) 100%)";
    case "day":
      // Lysere, blålig dagshimmel med varm bunn
      return "linear-gradient(180deg, oklch(0.45 0.08 230 / 0.45) 0%, oklch(0.20 0.03 230 / 0.65) 55%, oklch(0.10 0.01 240) 100%)";
    case "evening":
      // Dyp ravoransje-skumring (mest GoT)
      return "linear-gradient(180deg, oklch(0.40 0.16 35 / 0.65) 0%, oklch(0.18 0.08 25 / 0.78) 50%, oklch(0.08 0.01 240) 100%)";
    case "night":
      // Stjerneklar nattehimmel, dypblå
      return "linear-gradient(180deg, oklch(0.18 0.04 250 / 0.85) 0%, oklch(0.12 0.02 245 / 0.92) 55%, oklch(0.06 0.005 240) 100%)";
  }
}

export function HyttaHero({ image, eyebrow, title, subtitle }: {
  image: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  // SSR-trygg: ikke les klokka før etter mount, ellers får vi hydreringsmismatch
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const season = now ? getSeason(now) : "winter";
  const dayPart = now ? getDayPart(now) : "evening";
  const overlay = dayPartOverlay(dayPart);

  return (
    <section className="relative h-[58vh] min-h-[360px] w-full overflow-hidden border-b border-border">
      {/* Bakgrunnsbilde med subtil zoom (Ken Burns) */}
      <div className="hytta-kenburns absolute inset-0">
        <img
          src={image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
      </div>

      {/* Tid-på-døgnet overlay */}
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{ background: overlay }}
      />

      {/* Himmellegeme: sol/måne */}
      <CelestialBody dayPart={dayPart} />

      {/* Stjerner om natten/skumring */}
      {(dayPart === "night" || dayPart === "evening") && <Stars density={dayPart === "night" ? 60 : 25} />}

      {/* Sesongbaserte partikler */}
      {season === "winter" && <Snowfall />}
      {season === "autumn" && <Leaves />}
      {season === "spring" && <Pollen />}
      {season === "summer" && <Fireflies dayPart={dayPart} />}

      {/* Glødende ember om kvelden (peisrøyk-stemning) */}
      {dayPart === "evening" && <Embers />}

      {/* Ravner i silhuett — alltid, men flere om natten */}
      <Ravens count={dayPart === "night" ? 3 : 2} />

      {/* Vignett rundt kantene */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, oklch(0.06 0.005 240 / 0.7) 100%)",
        }}
      />

      {/* Tekstinnhold */}
      <div className="relative h-full container mx-auto px-4 flex flex-col justify-end pb-10">
        {eyebrow && (
          <div className="text-display text-xs md:text-sm tracking-[0.4em] text-primary uppercase mb-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {eyebrow}
          </div>
        )}
        <h1 className="heading-hero text-3xl md:text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-foreground/90 text-base md:text-lg drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            {subtitle}
          </p>
        )}

        {/* Liten "krønike-stripe" nederst — sesong + døgn */}
        <div className="mt-5 flex items-center gap-3 text-[10px] md:text-xs uppercase tracking-[0.35em] text-primary/90">
          <span className="inline-block w-8 h-px bg-primary/60" />
          <span>{SEASON_LABEL[season]}</span>
          <span className="text-primary/40">❦</span>
          <span>{DAYPART_LABEL[dayPart]}</span>
          <span className="inline-block w-8 h-px bg-primary/60" />
        </div>
      </div>

      <HyttaHeroStyles />
    </section>
  );
}

/* ─── Himmellegeme ───────────────────────────────────────────────────── */

function CelestialBody({ dayPart }: { dayPart: DayPart }) {
  const isMoon = dayPart === "night";

  // Posisjon: morgen lavt øst, dag høyt, kveld lavt vest, natt måne høyt
  const pos = useMemo(() => {
    switch (dayPart) {
      case "morning":
        return { left: "12%", top: "62%" };
      case "day":
        return { left: "75%", top: "18%" };
      case "evening":
        return { left: "82%", top: "58%" };
      case "night":
        return { left: "78%", top: "20%" };
    }
  }, [dayPart]);

  const color = isMoon
    ? "oklch(0.92 0.02 230)"
    : dayPart === "evening"
    ? "oklch(0.78 0.18 45)"
    : dayPart === "morning"
    ? "oklch(0.85 0.14 60)"
    : "oklch(0.92 0.10 90)";

  const glow = isMoon
    ? "0 0 60px 20px oklch(0.85 0.04 230 / 0.35)"
    : dayPart === "evening"
    ? "0 0 80px 30px oklch(0.7 0.20 40 / 0.5)"
    : "0 0 100px 40px oklch(0.85 0.14 70 / 0.4)";

  return (
    <div
      className="hytta-celestial absolute rounded-full"
      style={{
        left: pos.left,
        top: pos.top,
        width: isMoon ? 56 : 72,
        height: isMoon ? 56 : 72,
        background: color,
        boxShadow: glow,
        opacity: 0.9,
      }}
    >
      {isMoon && (
        // Subtle "kratere" på månen
        <>
          <span className="absolute rounded-full" style={{ left: "22%", top: "30%", width: 8, height: 8, background: "oklch(0.78 0.02 230 / 0.6)" }} />
          <span className="absolute rounded-full" style={{ left: "55%", top: "55%", width: 12, height: 12, background: "oklch(0.78 0.02 230 / 0.5)" }} />
          <span className="absolute rounded-full" style={{ left: "60%", top: "20%", width: 5, height: 5, background: "oklch(0.78 0.02 230 / 0.7)" }} />
        </>
      )}
    </div>
  );
}

/* ─── Stjerner ───────────────────────────────────────────────────────── */

function Stars({ density }: { density: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: density }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 55,
        size: Math.random() * 2 + 0.5,
        delay: Math.random() * 4,
      })),
    [density],
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      {stars.map((s) => (
        <span
          key={s.id}
          className="hytta-star absolute rounded-full bg-foreground"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Snøfall (vinter) ───────────────────────────────────────────────── */

function Snowfall() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: Math.random() * 4 + 2,
        duration: Math.random() * 6 + 6,
        delay: Math.random() * 8,
        drift: (Math.random() - 0.5) * 80,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {flakes.map((f) => (
        <span
          key={f.id}
          className="hytta-snow absolute rounded-full bg-foreground"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            opacity: 0.85,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            ["--drift" as string]: `${f.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ─── Fallende blader (høst) ─────────────────────────────────────────── */

function Leaves() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        duration: Math.random() * 8 + 8,
        delay: Math.random() * 10,
        size: Math.random() * 10 + 8,
        hue: Math.random() * 30 + 25, // gul-oransje
        rot: Math.random() * 360,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {leaves.map((l) => (
        <span
          key={l.id}
          className="hytta-leaf absolute"
          style={{
            left: `${l.left}%`,
            width: l.size,
            height: l.size,
            background: `oklch(0.55 0.18 ${l.hue})`,
            clipPath:
              "polygon(50% 0%, 65% 25%, 100% 35%, 75% 55%, 80% 90%, 50% 75%, 20% 90%, 25% 55%, 0% 35%, 35% 25%)",
            animationDuration: `${l.duration}s`,
            animationDelay: `${l.delay}s`,
            ["--rot" as string]: `${l.rot}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ─── Pollen / blomsterstøv (vår) ────────────────────────────────────── */

function Pollen() {
  const dots = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 3 + 1.5,
        duration: Math.random() * 8 + 8,
        delay: Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <span
          key={d.id}
          className="hytta-pollen absolute rounded-full"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            background: "oklch(0.88 0.12 95 / 0.85)",
            boxShadow: "0 0 6px oklch(0.85 0.14 90 / 0.6)",
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Ildfluer (sommernatt/skumring) ─────────────────────────────────── */

function Fireflies({ dayPart }: { dayPart: DayPart }) {
  // Ildfluer vises tydeligst om kvelden/natta — om dagen vises gylne lysstråler i stedet
  const isDark = dayPart === "evening" || dayPart === "night";
  const flies = useMemo(
    () =>
      Array.from({ length: isDark ? 30 : 18 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 80 + 10,
        duration: Math.random() * 6 + 5,
        delay: Math.random() * 5,
      })),
    [isDark],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {flies.map((f) => (
        <span
          key={f.id}
          className="hytta-firefly absolute rounded-full"
          style={{
            left: `${f.left}%`,
            top: `${f.top}%`,
            width: 4,
            height: 4,
            background: "oklch(0.9 0.18 95)",
            boxShadow: "0 0 12px oklch(0.85 0.18 90 / 0.9)",
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Glødende ember (kveld) ─────────────────────────────────────────── */

function Embers() {
  const embers = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: Math.random() * 3 + 1.5,
        duration: Math.random() * 5 + 5,
        delay: Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {embers.map((e) => (
        <span
          key={e.id}
          className="hytta-ember absolute rounded-full"
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            background: "oklch(0.78 0.20 40)",
            boxShadow: "0 0 8px oklch(0.7 0.22 35 / 0.9)",
            animationDuration: `${e.duration}s`,
            animationDelay: `${e.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Ravner ─────────────────────────────────────────────────────────── */

function Ravens({ count }: { count: number }) {
  const ravens = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        top: Math.random() * 35 + 10,
        duration: Math.random() * 12 + 14,
        delay: i * 6 + Math.random() * 4,
        scale: Math.random() * 0.4 + 0.7,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {ravens.map((r) => (
        <svg
          key={r.id}
          className="hytta-raven absolute"
          style={{
            top: `${r.top}%`,
            animationDuration: `${r.duration}s`,
            animationDelay: `${r.delay}s`,
            transform: `scale(${r.scale})`,
            width: 36,
            height: 18,
          }}
          viewBox="0 0 36 18"
          fill="oklch(0.08 0.005 240)"
        >
          <path className="hytta-wing" d="M2 9 Q 9 2, 18 9 Q 27 2, 34 9 Q 27 6, 18 9 Q 9 6, 2 9 Z" />
        </svg>
      ))}
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

function HyttaHeroStyles() {
  return (
    <style>{`
      @keyframes hytta-kenburns {
        0%   { transform: scale(1.05) translate(0, 0); }
        50%  { transform: scale(1.12) translate(-1.5%, -1%); }
        100% { transform: scale(1.05) translate(0, 0); }
      }
      .hytta-kenburns { animation: hytta-kenburns 40s ease-in-out infinite; }

      @keyframes hytta-celestial-glow {
        0%, 100% { filter: brightness(1); }
        50%      { filter: brightness(1.15); }
      }
      .hytta-celestial { animation: hytta-celestial-glow 6s ease-in-out infinite; }

      @keyframes hytta-twinkle {
        0%, 100% { opacity: 0.2; transform: scale(0.8); }
        50%      { opacity: 1;   transform: scale(1.2); }
      }
      .hytta-star { animation: hytta-twinkle 3.5s ease-in-out infinite; }

      @keyframes hytta-snowfall {
        0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 0; }
        10%  { opacity: 0.9; }
        100% { transform: translate3d(var(--drift, 0), 70vh, 0) rotate(360deg); opacity: 0.4; }
      }
      .hytta-snow {
        top: 0;
        animation-name: hytta-snowfall;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }

      @keyframes hytta-leaffall {
        0%   { transform: translate3d(0, -10vh, 0) rotate(var(--rot, 0deg)); opacity: 0; }
        10%  { opacity: 1; }
        100% { transform: translate3d(60px, 75vh, 0) rotate(calc(var(--rot, 0deg) + 540deg)); opacity: 0.6; }
      }
      .hytta-leaf {
        top: 0;
        animation-name: hytta-leaffall;
        animation-timing-function: ease-in;
        animation-iteration-count: infinite;
      }

      @keyframes hytta-drift {
        0%, 100% { transform: translate(0, 0); opacity: 0.6; }
        50%      { transform: translate(20px, -15px); opacity: 1; }
      }
      .hytta-pollen { animation: hytta-drift ease-in-out infinite; }

      @keyframes hytta-firefly {
        0%, 100% { opacity: 0.1; transform: translate(0, 0) scale(0.6); }
        25%      { opacity: 1;   transform: translate(15px, -10px) scale(1.2); }
        50%      { opacity: 0.4; transform: translate(-10px, -25px) scale(0.9); }
        75%      { opacity: 1;   transform: translate(20px, -15px) scale(1.1); }
      }
      .hytta-firefly { animation: hytta-firefly ease-in-out infinite; }

      @keyframes hytta-emberrise {
        0%   { transform: translate3d(0, 60vh, 0) scale(1); opacity: 0; }
        20%  { opacity: 1; }
        100% { transform: translate3d(30px, -20vh, 0) scale(0.4); opacity: 0; }
      }
      .hytta-ember {
        bottom: 0;
        animation-name: hytta-emberrise;
        animation-timing-function: ease-out;
        animation-iteration-count: infinite;
      }

      @keyframes hytta-ravenfly {
        0%   { transform: translateX(-15vw); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateX(115vw); opacity: 0; }
      }
      .hytta-raven {
        left: 0;
        animation-name: hytta-ravenfly;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      @keyframes hytta-wingflap {
        0%, 100% { transform: scaleY(1); }
        50%      { transform: scaleY(0.4); }
      }
      .hytta-wing { transform-origin: center; animation: hytta-wingflap 0.35s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .hytta-kenburns, .hytta-celestial, .hytta-star,
        .hytta-snow, .hytta-leaf, .hytta-pollen,
        .hytta-firefly, .hytta-ember, .hytta-raven, .hytta-wing {
          animation: none !important;
        }
      }
    `}</style>
  );
}
