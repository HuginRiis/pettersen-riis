import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Wind } from "lucide-react";
import { getVocStatus, type VocDevice, type VocSample } from "@/lib/voc.functions";
import { useTileTone, tileToneClasses } from "./TileTone";

// VOC nivåer (ppb) — basert på Airthings veiledning
// <250 bra, 250-2000 forhøyet, >2000 dårlig
function vocLevel(v: number | null | undefined): {
  label: string;
  color: string;
  ring: string;
  bg: string;
  desc: string;
} {
  if (v == null || !Number.isFinite(v))
    return {
      label: "Ukjent",
      color: "#a3a3a3",
      ring: "rgba(163,163,163,.45)",
      bg: "rgba(163,163,163,.10)",
      desc: "Ingen måling tilgjengelig.",
    };
  if (v < 250)
    return {
      label: "Bra",
      color: "#34d399",
      ring: "rgba(52,211,153,.55)",
      bg: "rgba(52,211,153,.10)",
      desc: "Lav konsentrasjon av flyktige organiske forbindelser.",
    };
  if (v < 2000)
    return {
      label: "Moderat",
      color: "#fbbf24",
      ring: "rgba(251,191,36,.55)",
      bg: "rgba(251,191,36,.10)",
      desc: "Moderat — luft ut og finn evt. kilde (rengjøringsmidler, maling, parfymer).",
    };
  return {
    label: "Dårlig",
    color: "#f87171",
    ring: "rgba(248,113,113,.7)",
    bg: "rgba(248,113,113,.15)",
    desc: "Høy VOC — luft kraftig ut og fjern kilden.",
  };
}

function VocFX({ color, intensity, value }: { color: string; intensity: number; value: number | null | undefined }) {
  const waves = 3;
  const dots = 8 + Math.round(intensity * 10);
  // Spin-fart: <100 → 20s (veldig sakte), >2000 → 1.2s (veldig fort)
  const v = value == null || !Number.isFinite(value) ? 0 : value;
  const clamped = Math.max(100, Math.min(2000, v));
  const spinDur = 20 - ((clamped - 100) / 1900) * 18.8; // 20s → 1.2s
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <style>{`
        @keyframes vocWave { 0%{transform:scale(.6);opacity:.55} 100%{transform:scale(2.2);opacity:0} }
        @keyframes vocDrift { 0%{transform:translate(0,0) scale(.8);opacity:.15} 40%{opacity:.55} 100%{transform:translate(var(--dx),-70px) scale(1.1);opacity:0} }
        @keyframes vocBreathe { 0%,100%{opacity:.25;transform:scale(1)} 50%{opacity:.5;transform:scale(1.1)} }
        @keyframes vocSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      `}</style>
      <div
        className="absolute"
        style={{
          right: 30,
          top: 30,
          width: 104,
          height: 104,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}55 0%, transparent 70%)`,
          animation: "vocBreathe 3.6s ease-in-out infinite",
        }}
      />
      {/* Roterende molekyl — 3 dotter, fart skalert med verdi */}
      <div
        className="absolute"
        style={{
          right: 62,
          top: 62,
          width: 40,
          height: 40,
          animation: `vocSpin ${spinDur.toFixed(2)}s linear infinite`,
        }}
      >
        {[0, 120, 240].map((deg) => (
          <div
            key={deg}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 10,
              height: 10,
              marginLeft: -5,
              marginTop: -5,
              borderRadius: "50%",
              background: color,
              boxShadow: `0 0 8px ${color}`,
              transform: `rotate(${deg}deg) translateY(-16px)`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 8,
            height: 8,
            marginLeft: -4,
            marginTop: -4,
            borderRadius: "50%",
            background: "#fff",
            opacity: 0.85,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </div>
      {Array.from({ length: waves }).map((_, i) => (
        <div
          key={`w${i}`}
          style={{
            position: "absolute",
            right: 50,
            top: 50,
            width: 64,
            height: 64,
            borderRadius: "50%",
            border: `1.5px solid ${color}88`,
            animation: `vocWave ${3 + i * 0.6}s ease-out ${i * 1}s infinite`,
          }}
        />
      ))}
      {Array.from({ length: dots }).map((_, i) => {
        const left = 10 + ((i * 34) % 70);
        const delay = (i * 0.35) % 4;
        const dur = 5 + ((i * 0.6) % 4);
        const size = 3 + (i % 3);
        const dx = (i % 2 === 0 ? 1 : -1) * (5 + (i % 4) * 2);
        return (
          <div
            key={`g${i}`}
            style={{
              position: "absolute",
              left: `${left}%`,
              bottom: -8,
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              filter: "blur(.6px)",
              opacity: 0.35,
              ["--dx" as any]: `${dx}px`,
              animation: `vocDrift ${dur}s ease-in ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

function Sparkline({
  data,
  color,
  xFmt,
}: {
  data: VocSample[];
  color: string;
  xFmt: (iso: string) => string;
}) {
  const vals = data.map((d) => d.v).filter((v) => Number.isFinite(v));
  if (vals.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-white/40">
        Ingen historikk
      </div>
    );
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const w = 280;
  const h = 88;
  const padL = 28;
  const padR = 8;
  const padT = 6;
  const padB = 18;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = data.length;
  const xs = data.map((_, i) => padL + (n === 1 ? 0 : (i / (n - 1)) * innerW));
  const ys = data.map((d) =>
    Number.isFinite(d.v) ? padT + innerH - ((d.v - min) / span) * innerH : null,
  );
  let path = "";
  let area = "";
  let started = false;
  for (let i = 0; i < n; i++) {
    if (ys[i] == null) {
      started = false;
      continue;
    }
    if (!started) {
      path += `M ${xs[i]} ${ys[i]}`;
      area += `M ${xs[i]} ${padT + innerH} L ${xs[i]} ${ys[i]}`;
      started = true;
    } else {
      path += ` L ${xs[i]} ${ys[i]}`;
      area += ` L ${xs[i]} ${ys[i]}`;
    }
  }
  if (started) area += ` L ${xs[xs.length - 1]} ${padT + innerH} Z`;

  const ticks = [2000, 250];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
      {ticks.map((tv) => {
        if (tv < min || tv > max) return null;
        const y = padT + innerH - ((tv - min) / span) * innerH;
        return (
          <g key={tv}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke={tv >= 2000 ? "#f8717155" : "#fbbf2455"}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <text x={4} y={y + 3} fontSize="9" fill="rgba(255,255,255,.5)">
              {tv}
            </text>
          </g>
        );
      })}
      <path d={area} fill={`${color}22`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {[0, Math.floor(n / 2), n - 1].map((i) => {
        const d = data[i];
        if (!d) return null;
        return (
          <text key={`xl${i}`} x={xs[i]} y={h - 4} fontSize="9" fill="rgba(255,255,255,.5)" textAnchor="middle">
            {xFmt(d.t)}
          </text>
        );
      })}
    </svg>
  );
}

function DeviceTile({ dev, fetchedAt }: { dev: VocDevice; fetchedAt: string | null }) {
  const [view, setView] = useState<"now" | "stats" | "h48" | "d14" | "info">("now");
  const level = vocLevel(dev.current);
  const intensity = Math.min(1, (dev.current ?? 0) / 2000);
  const fmt = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? "—" : Math.round(v).toString();
  const fmtTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("nb-NO", { weekday: "short", hour: "2-digit", minute: "2-digit" })
      : "—";
  const sensorTs = fmtTime(dev.lastUpdated);
  const fetchedTs = fmtTime(fetchedAt);


  const order: typeof view[] = ["now", "stats", "h48", "d14", "info"];

  return (
    <button
      type="button"
      onClick={() => {
        const i = order.indexOf(view);
        setView(order[(i + 1) % order.length]);
      }}
      className="relative w-full text-left rounded-xl border border-white/10 bg-black/25 overflow-hidden transition-colors hover:bg-black/35"
      style={{ minHeight: 200 }}
    >
      <VocFX color={level.color} intensity={intensity} value={dev.current} />
      <div className="relative p-3 flex flex-col gap-2 h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Wind size={14} style={{ color: level.color }} />
            <span className="text-[11px] uppercase tracking-wider text-white/70">
              VOC · {dev.zone ?? dev.name}
            </span>
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: level.color + "22", color: level.color, border: `1px solid ${level.color}66` }}
          >
            {level.label}
          </span>
        </div>

        {view === "now" && (
          <div className="flex-1 flex flex-col justify-end">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-light tabular-nums" style={{ color: level.color }}>
                {fmt(dev.current)}
              </span>
              <span className="text-xs text-white/60">{dev.unit || "ppb"}</span>
            </div>
            <div className="text-[11px] text-white/55 mt-1">{level.desc}</div>
            <div className="text-[10px] text-white/40 mt-1">Sist hentet {fetchedTs} · sensor {sensorTs}</div>
          </div>
        )}

        {view === "stats" && (
          <div className="flex-1 flex flex-col justify-center gap-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/50">Siste 30 dager</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[10px] text-white/50">Min</div>
                <div className="text-lg font-light text-emerald-300 tabular-nums">{fmt(dev.min30)}</div>
              </div>
              <div>
                <div className="text-[10px] text-white/50">Snitt</div>
                <div className="text-lg font-light text-white tabular-nums">{fmt(dev.avg30)}</div>
              </div>
              <div>
                <div className="text-[10px] text-white/50">Maks</div>
                <div className="text-lg font-light tabular-nums" style={{ color: vocLevel(dev.max30).color }}>
                  {fmt(dev.max30)}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-white/40">ppb</div>
          </div>
        )}

        {view === "h48" && (
          <div className="flex-1 flex flex-col">
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
              48 timer · timesnitt
            </div>
            <Sparkline
              data={dev.hourly48}
              color={level.color}
              xFmt={(iso) =>
                new Date(iso).toLocaleString("nb-NO", { hour: "2-digit", day: "numeric" })
              }
            />
          </div>
        )}

        {view === "d14" && (
          <div className="flex-1 flex flex-col">
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
              14 dager · dagsnitt
            </div>
            <Sparkline
              data={dev.daily14}
              color={level.color}
              xFmt={(iso) =>
                new Date(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short" })
              }
            />
          </div>
        )}

        {view === "info" && (
          <div className="flex-1 flex flex-col gap-1 text-[10px] text-white/70">
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
              Hva er VOC?
            </div>
            <div className="text-white/65 leading-snug">
              Flyktige organiske forbindelser (VOC) er gasser fra rengjøringsmidler,
              maling, møbler, parfymer og matlaging. Måles i ppb (parts per billion).
            </div>
            <div className="mt-1 grid grid-cols-1 gap-0.5">
              <ScaleRow color="#34d399" range="< 250" label="Bra" />
              <ScaleRow color="#fbbf24" range="250 – 2000" label="Moderat" />
              <ScaleRow color="#f87171" range="> 2000" label="Dårlig" />
            </div>
          </div>
        )}

        <div className="flex gap-1 pt-1">
          {order.map((k) => (
            <span
              key={k}
              className="h-0.5 flex-1 rounded-full"
              style={{ background: view === k ? level.color : "rgba(255,255,255,.15)" }}
            />
          ))}
        </div>
      </div>
    </button>
  );
}

function ScaleRow({ color, range, label }: { color: string; range: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="text-white/80 tabular-nums w-20">{range}</span>
      <span className="text-white/60">{label}</span>
    </div>
  );
}

export function VocCard({ refreshKey }: { refreshKey?: string }) {
  const fetchStatus = useServerFn(getVocStatus);
  const { tone } = useTileTone();
  const [data, setData] = useState<{
    loading: boolean;
    error: string | null;
    devices: VocDevice[];
    fetchedAt: string | null;
  }>({ loading: true, error: null, devices: [], fetchedAt: null });

  useEffect(() => {
    let cancelled = false;
    setData((s) => ({ ...s, loading: true }));
    fetchStatus()
      .then((r) => {
        if (cancelled) return;
        setData({ loading: false, error: r.ok ? null : r.error ?? "Ukjent feil", devices: r.devices, fetchedAt: r.fetchedAt ?? null });
      })
      .catch((e) => {
        if (cancelled) return;
        setData({ loading: false, error: String(e?.message ?? e), devices: [], fetchedAt: null });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const sorted = useMemo(() => data.devices, [data.devices]);

  return (
    <div className={`rounded-2xl backdrop-blur-xl shadow-lg shadow-black/10 p-4 ${tileToneClasses(tone)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[11px] tracking-[0.15em] font-semibold text-white/70 uppercase">
          <Wind size={14} />
          <span>VOC · Airthings</span>
        </div>
        <span className="text-[10px] text-white/40">Trykk for stats · 48t · 14d · info</span>
      </div>
      {data.loading && (
        <div className="text-xs text-white/50 py-6 text-center">Henter VOC-måling …</div>
      )}
      {!data.loading && data.error && (
        <div className="text-xs text-red-300/80 py-4 text-center">Feil: {data.error}</div>
      )}
      {!data.loading && !data.error && sorted.length === 0 && (
        <div className="text-xs text-white/50 py-4 text-center">Fant ingen VOC-måler.</div>
      )}
      {!data.loading && sorted.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {sorted.map((d) => (
            <DeviceTile key={d.deviceId} dev={d} fetchedAt={data.fetchedAt} />
          ))}
        </div>
      )}
    </div>
  );
}
