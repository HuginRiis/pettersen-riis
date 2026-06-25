import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Atom } from "lucide-react";
import { getRadonStatus, type RadonDevice } from "@/lib/radon.functions";
import { useTileTone, tileToneClasses } from "./TileTone";

// Helsedirektoratet / WHO retningslinjer (Bq/m³):
// <100 bra · 100-200 forhøyet · 200-300 høyt · >300 tiltak påkrevd
function radonLevel(v: number | null | undefined): {
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
  if (v < 100)
    return {
      label: "Bra",
      color: "#34d399",
      ring: "rgba(52,211,153,.55)",
      bg: "rgba(52,211,153,.10)",
      desc: "Under anbefalt nivå (<100 Bq/m³).",
    };
  if (v < 200)
    return {
      label: "Forhøyet",
      color: "#fbbf24",
      ring: "rgba(251,191,36,.55)",
      bg: "rgba(251,191,36,.10)",
      desc: "Forhøyet — vurder lufting og oppfølging.",
    };
  if (v < 300)
    return {
      label: "Høyt",
      color: "#fb923c",
      ring: "rgba(251,146,60,.6)",
      bg: "rgba(251,146,60,.12)",
      desc: "Høyt — øk ventilasjon, vurder radontiltak.",
    };
  return {
    label: "Tiltak påkrevd",
    color: "#f87171",
    ring: "rgba(248,113,113,.7)",
    bg: "rgba(248,113,113,.15)",
    desc: "Over tiltaksgrensen (>300 Bq/m³). Iverksett tiltak.",
  };
}

// Glidende fargeovergang grønn → gul → oransje → rød basert på Bq/m³
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
function lerpHex(c1: string, c2: string, t: number) {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(c1);
  const [r2, g2, b2] = p(c2);
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
function radonColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "#a3a3a3";
  const stops: { x: number; c: string }[] = [
    { x: 0, c: "#34d399" },
    { x: 100, c: "#fbbf24" },
    { x: 200, c: "#fb923c" },
    { x: 300, c: "#f87171" },
  ];
  if (v <= stops[0].x) return stops[0].c;
  if (v >= stops[stops.length - 1].x) return stops[stops.length - 1].c;
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i].x) {
      const t = (v - stops[i - 1].x) / (stops[i].x - stops[i - 1].x);
      return lerpHex(stops[i - 1].c, stops[i].c, t);
    }
  }
  return stops[stops.length - 1].c;
}

function RadonAtomFX({ color, value }: { color: string; value: number | null | undefined }) {
  // Fartsskala: ~1 Bq/m³ → veldig sakte, ~300 → veldig fort. Eksponentiell for tydelig forskjell.
  const v = value == null || !Number.isFinite(value) ? 1 : Math.max(1, Math.min(300, value));
  const t = Math.pow((v - 1) / 299, 0.7); // 0..1, kraftigere stigning lavt
  const orbitDur = lerp(14, 0.5, t); // sekunder per runde
  const floatDur = lerp(11, 1.4, t);
  const pulseDur = lerp(5.5, 1.2, t);
  const intensity = t;
  const dots = 6 + Math.round(intensity * 10);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <style>{`
        @keyframes radonOrbitA { from{transform:rotate(0) translateX(var(--r)) rotate(0)} to{transform:rotate(360deg) translateX(var(--r)) rotate(-360deg)} }
        @keyframes radonOrbitB { from{transform:rotate(0) translateX(var(--r)) rotate(0)} to{transform:rotate(-360deg) translateX(var(--r)) rotate(360deg)} }
        @keyframes radonFloat { 0%{transform:translateY(0) scale(.9);opacity:.2} 50%{opacity:.65} 100%{transform:translateY(-60px) scale(1.1);opacity:0} }
        @keyframes radonPulse { 0%,100%{opacity:.18;transform:scale(1)} 50%{opacity:.42;transform:scale(1.08)} }
      `}</style>
      {/* Glow core */}
      <div
        className="absolute"
        style={{
          right: 30,
          top: 30,
          width: 128,
          height: 128,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}66 0%, transparent 70%)`,
          animation: `radonPulse ${pulseDur.toFixed(2)}s ease-in-out infinite`,
        }}
      />
      {/* Orbiting electrons */}
      <div className="absolute" style={{ right: 54, top: 54, width: 64, height: 64 }}>
        {[0, 60, 120].map((deg, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `1.5px solid ${color}55`,
              transform: `rotate(${deg}deg) scaleY(.42)`,
            }}
          />
        ))}
        {[0, 1, 2].map((i) => {
          const tilt = [0, 60, 120][i];
          return (
            <div
              key={`e${i}`}
              style={{
                position: "absolute",
                inset: 0,
                transform: `rotate(${tilt}deg) scaleY(.42)`,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 6,
                  height: 14,
                  marginLeft: -3,
                  marginTop: -7,
                  borderRadius: "50%",
                  background: color,
                  boxShadow: `0 0 8px ${color}`,
                  ["--r" as any]: "32px",
                  animation: `${i % 2 === 0 ? "radonOrbitA" : "radonOrbitB"} ${(orbitDur * (1 + i * 0.15)).toFixed(2)}s linear infinite`,
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Rising gas particles */}
      {Array.from({ length: dots }).map((_, i) => {
        const left = 12 + ((i * 34) % 70);
        const delay = (i * 0.5) % 4;
        const dur = floatDur * (0.85 + ((i * 0.11) % 0.4));
        const size = 3 + (i % 3);
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
              filter: "blur(.5px)",
              opacity: 0.3,
              animation: `radonFloat ${dur.toFixed(2)}s ease-in ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

function Sparkline({ data, color, xFmt }: { data: { t: string; v: number }[]; color: string; xFmt?: (iso: string) => string }) {
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
  const padL = 24;
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
  // Build path with gaps
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

  const ticks = [200, 100];
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
              stroke={tv >= 200 ? "#fb923c55" : "#fbbf2455"}
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
      {xs.map((x, i) => {
        const y = ys[i];
        if (y == null) return null;
        return <circle key={i} cx={x} cy={y} r={1.5} fill={color} />;
      })}
      {/* x-axis labels: første, midt, siste */}
      {[0, Math.floor(n / 2), n - 1].map((i) => {
        const d = data[i];
        if (!d) return null;
        const label = xFmt ? xFmt(d.t) : new Date(d.t).toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
        return (
          <text key={`xl${i}`} x={xs[i]} y={h - 4} fontSize="9" fill="rgba(255,255,255,.5)" textAnchor="middle">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function DeviceTile({ dev, fetchedAt }: { dev: RadonDevice; fetchedAt: string | null }) {
  const [view, setView] = useState<"now" | "stats" | "h48" | "chart" | "scale">("now");
  const level = radonLevel(dev.current);
  const intensity = Math.min(1, (dev.current ?? 0) / 300);
  const fmt = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) ? "—" : Math.round(v).toString();
  const fmtTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("nb-NO", { weekday: "short", hour: "2-digit", minute: "2-digit" })
      : "—";
  const sensorTs = fmtTime(dev.lastUpdated);
  const fetchedTs = fmtTime(fetchedAt);


  return (
    <button
      type="button"
      onClick={() => {
        const order: typeof view[] = ["now", "stats", "h48", "chart", "scale"];
        const i = order.indexOf(view);
        setView(order[(i + 1) % order.length]);
      }}
      className="relative w-full text-left rounded-xl border border-white/10 bg-black/25 overflow-hidden transition-colors hover:bg-black/35"
      style={{ minHeight: 180 }}
    >
      <RadonAtomFX color={level.color} intensity={intensity} />
      <div className="relative p-3 flex flex-col gap-2 h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Atom size={14} style={{ color: level.color }} />
            <span className="text-[11px] uppercase tracking-wider text-white/70">
              {dev.zone ?? dev.name}
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
              <span className="text-4xl font-light text-white tabular-nums" style={{ color: level.color }}>
                {fmt(dev.current)}
              </span>
              <span className="text-xs text-white/60">Bq/m³</span>
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
                <div
                  className="text-lg font-light tabular-nums"
                  style={{ color: radonLevel(dev.max30).color }}
                >
                  {fmt(dev.max30)}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-white/40">Bq/m³</div>
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
              xFmt={(iso) => new Date(iso).toLocaleString("nb-NO", { hour: "2-digit", day: "numeric" })}
            />
          </div>
        )}

        {view === "chart" && (
          <div className="flex-1 flex flex-col">
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
              14 dager · dagsnitt
            </div>
            <Sparkline data={dev.daily14} color={level.color} />
          </div>
        )}

        {view === "scale" && (
          <div className="flex-1 flex flex-col gap-1 text-[10px]">
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Skala (Bq/m³)</div>
            <ScaleRow color="#34d399" range="< 100" label="Bra" />
            <ScaleRow color="#fbbf24" range="100 – 200" label="Forhøyet" />
            <ScaleRow color="#fb923c" range="200 – 300" label="Høyt" />
            <ScaleRow color="#f87171" range="> 300" label="Tiltak påkrevd" />
            <div className="text-[10px] text-white/40 mt-1">Anbefalt tiltaksgrense: 100 Bq/m³</div>
          </div>
        )}

        <div className="flex gap-1 pt-1">
          {["now", "stats", "h48", "chart", "scale"].map((k) => (
            <span
              key={k}
              className="h-0.5 flex-1 rounded-full"
              style={{
                background: view === k ? level.color : "rgba(255,255,255,.15)",
              }}
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
      <span className="text-white/80 tabular-nums w-16">{range}</span>
      <span className="text-white/60">{label}</span>
    </div>
  );
}

export function RadonCard({ refreshKey }: { refreshKey?: string }) {
  const fetchStatus = useServerFn(getRadonStatus);
  const { tone } = useTileTone();
  const [data, setData] = useState<{
    loading: boolean;
    error: string | null;
    devices: RadonDevice[];
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

  const sorted = useMemo(() => {
    const order = ["soverom", "stua", "stue"];
    return [...data.devices].sort((a, b) => {
      const az = (a.zone ?? a.name).toLowerCase();
      const bz = (b.zone ?? b.name).toLowerCase();
      const ai = order.findIndex((o) => az.includes(o));
      const bi = order.findIndex((o) => bz.includes(o));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [data.devices]);

  return (
    <div className={`rounded-2xl backdrop-blur-xl shadow-lg shadow-black/10 p-4 ${tileToneClasses(tone)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[11px] tracking-[0.15em] font-semibold text-white/70 uppercase">
          <Atom size={14} />
          <span>Radon · Airthings</span>
        </div>
        <span className="text-[10px] text-white/40">Trykk for stats · 48t · 14d · skala</span>
      </div>
      {data.loading && (
        <div className="text-xs text-white/50 py-6 text-center">Henter radon-måling …</div>
      )}
      {!data.loading && data.error && (
        <div className="text-xs text-red-300/80 py-4 text-center">Feil: {data.error}</div>
      )}
      {!data.loading && !data.error && sorted.length === 0 && (
        <div className="text-xs text-white/50 py-4 text-center">
          Fant ingen radon-målere i Homey.
        </div>
      )}
      {!data.loading && sorted.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sorted.map((d) => (
            <DeviceTile key={d.deviceId} dev={d} fetchedAt={data.fetchedAt} />
          ))}
        </div>
      )}
    </div>
  );
}
