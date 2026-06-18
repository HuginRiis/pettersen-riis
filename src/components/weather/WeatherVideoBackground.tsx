import { useMemo } from "react";
import type { GlassKind } from "./WeatherFX";

/**
 * Pure CSS/SVG weather background. No video, no external assets.
 * Renders an animated sky (gradient + sun/moon/stars + drifting clouds + lightning)
 * that adapts to the current GlassKind.
 */

type SkyConfig = {
  gradient: string;
  cloudOpacity: number;
  cloudTint: string;
  cloudSpeed: number; // seconds for one full pass
  showSun?: boolean;
  showMoon?: boolean;
  showStars?: boolean;
  showLightning?: boolean;
  fog?: boolean;
  haze?: number; // 0..1 white overlay
};

function configFor(kind: GlassKind): SkyConfig {
  switch (kind) {
    case "clear":
      return {
        gradient: "linear-gradient(180deg, #1A5A94 0%, #3A8BC4 55%, #6BB5E0 100%)",
        cloudOpacity: 0,
        cloudTint: "#ffffff",
        cloudSpeed: 90,
        showSun: true,
      };
    case "fair":
      return {
        gradient: "linear-gradient(180deg, #1E6BA8 0%, #4A9BD4 60%, #7FC4E8 100%)",
        cloudOpacity: 0.55,
        cloudTint: "#ffffff",
        cloudSpeed: 75,
        showSun: true,
      };
    case "partly":
      return {
        gradient: "linear-gradient(180deg, #2A6FA0 0%, #5A9FD0 55%, #90C8E8 100%)",
        cloudOpacity: 0.85,
        cloudTint: "#ffffff",
        cloudSpeed: 60,
        showSun: true,
      };
    case "cloudy":
      return {
        gradient: "linear-gradient(180deg, #7B8A99 0%, #A4B2BF 60%, #C9D2DA 100%)",
        cloudOpacity: 1,
        cloudTint: "#f1f4f8",
        cloudSpeed: 50,
        haze: 0.1,
      };
    case "rain":
      return {
        gradient: "linear-gradient(180deg, #46525E 0%, #677581 60%, #8A95A0 100%)",
        cloudOpacity: 1,
        cloudTint: "#cfd6dd",
        cloudSpeed: 40,
        haze: 0.15,
      };
    case "sleet":
      return {
        gradient: "linear-gradient(180deg, #56636F 0%, #7B8893 60%, #A5AEB6 100%)",
        cloudOpacity: 1,
        cloudTint: "#dde3e9",
        cloudSpeed: 38,
        haze: 0.18,
      };
    case "thunder":
      return {
        gradient: "linear-gradient(180deg, #2A2F3A 0%, #3B4250 55%, #565E6C 100%)",
        cloudOpacity: 1,
        cloudTint: "#9aa1ad",
        cloudSpeed: 30,
        showLightning: true,
        haze: 0.2,
      };
    case "snow":
      return {
        gradient: "linear-gradient(180deg, #8FA0B0 0%, #B6C3CE 55%, #DEE6ED 100%)",
        cloudOpacity: 1,
        cloudTint: "#ffffff",
        cloudSpeed: 55,
        haze: 0.25,
      };
    case "fog":
      return {
        gradient: "linear-gradient(180deg, #A3ABB2 0%, #BFC6CC 55%, #D9DDE0 100%)",
        cloudOpacity: 0.6,
        cloudTint: "#ffffff",
        cloudSpeed: 85,
        fog: true,
        haze: 0.35,
      };
    case "night":
      return {
        gradient: "linear-gradient(180deg, #0B1424 0%, #182338 55%, #243049 100%)",
        cloudOpacity: 0.7,
        cloudTint: "#2a3650",
        cloudSpeed: 70,
        showMoon: true,
        showStars: true,
      };
    case "night-clear":
      return {
        gradient: "linear-gradient(180deg, #060B1A 0%, #0F1A33 55%, #1B2745 100%)",
        cloudOpacity: 0,
        cloudTint: "#1f2a44",
        cloudSpeed: 110,
        showMoon: true,
        showStars: true,
      };
    default:
      return {
        gradient: "linear-gradient(180deg, #2570A8 0%, #569FD4 55%, #8AC8EC 100%)",
        cloudOpacity: 0.4,
        cloudTint: "#ffffff",
        cloudSpeed: 75,
      };
  }
}

function Cloud({ scale = 1, color = "#fff", opacity = 1 }: { scale?: number; color?: string; opacity?: number }) {
  return (
    <svg
      viewBox="0 0 200 80"
      width={200 * scale}
      height={80 * scale}
      style={{ opacity, filter: "blur(0.4px)" }}
    >
      <defs>
        <radialGradient id={`cg-${color}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.85" />
        </radialGradient>
      </defs>
      <g fill={`url(#cg-${color})`}>
        <ellipse cx="60" cy="50" rx="40" ry="22" />
        <ellipse cx="100" cy="40" rx="46" ry="28" />
        <ellipse cx="140" cy="48" rx="38" ry="22" />
        <ellipse cx="80" cy="55" rx="30" ry="18" />
        <ellipse cx="125" cy="58" rx="34" ry="18" />
      </g>
    </svg>
  );
}

function Stars() {
  // Deterministic positions
  const stars = useMemo(() => {
    const out: { x: number; y: number; r: number; d: number }[] = [];
    let seed = 7;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 80; i++) {
      out.push({
        x: rand() * 100,
        y: rand() * 65,
        r: 0.6 + rand() * 1.4,
        d: rand() * 4,
      });
    }
    return out;
  }, []);
  return (
    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r / 10}
          fill="#fff"
          opacity={0.85}
          style={{ animation: `twinkle 3.5s ease-in-out ${s.d}s infinite` }}
        />
      ))}
    </svg>
  );
}

export function WeatherVideoBackground({ kind }: { kind: GlassKind }) {
  const cfg = useMemo(() => configFor(kind), [kind]);

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden -z-10"
      style={{ background: cfg.gradient }}
    >
      {/* Constant readability overlay — deep blue tint */}
      <div className="absolute inset-0" style={{ background: "rgba(10, 30, 60, 0.28)" }} />
      {/* Stars (night) */}
      {cfg.showStars && <Stars />}

      {/* Sun */}
      {cfg.showSun && (
        <div
          className="absolute"
          style={{
            top: "8%",
            right: "12%",
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "radial-gradient(circle, #FFF6C8 0%, #FFE271 35%, rgba(255,210,80,0.0) 70%)",
            boxShadow: "0 0 80px 30px rgba(255, 220, 120, 0.45)",
            animation: "sunPulse 8s ease-in-out infinite",
          }}
        />
      )}

      {/* Moon */}
      {cfg.showMoon && (
        <div
          className="absolute"
          style={{
            top: "10%",
            right: "14%",
            width: 110,
            height: 110,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #F4F1E4 0%, #D8D2BD 60%, #9C9580 100%)",
            boxShadow: "0 0 60px 20px rgba(230, 225, 200, 0.25)",
          }}
        />
      )}

      {/* Drifting cloud layers */}
      {cfg.cloudOpacity > 0 && (
        <>
          <div
            className="absolute"
            style={{
              top: "12%",
              left: 0,
              width: "200%",
              animation: `drift ${cfg.cloudSpeed}s linear infinite`,
              opacity: cfg.cloudOpacity,
            }}
          >
            <div className="flex gap-32">
              <Cloud scale={1.2} color={cfg.cloudTint} />
              <Cloud scale={0.9} color={cfg.cloudTint} opacity={0.85} />
              <Cloud scale={1.4} color={cfg.cloudTint} />
              <Cloud scale={1.0} color={cfg.cloudTint} opacity={0.9} />
              <Cloud scale={1.2} color={cfg.cloudTint} />
              <Cloud scale={0.9} color={cfg.cloudTint} opacity={0.85} />
            </div>
          </div>
          <div
            className="absolute"
            style={{
              top: "32%",
              left: 0,
              width: "200%",
              animation: `drift ${cfg.cloudSpeed * 1.6}s linear infinite`,
              animationDelay: `-${cfg.cloudSpeed * 0.3}s`,
              opacity: cfg.cloudOpacity * 0.85,
            }}
          >
            <div className="flex gap-40">
              <Cloud scale={1.6} color={cfg.cloudTint} opacity={0.9} />
              <Cloud scale={1.1} color={cfg.cloudTint} />
              <Cloud scale={1.8} color={cfg.cloudTint} opacity={0.85} />
              <Cloud scale={1.3} color={cfg.cloudTint} />
            </div>
          </div>
          <div
            className="absolute"
            style={{
              top: "55%",
              left: 0,
              width: "200%",
              animation: `drift ${cfg.cloudSpeed * 2.2}s linear infinite`,
              animationDelay: `-${cfg.cloudSpeed * 0.6}s`,
              opacity: cfg.cloudOpacity * 0.6,
            }}
          >
            <div className="flex gap-48">
              <Cloud scale={2.0} color={cfg.cloudTint} opacity={0.7} />
              <Cloud scale={1.5} color={cfg.cloudTint} opacity={0.8} />
              <Cloud scale={2.2} color={cfg.cloudTint} opacity={0.65} />
            </div>
          </div>
        </>
      )}

      {/* Fog overlay */}
      {cfg.fog && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 60%, rgba(255,255,255,0.55), transparent 60%), radial-gradient(ellipse at 70% 40%, rgba(255,255,255,0.45), transparent 60%)",
            animation: "fogDrift 30s ease-in-out infinite alternate",
          }}
        />
      )}

      {/* Lightning */}
      {cfg.showLightning && (
        <div
          className="absolute inset-0"
          style={{
            background: "white",
            opacity: 0,
            animation: "lightning 7s ease-out infinite",
          }}
        />
      )}

      {/* Haze */}
      {cfg.haze ? (
        <div
          className="absolute inset-0"
          style={{ background: `rgba(255,255,255,${cfg.haze})` }}
        />
      ) : null}

      <style>{`
        @keyframes drift {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes sunPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.04); filter: brightness(1.08); }
        }
        @keyframes fogDrift {
          0% { transform: translateX(-3%) translateY(0); }
          100% { transform: translateX(3%) translateY(-2%); }
        }
        @keyframes lightning {
          0%, 92%, 100% { opacity: 0; }
          93% { opacity: 0.0; }
          93.5% { opacity: 0.85; }
          94% { opacity: 0.1; }
          94.5% { opacity: 0.7; }
          95% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
