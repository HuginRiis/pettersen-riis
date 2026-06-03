import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Wind, Sun, Zap, Lightbulb, Thermometer, Waves,
  Droplets, Gauge, CloudSun, Activity, Power, Settings2,
  TrendingUp, TrendingDown, Minus, Cloud, CloudOff, Plus, Trophy, Footprints,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer,
} from "recharts";
import { SiteHeader } from "@/components/SiteHeader";
import { useUvSun } from "@/hooks/use-uv-sun";
import { useTibberLive } from "@/hooks/useTibberLive";
import { fetchAirQualityPanel, fetchUvCloudPanel } from "@/lib/air-quality-fetch.functions";
import { getBassengHistory, type BassengHistoryPoint } from "@/lib/basseng-history.functions";
import { getGarminOverview } from "@/lib/garmin.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

// ----- shared settings (skala, bold, gap) -----
type DashSettings = { scale: number; bold: boolean; gapX: number; gapY: number };
const SETTINGS_KEY = "smartDash.settings.v1";
const DEFAULT_SETTINGS: DashSettings = { scale: 1, bold: false, gapX: 16, gapY: 16 };

function loadSettings(): DashSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    return {
      scale: Math.min(1.6, Math.max(0.7, Number(p.scale) || 1)),
      bold: !!p.bold,
      gapX: Math.min(40, Math.max(0, Number(p.gapX) ?? 16)),
      gapY: Math.min(40, Math.max(0, Number(p.gapY) ?? 16)),
    };
  } catch { return DEFAULT_SETTINGS; }
}

export const Route = createFileRoute("/smart-dashbord")({
  head: () => ({
    meta: [
      { title: "Smart dashbord | House Pettersen Riis" },
      { name: "description", content: "Smart-hjem dashbord — luftkvalitet, UV, strøm, lys, varmepumpe og basseng på ett sted." },
    ],
  }),
  component: SmartDashbord,
});

type LocId = "borgen" | "hytta";
const LOCS: Record<LocId, { label: string; lat: number; lon: number; tibber: "tollnes" | "hytta" }> = {
  borgen:  { label: "Borgen",  lat: 59.1789, lon: 9.5732, tibber: "tollnes" },
  hytta:   { label: "Hytta",   lat: 59.91,   lon: 9.07,   tibber: "hytta"   },
};

// ----- shared tile -----
function Tile({
  title, icon, accent, children, className = "", action, onClick,
}: {
  title: string;
  icon: React.ReactNode;
  accent?: string;
  className?: string;
  action?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl
                  shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] overflow-hidden
                  p-4 flex flex-col ${onClick ? "cursor-pointer hover:bg-white/[0.05] transition" : ""} ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`h-7 w-7 rounded-full bg-white/5 flex items-center justify-center ${accent ?? "text-white/80"}`}>
            {icon}
          </div>
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/60">{title}</span>
        </div>
        {action}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

// ----- UV tile + dialog -----
function UvTile({ loc }: { loc: typeof LOCS[LocId] }) {
  const uv = useUvSun(loc.lat, loc.lon);
  const [open, setOpen] = useState(false);
  const [withClouds, setWithClouds] = useState(false);
  const fetchUvCloud = useServerFn(fetchUvCloudPanel);
  const [cloudData, setCloudData] = useState<{ time: string[]; uv: number[]; uvClear: number[] } | null>(null);

  useEffect(() => {
    let c = false;
    fetchUvCloud({ data: { lat: loc.lat, lon: loc.lon } })
      .then((r: any) => {
        if (c) return;
        const h = r?.aq?.hourly;
        if (h?.time) {
          setCloudData({
            time: h.time,
            uv: h.uv_index ?? [],
            uvClear: h.uv_index_clear_sky ?? [],
          });
        }
      })
      .catch(() => {});
    return () => { c = true; };
  }, [fetchUvCloud, loc.lat, loc.lon]);

  // pick "now" value for the selected mode
  const nowVal = useMemo(() => {
    if (!cloudData) return uv.uvNow ?? 0;
    const now = Date.now();
    let best = -1, bestDiff = Infinity;
    for (let i = 0; i < cloudData.time.length; i++) {
      const d = Math.abs(new Date(cloudData.time[i]).getTime() - now);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    if (best < 0) return uv.uvNow ?? 0;
    return (withClouds ? cloudData.uv[best] : cloudData.uvClear[best]) ?? uv.uvNow ?? 0;
  }, [cloudData, withClouds, uv.uvNow]);

  const max = uv.uvMaxToday ?? 0;
  const pct = Math.min(100, (nowVal / 11) * 100);
  const ring = `conic-gradient(rgb(251 191 36) ${pct}%, rgba(255,255,255,0.08) 0)`;
  const data = uv.hours.slice(0, 18).map((h) => ({ t: new Date(h.time).getHours(), uv: h.uv }));

  return (
    <>
      <Tile title={`UV-indeks · ${loc.label}`} icon={<Sun size={14} />} accent="text-amber-400" onClick={() => setOpen(true)}>
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 rounded-full flex items-center justify-center" style={{ background: ring }}>
            <div className="absolute inset-[6px] rounded-full bg-[#0c0f15] flex flex-col items-center justify-center">
              <div className="text-2xl font-semibold text-white tabular-nums">
                {uv.loading ? "—" : nowVal.toFixed(1)}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-white/40">UV nå</div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-white/40">Maks i dag</div>
            <div className="text-lg font-medium text-white tabular-nums">{max.toFixed(1)}</div>
            <div className="text-[10px] text-white/50 mt-1 flex items-center gap-1">
              {withClouds ? <Cloud size={11} /> : <CloudOff size={11} />}
              {withClouds ? "Med skydekke" : "Uten skydekke"}
            </div>
            <div className="h-8 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
                  <defs>
                    <linearGradient id="uvg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="uv" stroke="#fbbf24" strokeWidth={1.5} fill="url(#uvg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Tile>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0c0f15] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>UV-indeks · {loc.label}</DialogTitle>
            <DialogDescription className="text-white/50">Velg om skydekke skal inkluderes</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setWithClouds(false)}
              className={`flex-1 py-2.5 rounded-xl text-sm border transition flex items-center justify-center gap-2 ${
                !withClouds ? "bg-amber-400/15 border-amber-400/40 text-amber-200" : "border-white/10 text-white/60"
              }`}
            ><CloudOff size={14} /> Uten skydekke</button>
            <button
              onClick={() => setWithClouds(true)}
              className={`flex-1 py-2.5 rounded-xl text-sm border transition flex items-center justify-center gap-2 ${
                withClouds ? "bg-sky-400/15 border-sky-400/40 text-sky-200" : "border-white/10 text-white/60"
              }`}
            ><Cloud size={14} /> Med skydekke</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Nå</div>
              <div className="text-2xl font-semibold tabular-nums">{nowVal.toFixed(1)}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Maks i dag</div>
              <div className="text-2xl font-semibold tabular-nums">{max.toFixed(1)}</div>
            </div>
          </div>
          <div className="text-[11px] text-white/40 mt-3">
            Klart-himmel-UV viser maks potensiell stråling. Med skydekke trekkes prognosert sky inn.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----- AQ tile + dialog -----
function AqiTile({ loc }: { loc: typeof LOCS[LocId] }) {
  const fetchAq = useServerFn(fetchAirQualityPanel);
  const [current, setCurrent] = useState<any>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let c = false;
    fetchAq({ data: { lat: loc.lat, lon: loc.lon } })
      .then((res: any) => { if (!c) setCurrent(res?.current ?? null); })
      .catch(() => {});
    return () => { c = true; };
  }, [fetchAq, loc.lat, loc.lon]);

  const aqi = current?.european_aqi ?? null;
  const status =
    aqi == null ? "—" :
    aqi <= 20 ? "Utmerket" : aqi <= 40 ? "God" :
    aqi <= 60 ? "Middels" : aqi <= 80 ? "Dårlig" : "Svært dårlig";
  const color =
    aqi == null ? "text-white/60" :
    aqi <= 20 ? "text-emerald-400" : aqi <= 40 ? "text-lime-400" :
    aqi <= 60 ? "text-amber-400" : aqi <= 80 ? "text-orange-400" : "text-rose-400";

  const rows: Array<[string, string, number | null | undefined, string]> = [
    ["PM2.5", "Svevestøv (fint)", current?.pm2_5, "µg/m³"],
    ["PM10", "Svevestøv (grovt)", current?.pm10, "µg/m³"],
    ["NO₂", "Nitrogendioksid", current?.nitrogen_dioxide, "µg/m³"],
    ["O₃", "Ozon", current?.ozone, "µg/m³"],
    ["SO₂", "Svoveldioksid", current?.sulphur_dioxide, "µg/m³"],
    ["CO", "Karbonmonoksid", current?.carbon_monoxide, "µg/m³"],
  ];

  return (
    <>
      <Tile title={`Luftkvalitet · ${loc.label}`} icon={<Wind size={14} />} accent="text-emerald-400" onClick={() => setOpen(true)}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-4xl font-semibold text-white tabular-nums leading-none">
              {aqi == null ? "—" : Math.round(aqi)}
            </div>
            <div className={`text-xs mt-1 ${color}`}>{status}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mt-2">Europeisk AQI</div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-right">
            <div className="text-[10px] uppercase tracking-widest text-white/40">PM2.5</div>
            <div className="text-xs text-white tabular-nums">{current?.pm2_5?.toFixed(1) ?? "—"} <span className="text-white/40">µg</span></div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">PM10</div>
            <div className="text-xs text-white tabular-nums">{current?.pm10?.toFixed(1) ?? "—"} <span className="text-white/40">µg</span></div>
          </div>
        </div>
      </Tile>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0c0f15] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Luftkvalitet · {loc.label}</DialogTitle>
            <DialogDescription className="text-white/50">Alle målinger fra Open-Meteo Air Quality</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4 mb-3 mt-1">
            <div className={`text-5xl font-semibold tabular-nums ${color}`}>{aqi == null ? "—" : Math.round(aqi)}</div>
            <div>
              <div className={`text-sm ${color}`}>{status}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">Europeisk AQI</div>
            </div>
          </div>
          <div className="space-y-1">
            {rows.map(([k, name, v, unit]) => (
              <div key={k} className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
                <div>
                  <div className="text-sm">{k}</div>
                  <div className="text-[10px] text-white/40">{name}</div>
                </div>
                <div className="text-sm tabular-nums">{v == null ? "—" : `${v.toFixed(1)} ${unit}`}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----- Strøm tile -----
function StromTile({ loc }: { loc: typeof LOCS[LocId] }) {
  const live = useTibberLive();
  const home = live.homes[loc.tibber];
  const power = home.reading?.power ?? 0;
  const today = home.reading?.accumulatedConsumption ?? null;
  const max = home.reading?.maxPower ?? null;
  const cap = 6000;
  const pct = Math.min(100, (power / cap) * 100);
  return (
    <Tile title={`Strømforbruk · ${loc.label}`} icon={<Zap size={14} />} accent="text-orange-400">
      <div className="flex items-center gap-4">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="url(#strg)" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 264} 264`} />
            <defs>
              <linearGradient id="strg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fb923c" /><stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-semibold text-white tabular-nums leading-none">
              {(power / 1000).toFixed(power < 1000 ? 2 : 1)}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">kW nå</div>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">I dag</div>
            <div className="text-base text-white tabular-nums">{today == null ? "—" : `${today.toFixed(1)} kWh`}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Topp i dag</div>
            <div className="text-base text-white tabular-nums">{max == null ? "—" : `${(max / 1000).toFixed(1)} kW`}</div>
          </div>
          <div className={`text-[10px] ${home.status === "live" ? "text-emerald-400" : "text-white/40"}`}>
            ● {home.status === "live" ? "live" : home.status}
          </div>
        </div>
      </div>
    </Tile>
  );
}

// ----- Basseng tile (kompakt med trend-pil + on/off) -----
function BassengTile({ loc }: { loc: typeof LOCS[LocId] }) {
  const fetch3 = useServerFn(getBassengHistory);
  const [points, setPoints] = useState<BassengHistoryPoint[]>([]);
  const [on, setOn] = useState(true);
  useEffect(() => {
    fetch3({ data: { hours: 3 } }).then((r) => setPoints(r.points)).catch(() => {});
  }, [fetch3]);

  const latest = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) if (points[i].pool_temp != null) return points[i].pool_temp!;
    return null;
  }, [points]);

  // trend siste time
  const trend = useMemo(() => {
    if (points.length < 2) return 0;
    const cutoff = Date.now() - 60 * 60 * 1000;
    let oldest: number | null = null, newest: number | null = null;
    for (const p of points) {
      if (p.pool_temp == null) continue;
      const t = new Date(p.ts).getTime();
      if (t >= cutoff && oldest == null) oldest = p.pool_temp;
      newest = p.pool_temp;
    }
    if (oldest == null || newest == null) return 0;
    return newest - oldest;
  }, [points]);

  const verdict =
    latest == null ? "—" :
    latest < 20 ? "Kjølig" : latest < 26 ? "Behagelig" :
    latest < 30 ? "Varmt" : "Veldig varmt";

  const TrendIcon = trend > 0.05 ? TrendingUp : trend < -0.05 ? TrendingDown : Minus;
  const trendColor = trend > 0.05 ? "text-emerald-400" : trend < -0.05 ? "text-sky-300" : "text-white/40";

  return (
    <Tile
      title={`Basseng · ${loc.label}`}
      icon={<Waves size={14} />}
      accent="text-sky-400"
      action={
        <Switch checked={on} onCheckedChange={setOn} onClick={(e) => e.stopPropagation()} />
      }
    >
      <div className="flex items-center justify-between h-full">
        <div>
          <div className="text-3xl font-semibold text-white tabular-nums leading-none">
            {latest == null ? "—" : `${latest.toFixed(1)}°`}
          </div>
          <div className="text-xs text-sky-300/80 mt-1">{on ? verdict : "Av"}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mt-1">Vanntemperatur</div>
        </div>
        <div className={`flex items-center gap-1.5 ${trendColor}`}>
          <TrendIcon size={28} />
          <div className="text-right">
            <div className="text-sm tabular-nums">{trend > 0 ? "+" : ""}{trend.toFixed(2)}°</div>
            <div className="text-[10px] text-white/40 uppercase tracking-widest">siste time</div>
          </div>
        </div>
      </div>
    </Tile>
  );
}

// ----- Lys (klikkbar) -----
function LysTile({ loc }: { loc: typeof LOCS[LocId] }) {
  const [open, setOpen] = useState(false);
  const [scene, setScene] = useState("Kveld");
  const [brightness, setBrightness] = useState(65);
  const scenes = ["Kveld", "Film", "Lese", "Av"];
  const rooms = ["Stua", "Kjøkken", "Soverom", "Gang", "Ute", "Kontor"];
  return (
    <>
      <Tile title={`Lys · Stua · ${loc.label}`} icon={<Lightbulb size={14} />} accent="text-yellow-300" onClick={() => setOpen(true)}>
        <div className="grid grid-cols-2 gap-2">
          {scenes.map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); setScene(s); }}
              className={`rounded-xl border text-xs py-3 transition ${
                s === scene
                  ? "border-yellow-300/50 bg-yellow-300/10 text-yellow-200"
                  : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.05]"
              }`}
            >{s}</button>
          ))}
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-white/40 uppercase tracking-widest mb-1">
            <span>Lysstyrke</span><span className="text-white/70">{brightness}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-yellow-200 to-amber-400" style={{ width: `${brightness}%` }} />
          </div>
        </div>
      </Tile>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0c0f15] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Lys · {loc.label}</DialogTitle>
            <DialogDescription className="text-white/50">Styr scener og rom</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Scener</div>
              <div className="grid grid-cols-4 gap-2">
                {scenes.map((s) => (
                  <button key={s} onClick={() => setScene(s)}
                    className={`rounded-xl border text-xs py-3 transition ${
                      s === scene ? "border-yellow-300/50 bg-yellow-300/10 text-yellow-200" : "border-white/10 text-white/70"
                    }`}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/40 mb-2">
                <span>Lysstyrke</span><span className="text-white/70">{brightness}%</span>
              </div>
              <input type="range" min={0} max={100} value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-amber-400" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Rom</div>
              <div className="grid grid-cols-3 gap-2">
                {rooms.map((r) => (
                  <div key={r} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm flex items-center justify-between">
                    <span>{r}</span>
                    <Switch defaultChecked={r === "Stua"} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----- Varmepumpe -----
function VarmepumpeTile({ loc }: { loc: typeof LOCS[LocId] }) {
  const [on, setOn] = useState(true);
  const [target, setTarget] = useState(22);
  const [mode, setMode] = useState("Auto");
  const modes = ["Varme", "Auto", "Vifte"];
  return (
    <Tile
      title={`Varmepumpe · ${loc.label}`}
      icon={<Thermometer size={14} />}
      accent="text-rose-400"
      action={
        <div className="flex items-center gap-2">
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${on ? "bg-rose-400" : "bg-white/20"}`}>
            {on && <span className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-60" />}
          </span>
          <Switch checked={on} onCheckedChange={setOn} />
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <div className={`relative h-28 w-28 rounded-full flex items-center justify-center border transition ${
          on ? "bg-gradient-to-br from-rose-500/30 to-transparent border-rose-400/50 shadow-[0_0_30px_-4px_rgba(244,63,94,0.6)]"
             : "bg-white/[0.02] border-white/10"
        }`}>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-rose-200/70">Mål</div>
            <div className="text-3xl font-semibold text-white tabular-nums">{target}°</div>
            <div className="text-[10px] text-white/40">nå 21.4°</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setTarget((t) => Math.max(16, t - 1))}
              className="h-9 w-9 rounded-full border border-white/10 text-white/80 hover:bg-white/5 flex items-center justify-center"
              disabled={!on}><Minus size={14} /></button>
            <div className="flex-1 text-center text-sm tabular-nums">{target}°C</div>
            <button onClick={() => setTarget((t) => Math.min(30, t + 1))}
              className="h-9 w-9 rounded-full border border-white/10 text-white/80 hover:bg-white/5 flex items-center justify-center"
              disabled={!on}><Plus size={14} /></button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {modes.map((m) => (
              <button key={m} onClick={() => setMode(m)} disabled={!on}
                className={`text-[11px] py-1.5 rounded-lg border transition ${
                  m === mode && on
                    ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
                    : "border-white/10 bg-white/[0.02] text-white/70 disabled:opacity-40"
                }`}>{m}</button>
            ))}
          </div>
        </div>
      </div>
    </Tile>
  );
}

// ----- Arne vs Rebekka leader (Garmin "vinner-poeng" - samme logikk som Steintavle 2) -----
type Daily = {
  day: string;
  steps: number | null;
  resting_heart_rate: number | null;
  active_kilocalories: number | null;
  floors_climbed: number | null;
  moderate_intensity_minutes: number | null;
  vigorous_intensity_minutes: number | null;
  body_battery_high: number | null;
  stress_average: number | null;
};
type Sleep = {
  day: string;
  total_seconds: number | null;
  deep_seconds: number | null;
  rem_seconds: number | null;
  sleep_score: number | null;
  hrv_avg: number | null;
  average_spo2: number | null;
};
type Overview = { daily: Daily[]; sleep: Sleep[] };

function osloDay(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function pickDay<T extends { day: string }>(arr: T[] | undefined, day: string) {
  return arr?.find((x) => x.day === day);
}
function countWins(a: Overview | null, r: Overview | null, day: string) {
  if (!a || !r) return { a: 0, r: 0, total: 0 };
  const aD = pickDay(a.daily, day), rD = pickDay(r.daily, day);
  const aS = pickDay(a.sleep, day), rS = pickDay(r.sleep, day);
  const intensity = (d?: Daily) =>
    d ? (d.moderate_intensity_minutes ?? 0) + (d.vigorous_intensity_minutes ?? 0) : null;
  const m: Array<{ a: any; r: any; hi: boolean }> = [
    { a: aD?.steps, r: rD?.steps, hi: true },
    { a: aS?.total_seconds, r: rS?.total_seconds, hi: true },
    { a: aS?.deep_seconds, r: rS?.deep_seconds, hi: true },
    { a: aS?.rem_seconds, r: rS?.rem_seconds, hi: true },
    { a: aS?.sleep_score, r: rS?.sleep_score, hi: true },
    { a: aD?.resting_heart_rate, r: rD?.resting_heart_rate, hi: false },
    { a: aS?.hrv_avg, r: rS?.hrv_avg, hi: true },
    { a: aS?.average_spo2, r: rS?.average_spo2, hi: true },
    { a: aD?.body_battery_high, r: rD?.body_battery_high, hi: true },
    { a: aD?.stress_average, r: rD?.stress_average, hi: false },
    { a: intensity(aD), r: intensity(rD), hi: true },
    { a: aD?.active_kilocalories, r: rD?.active_kilocalories, hi: true },
    { a: aD?.floors_climbed, r: rD?.floors_climbed, hi: true },
  ];
  let aw = 0, rw = 0, t = 0;
  for (const x of m) {
    if (x.a == null || x.r == null || x.a === x.r) continue;
    t++;
    (x.hi ? x.a > x.r : x.a < x.r) ? aw++ : rw++;
  }
  return { a: aw, r: rw, total: t };
}

function LeaderTile() {
  const fetchG = useServerFn(getGarminOverview);
  const [arne, setArne] = useState<Overview | null>(null);
  const [rebekka, setRebekka] = useState<Overview | null>(null);

  useEffect(() => {
    let c = false;
    Promise.all([
      fetchG({ data: { owner: "arne" } }),
      fetchG({ data: { owner: "rebekka" } }),
    ]).then(([a, r]) => {
      if (c) return;
      setArne(a as Overview);
      setRebekka(r as Overview);
    }).catch(() => {});
    return () => { c = true; };
  }, [fetchG]);

  const today = osloDay(0);
  const yest = osloDay(-1);
  const wt = countWins(arne, rebekka, today);
  const wy = countWins(arne, rebekka, yest);
  const arneLeads = wt.a > wt.r;
  const rebLeads  = wt.r > wt.a;
  const leader = arneLeads ? "Arne" : rebLeads ? "Rebekka" : "Likt";
  const aPct = wt.total ? (wt.a / wt.total) * 100 : 50;
  const rPct = wt.total ? (wt.r / wt.total) * 100 : 50;

  return (
    <Tile title="Vinner-poeng · Garmin" icon={<Trophy size={14} />} accent="text-violet-300">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">Leder i dag</div>
          <div className="text-lg font-medium text-white">{leader}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/40">I går</div>
          <div className="text-xs tabular-nums text-white/70">
            {wy.a} <span className="text-white/30">–</span> {wy.r}
          </div>
        </div>
      </div>

      {/* delt bar */}
      <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.06] mb-3">
        <div className="bg-gradient-to-r from-sky-400 to-cyan-300" style={{ width: `${aPct}%` }} />
        <div className="bg-gradient-to-r from-pink-400 to-rose-300 ml-auto" style={{ width: `${rPct}%` }} />
      </div>

      {/* navn + score */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-xl px-3 py-2 border transition ${
          arneLeads ? "border-sky-300/50 bg-sky-400/10 shadow-[0_0_18px_-4px_rgba(56,189,248,0.6)]"
                    : "border-white/10 bg-white/[0.03]"
        }`}>
          <div className="text-[9px] uppercase tracking-widest text-sky-200/70">Arne</div>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-2xl tabular-nums text-white" style={{ fontWeight: 600 }}>{wt.a}</span>
            <span className="text-[10px] text-white/40">poeng</span>
          </div>
        </div>
        <div className={`rounded-xl px-3 py-2 border transition ${
          rebLeads ? "border-rose-300/50 bg-rose-400/10 shadow-[0_0_18px_-4px_rgba(244,114,182,0.6)]"
                   : "border-white/10 bg-white/[0.03]"
        }`}>
          <div className="text-[9px] uppercase tracking-widest text-rose-200/70">Rebekka</div>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-2xl tabular-nums text-white" style={{ fontWeight: 600 }}>{wt.r}</span>
            <span className="text-[10px] text-white/40">poeng</span>
          </div>
        </div>
      </div>
      <div className="text-[9px] text-white/30 mt-2 text-center">
        13 metrikker · søvn, skritt, puls, HRV, stress, m.fl.
      </div>
    </Tile>
  );
}

// ----- mini-tiles -----
function MiniTile({ icon, label, value, sub, accent }:
  { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-full bg-white/5 flex items-center justify-center ${accent ?? "text-white/70"}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
        <div className="text-sm text-white tabular-nums truncate">{value}</div>
        {sub && <div className="text-[10px] text-white/40">{sub}</div>}
      </div>
    </div>
  );
}

function SmartDashbord() {
  const [now, setNow] = useState(() => new Date());
  const [locId, setLocId] = useState<LocId>("borgen");
  const loc = LOCS[locId];

  // settings (skala, bold, gap) — lagres i localStorage
  const [settings, setSettings] = useState<DashSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { setSettings(loadSettings()); setHydrated(true); }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings, hydrated]);
  const update = (p: Partial<DashSettings>) => setSettings((s) => ({ ...s, ...p }));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const dateStr = now.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = now.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

  // zoom skalerer både skrift OG element-størrelser, gap-pixler beholdes etter zoom
  const gridStyle: React.CSSProperties = {
    zoom: settings.scale as any,
    columnGap: `${settings.gapX}px`,
    rowGap: `${settings.gapY}px`,
  };
  const miniStyle: React.CSSProperties = {
    zoom: settings.scale as any,
    columnGap: `${settings.gapX}px`,
    rowGap: `${settings.gapY}px`,
    marginTop: `${settings.gapY}px`,
  };

  return (
    <div className="min-h-screen bg-[#0a0d13] text-white">
      <SiteHeader />
      <main
        className="px-6 py-5"
        style={{
          backgroundImage:
            "radial-gradient(1200px 600px at 10% -10%, rgba(56,189,248,0.08), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(251,146,60,0.08), transparent 60%)",
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/40">Smart dashbord</div>
            <div className="text-2xl font-light text-white mt-1 capitalize">
              {dateStr} <span className="text-white/40">·</span>{" "}
              <span className="tabular-nums">{timeStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(Object.keys(LOCS) as LocId[]).map((id) => (
              <button
                key={id}
                onClick={() => setLocId(id)}
                className={`px-3 py-1.5 rounded-full text-xs transition ${
                  id === locId
                    ? "bg-white/10 text-white border border-white/20"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                {LOCS[id].label}
              </button>
            ))}
            <button
              onClick={() => setSettingsOpen(true)}
              className="h-9 w-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white"
            >
              <Settings2 size={15} />
            </button>
          </div>
        </div>

        {/* bento grid */}
        <div
          className={`grid grid-cols-12 auto-rows-[220px] ${settings.bold ? "smart-bold-all" : ""}`}
          style={gridStyle}
        >
          <div className="col-span-4"><StromTile loc={loc} /></div>
          <div className="col-span-4"><LysTile loc={loc} /></div>
          <div className="col-span-4"><VarmepumpeTile loc={loc} /></div>

          <div className="col-span-3"><UvTile loc={loc} /></div>
          <div className="col-span-3"><AqiTile loc={loc} /></div>
          <div className="col-span-3"><BassengTile loc={loc} /></div>
          <div className="col-span-3"><LeaderTile /></div>
        </div>

        {/* mini-rad nederst */}
        <div
          className={`grid grid-cols-6 ${settings.bold ? "smart-bold-all" : ""}`}
          style={miniStyle}
        >
          <MiniTile icon={<Droplets size={16} />} label="Luftfukt" value="42 %" sub="Stua" accent="text-sky-300" />
          <MiniTile icon={<CloudSun size={16} />} label="Ute" value="6.2°" sub={loc.label} accent="text-amber-300" />
          <MiniTile icon={<Gauge size={16} />} label="CO₂" value="612 ppm" sub="Soverom" accent="text-emerald-300" />
          <MiniTile icon={<Activity size={16} />} label="Pulse" value="—" sub="Tibber" accent="text-orange-300" />
          <MiniTile icon={<Power size={16} />} label="Standby" value="148 W" sub="Bakgrunn" accent="text-violet-300" />
          <MiniTile icon={<Wind size={16} />} label="Vind" value="3.1 m/s" sub="SW" accent="text-cyan-300" />
        </div>
      </main>

      {/* Innstillinger */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-[#0f1320] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Dashbord-innstillinger</DialogTitle>
            <DialogDescription className="text-white/50">
              Justér skriftstørrelse, vekt og avstand mellom boksene. Lagres lokalt på denne iPaden.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-white/70">Skriftstørrelse</span>
                <span className="tabular-nums text-white/50">{Math.round(settings.scale * 100)} %</span>
              </div>
              <Slider
                min={70} max={160} step={5}
                value={[Math.round(settings.scale * 100)]}
                onValueChange={(v) => update({ scale: (v[0] ?? 100) / 100 })}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/70">Fet skrift</span>
              <Switch checked={settings.bold} onCheckedChange={(b) => update({ bold: b })} />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-white/70">Horisontal avstand</span>
                <span className="tabular-nums text-white/50">{settings.gapX} px</span>
              </div>
              <Slider
                min={0} max={40} step={2}
                value={[settings.gapX]}
                onValueChange={(v) => update({ gapX: v[0] ?? 16 })}
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-white/70">Vertikal avstand</span>
                <span className="tabular-nums text-white/50">{settings.gapY} px</span>
              </div>
              <Slider
                min={0} max={40} step={2}
                value={[settings.gapY]}
                onValueChange={(v) => update({ gapY: v[0] ?? 16 })}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                className="text-xs text-white/50 hover:text-white/80 underline underline-offset-4"
              >
                Nullstill
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
