import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Sun, Wind, Magnet, Sparkles, Radio, X } from "lucide-react";
import { useTileTone, tileToneClasses } from "./TileTone";

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

function fluxToClass(flux: number): string {
  if (!Number.isFinite(flux) || flux <= 0) return "A0.0";
  if (flux >= 1e-4) return `X${(flux / 1e-4).toFixed(1)}`;
  if (flux >= 1e-5) return `M${(flux / 1e-5).toFixed(1)}`;
  if (flux >= 1e-6) return `C${(flux / 1e-6).toFixed(1)}`;
  if (flux >= 1e-7) return `B${(flux / 1e-7).toFixed(1)}`;
  return `A${(flux / 1e-8).toFixed(1)}`;
}

function useSpaceWeather(refreshKey?: string): SpaceData {
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
          fetch("https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json").catch(() => null),
          fetch("https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json").catch(() => null),
          fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json").catch(() => null),
          fetch("https://services.swpc.noaa.gov/products/noaa-scales.json").catch(() => null),
        ]);

        let xrayClass: string | null = null;
        if (xrayR?.ok) {
          const j = await xrayR.json();
          // Velg siste måling på lang kanal (0.1-0.8 nm) — det er denne NOAA bruker for klasse
          if (Array.isArray(j) && j.length > 0) {
            const longChan = j.filter((r: any) => r.energy === "0.1-0.8nm");
            const last = longChan[longChan.length - 1] ?? j[j.length - 1];
            const flux = parseFloat(last?.flux ?? last?.observed_flux ?? "");
            if (Number.isFinite(flux)) xrayClass = fluxToClass(flux);
          }
        }
        const xrayLevel = parseXrayClass(xrayClass);

        let solarWind: number | null = null;
        if (windR?.ok) {
          const j = await windR.json();
          const row = Array.isArray(j) ? j[j.length - 1] : j;
          const v = parseFloat(row?.proton_speed ?? row?.WindSpeed ?? row?.Speed ?? "");
          solarWind = Number.isFinite(v) ? v : null;
        }

        let kp: number | null = null;
        if (kpR?.ok) {
          const arr = await kpR.json();
          if (Array.isArray(arr) && arr.length > 0) {
            const last = arr[arr.length - 1];
            let v: number = NaN;
            if (last && typeof last === "object" && !Array.isArray(last)) {
              v = parseFloat(last.Kp ?? last.kp_index ?? "");
            } else if (Array.isArray(last)) {
              v = parseFloat(last[1]);
            }
            kp = Number.isFinite(v) ? v : null;
          }
        }

        let rScale = 0, sScale = 0, gScale = 0;
        if (scalesR?.ok) {
          const j = await scalesR.json();
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
  }, [refreshKey]);

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
  if (lvl <= 0) return "#5fd07a";
  if (lvl <= 1) return "#a3d962";
  if (lvl <= 2) return "#f7c93f";
  if (lvl <= 3) return "#f59a3c";
  if (lvl <= 4) return "#ef5b4a";
  return "#b14bff";
}

function stralingBeskrivelse(rScale: number, sScale: number): string {
  if (rScale >= 1) {
    const besk: Record<number, string> = {
      1: "Sjelden HF-forstyrrelse",
      2: "Sporadisk HF-brudd",
      3: "HF nede 1–2 timer",
      4: "HF nede i timer",
      5: "Total HF-blackout",
    };
    return besk[rScale] ?? "Radioforstyrrelse";
  }
  if (sScale >= 1) {
    const besk: Record<number, string> = {
      1: "Astronauter utsatt",
      2: "Satellitt-problemer",
      3: "Satellitteknisk truet",
      4: "Satellitter offline",
      5: "Permanent satellittskade",
    };
    return besk[sScale] ?? "Strålingsøkning";
  }
  return "Ingen påvirkning";
}

// ============================================================
// Detaljerte forklaringer basert på dagens data
// ============================================================

function xrayForklaring(klass: string | null, level: number): string {
  if (!klass || level === 0) return "Ingen målbare røntgenutbrudd fra solen akkurat nå. Sola er rolig.";
  const mag = parseFloat(klass.slice(1)) || 1;
  const letter = klass[0]?.toUpperCase();
  if (letter === "A") return `${klass} – svakt bakgrunnsutbrudd. Umerkelig for oss på jorda.`;
  if (letter === "B") return `${klass} – svakt utbrudd. Ingen påvirkning av kommunikasjon.`;
  if (letter === "C") return `${klass} – moderat røntgenutbrudd. Kan forårsake svake forstyrrelser på HF-radio, men mobilnett og internett påvirkes ikke.`;
  if (letter === "M") {
    if (mag >= 5) return `${klass} – et kraftig M-klasse røntgenutbrudd. Moderat radio blackout kan oppstå på solsiden av jorden.`;
    return `${klass} – et ganske kraftig M-klasse røntgenutbrudd fra solen. Ikke ekstremt, men betydelig.`;
  }
  if (letter === "X") {
    if (mag >= 10) return `${klass} – ekstremt kraftig røntgenutbrudd! Kraftig radio blackout over hele solsiden av jorden.`;
    return `${klass} – kraftig røntgenutbrudd. Kraftig radio blackout og strålingsøkning.`;
  }
  return `${klass} – røntgenutbrudd fra solen.`;
}

function rScaleForklaring(r: number): string {
  if (r === 0) return "Ingen radio blackout. All kommunikasjon fungerer normalt.";
  if (r === 1) return "Svak radioforstyrrelse på HF-båndet (kortbølgeradio). Kan merkes av radioamatører, men vanlige mobilnett og internettbrukere merker ingenting.";
  if (r === 2) return "Moderat radio blackout på solsiden av jorden. Kan påvirke kortbølgeradio og noen navigasjonssystemer, men vanlige mobilnett og internettbrukere merker normalt ingenting.";
  if (r === 3) return "Kraftig radio blackout. HF-kommunikasjon nede i 1–2 timer på solsiden av jorden. Flytrafikk og nødkommunikasjon kan påvirkes.";
  if (r === 4) return "Svært kraftig radio blackout. HF nede i timer. GPS-nøyaktighet redusert. Kommunikasjon med fly og skip i faresonen påvirkes.";
  return "Ekstrem radio blackout. Total HF-blackout i opptil flere timer. GPS kan slå helt ut.";
}

function sScaleForklaring(s: number): string {
  if (s === 0) return "Ingen økning i solpartikkelstråling. Normalt forhold for satellitter og romfart.";
  if (s === 1) return "Svak strålingsøkning. Astronauter i rommet er litt mer utsatt, men satellitter påvirkes ikke merkbart.";
  if (s === 2) return "Moderat strålingsstorm. Satellitter kan oppleve små problemer. Astronauter i rommet har økt strålingsdose.";
  if (s === 3) return "Kraftig strålingsstorm. Satellitteknisk truet. Solpaneler på satellitter kan degradere. Astronauter bør søke beskyttelse.";
  if (s === 4) return "Svært kraftig strålingsstorm. Satellitter kan gå offline. Omfattende skade på solcellepaneler.";
  return "Ekstrem strålingsstorm. Permanent skade på satellitter. Astronauter i rommet er i stor fare.";
}

function gScaleForklaring(g: number, kp: number | null): string {
  if (g === 0) {
    if (kp == null) return "Ingen geomagnetisk storm registrert.";
    if (kp < 3) return `Kp ${kp.toFixed(1)} – svært rolig geomagnetisk aktivitet. Det er derfor appen viser «ingen storm». Magnetfeltet er stabilt.`;
    return `Kp ${kp.toFixed(1)} – noe urolig, men fortsatt under storm-nivå.`;
  }
  if (g === 1) return "Svak geomagnetisk storm (G1). Nordlys kan synes lavere enn vanlig. Små svingninger i kraftnettet.";
  if (g === 2) return "Moderat geomagnetisk storm (G2). Kraftig nordlys. Transformatorer i høye breddegrader kan påvirkes.";
  if (g === 3) return "Kraftig geomagnetisk storm (G3). Nordlys synlig langt sør. Satellittproblemer og kraftnettfeil kan oppstå.";
  if (g === 4) return "Svært kraftig geomagnetisk storm (G4). Omfattende strømbrudd og satellittskader. Nordlys synlig i Sør-Europa.";
  return "Ekstrem geomagnetisk storm (G5). Total kollaps av kraftnett i områder. Satellitter permanent skadet. Nordlys synlig på tropene.";
}

function solarWindForklaring(speed: number | null): string {
  if (speed == null) return "Ingen data om solvind akkurat nå.";
  if (speed < 350) return `${Math.round(speed)} km/s – relativt svak solvind. Roleg forhold med liten påvirkning på jordas magnetfelt.`;
  if (speed < 450) return `${Math.round(speed)} km/s – normal solvindhastighet. Typisk for rolige perioder.`;
  if (speed < 550) return `${Math.round(speed)} km/s – noe forhøyet solvind. Kan gi svak geomagnetisk aktivitet og nordlys hvis Kp stiger.`;
  if (speed < 650) return `${Math.round(speed)} km/s – rask solvind. Økt sannsynlighet for nordlys og geomagnetiske forstyrrelser.`;
  return `${Math.round(speed)} km/s – svært rask solvind! Kraftig påvirkning av magnetfeltet. Store nordlys kan oppstå.`;
}

function auroraForklaring(kp: number | null, chance: number, label: string): string {
  if (kp == null) return "Ingen Kp-data tilgjengelig. Nordlyssannsynligheten er ukjent.";
  let base = `Nordlys ${chance}% – ${label.toLowerCase()}, fordi Kp-indeksen er ${kp.toFixed(1)}.`;
  if (kp < 2) base += " Magnetfeltet er svært rolig akkurat nå.";
  else if (kp < 4) base += " Noe aktivitet, men lite forventet sør for Tromsø.";
  else if (kp < 5) base += " Nordlys kan synes over store deler av landet ved klarvær.";
  else if (kp < 7) base += " Gode sjanser for å se nordlys sør til Oslo-området!";
  else base += " Kraftig nordlys kan synes over hele landet!";
  return base;
}

// ============================================================
// Hovedkomponent
// ============================================================

export function SpaceWeatherCard({ refreshKey }: { refreshKey?: string } = {}) {
  const d = useSpaceWeather(refreshKey);
  const { tone } = useTileTone();
  const aurora = nordlysSannsynlighet(d.kp);
  const [openTile, setOpenTile] = useState<string | null>(null);

  const close = useCallback(() => setOpenTile(null), []);

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
      sub: stralingBeskrivelse(d.rScale, d.sScale),
      value: `R${d.rScale} · S${d.sScale}`,
      detail: d.rScale === 0 && d.sScale === 0 ? "Normal" : d.rScale >= d.sScale ? `Radioblackout R${d.rScale}` : `Strålingstorm S${d.sScale}`,
      level: Math.max(d.sScale, d.rScale),
      icon: <Radio size={14} />,
      fx: <RadiationFX intensity={Math.min(1, Math.max(d.sScale, d.rScale) / 5)} />,
    },
  ];

  return (
    <article className={`relative overflow-hidden rounded-2xl backdrop-blur-xl shadow-lg shadow-black/10 p-4 ${tileToneClasses(tone)}`}>
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
              <button
                key={t.key}
                onClick={() => setOpenTile(t.key)}
                className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/25 p-3 min-h-[110px] text-left cursor-pointer hover:bg-black/35 transition-colors ${t.key === "rad" && tiles.length % 2 === 1 ? "col-span-2" : ""}`}
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
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[10px] text-white/45 leading-snug">
          Trykk på en flis for detaljer. Data fra NOAA Space Weather Prediction Center.
        </p>
      </div>

      {/* Detalj-modal */}
      {openTile && (
        <SpaceWeatherDetail
          tile={openTile}
          data={d}
          aurora={aurora}
          onClose={close}
        />
      )}
    </article>
  );
}

// ============================================================
// Detalj-modal
// ============================================================

function SpaceWeatherDetail({ tile, data, aurora, onClose }: {
  tile: string;
  data: SpaceData;
  aurora: { label: string; chance: number };
  onClose: () => void;
}) {
  // Lukk ved Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const color = colorForLevel(
    tile === "flare" ? data.xrayLevel
    : tile === "wind" ? (data.solarWind == null ? 0 : data.solarWind > 700 ? 4 : data.solarWind > 550 ? 3 : data.solarWind > 450 ? 2 : 1)
    : tile === "geo" ? (data.gScale > 0 ? data.gScale : Math.max(0, Math.floor((data.kp ?? 0) - 3)))
    : tile === "aurora" ? (aurora.chance > 80 ? 4 : aurora.chance > 60 ? 3 : aurora.chance > 30 ? 2 : 1)
    : Math.max(data.sScale, data.rScale)
  );

  const sections: Record<string, { title: string; lines: { label: string; value: string }[]; explanation: string }> = {
    flare: {
      title: "Solstormer",
      lines: [
        { label: "Røntgenklasse", value: data.xrayClass ?? "Ingen aktivitet" },
        { label: "Nivå", value: data.xrayLevel === 0 ? "Rolig" : data.xrayLevel >= 4 ? "Ekstremt" : data.xrayLevel >= 3 ? "Kraftig" : data.xrayLevel >= 2 ? "Moderat" : "Svakt" },
      ],
      explanation: xrayForklaring(data.xrayClass, data.xrayLevel),
    },
    wind: {
      title: "Solvind",
      lines: [
        { label: "Hastighet", value: data.solarWind != null ? `${Math.round(data.solarWind)} km/s` : "Ukjent" },
        { label: "Tilstand", value: data.solarWind == null ? "Ingen data" : data.solarWind < 350 ? "Svak" : data.solarWind < 450 ? "Normal" : data.solarWind < 550 ? "Forhøyet" : data.solarWind < 650 ? "Rask" : "Svært rask" },
      ],
      explanation: solarWindForklaring(data.solarWind),
    },
    geo: {
      title: "Geomagnetisk storm",
      lines: [
        { label: "Kp-indeks", value: data.kp != null ? data.kp.toFixed(1) : "Ukjent" },
        { label: "NOAA G-skala", value: data.gScale > 0 ? `G${data.gScale}` : "Ingen storm" },
      ],
      explanation: gScaleForklaring(data.gScale, data.kp),
    },
    aurora: {
      title: "Nordlys",
      lines: [
        { label: "Sannsynlighet", value: `${aurora.chance}%` },
        { label: "Kp-indeks", value: data.kp != null ? data.kp.toFixed(1) : "Ukjent" },
        { label: "Synlighet", value: aurora.label },
      ],
      explanation: auroraForklaring(data.kp, aurora.chance, aurora.label),
    },
    rad: {
      title: "Stråling",
      lines: [
        { label: "Radio blackout (R)", value: data.rScale > 0 ? `R${data.rScale}` : "Ingen" },
        { label: "Strålingsstorm (S)", value: data.sScale > 0 ? `S${data.sScale}` : "Ingen" },
        { label: "Total påvirkning", value: Math.max(data.rScale, data.sScale) > 0 ? (data.rScale > data.sScale ? `Radio R${data.rScale}` : `Stråling S${data.sScale}`) : "Normal" },
      ],
      explanation: data.rScale > 0
        ? rScaleForklaring(data.rScale)
        : data.sScale > 0
          ? sScaleForklaring(data.sScale)
          : "Ingen økt stråling eller radioforstyrrelser registrert. Alt fungerer normalt.",
    },
  };

  const s = sections[tile];
  if (!s) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @keyframes spaceModalIn { 0% { opacity:0; transform: translateY(20px) scale(.96); } 100% { opacity:1; transform: translateY(0) scale(1); } }
      `}</style>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md bg-[#0f172a]/95 border-t sm:border border-white/20 sm:rounded-2xl rounded-t-2xl p-5 sm:p-6 shadow-2xl"
        style={{ animation: "spaceModalIn 0.3s ease-out both" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          aria-label="Lukk"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <h3 className="text-base font-semibold text-white">{s.title}</h3>
        </div>

        <div className="space-y-3 mb-4">
          {s.lines.map((line) => (
            <div key={line.label} className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-sm text-white/60">{line.label}</span>
              <span className="text-sm font-medium text-white tabular-nums">{line.value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <p className="text-sm text-white/90 leading-relaxed">{s.explanation}</p>
        </div>

        <p className="mt-4 text-[10px] text-white/40 text-center">
          Data fra NOAA Space Weather Prediction Center. Oppdatert kontinuerlig.
        </p>
      </div>
    </div>,
    document.body
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
