import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { Wind, X, Leaf, AlertCircle } from "lucide-react";
import { fetchAirQualityPanel } from "@/lib/air-quality-fetch.functions";

type Pollutants = {
  pm2_5: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
};

type State = {
  loading: boolean;
  error: string | null;
  data: Pollutants | null;
  fetchedAt: string | null;
};

// EU/WHO-orienterte terskler (µg/m³, CO i mg/m³)
// 0 = Lav (grønn), 1 = Moderat (gul), 2 = Høy (oransje), 3 = Svært høy (rød)
function classify(key: keyof Pollutants, v: number | null): number {
  if (v == null || !Number.isFinite(v)) return -1;
  switch (key) {
    case "pm2_5":
      if (v < 10) return 0;
      if (v < 25) return 1;
      if (v < 50) return 2;
      return 3;
    case "pm10":
      if (v < 20) return 0;
      if (v < 50) return 1;
      if (v < 100) return 2;
      return 3;
    case "no2":
      if (v < 40) return 0;
      if (v < 100) return 1;
      if (v < 200) return 2;
      return 3;
    case "o3":
      if (v < 60) return 0;
      if (v < 120) return 1;
      if (v < 180) return 2;
      return 3;
    case "so2":
      if (v < 20) return 0;
      if (v < 80) return 1;
      if (v < 250) return 2;
      return 3;
    case "co":
      // Open-Meteo returnerer µg/m³. 1 mg/m³ = 1000 µg/m³.
      if (v < 4000) return 0;
      if (v < 10000) return 1;
      if (v < 30000) return 2;
      return 3;
  }
}

function labelForLevel(lvl: number): string {
  if (lvl < 0) return "Ukjent";
  if (lvl === 0) return "Lav";
  if (lvl === 1) return "Moderat";
  if (lvl === 2) return "Høy";
  return "Svært høy";
}

function colorForLevel(lvl: number): string {
  if (lvl < 0) return "#9ca3af";
  if (lvl === 0) return "#5fd07a";
  if (lvl === 1) return "#f7c93f";
  if (lvl === 2) return "#f59a3c";
  return "#ef5b4a";
}

const META: Record<keyof Pollutants, { name: string; short: string; unit: string; about: string; source: string; effect: string }> = {
  pm2_5: {
    name: "PM2.5",
    short: "PM2.5",
    unit: "µg/m³",
    about: "Svært små svevestøvspartikler (<2,5 µm) som trenger dypt ned i lungene.",
    source: "Vedfyring, trafikk, langtransport fra Europa.",
    effect: "Kan gi pustebesvær, forverre astma, hjerte-/karplager. Barn, eldre og astmatikere er mest utsatte.",
  },
  pm10: {
    name: "PM10",
    short: "PM10",
    unit: "µg/m³",
    about: "Grovere svevestøv (<10 µm), inkludert veistøv og pollen-fragmenter.",
    source: "Piggdekk, asfaltslitasje, vedfyring, byggestøv.",
    effect: "Kan irritere luftveiene og utløse astma-anfall, særlig på tørre vårdager.",
  },
  no2: {
    name: "NO₂",
    short: "NO₂",
    unit: "µg/m³",
    about: "Nitrogendioksid — en sur gass som dannes ved forbrenning.",
    source: "Hovedsakelig biltrafikk (spesielt diesel), noe industri.",
    effect: "Irriterer luftveiene, gir nedsatt lungefunksjon og forverrer astma.",
  },
  o3: {
    name: "O₃",
    short: "O₃",
    unit: "µg/m³",
    about: "Bakkenær ozon — dannes i sollys av andre forurensninger.",
    source: "Sekundær: dannes fra NOx + VOC i sol. Høyest om sommeren.",
    effect: "Kan gi hoste, sår hals og redusert lungekapasitet ved fysisk aktivitet ute.",
  },
  so2: {
    name: "SO₂",
    short: "SO₂",
    unit: "µg/m³",
    about: "Svoveldioksid — sur gass fra svovelholdig brensel.",
    source: "Tungolje, industri, skipsfart. Lite vanlig i Norge i dag.",
    effect: "Irriterer øyne og luftveier, kan utløse astmaanfall ved høye nivåer.",
  },
  co: {
    name: "CO",
    short: "CO",
    unit: "µg/m³",
    about: "Karbonmonoksid — luktfri gass fra ufullstendig forbrenning.",
    source: "Eldre bilmotorer, vedfyring, branner. Lite vanlig i Norge ute.",
    effect: "Binder seg til hemoglobin og reduserer oksygentransporten. Farlig først ved svært høye konsentrasjoner.",
  },
};

const ORDER: (keyof Pollutants)[] = ["pm2_5", "pm10", "no2", "o3", "so2", "co"];

function formatValue(key: keyof Pollutants, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (key === "co") {
    // vis i mg/m³ for lesbarhet
    const mg = v / 1000;
    return mg < 10 ? mg.toFixed(2) : mg.toFixed(1);
  }
  return v < 10 ? v.toFixed(1) : Math.round(v).toString();
}

function unitFor(key: keyof Pollutants): string {
  return key === "co" ? "mg/m³" : "µg/m³";
}

export function AirPollutionCard({ lat, lon, locationLabel }: { lat: number; lon: number; locationLabel: string }) {
  const fetcher = useServerFn(fetchAirQualityPanel);
  const [state, setState] = useState<State>({ loading: true, error: null, data: null, fetchedAt: null });
  const [openTile, setOpenTile] = useState<keyof Pollutants | null>(null);
  const close = useCallback(() => setOpenTile(null), []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher({ data: { lat, lon } })
      .then((res: any) => {
        if (cancelled) return;
        const cur = res?.current ?? {};
        setState({
          loading: false,
          error: null,
          data: {
            pm2_5: cur.pm2_5 ?? null,
            pm10: cur.pm10 ?? null,
            no2: cur.nitrogen_dioxide ?? null,
            o3: cur.ozone ?? null,
            so2: cur.sulphur_dioxide ?? null,
            co: cur.carbon_monoxide ?? null,
          },
          fetchedAt: res?.cachedAt ?? null,
        });
      })
      .catch((e: any) => {
        if (cancelled) return;
        setState({ loading: false, error: e?.message ?? "feil", data: null, fetchedAt: null });
      });
    return () => { cancelled = true; };
  }, [lat, lon, fetcher]);

  const d = state.data;
  const worst = d ? Math.max(...ORDER.map((k) => classify(k, d[k]))) : -1;

  return (
    <article className="relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 shadow-lg shadow-black/10 p-4">
      <div className="flex items-center gap-1.5 text-[11px] tracking-[0.15em] font-semibold text-white/70 uppercase mb-1">
        <Leaf size={14} />
        <span>Luftkvalitet</span>
        <span className="ml-auto text-[10px] tracking-normal normal-case text-white/40">Open-Meteo · {locationLabel}</span>
      </div>
      <div className="text-[10px] text-white/50 mb-3">
        {state.loading ? "Henter måling…"
          : state.error ? <span className="text-rose-300/80">{state.error}</span>
          : worst <= 0 ? "Ren luft — ingen helserisiko."
          : worst === 1 ? "Moderat — sensitive personer kan merke."
          : worst === 2 ? "Høy — helseråd for astmatikere, barn og eldre."
          : "Svært høy — generelt helseråd, unngå anstrengelse ute."}
      </div>

      <style>{`
        @keyframes aqDust { 0% { transform: translate3d(-15%, var(--y,40%), 0); opacity:0; } 15% { opacity:.9; } 85% { opacity:.9; } 100% { transform: translate3d(115%, calc(var(--y,40%) - 8%), 0); opacity:0; } }
        @keyframes aqRise { 0% { transform: translate3d(var(--x,30%), 115%, 0) scale(.6); opacity:0; } 25% { opacity:.75; } 75% { opacity:.75; } 100% { transform: translate3d(calc(var(--x,30%) + 10%), -25%, 0) scale(1); opacity:0; } }
        @keyframes aqPuff { 0% { transform: translate(var(--x,20%), var(--y,60%)) scale(.4); opacity:0; } 35% { opacity:.55; } 70% { opacity:.55; } 100% { transform: translate(calc(var(--x,20%) + 25%), calc(var(--y,60%) - 35%)) scale(1.5); opacity:0; } }
        @keyframes aqSun { 0%,100% { opacity:.3; transform: scale(1);} 50% { opacity:.7; transform: scale(1.2);} }
      `}</style>
      <div className="grid grid-cols-3 gap-2">
        {ORDER.map((key) => {
          const v = d?.[key] ?? null;
          const lvl = classify(key, v);
          const color = colorForLevel(lvl);
          const intensity = lvl < 0 ? 0 : lvl;
          return (
            <button
              key={key}
              onClick={() => setOpenTile(key)}
              className="relative overflow-hidden rounded-xl border border-white/10 bg-black/25 p-2.5 text-left cursor-pointer hover:bg-black/35 transition-colors min-h-[78px]"
            >
              <PollutantFX poll={key} color={color} intensity={intensity} />
              <div className="relative flex items-center justify-between text-[10px] uppercase tracking-wider text-white/60">
                <span>{META[key].short}</span>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              </div>
              <div className="relative mt-1 text-xl font-light tabular-nums leading-tight" style={{ color }}>
                {state.loading ? "…" : formatValue(key, v)}
              </div>
              <div className="relative text-[9px] text-white/50">{unitFor(key)} · {labelForLevel(lvl)}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/45 leading-snug">
        <AlertCircle size={11} />
        <span>Trykk på en flis for kilder og helseråd.</span>
      </div>

      {openTile && d && (
        <PollutantDetail
          poll={openTile}
          value={d[openTile]}
          onClose={close}
        />
      )}
    </article>
  );
}

function PollutantDetail({ poll, value, onClose }: { poll: keyof Pollutants; value: number | null; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const meta = META[poll];
  const lvl = classify(poll, value);
  const color = colorForLevel(lvl);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`@keyframes aqModalIn { 0% { opacity:0; transform: translateY(20px) scale(.96);} 100% { opacity:1; transform: translateY(0) scale(1);} }`}</style>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md bg-[#0f172a]/95 border-t sm:border border-white/20 sm:rounded-2xl rounded-t-2xl p-5 sm:p-6 shadow-2xl"
        style={{ animation: "aqModalIn 0.3s ease-out both" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          aria-label="Lukk"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <h3 className="text-base font-semibold text-white">{meta.name}</h3>
        </div>
        <div className="text-xs text-white/60 mb-4">{meta.about}</div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-sm text-white/60">Måling nå</span>
            <span className="text-sm font-medium text-white tabular-nums">
              {formatValue(poll, value)} {unitFor(poll)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-sm text-white/60">Nivå</span>
            <span className="text-sm font-medium tabular-nums" style={{ color }}>{labelForLevel(lvl)}</span>
          </div>
        </div>

        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Kilde</div>
            <p className="text-sm text-white/90 leading-relaxed">{meta.source}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Slik påvirker det oss</div>
            <p className="text-sm text-white/90 leading-relaxed">{meta.effect}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-1.5 text-[9px] text-center text-white/70">
          <div className="rounded py-1.5" style={{ background: "rgba(95,208,122,0.25)" }}>Lav</div>
          <div className="rounded py-1.5" style={{ background: "rgba(247,201,63,0.25)" }}>Moderat</div>
          <div className="rounded py-1.5" style={{ background: "rgba(245,154,60,0.25)" }}>Høy</div>
          <div className="rounded py-1.5" style={{ background: "rgba(239,91,74,0.25)" }}>Svært høy</div>
        </div>

        <p className="mt-4 text-[10px] text-white/40 text-center">
          Data fra Open-Meteo Air Quality. Terskler basert på EU- og WHO-veiledning.
        </p>
      </div>
    </div>,
    document.body
  );
}
