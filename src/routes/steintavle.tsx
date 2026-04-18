import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { TollnesCameraStrip } from "@/components/TollnesCameraStrip";
import { getHomeySnapshot } from "@/server/homey";
import { findDeviceFuzzy, readTemp } from "@/lib/homey-match";
import {
  getTollnesAlerts,
  type AlertsResult,
  type MetAlert,
} from "@/server/lightning";

export const Route = createFileRoute("/steintavle")({
  head: () => ({
    meta: [
      { title: "Steintavle | House Riis-Pettersen" },
      {
        name: "description",
        content:
          "Steintavlen — borgens raske blikk på temperatur, kamera og torden over Tollnes.",
      },
      { property: "og:title", content: "Steintavle — House Riis-Pettersen" },
      {
        property: "og:description",
        content: "Temperatur, live kamera og tordenvarsel over Tollnes.",
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

function SteintavlePage() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getHomeySnapshot>>;
  const router = useRouter();
  const fetchAlerts = useServerFn(getTollnesAlerts);
  const [alerts, setAlerts] = useState<AlertsResult | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNow(new Date());
    const loadAlerts = async () => {
      try {
        const res = await fetchAlerts();
        if (!cancelled) setAlerts(res);
      } catch (e: any) {
        if (!cancelled) setAlerts({ ok: false, error: e?.message ?? "Feil" });
      }
    };
    loadAlerts();
    const a = setInterval(loadAlerts, 5 * 60_000);
    const c = setInterval(() => setNow(new Date()), 30_000);
    // Hent ferske Homey-temperaturer hvert 60. sek
    const t = setInterval(() => router.invalidate(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(a);
      clearInterval(c);
      clearInterval(t);
    };
  }, [fetchAlerts, router]);

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

  // ---- Temperaturer (fuzzy match — finner riktig sensor uavhengig av eksakt navn) ----
  const hasTemp = (d: any) =>
    typeof d?.capabilities?.["measure_temperature"]?.value === "number";

  const tempUte = readTemp(
    findDeviceFuzzy(data.devices, data.zones, "ute tollnes", (d, c) => hasTemp(d) && c.includes("ute")) ??
      findDeviceFuzzy(data.devices, data.zones, "tollnes ute", (d) => hasTemp(d)) ??
      findDeviceFuzzy(data.devices, data.zones, "ute", (d, c) => hasTemp(d) && !c.includes("hytt")),
  );

  const tempInne = readTemp(
    findDeviceFuzzy(data.devices, data.zones, "inne tollnes", (d) => hasTemp(d)) ??
      findDeviceFuzzy(data.devices, data.zones, "netatmo inne", (d) => hasTemp(d)) ??
      findDeviceFuzzy(data.devices, data.zones, "stue", (d) => hasTemp(d)) ??
      findDeviceFuzzy(data.devices, data.zones, "netatmo", (d, c) => hasTemp(d) && !c.includes("ute") && !c.includes("hytt") && !c.includes("sov")),
  );

  const tempSov = readTemp(
    findDeviceFuzzy(data.devices, data.zones, "soverom", (d) => hasTemp(d)) ??
      findDeviceFuzzy(data.devices, data.zones, "sov", (d) => hasTemp(d)) ??
      findDeviceFuzzy(data.devices, data.zones, "sovrom", (d) => hasTemp(d)),
  );

  // Lydmåling (dB) fra Netatmo innendørs på Tollnes
  const noiseDevice =
    findDeviceFuzzy(data.devices, data.zones, "tollnes", (d) =>
      typeof d?.capabilities?.["measure_noise"]?.value === "number",
    ) ??
    findDeviceFuzzy(data.devices, data.zones, "netatmo", (d, c) =>
      typeof d?.capabilities?.["measure_noise"]?.value === "number" &&
      !c.includes("hytt") &&
      !c.includes("ute"),
    );
  const noiseDb =
    typeof noiseDevice?.capabilities?.["measure_noise"]?.value === "number"
      ? (noiseDevice.capabilities["measure_noise"].value as number)
      : null;

  // ---- Varsler ----
  const thunderAlerts =
    alerts?.ok === true ? alerts.alerts.filter((a) => a.isThunder) : [];
  const otherAlerts =
    alerts?.ok === true ? alerts.alerts.filter((a) => !a.isThunder) : [];
  const hasThunder = thunderAlerts.length > 0;

  return (
    <PageShell>
      <header className="container mx-auto px-6 pt-6 pb-3 text-center">
        <div className="text-display tracking-[0.5em] text-primary text-sm uppercase mb-1">
          Steintavlen
        </div>
        <div className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
          Borgens raske blikk · Tollnes ·{" "}
          {now.toLocaleTimeString("nb-NO", {
            hour: "2-digit",
            minute: "2-digit",
          })}
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

        {/* Live kamera */}
        <section>
          <SectionTitle>Vakttårnet · Live</SectionTitle>
          <div className="max-w-3xl mx-auto">
            <TollnesCameraStrip intervalMs={5000} aspectClass="aspect-video" />
          </div>
        </section>

        {/* dB-måling fra Tollnes */}
        {noiseDb !== null && (
          <section>
            <SectionTitle>Lydvakten · Tollnes</SectionTitle>
            <NoiseBox db={noiseDb} />
          </section>
        )}

        {/* Tordenvarsel-banner (kun hvis aktivt) */}
        {hasThunder && (
          <section>
            <ThunderBanner alerts={thunderAlerts} />
          </section>
        )}

        {/* Yr lynradar — ekte live data, sentrert på Tollnes (Skien, Telemark) */}
        <section>
          <SectionTitle>Lynvarsel · Yr.no over Tollnes</SectionTitle>
          <div className="panel rounded-lg overflow-hidden">
            <div className="relative w-full" style={{ aspectRatio: "4 / 3", maxHeight: "min(60vh, 600px)" }}>
              <iframe
                title="Yr lynkart sentrert på Tollnes, Skien"
                src="https://www.yr.no/nb/kart/lyn/1-2337230"
                className="absolute inset-0 w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="px-4 py-3 flex items-center justify-between text-[11px] tracking-[0.25em] uppercase text-muted-foreground border-t border-border">
              <span>
                {hasThunder ? (
                  <span className="text-destructive font-semibold">⚡ Torden i området</span>
                ) : otherAlerts.length > 0 ? (
                  <span className="text-primary">⚠ {otherAlerts.length} aktivt varsel</span>
                ) : (
                  <span>Yr.no · Live lyn</span>
                )}
              </span>
              <a
                href="https://www.yr.no/nb/kart/lyn/1-2337230"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Åpne i Yr ↗
              </a>
            </div>
            {otherAlerts.length > 0 && (
              <div className="px-4 py-3 border-t border-border space-y-2">
                {otherAlerts.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <span
                      className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: alertColor(a.awarenessColor) }}
                    />
                    <div className="flex-1">
                      <div className="text-foreground">{a.title}</div>
                      {a.area && (
                        <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mt-0.5">
                          {a.area}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
  const color = accent === "ice" ? "var(--ice)" : "var(--primary)";
  return (
    <article
      className="panel rounded-lg p-4 sm:p-5 text-center flex flex-col items-center justify-center"
      style={
        big
          ? {
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 25%, transparent), 0 0 28px color-mix(in oklab, ${color} 18%, transparent)`,
            }
          : undefined
      }
    >
      <div className="text-[9px] sm:text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={`text-display leading-none mt-2 ${
          big
            ? "text-6xl sm:text-7xl md:text-8xl"
            : "text-4xl sm:text-5xl md:text-6xl"
        }`}
        style={{ color }}
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

function NoiseBox({ db }: { db: number }) {
  const pct = Math.max(0, Math.min(100, ((db - 30) / 50) * 100));
  const loud = db >= 65;
  const color = loud ? "var(--destructive)" : db >= 55 ? "var(--gold)" : "var(--primary)";
  return (
    <article
      className="panel rounded-lg p-5 sm:p-6 flex items-center gap-5"
      style={{
        boxShadow: loud
          ? `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent), 0 0 24px color-mix(in oklab, ${color} 18%, transparent)`
          : undefined,
      }}
    >
      <div className="text-4xl">{loud ? "📢" : db >= 55 ? "🔊" : "🔈"}</div>
      <div className="flex-1">
        <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
          Lydnivå · Tollnes
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-display text-4xl sm:text-5xl" style={{ color }}>
            {db.toFixed(0)}
          </span>
          <span className="text-sm tracking-[0.2em] text-muted-foreground uppercase">dB</span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <div className="flex justify-between text-[9px] tracking-[0.2em] text-muted-foreground/70 uppercase mt-1">
          <span>Stille (30 dB)</span>
          <span>Høyt (80 dB)</span>
        </div>
      </div>
    </article>
  );
}

function ThunderBanner({ alerts }: { alerts: MetAlert[] }) {
  return (
    <div
      className="panel rounded-lg p-5 border-l-4"
      style={{
        borderLeftColor: "var(--destructive)",
        boxShadow: "0 0 32px color-mix(in oklab, var(--destructive) 25%, transparent)",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="text-4xl animate-pulse">⚡</div>
        <div className="flex-1">
          <div className="text-[10px] tracking-[0.3em] text-destructive uppercase font-semibold">
            Torden varsles
          </div>
          {alerts.map((a) => (
            <div key={a.id} className="mt-2">
              <div className="text-display text-foreground text-lg">{a.title}</div>
              {a.description && (
                <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
              )}
              {a.area && (
                <div className="text-[11px] tracking-[0.2em] text-muted-foreground/70 uppercase mt-1">
                  {a.area}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RadarPanel({
  radar,
  alerts,
  hasThunder,
}: {
  radar: RadarResult | null;
  alerts: MetAlert[];
  hasThunder: boolean;
}) {
  return (
    <div className="panel rounded-lg overflow-hidden">
      <div className="relative w-full bg-background/60" style={{ aspectRatio: "1 / 1", maxHeight: "min(50vh, 520px)" }}>
        {radar === null && (
          <div className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.3em] text-muted-foreground uppercase">
            Speider etter regn-skyer…
          </div>
        )}
        {radar?.ok === false && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <div>
              <div className="text-xs tracking-[0.3em] text-destructive uppercase mb-2">
                Radarravnen tier
              </div>
              <p className="text-xs text-muted-foreground">{radar.error}</p>
            </div>
          </div>
        )}
        {radar?.ok === true && (
          <RadarImage dataUrl={radar.dataUrl} hasThunder={hasThunder} />
        )}
      </div>
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] tracking-[0.25em] uppercase text-muted-foreground border-t border-border">
        <span>
          {hasThunder ? (
            <span className="text-destructive font-semibold">⚡ Torden i området</span>
          ) : alerts.length > 0 ? (
            <span className="text-primary">⚠ {alerts.length} aktivt varsel</span>
          ) : (
            <span>Ingen aktive varsler</span>
          )}
        </span>
        <span className="text-primary/70">
          {radar?.ok === true
            ? `Met.no · ${new Date(radar.capturedAt).toLocaleTimeString("nb-NO", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Met.no radar"}
        </span>
      </div>
      {alerts.length > 0 && (
        <div className="px-4 py-3 border-t border-border space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-3 text-sm">
              <span
                className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: alertColor(a.awarenessColor) }}
              />
              <div className="flex-1">
                <div className="text-foreground">{a.title}</div>
                {a.area && (
                  <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mt-0.5">
                    {a.area}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function alertColor(c: string): string {
  switch (c) {
    case "red":
      return "oklch(0.55 0.22 25)";
    case "orange":
      return "oklch(0.70 0.18 50)";
    case "yellow":
      return "oklch(0.80 0.16 90)";
    default:
      return "oklch(0.65 0.10 150)";
  }
}

/**
 * Radarbildet er en PNG over sør-Norge. Vi vet ikke nøyaktig bbox,
 * men sentrerer kartet visuelt på Tollnes (omtrent midt-sør i bildet)
 * og tegner en gylden markør oppå.
 */
function RadarImage({ dataUrl, hasThunder }: { dataUrl: string; hasThunder: boolean }) {
  // Zoom inn ~12x og sentrer på Tollnes (omtrent 52% / 62% i bildet).
  const ZOOM = 12;
  const TOLLNES_X = 52; // %
  const TOLLNES_Y = 62; // %

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: "oklch(0.12 0.012 240)" }}
    >
      {/* Zoom-laget — skaler bildet og forskyv så Tollnes havner i midten */}
      <div
        className="absolute inset-0"
        style={{
          transform: `scale(${ZOOM})`,
          transformOrigin: `${TOLLNES_X}% ${TOLLNES_Y}%`,
        }}
      >
        <img
          src={dataUrl}
          alt="Met.no værradar zoomet inn på Tollnes"
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            filter: "brightness(1.15) contrast(1.1)",
            mixBlendMode: "screen",
            imageRendering: "pixelated",
          }}
        />
      </div>

      {/* Tollnes-markør — alltid midt i visningen */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          className={`relative ${hasThunder ? "animate-pulse" : ""}`}
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "9999px",
            background: hasThunder ? "var(--destructive)" : "var(--gold)",
            boxShadow: hasThunder
              ? "0 0 0 4px color-mix(in oklab, var(--destructive) 30%, transparent), 0 0 22px var(--destructive)"
              : "0 0 0 4px color-mix(in oklab, var(--gold) 25%, transparent), 0 0 22px color-mix(in oklab, var(--gold) 70%, transparent)",
          }}
        />
        {/* ~5 km radius-ring (visuell indikasjon — radar er ca 1px/km) */}
        <div
          className="absolute left-1/2 top-1/2 pointer-events-none"
          style={{
            width: "120px",
            height: "120px",
            transform: "translate(-50%, -50%)",
            borderRadius: "9999px",
            border: "1px dashed color-mix(in oklab, var(--gold) 60%, transparent)",
            boxShadow: "inset 0 0 30px color-mix(in oklab, var(--gold) 8%, transparent)",
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-3 text-[10px] tracking-[0.3em] uppercase whitespace-nowrap"
          style={{
            color: hasThunder ? "var(--destructive)" : "var(--gold)",
            textShadow: "0 0 8px oklch(0.10 0.01 240), 0 0 4px oklch(0.10 0.01 240)",
          }}
        >
          Tollnes · ~5 km
        </div>
      </div>
    </div>
  );
}
