import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Wind, Sun, Lightbulb, Thermometer, Waves,
  Droplets, Gauge, CloudSun, Activity, Power, Settings2,
  TrendingUp, TrendingDown, Minus, Cloud, CloudOff, Plus, Trophy, Home,
  CalendarDays, Trash2, Mail, Cake, Bell, Zap, CloudRain,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer,
} from "recharts";
import { useUvSun } from "@/hooks/use-uv-sun";
import { useDailyMinMax } from "@/hooks/use-daily-minmax";
import { getNetatmoWeatherStation, type WeatherModule } from "@/lib/netatmo-weather.functions";
import { fetchAirQualityPanel, fetchUvCloudPanel } from "@/lib/air-quality-fetch.functions";
import { getBassengHistory, type BassengHistoryPoint } from "@/lib/basseng-history.functions";
import { getGarminOverview } from "@/lib/garmin.functions";
import {
  getHomeySnapshot,
  setLivingRoomDeviceCapability,
  type HomeyDeviceSnapshot,
  type HomeyZone,
} from "@/lib/homey.functions";
import { getGarbageOverview } from "@/lib/garbage-collection";
import { getPowerByTheHour } from "@/lib/power-by-the-hour";
import { useTibberLive } from "@/hooks/useTibberLive";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import arneHappy from "@/assets/arne-happy.png";
import arneSad from "@/assets/arne-sad.png";
import rebekkaHappy from "@/assets/rebekka-happy.png";
import rebekkaSad from "@/assets/rebekka-sad.png";


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
      { name: "description", content: "Smart-hjem dashbord — luftkvalitet, UV, lys, varmepumpe og basseng på ett sted." },
    ],
  }),
  component: SmartDashbord,
});

type LocId = "borgen" | "hytta";
const LOCS: Record<LocId, { label: string; lat: number; lon: number }> = {
  borgen:  { label: "Borgen",  lat: 59.1789, lon: 9.5732 },
  hytta:   { label: "Hytta",   lat: 59.91,   lon: 9.07   },
};

// ===== Homey helpers =====
function isHueDevice(d: HomeyDeviceSnapshot): boolean {
  const haystack = `${d.driverUri ?? ""} ${d.name ?? ""}`.toLowerCase();
  return /philips\.?hue|hue-zigbee|com\.athom\.hue/.test(haystack);
}
function isMelcloud(d: HomeyDeviceSnapshot): boolean {
  const h = `${d.driverUri ?? ""} ${d.name ?? ""}`.toLowerCase();
  return h.includes("melcloud") || h.includes("mitsubishi");
}
function isQlima(d: HomeyDeviceSnapshot): boolean {
  const h = `${d.driverUri ?? ""} ${d.name ?? ""}`.toLowerCase();
  return h.includes("qlima");
}
/** Generisk varmepumpe-match basert på navn / driver / klasse. */
function isVarmepumpeLike(d: HomeyDeviceSnapshot): boolean {
  const h = `${d.driverUri ?? ""} ${d.name ?? ""} ${(d as any)?.virtualClass ?? ""} ${(d as any)?.class ?? ""}`.toLowerCase();
  if (h.includes("varmepump")) return true;
  if (h.includes("heatpump") || h.includes("heat_pump")) return true;
  if (h.includes("thermostat") && (h.includes("air") || h.includes("aircon"))) return true;
  return false;
}
function isHyttaZoneName(name: string): boolean {
  return name.toLowerCase().includes("hytt");
}
function isSpisestueZoneName(name: string): boolean {
  return name.toLowerCase().includes("spisestue") || name.toLowerCase().includes("spisestua");
}
function isStueZoneName(name: string): boolean {
  const n = name.toLowerCase();
  if (isSpisestueZoneName(n)) return false;
  return n.includes("stue") || n.includes("stua");
}

// Read a capability value from a device snapshot
function capVal(d: HomeyDeviceSnapshot | null | undefined, cap: string): string | number | boolean | null {
  const m = d?.capabilities?.[cap];
  if (!m) return null;
  const v = m.value;
  return v === undefined ? null : v;
}
function capNum(d: HomeyDeviceSnapshot | null | undefined, cap: string): number | null {
  const v = capVal(d, cap);
  return typeof v === "number" ? v : null;
}
function capBool(d: HomeyDeviceSnapshot | null | undefined, cap: string): boolean {
  return capVal(d, cap) === true;
}
function capStr(d: HomeyDeviceSnapshot | null | undefined, cap: string): string | null {
  const v = capVal(d, cap);
  return typeof v === "string" ? v : null;
}

// Shared Homey snapshot hook (polled every 60s)
function useHomeySnapshot() {
  const fetchSnap = useServerFn(getHomeySnapshot);
  const [devices, setDevices] = useState<HomeyDeviceSnapshot[]>([]);
  const [zones, setZones] = useState<HomeyZone[]>([]);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let c = false;
    const load = () => {
      fetchSnap({ data: {} })
        .then((r: any) => {
          if (c || !r?.ok) return;
          setDevices(r.devices ?? []);
          setZones(r.zones ?? []);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { c = true; clearInterval(id); };
  }, [fetchSnap, tick]);
  return { devices, zones, reload };
}

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
                  p-4 flex flex-col h-full ${onClick ? "cursor-pointer hover:bg-white/[0.05] transition" : ""} ${className}`}
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
    const load = () => {
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
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
  }, [fetchUvCloud, loc.lat, loc.lon]);

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
        <div className="flex items-center gap-4 h-full">
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
    const load = () => {
      fetchAq({ data: { lat: loc.lat, lon: loc.lon } })
        .then((res: any) => { if (!c) setCurrent(res?.current ?? null); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
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
        <div className="flex items-end justify-between gap-3 h-full">
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

// ----- Basseng tile (kobling mot ekte Homey-bryter) -----
function BassengTile({
  loc, switchDevice, onReload,
}: {
  loc: typeof LOCS[LocId];
  switchDevice: HomeyDeviceSnapshot | null;
  onReload: () => void;
}) {
  const fetch3 = useServerFn(getBassengHistory);
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [points, setPoints] = useState<BassengHistoryPoint[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let c = false;
    const load = () => {
      fetch3({ data: { hours: 24 } }).then((r) => { if (!c) setPoints(r.points); }).catch(() => {});
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
  }, [fetch3]);

  const latest = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) if (points[i].pool_temp != null) return points[i].pool_temp!;
    return null;
  }, [points]);

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

  // Live status fra Homey + optimistisk override
  const snapOn = capBool(switchDevice, "onoff");
  const [onLocal, setOnLocal] = useState<boolean | null>(null);
  useEffect(() => {
    if (onLocal !== null && snapOn === onLocal) setOnLocal(null);
  }, [snapOn, onLocal]);
  const isOn = onLocal ?? snapOn;
  const watts = capNum(switchDevice, "measure_power");

  // sparkline – pool temp last 24h
  const sparkData = points.filter((p) => p.pool_temp != null).map((p) => ({ t: p.ts, v: p.pool_temp! }));

  const verdict =
    latest == null ? "—" :
    latest < 20 ? "Kjølig" : latest < 26 ? "Behagelig" :
    latest < 30 ? "Varmt" : "Veldig varmt";

  const TrendIcon = trend > 0.05 ? TrendingUp : trend < -0.05 ? TrendingDown : Minus;
  const trendColor = trend > 0.05 ? "text-emerald-400" : trend < -0.05 ? "text-sky-300" : "text-white/40";

  const toggle = async (next: boolean) => {
    if (!switchDevice || busy) return;
    setOnLocal(next); // umiddelbar UI
    setBusy(true);
    try {
      await setCap({ data: { deviceId: switchDevice.id, capability: "onoff", value: next } });
      onReload();
    } catch {
      setOnLocal(null);
    } finally {
      setBusy(false);
    }
  };


  return (
    <Tile
      title={`Basseng · ${loc.label}`}
      icon={<Waves size={14} />}
      accent="text-sky-400"
      action={
        switchDevice ? (
          <Switch
            checked={isOn}
            disabled={busy}
            onCheckedChange={toggle}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-[10px] text-white/30">ingen bryter</span>
        )
      }
    >
      <div className="flex flex-col h-full justify-between">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-4xl font-semibold text-white tabular-nums leading-none">
              {latest == null ? "—" : `${latest.toFixed(1)}°`}
            </div>
            <div className="text-xs text-sky-300/80 mt-1">{isOn ? verdict : "Av"}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mt-1">Vanntemperatur</div>
            {watts != null && (
              <div className="text-[10px] text-white/40 mt-1 tabular-nums">{Math.round(watts)} W</div>
            )}
          </div>
          <div className={`flex items-center gap-1.5 ${trendColor}`}>
            <TrendIcon size={26} />
            <div className="text-right">
              <div className="text-sm tabular-nums">{trend > 0 ? "+" : ""}{trend.toFixed(2)}°</div>
              <div className="text-[10px] text-white/40 uppercase tracking-widest">siste time</div>
            </div>
          </div>
        </div>
        <div className="h-12 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id="bsg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="#38bdf8" strokeWidth={1.5} fill="url(#bsg)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Tile>
  );
}

// ----- Lys (Hue via Homey) -----
function LysTile({
  loc, hueLights, onReload, zoneLabel,
}: {
  loc: typeof LOCS[LocId];
  hueLights: HomeyDeviceSnapshot[];
  onReload: () => void;
  zoneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [busy, setBusy] = useState<string | null>(null);
  // Per-device optimistiske overrides
  const [onOverride, setOnOverride] = useState<Record<string, boolean>>({});
  const [dimOverride, setDimOverride] = useState<Record<string, number>>({});

  // Rens overrides når snapshot matcher
  useEffect(() => {
    setOnOverride((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const d of hueLights) {
        if (next[d.id] !== undefined && capBool(d, "onoff") === next[d.id]) {
          delete next[d.id]; changed = true;
        }
      }
      return changed ? next : prev;
    });
    setDimOverride((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const d of hueLights) {
        const snap = capNum(d, "dim");
        if (next[d.id] !== undefined && snap != null && Math.abs(snap - next[d.id]) < 0.01) {
          delete next[d.id]; changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hueLights]);

  const isOnFor = (d: HomeyDeviceSnapshot): boolean =>
    onOverride[d.id] ?? capBool(d, "onoff");
  const dimFor = (d: HomeyDeviceSnapshot): number | null =>
    dimOverride[d.id] ?? capNum(d, "dim");

  const total = hueLights.length;
  const onCount = hueLights.filter(isOnFor).length;
  const dimAvg = (() => {
    const dims = hueLights.map(dimFor).filter((v): v is number => v != null);
    if (!dims.length) return null;
    return Math.round((dims.reduce((a, b) => a + b, 0) / dims.length) * 100);
  })();

  const allOn = total > 0 && onCount === total;

  const setAll = async (on: boolean) => {
    if (busy) return;
    setOnOverride((p) => {
      const n = { ...p };
      for (const d of hueLights) n[d.id] = on;
      return n;
    });
    setBusy("__all");
    try {
      await Promise.all(
        hueLights.map((d) =>
          setCap({ data: { deviceId: d.id, capability: "onoff", value: on } }).catch(() => null),
        ),
      );
      onReload();
    } finally {
      setBusy(null);
    }
  };

  const toggleOne = async (d: HomeyDeviceSnapshot, on: boolean) => {
    if (busy) return;
    setOnOverride((p) => ({ ...p, [d.id]: on }));
    setBusy(d.id);
    try {
      await setCap({ data: { deviceId: d.id, capability: "onoff", value: on } });
      onReload();
    } finally {
      setBusy(null);
    }
  };

  const setDim = async (d: HomeyDeviceSnapshot, v: number) => {
    setDimOverride((p) => ({ ...p, [d.id]: v }));
    setBusy(d.id);
    try {
      await setCap({ data: { deviceId: d.id, capability: "dim", value: v } });
      onReload();
    } finally {
      setBusy(null);
    }
  };


  return (
    <>
      <Tile
        title={`Lys · Hue · ${zoneLabel ?? loc.label}`}
        icon={<Lightbulb size={14} />}
        accent="text-yellow-300"
        onClick={() => setOpen(true)}
        action={
          total > 0 ? (
            <Switch
              checked={allOn}
              disabled={busy === "__all"}
              onCheckedChange={setAll}
              onClick={(e) => e.stopPropagation()}
            />
          ) : null
        }
      >
        <div className="flex items-center gap-4 h-full">
          <div className={`h-20 w-20 rounded-full flex items-center justify-center border transition ${
            onCount > 0
              ? "bg-yellow-300/15 border-yellow-300/50 shadow-[0_0_30px_-4px_rgba(253,224,71,0.7)]"
              : "bg-white/[0.02] border-white/10"
          }`}>
            <Lightbulb size={32} className={onCount > 0 ? "text-yellow-200" : "text-white/30"} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-2xl font-semibold text-white tabular-nums">
              {onCount}<span className="text-white/30 text-sm"> / {total}</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mt-0.5">tente Hue-lys</div>
            {dimAvg != null && (
              <>
                <div className="flex items-center justify-between text-[10px] text-white/40 uppercase tracking-widest mt-3 mb-1">
                  <span>Lysstyrke</span><span className="text-white/70 tabular-nums">{dimAvg}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-yellow-200 to-amber-400" style={{ width: `${dimAvg}%` }} />
                </div>
              </>
            )}
            {total === 0 && (
              <div className="text-[10px] text-white/40 mt-2">Fant ingen Hue-lys{zoneLabel ? ` i ${zoneLabel}` : ""}</div>
            )}
          </div>
        </div>
      </Tile>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0c0f15] border-white/10 text-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hue · {zoneLabel ?? loc.label}</DialogTitle>
            <DialogDescription className="text-white/50">Styr hver enkelt lampe</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {hueLights.length === 0 && (
              <div className="text-sm text-white/50">Ingen Hue-lys koblet til Homey.</div>
            )}
            {hueLights.map((d) => {
              const on = isOnFor(d);
              const dim = dimFor(d);

              return (
                <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate">{d.name}</span>
                    <Switch
                      checked={on}
                      disabled={busy === d.id}
                      onCheckedChange={(v) => toggleOne(d, v)}
                    />
                  </div>
                  {dim != null && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-white/40 uppercase tracking-widest mb-1">
                        <span>Lysstyrke</span><span className="text-white/70 tabular-nums">{Math.round(dim * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[Math.round(dim * 100)]}
                        onValueChange={(v) => setDim(d, (v[0] ?? 0) / 100)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----- Varmepumpe (melcloud på Borgen, qlima på Hytta) -----
function VarmepumpeTile({
  loc, device, onReload,
}: {
  loc: typeof LOCS[LocId];
  device: HomeyDeviceSnapshot | null;
  onReload: () => void;
}) {
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [busy, setBusy] = useState(false);
  // Optimistiske overrides
  const [onOv, setOnOv] = useState<boolean | null>(null);
  const [targetOv, setTargetOv] = useState<number | null>(null);
  const [modeOv, setModeOv] = useState<string | null>(null);

  const snapOn = capBool(device, "onoff");
  const snapTarget = capNum(device, "target_temperature");
  const snapMode = capStr(device, "thermostat_mode");
  useEffect(() => { if (onOv !== null && snapOn === onOv) setOnOv(null); }, [snapOn, onOv]);
  useEffect(() => { if (targetOv !== null && snapTarget === targetOv) setTargetOv(null); }, [snapTarget, targetOv]);
  useEffect(() => { if (modeOv !== null && snapMode === modeOv) setModeOv(null); }, [snapMode, modeOv]);

  const isOn = onOv ?? snapOn;
  const target = targetOv ?? snapTarget;
  const measured = capNum(device, "measure_temperature");
  const mode = modeOv ?? snapMode;
  const ttMeta = device?.capabilities?.target_temperature;
  const tmMeta = device?.capabilities?.thermostat_mode;
  const modeValues: { id: string; title?: string }[] = Array.isArray(tmMeta?.values) ? tmMeta!.values! : [];
  const tMin = typeof ttMeta?.min === "number" ? ttMeta.min : 16;
  const tMax = typeof ttMeta?.max === "number" ? ttMeta.max : 30;
  const tStep = typeof ttMeta?.step === "number" ? ttMeta.step : 1;

  const send = async (cap: string, value: any) => {
    if (!device || busy) return;
    // Optimistisk
    if (cap === "onoff") setOnOv(value as boolean);
    else if (cap === "target_temperature") setTargetOv(value as number);
    else if (cap === "thermostat_mode") setModeOv(value as string);
    setBusy(true);
    try {
      await setCap({ data: { deviceId: device.id, capability: cap, value } });
      onReload();
    } finally {

      setBusy(false);
    }
  };

  const brand = loc.label === "Hytta" ? "Qlima" : "MELCloud";

  return (
    <Tile
      title={`Varmepumpe · ${brand} · ${loc.label}`}
      icon={<Thermometer size={14} />}
      accent="text-rose-400"
      action={
        device ? (
          <div className="flex items-center gap-2">
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isOn ? "bg-rose-400" : "bg-white/20"}`}>
              {isOn && <span className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-60" />}
            </span>
            <Switch checked={isOn} disabled={busy} onCheckedChange={(v) => send("onoff", v)} />
          </div>
        ) : (
          <span className="text-[10px] text-white/30">ikke funnet</span>
        )
      }
    >
      {!device ? (
        <div className="text-xs text-white/50 h-full flex items-center justify-center">
          Fant ingen {brand}-enhet i Homey.
        </div>
      ) : (
        <div className="flex items-center gap-4 h-full">
          <div className={`relative h-24 w-24 rounded-full flex items-center justify-center border transition ${
            isOn ? "bg-gradient-to-br from-rose-500/30 to-transparent border-rose-400/50 shadow-[0_0_30px_-4px_rgba(244,63,94,0.6)]"
                 : "bg-white/[0.02] border-white/10"
          }`}>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-widest text-rose-200/70">Mål</div>
              <div className="text-2xl font-semibold text-white tabular-nums">
                {target != null ? `${target}°` : "—"}
              </div>
              {measured != null && (
                <div className="text-[10px] text-white/40">nå {measured.toFixed(1)}°</div>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            {target != null && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => send("target_temperature", Math.max(tMin, target - tStep))}
                  className="h-9 w-9 rounded-full border border-white/10 text-white/80 hover:bg-white/5 flex items-center justify-center"
                  disabled={!isOn || busy}><Minus size={14} /></button>
                <div className="flex-1 text-center text-sm tabular-nums">{target}°C</div>
                <button
                  onClick={() => send("target_temperature", Math.min(tMax, target + tStep))}
                  className="h-9 w-9 rounded-full border border-white/10 text-white/80 hover:bg-white/5 flex items-center justify-center"
                  disabled={!isOn || busy}><Plus size={14} /></button>
              </div>
            )}
            {modeValues.length > 0 && (
              <div className="grid grid-cols-3 gap-1">
                {modeValues.slice(0, 6).map((m) => (
                  <button key={m.id} onClick={() => send("thermostat_mode", m.id)} disabled={!isOn || busy}
                    className={`text-[11px] py-1.5 rounded-lg border transition truncate ${
                      m.id === mode && isOn
                        ? "border-rose-400/40 bg-rose-400/10 text-rose-200"
                        : "border-white/10 bg-white/[0.02] text-white/70 disabled:opacity-40"
                    }`}>{m.title ?? m.id}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Tile>
  );
}

// ----- Garmin Vinner-poeng -----
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let c = false;
    const load = () => {
      Promise.all([
        fetchG({ data: { owner: "arne" } }),
        fetchG({ data: { owner: "rebekka" } }),
      ]).then(([a, r]) => {
        if (c) return;
        setArne(a as Overview);
        setRebekka(r as Overview);
      }).catch(() => {});
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
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

  // Forrige uke (7 dager: i går og 6 dager tilbake)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => osloDay(-1 - i)), []);
  const weekWins = useMemo(() => {
    let a = 0, r = 0;
    const perDay: Array<{ day: string; a: number; r: number }> = [];
    for (const d of weekDays) {
      const w = countWins(arne, rebekka, d);
      perDay.push({ day: d, a: w.a, r: w.r });
      if (w.a > w.r) a++;
      else if (w.r > w.a) r++;
    }
    return { a, r, perDay };
  }, [arne, rebekka, weekDays]);

  return (
    <>
    <Tile title="Vinner-poeng · Garmin" icon={<Trophy size={14} />} accent="text-violet-300" onClick={() => setOpen(true)}>
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

      <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.06] mb-3">
        <div className="bg-gradient-to-r from-sky-400 to-cyan-300" style={{ width: `${aPct}%` }} />
        <div className="bg-gradient-to-r from-pink-400 to-rose-300 ml-auto" style={{ width: `${rPct}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={`relative rounded-xl px-3 py-2 border transition overflow-hidden ${
          arneLeads ? "border-sky-300/50 bg-sky-400/10 shadow-[0_0_18px_-4px_rgba(56,189,248,0.6)]"
                    : "border-white/10 bg-white/[0.03]"
        }`}>
          <img
            src={arneLeads ? arneHappy : rebLeads ? arneSad : arneHappy}
            alt=""
            className="absolute -right-2 -bottom-2 w-12 h-12 object-contain opacity-90 pointer-events-none select-none"
          />
          <div className="text-[9px] uppercase tracking-widest text-sky-200/70">Arne</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl tabular-nums text-white" style={{ fontWeight: 600 }}>{wt.a}</span>
            <span className="text-[10px] text-white/40">poeng</span>
          </div>
        </div>
        <div className={`relative rounded-xl px-3 py-2 border transition overflow-hidden ${
          rebLeads ? "border-rose-300/50 bg-rose-400/10 shadow-[0_0_18px_-4px_rgba(244,114,182,0.6)]"
                   : "border-white/10 bg-white/[0.03]"
        }`}>
          <img
            src={rebLeads ? rebekkaHappy : arneLeads ? rebekkaSad : rebekkaHappy}
            alt=""
            className="absolute -right-2 -bottom-2 w-12 h-12 object-contain opacity-90 pointer-events-none select-none"
          />
          <div className="text-[9px] uppercase tracking-widest text-rose-200/70">Rebekka</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl tabular-nums text-white" style={{ fontWeight: 600 }}>{wt.r}</span>
            <span className="text-[10px] text-white/40">poeng</span>
          </div>
        </div>
      </div>
      <div className="text-[9px] text-white/30 mt-2 text-center">
        13 metrikker · søvn, skritt, puls, HRV, stress, m.fl.
      </div>
    </Tile>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-[#0c0f15] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Vinner-poeng · Garmin</DialogTitle>
          <DialogDescription className="text-white/50">I går og siste 7 dager</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* I går */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">I går</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={wy.a > wy.r ? arneHappy : wy.r > wy.a ? arneSad : arneHappy} alt="" className="w-10 h-10 object-contain" />
                <div>
                  <div className="text-xs text-sky-200/80">Arne</div>
                  <div className="text-2xl font-semibold tabular-nums text-white">{wy.a}</div>
                </div>
              </div>
              <div className="text-white/30">vs</div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-xs text-rose-200/80">Rebekka</div>
                  <div className="text-2xl font-semibold tabular-nums text-white">{wy.r}</div>
                </div>
                <img src={wy.r > wy.a ? rebekkaHappy : wy.a > wy.r ? rebekkaSad : rebekkaHappy} alt="" className="w-10 h-10 object-contain" />
              </div>
            </div>
          </div>

          {/* Forrige 7 dager */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Siste 7 dager</div>
              <div className="text-sm tabular-nums">
                <span className="text-sky-300">{weekWins.a}</span>
                <span className="text-white/30 mx-1">–</span>
                <span className="text-rose-300">{weekWins.r}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {weekWins.perDay.map((d) => {
                const total = Math.max(1, d.a + d.r);
                const aW = (d.a / total) * 100;
                const rW = (d.r / total) * 100;
                const dt = new Date(d.day + "T00:00:00Z");
                const lbl = dt.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Oslo" });
                return (
                  <div key={d.day} className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 text-white/50 capitalize">{lbl}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden bg-white/[0.06] flex">
                      <div className="bg-sky-400" style={{ width: `${aW}%` }} />
                      <div className="bg-rose-400 ml-auto" style={{ width: `${rW}%` }} />
                    </div>
                    <span className="w-12 text-right tabular-nums text-white/70">{d.a}–{d.r}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ----- Kalender (i dag + neste dager) -----
type CalEvent = {
  date: string; // yyyy-mm-dd
  kind: "garbage" | "agenda" | "mail";
  title: string;
  sub?: string;
  time?: string | null;
  color: string; // tw bg-* class fragment
  icon: React.ReactNode;
};

function osloToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function daysFromToday(date: string): number {
  const today = osloToday();
  const a = new Date(today + "T00:00:00Z").getTime();
  const b = new Date(date + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

function CalendarTile() {
  const fetchGarb = useServerFn(getGarbageOverview);
  const [events, setEvents] = useState<CalEvent[]>([]);

  useEffect(() => {
    let c = false;
    const load = async () => {
      const evs: CalEvent[] = [];
      try {
        const g = await fetchGarb();
        for (const p of g.pickups ?? []) {
          const n = (p.fraksjonNavn ?? "").toLowerCase();
          let color = "bg-emerald-400";
          if (n.includes("rest")) color = "bg-zinc-400";
          else if (n.includes("papir") || n.includes("pp")) color = "bg-blue-400";
          else if (n.includes("plast")) color = "bg-amber-400";
          else if (n.includes("glas") || n.includes("metall")) color = "bg-violet-400";
          else if (n.includes("mat") || n.includes("bio")) color = "bg-emerald-400";
          evs.push({
            date: p.date,
            kind: "garbage",
            title: p.fraksjonNavn ?? "Søppel",
            sub: "Tømming",
            color,
            icon: <Trash2 size={12} />,
          });
        }
      } catch {}

      try {
        const today = osloToday();
        const horizon = new Date(); horizon.setDate(horizon.getDate() + 30);
        const horizonStr = horizon.toISOString().slice(0, 10);
        const { data } = await supabase
          .from("agenda_messages")
          .select("subject, event_date, event_time, who")
          .gte("event_date", today)
          .lte("event_date", horizonStr)
          .order("event_date", { ascending: true });
        for (const a of (data ?? []) as any[]) {
          evs.push({
            date: a.event_date,
            kind: "agenda",
            title: a.subject,
            sub: a.who ?? undefined,
            time: a.event_time ?? null,
            color: "bg-sky-400",
            icon: <Bell size={12} />,
          });
        }
      } catch {}

      if (c) return;
      evs.sort((a, b) =>
        a.date === b.date
          ? (a.time ?? "00:00").localeCompare(b.time ?? "00:00")
          : a.date.localeCompare(b.date),
      );
      setEvents(evs);
    };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
  }, [fetchGarb]);

  const today = osloToday();
  const todayEvents = events.filter((e) => e.date === today);
  // Maks 4 neste hendelser etter i dag
  const upcoming = events.filter((e) => e.date > today).slice(0, 4);

  // Grafisk gradient per type
  const gradientFor = (e: CalEvent): string => {
    if (e.kind === "garbage") {
      const t = e.title.toLowerCase();
      if (t.includes("rest")) return "from-zinc-500/70 to-zinc-700/70";
      if (t.includes("papir") || t.includes("pp")) return "from-blue-500/70 to-indigo-600/70";
      if (t.includes("plast")) return "from-amber-400/70 to-orange-500/70";
      if (t.includes("glas") || t.includes("metall")) return "from-violet-500/70 to-fuchsia-600/70";
      if (t.includes("mat") || t.includes("bio")) return "from-emerald-500/70 to-green-700/70";
      return "from-emerald-500/70 to-teal-600/70";
    }
    if (e.kind === "mail") return "from-amber-400/70 to-rose-500/70";
    return "from-sky-500/70 to-cyan-500/70";
  };

  const formatDayShort = (date: string): { big: string; small: string } => {
    const d = daysFromToday(date);
    if (d === 0) return { big: "i dag", small: "" };
    if (d === 1) return { big: "i morgen", small: "" };
    const dt = new Date(date + "T00:00:00Z");
    const day = dt.toLocaleDateString("nb-NO", { day: "numeric", timeZone: "Europe/Oslo" });
    const wd = dt.toLocaleDateString("nb-NO", { weekday: "short", timeZone: "Europe/Oslo" });
    const mon = dt.toLocaleDateString("nb-NO", { month: "short", timeZone: "Europe/Oslo" });
    return { big: `${wd} ${day}. ${mon}`, small: "" };
  };

  return (
    <Tile
      title="Kalender · Det som skjer"
      icon={<CalendarDays size={14} />}
      accent="text-cyan-300"
    >
      <div className="flex flex-col h-full gap-2 overflow-hidden">
        {/* I dag — kompakt chip-rad */}
        {todayEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <span className="text-[9px] uppercase tracking-widest text-white/40 self-center">I dag</span>
            {todayEvents.slice(0, 3).map((e, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] bg-gradient-to-r ${gradientFor(e)} text-white/95`}
              >
                <span className="opacity-80">{e.icon}</span>
                <span className="truncate max-w-[110px]">{e.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* 4 neste hendelser — grafiske kort */}
        <div className="grid grid-cols-2 gap-1.5 flex-1 min-h-0">
          {upcoming.length === 0 ? (
            <div className="col-span-2 flex items-center justify-center text-xs text-white/40 italic">
              Ingen planlagte hendelser
            </div>
          ) : (
            upcoming.map((e, i) => {
              const fd = formatDayShort(e.date);
              return (
                <div
                  key={i}
                  className={`relative overflow-hidden rounded-xl border border-white/10 p-2.5 flex flex-col justify-between
                              bg-gradient-to-br ${gradientFor(e)} shadow-[0_4px_18px_-6px_rgba(0,0,0,0.5)]`}
                >
                  <div className="absolute -top-3 -right-3 opacity-20 text-white">
                    <div className="scale-[3]">{e.icon}</div>
                  </div>
                  <div className="relative">
                    <div className="text-[12px] font-semibold text-white leading-tight truncate">{e.title}</div>
                  </div>
                  <div className="relative flex items-end justify-between gap-2 mt-1">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-white tabular-nums leading-none capitalize">
                        {fd.big}
                      </div>
                      {e.sub && (
                        <div className="text-[10px] text-white/85 leading-snug mt-0.5 break-words">
                          {e.sub}
                        </div>
                      )}
                    </div>
                    {e.time && (
                      <div className="text-[10px] text-white/80 tabular-nums shrink-0">{e.time.slice(0, 5)}</div>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>
    </Tile>
  );
}

// ----- Lys kombinert (Stue + Spisestue i én boks) -----
function LysCombinedTile({
  groups, onReload,
}: {
  groups: { label: string; lights: HomeyDeviceSnapshot[] }[];
  onReload: () => void;
}) {
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [onOv, setOnOv] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOnOv((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const g of groups) for (const d of g.lights) {
        if (next[d.id] !== undefined && capBool(d, "onoff") === next[d.id]) {
          delete next[d.id]; changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groups]);

  const isOnFor = (d: HomeyDeviceSnapshot) => onOv[d.id] ?? capBool(d, "onoff");

  const setGroup = async (g: { label: string; lights: HomeyDeviceSnapshot[] }, on: boolean) => {
    if (busy) return;
    setOnOv((p) => {
      const n = { ...p };
      for (const d of g.lights) n[d.id] = on;
      return n;
    });
    setBusy(g.label);
    try {
      await Promise.all(
        g.lights.map((d) =>
          setCap({ data: { deviceId: d.id, capability: "onoff", value: on } }).catch(() => null),
        ),
      );
      onReload();
    } finally {
      setBusy(null);
    }
  };

  const toggleOne = async (d: HomeyDeviceSnapshot, on: boolean) => {
    setOnOv((p) => ({ ...p, [d.id]: on }));
    setBusy(d.id);
    try {
      await setCap({ data: { deviceId: d.id, capability: "onoff", value: on } });
      onReload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Tile
        title="Lys · Hue · Stue + Spisestue"
        icon={<Lightbulb size={14} />}
        accent="text-yellow-300"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-col h-full gap-2 justify-center">
          {groups.map((g) => {
            const total = g.lights.length;
            const onCount = g.lights.filter(isOnFor).length;
            const allOn = total > 0 && onCount === total;
            return (
              <div
                key={g.label}
                className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${
                  onCount > 0
                    ? "border-yellow-300/40 bg-yellow-300/5"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    onCount > 0
                      ? "bg-yellow-300/15 text-yellow-200 shadow-[0_0_18px_-4px_rgba(253,224,71,0.6)]"
                      : "bg-white/[0.03] text-white/30"
                  }`}
                >
                  <Lightbulb size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-white/60">{g.label}</div>
                  <div className="text-sm text-white tabular-nums">
                    {onCount}<span className="text-white/30"> / {total}</span>
                    <span className="text-white/40 text-[10px] ml-1.5">tente</span>
                  </div>
                </div>
                <Switch
                  checked={allOn}
                  disabled={busy === g.label || total === 0}
                  onCheckedChange={(v) => setGroup(g, v)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            );
          })}
        </div>
      </Tile>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0c0f15] border-white/10 text-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hue · Stue + Spisestue</DialogTitle>
            <DialogDescription className="text-white/50">Styr hver enkelt lampe</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="text-[11px] uppercase tracking-widest text-white/50 mb-1.5">{g.label}</div>
                <div className="space-y-2">
                  {g.lights.length === 0 && (
                    <div className="text-sm text-white/40 italic">Ingen Hue-lys</div>
                  )}
                  {g.lights.map((d) => (
                    <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                      <span className="text-sm truncate">{d.name}</span>
                      <Switch
                        checked={isOnFor(d)}
                        disabled={busy === d.id}
                        onCheckedChange={(v) => toggleOne(d, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----- Strøm (Power-by-the-Hour) -----
function StromTile({ home }: { home: "borgen" | "hytta" }) {
  const fetchPbth = useServerFn(getPowerByTheHour);
  const [data, setData] = useState<any>(null);
  const [peakToday, setPeakToday] = useState<number>(0);
  const live = useTibberLive();
  const liveHome = live.homes[home === "borgen" ? "tollnes" : "hytta"];

  useEffect(() => {
    let c = false;
    const load = () => {
      fetchPbth()
        .then((r: any) => { if (!c) setData(r); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { c = true; clearInterval(id); };
  }, [fetchPbth]);

  const h = data?.ok ? (home === "borgen" ? data.borgen?.highlights : data.hytta?.highlights) : null;
  const pbthFound = data?.ok ? (home === "borgen" ? data.borgen?.found : data.hytta?.found) : false;
  const liveW = liveHome?.reading?.power ?? null;
  const isLive = (liveHome?.status === "live" || liveHome?.status === "stale") && liveW != null;
  const found = pbthFound || isLive;
  const nowW = liveW != null ? liveW : (h?.consumptionNow ?? 0);
  const nowKw = nowW / 1000;
  const energyTodayKwh = liveHome?.reading?.accumulatedConsumption ?? h?.energyToday ?? null;
  const liveMaxKw = liveHome?.reading?.maxPower != null ? liveHome.reading.maxPower / 1000 : null;

  // Track today's peak locally (persisted), reset on date change
  const dayKey = useMemo(() => {
    const d = new Date();
    return `pbth_peak_${home}_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }, [home]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = Number(localStorage.getItem(dayKey) ?? "0") || 0;
      setPeakToday(stored);
    } catch { /* */ }
  }, [dayKey]);
  useEffect(() => {
    if (!found || nowKw <= 0) return;
    if (nowKw > peakToday) {
      setPeakToday(nowKw);
      try { localStorage.setItem(dayKey, String(nowKw)); } catch { /* */ }
    }
  }, [nowKw, peakToday, dayKey, found]);

  // Gauge math: arc from 0..gaugeMax kW
  const gaugeMax = Math.max(5, Math.ceil(Math.max(peakToday, nowKw) * 1.1));
  const pct = Math.min(1, Math.max(0, nowKw / gaugeMax));
  const R = 38;
  const C = 2 * Math.PI * R;
  const dash = C * pct;
  const arcColor = nowKw < 1 ? "#34d399" : nowKw < 3 ? "#fbbf24" : "#f87171";

  return (
    <Tile title="Strøm · Forbruk" icon={<Zap size={14} />} accent="text-amber-300">
      {!found ? (
        <div className="text-xs text-white/40 h-full flex items-center justify-center text-center">
          {data?.ok ? "Fant ingen Power-by-the-Hour-enhet" : "Henter…"}
        </div>
      ) : (
        <div className="relative flex items-center gap-3 h-full overflow-hidden">
          {/* Elektrisitets-animasjon: gnister + bolt */}
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 8 }).map((_, i) => {
              const top = (i * 13) % 90;
              const left = 10 + ((i * 17) % 80);
              const dur = 1.6 + ((i * 7) % 5) / 3;
              const delay = (i * 0.21) % 2;
              return (
                <span
                  key={i}
                  className="absolute block rounded-full bg-amber-300"
                  style={{
                    top: `${top}%`,
                    left: `${left}%`,
                    width: 2,
                    height: 2,
                    opacity: 0.35 + Math.min(0.5, nowKw / 6),
                    boxShadow: "0 0 6px rgba(252,211,77,0.9)",
                    animation: `pbthSpark ${dur}s ease-in-out ${delay}s infinite`,
                  }}
                />
              );
            })}
            <Zap
              size={48}
              className="absolute right-2 top-1 text-amber-300/15"
              style={{ animation: "pbthBolt 2.4s ease-in-out infinite" }}
            />
          </div>

          {/* Gauge */}
          <div className="relative shrink-0 z-10" style={{ width: 100, height: 100 }}>
            <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
              <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
              <circle
                cx="50" cy="50" r={R}
                fill="none"
                stroke={arcColor}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${C}`}
                style={{
                  transition: "stroke-dasharray 0.6s ease, stroke 0.6s ease",
                  filter: `drop-shadow(0 0 6px ${arcColor})`,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-semibold text-white tabular-nums leading-none">
                {nowKw.toFixed(2)}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-white/40 mt-1">kW nå</div>
            </div>
          </div>
          {/* Stats */}
          <div className="flex-1 min-w-0 relative z-10">
            <div className="text-[10px] uppercase tracking-widest text-white/40">I dag</div>
            <div className="text-xl text-white tabular-nums leading-tight">
              {energyTodayKwh != null ? `${energyTodayKwh.toFixed(1)} kWh` : "—"}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mt-1.5">Topp i dag</div>
            <div className="text-xl text-white tabular-nums leading-tight">
              {(() => {
                const top = Math.max(peakToday, liveMaxKw ?? 0);
                return top > 0 ? `${top.toFixed(1)} kW` : "—";
              })()}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`h-2 w-2 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-white/30"}`} />
              <span className={`text-[11px] ${isLive ? "text-emerald-300" : "text-white/40"}`}>{isLive ? "live" : "henter…"}</span>
            </div>
          </div>
          <style>{`
            @keyframes pbthSpark{0%,100%{transform:translateY(0) scale(1);opacity:0.25}50%{transform:translateY(-6px) scale(1.6);opacity:1}}
            @keyframes pbthBolt{0%,100%{opacity:0.1;transform:scale(1)}50%{opacity:0.35;transform:scale(1.08)}}
          `}</style>
        </div>
      )}
    </Tile>
  );
}


// ----- Netatmo (Tollnes) shared hook -----
type NetatmoTollnes = {
  noise: number | null;
  humBedroom: number | null;
  rainHour: number | null;
  rainDay: number | null;
  windNow: number | null; // m/s
  windAngle: number | null;
  gustNow: number | null; // m/s
};
function useNetatmoTollnes(): NetatmoTollnes {
  const fetchNet = useServerFn(getNetatmoWeatherStation);
  const [d, setD] = useState<NetatmoTollnes>({
    noise: null, humBedroom: null, rainHour: null, rainDay: null,
    windNow: null, windAngle: null, gustNow: null,
  });
  useEffect(() => {
    let c = false;
    const kmhToMs = (v: number | undefined | null) =>
      v == null || !Number.isFinite(v) ? null : Math.round((v / 3.6) * 10) / 10;
    const load = () => {
      fetchNet({ data: { stationMatch: "tollnes" } })
        .then((r: any) => {
          if (c || !r?.ok) return;
          const modules: WeatherModule[] = r.modules ?? [];
          const main = modules.find((m) => m.type === "NAMain") ?? null;
          const bed =
            modules.find((m) => m.type === "NAModule4" && /sov|sove|bed/i.test(m.name)) ??
            modules.find((m) => m.type === "NAModule4") ?? null;
          const rain = modules.find((m) => m.type === "NAModule3") ?? null;
          const wind = modules.find((m) => m.type === "NAModule2") ?? null;
          setD({
            noise: main?.metrics.noise ?? null,
            humBedroom: bed?.metrics.humidity ?? null,
            rainHour: rain?.metrics.rainHour ?? rain?.metrics.rain ?? null,
            rainDay: rain?.metrics.rainDay ?? null,
            windNow: kmhToMs(wind?.metrics.windStrength),
            windAngle: wind?.metrics.windAngle ?? null,
            gustNow: kmhToMs(wind?.metrics.gustStrength),
          });
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 2 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
  }, [fetchNet]);
  return d;
}


// ----- Compact UV tile (half size) -----
const UV_CLOUDS_KEY = "pbth.smart.uvWithClouds";
function UvCompact({ loc }: { loc: typeof LOCS[LocId] }) {
  const uv = useUvSun(loc.lat, loc.lon);
  const fetchUvCloud = useServerFn(fetchUvCloudPanel);
  const [withClouds, setWithClouds] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(UV_CLOUDS_KEY) === "1"; } catch { return false; }
  });
  const [cloudPct, setCloudPct] = useState<number | null>(null);
  const [uvLive, setUvLive] = useState<{ uv: number | null; uvClear: number | null }>({ uv: null, uvClear: null });

  useEffect(() => {
    let c = false;
    const load = () => {
      fetchUvCloud({ data: { lat: loc.lat, lon: loc.lon } })
        .then((r: any) => {
          if (c) return;
          const h = r?.aq?.hourly;
          const fh = r?.fc?.hourly;
          if (h?.time) {
            const now = Date.now();
            let best = -1, bd = Infinity;
            for (let i = 0; i < h.time.length; i++) {
              const d = Math.abs(new Date(h.time[i]).getTime() - now);
              if (d < bd) { bd = d; best = i; }
            }
            if (best >= 0) {
              setUvLive({
                uv: h.uv_index?.[best] ?? null,
                uvClear: h.uv_index_clear_sky?.[best] ?? null,
              });
            }
          }
          if (fh?.time && fh?.cloud_cover?.length) {
            const now = Date.now();
            let best = -1, bd = Infinity;
            for (let i = 0; i < fh.time.length; i++) {
              const d = Math.abs(new Date(fh.time[i]).getTime() - now);
              if (d < bd) { bd = d; best = i; }
            }
            if (best >= 0) setCloudPct(fh.cloud_cover[best] ?? null);
          }
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
  }, [fetchUvCloud, loc.lat, loc.lon]);

  const toggleClouds = (e: React.MouseEvent) => {
    e.stopPropagation();
    setWithClouds((p) => {
      const next = !p;
      try { window.localStorage.setItem(UV_CLOUDS_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const baseClear = uvLive.uvClear ?? uv.uvNow ?? 0;
  const baseWith = uvLive.uv ?? (cloudPct != null ? baseClear * (1 - 0.75 * (cloudPct / 100)) : baseClear);
  const v = withClouds ? baseWith : baseClear;
  const max = uv.uvMaxToday ?? 0;
  const pct = Math.min(100, (v / 11) * 100);
  const ring = `conic-gradient(rgb(251 191 36) ${pct}%, rgba(255,255,255,0.08) 0)`;
  return (
    <Tile title={`UV · ${loc.label}`} icon={<Sun size={14} />} accent="text-amber-400">
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 flex-1 min-h-0">
          <div className="relative h-16 w-16 rounded-full flex items-center justify-center shrink-0" style={{ background: ring }}>
            <div className="absolute inset-[4px] rounded-full bg-[#0c0f15] flex flex-col items-center justify-center">
              <div className="text-lg font-semibold text-white tabular-nums leading-none">
                {uv.loading ? "—" : v.toFixed(1)}
              </div>
              <div className="text-[8px] uppercase tracking-widest text-white/40 mt-0.5">nå</div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-widest text-white/40">Maks</div>
            <div className="text-base font-medium text-white tabular-nums">{max.toFixed(1)}</div>
            {cloudPct != null && (
              <div className="text-[9px] text-white/40 mt-0.5">Sky {Math.round(cloudPct)}%</div>
            )}
          </div>
        </div>
        <button
          onClick={toggleClouds}
          className={`mt-1.5 w-full text-[10px] py-1 rounded-md border transition flex items-center justify-center gap-1 ${
            withClouds
              ? "bg-sky-400/15 border-sky-400/40 text-sky-200"
              : "bg-amber-400/10 border-amber-400/30 text-amber-200"
          }`}
        >
          {withClouds ? <Cloud size={10} /> : <CloudOff size={10} />}
          {withClouds ? "Med sky" : "Uten sky"}
        </button>
      </div>
    </Tile>
  );
}

// ----- Compact AQI tile (half size) -----
function AqiCompact({ loc }: { loc: typeof LOCS[LocId] }) {
  const fetchAq = useServerFn(fetchAirQualityPanel);
  const [current, setCurrent] = useState<any>(null);
  useEffect(() => {
    let c = false;
    const load = () => {
      fetchAq({ data: { lat: loc.lat, lon: loc.lon } })
        .then((r: any) => { if (!c) setCurrent(r?.current ?? null); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
  }, [fetchAq, loc.lat, loc.lon]);
  const aqi: number | null = current?.european_aqi ?? null;
  const status =
    aqi == null ? "—" :
    aqi <= 20 ? "Utmerket" : aqi <= 40 ? "God" :
    aqi <= 60 ? "Middels" : aqi <= 80 ? "Dårlig" : "Svært dårlig";
  const color =
    aqi == null ? "text-white/60" :
    aqi <= 20 ? "text-emerald-400" : aqi <= 40 ? "text-lime-400" :
    aqi <= 60 ? "text-amber-400" : aqi <= 80 ? "text-orange-400" : "text-rose-400";

  // Finn høyeste forurensnings-bidrag (relativ til WHO-grense)
  const top = useMemo(() => {
    if (!current) return null;
    const items: Array<{ label: string; v: number; unit: string; thr: number }> = [
      { label: "PM2.5", v: current.pm2_5 ?? 0, unit: "µg/m³", thr: 25 },
      { label: "PM10",  v: current.pm10 ?? 0,  unit: "µg/m³", thr: 50 },
      { label: "NO₂",   v: current.nitrogen_dioxide ?? 0, unit: "µg/m³", thr: 50 },
      { label: "O₃",    v: current.ozone ?? 0, unit: "µg/m³", thr: 120 },
      { label: "SO₂",   v: current.sulphur_dioxide ?? 0, unit: "µg/m³", thr: 100 },
      { label: "CO",    v: current.carbon_monoxide ?? 0, unit: "µg/m³", thr: 10000 },
    ];
    let best = items[0];
    let bestRatio = -1;
    for (const it of items) {
      const r = it.v / it.thr;
      if (r > bestRatio) { bestRatio = r; best = it; }
    }
    return best;
  }, [current]);

  // Animerte støvpartikler
  const particles = Array.from({ length: 10 });
  return (
    <Tile title={`Luftkval · ${loc.label}`} icon={<Wind size={14} />} accent="text-emerald-400">
      <div className="relative h-full overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          {particles.map((_, i) => {
            const top = (i * 11) % 90;
            const dur = 4 + ((i * 7) % 6);
            const delay = (i * 0.4) % 4;
            const size = 2 + (i % 3);
            return (
              <span
                key={i}
                className="absolute block rounded-full bg-emerald-300/40"
                style={{
                  top: `${top}%`,
                  left: "-10%",
                  width: size,
                  height: size,
                  animation: `pbthAqDrift ${dur}s linear ${delay}s infinite`,
                }}
              />
            );
          })}
        </div>
        <div className="relative flex flex-col justify-center h-full">
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-semibold text-white tabular-nums leading-none">
              {aqi == null ? "—" : Math.round(aqi)}
            </div>
            <div className={`text-xs ${color}`}>{status}</div>
          </div>
          {top && top.v > 0 ? (
            <div className="text-[10px] text-white/60 mt-1.5">
              Høyest <span className="text-white/90">{top.label}</span>{" "}
              <span className="tabular-nums">{top.v.toFixed(top.v < 10 ? 1 : 0)}</span>
              <span className="text-white/40"> {top.unit}</span>
            </div>
          ) : (
            <div className="text-[9px] uppercase tracking-widest text-white/40 mt-1">Europeisk AQI</div>
          )}
        </div>
      </div>
      <style>{`@keyframes pbthAqDrift{0%{transform:translateX(0)}100%{transform:translateX(800%)}}`}</style>
    </Tile>
  );
}

// ----- Rain tile (mm i dag + siste time, Tollnes) -----
function RainTile({ rainDay, rainHour }: { rainDay: number | null; rainHour: number | null }) {
  const mm = rainDay ?? 0;
  const intensity = Math.min(1, mm / 10); // 10mm = full
  const drops = Array.from({ length: 14 });
  return (
    <Tile title="Regn · Tollnes" icon={<CloudRain size={14} />} accent="text-sky-300">
      <div className="relative h-full flex items-end justify-between gap-2 overflow-hidden">
        {/* animerte regndråper */}
        <div className="pointer-events-none absolute inset-0">
          {drops.map((_, i) => {
            const left = (i * 7.3) % 100;
            const delay = (i * 0.23) % 2;
            const dur = 1.1 + ((i * 13) % 7) / 10;
            return (
              <span
                key={i}
                className="absolute block w-[2px] rounded-full bg-sky-300/60"
                style={{
                  left: `${left}%`,
                  top: "-12%",
                  height: `${10 + ((i * 5) % 14)}px`,
                  opacity: 0.25 + intensity * 0.6,
                  animation: `pbthRainFall ${dur}s linear ${delay}s infinite`,
                }}
              />
            );
          })}
        </div>
        <div className="relative z-10">
          <div className="text-[10px] uppercase tracking-widest text-white/40">I dag</div>
          <div className="text-3xl font-semibold text-white tabular-nums leading-tight">
            {rainDay == null ? "—" : mm.toFixed(1).replace(".", ",")}
            <span className="text-sm text-white/40 ml-1">mm</span>
          </div>
          <div className="text-[10px] text-white/50 mt-1">
            Siste time:{" "}
            <span className="text-sky-200 tabular-nums">
              {rainHour == null ? "—" : `${rainHour.toFixed(1).replace(".", ",")} mm`}
            </span>
          </div>
        </div>
        <div className="relative z-10 self-end">
          <Droplets size={36} className="text-sky-300/70" />
        </div>
      </div>
      <style>{`@keyframes pbthRainFall{0%{transform:translateY(0)}100%{transform:translateY(180px)}}`}</style>
    </Tile>
  );
}


// ----- Wind tile (maks gust i dag, Tollnes) -----
function WindTile({ windNow, gustNow, windAngle }: { windNow: number | null; gustNow: number | null; windAngle: number | null }) {
  const mm = useDailyMinMax("pbth.smart.gustMax", gustNow);
  const maxToday = Math.max(gustNow ?? 0, mm?.max ?? 0);
  const speed = gustNow ?? windNow ?? 0; // km/h
  const spinDur = speed > 0 ? Math.max(0.6, Math.min(6, 30 / speed)) : 6;
  return (
    <Tile title="Vind · Tollnes" icon={<Wind size={14} />} accent="text-cyan-300">
      <div className="relative h-full flex items-center justify-between gap-2 overflow-hidden">
        {/* roterende vindrose */}
        <div className="relative h-20 w-20 shrink-0">
          <div
            className="absolute inset-0 rounded-full border border-cyan-300/20"
            style={{ background: "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.18), transparent 65%)" }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ animation: `pbthWindSpin ${spinDur}s linear infinite` }}
          >
            <svg viewBox="0 0 40 40" className="h-16 w-16 text-cyan-300">
              <g fill="currentColor" opacity="0.85">
                <path d="M20 4 L24 18 L20 16 L16 18 Z" />
                <path d="M36 20 L22 24 L24 20 L22 16 Z" />
                <path d="M20 36 L16 22 L20 24 L24 22 Z" />
                <path d="M4 20 L18 16 L16 20 L18 24 Z" />
              </g>
            </svg>
          </div>
          {windAngle != null && (
            <div
              className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] text-cyan-200/80"
              style={{ transform: `translateX(-50%) rotate(${windAngle}deg)` }}
            >
              ▲
            </div>
          )}
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[9px] uppercase tracking-widest text-white/40">Vind nå</div>
          <div className="text-xl font-semibold text-white tabular-nums leading-none">
            {windNow == null ? "—" : windNow.toFixed(1).replace(".", ",")}
            <span className="text-[10px] text-white/40 ml-1">m/s</span>
          </div>
          <div className="text-[9px] uppercase tracking-widest text-white/40 mt-1.5">Vindkast</div>
          <div className="text-base text-cyan-200 tabular-nums leading-none">
            {gustNow == null ? "—" : `${gustNow.toFixed(1).replace(".", ",")} m/s`}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-white/40 mt-1.5">Maks i dag</div>
          <div className="text-xs text-cyan-200/80 tabular-nums">
            {maxToday > 0 ? `${maxToday.toFixed(1).replace(".", ",")} m/s` : "—"}
          </div>
        </div>

      </div>
      <style>{`@keyframes pbthWindSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </Tile>
  );
}

// ----- mini-tiles -----


function MiniTile({ icon, label, value, sub, accent, detail }:
  { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string; detail?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3 h-full hover:bg-white/[0.06] hover:border-white/20 active:scale-[0.98] transition"
      >
        <div className={`h-9 w-9 rounded-full bg-white/5 flex items-center justify-center ${accent ?? "text-white/70"}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
          <div className="text-sm text-white tabular-nums truncate">{value}</div>
          {sub && <div className="text-[10px] text-white/40">{sub}</div>}
        </div>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0c0f15] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className={`h-7 w-7 rounded-full bg-white/5 flex items-center justify-center ${accent ?? "text-white/70"}`}>{icon}</span>
              {label}
            </DialogTitle>
            <DialogDescription className="text-white/50">{sub ?? "Detaljer"}</DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <div className={`text-4xl font-semibold tabular-nums ${accent ?? "text-white"}`}>{value}</div>
            <div className="text-xs text-white/40 mt-1">{sub}</div>
            {detail ? <div className="mt-4">{detail}</div> : (
              <div className="mt-4 text-xs text-white/40 italic">
                Sanntid fra sensoren. Historikk kommer her etter hvert.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SmartDashbord() {
  const [now, setNow] = useState(() => new Date());
  const [locId, setLocId] = useState<LocId>("borgen");
  const loc = LOCS[locId];

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

  // Homey snapshot (shared)
  const { devices, zones, reload } = useHomeySnapshot();
  const tollnes = useNetatmoTollnes();

  // Basseng-bryter id fra notification_settings
  const [bassengSwitchId, setBassengSwitchId] = useState<string | null>(null);
  useEffect(() => {
    let c = false;
    const load = () => {
      supabase
        .from("notification_settings")
        .select("value")
        .eq("key", "basseng_automation")
        .maybeSingle()
        .then(({ data }) => {
          if (c) return;
          const v = (data?.value ?? {}) as any;
          setBassengSwitchId(v.bassengSwitchId ?? null);
        });
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { c = true; clearInterval(id); };
  }, []);

  // Compute per-location device picks
  const zoneNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of zones) m.set(z.id, z.name);
    return m;
  }, [zones]);

  // Hue-lys på Borgen, splittet i Stue og Spisestue
  const hueByRoom = useMemo(() => {
    if (locId !== "borgen") return { stue: [] as HomeyDeviceSnapshot[], spisestue: [] as HomeyDeviceSnapshot[] };
    const stue: HomeyDeviceSnapshot[] = [];
    const spisestue: HomeyDeviceSnapshot[] = [];
    for (const d of devices) {
      if (!isHueDevice(d)) continue;
      const zn = d.zone ? zoneNameById.get(d.zone) ?? "" : "";
      if (isHyttaZoneName(zn)) continue;
      const nm = d.name.toLowerCase();
      const inSpisestue = isSpisestueZoneName(zn) || nm.includes("spisestue") || nm.includes("spisestua");
      const inStue = !inSpisestue && (isStueZoneName(zn) || nm.includes("stue") || nm.includes("stua"));
      if (inSpisestue) spisestue.push(d);
      else if (inStue) stue.push(d);
    }
    return { stue, spisestue };
  }, [devices, zoneNameById, locId]);

  const varmepumpe = useMemo(() => {
    if (locId === "hytta") {
      return (
        devices.find((d) => isQlima(d)) ??
        devices.find((d) => {
          if (!isVarmepumpeLike(d)) return false;
          const zn = d.zone ? zoneNameById.get(d.zone) ?? "" : "";
          return isHyttaZoneName(zn);
        }) ?? null
      );
    }
    // Borgen: melcloud først, ellers en hvilken som helst varmepumpe-lik enhet utenfor hytta
    return (
      devices.find((d) => {
        if (!isMelcloud(d)) return false;
        const zn = d.zone ? zoneNameById.get(d.zone) ?? "" : "";
        return !isHyttaZoneName(zn);
      }) ??
      devices.find((d) => {
        if (!isVarmepumpeLike(d)) return false;
        const zn = d.zone ? zoneNameById.get(d.zone) ?? "" : "";
        return !isHyttaZoneName(zn);
      }) ?? null
    );
  }, [devices, zoneNameById, locId]);

  const bassengSwitch = useMemo(() => {
    if (!bassengSwitchId) return null;
    return devices.find((d) => d.id === bassengSwitchId) ?? null;
  }, [devices, bassengSwitchId]);

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

  const isHytta = locId === "hytta";

  return (
    <div className="min-h-screen bg-[#0a0d13] text-white">
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
            <Link
              to="/"
              aria-label="Hjem"
              title="Hjem"
              className="h-9 w-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition"
            >
              <Home size={15} />
            </Link>
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

        {/* bento grid – alle rader 220px, alle bokser samme høyde.
            Kalender spenner 2 rader for å være "litt større". */}
        <div
          className={`grid grid-cols-12 auto-rows-[220px] ${settings.bold ? "smart-bold-all" : ""}`}
          style={gridStyle}
        >
          {isHytta ? (
            <>
              {/* Rad 1: Basseng + Varmepumpe */}
              <div className="col-span-6">
                <BassengTile loc={loc} switchDevice={bassengSwitch} onReload={reload} />
              </div>
              <div className="col-span-6">
                <VarmepumpeTile loc={loc} device={varmepumpe} onReload={reload} />
              </div>
              {/* Rad 2: UV + AQ */}
              <div className="col-span-6"><UvTile loc={loc} /></div>
              <div className="col-span-6"><AqiTile loc={loc} /></div>
              {/* Rad 3: Kalender + Leader */}
              <div className="col-span-6"><CalendarTile /></div>
              <div className="col-span-6"><LeaderTile /></div>
            </>
          ) : (
            <>
              {/* Rad 1: Basseng + Lys (Stue+Spisestue) + Strøm */}
              <div className="col-span-4">
                <BassengTile loc={loc} switchDevice={bassengSwitch} onReload={reload} />
              </div>
              <div className="col-span-4">
                <LysCombinedTile
                  groups={[
                    { label: "Stue", lights: hueByRoom.stue },
                    { label: "Spisestue", lights: hueByRoom.spisestue },
                  ]}
                  onReload={reload}
                />
              </div>
              <div className="col-span-4">
                <StromTile home="borgen" />
              </div>
              {/* Rad 2: Varmepumpe + UV + AQ + Regn + Vind (halv-størrelse) */}
              <div className="col-span-4">
                <VarmepumpeTile loc={loc} device={varmepumpe} onReload={reload} />
              </div>
              <div className="col-span-2"><UvCompact loc={loc} /></div>
              <div className="col-span-2"><AqiCompact loc={loc} /></div>
              <div className="col-span-2"><RainTile rainDay={tollnes.rainDay} rainHour={tollnes.rainHour} /></div>
              <div className="col-span-2"><WindTile windNow={tollnes.windNow} gustNow={tollnes.gustNow} windAngle={tollnes.windAngle} /></div>


              {/* Rad 3: Kalender + Leader */}
              <div className="col-span-6"><CalendarTile /></div>
              <div className="col-span-6"><LeaderTile /></div>
            </>
          )}
        </div>

        {/* mini-rad nederst */}
        <div
          className={`grid grid-cols-6 auto-rows-[80px] ${settings.bold ? "smart-bold-all" : ""}`}
          style={miniStyle}
        >
          <MiniTile icon={<Droplets size={16} />} label="Luftfukt" value="42 %" sub="Stua" accent="text-sky-300" />
          <MiniTile icon={<CloudSun size={16} />} label="Ute" value="6.2°" sub={loc.label} accent="text-amber-300" />
          <MiniTile icon={<Gauge size={16} />} label="CO₂" value="612 ppm" sub="Soverom" accent="text-emerald-300" />
          <MiniTile
            icon={<Activity size={16} />}
            label="dB"
            value={tollnes.noise != null ? `${Math.round(tollnes.noise)} dB` : "—"}
            sub="Stua"
            accent="text-orange-300"
          />
          <MiniTile
            icon={<Droplets size={16} />}
            label="Luftfukt"
            value={tollnes.humBedroom != null ? `${Math.round(tollnes.humBedroom)} %` : "—"}
            sub="Sov. Arne/Rebekka"
            accent="text-violet-300"
          />

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
