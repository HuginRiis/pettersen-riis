import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Wifi, Router as RouterIcon, Signal, Activity, History, Trophy, RefreshCw } from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { getNetworkSnapshot, type NetworkDevice } from "@/server/network.functions";

export const Route = createFileRoute("/nettverk")({
  head: () => ({
    meta: [
      { title: "Nettverk — Arne & Rebekka av Skien" },
      { name: "description", content: "Oversikt over hjemmenettverket: Deco-rutere, tilkoblede enheter, signal og historikk." },
    ],
  }),
  component: NettverkPage,
});

function NettverkPage() {
  const fn = useServerFn(getNetworkSnapshot);
  const q = useQuery({
    queryKey: ["network-snapshot"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  useEffect(() => {
    if (q.data?.generatedAt) setLastFetched(q.data.generatedAt);
  }, [q.data]);

  const data = q.data;

  return (
    <PageShell>
      <PageHero
        eyebrow="Borgens nett"
        title="Nettverk"
        subtitle="Deco XE75 (3 stk.) via Homey — tilkoblede enheter, signal, historikk og topp 10."
        image="https://images.unsplash.com/photo-1606857521015-7f9fcf423740?w=1600&q=70"
      />

      <section className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {lastFetched ? `Sist oppdatert: ${new Date(lastFetched).toLocaleString("nb-NO")}` : "Henter …"}
          </div>
          <button
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-border hover:bg-accent"
          >
            <RefreshCw size={12} className={q.isFetching ? "animate-spin" : ""} /> Oppdater
          </button>
        </div>

        {data?.error && (
          <div className="panel rounded-lg p-4 border border-destructive/40 text-sm text-destructive">
            {data.error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<RouterIcon size={16} />} label="Rutere" value={data?.routers.length ?? 0} />
          <Stat icon={<Wifi size={16} />} label="Klienter (siste sett)" value={data?.clients.length ?? 0} />
          <Stat icon={<Activity size={16} />} label="Tilkoblet nå (24t)" value={data?.totalsLast24h.connectedClients ?? 0} />
          <Stat icon={<History size={16} />} label="Snapshots 24t" value={data?.totalsLast24h.totalSamples ?? 0} />
        </div>

        {/* Routers */}
        <Card title="Deco-rutere" icon={<RouterIcon size={18} className="text-primary" />}>
          {data?.routers.length ? (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.routers.map((d) => <DeviceCard key={d.id} d={d} />)}
            </ul>
          ) : (
            <Empty text="Ingen Deco-enheter funnet i Homey. Sjekk at TP-Link Deco-appen er installert i Homey og at XE75-enhetene er parret." />
          )}
        </Card>

        {/* Clients */}
        <Card title="Tilkoblede enheter" icon={<Wifi size={18} className="text-primary" />}>
          {data?.clients.length ? (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.clients.map((d) => <DeviceCard key={d.id} d={d} />)}
            </ul>
          ) : (
            <Empty text="Homey-appen for Deco eksponerer ikke per-klient-info enda. Vi viser ruter-status og logger over tid — for full klientliste trengs en lokal Deco-bro (f.eks. en Node-tjeneste på hjemmenettet)." />
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

function DeviceCard({ d }: { d: NetworkDevice }) {
  const dot = d.available ? "bg-emerald-500" : "bg-muted";
  return (
    <li className="panel rounded p-3 border border-border/50">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
          <span className="text-foreground truncate">{d.name}</span>
        </span>
        {d.signal != null && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Signal size={12} />{Math.round(d.signal)}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {d.zone ? `Sal: ${d.zone.slice(0, 6)}… · ` : ""}
        {d.watt != null ? `${Math.round(d.watt)} W · ` : ""}
        {d.available ? "tilkoblet" : "frakoblet"}
      </div>
    </li>
  );
}
