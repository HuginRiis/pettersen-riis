import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import {
  getHomeySnapshot,
  setHomeyCapability,
  disconnectHomey,
  type HomeyCapValue,
} from "@/server/homey";
import heroImg from "@/assets/smarthus-hero.jpg";

export const Route = createFileRoute("/smarthus")({
  head: () => ({
    meta: [
      { title: "Maesterens Tårn — Smarthus | House Riis-Pettersen" },
      {
        name: "description",
        content:
          "Maesterens Tårn — husets smarthus styrt av ravner fra Homey. Lys, varme og sensorer fra hver sal.",
      },
      { property: "og:title", content: "Maesterens Tårn — Smarthus" },
      { property: "og:description", content: "Husets smarthus i Game of Thrones-ånd, drevet av Homey." },
    ],
  }),
  loader: () => getHomeySnapshot(),
  component: SmarthusPage,
  errorComponent: ({ error }) => (
    <PageShell>
      <PageHero
        eyebrow="Mørke i tårnet"
        title="Maesterens Tårn"
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
  socket: "Rune-stikk",
  sensor: "Varsler",
  thermostat: "Varmemester",
  heater: "Ovn",
  curtain: "Forheng",
  blinds: "Forheng",
  lock: "Portvokter",
  speaker: "Bardens lur",
  tv: "Speil",
  doorbell: "Klokkeren",
  button: "Rune-knapp",
  windowcoverings: "Forheng",
  fan: "Vinden",
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
        title="Maesterens Tårn"
        subtitle="Bind ravnene til Homey for å våkne tårnet."
        image={heroImg}
      />
      <section className="container mx-auto px-4 py-12">
        <div className="panel rounded-lg p-8 max-w-2xl mx-auto text-center">
          <h2 className="text-display text-primary text-xl mb-3 tracking-[0.25em]">
            INGEN BÅND TIL HOMEY
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {message ?? "For å våkne tårnet må du binde det til din Homey-konto via Athom."}
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

  // Group devices by zone
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
  ).length;
  const tempReadings = data.devices
    .map((d) => d.capabilities["measure_temperature"]?.value)
    .filter((v): v is number => typeof v === "number");
  const avgTemp =
    tempReadings.length > 0
      ? (tempReadings.reduce((a, b) => a + b, 0) / tempReadings.length).toFixed(1)
      : null;

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
        title="Maesterens Tårn"
        subtitle={
          data.homeName
            ? `${data.homeName} — husets smarthus, voktet av ravnene fra Homey.`
            : "Husets smarthus, voktet av ravnene fra Homey."
        }
        image={heroImg}
      />

      <section className="container mx-auto px-4 pt-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Tjenere" value={String(totalDevices)} />
          <Stat label="Sale" value={String(zoneEntries.length)} />
          <Stat label="Ildsteler" value={String(lights)} />
          <Stat label="Snitt-varme" value={avgTemp ? `${avgTemp}°` : "—"} />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-lg p-4 text-center">
      <div className="text-2xl text-primary text-display">{value}</div>
      <div className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase mt-1">
        {label}
      </div>
    </div>
  );
}

function DeviceCard({ device }: { device: any }) {
  const router = useRouter();
  const setCap = useServerFn(setHomeyCapability);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, HomeyCapValue>>({});

  const getVal = (id: string): HomeyCapValue => {
    if (id in optimistic) return optimistic[id];
    return (device.capabilities[id]?.value ?? null) as HomeyCapValue;
  };

  const send = (capabilityId: string, value: HomeyCapValue) => {
    setError(null);
    setOptimistic((prev) => ({ ...prev, [capabilityId]: value }));
    startTransition(async () => {
      try {
        await setCap({ data: { deviceId: device.id, capabilityId, value } });
        router.invalidate();
      } catch (e: any) {
        setError(e?.message ?? "Klarte ikke å styre");
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[capabilityId];
          return next;
        });
      }
    });
  };

  const onoff = device.capabilities["onoff"];
  const dim = device.capabilities["dim"];
  const temp = device.capabilities["measure_temperature"]?.value;
  const hum = device.capabilities["measure_humidity"]?.value;
  const power = device.capabilities["measure_power"]?.value;
  const battery = device.capabilities["measure_battery"]?.value;
  const target = device.capabilities["target_temperature"];

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

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
        {typeof temp === "number" && <span>🌡 {temp.toFixed(1)}°C</span>}
        {typeof hum === "number" && <span>💧 {hum.toFixed(0)}%</span>}
        {typeof power === "number" && <span>⚡ {power.toFixed(0)} W</span>}
        {typeof battery === "number" && <span>🔋 {battery.toFixed(0)}%</span>}
      </div>

      {onoff && onoff.setable && (
        <button
          onClick={() => send("onoff", !getVal("onoff"))}
          disabled={pending}
          className={`w-full text-sm tracking-widest uppercase py-2 rounded border transition-colors ${
            getVal("onoff")
              ? "border-primary text-primary bg-primary/10"
              : "border-border text-muted-foreground hover:border-primary/50"
          } disabled:opacity-50`}
        >
          {getVal("onoff") ? "✦ Tent" : "○ Slokt"}
        </button>
      )}

      {dim && dim.setable && getVal("onoff") !== false && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            <span>Glød</span>
            <span>{Math.round(((getVal("dim") as number) ?? 0) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(((getVal("dim") as number) ?? 0) * 100)}
            onChange={(e) => send("dim", Number(e.target.value) / 100)}
            disabled={pending}
            className="w-full accent-primary"
          />
        </div>
      )}

      {target && target.setable && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            <span>Ønsket varme</span>
            <span>{Number(getVal("target_temperature") ?? 0).toFixed(1)}°C</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                send(
                  "target_temperature",
                  Number((getVal("target_temperature") as number) ?? 20) - 0.5,
                )
              }
              disabled={pending}
              className="flex-1 py-1 rounded border border-border hover:border-primary/50 text-sm"
            >
              −
            </button>
            <button
              onClick={() =>
                send(
                  "target_temperature",
                  Number((getVal("target_temperature") as number) ?? 20) + 0.5,
                )
              }
              disabled={pending}
              className="flex-1 py-1 rounded border border-border hover:border-primary/50 text-sm"
            >
              +
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </article>
  );
}
