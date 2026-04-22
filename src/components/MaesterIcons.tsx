/**
 * MaesterIcons — statiske SVG-ikoner for Hærmesterens råd.
 *
 *  - CloakIcon: en mann i kappe (statisk)
 *  - HorseCartIcon: hest og kjerre (statisk)
 *  - PollenIcon: blad med pollen-prikker som flyr
 */

export function CloakIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* ── Mann i kappe ─────────────────────────── */}
      {/* Hode */}
      <circle cx="24" cy="9" r="3.5" fill="currentColor" opacity="0.95" />
      {/* Hals */}
      <rect x="22.8" y="12" width="2.4" height="2" fill="currentColor" opacity="0.85" />

      {/* Kappe — bakre/ytre lag (stor trekant fra skuldre) */}
      <path
        d="M14 15 L 24 13 L 34 15 L 39 40 L 9 40 Z"
        fill="currentColor"
        opacity="0.7"
      />

      {/* Indre tunika (vises under kappen) */}
      <path
        d="M19 16 L 24 15 L 29 16 L 30 32 L 18 32 Z"
        fill="currentColor"
        opacity="0.95"
      />

      {/* Belte */}
      <rect x="18" y="26" width="12" height="1.6" fill="currentColor" opacity="0.5" />
      <rect x="23.4" y="26" width="1.2" height="1.6" fill="currentColor" />

      {/* Spenne på krage */}
      <circle cx="24" cy="14.5" r="1" fill="currentColor" />

      {/* Armer (henger ned langs siden, delvis dekket av kappe) */}
      <path d="M19 16 L 16 28 L 17.5 28 L 20.5 17 Z" fill="currentColor" opacity="0.85" />
      <path d="M29 16 L 32 28 L 30.5 28 L 27.5 17 Z" fill="currentColor" opacity="0.85" />

      {/* Hender */}
      <circle cx="16.5" cy="28" r="1.2" fill="currentColor" opacity="0.9" />
      <circle cx="31.5" cy="28" r="1.2" fill="currentColor" opacity="0.9" />

      {/* Bein under tunika */}
      <rect x="20" y="32" width="3" height="8" fill="currentColor" opacity="0.9" />
      <rect x="25" y="32" width="3" height="8" fill="currentColor" opacity="0.9" />

      {/* Støvler */}
      <rect x="19.5" y="39" width="4" height="1.6" rx="0.4" fill="currentColor" />
      <rect x="24.5" y="39" width="4" height="1.6" rx="0.4" fill="currentColor" />

      {/* Folder i kappe — dybde */}
      <path
        d="M14 18 Q 12 28 11 39"
        stroke="currentColor"
        strokeWidth="0.5"
        fill="none"
        opacity="0.4"
      />
      <path
        d="M34 18 Q 36 28 37 39"
        stroke="currentColor"
        strokeWidth="0.5"
        fill="none"
        opacity="0.4"
      />
    </svg>
  );
}

export function HorseCartIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Skjefter / drag fra hest til kjerre */}
      <line x1="22" y1="28" x2="34" y2="28" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <line x1="22" y1="30" x2="34" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.7" />

      {/* Kjerre-kasse */}
      <path
        d="M34 22 L 56 22 L 56 32 L 34 32 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <line x1="40" y1="22" x2="40" y2="32" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />
      <line x1="46" y1="22" x2="46" y2="32" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />
      <line x1="52" y1="22" x2="52" y2="32" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />

      {/* ── Hest ────────────────────────────────── */}
      <ellipse cx="14" cy="26" rx="8" ry="5" fill="currentColor" opacity="0.9" />
      <path d="M19 23 L 23 17 L 25 18 L 21 24 Z" fill="currentColor" opacity="0.9" />
      <path d="M22 17 L 27 16 L 27 21 L 23 21 Z" fill="currentColor" opacity="0.9" />
      <circle cx="26" cy="19" r="0.5" fill="currentColor" opacity="0.5" />
      <path d="M24 16 L 25 13 L 26 16 Z" fill="currentColor" />
      <path d="M19 19 L 22 16 L 22 21 Z" fill="currentColor" opacity="0.6" />

      {/* Hale */}
      <path d="M6 25 Q 2 24 1 28 Q 3 27 6 27 Z" fill="currentColor" opacity="0.75" />

      {/* Bein */}
      <line x1="11" y1="30" x2="11" y2="38" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="17" y1="30" x2="17" y2="38" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />

      {/* Bakke-skygger */}
      <ellipse cx="14" cy="40" rx="9" ry="0.8" fill="currentColor" opacity="0.15" />
      <ellipse cx="45" cy="40" rx="14" ry="0.8" fill="currentColor" opacity="0.15" />

      {/* ── Hjul (statiske) ─────────────────────── */}
      <g>
        <circle cx="38" cy="36" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="33.5" y1="36" x2="42.5" y2="36" stroke="currentColor" strokeWidth="0.8" />
        <line x1="38" y1="31.5" x2="38" y2="40.5" stroke="currentColor" strokeWidth="0.8" />
        <line x1="34.8" y1="32.8" x2="41.2" y2="39.2" stroke="currentColor" strokeWidth="0.8" />
        <line x1="34.8" y1="39.2" x2="41.2" y2="32.8" stroke="currentColor" strokeWidth="0.8" />
        <circle cx="38" cy="36" r="0.8" fill="currentColor" />
      </g>
      <g>
        <circle cx="52" cy="36" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="47.5" y1="36" x2="56.5" y2="36" stroke="currentColor" strokeWidth="0.8" />
        <line x1="52" y1="31.5" x2="52" y2="40.5" stroke="currentColor" strokeWidth="0.8" />
        <line x1="48.8" y1="32.8" x2="55.2" y2="39.2" stroke="currentColor" strokeWidth="0.8" />
        <line x1="48.8" y1="39.2" x2="55.2" y2="32.8" stroke="currentColor" strokeWidth="0.8" />
        <circle cx="52" cy="36" r="0.8" fill="currentColor" />
      </g>
    </svg>
  );
}

export function PollenIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Stilk */}
      <path
        d="M24 42 Q 24 32 24 22"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        opacity="0.7"
      />
      {/* Blad — svaier */}
      <g style={{ transformOrigin: "24px 28px" }}>
        <animateTransform
          attributeName="transform"
          attributeType="XML"
          type="rotate"
          values="-6 24 28; 6 24 28; -6 24 28"
          dur="3s"
          repeatCount="indefinite"
        />
        <path
          d="M24 28 C 30 22, 36 20, 38 14 C 32 14, 26 18, 24 28 Z"
          fill="currentColor"
          opacity="0.85"
        />
        <path
          d="M24 28 C 18 22, 12 20, 10 14 C 16 14, 22 18, 24 28 Z"
          fill="currentColor"
          opacity="0.7"
        />
        <path d="M24 28 L 30 16" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
        <path d="M24 28 L 18 16" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
      </g>

      {/* Pollen-partikler som fyker */}
      <circle cx="12" cy="20" r="1.2" fill="currentColor" opacity="0.8">
        <animate attributeName="cx" values="12;6;2" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="cy" values="20;14;8" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.5;0" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="36" cy="22" r="1" fill="currentColor" opacity="0.8">
        <animate attributeName="cx" values="36;42;46" dur="2.8s" repeatCount="indefinite" />
        <animate attributeName="cy" values="22;16;10" dur="2.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.5;0" dur="2.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="20" cy="14" r="0.9" fill="currentColor" opacity="0.7">
        <animate attributeName="cx" values="20;16;10" dur="3.2s" repeatCount="indefinite" />
        <animate attributeName="cy" values="14;8;4" dur="3.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.4;0" dur="3.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="30" cy="12" r="0.9" fill="currentColor" opacity="0.7">
        <animate attributeName="cx" values="30;34;40" dur="3.6s" repeatCount="indefinite" />
        <animate attributeName="cy" values="12;6;2" dur="3.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.4;0" dur="3.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
