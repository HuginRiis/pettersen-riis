/**
 * Torch — en mektig Game-of-Thrones-fakkel med animert flamme,
 * pulserende glød og gnister som stiger.
 *
 * Tegnes som SVG slik at alt holder seg crispt og animeres på GPU.
 * Bruk `side="left"` eller `"right"` for å få flammen til å lene
 * naturlig innover mot portrettet.
 */

type TorchProps = {
  side?: "left" | "right";
  className?: string;
};

export function Torch({ side = "left", className = "" }: TorchProps) {
  // Speilvend hele svg for høyre side, slik at flammen lener seg innover
  const flip = side === "right" ? "scale(-1, 1) translate(-80, 0)" : undefined;

  return (
    <div
      className={`pointer-events-none select-none ${className}`}
      aria-hidden
    >
      {/* Pulserende bakgrunns-glød — bak fakkelen */}
      <div
        className="absolute inset-0 torch-glow"
        style={{
          background:
            "radial-gradient(ellipse at center 18%, oklch(0.78 0.18 55 / 0.55), oklch(0.6 0.2 30 / 0.25) 35%, transparent 65%)",
        }}
      />

      <svg
        viewBox="0 0 80 320"
        preserveAspectRatio="xMidYMin meet"
        className="relative w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Flamme-gradient: hvit kjerne → gul → oransje → rød */}
          <radialGradient id="flameGrad" cx="50%" cy="70%" r="60%">
            <stop offset="0%" stopColor="#fff8d6" stopOpacity="1" />
            <stop offset="25%" stopColor="#ffe28a" stopOpacity="1" />
            <stop offset="55%" stopColor="#ff9b3d" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#e0431a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#5a0e07" stopOpacity="0" />
          </radialGradient>

          {/* Indre, skarpere kjerne */}
          <radialGradient id="flameCore" cx="50%" cy="80%" r="45%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="40%" stopColor="#ffd56b" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
          </radialGradient>

          {/* Smijernsholder-gradient */}
          <linearGradient id="ironGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1a1410" />
            <stop offset="50%" stopColor="#5a4a3a" />
            <stop offset="100%" stopColor="#1a1410" />
          </linearGradient>

          <linearGradient id="woodGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2a1a0e" />
            <stop offset="50%" stopColor="#6b4a2a" />
            <stop offset="100%" stopColor="#2a1a0e" />
          </linearGradient>

          {/* Soft glød-blur til flammen */}
          <filter id="flameBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        <g transform={flip}>
          {/* ─── Brakett festet til "veggen" ─── */}
          <rect x="2" y="170" width="14" height="6" fill="url(#ironGrad)" />
          <rect x="2" y="200" width="14" height="6" fill="url(#ironGrad)" />
          <circle cx="9" cy="173" r="1.4" fill="#0a0806" />
          <circle cx="9" cy="203" r="1.4" fill="#0a0806" />

          {/* Diagonal arm fra vegg til fakkel */}
          <path
            d="M 16 173 L 34 188 L 36 196 L 18 206 Z"
            fill="url(#ironGrad)"
            stroke="#0a0806"
            strokeWidth="0.6"
          />

          {/* Ring som holder skaftet */}
          <ellipse cx="40" cy="195" rx="9" ry="4" fill="none" stroke="#3a2a1c" strokeWidth="2" />
          <ellipse cx="40" cy="195" rx="9" ry="4" fill="none" stroke="#7a5a3c" strokeWidth="0.6" />

          {/* ─── Skaft (treverk) ─── */}
          <rect x="35" y="150" width="10" height="120" rx="2" fill="url(#woodGrad)" />
          {/* Tre-årer */}
          <line x1="38" y1="155" x2="38" y2="265" stroke="#1a0d05" strokeWidth="0.4" opacity="0.6" />
          <line x1="42" y1="155" x2="42" y2="265" stroke="#1a0d05" strokeWidth="0.4" opacity="0.6" />
          {/* Bånd rundt skaftet */}
          <rect x="34" y="158" width="12" height="3" fill="#2a1a0e" />
          <rect x="34" y="240" width="12" height="3" fill="#2a1a0e" />

          {/* ─── Fakkelhode (jernkalk) ─── */}
          <path
            d="M 30 150 L 50 150 L 47 130 L 33 130 Z"
            fill="url(#ironGrad)"
            stroke="#0a0806"
            strokeWidth="0.6"
          />
          <ellipse cx="40" cy="130" rx="7" ry="2" fill="#1a1410" />
          {/* Glør i kalken */}
          <ellipse cx="40" cy="130" rx="5.5" ry="1.4" fill="#ff6a1a">
            <animate
              attributeName="fill"
              values="#ff6a1a;#ffaa3a;#ff4a0a;#ff6a1a"
              dur="1.4s"
              repeatCount="indefinite"
            />
          </ellipse>

          {/* ─── Pulserende glødskive bak flammen ─── */}
          <circle cx="40" cy="80" r="46" fill="url(#flameGrad)" opacity="0.35">
            <animate
              attributeName="r"
              values="44;52;46;50;44"
              dur="2.4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.3;0.45;0.32;0.4;0.3"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>

          {/* ─── Hovedflamme — morfes mellom fire silhuetter ─── */}
          <path fill="url(#flameGrad)" filter="url(#flameBlur)">
            <animate
              attributeName="d"
              dur="0.9s"
              repeatCount="indefinite"
              values="
                M 40 130 C 22 110, 24 80, 32 60 C 30 40, 38 22, 40 8 C 42 22, 50 40, 48 60 C 56 80, 58 110, 40 130 Z;
                M 40 130 C 20 112, 26 78, 34 58 C 28 38, 42 18, 40 4 C 44 20, 52 42, 46 60 C 60 82, 56 112, 40 130 Z;
                M 40 130 C 24 108, 22 82, 30 62 C 32 42, 36 24, 40 10 C 44 24, 48 42, 50 62 C 58 82, 56 108, 40 130 Z;
                M 40 130 C 22 110, 24 80, 32 60 C 30 40, 38 22, 40 8 C 42 22, 50 40, 48 60 C 56 80, 58 110, 40 130 Z
              "
            />
          </path>

          {/* ─── Indre flamme (lysere kjerne) ─── */}
          <path fill="url(#flameCore)">
            <animate
              attributeName="d"
              dur="0.7s"
              repeatCount="indefinite"
              values="
                M 40 128 C 30 112, 32 90, 36 72 C 34 56, 40 42, 40 28 C 40 42, 46 56, 44 72 C 50 90, 50 112, 40 128 Z;
                M 40 128 C 28 110, 34 88, 38 70 C 32 54, 42 38, 40 24 C 42 40, 48 56, 42 72 C 52 90, 52 112, 40 128 Z;
                M 40 128 C 32 112, 30 90, 36 74 C 36 58, 40 44, 40 30 C 40 44, 44 58, 44 74 C 50 90, 48 112, 40 128 Z;
                M 40 128 C 30 112, 32 90, 36 72 C 34 56, 40 42, 40 28 C 40 42, 46 56, 44 72 C 50 90, 50 112, 40 128 Z
              "
            />
          </path>

          {/* ─── Hvit-gul tunge på toppen ─── */}
          <ellipse cx="40" cy="40" rx="3" ry="14" fill="#fff5cc" opacity="0.85">
            <animate
              attributeName="cy"
              values="40;30;38;28;40"
              dur="0.8s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="ry"
              values="14;18;12;16;14"
              dur="0.8s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.85;1;0.7;0.95;0.85"
              dur="0.8s"
              repeatCount="indefinite"
            />
          </ellipse>

          {/* ─── Gnister som stiger ─── */}
          <circle r="1.2" fill="#ffd66b">
            <animate attributeName="cx" values="38;34;30" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="cy" values="60;20;-20" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle r="0.9" fill="#ffae4a">
            <animate attributeName="cx" values="42;48;52" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="cy" values="70;30;-10" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0" dur="2.6s" repeatCount="indefinite" />
          </circle>
          <circle r="1" fill="#ffe28a">
            <animate attributeName="cx" values="40;42;38" dur="3s" repeatCount="indefinite" />
            <animate attributeName="cy" values="50;10;-30" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.9;0" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle r="0.8" fill="#fff5cc">
            <animate attributeName="cx" values="36;30;26" dur="2.8s" begin="0.6s" repeatCount="indefinite" />
            <animate attributeName="cy" values="65;25;-5" dur="2.8s" begin="0.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0" dur="2.8s" begin="0.6s" repeatCount="indefinite" />
          </circle>
          <circle r="1.1" fill="#ffae4a">
            <animate attributeName="cx" values="44;50;46" dur="2.4s" begin="1s" repeatCount="indefinite" />
            <animate attributeName="cy" values="55;15;-25" dur="2.4s" begin="1s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="1s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>
    </div>
  );
}
