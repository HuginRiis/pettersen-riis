import { useEffect, useMemo, useRef } from "react";

/**
 * WeatherCanvasBackdrop — canvas/partikkel-basert værbakgrunn som skal ligne
 * iOS 26 sin værapp. Alt er tegnet i canvas + gradient (ingen video), looper
 * naturlig, og tilpasser seg dag/skumring/natt + værtype.
 *
 * Bruk enten som full sidebakgrunn (`fixed`) eller som `contained` inne i en flis.
 */

export type BackdropMood =
  | "clear"
  | "fair"
  | "partlycloudy"
  | "cloudy"
  | "overcast"
  | "rain"
  | "drizzle"
  | "snow"
  | "sleet"
  | "fog"
  | "thunder";

export type DayPhase = "night" | "dawn" | "day" | "dusk";

export type WeatherBackdropProps = {
  /** Rå MET symbol_code, eller null. Foretrukket kilde. */
  symbol?: string | null;
  /** Overstyr modus (om ingen symbol). */
  mood?: BackdropMood;
  /** Skydekke 0..100. */
  cloud?: number;
  /** Nedbør i mm/t. */
  precip?: number;
  /** Sannsynlighet for nedbør 0..100. */
  precipProb?: number;
  /** Vind i m/s (styrer skyfart + regnvinkel). */
  wind?: number;
  /** Vindretning i grader (fra-retning). */
  windDir?: number;
  /** Ekte tidspunkt (brukes for animasjon-fase). Default: now. */
  now?: Date;
  /** Sun opp/ned for stedet — gir riktig dag/skumring/natt overgang. */
  sunrise?: Date | null;
  sunset?: Date | null;
  /** true = tegn inne i en flis (ikke fixed), false = fixed hele viewport. */
  contained?: boolean;
  className?: string;
};

const AURORA_MOODS: readonly BackdropMood[] = ["clear", "fair"] as const;

function moodFromSymbol(s: string | null | undefined): BackdropMood {
  if (!s) return "fair";
  if (s.includes("thunder")) return "thunder";
  if (s.includes("sleet")) return "sleet";
  if (s.includes("snow")) return "snow";
  if (s.includes("heavyrain")) return "rain";
  if (s.includes("rain")) return "rain";
  if (s.includes("lightrain") || s.includes("drizzle")) return "drizzle";
  if (s.includes("fog")) return "fog";
  if (s.includes("clearsky")) return "clear";
  if (s.includes("fair")) return "fair";
  if (s.includes("partlycloudy")) return "partlycloudy";
  if (s.includes("cloudy")) return "cloudy";
  return "fair";
}

function computeDayPhase(now: Date, sunrise?: Date | null, sunset?: Date | null): { phase: DayPhase; sunAlt: number } {
  const t = now.getTime();
  if (sunrise && sunset) {
    const sr = sunrise.getTime();
    const ss = sunset.getTime();
    const twilight = 45 * 60 * 1000; // 45 min dawn/dusk-vinduer
    if (t < sr - twilight || t > ss + twilight) return { phase: "night", sunAlt: -0.2 };
    if (t < sr + twilight) {
      const p = (t - (sr - twilight)) / (2 * twilight); // 0..1
      return { phase: "dawn", sunAlt: -0.1 + p * 0.3 };
    }
    if (t > ss - twilight) {
      const p = 1 - (t - (ss - twilight)) / (2 * twilight);
      return { phase: "dusk", sunAlt: -0.1 + p * 0.3 };
    }
    // day: 0..1 over dagsvinduet
    const p = (t - sr) / (ss - sr);
    const alt = Math.sin(Math.max(0, Math.min(1, p)) * Math.PI); // 0..1..0
    return { phase: "day", sunAlt: alt };
  }
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < 5 || h > 22) return { phase: "night", sunAlt: -0.2 };
  if (h < 7) return { phase: "dawn", sunAlt: (h - 5) / 2 * 0.3 - 0.1 };
  if (h > 20) return { phase: "dusk", sunAlt: (22 - h) / 2 * 0.3 - 0.1 };
  return { phase: "day", sunAlt: Math.sin(((h - 7) / 13) * Math.PI) };
}

/** iOS-lignende himmelfarger for hver fase. Vektet mot vær-modus. */
function skyStops(phase: DayPhase, mood: BackdropMood, darkness: number): [string, string, string] {
  // darkness: 0 (klart) .. 1 (tett regn/tåke) — mørkner himmelen litt
  const mix = (base: [number, number, number], dark: [number, number, number], f: number): [number, number, number] => [
    base[0] + (dark[0] - base[0]) * f,
    base[1] + (dark[1] - base[1]) * f,
    base[2] + (dark[2] - base[2]) * f,
  ];
  const toRgb = (c: [number, number, number]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  let top: [number, number, number];
  let mid: [number, number, number];
  let bot: [number, number, number];
  const isHeavy = mood === "rain" || mood === "thunder" || mood === "sleet";
  const dark: [number, number, number] = isHeavy ? [30, 34, 44] : [64, 72, 86];
  switch (phase) {
    case "night":
      top = [7, 12, 30]; mid = [16, 22, 48]; bot = [28, 36, 66]; break;
    case "dawn":
      top = [40, 55, 110]; mid = [200, 130, 130]; bot = [255, 190, 140]; break;
    case "dusk":
      top = [30, 40, 90]; mid = [190, 100, 90]; bot = [240, 150, 90]; break;
    default: // day
      top = [40, 118, 200]; mid = [110, 170, 220]; bot = [190, 220, 240]; break;
  }
  return [
    toRgb(mix(top, dark, darkness * 0.5)),
    toRgb(mix(mid, dark, darkness * 0.7)),
    toRgb(mix(bot, dark, darkness * 0.8)),
  ];
}

/* -------- offscreen sprites (pre-rendered én gang) -------- */

function makeCloudSprite(size: number, softness = 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const puffs = 14;
  for (let i = 0; i < puffs; i++) {
    const r = size * (0.18 + Math.random() * 0.22);
    const x = size / 2 + (Math.random() - 0.5) * size * 0.55;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.28;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.55 * softness;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.6, `rgba(255,255,255,${a * 0.4})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}

function makeStarSprite(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function makeSnowSprite(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.5, "rgba(230,240,255,0.5)");
  g.addColorStop(1, "rgba(230,240,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/* ------- component ------- */

export function WeatherCanvasBackdrop(props: WeatherBackdropProps) {
  const {
    symbol,
    mood: moodOverride,
    cloud = 40,
    precip = 0,
    precipProb = 0,
    wind = 3,
    windDir = 270,
    now,
    sunrise,
    sunset,
    contained = false,
    className = "",
  } = props;

  const mood: BackdropMood = moodOverride ?? moodFromSymbol(symbol);
  const nowRef = useRef<Date>(now ?? new Date());
  nowRef.current = now ?? new Date();

  const phaseInfo = useMemo(
    () => computeDayPhase(nowRef.current, sunrise, sunset),
    // Recompute hver gang now oppdateres eksternt
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now?.getTime(), sunrise?.getTime(), sunset?.getTime()],
  );

  const darkness = useMemo(() => {
    const rainFactor = Math.min(1, precip / 4 + precipProb / 200);
    const cloudFactor = Math.min(1, cloud / 100);
    const base =
      mood === "thunder" ? 0.85 :
      mood === "rain" ? 0.6 :
      mood === "sleet" ? 0.55 :
      mood === "snow" ? 0.3 :
      mood === "drizzle" ? 0.4 :
      mood === "fog" ? 0.4 :
      mood === "overcast" || mood === "cloudy" ? 0.5 :
      mood === "partlycloudy" ? 0.15 : 0;
    return Math.min(1, base + rainFactor * 0.3 + (cloudFactor - 0.4) * 0.2);
  }, [mood, precip, precipProb, cloud]);

  const [c1, c2, c3] = skyStops(phaseInfo.phase, mood, darkness);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => {
      const r = root.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildLayers();
    };

    // Layer-state
    type Cloud = { x: number; y: number; scale: number; speed: number; sprite: HTMLCanvasElement; alpha: number };
    type Star = { x: number; y: number; size: number; phase: number; speed: number };
    type Drop = { x: number; y: number; len: number; speed: number };
    type Flake = { x: number; y: number; r: number; vy: number; sway: number; phase: number };

    let clouds: Cloud[] = [];
    let stars: Star[] = [];
    let drops: Drop[] = [];
    let flakes: Flake[] = [];
    let fogOffset = 0;
    let flashTimer = 0;
    let nextFlash = 4 + Math.random() * 6;

    const cloudSprites: HTMLCanvasElement[] = [];

    const buildLayers = () => {
      cloudSprites.length = 0;
      const spriteSize = Math.min(360, Math.max(180, Math.round(Math.min(W, H) * 0.55)));
      for (let i = 0; i < 3; i++) cloudSprites.push(makeCloudSprite(spriteSize, 1));

      // Sky-dekke → antall skyer. Alltid noen ved partlycloudy.
      const coverage = mood === "clear" ? 0.05
        : mood === "fair" ? 0.2
        : mood === "partlycloudy" ? 0.55
        : mood === "cloudy" ? 0.85
        : mood === "overcast" ? 1
        : mood === "fog" ? 0.6
        : mood === "rain" || mood === "drizzle" || mood === "sleet" ? 0.95
        : mood === "snow" ? 0.75
        : mood === "thunder" ? 1
        : Math.min(1, cloud / 100);

      const count = Math.round(4 + coverage * 14);
      clouds = Array.from({ length: count }, (_, i) => {
        const row = i % 3;
        const y = H * (0.05 + row * 0.14) + (Math.random() - 0.5) * H * 0.06;
        const scale = 0.55 + Math.random() * 0.7 + row * 0.15;
        return {
          x: Math.random() * (W + spriteSize) - spriteSize / 2,
          y,
          scale,
          speed: (0.008 + row * 0.006 + Math.random() * 0.01) * Math.max(0.4, wind / 5 + 0.5),
          sprite: cloudSprites[i % cloudSprites.length],
          alpha: 0.6 + Math.random() * 0.35,
        };
      });

      // Stars (kun ved natt/skumring, avta med skyer)
      const starCount = Math.max(0, Math.round((phaseInfo.phase === "night" ? 120 : phaseInfo.phase === "dusk" || phaseInfo.phase === "dawn" ? 40 : 0) * (1 - coverage * 0.6)));
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * 0.7,
        size: 0.6 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.6,
      }));

      // Regn
      const rainWanted = mood === "rain" || mood === "thunder" || mood === "sleet" || mood === "drizzle";
      const rainCount = rainWanted
        ? Math.round((mood === "drizzle" ? 90 : mood === "sleet" ? 140 : mood === "thunder" ? 260 : Math.min(320, 160 + precip * 30)))
        : 0;
      drops = Array.from({ length: rainCount }, () => ({
        x: Math.random() * (W + H * 0.4),
        y: Math.random() * H,
        len: (mood === "drizzle" ? 6 : 14) + Math.random() * 14,
        speed: (mood === "drizzle" ? 6 : 12) + Math.random() * 10 + wind * 0.3,
      }));

      // Snø
      const snowWanted = mood === "snow" || mood === "sleet";
      const flakeCount = snowWanted ? (mood === "sleet" ? 60 : 140) : 0;
      flakes = Array.from({ length: flakeCount }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1.2 + Math.random() * 3.2,
        vy: 0.4 + Math.random() * 1.2,
        sway: 6 + Math.random() * 20,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const snowSprite = makeSnowSprite(24);
    const starSprite = makeStarSprite(8);

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);

    let last = performance.now();
    let paused = false;
    const onVis = () => { paused = document.hidden; last = performance.now(); };
    document.addEventListener("visibilitychange", onVis);

    const windRad = ((windDir - 90) * Math.PI) / 180; // ~vindvektor
    const rainAngle = Math.max(-0.6, Math.min(0.6, Math.sin(windRad) * (wind / 12)));
    const windX = Math.cos(windRad);

    const render = (t: number) => {
      rafRef.current = requestAnimationFrame(render);
      if (paused) return;
      const dt = Math.min(64, t - last);
      last = t;

      ctx.clearRect(0, 0, W, H);

      // 1. Aurora / soloppgang-glow (bak alt): et stort radialt lys på horisonten
      const horizonY = H * (phaseInfo.phase === "night" ? 1.1 : phaseInfo.phase === "day" ? 0.4 - phaseInfo.sunAlt * 0.25 : 0.75);
      const sunX = W * (phaseInfo.phase === "dawn" ? 0.18 : phaseInfo.phase === "dusk" ? 0.82 : 0.5);
      if (phaseInfo.phase !== "night") {
        const glowR = Math.max(W, H) * (0.7 + phaseInfo.sunAlt * 0.4);
        const glow = ctx.createRadialGradient(sunX, horizonY, 0, sunX, horizonY, glowR);
        const gAlpha = 0.35 * (1 - darkness * 0.7);
        if (phaseInfo.phase === "dawn" || phaseInfo.phase === "dusk") {
          glow.addColorStop(0, `rgba(255,190,120,${gAlpha})`);
          glow.addColorStop(0.4, `rgba(255,140,110,${gAlpha * 0.5})`);
        } else {
          glow.addColorStop(0, `rgba(255,240,200,${gAlpha})`);
          glow.addColorStop(0.4, `rgba(255,240,220,${gAlpha * 0.4})`);
        }
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Stars (twinkling)
      if (stars.length) {
        for (const s of stars) {
          s.phase += (dt / 1000) * s.speed;
          const a = 0.4 + 0.6 * Math.abs(Math.sin(s.phase));
          ctx.globalAlpha = a * (phaseInfo.phase === "night" ? 1 : 0.35);
          const sz = s.size * 4;
          ctx.drawImage(starSprite, s.x - sz / 2, s.y - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
      }

      // 3. Sun / Moon disc
      const showBody = mood !== "fog" && mood !== "thunder" && (mood !== "overcast");
      if (showBody) {
        const bodyY = H * (0.28 - Math.max(-0.1, phaseInfo.sunAlt) * 0.18);
        const bodyX = phaseInfo.phase === "dawn" ? W * 0.25 :
          phaseInfo.phase === "dusk" ? W * 0.75 :
          phaseInfo.phase === "day" ? W * (0.5 + Math.sin(((nowRef.current.getHours() - 12) / 6) * Math.PI * 0.5) * 0.3) :
          W * 0.75;
        const r = Math.max(28, Math.min(W, H) * 0.09);
        if (phaseInfo.phase === "night") {
          // Måne
          const g = ctx.createRadialGradient(bodyX, bodyY, r * 0.2, bodyX, bodyY, r * 2.4);
          g.addColorStop(0, "rgba(240,240,255,0.9)");
          g.addColorStop(0.5, "rgba(200,210,240,0.15)");
          g.addColorStop(1, "rgba(200,210,240,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(bodyX, bodyY, r * 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(245,245,255,0.95)";
          ctx.beginPath(); ctx.arc(bodyX, bodyY, r * 0.75, 0, Math.PI * 2); ctx.fill();
        } else {
          const isWarm = phaseInfo.phase === "dawn" || phaseInfo.phase === "dusk";
          const core = isWarm ? "255,210,150" : "255,245,210";
          const halo = isWarm ? "255,150,90" : "255,230,180";
          const g = ctx.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, r * 3);
          g.addColorStop(0, `rgba(${core},${0.9 * (1 - darkness * 0.6)})`);
          g.addColorStop(0.35, `rgba(${halo},${0.35 * (1 - darkness * 0.7)})`);
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = `rgba(${core},${0.95 * (1 - darkness * 0.5)})`;
          ctx.beginPath(); ctx.arc(bodyX, bodyY, r * 0.55, 0, Math.PI * 2); ctx.fill();
        }
      }

      // 4. Skyer — flere lag, farget etter darkness
      for (const cl of clouds) {
        cl.x += cl.speed * dt * (0.6 + wind / 10);
        const spriteSize = cl.sprite.width * cl.scale;
        if (cl.x > W + spriteSize) cl.x = -spriteSize;
        // Tint: darkness → mørkere skyer
        const tint = 255 - darkness * 140;
        ctx.globalAlpha = cl.alpha * (1 - Math.max(0, phaseInfo.phase === "night" ? 0.5 : 0));
        // draw base
        ctx.drawImage(cl.sprite, cl.x, cl.y, spriteSize, spriteSize);
        // darken multiply
        if (darkness > 0.3) {
          ctx.globalCompositeOperation = "source-atop";
          ctx.globalAlpha = cl.alpha * (darkness - 0.2) * 0.9;
          ctx.fillStyle = `rgb(${tint | 0},${tint | 0},${(tint + 10) | 0})`;
          ctx.fillRect(cl.x, cl.y, spriteSize, spriteSize);
          ctx.globalCompositeOperation = "source-over";
        }
      }
      ctx.globalAlpha = 1;

      // 5. Fog — horisontale drifting bands
      if (mood === "fog") {
        fogOffset += dt * 0.02;
        for (let i = 0; i < 4; i++) {
          const y = H * (0.45 + i * 0.13);
          const off = (fogOffset * (0.5 + i * 0.3)) % W;
          const grad = ctx.createLinearGradient(0, y - 50, 0, y + 50);
          grad.addColorStop(0, "rgba(220,225,235,0)");
          grad.addColorStop(0.5, `rgba(220,225,235,${0.35 - i * 0.05})`);
          grad.addColorStop(1, "rgba(220,225,235,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(-off, y - 50, W, 100);
          ctx.fillRect(W - off, y - 50, W, 100);
        }
      }

      // 6. Rain
      if (drops.length) {
        ctx.strokeStyle = mood === "thunder" ? "rgba(200,215,240,0.55)" : "rgba(200,220,240,0.5)";
        ctx.lineWidth = mood === "drizzle" ? 0.8 : 1.3;
        ctx.beginPath();
        for (const d of drops) {
          d.x += rainAngle * d.speed * (dt / 16);
          d.y += d.speed * (dt / 16);
          if (d.y > H) { d.y = -20; d.x = Math.random() * (W + H * 0.4) - H * 0.2; }
          if (d.x > W + 20) d.x = -20;
          if (d.x < -20) d.x = W + 20;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - rainAngle * d.len, d.y - d.len);
        }
        ctx.stroke();
      }

      // 7. Snø
      if (flakes.length) {
        for (const f of flakes) {
          f.phase += dt * 0.001;
          f.y += f.vy * (dt / 16);
          const x = f.x + Math.sin(f.phase) * f.sway + windX * wind * 0.3;
          if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; }
          const sz = f.r * 6;
          ctx.globalAlpha = 0.85;
          ctx.drawImage(snowSprite, x - sz / 2, f.y - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
      }

      // 8. Thunder flash
      if (mood === "thunder") {
        nextFlash -= dt / 1000;
        if (nextFlash <= 0) { flashTimer = 0.25; nextFlash = 3 + Math.random() * 6; }
        if (flashTimer > 0) {
          const a = Math.min(1, flashTimer * 4) * 0.55;
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillRect(0, 0, W, H);
          flashTimer -= dt / 1000;
        }
      }

      // 9. Subtile "atmosfære" vignette
      const v = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, `rgba(0,0,0,${0.25 + darkness * 0.15})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, phaseInfo.phase, phaseInfo.sunAlt, darkness, wind, windDir, precip]);

  const bgStyle: React.CSSProperties = {
    background: `linear-gradient(to bottom, ${c1} 0%, ${c2} 55%, ${c3} 100%)`,
    transition: "background 1.2s ease",
  };

  const posClass = contained ? "absolute inset-0" : "fixed inset-0";
  return (
    <div
      ref={rootRef}
      className={`${posClass} overflow-hidden pointer-events-none ${className}`}
      style={bgStyle}
      aria-hidden
      data-mood={mood}
      data-phase={phaseInfo.phase}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {/* subtle "aurora" i klart natt */}
      {phaseInfo.phase === "night" && AURORA_MOODS.includes(mood) && (
        <div className="absolute inset-x-0 top-0 h-1/2 opacity-40 mix-blend-screen"
          style={{
            background:
              "radial-gradient(60% 40% at 30% 20%, rgba(120,200,180,0.35), transparent 70%), radial-gradient(50% 30% at 70% 10%, rgba(150,120,220,0.3), transparent 70%)",
            animation: "wxAurora 24s ease-in-out infinite alternate",
          }}
        />
      )}
    </div>
  );
}
