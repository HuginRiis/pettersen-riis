import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { AlertsMap } from "@/components/AlertsMap";
import { getTelemarkAlerts, type TelemarkAlert } from "@/server/met-alerts";
import heroImg from "@/assets/hero-westeros.jpg";

export const Route = createFileRoute("/varsler")({
  head: () => ({
    meta: [
      { title: "Farevarsler | House Pettersen Riis" },
      {
        name: "description",
        content:
          "Aktive farevarsler fra Met.no for Sør- og Østlandet — kart og full oversikt.",
      },
      { property: "og:title", content: "Farevarsler — Sør- og Østlandet" },
      {
        property: "og:description",
        content: "Live farevarsler med kart for Oslo, Telemark, Agder og resten av sør/øst.",
      },
    ],
  }),
  component: VarslerPage,
});

function VarslerPage() {
  const [alerts, setAlerts] = useState<TelemarkAlert[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await getTelemarkAlerts();
        if (cancelled) return;
        setAlerts(r.alerts ?? []);
        setFetchedAt(r.fetchedAt ?? Date.now());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ukjent feil");
      }
    }
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const counts = countBySeverity(alerts ?? []);
  const updatedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <PageShell>
      <PageHero
        eyebrow="Ferdsel · Met.no"
        title="Farevarsler"
        subtitle="Aktive farevarsler for Sør- og Østlandet — fra Oslo i nord til Lindesnes i sør."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-10">
        <div className="ornate-divider mb-6">
          <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
            Ravnenes meldinger
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mb-6">
          <SeverityCard label="Røde" count={counts.red} color="Red" />
          <SeverityCard label="Oransje" count={counts.orange} color="Orange" />
          <SeverityCard label="Gule" count={counts.yellow} color="Yellow" />
        </div>

        {updatedLabel && (
          <p className="text-xs text-muted-foreground mb-4 italic">
            Ravnene landet sist kl. {updatedLabel} · oppdateres hvert 15. min
          </p>
        )}

        <div className="panel rounded-lg overflow-hidden mb-8">
          <div className="h-[55vh] min-h-[380px] w-full">
            {alerts && alerts.length > 0 ? (
              <AlertsMap alerts={alerts} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                {alerts === null
                  ? "Henter varsler …"
                  : "Ingen aktive varsler — riket er fredelig."}
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive mb-4">
            Kunne ikke hente varsler: {error}
          </p>
        )}

        <div className="space-y-4">
          {(alerts ?? []).map((a) => (
            <AlertCard key={a.id} a={a} />
          ))}
          {alerts && alerts.length === 0 && !error && (
            <p className="text-sm text-muted-foreground italic">
              Ingen aktive farevarsler i Sør- og Østlandet akkurat nå.
            </p>
          )}
        </div>
      </section>
    </PageShell>
  );
}

function countBySeverity(alerts: TelemarkAlert[]) {
  let red = 0,
    orange = 0,
    yellow = 0;
  for (const a of alerts) {
    if (a.riskMatrixColor === "Red") red++;
    else if (a.riskMatrixColor === "Orange") orange++;
    else if (a.riskMatrixColor === "Yellow") yellow++;
  }
  return { red, orange, yellow };
}

function SeverityCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "Red" | "Orange" | "Yellow";
}) {
  const cls =
    color === "Red"
      ? "border-destructive/60 text-destructive bg-destructive/10"
      : color === "Orange"
        ? "border-orange-500/60 text-orange-400 bg-orange-500/10"
        : "border-yellow-500/50 text-yellow-300 bg-yellow-500/10";
  return (
    <div className={`rounded-md border p-4 flex items-baseline justify-between ${cls}`}>
      <span className="text-[11px] uppercase tracking-[0.25em]">{label} varsler</span>
      <span className="text-2xl font-semibold">{count}</span>
    </div>
  );
}

function AlertCard({ a }: { a: TelemarkAlert }) {
  const color = a.riskMatrixColor;
  const cls =
    color === "Red"
      ? "border-destructive/60"
      : color === "Orange"
        ? "border-orange-500/60"
        : color === "Yellow"
          ? "border-yellow-500/50"
          : "border-border";
  const dot =
    color === "Red"
      ? "bg-destructive"
      : color === "Orange"
        ? "bg-orange-500"
        : color === "Yellow"
          ? "bg-yellow-400"
          : "bg-muted";

  const period = formatPeriod(a.start, a.end);

  return (
    <article className={`panel rounded-md border ${cls} p-4`}>
      <header className="flex items-start gap-3 flex-wrap">
        <span className={`mt-1.5 inline-block w-3 h-3 rounded-full ${dot}`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-base md:text-lg text-primary leading-snug">
            {a.eventAwarenessName ?? a.event}
          </h3>
          {a.area && (
            <p className="text-xs text-muted-foreground mt-0.5">{a.area}</p>
          )}
        </div>
        {period && (
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {period}
          </span>
        )}
      </header>

      {a.description && (
        <p className="text-sm text-foreground/90 mt-3 leading-relaxed">
          {a.description}
        </p>
      )}
      {a.consequences && (
        <p className="text-xs text-muted-foreground mt-2">
          <span className="text-primary/80 uppercase tracking-wider mr-1">
            Konsekvenser:
          </span>
          {a.consequences}
        </p>
      )}
      {a.instruction && (
        <p className="text-xs text-muted-foreground mt-1">
          <span className="text-primary/80 uppercase tracking-wider mr-1">
            Råd:
          </span>
          {a.instruction}
        </p>
      )}
    </article>
  );
}

function formatPeriod(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (s: string | null) => {
    if (!s) return "?";
    try {
      const d = new Date(s);
      return d.toLocaleString("nb-NO", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return s;
    }
  };
  return `${fmt(start)} – ${fmt(end)}`;
}
