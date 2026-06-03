import { useEffect, useState } from "react";
import { Droplets, PawPrint, Power } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { setLivingRoomDeviceCapability } from "@/lib/homey.functions";
import { useRouter } from "@tanstack/react-router";

export function HundeVannPanel({
  deviceId,
  isOn,
  countdownSeconds,
  inline = false,
}: {
  deviceId: string | null;
  isOn: boolean | null;
  countdownSeconds: number | null;
  inline?: boolean;
}) {
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(countdownSeconds);

  // Lokal nedtelling så den ticker hvert sekund mellom Homey-pollene
  useEffect(() => {
    setRemaining(countdownSeconds);
  }, [countdownSeconds]);

  useEffect(() => {
    if (remaining == null || remaining <= 0 || !isOn) return;
    const t = setInterval(() => {
      setRemaining((r) => (r == null ? null : Math.max(0, r - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [remaining, isOn]);

  const onToggle = async () => {
    if (!deviceId || busy) return;
    setBusy(true);
    try {
      await setCap({ data: { deviceId, capability: "onoff", value: !isOn } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  };

  const fmt = (s: number | null) => {
    if (s == null) return null;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const ring = isOn
    ? "from-sky-500/25 ring-sky-400/40"
    : "from-muted/20 ring-border";
  const tone = isOn ? "text-sky-300" : "text-muted-foreground";

  const inner = (
    <div className={`panel rounded-lg p-4 sm:p-6 relative overflow-hidden bg-gradient-to-br ${ring} to-transparent h-full flex flex-col`}>
      {/* Animerte dråper i bakgrunnen når vannet renner */}
      {isOn && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="absolute text-sky-300/40"
              style={{
                left: `${10 + i * 14}%`,
                top: "-12px",
                animation: `pbthDrop ${1.2 + (i % 3) * 0.4}s ${i * 0.18}s ease-in infinite`,
              }}
            >
              <Droplets size={14} />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4 flex-wrap relative">
        <div className="min-w-0">
          <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-muted-foreground uppercase mb-0.5 sm:mb-1">
            Bikkjenes lutring
          </div>
          <h3 className="text-display text-primary text-sm sm:text-xl tracking-[0.2em] sm:tracking-[0.25em] uppercase flex items-center gap-2">
            <PawPrint size={16} className="text-[var(--gold)]" />
            🐕 Hunde vann
          </h3>
        </div>
        <div className={`text-right ${tone}`}>
          <div className="text-2xl sm:text-3xl">{isOn ? "💧" : "○"}</div>
          <div className="text-[9px] sm:text-[10px] tracking-[0.25em] uppercase mt-0.5 sm:mt-1">
            {isOn == null ? "Ukjent" : isOn ? "Renner" : "Av"}
          </div>
        </div>
      </div>

      {/* Vannskål */}
      <div className="relative flex items-center justify-center my-3 sm:my-4">
        <svg viewBox="0 0 120 80" className="w-32 h-20 sm:w-40 sm:h-24">
          {/* skål */}
          <path
            d="M15 30 Q60 80 105 30 Z"
            fill={isOn ? "rgba(56,189,248,0.25)" : "rgba(148,163,184,0.12)"}
            stroke={isOn ? "#38bdf8" : "#64748b"}
            strokeWidth="2"
          />
          {/* vannlinje */}
          {isOn && (
            <path
              d="M22 32 Q60 48 98 32"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="1.5"
              opacity="0.9"
            >
              <animate attributeName="d" dur="2.5s" repeatCount="indefinite"
                values="M22 32 Q60 48 98 32;M22 34 Q60 46 98 34;M22 32 Q60 48 98 32" />
            </path>
          )}
          {/* tappestrøm */}
          {isOn && (
            <line x1="60" y1="0" x2="60" y2="30" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round">
              <animate attributeName="opacity" dur="0.4s" repeatCount="indefinite" values="0.4;1;0.4" />
            </line>
          )}
        </svg>
      </div>

      <div className="mt-auto space-y-3 relative">
        {remaining != null && remaining > 0 && (
          <div className="text-center">
            <div className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground mb-0.5">
              Skrur seg av om
            </div>
            <div className="text-display text-sky-300 text-2xl sm:text-3xl tabular-nums tracking-widest">
              {fmt(remaining)}
            </div>
          </div>
        )}

        {deviceId && (
          <button
            onClick={onToggle}
            disabled={busy}
            className={`w-full panel rounded-md py-2 px-3 flex items-center justify-center gap-2 text-xs tracking-[0.2em] uppercase transition-colors ${
              isOn ? "bg-sky-500/20 hover:bg-sky-500/30 text-sky-200" : "hover:bg-muted/30"
            } disabled:opacity-50`}
          >
            <Power size={14} />
            {busy ? "Sender…" : isOn ? "Steng kran" : "Åpne kran"}
          </button>
        )}
      </div>

      <style>{`
        @keyframes pbthDrop {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(140px) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );

  if (inline) return inner;
  return <section className="container mx-auto px-4 pt-4 sm:pt-6">{inner}</section>;
}
