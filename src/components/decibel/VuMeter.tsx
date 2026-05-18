import { useEffect, useRef } from "react";

/**
 * Analog dB SPL-meter med nål. Lyse farger.
 * Skala 30–110 dB. Markerte soner:
 *   60 dB ≈ Prat
 *   80 dB ≈ Trafikk
 * fallSpeed: 0..1 hvor høyt = raskere nedgang. Default 0.05 (treg).
 * riseSpeed: 0..1 hvor raskt nålen følger oppover. Default 0.35.
 */
export function VuMeter({
  db,
  running,
  fallSpeed = 0.05,
  riseSpeed = 0.35,
}: {
  db: number;
  running: boolean;
  fallSpeed?: number;
  riseSpeed?: number;
}) {
  const smoothRef = useRef(30);
  const needleRef = useRef<SVGLineElement | null>(null);
  const lastTickRef = useRef(0);

  // Skala
  const DB_MIN = 30;
  const DB_MAX = 110;
  const ANGLE_RANGE = 120; // -60° .. +60°

  const dbToDeg = (v: number) => {
    const clamped = Math.max(DB_MIN, Math.min(DB_MAX, v));
    return ((clamped - DB_MIN) / (DB_MAX - DB_MIN)) * ANGLE_RANGE - ANGLE_RANGE / 2;
  };

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = running ? db : DB_MIN;
      const diff = target - smoothRef.current;
      const k = diff >= 0 ? riseSpeed : fallSpeed;
      smoothRef.current += diff * k;
      const deg = dbToDeg(smoothRef.current);
      if (needleRef.current) {
        needleRef.current.setAttribute("transform", `rotate(${deg.toFixed(2)} 100 95)`);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [db, running, fallSpeed, riseSpeed]);

  // Hoved-ticks for dB
  const ticks: { db: number; label: string; major: boolean; tone?: "speech" | "traffic" | "loud" }[] = [
    { db: 30, label: "30", major: true },
    { db: 40, label: "40", major: true },
    { db: 50, label: "50", major: true },
    { db: 60, label: "60", major: true, tone: "speech" },
    { db: 70, label: "70", major: true },
    { db: 80, label: "80", major: true, tone: "traffic" },
    { db: 90, label: "90", major: true, tone: "loud" },
    { db: 100, label: "100", major: true, tone: "loud" },
    { db: 110, label: "110", major: true, tone: "loud" },
  ];

  const cx = 100;
  const cy = 95;
  const r = 78;

  // Hjelpere
  const polar = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + Math.sin(rad) * radius, y: cy - Math.cos(rad) * radius };
  };

  const arcPath = (dbFrom: number, dbTo: number, radius: number) => {
    const a = polar(dbToDeg(dbFrom), radius);
    const b = polar(dbToDeg(dbTo), radius);
    const large = Math.abs(dbToDeg(dbTo) - dbToDeg(dbFrom)) > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
  };

  return (
    <svg viewBox="0 0 200 110" className="w-full h-full">
      <defs>
        <linearGradient id="vu-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef9e7" />
          <stop offset="100%" stopColor="#f5e6c3" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="196" height="106" rx="6" fill="url(#vu-bg)" stroke="#c9a86b" />

      {/* Sone-buer: grønn (prat), gul (trafikk), rød (kraftig) */}
      <path d={arcPath(50, 70, r)} fill="none" stroke="#27ae60" strokeWidth="2.5" opacity="0.7" />
      <path d={arcPath(70, 85, r)} fill="none" stroke="#f1c40f" strokeWidth="2.5" opacity="0.75" />
      <path d={arcPath(85, 110, r)} fill="none" stroke="#e74c3c" strokeWidth="2.5" opacity="0.8" />

      {/* Hoved skala-bue */}
      <path d={arcPath(DB_MIN, DB_MAX, r - 4)} fill="none" stroke="#5a4a2a" strokeWidth="0.6" />

      {ticks.map((t) => {
        const deg = dbToDeg(t.db);
        const rad = (deg * Math.PI) / 180;
        const x1 = cx + Math.sin(rad) * (r - (t.major ? 9 : 4));
        const y1 = cy - Math.cos(rad) * (r - (t.major ? 9 : 4));
        const x2 = cx + Math.sin(rad) * (r - 1);
        const y2 = cy - Math.cos(rad) * (r - 1);
        const lx = cx + Math.sin(rad) * (r - 19);
        const ly = cy - Math.cos(rad) * (r - 19);
        const color =
          t.tone === "loud" ? "#c0392b" : t.tone === "traffic" ? "#b7791f" : t.tone === "speech" ? "#1e8449" : "#3d2f1a";
        return (
          <g key={t.db}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={t.major ? 1.4 : 0.7} />
            <text
              x={lx}
              y={ly + 3}
              textAnchor="middle"
              fontSize="6.5"
              fill={color}
              fontFamily="ui-monospace, monospace"
            >
              {t.label}
            </text>
          </g>
        );
      })}

      {/* Sone-etiketter */}
      <text x={polar(dbToDeg(60), r - 32).x} y={polar(dbToDeg(60), r - 32).y} textAnchor="middle" fontSize="6" fill="#1e8449" fontFamily="serif" fontStyle="italic">Prat</text>
      <text x={polar(dbToDeg(80), r - 32).x} y={polar(dbToDeg(80), r - 32).y} textAnchor="middle" fontSize="6" fill="#b7791f" fontFamily="serif" fontStyle="italic">Trafikk</text>

      {/* "dB SPL" label */}
      <text x={cx} y="72" textAnchor="middle" fontSize="8" fill="#3d2f1a" fontFamily="serif" fontStyle="italic">dB SPL</text>

      {/* Nål */}
      <line
        ref={needleRef}
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy - r + 4}
        stroke="#1c1c1c"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="4" fill="#c9a86b" stroke="#3d2f1a" strokeWidth="0.8" />
    </svg>
  );
}
