import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, LightbulbOff, Loader2, Pause, Play } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { TollnesCameraStrip } from "@/components/TollnesCameraStrip";
import {
  HeatPumpTile,
  CeilingLampTile,
  LivingRoomProvider,
} from "@/components/LivingRoomDevicesPanel";
import {
  getHomeySnapshot,
  setLivingRoomLights,
} from "@/server/homey";
import { useDailyMinMax, type MinMax } from "@/hooks/use-daily-minmax";
import { useLastGood } from "@/hooks/use-last-good";
import {
  getNetatmoWeatherStation,
  type WeatherModule,
} from "@/server/netatmo-weather";
import {
  getTollnesAlerts,
  type AlertsResult,
  type MetAlert,
} from "@/server/lightning";

export const Route = createFileRoute("/steintavle")({
  head: () => ({
    meta: [
      { title: "Steintavle | House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Steintavlen — borgens raske blikk på temperatur, kamera og torden over Tollnes.",
      },
      { property: "og:title", content: "Steintavle — House Pettersen-Riis" },
      {
        property: "og:description",
        content: "Temperatur, live kamera og tordenvarsel over Tollnes.",
      },
    ],
  }),
  // Cache i 3 minutter for å spare Homey API-kall
  staleTime: 3 * 60_000,
  preloadStaleTime: 3 * 60_000,
  loader: async () => {
    // Begge feil-håndteres separat — Netatmo skal vises selv om Homey er nede
    // (f.eks. utløpt token), og omvendt.
    const [homey, netatmo] = await Promise.all([
      getHomeySnapshot().catch((e) => ({
        ok: false as const,
        error: e?.message ?? "Homey-feil",
      })),
      getNetatmoWeatherStation({ data: { stationMatch: "tollnes" } }).catch(
        (e) => ({ ok: false as const, error: e?.message ?? "Netatmo-feil" }),
      ),
    ]);
    return { homey, netatmo };
  },
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

// Speiler `LIVING_ROOM_TARGETS` på serveren — samme navne-tokens slik at
// Steintavlen kan derive lys-status fra eksisterende snapshot uten ekstra kall.
const LIVING_ROOM_TARGET_TOKENS: string[][] = [
  ["høyt", "peis"],
  ["høyt", "tv"],
  ["lampett"],
  ["sweet", "høyre"],
  ["sweet", "venstre"],
  ["taklys"],
  ["stålampe"],
];

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function deriveLivingRoomLightsOn(
  snapshot: Extract<Awaited<ReturnType<typeof getHomeySnapshot>>, { ok: true }>,
): boolean | null {
  const matched: typeof snapshot.devices = [];
  for (const tokens of LIVING_ROOM_TARGET_TOKENS) {
    const hit = snapshot.devices.find((d) => {
      if (!d.capabilities || !("onoff" in d.capabilities)) return false;
      const name = normName(d.name);
      return tokens.every((t) => name.includes(t));
    });
    if (hit && !matched.includes(hit)) matched.push(hit);
  }
  if (matched.length === 0) return null;
  return matched.some((d) => d.capabilities["onoff"]?.value === true);
}

function SteintavlePage() {
  const { homey: data, netatmo } = Route.useLoaderData() as {
    homey: Awaited<ReturnType<typeof getHomeySnapshot>>;
    netatmo: Awaited<ReturnType<typeof getNetatmoWeatherStation>>;
  };
  const fetchNetatmo = useServerFn(getNetatmoWeatherStation);
  const [liveNetatmo, setLiveNetatmo] = useState(netatmo);
  const router = useRouter();
  const fetchAlerts = useServerFn(getTollnesAlerts);
  const toggleLights = useServerFn(setLivingRoomLights);
  const [alerts, setAlerts] = useState<AlertsResult | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  // Optimistisk overstyring av lys-status — null betyr "bruk verdien fra snapshot".
  const [lightsOverride, setLightsOverride] = useState<boolean | null>(null);
  const [lightsBusy, setLightsBusy] = useState(false);
  const [paused, setPaused] = usePersistedState<boolean>("st.updates.paused", false);

  // Lys-status leses fra snapshot (samme zone-logikk som server),
  // så vi unngår et eget API-kall mot Athom.
  const lightsFromSnapshot = data.ok ? deriveLivingRoomLightsOn(data) : null;
  const lightsOn = lightsOverride ?? lightsFromSnapshot;

  // Auto-refresh hver 10 minutt mens fanen er synlig (bra for iPad i kiosk-modus)
  useEffect(() => {
    if (paused) return;
    const REFRESH_MS = 10 * 60_000;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      router.invalidate();
      fetchNetatmo({ data: { stationMatch: "tollnes" } })
        .then((res) => setLiveNetatmo(res))
        .catch(() => {});
    };
    const id = setInterval(tick, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, fetchNetatmo, paused]);

  // Når snapshot oppdateres og matcher overstyringen → dropp overstyringen.
  useEffect(() => {
    if (lightsOverride !== null && lightsFromSnapshot === lightsOverride) {
      setLightsOverride(null);
    }
  }, [lightsFromSnapshot, lightsOverride]);

  // Tidligere kiosk-modus: husk siste rute. Deaktivert — vi vil alltid starte på Hjem.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem("pr.kiosk.lastRoute");
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    setNow(new Date());
    if (paused) return;

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
    const loadNetatmo = async () => {
      if (isHidden()) return;
      try {
        const res = await fetchNetatmo({ data: { stationMatch: "tollnes" } });
        if (!cancelled) setLiveNetatmo(res);
      } catch (e: any) {
        if (!cancelled)
          setLiveNetatmo({ ok: false, error: e?.message ?? "Netatmo-feil" });
      }
    };
    const refreshSnapshot = () => {
      if (isHidden()) return;
      router.invalidate();
    };

    loadAlerts();
    loadNetatmo();

    // Polling-intervaller (skånsomme mot APIene):
    // - Netatmo: 5 min (Netatmo oppdaterer selv hvert 10. min)
    // - Værvarsel: 10 min
    // - Klokke: 30 sek
    // - Homey-snapshot: 3 min (lyskontroll)
    const a = setInterval(loadAlerts, 10 * 60_000);
    const n = setInterval(loadNetatmo, 5 * 60_000);
    const c = setInterval(() => setNow(new Date()), 30_000);
    const t = setInterval(refreshSnapshot, 3 * 60_000);

    // Når fanen blir synlig igjen, hent ferskt umiddelbart.
    const onVisibility = () => {
      if (!document.hidden) {
        loadAlerts();
        loadNetatmo();
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
      clearInterval(n);
      clearInterval(c);
      clearInterval(t);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [fetchAlerts, fetchNetatmo, router, paused]);

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


  // Merk: vi viser Steintavlen selv om Homey er nede — Netatmo (temp/kamera)
  // og MET-varsler skal alltid vises. Kun smarthus-tiles markerer Homey-feil.
  const homeyDown = !data.ok;

  // ---- Temperaturer fra Netatmo værstasjon (Tollnes) ----
  const ns = liveNetatmo.ok ? liveNetatmo : null;
  const modules: WeatherModule[] = ns?.modules ?? [];

  // Hovedmodulen (NAMain) = inne i hovedplan, har temp + CO2 + lyd
  const mainModule = modules.find((m) => m.type === "NAMain") ?? null;
  // Utemodul (NAModule1)
  const outdoorModule = modules.find((m) => m.type === "NAModule1") ?? null;
  // Soverom: ekstra innemodul (NAModule4) — finn én med "sov" i navnet, ellers første NAModule4
  const bedroomModule =
    modules.find(
      (m) => m.type === "NAModule4" && /sov|sove|bed/i.test(m.name),
    ) ??
    modules.find((m) => m.type === "NAModule4") ??
    null;

  const tempInneLive = mainModule?.metrics.temperature ?? null;
  const tempSovLive = bedroomModule?.metrics.temperature ?? null;
  const tempUteLive = outdoorModule?.metrics.temperature ?? null;
  const noiseDb = mainModule?.metrics.noise ?? null;
  const co2Inne = mainModule?.metrics.co2 ?? null;
  const humInne = mainModule?.metrics.humidity ?? null;
  const humUte = outdoorModule?.metrics.humidity ?? null;

  // Stabiliser tallene: vis siste kjente gode verdi når en poll feiler / returnerer tom
  const inneLG = useLastGood("st.lg.inne", tempInneLive);
  const sovLG = useLastGood("st.lg.sov", tempSovLive);
  const uteLG = useLastGood("st.lg.ute", tempUteLive);
  const tempInne = inneLG.value;
  const tempSov = sovLG.value;
  const tempUte = uteLG.value;

  // ---- Daglig min/maks (lagres i localStorage, resettes ved døgnskifte) ----
  const innerMM = useDailyMinMax("st.mm.inne", tempInne);
  const sovMM = useDailyMinMax("st.mm.sov", tempSov);
  const uteMM = useDailyMinMax("st.mm.ute", tempUte);
  const noiseMM = useDailyMinMax("st.mm.noise", noiseDb);

  // Auto-recovery: hvis temperatur mangler (—) men vi har min/maks lagret fra
  // tidligere i dag, betyr det at Netatmo-pollen returnerte tom modul. Prøv å
  // hente på nytt med kort backoff i stedet for å vente i 5 minutter.
  const tempMissing =
    (tempInneLive === null && innerMM !== null) ||
    (tempUteLive === null && uteMM !== null) ||
    (tempSovLive === null && sovMM !== null);
  useEffect(() => {
    if (!tempMissing || paused) return;
    let cancelled = false;
    let attempt = 0;
    const tryRefetch = async () => {
      if (cancelled || attempt >= 3) return;
      attempt++;
      try {
        const res = await fetchNetatmo({ data: { stationMatch: "tollnes" } });
        if (!cancelled) setLiveNetatmo(res);
      } catch {
        /* ignore */
      }
    };
    // Forsøk: 5s, 20s, 60s
    const t1 = setTimeout(tryRefetch, 5_000);
    const t2 = setTimeout(tryRefetch, 20_000);
    const t3 = setTimeout(tryRefetch, 60_000);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [tempMissing, fetchNetatmo]);

  // ---- Varsler ----
  const thunderAlerts =
    alerts?.ok === true ? alerts.alerts.filter((a) => a.isThunder) : [];
  const otherAlerts =
    alerts?.ok === true ? alerts.alerts.filter((a) => !a.isThunder) : [];
  const hasThunder = thunderAlerts.length > 0;

  const hasNoise = noiseDb !== null;

  return (
    <PageShell minimalHeader>
      <header className="container mx-auto px-6 pt-3 pb-2 text-center">
        <div className="text-display tracking-[0.5em] text-primary text-xs sm:text-sm uppercase">
          Steintavlen · Tollnes ·{" "}
          <span className="text-muted-foreground">
            {now
              ? now.toLocaleTimeString("nb-NO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </span>
        </div>
      </header>

      {hasThunder && (
        <div className="container mx-auto px-4 sm:px-6 mb-2">
          <ThunderBanner alerts={thunderAlerts} />
        </div>
      )}

      <main className="container mx-auto px-3 sm:px-4 pb-3">
        {/* Øverste rad: temperaturer + lyd + lysstyring (iPad-vennlig, ingen scroll) */}
        <section
          className={`grid gap-2 sm:gap-3 mb-3 ${
            hasNoise
              ? "grid-cols-3 sm:grid-cols-3 lg:grid-cols-5"
              : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
          }`}
        >
          <BigTemp
            label="Inne"
            temp={tempInne}
            mm={innerMM}
            accent="primary"
            sub={
              co2Inne !== null || humInne !== null
                ? `${humInne !== null ? `${Math.round(humInne)}% fukt` : ""}${
                    co2Inne !== null && humInne !== null ? " · " : ""
                  }${co2Inne !== null ? `${co2Inne} ppm` : ""}`
                : undefined
            }
          />
          <BigTemp
            label="Soverom"
            temp={tempSov}
            mm={sovMM}
            accent="primary"
            sub={
              bedroomModule?.metrics.humidity !== undefined
                ? `${Math.round(bedroomModule.metrics.humidity!)}% fukt`
                : undefined
            }
          />
          <BigTemp
            label="Ute · Tollnes"
            temp={tempUte}
            mm={uteMM}
            accent="ice"
            big
            sub={humUte !== null ? `${Math.round(humUte)}% fukt` : undefined}
          />
          {hasNoise && (
            <BigNoise label="Lyd · Tollnes" db={noiseDb!} mm={noiseMM} />
          )}
          {!homeyDown && (
            <LightsControl
              on={lightsOn}
              busy={lightsBusy}
              onSet={handleSetLights}
            />
          )}
        </section>

        {/* Nederste rad: kamera + (varmepumpe + taklampe når Homey er oppe) */}
        <section
          className={`grid gap-3 ${homeyDown ? "" : "lg:grid-cols-3"}`}
        >
          <div className="panel rounded-lg overflow-hidden flex flex-col lg:col-span-1">
            <div className="px-4 py-2 border-b border-border flex items-center justify-between">
              <span className="text-display tracking-[0.3em] text-primary text-[10px] sm:text-xs uppercase">
                Vakttårnet · Live
              </span>
              <span className="text-[9px] tracking-[0.25em] text-muted-foreground/70 uppercase">
                Netatmo
              </span>
            </div>
            <div className="flex-1">
              <TollnesCameraStrip
                intervalMs={5000}
                aspectClass="aspect-video"
                compact
              />
            </div>
          </div>

          {!homeyDown && (
            <LivingRoomProvider>
              <HeatPumpTile />
              <CeilingLampTile />
            </LivingRoomProvider>
          )}

          {homeyDown && (
            <div className="panel rounded-lg p-4 lg:col-span-2 flex flex-col items-center justify-center text-center">
              <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-2">
                Smarthus · sover
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ravnene til Homey svarer ikke akkurat nå
                {!data.ok && data.error ? ` (${data.error})` : ""}.
                Netatmo og varslene fungerer som vanlig.
              </p>
              <a
                href="/smarthus"
                className="mt-2 text-xs tracking-[0.25em] uppercase text-primary underline"
              >
                Bind ravnene på nytt
              </a>
            </div>
          )}
        </section>

        {otherAlerts.length > 0 && (
          <section className="mt-3 panel rounded-lg px-3 py-2 space-y-1">
            <div className="text-[9px] tracking-[0.3em] text-primary uppercase mb-1">
              Andre varsler
            </div>
            {otherAlerts.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-[11px]">
                <span
                  className="mt-1 w-2 h-2 rounded-full shrink-0"
                  style={{ background: alertColor(a.awarenessColor) }}
                />
                <div className="flex-1 truncate">
                  <span className="text-foreground">{a.title}</span>
                  {a.area && (
                    <span className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase ml-2">
                      · {a.area}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
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
  sub,
}: {
  label: string;
  temp: number | null;
  mm: MinMax;
  accent?: "primary" | "ice";
  big?: boolean;
  sub?: string;
}) {
  const color = accent === "ice" ? "var(--ice)" : "var(--primary)";
  return (
    <article
      className="panel rounded-lg p-3 sm:p-4 text-center flex flex-col items-center justify-center"
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
        className={`text-display leading-none mt-1.5 ${
          big
            ? "text-4xl sm:text-5xl md:text-6xl"
            : "text-3xl sm:text-4xl md:text-5xl"
        }`}
        style={{ color }}
      >
        {temp !== null ? `${temp.toFixed(1)}°` : "—"}
      </div>
      <MinMaxRow mm={mm} unit="°" />
      {sub && (
        <div className="text-[9px] sm:text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase mt-1.5">
          {sub}
        </div>
      )}
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
