import { useEffect, useRef } from "react";

/**
 * Analog VU-meter med nål. Lyse farger, ingen svart fyll.
 * Input: db (SPL 0–140). Mapper 40–110 dB → -20 … +6 VU.
 */
export function VuMeter({ db, running }: { db: number; running: boolean }) {
  const smoothRef = useRef(0);
  const needleRef = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // Klassisk VU-respons: 300ms integrasjon (eksponentiell)
      const target = running ? db : 0;
      smoothRef.current += (target - smoothRef.current) * 0.18;
      const v = smoothRef.current;
      // 40 dB SPL -> -20 VU (venstre, -60°), 110 dB SPL -> +6 VU (høyre, +60°)
      const vu = ((v - 40) / (110 - 40)) * 26 - 20;
      const clamped = Math.max(-22, Math.min(8, vu));
      const angle = (clamped / 26) * 120; // -100° .. +37°  scale to ~ -60..+18
      // Map -20..+6 -> -60..+60
      const deg = ((clamped + 20) / 26) * 120 - 60;
      if (needleRef.current) {
        needleRef.current.setAttribute(
          "transform",
          `rotate(${deg.toFixed(2)} 100 95)`,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [db, running]);

  // Bue-ticks
  const ticks: { vu: number; label: string; major: boolean }[] = [
    { vu: -20, label: "-20", major: true },
    { vu: -10, label: "-10", major: true },
    { vu: -7, label: "-7", major: false },
    { vu: -5, label: "-5", major: true },
    { vu: -3, label: "-3", major: false },
    { vu: -1, label: "-1", major: false },
    { vu: 0, label: "0", major: true },
    { vu: 3, label: "+3", major: true },
    { vu: 6, label: "+6", major: true },
  ];

  const cx = 100;
  const cy = 95;
  const r = 78;

  return (
    <svg viewBox="0 0 200 110" className="w-full h-full">
      {/* Lys "papirskive" */}
      <defs>
        <linearGradient id="vu-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef9e7" />
          <stop offset="100%" stopColor="#f5e6c3" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="196" height="106" rx="6" fill="url(#vu-bg)" stroke="#c9a86b" />

      {/* Skala-bue */}
      <path
        d={`M ${cx - r * Math.sin((Math.PI / 3))} ${cy - r * Math.cos(Math.PI / 3)} A ${r} ${r} 0 0 1 ${cx + r * Math.sin(Math.PI / 3)} ${cy - r * Math.cos(Math.PI / 3)}`}
        fill="none"
        stroke="#5a4a2a"
        strokeWidth="1"
      />

      {ticks.map((t) => {
        const deg = ((t.vu + 20) / 26) * 120 - 60;
        const rad = (deg * Math.PI) / 180;
        const x1 = cx + Math.sin(rad) * (r - (t.major ? 8 : 4));
        const y1 = cy - Math.cos(rad) * (r - (t.major ? 8 : 4));
        const x2 = cx + Math.sin(rad) * r;
        const y2 = cy - Math.cos(rad) * r;
        const lx = cx + Math.sin(rad) * (r - 18);
        const ly = cy - Math.cos(rad) * (r - 18);
        const red = t.vu > 0;
        return (
          <g key={t.vu}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={red ? "#c0392b" : "#3d2f1a"} strokeWidth={t.major ? 1.6 : 0.8} />
            {t.major && (
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                fontSize="7"
                fill={red ? "#c0392b" : "#3d2f1a"}
                fontFamily="ui-monospace, monospace"
              >
                {t.label}
              </text>
            )}
          </g>
        );
      })}

      {/* "VU" label */}
      <text x={cx} y="72" textAnchor="middle" fontSize="9" fill="#3d2f1a" fontFamily="serif" fontStyle="italic">VU</text>

      {/* Rød sone-bue */}
      <path
        d={`M ${cx + Math.sin(0) * r} ${cy - Math.cos(0) * r} A ${r} ${r} 0 0 1 ${cx + Math.sin(Math.PI / 3) * r} ${cy - Math.cos(Math.PI / 3) * r}`}
        fill="none"
        stroke="#e74c3c"
        strokeWidth="2.5"
        opacity="0.75"
      />

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
