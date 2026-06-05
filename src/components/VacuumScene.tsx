/**
 * Dekorativ "app-ikon"-scene for støvsugeren.
 * Stilisert Roborock i avrundet ramme med svevende støvpartikler rundt.
 * Når `isActive` er true suges partiklene inn mot støvsugeren.
 * Ren SVG/CSS — ingen bilder, ingen API-kall.
 */

type Props = {
  isActive?: boolean;
  className?: string;
};

// 12 partikler i ring rundt støvsugeren
const PARTICLES = Array.from({ length: 12 }).map((_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const r = 38 + (i % 3) * 4; // radius i %
  const x = 50 + Math.cos(angle) * r;
  const y = 50 + Math.sin(angle) * r * 0.72; // litt flatere ellipse
  return { id: i, x, y, delay: (i * 0.18).toFixed(2), size: 4 + (i % 3) };
});

export function VacuumScene({ isActive = true, className = "" }: Props) {
  return (
    <div
      className={`relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-[28%] border border-primary/30 bg-gradient-to-br from-[#1a0d0d] via-[#180c10] to-[#0a0608] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ${className}`}
      aria-hidden
    >
      {/* glow */}
      <div className="pointer-events-none absolute inset-x-10 bottom-10 h-14 rounded-full bg-rose-500/25 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-16 bottom-12 h-6 rounded-full bg-cyan-400/25 blur-xl" />

      {/* støvpartikler — absolutt-posisjonerte div-er som suges inn mot senter */}
      <div className="absolute inset-0">
        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className={isActive ? "dust dust-suck" : "dust"}
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDelay: `${p.delay}s`,
                // CSS-variabler for sluttposisjon (senter = 50/50)
                "--dx": `${50 - p.x}%`,
                "--dy": `${50 - p.y}%`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* støvsuger (top-down) */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
      >
        <defs>
          <radialGradient id="body-r" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#2a2f36" />
            <stop offset="60%" stopColor="#14181d" />
            <stop offset="100%" stopColor="#06080b" />
          </radialGradient>
          <radialGradient id="lid-r" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3a4048" />
            <stop offset="100%" stopColor="#1a1e23" />
          </radialGradient>
        </defs>

        {/* ytre skygge */}
        <ellipse cx="100" cy="160" rx="62" ry="6" fill="rgba(0,0,0,0.55)" />

        {/* karosseri */}
        <circle cx="100" cy="100" r="58" fill="url(#body-r)" stroke="#2a3038" strokeWidth="1" />

        {/* rød LED-ring (front) */}
        <path
          d="M 50 100 A 50 50 0 0 1 150 100"
          fill="none"
          stroke="#ff3050"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.95"
        >
          {isActive && (
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.8s" repeatCount="indefinite" />
          )}
        </path>
        {/* cyan ring (bak) */}
        <path
          d="M 50 100 A 50 50 0 0 0 150 100"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.9"
        >
          {isActive && (
            <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
          )}
        </path>

        {/* topp-lokk + LIDAR-tårn */}
        <circle cx="100" cy="100" r="40" fill="url(#lid-r)" />
        <circle cx="100" cy="100" r="14" fill="#1f242b" stroke="#3a4048" />
        <circle cx="100" cy="100" r="5" fill="#0a0d11" />
        {isActive && (
          <circle cx="100" cy="100" r="18" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.6">
            <animate attributeName="r" values="14;28;14" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>

      <style>{`
        .dust {
          position: absolute;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(255,220,180,0.95), rgba(255,180,120,0.2) 70%, transparent);
          filter: blur(0.5px);
          transform: translate(-50%, -50%);
          opacity: 0.85;
        }
        .dust:not(.dust-suck) {
          animation: dust-float 4s ease-in-out infinite;
        }
        @keyframes dust-float {
          0%,100% { transform: translate(-50%, -50%) translateY(0); opacity: 0.7; }
          50%     { transform: translate(-50%, -50%) translateY(-6px); opacity: 1; }
        }
        .dust-suck {
          animation: dust-suck 2.6s ease-in infinite;
        }
        @keyframes dust-suck {
          0%   { transform: translate(-50%, -50%) translate(0, 0) scale(1); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 0.9; }
          100% { transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
