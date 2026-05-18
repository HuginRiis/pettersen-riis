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
  type NetworkDevice,
  type NetworkSnapshotResult,
  type SpeedPoint,
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

        {/* MAIN ROUTER / WAN */}
        {data?.mainRouter && (
          <MainRouterCard main={data.mainRouter} history={data.speedHistory} totals={data.totalsLast24h} />
        )}

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
              {data.clients.map((d) => <DeviceCard key={d.id} d={d} />)}
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
      </section>
    </PageShell>
  );
}

function MainRouterCard({
  main,
  history,
  totals,
}: {
  main: NetworkDevice;
  history: SpeedPoint[];
  totals: NetworkSnapshotResult["totalsLast24h"];
}) {
  const wanHref = main.ipAddress ? `http://${main.ipAddress}` : "https://www.tp-link.com/deco/";
  return (
    <article className="panel rounded-xl p-5 border border-primary/30 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Crown size={18} className="text-amber-400" />
          <h2 className="text-foreground font-semibold">Hoved-ruter (WAN) — {main.name}</h2>
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
        <Metric icon={<Download size={14} />} label="Nedlasting" value={fmtKbs(main.downloadKbs)} accent="text-sky-300" />
        <Metric icon={<Upload size={14} />} label="Opplasting" value={fmtKbs(main.uploadKbs)} accent="text-emerald-300" />
        <Metric icon={<Cpu size={14} />} label="CPU" value={fmtPct(main.cpu)} />
        <Metric icon={<MemoryStick size={14} />} label="Minne" value={fmtPct(main.memory)} />
        <Metric icon={<Users size={14} />} label="Klienter" value={main.clients != null ? `${main.clients} stk` : "—"} />
        <Metric icon={<Globe size={14} />} label="IP" value={main.ipAddress ?? "—"} small />
        <Metric icon={<Signal size={14} />} label="Signal" value={main.signalQuality ?? (main.signal != null ? `${Math.round(main.signal)} dBm` : "—")} />
        <Metric icon={<Activity size={14} />} label="Snitt 24t ↓" value={fmtKbs(totals.downloadKbsAvg)} />
      </div>

      <SpeedSparkline points={history} />
    </article>
  );
}

function SpeedSparkline({ points }: { points: SpeedPoint[] }) {
  const { dPath, uPath, maxV } = useMemo(() => {
    if (!points.length) return { dPath: "", uPath: "", maxV: 0 };
    const dl = points.map((p) => p.download ?? 0);
    const ul = points.map((p) => p.upload ?? 0);
    const max = Math.max(1, ...dl, ...ul);
    const w = 600;
    const h = 80;
    const stepX = points.length > 1 ? w / (points.length - 1) : 0;
    const toPath = (arr: number[]) =>
      arr
        .map((v, i) => {
          const x = i * stepX;
          const y = h - (v / max) * (h - 6) - 3;
          return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
    return { dPath: toPath(dl), uPath: toPath(ul), maxV: max };
  }, [points]);

  if (!points.length) {
    return <p className="text-xs text-muted-foreground">Bygger opp hastighetshistorikk …</p>;
  }
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
        <span>Hastighet (siste {points.length} målinger)</span>
        <span>Topp: {fmtKbs(maxV)}</span>
      </div>
      <svg viewBox="0 0 600 80" className="w-full h-20" role="img" aria-label="Hastighetsgraf">
        <path d={dPath} fill="none" stroke="#38bdf8" strokeWidth="1.8" />
        <path d={uPath} fill="none" stroke="#34d399" strokeWidth="1.8" />
      </svg>
      <div className="flex gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" /> ned</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> opp</span>
      </div>
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
