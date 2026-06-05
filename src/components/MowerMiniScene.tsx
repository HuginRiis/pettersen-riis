/**
 * Liten gressklipper-scene for smart-dashbord-tile.
 * - isActive=false (lader/parkert): langt gress som blåser i vinden ved siden av
 * - isActive=true (klipper): gresset klippes kort
 */
import mowerAsset from "@/assets/gardena-mower-product.webp.asset.json";

type Props = { isActive?: boolean; size?: number; className?: string };

export function MowerMiniScene({ isActive = false, size = 64, className = "" }: Props) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-gradient-to-b from-emerald-950/40 to-emerald-900/10 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* gress-blader (SVG) bak klipperen */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="mm-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4dd08a" />
            <stop offset="100%" stopColor="#0f3a25" />
          </linearGradient>
        </defs>
        {Array.from({ length: 18 }).map((_, i) => {
          const x = 4 + i * 5.5;
          const h = 30 + ((i * 11) % 18);
          return (
            <line
              key={i}
              x1={x}
              y1={96}
              x2={x}
              y2={96 - h}
              stroke="url(#mm-grass)"
              strokeWidth="1.4"
              strokeLinecap="round"
              className={isActive ? "mm-grass-trim" : "mm-grass-wind"}
              style={{
                transformOrigin: `${x}px 96px`,
                animationDelay: `${(i % 6) * 0.18}s`,
              }}
            />
          );
        })}
        {/* bakke */}
        <rect x="0" y="94" width="100" height="6" fill="#0a1f15" />
      </svg>

      {/* klipper-bilde foran */}
      <img
        src={mowerAsset.url}
        alt=""
        loading="lazy"
        className="absolute left-1/2 bottom-[6%] w-[78%] -translate-x-1/2 object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.6)]"
        style={isActive ? { animation: "mm-roam 4.5s ease-in-out infinite" } : undefined}
      />

      <style>{`
        @keyframes mm-wind {
          0%,100% { transform: rotate(-6deg); }
          50%     { transform: rotate(6deg); }
        }
        .mm-grass-wind { animation: mm-wind 2.6s ease-in-out infinite; }
        @keyframes mm-trim {
          0%   { transform: scaleY(1); }
          40%  { transform: scaleY(1); }
          55%  { transform: scaleY(0.25); }
          100% { transform: scaleY(0.25); }
        }
        .mm-grass-trim { animation: mm-trim 4.5s ease-in-out infinite; }
        @keyframes mm-roam {
          0%,100% { transform: translateX(-58%); }
          50%     { transform: translateX(-42%); }
        }
      `}</style>
    </div>
  );
}
