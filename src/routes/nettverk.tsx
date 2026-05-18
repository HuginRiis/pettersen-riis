import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wifi,
  Router as RouterIcon,
  Signal,
  Activity,
  History,
  Trophy,
  RefreshCw,
  Download,
  Upload,
  Cpu,
  MemoryStick,
  Users,
  Globe,
  Crown,
  Cable,
  Boxes,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import {
  getNetworkSnapshot,
  getRouterInsights,
  type NetworkDevice,
  type NetworkSnapshotResult,
  type SpeedPoint,
  type MetricPoint,
  type InsightResult,
} from "@/server/network.functions";
import { NetworkTopology } from "@/components/NetworkTopology";
import nettverkHero from "@/assets/nettverk-hero.jpg";

export const Route = createFileRoute("/nettverk")({
  head: () => ({
    meta: [
      { title: "Nettverk — Arne & Rebekka av Skien" },
      { name: "description", content: "Live oversikt over hjemmenettverket: Deco-rutere, klienter, hastigheter, signal og historikk." },
    ],
  }),
  component: NettverkPage,
});

function NettverkPage() {
  const fn = useServerFn(getNetworkSnapshot);
  const [data, setData] = useState<NetworkSnapshotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fn();
      setData(r);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Klarte ikke hente nettverksdata");
    } finally {
      setLoading(false);
    }
  }, [fn]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Borgens nett"
        title="Nettverk"
        subtitle="Deco XE75 (3 stk.) via Homey — live hastighet, klienter, signal og historikk."
        image={nettverkHero}
      />

      <section className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {data?.generatedAt ? `Sist oppdatert: ${new Date(data.generatedAt).toLocaleString("nb-NO")}` : "Henter …"}
          </div>
          <button
            onClick={() => load()}
            className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-border hover:bg-accent"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Oppdater
          </button>
        </div>

        {(error || data?.error) && (
          <div className="panel rounded-lg p-4 border border-destructive/40 text-sm text-destructive">
            {error ?? data?.error}
          </div>
        )}

        {/* MAIN ROUTER / WAN with tabs over all Decos */}
        {data?.routers.length ? (
          <MainRouterCard
            routers={data.routers}
            mainId={data.mainRouter?.id ?? data.routers[0].id}
            history={data.routerHistory ?? {}}
            totals={data.totalsLast24h}
          />
        ) : null}

        {/* Topology */}
        <Card title="Nettverkskart" icon={<Activity size={18} className="text-primary" />}>
          <NetworkTopology routers={data?.routers ?? []} clients={data?.clients ?? []} />
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<RouterIcon size={16} />} label="Rutere" value={data?.routers.length ?? 0} />
          <Stat icon={<Wifi size={16} />} label="Klienter" value={data?.clients.length ?? 0} />
          <Stat icon={<Boxes size={16} />} label="Enheter totalt" value={data?.allDevices.length ?? 0} />
          <Stat icon={<Activity size={16} />} label="Aktive (24t)" value={data?.totalsLast24h.connectedClients ?? 0} />
        </div>

        {/* Routers */}
        <Card title="Deco-rutere" icon={<RouterIcon size={18} className="text-primary" />}>
          {data?.routers.length ? (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.routers.map((d) => (
                <DeviceCard key={d.id} d={d} detailed />
              ))}
            </ul>
          ) : (
            <Empty text="Ingen Deco-enheter funnet i Homey." />
          )}
        </Card>

        {/* Clients */}
        <Card title="Tilkoblede enheter" icon={<Wifi size={18} className="text-primary" />}>
          {data?.clients.length ? (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.clients.map((d) => <DeviceCard key={d.id} d={d} detailed />)}
            </ul>
          ) : (
            <Empty text="Homey eksponerer ikke per-klient-info fra Deco — vi viser klienter rapportert som egne nettverksenheter." />
          )}
        </Card>

        {/* Alle Homey-enheter */}
        <Card title={`Alle Homey-enheter (${data?.allDevices.length ?? 0})`} icon={<Boxes size={18} className="text-primary" />}>
          {data?.allDevices.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Vis full liste</summary>
              <ul className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.allDevices
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((d) => (
                    <li key={d.id} className="panel rounded p-2 border border-border/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-foreground text-xs">{d.name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{d.kind}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{d.class ?? "—"}</div>
                    </li>
                  ))}
              </ul>
            </details>
          ) : (
            <Empty text="Ingen enheter." />
          )}
        </Card>

        {/* Top 10 */}
        <Card title="Topp 10 mest sette enheter (siste 24t)" icon={<Trophy size={18} className="text-primary" />}>
          {data?.topMostSeen.length ? (
            <ol className="space-y-1">
              {data.topMostSeen.map((t, i) => (
                <li key={t.device_id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground w-6 text-right">{i + 1}.</span>
                    <span className="text-foreground">{t.device_name ?? t.device_id}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{t.samples} obs</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty text="Bygger opp historikk — kom tilbake om en stund." />
          )}
        </Card>

        {/* Events */}
        <Card title="Tilkoblet / frakoblet (siste hendelser)" icon={<History size={18} className="text-primary" />}>
          {data?.recentEvents.length ? (
            <ul className="space-y-1">
              {data.recentEvents.map((e, i) => (
                <li key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                  <span className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${e.event === "connect" ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span className="text-foreground">{e.device_name ?? e.device_id}</span>
                    <span className="text-xs text-muted-foreground">{e.event === "connect" ? "koblet til" : "koblet fra"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{new Date(e.ts).toLocaleString("nb-NO")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Ingen hendelser registrert enda." />
          )}
        </Card>

        {/* Homey insights */}
        {data?.routers.length ? <HomeyInsightsCard routers={data.routers} /> : null}
      </section>
    </PageShell>
  );
}

type MetricKey = "download" | "upload" | "cpu" | "memory" | "clients";

const METRICS: { key: MetricKey; label: string; icon: React.ReactNode; color: string; unit: "kbs" | "pct" | "n" }[] = [
  { key: "download", label: "Nedlasting", icon: <Download size={12} />, color: "#38bdf8", unit: "kbs" },
  { key: "upload", label: "Opplasting", icon: <Upload size={12} />, color: "#34d399", unit: "kbs" },
  { key: "cpu", label: "CPU", icon: <Cpu size={12} />, color: "#f472b6", unit: "pct" },
  { key: "memory", label: "Minne", icon: <MemoryStick size={12} />, color: "#a78bfa", unit: "pct" },
  { key: "clients", label: "Klienter", icon: <Users size={12} />, color: "#facc15", unit: "n" },
];

function MainRouterCard({
  routers,
  mainId,
  history,
  totals,
}: {
  routers: NetworkDevice[];
  mainId: string;
  history: Record<string, MetricPoint[]>;
  totals: NetworkSnapshotResult["totalsLast24h"];
}) {
  const [selectedId, setSelectedId] = useState<string>(mainId);
  const [metric, setMetric] = useState<MetricKey>("download");
  useEffect(() => { setSelectedId(mainId); }, [mainId]);

  const selected = routers.find((r) => r.id === selectedId) ?? routers[0];
  const isMain = selected.id === mainId;
  const pts = history[selected.id] ?? [];
  const wanHref = selected.ipAddress ? `http://${selected.ipAddress}` : "https://www.tp-link.com/deco/";

  return (
    <article className="panel rounded-xl p-5 border border-primary/30 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
      {/* Router tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-1 px-1">
        {routers.map((r) => {
          const main = r.id === mainId;
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition ${
                active
                  ? "bg-primary/20 border-primary/50 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {main && <Crown size={11} className="text-amber-400" />}
              {r.name}
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${r.available ? "bg-emerald-500" : "bg-muted"}`} />
            </button>
          );
        })}
      </div>

      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {isMain && <Crown size={18} className="text-amber-400" />}
          <h2 className="text-foreground font-semibold">
            {isMain ? "Hoved-ruter (WAN) — " : "Deco — "}{selected.name}
          </h2>
        </div>
        <a
          href={wanHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:bg-accent text-muted-foreground"
        >
          <Globe size={12} /> Åpne mainstream
        </a>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Metric icon={<Download size={14} />} label="Nedlasting" value={fmtKbs(selected.downloadKbs)} accent="text-sky-300" />
        <Metric icon={<Upload size={14} />} label="Opplasting" value={fmtKbs(selected.uploadKbs)} accent="text-emerald-300" />
        <Metric icon={<Cpu size={14} />} label="CPU" value={fmtPct(selected.cpu)} />
        <Metric icon={<MemoryStick size={14} />} label="Minne" value={fmtPct(selected.memory)} />
        <Metric icon={<Users size={14} />} label="Klienter" value={selected.clients != null ? `${selected.clients} stk` : "—"} />
        <Metric icon={<Globe size={14} />} label="IP" value={selected.ipAddress ?? "—"} small />
        <Metric icon={<Signal size={14} />} label="Signal" value={selected.signalQuality ?? (selected.signal != null ? `${Math.round(selected.signal)} dBm` : "—")} />
        <Metric icon={<Activity size={14} />} label="Snitt 24t ↓" value={fmtKbs(totals.downloadKbsAvg)} />
      </div>

      {/* Metric tabs */}
      <div className="flex gap-1.5 mb-2 flex-wrap">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border transition ${
              metric === m.key
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
            style={metric === m.key ? { color: m.color } : undefined}
          >
            {m.icon}{m.label}
          </button>
        ))}
      </div>

      <MetricSparkline points={pts} metric={metric} />
    </article>
  );
}

function fmtMetric(v: number | null, unit: "kbs" | "pct" | "n"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "kbs") return fmtKbs(v);
  if (unit === "pct") return fmtPct(v);
  return String(Math.round(v));
}

function MetricSparkline({ points, metric }: { points: MetricPoint[]; metric: MetricKey }) {
  const meta = METRICS.find((m) => m.key === metric)!;
  const { path, max, last } = useMemo(() => {
    if (!points.length) return { path: "", max: 0, last: null as number | null };
    const vals = points.map((p) => (p[metric] ?? 0));
    const m = Math.max(1, ...vals);
    const w = 600, h = 80;
    const step = points.length > 1 ? w / (points.length - 1) : 0;
    const path = vals
      .map((v, i) => {
        const x = i * step;
        const y = h - (v / m) * (h - 6) - 3;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    const lastValRaw = points[points.length - 1]?.[metric];
    return { path, max: m, last: typeof lastValRaw === "number" ? lastValRaw : null };
  }, [points, metric]);

  if (!points.length) {
    return <p className="text-xs text-muted-foreground">Bygger opp historikk for {meta.label.toLowerCase()} …</p>;
  }
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
        <span>{meta.label} (siste {points.length} målinger)</span>
        <span>Nå: <span className="text-foreground font-semibold">{fmtMetric(last, meta.unit)}</span> · topp {fmtMetric(max, meta.unit)}</span>
      </div>
      <svg viewBox="0 0 600 80" className="w-full h-20" role="img" aria-label={`${meta.label}-graf`}>
        <path d={path} fill="none" stroke={meta.color} strokeWidth="1.8" />
      </svg>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="panel rounded p-2.5 border border-border/40">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${accent ?? "text-foreground"} ${small ? "text-sm" : "text-lg"}`}>{value}</div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="panel rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="panel rounded-lg p-4">
      <h2 className="text-foreground font-semibold flex items-center gap-2 mb-3">{icon}{title}</h2>
      {children}
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function DeviceCard({ d, detailed }: { d: NetworkDevice; detailed?: boolean }) {
  const dot = d.available ? "bg-emerald-500" : "bg-muted";
  return (
    <li className="panel rounded p-3 border border-border/50 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
          <span className="text-foreground truncate font-medium">{d.name}</span>
          {d.master && <Crown size={11} className="text-amber-400 shrink-0" />}
          {d.wired && <Cable size={11} className="text-yellow-400 shrink-0" />}
        </span>
        {d.signalQuality ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{d.signalQuality}</span>
        ) : d.signal != null ? (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Signal size={12} />{Math.round(d.signal)}
          </span>
        ) : null}
      </div>
      {detailed && (
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {d.downloadKbs != null && <Mini icon={<Download size={10} />} label="ned" value={fmtKbs(d.downloadKbs)} />}
          {d.uploadKbs != null && <Mini icon={<Upload size={10} />} label="opp" value={fmtKbs(d.uploadKbs)} />}
          {d.cpu != null && <Mini icon={<Cpu size={10} />} label="cpu" value={fmtPct(d.cpu)} />}
          {d.memory != null && <Mini icon={<MemoryStick size={10} />} label="mem" value={fmtPct(d.memory)} />}
          {d.clients != null && <Mini icon={<Users size={10} />} label="klienter" value={String(d.clients)} />}
          {d.ipAddress && <Mini icon={<Globe size={10} />} label="ip" value={d.ipAddress} />}
          {d.deviceRole && <Mini icon={<Crown size={10} />} label="rolle" value={d.deviceRole} />}
          {d.wanConnected != null && <Mini icon={<Globe size={10} />} label="wan" value={d.wanConnected ? "ja" : "nei"} />}
          {d.meshConnected != null && <Mini icon={<Wifi size={10} />} label="mesh" value={d.meshConnected ? "ja" : "nei"} />}
          {d.signal24 && <Mini icon={<Signal size={10} />} label="2.4 GHz" value={d.signal24} />}
          {d.signal5 && <Mini icon={<Signal size={10} />} label="5 GHz" value={d.signal5} />}
          {d.wifiBand && <Mini icon={<Wifi size={10} />} label="bånd" value={d.wifiBand} />}
          {d.uptime != null && <Mini icon={<Activity size={10} />} label="oppe" value={fmtUptime(d.uptime)} />}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">
        {d.watt != null ? `${Math.round(d.watt)} W · ` : ""}
        {d.available ? "tilkoblet" : "frakoblet"}
        {d.class ? ` · ${d.class}` : ""}
      </div>
    </li>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      {icon}
      <span className="text-foreground tabular-nums">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

function fmtKbs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1024) return `${(v / 1024).toFixed(1)} MB/s`;
  return `${Math.round(v)} KB/s`;
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)} %`;
}
function fmtUptime(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  if (d > 0) return `${d}d ${h}t`;
  const m = Math.floor((s % 3600) / 60);
  return `${h}t ${m}m`;
}

const INSIGHT_CAPS: { key: MetricKey; capability: string; label: string; color: string; unit: "kbs" | "pct" | "n" }[] = [
  { key: "download", capability: "meter_download_speed", label: "Nedlasting", color: "#38bdf8", unit: "kbs" },
  { key: "upload", capability: "meter_upload_speed", label: "Opplasting", color: "#34d399", unit: "kbs" },
  { key: "cpu", capability: "measure_cpu_usage", label: "CPU", color: "#f472b6", unit: "pct" },
  { key: "memory", capability: "measure_memory_usage", label: "Minne", color: "#a78bfa", unit: "pct" },
  { key: "clients", capability: "meter_connected_clients", label: "Klienter", color: "#facc15", unit: "n" },
];

const RESOLUTIONS = [
  { key: "lastHour", label: "1t" },
  { key: "last6Hours", label: "6t" },
  { key: "last24Hours", label: "24t" },
  { key: "last7Days", label: "7d" },
  { key: "last31Days", label: "31d" },
] as const;

function HomeyInsightsCard({ routers }: { routers: NetworkDevice[] }) {
  const fn = useServerFn(getRouterInsights);
  const [routerId, setRouterId] = useState(routers[0]?.id ?? "");
  const [cap, setCap] = useState<MetricKey>("download");
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]["key"]>("last24Hours");
  const [data, setData] = useState<InsightResult | null>(null);
  const [loading, setLoading] = useState(false);

  const capMeta = INSIGHT_CAPS.find((c) => c.key === cap)!;

  useEffect(() => {
    if (!routerId) return;
    let cancelled = false;
    setLoading(true);
    fn({ data: { deviceId: routerId, capabilityId: capMeta.capability, resolution } })
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setData({ ok: false, error: e?.message ?? "Feil", deviceId: routerId, capabilityId: capMeta.capability, resolution, units: null, points: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fn, routerId, capMeta.capability, resolution]);

  const { path, max, min, last } = useMemo(() => {
    const pts = (data?.points ?? []).filter((p) => typeof p.v === "number") as { t: string; v: number }[];
    if (!pts.length) return { path: "", max: 0, min: 0, last: null as number | null };
    const vals = pts.map((p) => p.v);
    const mx = Math.max(...vals);
    const mn = Math.min(...vals);
    const range = Math.max(1, mx - mn);
    const w = 600, h = 120;
    const step = pts.length > 1 ? w / (pts.length - 1) : 0;
    const path = vals
      .map((v, i) => {
        const x = i * step;
        const y = h - ((v - mn) / range) * (h - 8) - 4;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return { path, max: mx, min: mn, last: vals[vals.length - 1] };
  }, [data]);

  return (
    <Card title="Homey-innsikter (live fra Homey)" icon={<Activity size={18} className="text-primary" />}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {routers.map((r) => (
            <button
              key={r.id}
              onClick={() => setRouterId(r.id)}
              className={`text-xs px-3 py-1.5 rounded-md border ${
                routerId === r.id ? "bg-primary/20 border-primary/50 text-foreground" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {INSIGHT_CAPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setCap(c.key)}
              className={`text-[11px] px-2.5 py-1 rounded border ${
                cap === c.key ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent"
              }`}
              style={cap === c.key ? { color: c.color } : undefined}
            >
              {c.label}
            </button>
          ))}
          <div className="ml-auto flex gap-1">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setResolution(r.key)}
                className={`text-[11px] px-2 py-1 rounded border ${
                  resolution === r.key ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <p className="text-xs text-muted-foreground">Henter fra Homey …</p>
        ) : data?.error ? (
          <p className="text-xs text-destructive">Homey: {data.error}</p>
        ) : !data?.points.length ? (
          <p className="text-xs text-muted-foreground">Homey har ikke logget {capMeta.label.toLowerCase()} for denne ruteren ennå — kommer etter hvert som det samles inn.</p>
        ) : (
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>{capMeta.label} · {data.points.length} punkter ({data.resolution})</span>
              <span>
                Nå: <span className="text-foreground font-semibold">{fmtMetric(last, capMeta.unit)}</span>
                {" · min "}{fmtMetric(min, capMeta.unit)}
                {" · maks "}{fmtMetric(max, capMeta.unit)}
              </span>
            </div>
            <svg viewBox="0 0 600 120" className="w-full h-32" role="img" aria-label={`${capMeta.label} fra Homey`}>
              <path d={path} fill="none" stroke={capMeta.color} strokeWidth="1.8" />
            </svg>
          </div>
        )}
      </div>
    </Card>
  );
}
