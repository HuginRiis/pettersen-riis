import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Swords, Shield, Flame, DoorOpen, Lightbulb, Zap, Crown, ChevronDown } from "lucide-react";
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
  // Kun Philips Hue-lyspærer — identifiser via driverUri/navn (kontakter o.l. holdes utenfor)
  const isHueLight = (d: typeof data.devices[number]) => {
    if (d.class !== "light") return false;
    if (!("onoff" in d.capabilities)) return false;
    const driver = (d.driverUri ?? "").toLowerCase();
    const name = (d.name ?? "").toLowerCase();
    return driver.includes("hue") || driver.includes("philips") || name.includes("hue");
  };
  const lights = data.devices.filter(isHueLight);
  const litLights = lights.filter((d) => d.capabilities["onoff"]?.value === true).length;
  const litLightsList = lights
    .filter((d) => d.capabilities["onoff"]?.value === true)
    .map((d) => ({
      id: d.id,
      name: d.name,
      zoneName: d.zone ? zoneById.get(d.zone)?.name ?? "Ukjent sal" : "Ukjent sal",
      dim: typeof d.capabilities["dim"]?.value === "number"
        ? (d.capabilities["dim"]?.value as number)
        : null,
      power: typeof d.capabilities["measure_power"]?.value === "number"
        ? (d.capabilities["measure_power"]?.value as number)
        : null,
    }));

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

  // Stua-tilstand: finn Netatmo-sensor i stua. Vi prefererer en enhet som
  // har både CO₂ og temperatur (typisk Netatmo NAMain/NAModule4 i stua).
  const stuaDevice =
    data.devices.find((d) => {
      const zoneName = d.zone ? zoneById.get(d.zone)?.name ?? "" : "";
      const combined = `${d.name} ${zoneName}`.toLowerCase();
      const inStua = combined.includes("stue") || combined.includes("stua") || combined.includes("living");
      const hasCo2 = typeof d.capabilities["measure_co2"]?.value === "number";
      const hasTemp = typeof d.capabilities["measure_temperature"]?.value === "number";
      return inStua && hasCo2 && hasTemp && !combined.includes("hytt");
    }) ??
    data.devices.find((d) => {
      const zoneName = d.zone ? zoneById.get(d.zone)?.name ?? "" : "";
      const combined = `${d.name} ${zoneName}`.toLowerCase();
      const inStua = combined.includes("stue") || combined.includes("stua");
      const hasTemp = typeof d.capabilities["measure_temperature"]?.value === "number";
      return inStua && hasTemp && !combined.includes("hytt");
    });

  const stuaTemp =
    typeof stuaDevice?.capabilities["measure_temperature"]?.value === "number"
      ? (stuaDevice.capabilities["measure_temperature"].value as number)
      : null;
  const stuaHum =
    typeof stuaDevice?.capabilities["measure_humidity"]?.value === "number"
      ? (stuaDevice.capabilities["measure_humidity"].value as number)
      : null;
  const stuaCo2 =
    typeof stuaDevice?.capabilities["measure_co2"]?.value === "number"
      ? (stuaDevice.capabilities["measure_co2"].value as number)
      : null;
  const stuaSourceName = stuaDevice
    ? `${stuaDevice.name}${stuaDevice.zone ? ` · ${zoneById.get(stuaDevice.zone)?.name ?? ""}` : ""}`
    : null;

  // Generisk room finder — søker både i navn og sone, krever measure_temperature,
  // ekskluderer hytta. Foretrekker enheter med CO₂ + fukt om mulig.
  const findRoomDevice = (matchers: string[]) => {
    const matches = (combined: string) => matchers.some((m) => combined.includes(m));
    // 1) ideell: temp + fukt + co2
    const ideal = data.devices.find((d) => {
      const zoneName = d.zone ? zoneById.get(d.zone)?.name ?? "" : "";
      const combined = `${d.name} ${zoneName}`.toLowerCase();
      return (
        matches(combined) &&
        !combined.includes("hytt") &&
        typeof d.capabilities["measure_temperature"]?.value === "number" &&
        typeof d.capabilities["measure_humidity"]?.value === "number" &&
        typeof d.capabilities["measure_co2"]?.value === "number"
      );
    });
    if (ideal) return ideal;
    // 2) temp + fukt
    const tempHum = data.devices.find((d) => {
      const zoneName = d.zone ? zoneById.get(d.zone)?.name ?? "" : "";
      const combined = `${d.name} ${zoneName}`.toLowerCase();
      return (
        matches(combined) &&
        !combined.includes("hytt") &&
        typeof d.capabilities["measure_temperature"]?.value === "number" &&
        typeof d.capabilities["measure_humidity"]?.value === "number"
      );
    });
    if (tempHum) return tempHum;
    // 3) bare temp
    return data.devices.find((d) => {
      const zoneName = d.zone ? zoneById.get(d.zone)?.name ?? "" : "";
      const combined = `${d.name} ${zoneName}`.toLowerCase();
      return (
        matches(combined) &&
        !combined.includes("hytt") &&
        typeof d.capabilities["measure_temperature"]?.value === "number"
      );
    });
  };

  const readRoom = (device: typeof stuaDevice) => {
    if (!device) return { temperature: null, humidity: null, co2: null, sourceName: null };
    const t = device.capabilities["measure_temperature"]?.value;
    const h = device.capabilities["measure_humidity"]?.value;
    const c = device.capabilities["measure_co2"]?.value;
    return {
      temperature: typeof t === "number" ? t : null,
      humidity: typeof h === "number" ? h : null,
      co2: typeof c === "number" ? c : null,
      sourceName: `${device.name}${device.zone ? ` · ${zoneById.get(device.zone)?.name ?? ""}` : ""}`,
    };
  };

  const kontorDevice = findRoomDevice(["kontor", "office"]);
  const soveromDevice = findRoomDevice([
    "arne og rebekka",
    "arne & rebekka",
    "soverom arne",
    "hovedsoverom",
    "master",
    "soverom",
  ]);
  const kontorReadings = readRoom(kontorDevice);
  const soveromReadings = readRoom(soveromDevice);


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

      <StuaConditionPanel
        temperature={stuaTemp}
        humidity={stuaHum}
        co2={stuaCo2}
        sourceName={stuaSourceName}
      />

      {(kontorDevice || soveromDevice) && (
        <section className="container mx-auto px-4 pt-4 sm:pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {kontorDevice && (
              <StuaConditionPanel
                bare
                title="Kontorets tilstand"
                temperature={kontorReadings.temperature}
                humidity={kontorReadings.humidity}
                co2={kontorReadings.co2}
                sourceName={kontorReadings.sourceName}
                tempRange={{
                  goodMin: 20,
                  goodMax: 25,
                  okBelow: 18,
                  okAbove: 26,
                  normLabel: "20–25 °C",
                }}
              />
            )}
            {soveromDevice && (
              <StuaConditionPanel
                bare
                title="Arne & Rebekkas soverom"
                temperature={soveromReadings.temperature}
                humidity={soveromReadings.humidity}
                co2={soveromReadings.co2}
                sourceName={soveromReadings.sourceName}
                tempRange={{
                  goodMin: 13,
                  goodMax: 20,
                  okBelow: 11,
                  okAbove: 22,
                  normLabel: "13–20 °C",
                }}
              />
            )}
          </div>
        </section>
      )}

      <section className="container mx-auto px-4 pt-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Tjenere" value={String(totalDevices)} />
          <Stat label="Saler" value={String(zoneEntries.length)} />
          <Stat
            label="Tente Hue-lys"
            value={`${litLights} / ${lights.length}`}
            hint={litLights > 0 ? "Se boks under" : "Mørke i salene"}
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

      {/* Tente Hue-lyspærer — egen prominent boks, alltid synlig når noe brenner */}
      {litLightsList.length > 0 && (
        <section className="container mx-auto px-4 pt-8">
          <div
            className="panel rounded-lg p-6"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--gold) 8%, transparent), var(--gradient-iron))",
              borderColor: "color-mix(in oklab, var(--gold) 30%, transparent)",
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
              <div className="flex items-center gap-3">
                <Flame
                  size={20}
                  className="text-primary"
                  style={{
                    filter:
                      "drop-shadow(0 0 8px color-mix(in oklab, var(--gold) 70%, transparent))",
                  }}
                />
                <div>
                  <div className="text-display text-primary text-base sm:text-lg tracking-[0.2em] uppercase">
                    Tente ildsteder
                  </div>
                  <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-0.5">
                    Philips Hue · {litLightsList.length} lys brenner i borgen
                  </div>
                </div>
              </div>
              <span className="text-[10px] tracking-[0.3em] text-primary/80 uppercase border border-primary/30 rounded px-2 py-1">
                {litLightsList.length} / {lights.length}
              </span>
            </div>
            {(() => {
              const byZone = new Map<string, typeof litLightsList>();
              for (const l of litLightsList) {
                const arr = byZone.get(l.zoneName) ?? [];
                arr.push(l);
                byZone.set(l.zoneName, arr);
              }
              const sortedZones = Array.from(byZone.entries()).sort((a, b) =>
                a[0].localeCompare(b[0], "nb"),
              );
              return (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedZones.map(([zoneName, items]) => (
                    <div
                      key={zoneName}
                      className="rounded border border-primary/15 p-3"
                      style={{
                        background:
                          "linear-gradient(180deg, color-mix(in oklab, var(--gold) 6%, transparent), transparent)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Shield size={11} className="text-primary/80" />
                        <span className="text-[10px] tracking-[0.25em] text-primary uppercase truncate">
                          {zoneName}
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {items.map((l) => (
                          <li
                            key={l.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Flame
                              size={10}
                              className="text-primary shrink-0"
                              style={{
                                filter:
                                  "drop-shadow(0 0 4px color-mix(in oklab, var(--gold) 60%, transparent))",
                              }}
                            />
                            <span className="truncate flex-1 text-foreground/90" title={l.name}>
                              {l.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                              {l.dim !== null && `${Math.round(l.dim * 100)}%`}
                              {l.power !== null && ` · ${Math.round(l.power)}W`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </section>
      )}

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

      {/* Inne-termometre — gruppert per sal */}
      <section className="container mx-auto px-4 pt-6">
        <div className="panel rounded-lg p-6">
          <div className="flex items-center gap-2 mb-5">
            <Crown size={14} className="text-primary" />
            <span className="text-[10px] tracking-[0.3em] text-primary uppercase">
              Termometrenes sang
            </span>
          </div>
          {indoorTemps.length > 0 ? (
            (() => {
              const grouped = new Map<string, typeof indoorTemps>();
              for (const t of indoorTemps) {
                const arr = grouped.get(t.zoneName) ?? [];
                arr.push(t);
                grouped.set(t.zoneName, arr);
              }
              const sortedGrouped = Array.from(grouped.entries()).sort((a, b) =>
                a[0].localeCompare(b[0], "nb"),
              );
              // Gjennomsnitt per rom for hovedtall
              const roomAverages = sortedGrouped.map(([zoneName, list]) => {
                const avg = list.reduce((a, b) => a + b.temp, 0) / list.length;
                return { zoneName, avg, list };
              });
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {roomAverages.map(({ zoneName, avg, list }) => {
                    const tone =
                      avg < 16
                        ? "cold"
                        : avg < 19
                          ? "cool"
                          : avg < 24
                            ? "warm"
                            : "hot";
                    const toneColor =
                      tone === "cold"
                        ? "color-mix(in oklab, #5fa8d3 70%, transparent)"
                        : tone === "cool"
                          ? "color-mix(in oklab, #8db7d2 60%, transparent)"
                          : tone === "warm"
                            ? "var(--gold)"
                            : "color-mix(in oklab, #d97757 80%, transparent)";
                    return (
                      <div
                        key={zoneName}
                        className="rounded border border-primary/15 p-3 flex flex-col"
                        style={{
                          background:
                            "linear-gradient(180deg, color-mix(in oklab, var(--foreground) 4%, transparent), transparent)",
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-2 min-w-0">
                          <Shield size={10} className="text-primary/70 shrink-0" />
                          <span className="text-[10px] tracking-[0.2em] text-primary uppercase truncate">
                            {zoneName}
                          </span>
                        </div>
                        <div
                          className="text-display leading-none tabular-nums"
                          style={{
                            color: toneColor,
                            fontSize: "clamp(1.5rem, 4vw, 2rem)",
                          }}
                        >
                          {avg.toFixed(1)}°
                        </div>
                        {list.length > 1 ? (
                          <div className="text-[9px] text-muted-foreground/70 mt-1 italic">
                            snitt av {list.length} sensorer
                          </div>
                        ) : (
                          <div
                            className="text-[9px] text-muted-foreground/70 mt-1 truncate"
                            title={list[0].deviceName}
                          >
                            {list[0].deviceName}
                          </div>
                        )}
                        {list.length > 1 && (
                          <ul className="mt-2 pt-2 border-t border-primary/10 space-y-0.5">
                            {list.map((r) => (
                              <li
                                key={r.deviceId}
                                className="flex items-center justify-between gap-2 text-[10px]"
                              >
                                <span
                                  className="truncate text-muted-foreground/80"
                                  title={r.deviceName}
                                >
                                  {r.deviceName}
                                </span>
                                <span className="tabular-nums text-foreground/80 shrink-0">
                                  {r.temp.toFixed(1)}°
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
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
        compact
      />

      <AllZonesPanel
        zoneEntries={zoneEntries}
        zoneById={zoneById}
        powerByZone={powerByZone}
        litLights={litLights}
        totalLights={lights.length}
      />

      <HomeyApiActivity />
    </PageShell>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  active = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "muted" | "warning";
  onClick?: () => void;
  active?: boolean;
}) {
  const valueClass =
    tone === "warning"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-primary";
  const baseClass = `panel rounded-lg p-4 text-center transition-all ${
    onClick ? "cursor-pointer hover:border-primary/40 hover:bg-primary/5" : ""
  } ${active ? "ring-1 ring-primary/40" : ""}`;
  const inner = (
    <>
      <div className={`text-2xl text-display ${valueClass}`}>{value}</div>
      <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mt-1">
        {label}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground/80 mt-1 italic">{hint}</div>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass + " w-full"}>
        {inner}
      </button>
    );
  }
  return <div className={baseClass}>{inner}</div>;
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

/* -------------------------------------------------------------------------- */
/*  AllZonesPanel — Samlet oversikt over alle saler i borgen,                  */
/*  med GoT-stil grafer (effekt per sone) og dekorative ikoner                 */
/*  (lys, lemmer, spyd, skjold).                                               */
/* -------------------------------------------------------------------------- */

function deviceIconFor(cls?: string) {
  switch (cls) {
    case "light":
      return Flame; // ildsted
    case "socket":
      return Zap; // strømstikk
    case "lock":
      return DoorOpen; // portvokter
    case "sensor":
      return Shield; // skjold = sensor
    case "heater":
    case "thermostat":
      return Crown; // varmemester
    default:
      return Swords; // spyd = ukjent tjener
  }
}

function AllZonesPanel({
  zoneEntries,
  zoneById,
  powerByZone,
  litLights,
  totalLights,
}: {
  zoneEntries: [string, any[]][];
  zoneById: Map<string, { id: string; name: string }>;
  powerByZone: Map<string, number>;
  litLights: number;
  totalLights: number;
}) {
  const [openZone, setOpenZone] = useState<string | null>(null);

  // Bygg sone-statistikk for grafer
  const zoneStats = useMemo(() => {
    return zoneEntries.map(([zoneKey, devices]) => {
      const zoneName =
        zoneKey === "__no_zone__"
          ? "Ukjent sal"
          : zoneById.get(zoneKey)?.name ?? "Ukjent sal";
      const power = powerByZone.get(zoneKey) ?? 0;
      const lights = devices.filter(
        (d) => "onoff" in d.capabilities && (d.class === "light" || d.class === "socket"),
      );
      const lit = lights.filter((d) => d.capabilities["onoff"]?.value === true).length;
      const temps = devices
        .map((d) => d.capabilities["measure_temperature"]?.value)
        .filter((v: any): v is number => typeof v === "number");
      const avgTemp =
        temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
      return {
        zoneKey,
        zoneName,
        devices,
        power,
        lit,
        lights: lights.length,
        avgTemp,
        deviceCount: devices.length,
      };
    });
  }, [zoneEntries, zoneById, powerByZone]);

  const maxPower = Math.max(1, ...zoneStats.map((z) => z.power));
  const totalDevicesAll = zoneStats.reduce((a, z) => a + z.deviceCount, 0);

  return (
    <section className="container mx-auto px-4 py-12">
      <div className="ornate-divider mb-8">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          ⚔ Borgens Saler ⚔
        </span>
      </div>

      <p className="text-center text-xs tracking-[0.25em] text-muted-foreground/80 uppercase mb-8 italic">
        «Alle borgens saler under ett tak — fra kjeller til tårn»
      </p>

      {/* Sammendrag — skjold, spyd og lys */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <BannerStat
          icon={Shield}
          label="Saler"
          value={String(zoneStats.length)}
          hint="Voktede haller"
        />
        <BannerStat
          icon={Swords}
          label="Tjenere"
          value={String(totalDevicesAll)}
          hint="Lojale enheter"
        />
        <BannerStat
          icon={Flame}
          label="Ildsteder"
          value={`${litLights}/${totalLights}`}
          hint={litLights > 0 ? "Brenner i natt" : "Mørke saler"}
          accent={litLights > 0}
        />
        <BannerStat
          icon={Zap}
          label="Strøm"
          value={
            powerByZone.size > 0
              ? `${Math.round(zoneStats.reduce((a, z) => a + z.power, 0))} W`
              : "—"
          }
          hint="Sanntid"
        />
      </div>

      {/* Effekt-graf per sone — som banner-linjer */}
      <div className="panel rounded-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-5">
          <Crown size={14} className="text-primary" />
          <span className="text-[10px] tracking-[0.3em] text-primary uppercase">
            Salens strømforbruk
          </span>
        </div>
        <div className="space-y-3">
          {zoneStats
            .filter((z) => z.power > 0)
            .sort((a, b) => b.power - a.power)
            .slice(0, 10)
            .map((z) => {
              const pct = (z.power / maxPower) * 100;
              return (
                <div key={z.zoneKey} className="flex items-center gap-3">
                  <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase truncate w-32 shrink-0">
                    {z.zoneName}
                  </div>
                  <div className="flex-1 h-3 rounded-sm overflow-hidden relative border border-primary/15"
                       style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}>
                    <div
                      className="h-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background:
                          "linear-gradient(90deg, color-mix(in oklab, var(--gold) 70%, transparent), color-mix(in oklab, var(--gold) 35%, transparent))",
                        boxShadow: "0 0 8px color-mix(in oklab, var(--gold) 40%, transparent)",
                      }}
                    />
                  </div>
                  <div className="text-xs tabular-nums text-primary w-20 text-right shrink-0">
                    {z.power >= 1000
                      ? `${(z.power / 1000).toFixed(2)} kW`
                      : `${Math.round(z.power)} W`}
                  </div>
                </div>
              );
            })}
          {zoneStats.filter((z) => z.power > 0).length === 0 && (
            <p className="text-xs text-muted-foreground italic">Ingen aktiv effekt-måling i salene.</p>
          )}
        </div>
      </div>

      {/* Sone-kort — sammenslått, kollapsbar liste */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {zoneStats.map((z) => {
          const isOpen = openZone === z.zoneKey;
          return (
            <article
              key={z.zoneKey}
              className="panel rounded-lg overflow-hidden glow-on-hover flex flex-col"
            >
              <button
                type="button"
                onClick={() => setOpenZone(isOpen ? null : z.zoneKey)}
                className="px-4 py-3 border-b border-primary/15 flex items-center justify-between gap-3 hover:bg-primary/5 transition-colors text-left"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--gold) 8%, transparent), transparent)",
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Shield
                    size={14}
                    className="text-primary shrink-0"
                    style={{ filter: "drop-shadow(0 0 4px color-mix(in oklab, var(--gold) 50%, transparent))" }}
                  />
                  <span
                    className="text-display tracking-[0.25em] text-primary text-[11px] uppercase truncate"
                    title={z.zoneName}
                  >
                    {z.zoneName}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              <div className="px-4 py-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">Tjenere</div>
                  <div className="text-display text-primary text-base">{z.deviceCount}</div>
                </div>
                <div>
                  <div className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">Lys</div>
                  <div className={`text-display text-base ${z.lit > 0 ? "text-primary" : "text-muted-foreground"}`}>
                    {z.lights > 0 ? `${z.lit}/${z.lights}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] tracking-[0.2em] text-muted-foreground uppercase">Varme</div>
                  <div className="text-display text-primary text-base">
                    {z.avgTemp !== null ? `${z.avgTemp.toFixed(1)}°` : "—"}
                  </div>
                </div>
              </div>

              {z.power > 0 && (
                <div className="px-4 pb-3 flex items-center gap-2">
                  <Zap size={11} className="text-primary/70" />
                  <div className="flex-1 h-1 rounded-full bg-primary/10 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, (z.power / maxPower) * 100)}%`,
                        background: "color-mix(in oklab, var(--gold) 60%, transparent)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {z.power >= 1000 ? `${(z.power / 1000).toFixed(1)}kW` : `${Math.round(z.power)}W`}
                  </span>
                </div>
              )}

              {isOpen && (
                <div
                  className="border-t border-primary/15 p-3 space-y-1.5 max-h-72 overflow-auto"
                  style={{ background: "color-mix(in oklab, var(--foreground) 3%, transparent)" }}
                >
                  {z.devices.map((d: any) => {
                    const Icon = deviceIconFor(d.class);
                    const onoff = d.capabilities["onoff"]?.value;
                    const dim = d.capabilities["dim"]?.value;
                    const temp = d.capabilities["measure_temperature"]?.value;
                    const power = d.capabilities["measure_power"]?.value;
                    const battery = d.capabilities["measure_battery"]?.value;
                    return (
                      <div
                        key={d.id}
                        className="flex items-center gap-2 text-xs py-1 px-2 rounded border border-transparent hover:border-primary/15"
                      >
                        <Icon
                          size={12}
                          className={onoff === true ? "text-primary shrink-0" : "text-muted-foreground shrink-0"}
                        />
                        <span className="truncate flex-1 text-foreground/90" title={d.name}>
                          {d.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {typeof onoff === "boolean" && (onoff ? "✦" : "○")}
                          {typeof dim === "number" && ` ${Math.round(dim * 100)}%`}
                          {typeof temp === "number" && ` ${temp.toFixed(1)}°`}
                          {typeof power === "number" && ` ${Math.round(power)}W`}
                          {typeof battery === "number" && ` 🔋${Math.round(battery)}%`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BannerStat({
  icon: Icon,
  label,
  value,
  hint,
  accent = false,
}: {
  icon: typeof Shield;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="panel rounded-lg p-4 text-center relative overflow-hidden"
      style={{
        background: accent
          ? "linear-gradient(180deg, color-mix(in oklab, var(--gold) 12%, transparent), transparent)"
          : undefined,
      }}
    >
      <div className="flex justify-center mb-2">
        <Icon
          size={18}
          className="text-primary"
          style={{
            filter: accent
              ? "drop-shadow(0 0 6px color-mix(in oklab, var(--gold) 60%, transparent))"
              : undefined,
          }}
        />
      </div>
      <div className="text-display text-primary text-xl">{value}</div>
      <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mt-1">
        {label}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground/70 mt-1 italic">{hint}</div>
      )}
    </div>
  );
}
