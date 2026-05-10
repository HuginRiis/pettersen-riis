import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Sunrise, Sunset, Sun } from "lucide-react";
import { getBorgenLightsStatus, type BorgenLightsStatus } from "@/server/homey";
import { useUvSun, uvLevel } from "@/hooks/use-uv-sun";
import { DoubleTapToTop } from "@/components/PageShell";

const BORGEN_COORD = { lat: 59.1789, lon: 9.5732 };

/**
 * HouseHero — animert helteseksjon for forsiden.
 *
 *  - Sesongbaserte partikler (snø/blader/pollen/ildfluer)
 *  - Tid-på-døgnet himmeloverlay (morgen/dag/skumring/natt)
 *  - Blafrende stearinlys-effekt over vinduer + utelampe
 *  - Ravner som flyr over taket
 *
 * SSR-trygt: ingen Math.random / new Date() før komponenten er mountet.
 */

type Season = "spring" | "summer" | "autumn" | "winter";
type DayPart = "morning" | "day" | "evening" | "night";

function getSeason(date: Date): Season {
  const m = date.getMonth();
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

function dayPartOverlay(part: DayPart): string {
  switch (part) {
    case "morning":
      return "linear-gradient(180deg, oklch(0.45 0.12 40 / 0.45) 0%, oklch(0.20 0.06 30 / 0.6) 60%, oklch(0.10 0.01 240) 100%)";
    case "day":
      return "linear-gradient(180deg, oklch(0.50 0.06 230 / 0.30) 0%, oklch(0.20 0.03 230 / 0.55) 60%, oklch(0.10 0.01 240) 100%)";
    case "evening":
      return "linear-gradient(180deg, oklch(0.40 0.16 35 / 0.6) 0%, oklch(0.18 0.08 25 / 0.75) 55%, oklch(0.08 0.01 240) 100%)";
    case "night":
      return "linear-gradient(180deg, oklch(0.18 0.04 250 / 0.85) 0%, oklch(0.12 0.02 245 / 0.92) 55%, oklch(0.06 0.005 240) 100%)";
  }
}

/**
 * Lyspunkter som ligger oppå hero-bildet.
 * Posisjon i prosent (0-100) av hero-rektangelet.
 * Juster disse hvis huset på bildet er forskjøvet.
 *
 * Default-tipping: hero-westeros.jpg viser et hus midt i bildet med vinduer
 * og en lampe utenfor inngangen. Disse koordinatene treffer typisk plassering;
 * de kan justeres når man ser eksakt hvor lyspunktene bør være.
 */
type LightSpot = {
  id: string;
  x: number; // %
  y: number; // %
  size: number; // px
  color: string;
  /** sterkere "hot core" rundt selve flammen */
  intensity?: number;
};

const HOUSE_LIGHTS: LightSpot[] = [
  // Inne — vinduer (varm gul)
  { id: "win-1", x: 38, y: 62, size: 28, color: "oklch(0.85 0.16 75)", intensity: 1 },
  { id: "win-2", x: 46, y: 62, size: 28, color: "oklch(0.85 0.16 75)", intensity: 0.9 },
  { id: "win-3", x: 54, y: 62, size: 28, color: "oklch(0.85 0.16 75)", intensity: 1 },
  { id: "win-4", x: 62, y: 62, size: 28, color: "oklch(0.85 0.16 75)", intensity: 0.85 },
  // Loft-vindu
  { id: "win-attic", x: 50, y: 48, size: 22, color: "oklch(0.85 0.16 75)", intensity: 0.8 },
  // Ute — lampe ved inngang (litt rødligere/oransje)
  { id: "porch", x: 50, y: 78, size: 36, color: "oklch(0.78 0.20 45)", intensity: 1.2 },
  // Hagelys (mindre)
  { id: "garden-l", x: 22, y: 82, size: 18, color: "oklch(0.78 0.18 50)", intensity: 0.7 },
  { id: "garden-r", x: 78, y: 82, size: 18, color: "oklch(0.78 0.18 50)", intensity: 0.7 },
];

export function HouseHero({
  image,
  eyebrow,
  title,
  subtitle,
}: {
  image: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  // Mount-flag for å unngå SSR-hydreringsmismatch
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const [lights, setLights] = useState<BorgenLightsStatus | null>(null);
  const fetchLights = useServerFn(getBorgenLightsStatus);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchLights()
        .then((s: BorgenLightsStatus) => {
          if (!cancelled) setLights(s);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [fetchLights]);

  const season: Season = now ? getSeason(now) : "winter";
  const dayPart: DayPart = now ? getDayPart(now) : "evening";
  const overlay = dayPartOverlay(dayPart);

  // Lysene skal blusse mer i mørket
  const lightsVisible = dayPart === "evening" || dayPart === "night" || dayPart === "morning";

  return (
    <section className="relative h-[58vh] min-h-[360px] w-full overflow-hidden border-b border-border">
      {/* Bakgrunnsbilde med subtil Ken Burns */}
      <div className="house-kenburns absolute inset-0">
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

      {/* Stjerner og sesongpartikler er fjernet etter ønske */}

      {/* Ravner over taket */}
      {mounted && <Ravens count={dayPart === "night" ? 3 : 2} />}

      {/* Vignett */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, oklch(0.06 0.005 240 / 0.7) 100%)",
        }}
      />

      {/* Dobbel-tapp øverst → scroll til topp */}
      <DoubleTapToTop />

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

        {mounted && now && (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] md:text-xs uppercase tracking-[0.35em] text-primary/90">
            <span className="inline-block w-8 h-px bg-primary/60" />
            <span>{SEASON_LABEL[season]}</span>
            <span className="text-primary/40">❦</span>
            <span>{DAYPART_LABEL[dayPart]}</span>
            <SunEvent />
            <UvHeroBadge lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />
            {lights?.ok && lights.totalCount > 0 && (
              <>
                <span className="text-primary/40">❦</span>
                <span
                  className={`inline-flex items-center gap-1.5 normal-case tracking-normal ${lights.onCount > 0 ? "text-amber-300" : "text-muted-foreground"}`}
                  title={`${lights.onCount} av ${lights.totalCount} lys på i borgen`}
                >
                  <Lightbulb size={12} className={lights.onCount > 0 ? "text-amber-300" : "text-muted-foreground"} />
                  <span className="text-foreground font-semibold text-[11px] md:text-xs">
                    {lights.onCount} av {lights.totalCount}
                  </span>
                  <span className="text-muted-foreground text-[10px] md:text-[11px]">lys på i borgen</span>
                </span>
              </>
            )}
            <span className="inline-block w-8 h-px bg-primary/60" />
          </div>
        )}
      </div>

      <HouseHeroStyles />
    </section>
  );
}

function UvHeroBadge({ lat, lon }: { lat: number; lon: number }) {
  const { uvNow } = useUvSun(lat, lon);
  if (uvNow == null) return null;
  const lvl = uvLevel(uvNow);
  return (
    <>
      <span className="text-primary/40">❦</span>
      <span
        className="inline-flex items-center gap-1.5 normal-case tracking-normal"
        title={`UV nå: ${uvNow.toFixed(1)} (${lvl.label})`}
      >
        <Sun size={12} style={{ color: lvl.color }} />
        <span className="text-foreground font-semibold text-[11px] md:text-xs">UV {uvNow.toFixed(1)}</span>
        <span className="text-muted-foreground text-[10px] md:text-[11px]">{lvl.label}</span>
      </span>
    </>
  );
}

function SunEvent() {
  const { sunrise, sunset } = useUvSun(BORGEN_COORD.lat, BORGEN_COORD.lon);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!sunrise || !sunset) return null;
  const sr = new Date(sunrise).getTime();
  const ss = new Date(sunset).getTime();
  const isDay = now >= sr && now < ss;
  const target = isDay ? ss : sr > now ? sr : sr + 24 * 3600 * 1000;
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const label = h > 0 ? `${h}t ${m.toString().padStart(2, "0")}m` : `${m}m`;
  const clock = new Date(target).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  const Icon = isDay ? Sunset : Sunrise;
  return (
    <>
      <span className="text-primary/40">❦</span>
      <span
        className="inline-flex items-center gap-1.5 normal-case tracking-normal text-primary/90"
        title={isDay ? "Tid til solnedgang" : "Tid til soloppgang"}
      >
        <Icon size={12} className="text-amber-300" />
        <span className="text-foreground font-semibold text-[11px] md:text-xs">{clock}</span>
        <span className="text-muted-foreground text-[10px] md:text-[11px]">om {label}</span>
      </span>
    </>
  );
}

function CandleLights({ lights, visible }: { lights: LightSpot[]; visible: boolean }) {
  // Bruk en stabil "tilfeldig" delay basert på indeks (ingen Math.random) for SSR-trygghet
  return (
    <div
      className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
      style={{ opacity: visible ? 1 : 0.15 }}
    >
      {lights.map((l, i) => {
        const intensity = l.intensity ?? 1;
        return (
          <span
            key={l.id}
            className="house-candle absolute rounded-full"
            style={{
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: l.size,
              height: l.size,
              marginLeft: -l.size / 2,
              marginTop: -l.size / 2,
              background: `radial-gradient(circle, ${l.color} 0%, ${l.color.replace(")", " / 0.6)")} 35%, transparent 70%)`,
              boxShadow: `0 0 ${24 * intensity}px ${8 * intensity}px ${l.color.replace(")", " / 0.55)")}, 0 0 ${60 * intensity}px ${20 * intensity}px ${l.color.replace(")", " / 0.25)")}`,
              animationDelay: `${(i * 0.37) % 2}s`,
              animationDuration: `${1.6 + ((i * 0.23) % 1.5)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ─── Ravner ─────────────────────────────────────────────────────────── */

function Ravens({ count }: { count: number }) {
  const ravens = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        // Hold dem oppe over taket (15-35% fra topp)
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
          className="house-raven absolute"
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
            className="house-wing"
            d="M2 9 Q 9 2, 18 9 Q 27 2, 34 9 Q 27 6, 18 9 Q 9 6, 2 9 Z"
          />
        </svg>
      ))}
    </div>
  );
}

/* ─── Stjerner ───────────────────────────────────────────────────────── */

function Stars({ density }: { density: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: density }, (_, i) => ({
        id: i,
        left: (i * 53) % 100,
        top: (i * 37) % 50,
        size: 0.6 + ((i * 0.13) % 1.8),
        delay: (i * 0.41) % 4,
      })),
    [density],
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      {stars.map((s) => (
        <span
          key={s.id}
          className="house-star absolute rounded-full bg-foreground"
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
        drift: (((i * 13) % 80) - 40),
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {flakes.map((f) => (
        <span
          key={f.id}
          className="house-snow absolute rounded-full bg-foreground"
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

/* ─── Blader (høst) ─────────────────────────────────────────────────── */

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
          className="house-leaf absolute"
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

/* ─── Pollen (vår) ──────────────────────────────────────────────────── */

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
          className="house-pollen absolute rounded-full"
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

/* ─── Ildfluer (sommerkveld) ────────────────────────────────────────── */

function Fireflies() {
  const flies = useMemo(
    () =>
      Array.from({ length: 25 }, (_, i) => ({
        id: i,
        left: (i * 13) % 100,
        top: 10 + ((i * 19) % 80),
        duration: 5 + ((i * 0.41) % 6),
        delay: (i * 0.31) % 5,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {flies.map((f) => (
        <span
          key={f.id}
          className="house-firefly absolute rounded-full"
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

/* ─── Styles ─────────────────────────────────────────────────────────── */

function HouseHeroStyles() {
  return (
    <style>{`
      @keyframes house-kenburns {
        0%   { transform: scale(1.05) translate(0, 0); }
        50%  { transform: scale(1.10) translate(-1%, -0.5%); }
        100% { transform: scale(1.05) translate(0, 0); }
      }
      .house-kenburns { animation: house-kenburns 50s ease-in-out infinite; }

      /* Stearinlys-blafring: rask, uregelmessig glød + lett scale */
      @keyframes house-candle {
        0%, 100% { opacity: 0.85; transform: scale(1); }
        15%      { opacity: 1;    transform: scale(1.08); }
        30%      { opacity: 0.7;  transform: scale(0.95); }
        45%      { opacity: 0.95; transform: scale(1.04); }
        60%      { opacity: 0.6;  transform: scale(0.92); }
        78%      { opacity: 1;    transform: scale(1.10); }
        92%      { opacity: 0.8;  transform: scale(0.98); }
      }
      .house-candle {
        animation-name: house-candle;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
        will-change: opacity, transform;
        mix-blend-mode: screen;
      }

      @keyframes house-twinkle {
        0%, 100% { opacity: 0.2; transform: scale(0.8); }
        50%      { opacity: 1;   transform: scale(1.2); }
      }
      .house-star { animation: house-twinkle 3.5s ease-in-out infinite; }

      @keyframes house-snowfall {
        0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 0; }
        10%  { opacity: 0.9; }
        100% { transform: translate3d(var(--drift, 0), 70vh, 0) rotate(360deg); opacity: 0.4; }
      }
      .house-snow {
        top: 0;
        animation-name: house-snowfall;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }

      @keyframes house-leaffall {
        0%   { transform: translate3d(0, -10vh, 0) rotate(var(--rot, 0deg)); opacity: 0; }
        10%  { opacity: 1; }
        100% { transform: translate3d(60px, 75vh, 0) rotate(calc(var(--rot, 0deg) + 540deg)); opacity: 0.6; }
      }
      .house-leaf {
        top: 0;
        animation-name: house-leaffall;
        animation-timing-function: ease-in;
        animation-iteration-count: infinite;
      }

      @keyframes house-drift {
        0%, 100% { transform: translate(0, 0); opacity: 0.6; }
        50%      { transform: translate(20px, -15px); opacity: 1; }
      }
      .house-pollen { animation: house-drift ease-in-out infinite; }

      @keyframes house-firefly {
        0%, 100% { opacity: 0.1; transform: translate(0, 0) scale(0.6); }
        25%      { opacity: 1;   transform: translate(15px, -10px) scale(1.2); }
        50%      { opacity: 0.4; transform: translate(-10px, -25px) scale(0.9); }
        75%      { opacity: 1;   transform: translate(20px, -15px) scale(1.1); }
      }
      .house-firefly { animation: house-firefly ease-in-out infinite; }

      @keyframes house-ravenfly {
        0%   { transform: translateX(-15vw); opacity: 0; }
        10%  { opacity: 1; }
        90%  { opacity: 1; }
        100% { transform: translateX(115vw); opacity: 0; }
      }
      .house-raven {
        left: 0;
        animation-name: house-ravenfly;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      @keyframes house-wingflap {
        0%, 100% { transform: scaleY(1); }
        50%      { transform: scaleY(0.4); }
      }
      .house-wing { transform-origin: center; animation: house-wingflap 0.32s ease-in-out infinite; }

      @media (prefers-reduced-motion: reduce) {
        .house-kenburns, .house-candle, .house-star,
        .house-snow, .house-leaf, .house-pollen,
        .house-firefly, .house-raven, .house-wing {
          animation: none !important;
        }
      }
    `}</style>
  );
}
