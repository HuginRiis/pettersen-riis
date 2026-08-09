import { memo, useMemo } from "react";
import type { GlassKind } from "@/components/weather/WeatherFX";

/**
 * Naturlig horisont: fjellkjeder i lag med dis, og et vann med
 * speiling, bølgeskimmer og små krusninger. Tilpasser seg været
 * (dag/natt/tåke) og vindstyrken (raskere bølger).
 */
export const NatureSceneFX = memo(function NatureSceneFX({
  kind,
  wind = 0,
  intensity = 1,
}: {
  kind: GlassKind;
  wind?: number;
  intensity?: number;
}) {
  const night = kind === "night" || kind === "night-clear";
  const gloom = kind === "rain" || kind === "sleet" || kind === "thunder" || kind === "cloudy";
  const foggy = kind === "fog";

  // Fargepalett for scenen (natt / grått / dag)
  const p = night
    ? { far: "#1b2540", mid: "#141c31", near: "#0c1223", water: "#0b1226", glint: "#8fb6ff", haze: "#243456" }
    : gloom
      ? { far: "#4a5a6b", mid: "#36434f", near: "#232d37", water: "#2a3a49", glint: "#c8d8e6", haze: "#5b6c7c" }
      : { far: "#5b7ea3", mid: "#3f5f80", near: "#27405a", water: "#274b6b", glint: "#ffe6b0", haze: "#8fb2cf" };

  const waveDur = Math.max(5, 16 - Math.min(14, wind)) ; // sterk vind = raskere
  const ripples = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        top: 4 + (i * 6.6) % 88,
        left: (i * 37) % 90,
        w: 40 + ((i * 53) % 120),
        dur: 3.5 + ((i * 7) % 40) / 10,
        delay: -((i * 13) % 60) / 10,
        op: 0.10 + ((i * 17) % 18) / 100,
      })),
    [],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] overflow-hidden"
      style={{ height: "46vh", opacity: Math.max(0.35, Math.min(1, intensity)) }}
    >
      {/* Atmosfærisk dis mot horisonten */}
      <div
        className="absolute inset-x-0 top-0 h-24"
        style={{ background: `linear-gradient(to bottom, transparent, ${p.haze}55)` }}
      />

      {/* Fjern fjellkjede */}
      <svg className="absolute inset-x-0 top-[10%] w-full" viewBox="0 0 1200 200" preserveAspectRatio="none" style={{ height: "34%" }}>
        <path
          d="M0,200 L0,120 L90,70 L150,105 L230,45 L300,95 L380,55 L470,120 L560,70 L640,110 L730,50 L820,100 L900,65 L1000,115 L1090,75 L1200,120 L1200,200 Z"
          fill={p.far}
          opacity={foggy ? 0.35 : 0.75}
        />
      </svg>

      {/* Midtre fjellkjede */}
      <svg className="absolute inset-x-0 top-[22%] w-full" viewBox="0 0 1200 200" preserveAspectRatio="none" style={{ height: "34%" }}>
        <path
          d="M0,200 L0,140 L110,95 L190,135 L280,70 L370,125 L460,85 L560,140 L660,90 L760,130 L860,80 L960,130 L1070,95 L1200,140 L1200,200 Z"
          fill={p.mid}
          opacity={foggy ? 0.5 : 0.92}
        />
      </svg>

      {/* Nær åskam med snøflekker/lys kant */}
      <svg className="absolute inset-x-0 top-[36%] w-full" viewBox="0 0 1200 200" preserveAspectRatio="none" style={{ height: "26%" }}>
        <path
          d="M0,200 L0,150 L140,120 L260,155 L400,115 L540,160 L700,120 L860,158 L1010,125 L1200,155 L1200,200 Z"
          fill={p.near}
        />
      </svg>

      {/* Vann */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "46%",
          background: `linear-gradient(to bottom, ${p.water} 0%, ${p.water}f2 40%, ${night ? "#060a14" : gloom ? "#16202a" : "#132a3e"} 100%)`,
        }}
      >
        {/* Speiling av fjell (myk, opp-ned) */}
        <svg className="absolute inset-x-0 top-0 w-full opacity-25 blur-[2px]" viewBox="0 0 1200 200" preserveAspectRatio="none" style={{ height: "45%", transform: "scaleY(-1)" }}>
          <path
            d="M0,200 L0,150 L140,120 L260,155 L400,115 L540,160 L700,120 L860,158 L1010,125 L1200,155 L1200,200 Z"
            fill={p.near}
          />
        </svg>

        {/* Glitrende stripe fra lyskilden */}
        <div
          className="absolute left-1/2 top-0 h-full w-[26%] -translate-x-1/2"
          style={{
            background: `linear-gradient(to bottom, ${p.glint}44, transparent 70%)`,
            filter: "blur(6px)",
            animation: `natur-shimmer ${waveDur}s ease-in-out infinite`,
          }}
        />

        {/* Bølgelinjer */}
        {ripples.map((r, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              top: `${r.top}%`,
              left: `${r.left}%`,
              width: r.w,
              height: 2,
              background: `linear-gradient(to right, transparent, ${p.glint}, transparent)`,
              opacity: r.op,
              animation: `natur-ripple ${r.dur * (waveDur / 10)}s ease-in-out ${r.delay}s infinite`,
              willChange: "transform, opacity",
            }}
          />
        ))}

        {/* Strandkant / forgrunnssilhuett */}
        <svg className="absolute inset-x-0 bottom-0 w-full" viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ height: "22%" }}>
          <path d="M0,60 L0,34 C160,20 300,44 470,30 C640,16 780,42 950,28 C1080,17 1140,30 1200,24 L1200,60 Z" fill={night ? "#05080f" : "#0d1620"} opacity="0.9" />
        </svg>
      </div>

      <style>{`
        @keyframes natur-ripple {
          0%,100% { transform: translateX(0) scaleX(1); opacity: 0.08; }
          50% { transform: translateX(14px) scaleX(1.15); opacity: 0.28; }
        }
        @keyframes natur-shimmer {
          0%,100% { opacity: 0.55; transform: translateX(-50%) scaleX(1); }
          50% { opacity: 0.9; transform: translateX(-50%) scaleX(1.25); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="natur-ripple"], [style*="natur-shimmer"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
});
