import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { TollnesCameraStrip } from "@/components/TollnesCameraStrip";
import { LightningMap } from "@/components/LightningMap";
import { getHomeySnapshot } from "@/server/homey";
import { getLightningNearTollnes, type LightningResult } from "@/server/lightning";

export const Route = createFileRoute("/steintavle")({
  head: () => ({
    meta: [
      { title: "Steintavle | House Riis-Pettersen" },
      {
        name: "description",
        content:
          "Steintavlen — borgens raske blikk på temperatur, kamera og lyn over Tollnes.",
      },
      { property: "og:title", content: "Steintavle — House Riis-Pettersen" },
      {
        property: "og:description",
        content: "Temperatur, live kamera og lynaktivitet over Tollnes.",
      },
    ],
  }),
  loader: () => getHomeySnapshot(),
  component: SteintavlePage,
  errorComponent: ({ error }) => (
    <PageShell>
      <section className="container mx-auto px-4 py-16">
        <div className="panel rounded-lg p-8 text-center">
          <h1 className="heading-hero text-3xl mb-4">Steintavlen er stum</h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
      </section>
    </PageShell>
  ),
});

const norm = (s: string) =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

function SteintavlePage() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getHomeySnapshot>>;
  const fetchLightning = useServerFn(getLightningNearTollnes);
  const [lightning, setLightning] = useState<LightningResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchLightning();
        if (!cancelled) setLightning(res);
      } catch (e: any) {
        if (!cancelled)
          setLightning({ ok: false, error: e?.message ?? "Ukjent feil" });
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchLightning]);

  if (!data.ok) {
    return (
      <PageShell>
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="heading-hero text-4xl mb-4">Steintavlen sover</h1>
          <p className="text-muted-foreground">
            Borgens smarthus er ikke bundet enda. Gå til{" "}
            <a href="/smarthus" className="text-primary underline">
              Smarthus
            </a>{" "}
            for å binde ravnene til Homey.
          </p>
        </section>
      </PageShell>
    );
  }

  // Finn temperaturer
  const findDevice = (needle: string) => {
    const n = norm(needle);
    return (
      data.devices.find((d) => norm(d.name) === n) ??
      data.devices.find((d) => norm(d.name).includes(n))
    );
  };

  const readTemp = (d: any | undefined) => {
    const v = d?.capabilities["measure_temperature"]?.value;
    return typeof v === "number" ? v : null;
  };

  const tempUte = readTemp(findDevice("Ute Tollnes Ute"));
  const tempInne =
    readTemp(findDevice("Inne Tollnes")) ??
    readTemp(findDevice("Stue")) ??
    readTemp(findDevice("Netatmo Inne"));
  const tempSov =
    readTemp(findDevice("Soverom")) ??
    readTemp(findDevice("Sov ")) ??
    readTemp(findDevice("Sovrom"));

  const lightningOk = lightning?.ok === true;
  const strikeCount = lightningOk ? lightning.strikes.length : 0;
  const recentStrikes = lightningOk
    ? lightning.strikes.filter(
        (s) => Date.now() - new Date(s.time).getTime() < 15 * 60_000,
      ).length
    : 0;

  return (
    <PageShell>
      {/* Kompakt header for iPad portrait */}
      <header className="container mx-auto px-6 pt-6 pb-3 text-center">
        <div className="text-display tracking-[0.5em] text-primary text-sm uppercase mb-1">
          Steintavlen
        </div>
        <div className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
          Borgens raske blikk · Tollnes
        </div>
        <div className="ornate-divider mt-3">
          <span className="text-medieval text-primary text-base">❦</span>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 pb-10 space-y-5">
        {/* Tre store temperaturbokser */}
        <section className="grid grid-cols-3 gap-3 sm:gap-4">
          <BigTemp label="Inne" temp={tempInne} accent="primary" />
          <BigTemp label="Soverom" temp={tempSov} accent="primary" />
          <BigTemp label="Ute · Tollnes" temp={tempUte} accent="ice" big />
        </section>

        {/* Live kamera — stort, sentralt */}
        <section>
          <SectionTitle>Vakttårnet · Live</SectionTitle>
          <div className="max-w-3xl mx-auto">
            <TollnesCameraStrip intervalMs={5000} aspectClass="aspect-video" />
          </div>
        </section>

        {/* Lynkart over Tollnes */}
        <section>
          <SectionTitle>Tordenravnene · siste 60 min</SectionTitle>
          <div className="panel rounded-lg overflow-hidden">
            <div className="relative w-full" style={{ height: "min(46vh, 480px)" }}>
              {lightning === null && (
                <div className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.3em] text-muted-foreground uppercase">
                  Speider etter lyn…
                </div>
              )}
              {lightning?.ok === false && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <div>
                    <div className="text-xs tracking-[0.3em] text-destructive uppercase mb-2">
                      Lyn-ravnene tier
                    </div>
                    <p className="text-xs text-muted-foreground">{lightning.error}</p>
                  </div>
                </div>
              )}
              {lightningOk && (
                <LightningMap
                  center={lightning.center}
                  radiusKm={lightning.radiusKm}
                  strikes={lightning.strikes}
                />
              )}
            </div>
            {lightningOk && (
              <div className="px-4 py-3 flex items-center justify-between text-[11px] tracking-[0.25em] uppercase text-muted-foreground border-t border-border">
                <span>
                  ⚡ {strikeCount} nedslag · {recentStrikes} siste 15 min
                </span>
                <span className="text-primary/70">
                  Radius {lightning.radiusKm} km · Met.no
                </span>
              </div>
            )}
          </div>
        </section>
      </main>
    </PageShell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="ornate-divider mb-3">
      <span className="text-display tracking-[0.3em] text-primary text-xs sm:text-sm uppercase">
        {children}
      </span>
    </div>
  );
}

function BigTemp({
  label,
  temp,
  accent = "primary",
  big = false,
}: {
  label: string;
  temp: number | null;
  accent?: "primary" | "ice";
  big?: boolean;
}) {
  const colorVar = accent === "ice" ? "var(--ice)" : "var(--primary)";
  return (
    <article
      className="panel rounded-lg p-4 sm:p-5 text-center flex flex-col items-center justify-center"
      style={{
        boxShadow:
          big
            ? `inset 0 0 0 1px ${colorVar.replace(")", " / 0.25)")}, 0 0 28px ${colorVar.replace(")", " / 0.18)")}`
            : undefined,
      }}
    >
      <div className="text-[9px] sm:text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={`text-display leading-none mt-2 ${big ? "text-6xl sm:text-7xl md:text-8xl" : "text-4xl sm:text-5xl md:text-6xl"}`}
        style={{ color: colorVar }}
      >
        {temp !== null ? `${temp.toFixed(1)}°` : "—"}
      </div>
      {big && (
        <div className="text-[10px] tracking-[0.3em] text-muted-foreground/70 uppercase mt-2">
          Netatmo
        </div>
      )}
    </article>
  );
}
