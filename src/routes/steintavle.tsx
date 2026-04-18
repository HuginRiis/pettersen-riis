import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, LightbulbOff, Loader2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { TollnesCameraStrip } from "@/components/TollnesCameraStrip";
import {
  getHomeySnapshot,
  setLivingRoomLights,
} from "@/server/homey";
import { useDailyMinMax, type MinMax } from "@/hooks/use-daily-minmax";
import {
  getNetatmoWeatherStation,
  type WeatherModule,
} from "@/server/netatmo-weather";
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

// Speiler server-logikken i `getLivingRoomLightsState` slik at vi kan utlede
// lys-status fra eksisterende snapshot uten et eget Athom-kall.
function isLivingRoomZoneName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("stue") ||
    n.includes("stua") ||
    n.includes("living") ||
    n.includes("livingroom")
  );
}

function deriveLivingRoomLightsOn(
  snapshot: Extract<Awaited<ReturnType<typeof getHomeySnapshot>>, { ok: true }>,
): boolean | null {
  const livingRoomZoneIds = new Set(
    snapshot.zones.filter((z) => isLivingRoomZoneName(z.name)).map((z) => z.id),
  );
  const lights = snapshot.devices.filter(
    (d) =>
      d.zone &&
      livingRoomZoneIds.has(d.zone) &&
      d.capabilities &&
      "onoff" in d.capabilities,
  );
  if (lights.length === 0) return null;
  return lights.some((d) => d.capabilities["onoff"]?.value === true);
}

function SteintavlePage() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getHomeySnapshot>>;
  const router = useRouter();
  const fetchAlerts = useServerFn(getTollnesAlerts);
  const fetchRadar = useServerFn(getMetRadarSouthernNorway);
  const toggleLights = useServerFn(setLivingRoomLights);
  const [alerts, setAlerts] = useState<AlertsResult | null>(null);
  const [radar, setRadar] = useState<RadarResult | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  // Optimistisk overstyring av lys-status — null betyr "bruk verdien fra snapshot".
  const [lightsOverride, setLightsOverride] = useState<boolean | null>(null);
  const [lightsBusy, setLightsBusy] = useState(false);

  // Lys-status leses fra snapshot (samme zone-logikk som server),
  // så vi unngår et eget API-kall mot Athom.
  const lightsFromSnapshot = data.ok ? deriveLivingRoomLightsOn(data) : null;
  const lightsOn = lightsOverride ?? lightsFromSnapshot;

  // Når snapshot oppdateres og matcher overstyringen → dropp overstyringen.
  useEffect(() => {
    if (lightsOverride !== null && lightsFromSnapshot === lightsOverride) {
      setLightsOverride(null);
    }
  }, [lightsFromSnapshot, lightsOverride]);

  useEffect(() => {
    let cancelled = false;
    setNow(new Date());

    const isHidden = () => typeof document !== "undefined" && document.hidden;

    const loadAlerts = async () => {
      if (isHidden()) return;
      try {
        const res = await fetchAlerts();
        if (!cancelled) setAlerts(res);
      } catch (e: any) {
        if (!cancelled) setAlerts({ ok: false, error: e?.message ?? "Feil" });
      }
    };
    const loadRadar = async () => {
      if (isHidden()) return;
      try {
        const res = await fetchRadar();
        if (!cancelled) setRadar(res);
      } catch (e: any) {
        if (!cancelled) setRadar({ ok: false, error: e?.message ?? "Feil" });
      }
    };
    const refreshSnapshot = () => {
      if (isHidden()) return;
      router.invalidate();
    };

    loadAlerts();
    loadRadar();

    // Snillere polling for å unngå Athom 429:
    // - Værvarsel & radar: 10 min (var 5 min)
    // - Klokke: 30 sek (lokal, ingen API)
    // - Homey-snapshot: 3 min (var 1 min, og vi droppet eget lys-kall)
    const a = setInterval(loadAlerts, 10 * 60_000);
    const r = setInterval(loadRadar, 10 * 60_000);
    const c = setInterval(() => setNow(new Date()), 30_000);
    const t = setInterval(refreshSnapshot, 3 * 60_000);

    // Når fanen blir synlig igjen, hent ferskt umiddelbart.
    const onVisibility = () => {
      if (!document.hidden) {
        loadAlerts();
        loadRadar();
        refreshSnapshot();
        setNow(new Date());
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      clearInterval(a);
      clearInterval(r);
      clearInterval(c);
      clearInterval(t);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [fetchAlerts, fetchRadar, router]);

  const handleSetLights = async (next: boolean) => {
    if (lightsBusy) return;
    if (lightsOn === next) return; // already in desired state
    setLightsBusy(true);
    setLightsOverride(next); // optimistic
    try {
      const res = await toggleLights({ data: { on: next } });
      if (!res.ok) {
        setLightsOverride(null);
      } else {
        // Hent fersk snapshot så lights-state synkes (og overstyringen kan slippes).
        router.invalidate();
      }
    } catch {
      setLightsOverride(null);
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
            onSet={handleSetLights}
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

function MinMaxRow({
  mm,
  unit,
  decimals = 1,
}: {
  mm: MinMax;
  unit: string;
  decimals?: number;
}) {
  return (
    <div className="mt-2 flex items-center justify-center gap-3 text-[9px] sm:text-[10px] tracking-[0.2em] uppercase">
      <span className="flex items-center gap-1 text-[var(--ice)]/80">
        <span className="opacity-70">▼</span>
        <span className="tabular-nums">
          {mm ? `${mm.min.toFixed(decimals)}${unit}` : "—"}
        </span>
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span className="flex items-center gap-1 text-[var(--gold)]/90">
        <span className="opacity-70">▲</span>
        <span className="tabular-nums">
          {mm ? `${mm.max.toFixed(decimals)}${unit}` : "—"}
        </span>
      </span>
    </div>
  );
}

function BigTemp({
  label,
  temp,
  mm,
  accent = "primary",
  big = false,
}: {
  label: string;
  temp: number | null;
  mm: MinMax;
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
            ? "text-5xl sm:text-6xl md:text-7xl"
            : "text-4xl sm:text-5xl md:text-5xl"
        }`}
        style={{ color }}
      >
        {temp !== null ? `${temp.toFixed(1)}°` : "—"}
      </div>
      <MinMaxRow mm={mm} unit="°" />
    </article>
  );
}

function BigNoise({
  label,
  db,
  mm,
}: {
  label: string;
  db: number;
  mm: MinMax;
}) {
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
        className="text-display leading-none mt-2 text-4xl sm:text-5xl md:text-5xl"
        style={{ color }}
      >
        {db.toFixed(0)}
      </div>
      <div className="text-[9px] sm:text-[10px] tracking-[0.3em] text-muted-foreground/70 uppercase mt-1">
        dB · {loud ? "Høyt" : moderate ? "Middels" : "Stille"}
      </div>
      <MinMaxRow mm={mm} unit="" decimals={0} />
    </article>
  );
}

function LightsControl({
  on,
  busy,
  onSet,
}: {
  on: boolean | null;
  busy: boolean;
  onSet: (next: boolean) => void;
}) {
  const isOn = on === true;
  const isOff = on === false;
  const glowColor = "var(--gold)";
  return (
    <article
      className="panel rounded-lg p-4 sm:p-5 flex flex-col items-center justify-center text-center"
      style={
        isOn
          ? {
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${glowColor} 35%, transparent), 0 0 28px color-mix(in oklab, ${glowColor} 22%, transparent)`,
            }
          : undefined
      }
    >
      <div className="text-[9px] sm:text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
        Stuens lys
      </div>
      <div className="mt-2 mb-2 flex items-center justify-center">
        {busy ? (
          <Loader2 className="animate-spin" size={32} style={{ color: glowColor }} />
        ) : isOn ? (
          <Lightbulb size={36} style={{ color: glowColor }} />
        ) : (
          <LightbulbOff size={36} style={{ color: "var(--muted-foreground)" }} />
        )}
      </div>
      <div
        className="text-display text-xs sm:text-sm tracking-[0.3em] uppercase mb-3"
        style={{
          color:
            on === null
              ? "var(--muted-foreground)"
              : isOn
                ? glowColor
                : "var(--muted-foreground)",
        }}
      >
        {on === null ? "Henter…" : isOn ? "Tent" : "Slukket"}
      </div>
      <div className="grid grid-cols-2 gap-2 w-full">
        <button
          type="button"
          onClick={() => onSet(true)}
          disabled={busy || on === null || isOn}
          aria-pressed={isOn}
          aria-label="Tenn stuens lys"
          className="rounded-md py-2 sm:py-2.5 text-[10px] sm:text-xs tracking-[0.25em] uppercase font-semibold transition-all disabled:cursor-not-allowed"
          style={{
            background: isOn
              ? `color-mix(in oklab, ${glowColor} 25%, transparent)`
              : "color-mix(in oklab, var(--foreground) 6%, transparent)",
            color: isOn ? glowColor : "var(--foreground)",
            border: `1px solid color-mix(in oklab, ${glowColor} ${
              isOn ? 60 : 25
            }%, transparent)`,
            opacity: busy || on === null ? 0.6 : 1,
          }}
        >
          På
        </button>
        <button
          type="button"
          onClick={() => onSet(false)}
          disabled={busy || on === null || isOff}
          aria-pressed={isOff}
          aria-label="Slukk stuens lys"
          className="rounded-md py-2 sm:py-2.5 text-[10px] sm:text-xs tracking-[0.25em] uppercase font-semibold transition-all disabled:cursor-not-allowed"
          style={{
            background: isOff
              ? "color-mix(in oklab, var(--muted-foreground) 20%, transparent)"
              : "color-mix(in oklab, var(--foreground) 6%, transparent)",
            color: isOff ? "var(--foreground)" : "var(--muted-foreground)",
            border: `1px solid color-mix(in oklab, var(--muted-foreground) ${
              isOff ? 50 : 25
            }%, transparent)`,
            opacity: busy || on === null ? 0.6 : 1,
          }}
        >
          Av
        </button>
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
