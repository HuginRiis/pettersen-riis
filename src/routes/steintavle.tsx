import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, LightbulbOff, Loader2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { TollnesCameraStrip } from "@/components/TollnesCameraStrip";
import {
  getHomeySnapshot,
  getLivingRoomLightsState,
  setLivingRoomLights,
} from "@/server/homey";
import { findDeviceFuzzy, readTemp } from "@/lib/homey-match";
import { useDailyMinMax, type MinMax } from "@/hooks/use-daily-minmax";
import {
  getTollnesAlerts,
  getMetRadarSouthernNorway,
  type AlertsResult,
  type MetAlert,
  type RadarResult,
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
    <PageShell minimalHeader>
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
  const fetchRadar = useServerFn(getMetRadarSouthernNorway);
  const fetchLightsState = useServerFn(getLivingRoomLightsState);
  const toggleLights = useServerFn(setLivingRoomLights);
  const [alerts, setAlerts] = useState<AlertsResult | null>(null);
  const [radar, setRadar] = useState<RadarResult | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [lightsOn, setLightsOn] = useState<boolean | null>(null);
  const [lightsBusy, setLightsBusy] = useState(false);

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
    const loadRadar = async () => {
      try {
        const res = await fetchRadar();
        if (!cancelled) setRadar(res);
      } catch (e: any) {
        if (!cancelled) setRadar({ ok: false, error: e?.message ?? "Feil" });
      }
    };
    const loadLights = async () => {
      try {
        const res = await fetchLightsState();
        if (!cancelled && res.ok) setLightsOn(res.anyOn);
      } catch {
        // ignore
      }
    };
    loadAlerts();
    loadRadar();
    loadLights();
    const a = setInterval(loadAlerts, 5 * 60_000);
    const r = setInterval(loadRadar, 5 * 60_000);
    const c = setInterval(() => setNow(new Date()), 30_000);
    const l = setInterval(loadLights, 30_000);
    // Hent ferske Homey-temperaturer hvert 60. sek
    const t = setInterval(() => router.invalidate(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(a);
      clearInterval(r);
      clearInterval(c);
      clearInterval(l);
      clearInterval(t);
    };
  }, [fetchAlerts, fetchRadar, fetchLightsState, router]);

  const handleToggleLights = async () => {
    if (lightsBusy) return;
    const next = !(lightsOn ?? false);
    setLightsBusy(true);
    setLightsOn(next); // optimistic
    try {
      const res = await toggleLights({ data: { on: next } });
      if (!res.ok) setLightsOn(!next);
    } catch {
      setLightsOn(!next);
    } finally {
      setLightsBusy(false);
    }
  };


  if (!data.ok) {
    return (
      <PageShell minimalHeader>
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

  // ---- Daglig min/maks (lagres i localStorage, resettes ved døgnskifte) ----
  const innerMM = useDailyMinMax("st.mm.inne", tempInne);
  const sovMM = useDailyMinMax("st.mm.sov", tempSov);
  const uteMM = useDailyMinMax("st.mm.ute", tempUte);
  const noiseMM = useDailyMinMax("st.mm.noise", noiseDb);

  // ---- Varsler ----
  const thunderAlerts =
    alerts?.ok === true ? alerts.alerts.filter((a) => a.isThunder) : [];
  const otherAlerts =
    alerts?.ok === true ? alerts.alerts.filter((a) => !a.isThunder) : [];
  const hasThunder = thunderAlerts.length > 0;

  const hasNoise = noiseDb !== null;

  return (
    <PageShell minimalHeader>
      <header className="container mx-auto px-6 pt-6 pb-3 text-center">
        <div className="text-display tracking-[0.5em] text-primary text-sm uppercase mb-1">
          Steintavlen
        </div>
        <div className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
          Borgens raske blikk · Tollnes ·{" "}
          {now
            ? now.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })
            : "—"}
        </div>
        <div className="ornate-divider mt-3">
          <span className="text-medieval text-primary text-base">❦</span>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 pb-10 space-y-5">
        {/* Øverste rad: temperaturer + lyd + lysstyring (iPad-vennlig) */}
        <section
          className={`grid gap-3 sm:gap-4 ${
            hasNoise
              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-5"
              : "grid-cols-2 sm:grid-cols-2 md:grid-cols-4"
          }`}
        >
          <BigTemp label="Inne" temp={tempInne} mm={innerMM} accent="primary" />
          <BigTemp label="Soverom" temp={tempSov} mm={sovMM} accent="primary" />
          <BigTemp label="Ute · Tollnes" temp={tempUte} mm={uteMM} accent="ice" big />
          {hasNoise && <BigNoise label="Lyd · Tollnes" db={noiseDb!} mm={noiseMM} />}
          <LightsControl
            on={lightsOn}
            busy={lightsBusy}
            onToggle={handleToggleLights}
          />
        </section>

        {/* Live kamera */}
        <section>
          <SectionTitle>Vakttårnet · Live</SectionTitle>
          <div className="max-w-3xl mx-auto">
            <TollnesCameraStrip intervalMs={5000} aspectClass="aspect-video" />
          </div>
        </section>

        {/* Tordenvarsel-banner (kun hvis aktivt) */}
        {hasThunder && (
          <section>
            <ThunderBanner alerts={thunderAlerts} />
          </section>
        )}

        {/* MET.no radar — offisielt nedbørs/lyn-radarbilde over Sør-Norge */}
        <section>
          <SectionTitle>Stormens Øye · MET.no Radar</SectionTitle>
          <div className="panel rounded-lg overflow-hidden">
            <div
              className="relative w-full bg-background flex items-center justify-center"
              style={{ aspectRatio: "4 / 3", maxHeight: "min(60vh, 600px)" }}
            >
              {radar === null && (
                <div className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
                  Sender ravn til MET.no…
                </div>
              )}
              {radar?.ok === false && (
                <div className="text-center px-6">
                  <div className="text-2xl mb-2">🌫</div>
                  <div className="text-sm text-destructive">{radar.error}</div>
                  <a
                    href="https://www.yr.no/nb/kart/lyn/1-2337230"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline text-xs mt-2 inline-block"
                  >
                    Åpne Yr lynkart ↗
                  </a>
                </div>
              )}
              {radar?.ok === true && (
                <>
                  <img
                    src={radar.dataUrl}
                    alt="MET.no radar — Sør-Norge"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                  {/* Tollnes-markør (omtrent midt i Sør-Norge) */}
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: "44%",
                      top: "62%",
                      transform: "translate(-50%, -50%)",
                    }}
                    title="Tollnes, Skien"
                  >
                    <div className="relative">
                      <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow-[0_0_12px_var(--primary)] animate-pulse" />
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.2em] text-primary uppercase whitespace-nowrap font-semibold drop-shadow-[0_1px_2px_black]">
                        Tollnes
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="px-4 py-3 flex items-center justify-between text-[11px] tracking-[0.25em] uppercase text-muted-foreground border-t border-border gap-3 flex-wrap">
              <span>
                {hasThunder ? (
                  <span className="text-destructive font-semibold">⚡ Torden i området</span>
                ) : otherAlerts.length > 0 ? (
                  <span className="text-primary">⚠ {otherAlerts.length} aktivt varsel</span>
                ) : radar?.ok === true ? (
                  <span>MET.no · {new Date(radar.capturedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}</span>
                ) : (
                  <span>MET.no · Sør-Norge</span>
                )}
              </span>
              <a
                href="https://www.yr.no/nb/kart/lyn/1-2337230"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Yr lynkart ↗
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

function BigNoise({ label, db }: { label: string; db: number }) {
  const loud = db >= 65;
  const moderate = db >= 55;
  const color = loud
    ? "var(--destructive)"
    : moderate
      ? "var(--gold)"
      : "var(--primary)";
  return (
    <article
      className="panel rounded-lg p-4 sm:p-5 text-center flex flex-col items-center justify-center"
      style={
        loud
          ? {
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent), 0 0 24px color-mix(in oklab, ${color} 18%, transparent)`,
            }
          : undefined
      }
    >
      <div className="text-[9px] sm:text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className="text-display leading-none mt-2 text-4xl sm:text-5xl md:text-6xl"
        style={{ color }}
      >
        {db.toFixed(0)}
      </div>
      <div className="text-[10px] tracking-[0.3em] text-muted-foreground/70 uppercase mt-2">
        dB · {loud ? "Høyt" : moderate ? "Middels" : "Stille"}
      </div>
    </article>
  );
}

function LightsControl({
  on,
  busy,
  onToggle,
}: {
  on: boolean | null;
  busy: boolean;
  onToggle: () => void;
}) {
  const isOn = on === true;
  const color = isOn ? "var(--gold)" : "var(--muted-foreground)";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy || on === null}
      aria-pressed={isOn}
      className="panel rounded-lg p-5 sm:p-6 w-full flex items-center gap-5 text-left transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-wait"
      style={
        isOn
          ? {
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 35%, transparent), 0 0 32px color-mix(in oklab, ${color} 22%, transparent)`,
            }
          : undefined
      }
    >
      <div
        className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: isOn
            ? `radial-gradient(circle, color-mix(in oklab, ${color} 35%, transparent), transparent 70%)`
            : "transparent",
          border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
        }}
      >
        {busy ? (
          <Loader2 className="animate-spin" size={26} style={{ color }} />
        ) : isOn ? (
          <Lightbulb size={28} style={{ color }} />
        ) : (
          <LightbulbOff size={28} style={{ color }} />
        )}
      </div>
      <div className="flex-1">
        <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
          Stuens lys
        </div>
        <div
          className="text-display text-2xl sm:text-3xl mt-1"
          style={{ color: isOn ? color : "var(--foreground)" }}
        >
          {on === null ? "Henter…" : isOn ? "Tent" : "Slukket"}
        </div>
        <div className="text-[10px] tracking-[0.25em] text-muted-foreground/70 uppercase mt-1">
          Trykk for å {isOn ? "slukke" : "tenne"} alt
        </div>
      </div>
    </button>
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
