/**
 * MaesterIcons — animerte SVG-ikoner for Hærmesterens råd.
 *
 *  - CloakIcon: kappe som bølger mykt i vinden
 *  - HorseCartIcon: hest og kjerre som triller jevnt — hjul ruller, hest galopperer
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
      <circle cx="24" cy="9" r="2.5" fill="currentColor" opacity="0.95" />
      {/* Snøre fra spenne */}
      <path
        d="M22 10 Q 24 12 26 10"
        stroke="currentColor"
        strokeWidth="0.6"
        fill="none"
        opacity="0.5"
      />

      {/* Kappe — myk bølge i vinden */}
      <path fill="currentColor" opacity="0.85">
        <animate
          attributeName="d"
          dur="4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          values="
            M24 11 C 17 14, 11 25, 9 40 L 39 40 C 37 25, 31 14, 24 11 Z;
            M24 11 C 18 14, 13 26, 11 40 L 41 40 C 38 25, 31 14, 24 11 Z;
            M24 11 C 17 14, 11 25, 9 40 L 39 40 C 37 25, 31 14, 24 11 Z
          "
        />
      </path>

      {/* Folder — gir dybde */}
      <path
        stroke="currentColor"
        strokeWidth="0.6"
        fill="none"
        opacity="0.35"
      >
        <animate
          attributeName="d"
          dur="4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          values="
            M18 16 Q 16 28 14 39;
            M18 16 Q 17 28 16 39;
            M18 16 Q 16 28 14 39
          "
        />
      </path>
      <path
        stroke="currentColor"
        strokeWidth="0.6"
        fill="none"
        opacity="0.35"
      >
        <animate
          attributeName="d"
          dur="4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          values="
            M30 16 Q 32 28 34 39;
            M30 16 Q 31 28 32 39;
            M30 16 Q 32 28 34 39
          "
        />
      </path>
      {/* Midtfold */}
      <line
        x1="24"
        y1="13"
        x2="24"
        y2="39"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.3"
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
      {/* Hele ekvipasjen vugger lett opp/ned (ujevn vei) */}
      <g>
        <animateTransform
          attributeName="transform"
          attributeType="XML"
          type="translate"
          values="0 0; 0 -0.6; 0 0; 0 -0.4; 0 0"
          dur="0.8s"
          repeatCount="indefinite"
        />

        {/* ── Kjerre ──────────────────────────────── */}
        {/* Skjefter / drag fra hest til kjerre */}
        <line x1="22" y1="28" x2="34" y2="28" stroke="currentColor" strokeWidth="1" opacity="0.7" />
        <line x1="22" y1="30" x2="34" y2="30" stroke="currentColor" strokeWidth="1" opacity="0.7" />

        {/* Kjerre-kasse */}
        <path
          d="M34 22 L 56 22 L 56 32 L 34 32 Z"
          fill="currentColor"
          opacity="0.85"
        />
        {/* Plankedetalj */}
        <line x1="40" y1="22" x2="40" y2="32" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />
        <line x1="46" y1="22" x2="46" y2="32" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />
        <line x1="52" y1="22" x2="52" y2="32" stroke="currentColor" strokeWidth="0.4" opacity="0.4" />

        {/* ── Hest ────────────────────────────────── */}
        {/* Kropp */}
        <ellipse cx="14" cy="26" rx="8" ry="5" fill="currentColor" opacity="0.9" />
        {/* Hals */}
        <path d="M19 23 L 23 17 L 25 18 L 21 24 Z" fill="currentColor" opacity="0.9" />
        {/* Hode */}
        <path d="M22 17 L 27 16 L 27 21 L 23 21 Z" fill="currentColor" opacity="0.9" />
        {/* Snute-detalj */}
        <circle cx="26" cy="19" r="0.5" fill="currentColor" opacity="0.5" />
        {/* Øre */}
        <path d="M24 16 L 25 13 L 26 16 Z" fill="currentColor" />
        {/* Manke */}
        <path d="M19 19 L 22 16 L 22 21 Z" fill="currentColor" opacity="0.6" />

        {/* Hale — vifter */}
        <g style={{ transformOrigin: "6px 25px" }}>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            values="-15 6 25; 15 6 25; -15 6 25"
            dur="1.2s"
            repeatCount="indefinite"
          />
          <path d="M6 25 Q 2 24 1 28 Q 3 27 6 27 Z" fill="currentColor" opacity="0.75" />
        </g>

        {/* Bein — galopp (forbein og bakbein i takt) */}
        {/* Forbein 1 */}
        <line
          x1="11"
          y1="30"
          x2="11"
          y2="38"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <animate
            attributeName="x2"
            values="11; 8; 11; 13; 11"
            dur="0.6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y2"
            values="38; 36; 38; 36; 38"
            dur="0.6s"
            repeatCount="indefinite"
          />
        </line>
        {/* Forbein 2 (motfase) */}
        <line
          x1="17"
          y1="30"
          x2="17"
          y2="38"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <animate
            attributeName="x2"
            values="17; 20; 17; 14; 17"
            dur="0.6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y2"
            values="38; 36; 38; 36; 38"
            dur="0.6s"
            repeatCount="indefinite"
          />
        </line>

        {/* Bakke-skygge under hest og hjul */}
        <ellipse cx="14" cy="40" rx="9" ry="0.8" fill="currentColor" opacity="0.15" />
        <ellipse cx="45" cy="40" rx="14" ry="0.8" fill="currentColor" opacity="0.15" />

        {/* ── Hjul (rullende) ─────────────────────── */}
        <g style={{ transformOrigin: "38px 36px" }}>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from="0 38 36"
            to="360 38 36"
            dur="1.2s"
            repeatCount="indefinite"
          />
          <circle cx="38" cy="36" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <line x1="33.5" y1="36" x2="42.5" y2="36" stroke="currentColor" strokeWidth="0.8" />
          <line x1="38" y1="31.5" x2="38" y2="40.5" stroke="currentColor" strokeWidth="0.8" />
          <line x1="34.8" y1="32.8" x2="41.2" y2="39.2" stroke="currentColor" strokeWidth="0.8" />
          <line x1="34.8" y1="39.2" x2="41.2" y2="32.8" stroke="currentColor" strokeWidth="0.8" />
          <circle cx="38" cy="36" r="0.8" fill="currentColor" />
        </g>
        <g style={{ transformOrigin: "52px 36px" }}>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from="0 52 36"
            to="360 52 36"
            dur="1.2s"
            repeatCount="indefinite"
          />
          <circle cx="52" cy="36" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <line x1="47.5" y1="36" x2="56.5" y2="36" stroke="currentColor" strokeWidth="0.8" />
          <line x1="52" y1="31.5" x2="52" y2="40.5" stroke="currentColor" strokeWidth="0.8" />
          <line x1="48.8" y1="32.8" x2="55.2" y2="39.2" stroke="currentColor" strokeWidth="0.8" />
          <line x1="48.8" y1="39.2" x2="55.2" y2="32.8" stroke="currentColor" strokeWidth="0.8" />
          <circle cx="52" cy="36" r="0.8" fill="currentColor" />
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
