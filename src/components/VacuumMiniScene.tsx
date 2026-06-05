/**
 * Liten støvsuger-scene for smart-dashbord-tile.
 * - isActive=false (lader): støv vrimler rundt støvsugeren
 * - isActive=true (kjører): støvpartikler suges inn mot midten
 */
import roboAsset from "@/assets/roborock-product.jpeg.asset.json";

type Props = { isActive?: boolean; size?: number; className?: string };

const PARTICLES = Array.from({ length: 10 }).map((_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  const r = 36 + (i % 3) * 5;
  const x = 50 + Math.cos(angle) * r;
  const y = 50 + Math.sin(angle) * r * 0.85;
  return { id: i, x, y, delay: (i * 0.18).toFixed(2), size: 3 + (i % 2) };
});

export function VacuumMiniScene({ isActive = false, size = 64, className = "" }: Props) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <img
        src={roboAsset.url}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0">
        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className={`vac-dust ${isActive ? "vac-dust-suck" : "vac-dust-orbit"}`}
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                animationDelay: `${p.delay}s`,
                "--dx": `${50 - p.x}%`,
                "--dy": `${50 - p.y}%`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <style>{`
        .vac-dust {
          position: absolute;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(255,230,190,0.95), rgba(200,170,120,0.2) 70%, transparent);
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        @keyframes vac-orbit {
          0%,100% { transform: translate(-50%, -50%) translate(0,0); opacity: .55; }
          50%     { transform: translate(-50%, -50%) translate(0,-4px); opacity: 1; }
        }
        .vac-dust-orbit { animation: vac-orbit 3.2s ease-in-out infinite; }
        @keyframes vac-suck {
          0%   { transform: translate(-50%, -50%) translate(0,0) scale(1); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: .9; }
          100% { transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(.2); opacity: 0; }
        }
        .vac-dust-suck { animation: vac-suck 2.2s ease-in infinite; }
      `}</style>
    </div>
  );
}
