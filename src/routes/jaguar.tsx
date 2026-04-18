import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PageHero } from "@/components/PageShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  connectJaguar,
  disconnectJaguar,
  getJaguarDashboard,
  type JaguarDashboard,
} from "@/server/jaguar";
import jaguarImg from "@/assets/jaguar.jpg";

export const Route = createFileRoute("/jaguar")({
  head: () => ({
    meta: [
      { title: "Jernhesten — House Riis Pettersen" },
      {
        name: "description",
        content:
          "Jaguar I-Pace dashbord — batteri, rekkevidde, klima og lås, levert i Westerosi-stil.",
      },
      { property: "og:title", content: "Jernhesten | House Riis Pettersen" },
      {
        property: "og:description",
        content: "Den lydløse jernhesten — batteri, rekkevidde og klima fra borgens stallplass.",
      },
      { property: "og:image", content: jaguarImg },
    ],
  }),
  component: JaguarPage,
});

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: JaguarDashboard };

function JaguarPage() {
  const dashFn = useServerFn(getJaguarDashboard);
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = async () => {
    setState({ kind: "loading" });
    try {
      const data = await dashFn();
      setState({ kind: "ok", data });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Klarte ikke å nå stallen",
      });
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets Stallplass"
        title="Jernhesten"
        subtitle="Den lydløse hesten av sølv og glass — alltid klar for ferden."
        image={jaguarImg}
      />
      <div className="container mx-auto px-4 py-10 space-y-6">
        {state.kind === "loading" && (
          <div className="text-center text-muted-foreground py-12">
            Sender ravner til stallen…
          </div>
        )}

        {state.kind === "error" && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3">
            {state.message}
          </div>
        )}

        {state.kind === "ok" && !state.data.connected && (
          <ConnectForm onConnected={load} />
        )}

        {state.kind === "ok" && state.data.connected && (
          <Dashboard data={state.data} onChanged={load} />
        )}
      </div>
    </PageShell>
  );
}

// ── Connect form ───────────────────────────────────────────────────────
function ConnectForm({ onConnected }: { onConnected: () => void }) {
  const connect = useServerFn(connectJaguar);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await connect({ data: { email, password } });
      onConnected();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Innlogging avslått");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto rounded-lg border border-border bg-card/60 backdrop-blur p-6 shadow-lg">
      <h2 className="text-display text-xl tracking-[0.2em] text-primary mb-2">
        Bind jernhesten til borgen
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Bruk samme e-post og passord som du logger inn med i Jaguar InControl-appen. Tegnene blir
        oppbevart i kryptert form i borgens hvelv.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs tracking-wider uppercase text-muted-foreground mb-1.5">
            InControl e-post
          </label>
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="navn@eksempel.no"
            required
          />
        </div>
        <div>
          <label className="block text-xs tracking-wider uppercase text-muted-foreground mb-1.5">
            InControl passord
          </label>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        {err && (
          <div className="text-sm text-destructive border border-destructive/40 rounded-md px-3 py-2 bg-destructive/10">
            {err}
          </div>
        )}
        <Button type="submit" disabled={submitting || !email || !password} className="w-full">
          {submitting ? "Sender raven…" : "Bind jernhesten"}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center pt-1">
          Tilkoblingen bruker det samme uoffisielle API-et som Jaguar-appen. Det er ikke godkjent
          av Jaguar Land Rover.
        </p>
      </form>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────
function Dashboard({
  data,
  onChanged,
}: {
  data: Extract<JaguarDashboard, { connected: true }>;
  onChanged: () => void;
}) {
  const disconnect = useServerFn(disconnectJaguar);
  const [disconnecting, setDisconnecting] = useState(false);

  const onDisconnect = async () => {
    if (!confirm("Løse jernhesten fra borgen?")) return;
    setDisconnecting(true);
    try {
      await disconnect();
      onChanged();
    } finally {
      setDisconnecting(false);
    }
  };

  const s = data.status;
  const name = data.vehicleNickname || "Jernhesten";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/60 backdrop-blur px-4 py-3">
        <div>
          <div className="text-display tracking-[0.2em] text-primary">{name}</div>
          <div className="text-xs text-muted-foreground">
            Bundet til <span className="text-foreground">{data.email}</span>
            {data.vin ? <> · VIN {data.vin.slice(-6)}</> : null}
          </div>
        </div>
        <button
          onClick={onDisconnect}
          disabled={disconnecting}
          className="text-xs tracking-wider uppercase text-muted-foreground hover:text-destructive transition-colors"
        >
          {disconnecting ? "Løser…" : "Løs jernhesten"}
        </button>
      </div>

      {data.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 text-sm">
          {data.error}
        </div>
      )}

      {!s ? (
        <div className="text-center text-muted-foreground py-12 rounded-lg border border-border bg-card/40">
          Ingen tilstand mottatt fra jernhesten ennå.
        </div>
      ) : (
        <>
          {/* Battery & range */}
          <section className="grid md:grid-cols-3 gap-4">
            <BatteryCard
              pct={s.batteryLevelPct}
              isCharging={s.isCharging}
              pluggedIn={s.pluggedIn}
              minutesToFull={s.timeToFullChargeMinutes}
            />
            <Stat
              label="Rekkevidde"
              value={s.rangeKm !== null ? `${Math.round(s.rangeKm)} km` : "—"}
              hint="Hvor langt jernhesten kan ri på nåværende livskraft"
            />
            <Stat
              label="Kjørte verk"
              value={s.odometerKm !== null ? `${s.odometerKm.toLocaleString("nb-NO")} km` : "—"}
              hint="Total reise siden den ble smidd"
            />
          </section>

          {/* Climate & lock */}
          <section className="grid md:grid-cols-4 gap-4">
            <Stat
              label="Kabintemperatur"
              value={s.cabinTempC !== null ? `${s.cabinTempC.toFixed(1)} °C` : "—"}
              hint="Varmen i sadelens innside"
            />
            <Stat
              label="Klimaanlegg"
              value={
                s.climateActive === null
                  ? "—"
                  : s.climateActive
                    ? "Forvarmer"
                    : "Hviler"
              }
              hint="Forvarming av sadelen"
            />
            <Stat
              label="Borgens lås"
              value={
                s.isLocked === null
                  ? "—"
                  : s.isLocked
                    ? "Forseglet"
                    : "Åpen"
              }
              accent={s.isLocked === false ? "warn" : "ok"}
              hint="Er portene til jernhesten lukket?"
            />
            <Stat
              label="Vinduer"
              value={s.windowsClosed ? "Lukket" : "Åpne"}
              accent={s.windowsClosed ? "ok" : "warn"}
            />
          </section>

          {/* Service & tyres */}
          <section className="grid md:grid-cols-3 gap-4">
            <Stat
              label="Hovsmedens kall"
              value={
                s.serviceDistanceKm !== null
                  ? `${s.serviceDistanceKm.toLocaleString("nb-NO")} km igjen`
                  : "—"
              }
              hint="Kilometer til neste service"
            />
            <Stat
              label="Hover (dekktrykk)"
              value={
                s.tyrePressuresOk === null
                  ? "—"
                  : s.tyrePressuresOk
                    ? "Sterke"
                    : "Trenger ettersyn"
              }
              accent={s.tyrePressuresOk === false ? "warn" : "ok"}
            />
            <Stat
              label="Ladekobling"
              value={
                s.pluggedIn === null
                  ? "—"
                  : s.pluggedIn
                    ? "Tilkoblet kraftåren"
                    : "Frikoblet"
              }
            />
          </section>

          {/* Position */}
          {s.latitude !== null && s.longitude !== null && (
            <section className="rounded-lg border border-border bg-card/60 backdrop-blur p-4">
              <div className="text-xs tracking-wider uppercase text-muted-foreground mb-2">
                Hvor jernhesten hviler
              </div>
              <div className="text-sm text-foreground mb-3">
                {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
              </div>
              <a
                href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                Vis på kart →
              </a>
            </section>
          )}

          <div className="text-[11px] text-muted-foreground text-right">
            Sist hørt fra stallen:{" "}
            {new Date(s.fetchedAt).toLocaleString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "short",
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Small UI helpers ───────────────────────────────────────────────────
function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "ok" | "warn";
}) {
  const accentClass =
    accent === "warn"
      ? "text-destructive"
      : accent === "ok"
        ? "text-primary"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-4">
      <div className="text-xs tracking-wider uppercase text-muted-foreground">{label}</div>
      <div className={`text-2xl font-display mt-1 ${accentClass}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function BatteryCard({
  pct,
  isCharging,
  pluggedIn,
  minutesToFull,
}: {
  pct: number | null;
  isCharging: boolean | null;
  pluggedIn: boolean | null;
  minutesToFull: number | null;
}) {
  const value = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const label = pct === null ? "—" : `${Math.round(value)} %`;
  const barColor =
    value > 60 ? "bg-primary" : value > 25 ? "bg-yellow-500" : "bg-destructive";
  return (
    <div className="rounded-lg border border-border bg-card/60 backdrop-blur p-4">
      <div className="text-xs tracking-wider uppercase text-muted-foreground">Livskraft</div>
      <div className="flex items-baseline justify-between mt-1">
        <div className="text-2xl font-display text-primary">{label}</div>
        {isCharging ? (
          <span className="text-[11px] tracking-wider uppercase text-primary">⚡ Lader</span>
        ) : pluggedIn ? (
          <span className="text-[11px] tracking-wider uppercase text-muted-foreground">Tilkoblet</span>
        ) : null}
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
      {isCharging && minutesToFull !== null && minutesToFull > 0 && (
        <div className="text-xs text-muted-foreground mt-2">
          Full om {Math.floor(minutesToFull / 60)}t {minutesToFull % 60}m
        </div>
      )}
    </div>
  );
}
