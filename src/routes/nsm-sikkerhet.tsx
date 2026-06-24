import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { ShieldAlert, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getLatestNsmAlerts, triggerNsmPoll, type NsmAlert } from "@/lib/nsm-alerts.functions";
import heroImg from "@/assets/nsm-hero.jpg";

export const Route = createFileRoute("/nsm-sikkerhet")({
  head: () => ({
    meta: [
      { title: "NSM Sikkerhet | House Pettersen Riis" },
      { name: "description", content: "Siste cybersikkerhetsvarsler fra Nasjonal sikkerhetsmyndighet (NSM) — sårbarheter, patcher og kritiske hendelser." },
      { property: "og:title", content: "NSM Sikkerhet — Cyberhendelser" },
      { property: "og:description", content: "Topp 10 nyeste varsler fra NSM. Oppdateres 5 ganger om dagen, med push-abonnement." },
    ],
  }),
  component: NsmSikkerhetPage,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
}

function NsmSikkerhetPage() {
  const [alerts, setAlerts] = useState<NsmAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetchAlerts = useServerFn(getLatestNsmAlerts);
  const pollFn = useServerFn(triggerNsmPoll);

  const load = async () => {
    try {
      const data = await fetchAlerts();
      setAlerts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukjent feil");
    }
  };

  useEffect(() => { void load(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await pollFn({ data: undefined } as never);
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Borgens cyber-vakt"
        title="NSM Sikkerhet"
        subtitle="Nasjonal sikkerhetsmyndighets cybervarsler — sårbarheter, kritiske patcher og pågående hendelser."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-blue-400" />
            Siste 10 varsler fra NSM
          </h2>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border/60 text-xs hover:border-primary/60 hover:text-primary transition disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Oppdater nå
          </button>
        </div>

        {error && <div className="text-sm text-destructive mb-3">{error}</div>}
        {alerts === null && !error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laster…</div>
        )}
        {alerts && alerts.length === 0 && (
          <div className="text-sm text-muted-foreground italic">Ingen varsler ennå. Klikk «Oppdater nå» for å hente fra NSM.</div>
        )}

        <ul className="space-y-3">
          {alerts?.map((a) => (
            <li key={a.id} className="panel rounded-lg p-4 hover:border-primary/40 transition">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <ShieldAlert className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {formatDate(a.published_at)}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold leading-tight mb-1">{a.title}</h3>
                  {a.summary && (
                    <p className="text-sm text-muted-foreground leading-snug mb-2">{a.summary}</p>
                  )}
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Les hele varselet på nsm.no <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 text-xs text-muted-foreground">
          Kilde: <a href="https://nsm.no/fagomrader/digital-sikkerhet/nasjonalt-cybersikkerhetssenter/varsler-fra-nsm/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">nsm.no — Varsler fra NSM</a>.
          Henter automatisk 5 ganger i døgnet. Abonner på push-varsler under <a href="/push-varslinger#sec-nsm" className="underline hover:text-primary">Innstillinger → NSM Sikkerhet</a>.
        </div>
      </section>
    </PageShell>
  );
}
