/**
 * Dekorativ "app-ikon"-scene for gressklipperen.
 * Viser en stilisert gressklipper i en avrundet ramme med langt gress ved siden av.
 * Når `isActive` er true beveger klipperen seg og gresset blir klippet kortere.
 * Ren SVG/CSS — ingen bilder, ingen API-kall.
 */

type Props = {
  isActive?: boolean;
  className?: string;
};

export function MowerScene({ isActive = true, className = "" }: Props) {
  return (
    <div
      className={`relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-[28%] border border-primary/30 bg-gradient-to-br from-[#0a1a14] via-[#0d1f17] to-[#06120c] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ${className}`}
      aria-hidden
    >
      {/* glow under klipper */}
      <div className="pointer-events-none absolute inset-x-10 bottom-8 h-12 rounded-full bg-emerald-400/25 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-16 bottom-9 h-6 rounded-full bg-amber-400/25 blur-xl" />

      {/* gress-felt (SVG) */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="grass-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3aa66a" />
            <stop offset="100%" stopColor="#0f3a25" />
          </linearGradient>
          <linearGradient id="body-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a2735" />
            <stop offset="60%" stopColor="#0c1620" />
            <stop offset="100%" stopColor="#050a10" />
          </linearGradient>
          <linearGradient id="hood-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#aab4c0" />
            <stop offset="100%" stopColor="#5a6470" />
          </linearGradient>
        </defs>

        {/* langt gress på begge sider — animerer kortere når aktiv */}
        <g className={isActive ? "grass-trim" : ""}>
          {Array.from({ length: 26 }).map((_, i) => {
            const x = 8 + i * 7;
            // hopp over senterområdet der klipperen står
            if (x > 70 && x < 130) return null;
            const h = 22 + ((i * 13) % 14);
            const sway = (i % 2 === 0 ? 1 : -1) * 0.6;
            return (
              <line
                key={i}
                x1={x}
                y1={170}
                x2={x + sway}
                y2={170 - h}
                stroke="url(#grass-grad)"
                strokeWidth={2.2}
                strokeLinecap="round"
                style={{
                  animationDelay: `${(i % 8) * 0.15}s`,
                  transformOrigin: `${x}px 170px`,
                }}
              />
            );
          })}
        </g>

        {/* bakke */}
        <rect x="0" y="168" width="200" height="32" fill="#0a1f15" />
        <rect x="0" y="168" width="200" height="2" fill="#1a3a28" />
      </svg>

      {/* klipper (futuristisk bil-stil) */}
      <div
        className={`absolute left-1/2 bottom-[18%] w-[58%] -translate-x-1/2 ${
          isActive ? "mower-roam" : ""
        }`}
      >
        <svg viewBox="0 0 200 110" className="h-auto w-full drop-shadow-[0_8px_18px_rgba(0,0,0,0.6)]">
          {/* skygge */}
          <ellipse cx="100" cy="100" rx="78" ry="6" fill="rgba(0,0,0,0.55)" />

          {/* karosseri */}
          <path
            d="M20 78 Q26 50 60 44 L140 44 Q174 50 180 78 L180 88 Q180 94 174 94 L26 94 Q20 94 20 88 Z"
            fill="url(#body-grad)"
            stroke="#2a3644"
            strokeWidth="1"
          />
          {/* hood / topp */}
          <path
            d="M52 50 Q60 32 100 30 Q140 32 148 50 Z"
            fill="url(#hood-grad)"
            opacity="0.9"
          />
          {/* oransje aksent-stripe */}
          <path
            d="M22 78 L178 78"
            stroke="#ff8a1f"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.95"
          />
          <path
            d="M30 70 L48 70"
            stroke="#ff8a1f"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M152 70 L170 70"
            stroke="#ff8a1f"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* lykter — grønn glow når aktiv */}
          <circle cx="174" cy="68" r="3.5" fill={isActive ? "#3ee08a" : "#1f4a30"}>
            {isActive && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="1.6s" repeatCount="indefinite" />
            )}
          </circle>
          <circle cx="26" cy="68" r="3" fill="#ffb066" opacity="0.85" />

          {/* hjul */}
          <circle cx="48" cy="92" r="11" fill="#0a0f15" stroke="#2a3644" />
          <circle cx="48" cy="92" r="4" fill="#3a4654" />
          <circle cx="152" cy="92" r="11" fill="#0a0f15" stroke="#2a3644" />
          <circle cx="152" cy="92" r="4" fill="#3a4654" />

          {/* klippeblad-glow under */}
          {isActive && (
            <circle cx="100" cy="92" r="14" fill="#3ee08a" opacity="0.25">
              <animate attributeName="opacity" values="0.15;0.4;0.15" dur="0.6s" repeatCount="indefinite" />
            </circle>
          )}
        </svg>
      </div>

      {/* fnugg / partikler */}
      {isActive && (
        <>
          <span className="absolute left-[18%] top-[28%] h-1.5 w-1.5 rounded-full bg-amber-300/70 blur-[1px] animate-[float_3.2s_ease-in-out_infinite]" />
          <span className="absolute right-[20%] top-[22%] h-1 w-1 rounded-full bg-emerald-300/70 blur-[1px] animate-[float_4s_ease-in-out_infinite_0.4s]" />
          <span className="absolute right-[12%] bottom-[40%] h-1.5 w-1.5 rounded-full bg-amber-200/60 blur-[1px] animate-[float_3.6s_ease-in-out_infinite_0.8s]" />
        </>
      )}

      <style>{`
        @keyframes mower-roam {
          0%, 100% { transform: translate(-58%, 0); }
          25%      { transform: translate(-72%, -2px); }
          50%      { transform: translate(-50%, 0); }
          75%      { transform: translate(-44%, -2px); }
        }
        .mower-roam { animation: mower-roam 6s ease-in-out infinite; }

        @keyframes grass-trim {
          0%   { transform: scaleY(1);    }
          45%  { transform: scaleY(1);    }
          55%  { transform: scaleY(0.35); }
          95%  { transform: scaleY(0.35); }
          100% { transform: scaleY(1);    }
        }
        .grass-trim line { animation: grass-trim 6s ease-in-out infinite; }

        @keyframes float {
          0%,100% { transform: translateY(0); opacity: 0.6; }
          50%     { transform: translateY(-10px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
