/**
 * MaesterIcons — animerte SVG-ikoner for Hærmesterens råd.
 *
 *  - CloakIcon: kappe som bølger (svinger sakte)
 *  - HorseCartIcon: hest og kjerre som triller fram og tilbake, med hjul som spinner
 *  - PollenIcon: blad som svaier, med pollen-prikker som flyr
 */

export function CloakIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Spenne / krage */}
      <circle cx="24" cy="9" r="2.5" fill="currentColor" opacity="0.9" />
      {/* Kappe — animeres med d-attributt for bølge */}
      <path
        fill="currentColor"
        opacity="0.85"
        d="M24 11 C 16 14, 10 24, 8 40 L 40 40 C 38 24, 32 14, 24 11 Z"
      >
        <animate
          attributeName="d"
          dur="3.2s"
          repeatCount="indefinite"
          values="
            M24 11 C 16 14, 10 24, 8 40 L 40 40 C 38 24, 32 14, 24 11 Z;
            M24 11 C 18 14, 12 26, 10 40 L 38 40 C 36 26, 30 14, 24 11 Z;
            M24 11 C 16 14, 10 24, 8 40 L 40 40 C 38 24, 32 14, 24 11 Z
          "
        />
      </path>
      {/* Indre fold */}
      <path
        d="M24 13 L 24 38"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.4"
      >
        <animate
          attributeName="d"
          dur="3.2s"
          repeatCount="indefinite"
          values="
            M24 13 L 24 38;
            M24 13 L 25 38;
            M24 13 L 24 38
          "
        />
      </path>
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
      {/* Hele ekvipasjen triller */}
      <g>
        <animateTransform
          attributeName="transform"
          attributeType="XML"
          type="translate"
          values="0 0; 3 0; 0 0; -3 0; 0 0"
          dur="4s"
          repeatCount="indefinite"
        />

        {/* Kjerre-kasse */}
        <rect x="32" y="22" width="22" height="10" rx="1" fill="currentColor" opacity="0.85" />
        {/* Skjefter / drag */}
        <line x1="20" y1="28" x2="32" y2="26" stroke="currentColor" strokeWidth="1.2" />

        {/* Hest — kropp */}
        <ellipse cx="14" cy="28" rx="8" ry="5" fill="currentColor" opacity="0.9" />
        {/* Hals */}
        <path d="M19 25 L 23 18 L 21 18 L 17 24 Z" fill="currentColor" opacity="0.9" />
        {/* Hode */}
        <path d="M22 19 L 26 17 L 26 21 L 22 22 Z" fill="currentColor" opacity="0.9" />
        {/* Øre */}
        <path d="M24 17 L 25 15 L 26 17 Z" fill="currentColor" />
        {/* Manke */}
        <path d="M19 20 L 22 17 L 21 21 Z" fill="currentColor" opacity="0.6" />
        {/* Hale */}
        <path d="M6 26 L 3 23 L 4 28 L 2 30 Z" fill="currentColor" opacity="0.7">
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            values="0 6 26; 8 6 26; 0 6 26; -8 6 26; 0 6 26"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </path>

        {/* Bein — alternerende */}
        <line x1="10" y1="33" x2="10" y2="40" stroke="currentColor" strokeWidth="1.6">
          <animate attributeName="x2" values="10;12;10;8;10" dur="0.8s" repeatCount="indefinite" />
        </line>
        <line x1="18" y1="33" x2="18" y2="40" stroke="currentColor" strokeWidth="1.6">
          <animate attributeName="x2" values="18;16;18;20;18" dur="0.8s" repeatCount="indefinite" />
        </line>

        {/* Hjul bak */}
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from="0 36 36"
            to="360 36 36"
            dur="2s"
            repeatCount="indefinite"
          />
          <circle cx="36" cy="36" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <line x1="31" y1="36" x2="41" y2="36" stroke="currentColor" strokeWidth="1" />
          <line x1="36" y1="31" x2="36" y2="41" stroke="currentColor" strokeWidth="1" />
        </g>
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from="0 50 36"
            to="360 50 36"
            dur="2s"
            repeatCount="indefinite"
          />
          <circle cx="50" cy="36" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <line x1="45" y1="36" x2="55" y2="36" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="31" x2="50" y2="41" stroke="currentColor" strokeWidth="1" />
        </g>
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
        {/* Bladnerve */}
        <path
          d="M24 28 L 30 16"
          stroke="currentColor"
          strokeWidth="0.6"
          opacity="0.4"
        />
        <path
          d="M24 28 L 18 16"
          stroke="currentColor"
          strokeWidth="0.6"
          opacity="0.4"
        />
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
