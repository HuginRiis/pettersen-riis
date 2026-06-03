import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Wind, Sun, Zap, Lightbulb, Thermometer, Waves,
  Droplets, Gauge, CloudSun, Activity, Power, Settings2,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
} from "recharts";
import { SiteHeader } from "@/components/SiteHeader";
import { useUvSun } from "@/hooks/use-uv-sun";
import { useTibberLive } from "@/hooks/useTibberLive";
import { fetchAirQualityPanel } from "@/lib/air-quality-fetch.functions";
import { getBassengHistory, type BassengHistoryPoint } from "@/lib/basseng-history.functions";

export const Route = createFileRoute("/smart-dashbord")({
  head: () => ({
    meta: [
      { title: "Smart dashbord | House Pettersen Riis" },
      { name: "description", content: "Smart-hjem dashbord — luftkvalitet, UV, strøm, lys, varmepumpe og basseng på ett sted." },
    ],
  }),
  component: SmartDashbord,
});

const BORGEN = { lat: 59.1789, lon: 9.5732 };

// ----- shared tile -----
function Tile({
  title, icon, accent, children, className = "", action,
}: {
  title: string;
  icon: React.ReactNode;
  accent?: string; // tailwind text color e.g. "text-sky-400"
  className?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl
                  shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] overflow-hidden
                  p-4 flex flex-col ${className}`}
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

// ----- UV tile -----
function UvTile() {
  const uv = useUvSun(BORGEN.lat, BORGEN.lon);
  const now = uv.uvNow ?? 0;
  const max = uv.uvMaxToday ?? 0;
  const pct = Math.min(100, (now / 11) * 100);
  const ring = `conic-gradient(rgb(251 191 36) ${pct}%, rgba(255,255,255,0.08) 0)`;
  const data = uv.hours.slice(0, 18).map((h) => ({
    t: new Date(h.time).getHours(),
    uv: h.uv,
  }));
  return (
    <Tile title="UV-indeks · Borgen" icon={<Sun size={14} />} accent="text-amber-400">
      <div className="flex items-center gap-4">
        <div
          className="relative h-24 w-24 rounded-full flex items-center justify-center"
          style={{ background: ring }}
        >
          <div className="absolute inset-[6px] rounded-full bg-[#0c0f15] flex flex-col items-center justify-center">
            <div className="text-2xl font-semibold text-white tabular-nums">
              {uv.loading ? "—" : now.toFixed(1)}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-white/40">UV nå</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-white/40">Maks i dag</div>
          <div className="text-lg font-medium text-white tabular-nums">{max.toFixed(1)}</div>
          <div className="h-12 mt-1">
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
  );
}

// ----- AQ tile -----
function AqiTile() {
  const fetchAq = useServerFn(fetchAirQualityPanel);
  const [aqi, setAqi] = useState<number | null>(null);
  const [pm25, setPm25] = useState<number | null>(null);
  const [pm10, setPm10] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAq({ data: BORGEN })
      .then((res: any) => {
        if (cancelled) return;
        setAqi(res?.current?.european_aqi ?? null);
        setPm25(res?.current?.pm2_5 ?? null);
        setPm10(res?.current?.pm10 ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fetchAq]);

  const status =
    aqi == null ? "—" :
    aqi <= 20 ? "Utmerket" :
    aqi <= 40 ? "God" :
    aqi <= 60 ? "Middels" :
    aqi <= 80 ? "Dårlig" : "Svært dårlig";
  const color =
    aqi == null ? "text-white/60" :
    aqi <= 20 ? "text-emerald-400" :
    aqi <= 40 ? "text-lime-400" :
    aqi <= 60 ? "text-amber-400" :
    aqi <= 80 ? "text-orange-400" : "text-rose-400";

  return (
    <Tile title="Luftkvalitet · Tollnes" icon={<Wind size={14} />} accent="text-emerald-400">
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
          <div className="text-xs text-white tabular-nums">{pm25?.toFixed(1) ?? "—"} <span className="text-white/40">µg</span></div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">PM10</div>
          <div className="text-xs text-white tabular-nums">{pm10?.toFixed(1) ?? "—"} <span className="text-white/40">µg</span></div>
        </div>
      </div>
    </Tile>
  );
}

// ----- Strøm tile -----
function StromTile() {
  const live = useTibberLive();
  const home = live.homes.tollnes;
  const power = home.reading?.power ?? 0;
  const today = home.reading?.accumulatedConsumption ?? null;
  const max = home.reading?.maxPower ?? null;
  // simple gauge 0..6000W
  const cap = 6000;
  const pct = Math.min(100, (power / cap) * 100);
  return (
    <Tile title="Strømforbruk · Borgen" icon={<Zap size={14} />} accent="text-orange-400">
      <div className="flex items-center gap-4">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke="url(#strg)" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 264} 264`}
            />
            <defs>
              <linearGradient id="strg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fb923c" />
                <stop offset="100%" stopColor="#f43f5e" />
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
            <div className="text-base text-white tabular-nums">
              {today == null ? "—" : `${today.toFixed(1)} kWh`}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">Topp i dag</div>
            <div className="text-base text-white tabular-nums">
              {max == null ? "—" : `${(max / 1000).toFixed(1)} kW`}
            </div>
          </div>
          <div className={`text-[10px] ${home.status === "live" ? "text-emerald-400" : "text-white/40"}`}>
            ● {home.status === "live" ? "live" : home.status}
          </div>
        </div>
      </div>
    </Tile>
  );
}

// ----- Basseng tile -----
function BassengTile() {
  const fetch72 = useServerFn(getBassengHistory);
  const [points, setPoints] = useState<BassengHistoryPoint[]>([]);
  useEffect(() => {
    fetch72({ data: { hours: 72 } }).then((r) => setPoints(r.points)).catch(() => {});
  }, [fetch72]);
  const latest = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].pool_temp != null) return points[i].pool_temp!;
    }
    return null;
  }, [points]);
  const chart = points
    .filter((p) => p.pool_temp != null)
    .slice(-30)
    .map((p) => ({ t: p.ts, v: p.pool_temp }));
  const verdict =
    latest == null ? "—" :
    latest < 20 ? "Kjølig" :
    latest < 26 ? "Behagelig" :
    latest < 30 ? "Varmt" : "Veldig varmt";
  return (
    <Tile title="Basseng · Borgen" icon={<Waves size={14} />} accent="text-sky-400">
      <div className="flex items-center gap-4 h-full">
        <div>
          <div className="text-4xl font-semibold text-white tabular-nums leading-none">
            {latest == null ? "—" : `${latest.toFixed(1)}°`}
          </div>
          <div className="text-xs text-sky-300/80 mt-1">{verdict}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mt-2">Vanntemperatur</div>
        </div>
        <div className="flex-1 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id="poolg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={1.5} fill="url(#poolg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Tile>
  );
}

// ----- Lys / Varmepumpe (statiske scener — bare visuelt for nå) -----
function LysTile() {
  const scenes = [
    { name: "Kveld", active: true },
    { name: "Film", active: false },
    { name: "Lese", active: false },
    { name: "Av", active: false },
  ];
  return (
    <Tile title="Lys · Stua" icon={<Lightbulb size={14} />} accent="text-yellow-300">
      <div className="grid grid-cols-2 gap-2">
        {scenes.map((s) => (
          <button
            key={s.name}
            className={`rounded-xl border text-xs py-3 transition ${
              s.active
                ? "border-yellow-300/50 bg-yellow-300/10 text-yellow-200"
                : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.05]"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-white/40 uppercase tracking-widest mb-1">
          <span>Lysstyrke</span><span className="text-white/70">65%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full w-[65%] bg-gradient-to-r from-yellow-200 to-amber-400" />
        </div>
      </div>
    </Tile>
  );
}

function VarmepumpeTile() {
  const target = 22;
  const modes = ["Varme", "Auto", "Vifte"];
  const active = "Auto";
  return (
    <Tile title="Varmepumpe · Stua" icon={<Thermometer size={14} />} accent="text-rose-400">
      <div className="flex items-center gap-4">
        <div className="relative h-28 w-28 rounded-full bg-gradient-to-br from-rose-500/20 to-transparent flex items-center justify-center border border-rose-400/30">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-rose-200/70">Mål</div>
            <div className="text-3xl font-semibold text-white tabular-nums">{target}°</div>
            <div className="text-[10px] text-white/40">nå 21.4°</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          {modes.map((m) => (
            <button
              key={m}
              className={`text-xs py-2 rounded-lg border transition ${
                m === active
                  ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
                  : "border-white/10 bg-white/[0.02] text-white/70"
              }`}
            >{m}</button>
          ))}
        </div>
      </div>
    </Tile>
  );
}

// ----- mini-tiles -----
function MiniTile({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-full bg-white/5 flex items-center justify-center ${accent ?? "text-white/70"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
        <div className="text-sm text-white tabular-nums truncate">{value}</div>
        {sub && <div className="text-[10px] text-white/40">{sub}</div>}
      </div>
    </div>
  );
}

function SmartDashbord() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const dateStr = now.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = now.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

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
        {/* topp linje */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-white/40">Smart dashbord</div>
            <div className="text-2xl font-light text-white mt-1 capitalize">
              {dateStr} <span className="text-white/40">·</span>{" "}
              <span className="tabular-nums">{timeStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(["Borgen", "Hytta", "Garasje", "Hagen"] as const).map((r, i) => (
              <button
                key={r}
                className={`px-3 py-1.5 rounded-full text-xs transition ${
                  i === 0
                    ? "bg-white/10 text-white border border-white/20"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                {r}
              </button>
            ))}
            <button className="h-9 w-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white">
              <Settings2 size={15} />
            </button>
          </div>
        </div>

        {/* bento grid — optimalisert for iPad 11" landscape (1194×834) */}
        <div className="grid grid-cols-12 grid-rows-6 gap-4 h-[calc(100vh-150px)] min-h-[640px]">
          {/* venstre kolonne — strøm stor */}
          <div className="col-span-4 row-span-3"><StromTile /></div>
          <div className="col-span-4 row-span-3"><LysTile /></div>
          <div className="col-span-4 row-span-3"><VarmepumpeTile /></div>

          <div className="col-span-3 row-span-3"><UvTile /></div>
          <div className="col-span-3 row-span-3"><AqiTile /></div>
          <div className="col-span-6 row-span-3"><BassengTile /></div>
        </div>

        {/* mini-rad nederst */}
        <div className="grid grid-cols-6 gap-3 mt-4">
          <MiniTile icon={<Droplets size={16} />} label="Luftfukt" value="42 %" sub="Stua" accent="text-sky-300" />
          <MiniTile icon={<CloudSun size={16} />} label="Ute" value="6.2°" sub="Tollnes" accent="text-amber-300" />
          <MiniTile icon={<Gauge size={16} />} label="CO₂" value="612 ppm" sub="Soverom" accent="text-emerald-300" />
          <MiniTile icon={<Activity size={16} />} label="Pulse" value="—" sub="Tibber" accent="text-orange-300" />
          <MiniTile icon={<Power size={16} />} label="Standby" value="148 W" sub="Bakgrunn" accent="text-violet-300" />
          <MiniTile icon={<Wind size={16} />} label="Vind" value="3.1 m/s" sub="SW" accent="text-cyan-300" />
        </div>
      </main>
    </div>
  );
}
