import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { getHomeySnapshot, disconnectHomey } from "@/server/homey";
import heroImg from "@/assets/smarthus-hero.jpg";

export const Route = createFileRoute("/smarthus")({
  head: () => ({
    meta: [
      { title: "Borgens Smarthus | House Riis-Pettersen" },
      {
        name: "description",
        content: "Borgens Smarthus — oversikt over alle Homey-enhetene i huset.",
      },
      { property: "og:title", content: "Borgens Smarthus" },
      { property: "og:description", content: "Husets smarthus, drevet av Homey." },
    ],
  }),
  loader: () => getHomeySnapshot(),
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
  const [disconnecting, setDisconnecting] = useState(false);

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

  // Pulse-måler (Tibber Pulse / strømmåler på hytta)
  const pulseDevice = data.devices.find((d) => {
    const n = (d.name ?? "").toLowerCase();
    return (
      n.includes("pulse") ||
      n.includes("bjørkeset") ||
      n.includes("bjorkeset") ||
      n.includes("tibber")
    );
  });
  const pulsePower =
    pulseDevice && typeof pulseDevice.capabilities["measure_power"]?.value === "number"
      ? (pulseDevice.capabilities["measure_power"]!.value as number)
      : null;
  // Andre vanlige Tibber-cap'er for forbruk i dag / måned
  const pulseToday =
    pulseDevice &&
    typeof pulseDevice.capabilities["meter_power"]?.value === "number"
      ? (pulseDevice.capabilities["meter_power"]!.value as number)
      : null;

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

      <section className="container mx-auto px-4 pt-10 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Tjenere" value={String(totalDevices)} />
          <Stat label="Sale" value={String(zoneEntries.length)} />
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
            hint="Alle sale"
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

        <div className="text-center pt-6">
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs tracking-[0.25em] uppercase text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            {disconnecting ? "Bryter bånd…" : "Bryt bånd til Homey"}
          </button>
        </div>
      </section>
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
