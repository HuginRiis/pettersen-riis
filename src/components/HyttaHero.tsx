import { useEffect, useMemo, useState } from "react";

// 12 månedsbilder for hytta — bytter automatisk basert på dagens måned
import jan from "@/assets/hytta-months/01-januar.jpg";
import feb from "@/assets/hytta-months/02-februar.jpg";
import mar from "@/assets/hytta-months/03-mars.jpg";
import apr from "@/assets/hytta-months/04-april.jpg";
import mai from "@/assets/hytta-months/05-mai.jpg";
import jun from "@/assets/hytta-months/06-juni.jpg";
import jul from "@/assets/hytta-months/07-juli.jpg";
import aug from "@/assets/hytta-months/08-august.jpg";
import sep from "@/assets/hytta-months/09-september.jpg";
import okt from "@/assets/hytta-months/10-oktober.jpg";
import nov from "@/assets/hytta-months/11-november.jpg";
import des from "@/assets/hytta-months/12-desember.jpg";

const MONTH_IMAGES: { src: string; label: string; season: Season }[] = [
  { src: jan, label: "Januar — Dyp vinter", season: "winter" },
  { src: feb, label: "Februar — Issnø", season: "winter" },
  { src: mar, label: "Mars — Vintersol", season: "winter" },
  { src: apr, label: "April — Snøsmelting", season: "spring" },
  { src: mai, label: "Mai — Spirende vår", season: "spring" },
  { src: jun, label: "Juni — Midnattssol", season: "summer" },
  { src: jul, label: "Juli — Høysommer", season: "summer" },
  { src: aug, label: "August — Sensommer", season: "summer" },
  { src: sep, label: "September — Gylden høst", season: "autumn" },
  { src: okt, label: "Oktober — Tåkeland", season: "autumn" },
  { src: nov, label: "November — Frosten kommer", season: "autumn" },
  { src: des, label: "Desember — Vinterstillhet", season: "winter" },
];

type Season = "spring" | "summer" | "autumn" | "winter";

function getSeasonForMonth(monthIndex: number): Season {
  return MONTH_IMAGES[monthIndex].season;
}

export function HyttaHero({
  eyebrow,
  title,
  subtitle,
  image,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Hvis satt, vises dette bildet i stedet for den månedlige syklusen */
  image?: string;
}) {
  // SSR-trygg: server rendrer alltid januar (index 0); klient bytter etter mount
  const [mounted, setMounted] = useState(false);
  const [monthIndex, setMonthIndex] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
    setMonthIndex(new Date().getMonth());
    // Sjekk hver time om måneden har skiftet
    const t = setInterval(() => setMonthIndex(new Date().getMonth()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const season = getSeasonForMonth(monthIndex);
  const useOverride = Boolean(image);

  return (
    <section className="relative h-[58vh] min-h-[360px] w-full overflow-hidden border-b border-border">
      <HyttaHeroStyles />

      {useOverride ? (
        // Override-modus: vis kun det innsendte bildet
        <div className="absolute inset-0">
          <img
            src={image}
            alt=""
            loading="eager"
            className="hytta-kenburns absolute inset-0 w-full h-full object-cover"
          />
        </div>
      ) : (
        /* Crossfade mellom alle 12 bilder — kun det aktive vises */
        <div className="absolute inset-0">
          {MONTH_IMAGES.map((m, i) => (
            <img
              key={m.src}
              src={m.src}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              className="hytta-kenburns absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out"
              style={{ opacity: i === monthIndex ? 1 : 0 }}
            />
          ))}
        </div>
      )}

      {/* Lett mørkt overlay for tekstlesbarhet — ikke tid-på-døgnet (bildet bærer stemningen) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.10 0.01 240 / 0.15) 0%, oklch(0.10 0.01 240 / 0.40) 55%, oklch(0.08 0.01 240 / 0.85) 100%)",
        }}
      />

      {/* Sesongbaserte partikler — kun etter mount for SSR-trygghet */}
      {mounted && season === "winter" && <Snowfall />}
      {mounted && season === "autumn" && <Leaves />}
      {mounted && season === "spring" && <Pollen />}
      {mounted && season === "summer" && <SummerHaze />}

      {/* Ravner i silhuett — alltid */}
      {mounted && <Ravens count={2} />}

      {/* Vignett */}
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

        {/* Måneds-stripe — kun etter mount så SSR ikke får mismatch, og kun når vi syklar månedsbilder */}
        {mounted && !useOverride && (
          <div className="mt-5 flex items-center gap-3 text-[10px] md:text-xs uppercase tracking-[0.35em] text-primary/90">
            <span className="inline-block w-8 h-px bg-primary/60" />
            <span>{MONTH_IMAGES[monthIndex].label}</span>
            <span className="inline-block w-8 h-px bg-primary/60" />
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Snøfall ───────────────────────────────────────────────────────── */

function Snowfall() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: (i * 17) % 100,
        size: 2 + ((i * 0.31) % 4),
        duration: 6 + ((i * 0.7) % 6),
        delay: (i * 0.43) % 8,
        drift: ((i * 13) % 80) - 40,
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

/* ─── Blader ────────────────────────────────────────────────────────── */

function Leaves() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: (i * 23) % 100,
        duration: 8 + ((i * 0.7) % 8),
        delay: (i * 0.91) % 10,
        size: 8 + ((i * 0.7) % 10),
        hue: 25 + ((i * 7) % 30),
        rot: (i * 47) % 360,
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

/* ─── Pollen ────────────────────────────────────────────────────────── */

function Pollen() {
  const dots = useMemo(
    () =>
      Array.from({ length: 35 }, (_, i) => ({
        id: i,
        left: (i * 19) % 100,
        top: (i * 29) % 100,
        size: 1.5 + ((i * 0.17) % 3),
        duration: 8 + ((i * 0.7) % 8),
        delay: (i * 0.53) % 6,
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

/* ─── Sommerdis (bittesmå glitrende støvkorn) ───────────────────────── */

function SummerHaze() {
  const dots = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        left: (i * 13) % 100,
        top: (i * 19) % 100,
        size: 1.5 + ((i * 0.11) % 2.5),
        duration: 10 + ((i * 0.41) % 8),
        delay: (i * 0.31) % 5,
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
            background: "oklch(0.92 0.06 90 / 0.6)",
            boxShadow: "0 0 4px oklch(0.92 0.06 90 / 0.5)",
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Ravner ────────────────────────────────────────────────────────── */

function Ravens({ count }: { count: number }) {
  const ravens = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        top: 12 + ((i * 31) % 22),
        duration: 16 + ((i * 7) % 10),
        delay: i * 5 + ((i * 3) % 4),
        scale: 0.7 + ((i * 0.17) % 0.4),
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
            width: 38,
            height: 18,
          }}
          viewBox="0 0 36 18"
          fill="oklch(0.06 0.005 240)"
        >
          <path
            className="hytta-wing"
            d="M2 9 Q 9 2, 18 9 Q 27 2, 34 9 Q 27 6, 18 9 Q 9 6, 2 9 Z"
          />
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
      .hytta-kenburns { animation: hytta-kenburns 50s ease-in-out infinite; }

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
      .hytta-wing { transform-origin: center; animation: hytta-wingflap 0.32s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .hytta-kenburns, .hytta-snow, .hytta-leaf, .hytta-pollen,
        .hytta-raven, .hytta-wing {
          animation: none !important;
        }
      }
    `}</style>
  );
}
