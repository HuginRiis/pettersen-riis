import { useEffect, useState } from "react";
import { Sun, Wind, Magnet, Sparkles, Radio } from "lucide-react";

type SpaceData = {
  xrayClass: string | null; // f.eks "C1.2"
  xrayLevel: number; // 0-5 (A=0, B=1, C=2, M=3, X=4, X10+=5)
  solarWind: number | null; // km/s
  kp: number | null; // 0-9
  rScale: number; // 0-5 radio blackout
  sScale: number; // 0-5 radiation storm
  gScale: number; // 0-5 geomagnetic
  loading: boolean;
  error: string | null;
};

let memCache: { ts: number; data: Omit<SpaceData, "loading" | "error"> } | null = null;
const TTL = 10 * 60 * 1000;

function parseXrayClass(s: string | null | undefined): number {
  if (!s) return 0;
  const letter = s[0]?.toUpperCase();
  const mag = parseFloat(s.slice(1)) || 1;
  const base: Record<string, number> = { A: 0, B: 1, C: 2, M: 3, X: 4 };
  let lvl = base[letter] ?? 0;
  if (letter === "X" && mag >= 10) lvl = 5;
  return lvl;
}

function useSpaceWeather(): SpaceData {
  const [state, setState] = useState<SpaceData>({
    xrayClass: null, xrayLevel: 0, solarWind: null, kp: null,
    rScale: 0, sScale: 0, gScale: 0, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (memCache && Date.now() - memCache.ts < TTL) {
      setState({ ...memCache.data, loading: false, error: null });
      return;
    }
    (async () => {
      try {
        const [xrayR, windR, kpR, scalesR] = await Promise.all([
          fetch("https://services.swpc.noaa.gov/products/summary/xray.json").catch(() => null),
          fetch("https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json").catch(() => null),
          fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json").catch(() => null),
          fetch("https://services.swpc.noaa.gov/products/noaa-scales.json").catch(() => null),
        ]);

        let xrayClass: string | null = null;
        if (xrayR?.ok) {
          const j = await xrayR.json();
          xrayClass = j?.MaxClass ?? j?.Max ?? null;
        }
        const xrayLevel = parseXrayClass(xrayClass);

        let solarWind: number | null = null;
        if (windR?.ok) {
          const j = await windR.json();
          const v = parseFloat(j?.WindSpeed ?? j?.Speed ?? "");
          solarWind = Number.isFinite(v) ? v : null;
        }

        let kp: number | null = null;
        if (kpR?.ok) {
          const arr = await kpR.json();
          // arr[0] = header. siste rad = nyeste observasjon
          if (Array.isArray(arr) && arr.length > 1) {
            const last = arr[arr.length - 1];
            const v = parseFloat(last?.[1]);
            kp = Number.isFinite(v) ? v : null;
          }
        }

        let rScale = 0, sScale = 0, gScale = 0;
        if (scalesR?.ok) {
          const j = await scalesR.json();
          // strukturen: { "0": { R:{Scale,..}, S:{...}, G:{...}}, "-1":..., "1":..., "2":... }
          const today = j?.["0"];
          if (today) {
            rScale = parseInt(today.R?.Scale ?? "0") || 0;
            sScale = parseInt(today.S?.Scale ?? "0") || 0;
            gScale = parseInt(today.G?.Scale ?? "0") || 0;
          }
        }

        const data = { xrayClass, xrayLevel, solarWind, kp, rScale, sScale, gScale };
        memCache = { ts: Date.now(), data };
        if (!cancelled) setState({ ...data, loading: false, error: null });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "feil" }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}

function nordlysSannsynlighet(kp: number | null): { label: string; chance: number } {
  if (kp == null) return { label: "Ukjent", chance: 0 };
  if (kp < 2) return { label: "Lite sannsynlig", chance: 10 };
  if (kp < 3) return { label: "Mulig i Nord-Norge", chance: 25 };
  if (kp < 4) return { label: "Mulig i Trøndelag", chance: 45 };
  if (kp < 5) return { label: "Mulig på Østlandet", chance: 65 };
  if (kp < 6) return { label: "Sannsynlig på Østlandet", chance: 80 };
  if (kp < 7) return { label: "Synlig sør i Norge", chance: 90 };
  return { label: "Kraftig nordlys", chance: 98 };
}

function colorForLevel(lvl: number): string {
  if (lvl <= 0) return "#5fd07a"; // grønn — rolig
  if (lvl <= 1) return "#a3d962";
  if (lvl <= 2) return "#f7c93f"; // gul
  if (lvl <= 3) return "#f59a3c"; // oransje
  if (lvl <= 4) return "#ef5b4a"; // rød
  return "#b14bff"; // ekstrem
}

export function SpaceWeatherCard() {
  const d = useSpaceWeather();
  const aurora = nordlysSannsynlighet(d.kp);

  const tiles = [
    {
      key: "flare",
      title: "Solstormer",
      sub: "Røntgen-utbrudd fra sola",
      value: d.xrayClass ?? "—",
      detail: d.xrayLevel >= 3 ? "Sterkt utbrudd" : d.xrayLevel >= 2 ? "Moderat" : "Rolig",
      level: d.xrayLevel,
      icon: <Sun size={14} />,
      fx: <FlareFX intensity={Math.min(1, d.xrayLevel / 4)} />,
    },
    {
      key: "wind",
      title: "Solvind",
      sub: "Ladde partikler fra sola",
      value: d.solarWind != null ? `${Math.round(d.solarWind)}` : "—",
      detail: d.solarWind != null ? "km/s" : "ingen data",
      level: d.solarWind == null ? 0 : d.solarWind > 700 ? 4 : d.solarWind > 550 ? 3 : d.solarWind > 450 ? 2 : 1,
      icon: <Wind size={14} />,
      fx: <SolarWindFX speed={d.solarWind ?? 400} />,
    },
    {
      key: "geo",
      title: "Geomagnetisk storm",
      sub: "Forstyrrelse i magnetfeltet",
      value: d.kp != null ? `Kp ${d.kp.toFixed(1)}` : "—",
      detail: d.gScale > 0 ? `G${d.gScale}` : "ingen storm",
      level: d.gScale > 0 ? d.gScale : Math.max(0, Math.floor((d.kp ?? 0) - 3)),
      icon: <Magnet size={14} />,
      fx: <GeoFieldFX intensity={Math.min(1, (d.kp ?? 0) / 9)} />,
    },
    {
      key: "aurora",
      title: "Nordlys",
      sub: aurora.label,
      value: `${aurora.chance}%`,
      detail: d.kp != null ? `Kp ${d.kp.toFixed(1)}` : "—",
      level: aurora.chance > 80 ? 4 : aurora.chance > 60 ? 3 : aurora.chance > 30 ? 2 : 1,
      icon: <Sparkles size={14} />,
      fx: <AuroraFX intensity={Math.min(1, aurora.chance / 100)} />,
    },
    {
      key: "rad",
      title: "Stråling",
      sub: "Satellitt · radio · strømnett",
      value: d.sScale > 0 ? `S${d.sScale}` : d.rScale > 0 ? `R${d.rScale}` : "Rolig",
      detail: d.rScale > 0 ? `Radioblackout R${d.rScale}` : d.sScale > 0 ? "Strålingstorm" : "Normal",
      level: Math.max(d.sScale, d.rScale),
      icon: <Radio size={14} />,
      fx: <RadiationFX intensity={Math.min(1, Math.max(d.sScale, d.rScale) / 5)} />,
    },
  ];

  return (
    <article className="relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 shadow-lg shadow-black/10 p-4">
      <style>{`
        @keyframes spaceFly { 0% { opacity:0; transform: translateY(20px) scale(.92); filter: blur(6px);} 100% { opacity:1; transform: translateY(0) scale(1); filter: blur(0);} }
        @keyframes flarePulse { 0%,100% { transform: scale(1); opacity: .7; } 50% { transform: scale(1.6); opacity: 1; } }
        @keyframes flareRay { 0% { opacity:0; transform: scale(.4) rotate(var(--a)); } 50% { opacity: .9; } 100% { opacity:0; transform: scale(1.6) rotate(var(--a)); } }
        @keyframes swStream { 0% { transform: translateX(-30%); opacity:0; } 15% { opacity: var(--o,.9); } 85% { opacity: var(--o,.9); } 100% { transform: translateX(130%); opacity:0; } }
        @keyframes geoWave { 0%,100% { transform: translateX(0) scaleY(1); } 50% { transform: translateX(8px) scaleY(1.4); } }
        @keyframes auroraDrift { 0% { transform: translateX(-12%) skewX(-6deg); } 50% { transform: translateX(12%) skewX(6deg); } 100% { transform: translateX(-12%) skewX(-6deg); } }
        @keyframes radPulse { 0% { transform: scale(.3); opacity: 0.9; } 100% { transform: scale(2.2); opacity: 0; } }
      `}</style>

      <div className="relative">
        <div className="flex items-center gap-1.5 text-[11px] tracking-[0.15em] font-semibold text-white/70 uppercase mb-3">
          <Sparkles size={14} />
          <span>Romvær</span>
          <span className="ml-auto text-[10px] tracking-normal normal-case text-white/40">NOAA SWPC</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {tiles.map((t, i) => {
            const color = colorForLevel(t.level);
            return (
              <div
                key={t.key}
                className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/25 p-3 min-h-[110px] ${t.key === "rad" && tiles.length % 2 === 1 ? "col-span-2" : ""}`}
                style={{ animation: `spaceFly 0.55s cubic-bezier(.2,.8,.2,1) ${(0.05 + i * 0.08).toFixed(2)}s both` }}
              >
                <div className="absolute inset-0 pointer-events-none">{t.fx}</div>
                <div className="relative flex flex-col h-full">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/60">
                    {t.icon}<span>{t.title}</span>
                  </div>
                  <div className="text-[10px] text-white/50 mt-0.5">{t.sub}</div>
                  <div className="mt-auto flex items-end justify-between">
                    <div className="text-2xl font-light tabular-nums" style={{ color }}>{d.loading ? "…" : t.value}</div>
                    <div className="text-[10px] text-white/60 text-right">{t.detail}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-[10px] text-white/45 leading-snug">
          Data fra NOAA Space Weather Prediction Center. Solstormer (røntgenklasse), solvind (DSCOVR),
          geomagnetisk Kp-indeks og NOAA-skalaer for radio (R), stråling (S) og storm (G).
        </p>
      </div>
    </article>
  );
}

// ============================================================
// FX
// ============================================================

function FlareFX({ intensity }: { intensity: number }) {
  const rays = 8;
  return (
    <div className="absolute -top-4 -right-4 w-32 h-32">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, rgba(255,200,80,${0.55 + intensity * 0.4}) 0%, rgba(255,120,30,${0.25 + intensity * 0.3}) 40%, transparent 70%)`,
          animation: `flarePulse ${(2.8 - intensity * 1.2).toFixed(2)}s ease-in-out infinite`,
        }}
      />
      {Array.from({ length: rays }).map((_, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 origin-left"
          style={{
            width: "60%",
            height: 2,
            background: `linear-gradient(to right, rgba(255,220,120,${0.6 + intensity * 0.4}), transparent)`,
            transform: `translate(-50%,-50%) rotate(${(i * 360) / rays}deg)`,
            ["--a" as never]: `${(i * 360) / rays}deg`,
            animation: `flareRay ${(2 + Math.random()).toFixed(2)}s ease-out ${(i * 0.2).toFixed(2)}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function SolarWindFX({ speed }: { speed: number }) {
  const norm = Math.min(1, Math.max(0, (speed - 300) / 600));
  const count = 14;
  return (
    <div className="absolute inset-0">
      {Array.from({ length: count }).map((_, i) => {
        const top = 8 + ((i * 13) % 86);
        const dur = (4.5 - norm * 3) + Math.random() * 1.5;
        const len = 18 + Math.random() * 30;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              top: `${top}%`,
              left: 0,
              width: `${len}px`,
              height: 1.5,
              background: `linear-gradient(to right, transparent, rgba(180,220,255,${0.6 + norm * 0.4}), transparent)`,
              ["--o" as never]: `${0.5 + norm * 0.5}`,
              animation: `swStream ${dur.toFixed(2)}s linear ${(i * 0.18).toFixed(2)}s infinite`,
              filter: "blur(0.3px)",
            }}
          />
        );
      })}
    </div>
  );
}

function GeoFieldFX({ intensity }: { intensity: number }) {
  const lines = 5;
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 110" preserveAspectRatio="none">
      <defs>
        <linearGradient id="geoG" x1="0" x2="1">
          <stop offset="0%" stopColor="rgba(120,200,255,0)" />
          <stop offset="50%" stopColor={`rgba(140,200,255,${0.35 + intensity * 0.5})`} />
          <stop offset="100%" stopColor="rgba(120,200,255,0)" />
        </linearGradient>
      </defs>
      {Array.from({ length: lines }).map((_, i) => {
        const y = 15 + i * 18;
        const amp = 6 + intensity * 14;
        return (
          <path
            key={i}
            d={`M0 ${y} Q50 ${y - amp} 100 ${y} T200 ${y}`}
            stroke="url(#geoG)"
            strokeWidth={1 + intensity * 1.5}
            fill="none"
            style={{
              transformOrigin: "100px 55px",
              animation: `geoWave ${(2.5 + i * 0.4).toFixed(2)}s ease-in-out ${(i * 0.2).toFixed(2)}s infinite`,
            }}
          />
        );
      })}
    </svg>
  );
}

function AuroraFX({ intensity }: { intensity: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute -inset-x-8 top-2 h-16"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(80,255,180,${0.35 + intensity * 0.5}) 30%, rgba(120,140,255,${0.35 + intensity * 0.5}) 70%, transparent)`,
          filter: "blur(10px)",
          animation: `auroraDrift ${(6 - intensity * 2).toFixed(2)}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute -inset-x-8 top-8 h-12"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(180,80,255,${0.25 + intensity * 0.45}) 40%, rgba(80,255,200,${0.25 + intensity * 0.45}) 80%, transparent)`,
          filter: "blur(14px)",
          animation: `auroraDrift ${(8 - intensity * 2).toFixed(2)}s ease-in-out 0.6s infinite reverse`,
        }}
      />
    </div>
  );
}

function RadiationFX({ intensity }: { intensity: number }) {
  const count = 4;
  return (
    <div className="absolute inset-0 flex items-center justify-end pr-3">
      <div className="relative w-16 h-16">
        <div
          className="absolute inset-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full"
          style={{ background: `rgba(255,180,80,${0.7 + intensity * 0.3})`, boxShadow: `0 0 ${8 + intensity * 16}px rgba(255,200,100,${0.6 + intensity * 0.4})` }}
        />
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border"
            style={{
              borderColor: `rgba(255,200,120,${0.5 + intensity * 0.5})`,
              animation: `radPulse ${(2.2 - intensity * 0.8).toFixed(2)}s ease-out ${(i * 0.5).toFixed(2)}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
