import { useMemo } from "react";

type Mood = "clear" | "fair" | "partlycloudy" | "cloudy" | "rain" | "sleet" | "snow" | "thunder" | "fog";

function symbolToMood(symbol: string | null | undefined): Mood {
  if (!symbol) return "fair";
  const s = symbol.toLowerCase();
  if (s.includes("thunder")) return "thunder";
  if (s.includes("snow")) return "snow";
  if (s.includes("sleet")) return "sleet";
  if (s.includes("rain") || s.includes("showers")) return "rain";
  if (s.includes("fog")) return "fog";
  if (s.includes("partlycloudy")) return "partlycloudy";
  if (s.includes("cloudy")) return "cloudy";
  if (s.includes("clearsky")) return "clear";
  if (s.includes("fair")) return "fair";
  return "cloudy";
}

/**
 * Full-screen animated weather scene som ligger bak værinnholdet.
 * iOS Weather-stil: regn faller, snø svever, skyer driver, sol stråler,
 * stjerner blunker om natten, lyn for torden, tåke svever.
 */
export function WeatherScene({
  symbol,
  isNight,
}: {
  symbol: string | null | undefined;
  isNight: boolean;
}) {
  const mood = symbolToMood(symbol);

  // Stabile random-pos pr mount
  const drops = useMemo(() => makeDrops(110), []);
  const snow = useMemo(() => makeSnow(70), []);
  const stars = useMemo(() => makeStars(60), []);
  const fogBands = useMemo(() => [0, 1, 2, 3], []);

  const showRain = mood === "rain" || mood === "thunder" || mood === "sleet";
  const showSnow = mood === "snow" || mood === "sleet";
  const showStars = isNight && (mood === "clear" || mood === "fair" || mood === "partlycloudy");
  const showSun = !isNight && (mood === "clear" || mood === "fair" || mood === "partlycloudy");
  const showMoon = isNight && (mood === "clear" || mood === "fair" || mood === "partlycloudy");
  const showClouds = mood !== "clear" && mood !== "fog";
  const showFog = mood === "fog";
  const showThunder = mood === "thunder";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {showStars && (
        <div className="absolute inset-0">
          {stars.map((s, i) => (
            <span
              key={i}
              className="ws-star"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.size,
                height: s.size,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.dur}s`,
              }}
            />
          ))}
        </div>
      )}

      {showSun && (
        <>
          <div className="ws-sun" />
          <div className="ws-rays" />
        </>
      )}

      {showMoon && <div className="ws-moon" />}

      {showClouds && (
        <>
          <div className="ws-cloud ws-cloud--a" style={{ opacity: mood === "partlycloudy" ? 0.55 : 0.8 }} />
          <div className="ws-cloud ws-cloud--b" style={{ opacity: mood === "partlycloudy" ? 0.4 : 0.7 }} />
          <div className="ws-cloud ws-cloud--c" style={{ opacity: mood === "partlycloudy" ? 0.45 : 0.75 }} />
          {(mood === "cloudy" || mood === "rain" || mood === "thunder" || mood === "snow" || mood === "sleet") && (
            <div className="ws-cloud ws-cloud--d" style={{ opacity: 0.65 }} />
          )}
        </>
      )}

      {showFog && (
        <div className="absolute inset-0">
          {fogBands.map((i) => (
            <div
              key={i}
              className="ws-fog"
              style={{
                top: `${15 + i * 22}%`,
                animationDelay: `${i * -8}s`,
                animationDuration: `${28 + i * 6}s`,
                opacity: 0.35 + i * 0.05,
              }}
            />
          ))}
        </div>
      )}

      {showRain && (
        <div className="absolute inset-0">
          {drops.map((d, i) => (
            <span
              key={i}
              className={mood === "sleet" ? "ws-drop ws-drop--sleet" : "ws-drop"}
              style={{
                left: `${d.x}%`,
                animationDelay: `${d.delay}s`,
                animationDuration: `${d.dur}s`,
                height: d.h,
              }}
            />
          ))}
        </div>
      )}

      {showSnow && (
        <div className="absolute inset-0">
          {snow.map((f, i) => (
            <span
              key={i}
              className="ws-flake"
              style={{
                left: `${f.x}%`,
                width: f.size,
                height: f.size,
                animationDelay: `${f.delay}s`,
                animationDuration: `${f.dur}s`,
                ["--drift" as any]: `${f.drift}px`,
              }}
            />
          ))}
        </div>
      )}

      {showThunder && <div className="ws-bolt" />}

      {/* Subtil vignette for å lette teksten over scenen */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30" />

      <style>{css}</style>
    </div>
  );
}

function makeDrops(n: number) {
  return Array.from({ length: n }).map(() => ({
    x: Math.random() * 100,
    delay: Math.random() * 1.5,
    dur: 0.55 + Math.random() * 0.7,
    h: 10 + Math.random() * 14,
  }));
}
function makeSnow(n: number) {
  return Array.from({ length: n }).map(() => ({
    x: Math.random() * 100,
    delay: Math.random() * 8,
    dur: 6 + Math.random() * 8,
    size: 3 + Math.random() * 5,
    drift: (Math.random() - 0.5) * 80,
  }));
}
function makeStars(n: number) {
  return Array.from({ length: n }).map(() => ({
    x: Math.random() * 100,
    y: Math.random() * 55,
    size: 1 + Math.random() * 2,
    delay: Math.random() * 4,
    dur: 2 + Math.random() * 3,
  }));
}

const css = `
@keyframes ws-fall {
  0% { transform: translate3d(0, -10vh, 0); opacity: 0; }
  10% { opacity: 0.9; }
  100% { transform: translate3d(8px, 110vh, 0); opacity: 0.9; }
}
@keyframes ws-snowfall {
  0% { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translate3d(var(--drift, 0), 110vh, 0) rotate(360deg); opacity: 0.9; }
}
@keyframes ws-cloud-drift {
  0% { transform: translateX(-30%); }
  100% { transform: translateX(130%); }
}
@keyframes ws-fog-drift {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(50%); }
}
@keyframes ws-twinkle {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}
@keyframes ws-rays-rot {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
@keyframes ws-bolt {
  0%, 92%, 100% { opacity: 0; }
  93%, 94% { opacity: 1; }
  95% { opacity: 0; }
  96%, 97% { opacity: 0.8; }
}

.ws-drop {
  position: absolute;
  top: -10vh;
  width: 1.5px;
  background: linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(200,225,255,0.85) 60%, rgba(255,255,255,0.95) 100%);
  border-radius: 2px;
  animation: ws-fall linear infinite;
  filter: drop-shadow(0 0 2px rgba(180,210,255,0.5));
}
.ws-drop--sleet {
  width: 2px;
  background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(220,235,250,0.9));
}

.ws-flake {
  position: absolute;
  top: -10vh;
  background: radial-gradient(circle at 30% 30%, #fff, rgba(255,255,255,0.6) 60%, transparent 70%);
  border-radius: 50%;
  animation: ws-snowfall linear infinite;
  box-shadow: 0 0 4px rgba(255,255,255,0.6);
}

.ws-star {
  position: absolute;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 4px rgba(255,255,255,0.9);
  animation: ws-twinkle ease-in-out infinite;
}

.ws-sun {
  position: absolute;
  top: 8%;
  right: 12%;
  width: 140px; height: 140px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff6c8 0%, #ffd86b 40%, rgba(255,200,90,0) 70%);
  filter: blur(0.5px);
  opacity: 0.85;
}
.ws-rays {
  position: absolute;
  top: calc(8% + 70px);
  right: calc(12% + 70px);
  width: 520px; height: 520px;
  transform: translate(50%, -50%);
  background:
    conic-gradient(from 0deg,
      rgba(255,240,180,0) 0deg,
      rgba(255,240,180,0.18) 10deg,
      rgba(255,240,180,0) 20deg,
      rgba(255,240,180,0.12) 50deg,
      rgba(255,240,180,0) 70deg,
      rgba(255,240,180,0.2) 110deg,
      rgba(255,240,180,0) 130deg,
      rgba(255,240,180,0.14) 180deg,
      rgba(255,240,180,0) 200deg,
      rgba(255,240,180,0.18) 240deg,
      rgba(255,240,180,0) 260deg,
      rgba(255,240,180,0.12) 300deg,
      rgba(255,240,180,0) 320deg,
      rgba(255,240,180,0.16) 350deg,
      rgba(255,240,180,0) 360deg);
  mix-blend-mode: screen;
  animation: ws-rays-rot 80s linear infinite;
  pointer-events: none;
  mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 35%, transparent 65%);
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 35%, transparent 65%);
}

.ws-moon {
  position: absolute;
  top: 10%;
  right: 14%;
  width: 90px; height: 90px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff 0%, #e9eef7 50%, #b9c4d6 100%);
  box-shadow: 0 0 60px rgba(220,230,255,0.45), 0 0 14px rgba(255,255,255,0.5);
}

.ws-cloud {
  position: absolute;
  width: 360px; height: 110px;
  border-radius: 60px;
  background:
    radial-gradient(circle at 25% 60%, rgba(255,255,255,0.95) 0 22%, transparent 23%),
    radial-gradient(circle at 50% 35%, rgba(255,255,255,0.95) 0 28%, transparent 29%),
    radial-gradient(circle at 75% 60%, rgba(255,255,255,0.95) 0 24%, transparent 25%),
    linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(230,235,245,0.7));
  filter: blur(2px);
  animation: ws-cloud-drift linear infinite;
}
.ws-cloud--a { top: 4%;  transform: scale(1); animation-duration: 90s; }
.ws-cloud--b { top: 18%; transform: scale(0.7); animation-duration: 130s; animation-delay: -40s; }
.ws-cloud--c { top: 30%; transform: scale(1.2); animation-duration: 160s; animation-delay: -90s; }
.ws-cloud--d { top: 12%; transform: scale(0.9); animation-duration: 110s; animation-delay: -25s; }

.ws-fog {
  position: absolute;
  left: 0; right: 0;
  height: 90px;
  background: linear-gradient(to bottom, rgba(220,225,235,0) 0%, rgba(220,225,235,0.55) 50%, rgba(220,225,235,0) 100%);
  filter: blur(8px);
  animation: ws-fog-drift ease-in-out infinite alternate;
}

.ws-bolt {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.85), rgba(255,255,255,0) 60%);
  mix-blend-mode: screen;
  animation: ws-bolt 7s ease-in-out infinite;
}
`;
