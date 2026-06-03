import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Wind, Sun, Lightbulb, Thermometer, Waves,
  Droplets, Gauge, CloudSun, Activity, Power, Settings2,
  TrendingUp, TrendingDown, Minus, Cloud, CloudOff, Plus, Trophy, Home,
  CalendarDays, Trash2, Mail, Cake, Bell, Zap,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer,
} from "recharts";
import { useUvSun } from "@/hooks/use-uv-sun";
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
import { supabase } from "@/integrations/supabase/client";
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

      <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.06] mb-3">
        <div className="bg-gradient-to-r from-sky-400 to-cyan-300" style={{ width: `${aPct}%` }} />
        <div className="bg-gradient-to-r from-pink-400 to-rose-300 ml-auto" style={{ width: `${rPct}%` }} />
      </div>

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
    return { big: `${day}. ${mon}`, small: wd };
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
                    <div className="text-[8px] uppercase tracking-widest text-white/70">
                      {fd.small || (e.kind === "garbage" ? "Tømming" : e.kind === "mail" ? "Post" : "Hendelse")}
                    </div>
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
  const found = data?.ok ? (home === "borgen" ? data.borgen?.found : data.hytta?.found) : false;

  const fmtKr = (v?: number) => v == null ? "—" : `${v.toFixed(0)} kr`;
  const fmtKwh = (v?: number) => v == null ? "—" : `${v.toFixed(1)} kWh`;
  const fmtW = (v?: number) => v == null ? "—" : (v >= 1000 ? `${(v/1000).toFixed(2)} kW` : `${Math.round(v)} W`);

  return (
    <Tile title="Strøm · Forbruk" icon={<Zap size={14} />} accent="text-amber-300">
      {!found ? (
        <div className="text-xs text-white/40 h-full flex items-center justify-center text-center">
          {data?.ok ? "Fant ingen Power-by-the-Hour-enhet" : "Henter…"}
        </div>
      ) : (
        <div className="flex flex-col h-full gap-2">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">Nå</div>
              <div className="text-3xl font-semibold text-white tabular-nums leading-none">
                {fmtW(h?.consumptionNow)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-white/40">Pris</div>
              <div className="text-sm text-amber-200 tabular-nums">
                {h?.priceNow != null ? `${h.priceNow.toFixed(2)} kr/kWh` : "—"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 flex-1">
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2">
              <div className="text-[9px] uppercase tracking-widest text-white/40">I dag</div>
              <div className="text-sm text-white tabular-nums">{fmtKwh(h?.energyToday)}</div>
              <div className="text-[10px] text-amber-200/80 tabular-nums">{fmtKr(h?.costToday)}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2">
              <div className="text-[9px] uppercase tracking-widest text-white/40">I går</div>
              <div className="text-sm text-white tabular-nums">{fmtKwh(h?.energyYesterday)}</div>
              <div className="text-[10px] text-amber-200/80 tabular-nums">{fmtKr(h?.costYesterday)}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2">
              <div className="text-[9px] uppercase tracking-widest text-white/40">Denne mnd</div>
              <div className="text-sm text-white tabular-nums">{fmtKwh(h?.energyThisMonth)}</div>
              <div className="text-[10px] text-amber-200/80 tabular-nums">{fmtKr(h?.costThisMonth)}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-2">
              <div className="text-[9px] uppercase tracking-widest text-white/40">I år</div>
              <div className="text-sm text-white tabular-nums">{fmtKwh(h?.energyThisYear)}</div>
              <div className="text-[10px] text-amber-200/80 tabular-nums">{fmtKr(h?.costThisYear)}</div>
            </div>
          </div>
        </div>
      )}
    </Tile>
  );
}

// ----- mini-tiles -----

function MiniTile({ icon, label, value, sub, accent }:
  { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3 h-full">
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
              {/* Rad 1: Basseng + Lys Stue + Lys Spisestue */}
              <div className="col-span-4">
                <BassengTile loc={loc} switchDevice={bassengSwitch} onReload={reload} />
              </div>
              <div className="col-span-4">
                <LysTile loc={loc} hueLights={hueByRoom.stue} onReload={reload} zoneLabel="Stue" />
              </div>
              <div className="col-span-4">
                <LysTile loc={loc} hueLights={hueByRoom.spisestue} onReload={reload} zoneLabel="Spisestue" />
              </div>
              {/* Rad 2: Varmepumpe + UV + AQ */}
              <div className="col-span-4">
                <VarmepumpeTile loc={loc} device={varmepumpe} onReload={reload} />
              </div>
              <div className="col-span-4"><UvTile loc={loc} /></div>
              <div className="col-span-4"><AqiTile loc={loc} /></div>
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
