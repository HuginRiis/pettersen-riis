import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { LastUpdated } from "@/components/LastUpdated";
import { getHomeySnapshot, disconnectHomey, setAllOutdoorLights } from "@/server/homey";
import { findDeviceFuzzy, readTemp } from "@/lib/homey-match";
import { HomeyApiActivity } from "@/components/HomeyApiActivity";
import { HomeyApiPauseToggle } from "@/components/HomeyApiPauseToggle";
import { HeatersPanel } from "@/components/HeatersPanel";
import { StuaConditionPanel } from "@/components/StuaConditionPanel";

import { recordHomeyApiCall } from "@/lib/homey-api-tracker";
import heroImg from "@/assets/got-smarthus.jpg";

export const Route = createFileRoute("/smarthus")({
  head: () => ({
    meta: [
      { title: "Borgens Smarthus | House Pettersen-Riis" },
      {
        name: "description",
        content: "Borgens Smarthus — oversikt over alle Homey-enhetene i huset.",
      },
      { property: "og:title", content: "Borgens Smarthus" },
      { property: "og:description", content: "Husets smarthus, drevet av Homey." },
    ],
  }),
  // Cache i 3 minutter for å spare Homey API-kall
  staleTime: 3 * 60_000,
  preloadStaleTime: 3 * 60_000,
  loader: async () => {
    const res = await getHomeySnapshot();
    recordHomeyApiCall();
    return res;
  },
  component: SmarthusPage,
  errorComponent: ({ error }) => (
    <PageShell>
      <PageHero
        eyebrow="Mørke i borgen"
        title="Borgens Smarthus"
        subtitle="Ravnene fra Homey nådde ikke fram."
        image={heroImg}
      />
      <section className="container mx-auto px-4 py-12">
        <div className="panel rounded-lg p-6">
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </section>
    </PageShell>
  ),
});

const CLASS_LABEL: Record<string, string> = {
  light: "Ildsted",
  socket: "Stikk",
  sensor: "Varsler",
  thermostat: "Varmemester",
  heater: "Ovn",
  curtain: "Forheng",
  blinds: "Forheng",
  lock: "Portvokter",
  speaker: "Høyttaler",
  tv: "Skjerm",
  doorbell: "Klokkeren",
  button: "Knapp",
  windowcoverings: "Forheng",
  fan: "Vifte",
  other: "Tjener",
};

function classifyLabel(cls?: string) {
  if (!cls) return "Tjener";
  return CLASS_LABEL[cls] ?? cls;
}

function ConnectPanel({ message }: { message?: string }) {
  return (
    <PageShell>
      <PageHero
        eyebrow="Krøniken om"
        title="Borgens Smarthus"
        subtitle="Bind ravnene til Homey for å våkne borgen."
        image={heroImg}
      />
      <HomeyApiPauseToggle />
      <section className="container mx-auto px-4 py-12">
        <div className="panel rounded-lg p-8 max-w-2xl mx-auto text-center">
          <h2 className="text-display text-primary text-xl mb-3 tracking-[0.25em]">
            INGEN BÅND TIL HOMEY
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {message ?? "For å våkne borgen må du binde den til din Homey-konto via Athom."}
          </p>
          <a
            href="/api/homey/start"
            className="inline-block px-6 py-3 rounded border border-primary text-primary text-sm tracking-[0.3em] uppercase hover:bg-primary/10 transition-colors"
          >
            ✦ Bind ravnene til Homey
          </a>
          <p className="text-xs text-muted-foreground mt-6">
            Du sendes til Athom for å gi tilgang. Tokens lagres trygt på serveren.
          </p>
        </div>
      </section>
    </PageShell>
  );
}

function SmarthusPage() {
  const data = Route.useLoaderData() as Awaited<ReturnType<typeof getHomeySnapshot>>;
  const router = useRouter();
  const disconnect = useServerFn(disconnectHomey);
  const toggleOutdoorLights = useServerFn(setAllOutdoorLights);
  const [disconnecting, setDisconnecting] = useState(false);
  const [togglingLights, setTogglingLights] = useState(false);
  const [lightsMessage, setLightsMessage] = useState<string | null>(null);
  const [homeyUpdated, setHomeyUpdated] = useState<Date | null>(null);

  // Hver gang loader-data endres (etter router.invalidate) — merk tidspunktet.
  useEffect(() => {
    setHomeyUpdated(new Date());
  }, [data]);

  if (!data.ok) {
    return <ConnectPanel message={data.needsConnect ? undefined : data.error} />;
  }

  const zoneById = new Map(data.zones.map((z) => [z.id, z]));
  const grouped = new Map<string, typeof data.devices>();
  for (const d of data.devices) {
    const key = d.zone ?? "__no_zone__";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(d);
  }

  const zoneEntries = Array.from(grouped.entries()).sort((a, b) => {
    if (a[0] === "__no_zone__") return 1;
    if (b[0] === "__no_zone__") return -1;
    const an = zoneById.get(a[0])?.name ?? "";
    const bn = zoneById.get(b[0])?.name ?? "";
    return an.localeCompare(bn, "nb");
  });

  const totalDevices = data.devices.length;
  const lights = data.devices.filter(
    (d) => "onoff" in d.capabilities && (d.class === "light" || d.class === "socket"),
  );
  const litLights = lights.filter((d) => d.capabilities["onoff"]?.value === true).length;

  const totalPower = data.devices
    .map((d) => d.capabilities["measure_power"]?.value)
    .filter((v): v is number => typeof v === "number")
    .reduce((a, b) => a + b, 0);

  // Effekt per sone
  const powerByZone = new Map<string, number>();
  for (const d of data.devices) {
    const p = d.capabilities["measure_power"]?.value;
    if (typeof p !== "number") continue;
    const key = d.zone ?? "__no_zone__";
    powerByZone.set(key, (powerByZone.get(key) ?? 0) + p);
  }

  const findZonePower = (matcher: (name: string) => boolean) => {
    let total = 0;
    let matched = false;
    for (const [zoneKey, watts] of powerByZone.entries()) {
      const name = zoneById.get(zoneKey)?.name ?? "";
      if (matcher(name.toLowerCase())) {
        total += watts;
        matched = true;
      }
    }
    return matched ? total : null;
  };

  const hyttaPower = findZonePower((n) => n.includes("hytt"));
  const hjemmePower =
    findZonePower((n) => n.includes("hjem") || n.includes("borg") || n.includes("hus")) ??
    (hyttaPower !== null ? totalPower - hyttaPower : totalPower);

  // Pulse-måler (Tibber Pulse / strømmåler på hytta — Øvre Bjørkesetvegen 12).
  // Vi krever bjørkeset/hytt for å unngå å plukke opp Pulse Tollnes ved en feil.
  const pulseDevice = data.devices.find((d) => {
    const n = (d.name ?? "").toLowerCase();
    const isPulse = n.includes("pulse") || n.includes("tibber");
    const isHytta =
      n.includes("bjørkeset") || n.includes("bjorkeset") || n.includes("hytt");
    return isPulse && isHytta;
  });

  // Tibber Pulse eksponerer effekt via flere mulige capability-id'er.
  // Vi prøver kjente først, faller deretter tilbake til den første cap'en
  // som inneholder "power" (f.eks. measure_power.consumed) og har et tall.
  const readCapNumber = (capId: string): number | null => {
    const v = pulseDevice?.capabilities[capId]?.value;
    return typeof v === "number" ? v : null;
  };
  const findFirstNumber = (predicate: (id: string) => boolean): number | null => {
    if (!pulseDevice) return null;
    for (const [capId, cap] of Object.entries(pulseDevice.capabilities)) {
      if (predicate(capId.toLowerCase()) && typeof cap.value === "number") {
        return cap.value as number;
      }
    }
    return null;
  };

  const pulsePower =
    readCapNumber("measure_power") ??
    readCapNumber("measure_power.consumed") ??
    readCapNumber("measure_power.delivered") ??
    findFirstNumber((id) => id.startsWith("measure_power")) ??
    findFirstNumber((id) => id.includes("power") && !id.includes("meter"));

  // Forbruk i dag (kWh) — Tibber bruker ofte meter_power.* varianter
  const pulseToday =
    readCapNumber("meter_power") ??
    readCapNumber("meter_power.consumed") ??
    readCapNumber("meter_power.today") ??
    findFirstNumber((id) => id.startsWith("meter_power"));

  const LOW_BATTERY_THRESHOLD = 20;
  const lowBatteries = data.devices.filter((d) => {
    const b = d.capabilities["measure_battery"]?.value;
    return typeof b === "number" && b <= LOW_BATTERY_THRESHOLD;
  });

  const tempReadings = data.devices
    .map((d) => d.capabilities["measure_temperature"]?.value)
    .filter((v): v is number => typeof v === "number");
  const avgTemp =
    tempReadings.length > 0
      ? (tempReadings.reduce((a, b) => a + b, 0) / tempReadings.length).toFixed(1)
      : null;

  const formatPower = (w: number) =>
    w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`;

  // Temperaturer per rom — alle enheter med measure_temperature
  type RoomTemp = {
    deviceId: string;
    deviceName: string;
    zoneName: string;
    temp: number;
  };

  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+/g, " ").trim();

  // Eksplisitte ute-sensorer — krever measure_temperature, og helst at
  // navn/sone inneholder "ute" / "hytt".
  const hasTemp = (d: any) =>
    typeof d?.capabilities?.["measure_temperature"]?.value === "number";

  const outdoorTollnesDevice =
    findDeviceFuzzy(
      data.devices,
      data.zones,
      "ute tollnes",
      (d, c) => hasTemp(d) && c.includes("ute"),
    ) ??
    findDeviceFuzzy(data.devices, data.zones, "tollnes ute", (d) => hasTemp(d)) ??
    findDeviceFuzzy(data.devices, data.zones, "ute", (d, c) => hasTemp(d) && !c.includes("hytt"));

  const outdoorHyttaDevice =
    findDeviceFuzzy(
      data.devices,
      data.zones,
      "hytta ute",
      (d, c) => hasTemp(d) && c.includes("hytt") && c.includes("ute"),
    ) ??
    findDeviceFuzzy(data.devices, data.zones, "hytt ute", (d) => hasTemp(d)) ??
    findDeviceFuzzy(data.devices, data.zones, "ute hytt", (d) => hasTemp(d));

  const outdoorTollnesTemp = readTemp(outdoorTollnesDevice);
  const outdoorHyttaTemp = readTemp(outdoorHyttaDevice);

  const excludedOutdoorIds = new Set(
    [outdoorTollnesDevice?.id, outdoorHyttaDevice?.id].filter(Boolean) as string[],
  );

  // Alle inne-termometre — vis hver sensor for seg, så bruker ser kilden.
  // (Tidligere foretrakk vi Netatmo, men den kan være unøyaktig.)
  const indoorTemps: RoomTemp[] = [];
  for (const d of data.devices) {
    if (excludedOutdoorIds.has(d.id)) continue;
    const t = d.capabilities["measure_temperature"]?.value;
    if (typeof t !== "number") continue;
    const zoneName = d.zone ? zoneById.get(d.zone)?.name ?? "Ukjent" : "Ukjent";
    indoorTemps.push({
      deviceId: d.id,
      deviceName: d.name,
      zoneName,
      temp: t,
    });
  }
  indoorTemps.sort((a, b) => {
    const z = a.zoneName.localeCompare(b.zoneName, "nb");
    if (z !== 0) return z;
    return a.deviceName.localeCompare(b.deviceName, "nb");
  });

  // CO2-sensorer (Netatmo). Finn Hytte og Tollnes.
  const co2Devices = data.devices.filter((d) => {
    const v = d.capabilities["measure_co2"]?.value;
    return typeof v === "number";
  });

  const findCo2 = (matcher: (combined: string) => boolean) => {
    const hit = co2Devices.find((d) => {
      const zoneName = d.zone ? zoneById.get(d.zone)?.name ?? "" : "";
      const combined = `${d.name} ${zoneName}`.toLowerCase();
      return matcher(combined);
    });
    if (!hit) return null;
    return {
      device: hit,
      zoneName: hit.zone ? zoneById.get(hit.zone)?.name ?? "" : "",
      value: hit.capabilities["measure_co2"]?.value as number,
    };
  };

  const co2Hytta = findCo2((c) => c.includes("hytt"));
  const co2Tollnes = findCo2(
    (c) => c.includes("tollnes") || c.includes("skien") || (!c.includes("hytt") && c.includes("netatmo")),
  );

  const handleDisconnect = async () => {
    if (!confirm("Bryt båndet til Homey?")) return;
    setDisconnecting(true);
    try {
      await disconnect();
      await router.invalidate();
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggleOutdoorLights = async (on: boolean) => {
    setTogglingLights(true);
    setLightsMessage(null);
    try {
      const res = await toggleOutdoorLights({ data: { on } });
      recordHomeyApiCall();
      if (res.ok) {
        setLightsMessage(
          on
            ? `✦ Tente ${res.toggled} utelys`
            : `○ Slokte ${res.toggled} utelys`,
        );
        await router.invalidate();
      } else {
        setLightsMessage(res.error ?? "Klarte ikke styre lysene");
      }
    } catch (e: any) {
      setLightsMessage(e?.message ?? "Klarte ikke styre lysene");
    } finally {
      setTogglingLights(false);
      setTimeout(() => setLightsMessage(null), 4000);
    }
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Krøniken om"
        title="Borgens Smarthus"
        subtitle={
          data.homeName
            ? `${data.homeName} — husets smarthus, voktet av ravnene fra Homey.`
            : "Husets smarthus, voktet av ravnene fra Homey."
        }
        image={heroImg}
      />

      <section className="container mx-auto px-4 pt-6 flex justify-center">
        <LastUpdated label="Homey" timestamp={homeyUpdated} />
      </section>
      <HomeyApiPauseToggle />

      <section className="container mx-auto px-4 pt-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Tjenere" value={String(totalDevices)} />
          <Stat label="Saler" value={String(zoneEntries.length)} />
          <Stat
            label="Tente ildsteder"
            value={`${litLights} / ${lights.length}`}
            hint={litLights > 0 ? "Lyset brenner" : "Mørke i salene"}
            tone={litLights > 0 ? "primary" : "muted"}
          />
          <Stat
            label="Effekt · Hjemme"
            value={hjemmePower > 0 ? formatPower(hjemmePower) : "—"}
            hint="Borgen · sanntid"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat
            label="Effekt · Hytta"
            value={
              hyttaPower !== null && hyttaPower > 0
                ? formatPower(hyttaPower)
                : hyttaPower === null
                  ? "—"
                  : "0 W"
            }
            hint={hyttaPower === null ? "Ingen Hytta-sone funnet" : "Fjellet · sanntid"}
            tone={hyttaPower === null ? "muted" : "default"}
          />
          <Stat
            label="Effekt · Totalt"
            value={totalPower > 0 ? formatPower(totalPower) : "—"}
            hint="Alle saler"
          />
          {pulseDevice && (
            <Stat
              label="Pulse · Hytta"
              value={pulsePower !== null ? formatPower(Math.abs(pulsePower)) : "—"}
              hint={
                pulsePower === null
                  ? "Ingen avlesning"
                  : pulsePower < 0
                    ? `↑ Tjener på strøm${pulseToday !== null ? ` · ${pulseToday.toFixed(1)} kWh i dag` : ""}`
                    : `↓ Bruker strøm${pulseToday !== null ? ` · ${pulseToday.toFixed(1)} kWh i dag` : ""}`
              }
              tone={pulsePower !== null && pulsePower < 0 ? "primary" : "default"}
            />
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Snitt-varme" value={avgTemp ? `${avgTemp}°` : "—"} />
          <Stat
            label="Lave batterier"
            value={String(lowBatteries.length)}
            hint={
              lowBatteries.length === 0
                ? "Alle fulle"
                : `≤ ${LOW_BATTERY_THRESHOLD}% — bør byttes`
            }
            tone={lowBatteries.length > 0 ? "warning" : "muted"}
          />
          {lowBatteries.length > 0 && (
            <div className="panel rounded-lg p-4 col-span-2 md:col-span-2">
              <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-2">
                Trenger nye batterier
              </div>
              <ul className="text-sm space-y-1 max-h-28 overflow-auto">
                {lowBatteries
                  .sort(
                    (a, b) =>
                      (a.capabilities["measure_battery"]?.value as number) -
                      (b.capabilities["measure_battery"]?.value as number),
                  )
                  .map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-foreground">{d.name}</span>
                      <span className="text-destructive shrink-0">
                        🔋 {Math.round(d.capabilities["measure_battery"]?.value as number)}%
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Ute-temperaturer (Tollnes + Hytta) */}
      <section className="container mx-auto px-4 pt-10">
        <div className="grid sm:grid-cols-2 gap-4">
          <OutdoorTempCard
            label="Ute · Tollnes"
            sourceName={outdoorTollnesDevice?.name ?? "Ute Tollnes"}
            temp={outdoorTollnesTemp}
          />
          <OutdoorTempCard
            label="Ute · Hytta"
            sourceName={outdoorHyttaDevice?.name ?? "Hytta Ute"}
            temp={outdoorHyttaTemp}
          />
        </div>
      </section>

      {/* CO2-bokser (Netatmo) */}
      <section className="container mx-auto px-4 pt-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <Co2Card label="CO₂ · Hytte" data={co2Hytta} />
          <Co2Card label="CO₂ · Tollnes Skien" data={co2Tollnes} />
        </div>
      </section>

      {/* Inne-termometre (én per rom) */}
      <section className="container mx-auto px-4 pt-6">
        <div className="panel rounded-lg p-6">
          <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-4">
            Termometrenes sang
          </div>
          {indoorTemps.length > 0 ? (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {indoorTemps.map((r) => (
                <li
                  key={r.deviceId}
                  className="flex flex-col py-2 px-3 rounded border border-primary/10 bg-background/40"
                >
                  <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase truncate">
                    {r.zoneName}
                  </span>
                  <span className="text-display text-primary text-xl mt-1">
                    {r.temp.toFixed(1)}°
                  </span>
                  <span className="text-[9px] text-muted-foreground/70 truncate mt-0.5" title={r.deviceName}>
                    {r.deviceName}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">Ingen inne-termometre.</p>
          )}
        </div>
      </section>

      {/* Utelys-styring i egen boks */}
      <section className="container mx-auto px-4 pt-6">
        <div className="panel rounded-lg p-6">
          <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-4">
            Vakttårnene
          </div>
          <h3 className="text-display text-primary text-lg tracking-[0.2em] mb-2">
            UTELYS
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            Tenn alle ildstedene i hagen, ved porten og på terrassen — eller la mørket falle.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
            <button
              onClick={() => handleToggleOutdoorLights(true)}
              disabled={togglingLights}
              className="px-4 py-3 rounded border border-primary text-primary text-xs tracking-[0.3em] uppercase hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              {togglingLights ? "Tenner ravnene…" : "✦ Tenn alle utelys"}
            </button>
            <button
              onClick={() => handleToggleOutdoorLights(false)}
              disabled={togglingLights}
              className="px-4 py-3 rounded border border-muted-foreground/30 text-muted-foreground text-xs tracking-[0.3em] uppercase hover:bg-muted/30 transition-colors disabled:opacity-50"
            >
              ○ Slokk alle utelys
            </button>
          </div>
          {lightsMessage && (
            <p className="text-xs text-muted-foreground italic mt-4">{lightsMessage}</p>
          )}
        </div>
      </section>

      <HeatersPanel
        location="borg"
        title="Varmemestrene · Borgen"
        emptyHint="Ingen varmeovner med termostat funnet for Borgen i Homey."
      />


      <section className="container mx-auto px-4 py-12 space-y-12">
        {zoneEntries.map(([zoneKey, devices]) => {
          const zoneName =
            zoneKey === "__no_zone__"
              ? "Ukjent sal"
              : zoneById.get(zoneKey)?.name ?? "Ukjent sal";
          return (
            <div key={zoneKey}>
              <div className="ornate-divider mb-6">
                <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
                  {zoneName}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {devices.map((d) => (
                  <DeviceCard key={d.id} device={d} />
                ))}
              </div>
            </div>
          );
        })}

      </section>

      <HomeyApiActivity />
    </PageShell>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "muted" | "warning";
}) {
  const valueClass =
    tone === "warning"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-primary";
  return (
    <div className="panel rounded-lg p-4 text-center">
      <div className={`text-2xl text-display ${valueClass}`}>{value}</div>
      <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mt-1">
        {label}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground/80 mt-1 italic">{hint}</div>
      )}
    </div>
  );
}

function DeviceCard({ device }: { device: any }) {
  const onoff = device.capabilities["onoff"]?.value;
  const dim = device.capabilities["dim"]?.value;
  const temp = device.capabilities["measure_temperature"]?.value;
  const hum = device.capabilities["measure_humidity"]?.value;
  const power = device.capabilities["measure_power"]?.value;
  const battery = device.capabilities["measure_battery"]?.value;
  const target = device.capabilities["target_temperature"]?.value;

  return (
    <article className="panel rounded-lg p-4 glow-on-hover">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-base text-foreground truncate">{device.name}</h3>
          <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-0.5">
            {classifyLabel(device.class)}
          </div>
        </div>
        {device.available === false && (
          <span className="text-[10px] uppercase tracking-widest text-destructive">Stum</span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {typeof onoff === "boolean" && (
          <span className={onoff ? "text-primary" : ""}>{onoff ? "✦ Tent" : "○ Slokt"}</span>
        )}
        {typeof dim === "number" && <span>◐ {Math.round(dim * 100)}%</span>}
        {typeof temp === "number" && <span>🌡 {temp.toFixed(1)}°C</span>}
        {typeof target === "number" && <span>🎯 {target.toFixed(1)}°C</span>}
        {typeof hum === "number" && <span>💧 {hum.toFixed(0)}%</span>}
        {typeof power === "number" && <span>⚡ {power.toFixed(0)} W</span>}
        {typeof battery === "number" && <span>🔋 {battery.toFixed(0)}%</span>}
      </div>
    </article>
  );
}

function OutdoorTempCard({
  label,
  sourceName,
  temp,
}: {
  label: string;
  sourceName: string;
  temp: number | null;
}) {
  return (
    <div className="panel rounded-lg p-6">
      <div className="text-[10px] tracking-[0.3em] text-primary uppercase mb-2">{label}</div>
      <div className="flex items-end justify-between gap-4">
        <div className="text-xs text-muted-foreground truncate">{sourceName}</div>
        <div className="text-display text-primary text-5xl sm:text-6xl shrink-0 leading-none">
          {temp !== null ? `${temp.toFixed(1)}°` : "—"}
        </div>
      </div>
      {temp === null && (
        <p className="text-xs text-muted-foreground italic mt-3">
          Sensoren «{sourceName}» ble ikke funnet i Homey.
        </p>
      )}
    </div>
  );
}

function Co2Card({
  label,
  data,
}: {
  label: string;
  data: { device: any; zoneName: string; value: number } | null;
}) {
  const tone =
    data === null
      ? "muted"
      : data.value < 1000
        ? "primary"
        : data.value < 1500
          ? "default"
          : "warning";
  const valueClass =
    tone === "warning"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-primary";
  const status =
    data === null
      ? "Ingen Netatmo-CO₂-sensor funnet"
      : data.value < 1000
        ? "Frisk luft"
        : data.value < 1500
          ? "Litt tett"
          : "Luft ut!";
  return (
    <div className="panel rounded-lg p-6">
      <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mb-2">
        {label}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {data && (
            <div className="text-xs text-muted-foreground truncate">{data.device.name}</div>
          )}
          <div className="text-[10px] tracking-[0.25em] text-muted-foreground/80 uppercase mt-1 italic">
            {status}
          </div>
        </div>
        <div className={`text-display ${valueClass} text-4xl sm:text-5xl shrink-0 leading-none`}>
          {data !== null ? Math.round(data.value) : "—"}
          <span className="text-xs tracking-[0.25em] ml-2 align-middle">PPM</span>
        </div>
      </div>
    </div>
  );
}
