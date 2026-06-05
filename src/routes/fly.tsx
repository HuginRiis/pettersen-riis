import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plane, RefreshCw, Send, Save, Bell, BellOff, Navigation, MapPin } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import {
  getNearbyFlights,
  getFlightPushSettings,
  saveFlightPushSettings,
  sendFlightPushManual,
  FLIGHT_LOCATIONS,
  DEFAULT_SEARCH_RADIUS_KM,
  MAX_SEARCH_RADIUS_KM,
  PUSH_FIELD_KEYS,
  PUSH_FIELD_LABELS,
  type Flight,
  type FlightPushSettings,
  type FlightLocationId,
  type PushFieldKey,
} from "@/lib/flights.functions";
import { translateAircraftType, registrationCountry, explainSquawk } from "@/lib/flight-translations";

const RECIPIENTS = ["Alle", "Arne", "Rebekka", "Arne & Rebekka", "Marita", "Nora", "Celine", "Mira"];

export const Route = createFileRoute("/fly")({
  head: () => ({
    meta: [
      { title: "Fly i nærheten — Tollnes & Hytta" },
      { name: "description", content: "Live oversikt over fly innenfor 50 km av Tollnes og Hytta." },
    ],
  }),
  component: FlyPage,
});

function compass(deg: number | null): string {
  if (deg == null) return "?";
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return dirs[Math.round(deg / 45) % 8];
}

function FlyPage() {
  return (
    <PageShell>
      <header className="container mx-auto px-4 pt-6 pb-3 flex items-center gap-3">
        <Plane className="text-primary" />
        <div className="flex-1">
          <h1 className="text-display tracking-[0.18em] uppercase text-lg text-primary">
            Fly i nærheten
          </h1>
          <p className="text-xs text-muted-foreground">
            Live ADS-B — justerbar synlig radius og separat push-varsling per sted.
          </p>
        </div>
      </header>

      <LocationSection location="tollnes" />
      <LocationSection location="hytta" />
    </PageShell>
  );
}

function LocationSection({ location }: { location: FlightLocationId }) {
  const meta = FLIGHT_LOCATIONS[location];
  const fetchFlights = useServerFn(getNearbyFlights);
  const fetchSettings = useServerFn(getFlightPushSettings);
  const saveSettings = useServerFn(saveFlightPushSettings);
  const sendManual = useServerFn(sendFlightPushManual);

  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState<FlightPushSettings | null>(null);
  const [savingS, setSavingS] = useState(false);
  const [pickRecipient, setPickRecipient] = useState<string>("Alle");
  const [busyIcao, setBusyIcao] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchFlights({ data: { location } });
      if (r.ok) {
        setFlights(r.flights);
        setFetchedAt(r.fetchedAt);
        setSource(r.source);
      } else {
        setErr(r.error);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Klarte ikke hente fly");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void fetchSettings({ data: { location } }).then((s) => {
      setSettings(s);
      setPickRecipient(s.recipient || "Alle");
    });
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  async function onSaveSettings() {
    if (!settings) return;
    setSavingS(true);
    try {
      await saveSettings({ data: { location, settings } });
      setToast("Innstillinger lagret");
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setToast(`Feil: ${e?.message ?? "ukjent"}`);
    } finally {
      setSavingS(false);
    }
  }

  async function onSendOne(f: Flight) {
    setBusyIcao(f.icao24);
    try {
      const r = await sendManual({ data: { icao24: f.icao24, recipient: pickRecipient, location } });
      setToast(`Sendt til ${pickRecipient}: ${r.sent} ok, ${r.errors} feil`);
      setTimeout(() => setToast(null), 3500);
    } catch (e: any) {
      setToast(`Feil: ${e?.message ?? "ukjent"}`);
    } finally {
      setBusyIcao(null);
    }
  }

  return (
    <section className="container mx-auto px-4 pb-8">
      <div className="flex items-center gap-3 mt-4 mb-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-primary flex-1">
          {meta.label}
          <span className="block text-[10px] normal-case tracking-normal text-muted-foreground mt-0.5">
            {meta.lat.toFixed(3)}, {meta.lon.toFixed(3)}
            {source && <span> · kilde: {source}</span>}
            {fetchedAt && <span> · {new Date(fetchedAt).toLocaleTimeString("no-NO")}</span>}
          </span>
        </h2>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-primary/60 text-primary text-xs uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Oppdater
        </button>
      </div>

      {settings && (
        <article className="panel rounded-lg p-4 mb-3">
          <div className="flex items-center gap-2 mb-3">
            {settings.enabled ? <Bell size={16} className="text-primary" /> : <BellOff size={16} className="text-muted-foreground" />}
            <h3 className="text-sm uppercase tracking-wider text-primary">Automatisk varsling — {meta.label}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <button
              onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
              className={`px-3 py-2 rounded border text-xs uppercase tracking-wider ${
                settings.enabled ? "border-primary/60 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {settings.enabled ? "På" : "Av"}
            </button>
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">Mottaker</span>
              <select
                value={settings.recipient}
                onChange={(e) => setSettings({ ...settings, recipient: e.target.value })}
                className="w-full bg-background border border-border/60 rounded px-2 py-1.5"
              >
                {RECIPIENTS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">Maks avstand (km)</span>
              <input
                type="number" min={1} max={50}
                value={settings.maxDistanceKm}
                onChange={(e) => setSettings({ ...settings, maxDistanceKm: Number(e.target.value) || 25 })}
                className="w-full bg-background border border-border/60 rounded px-2 py-1.5 tabular-nums"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">Maks høyde (m, 0=ingen)</span>
              <input
                type="number" min={0} max={20000} step={500}
                value={settings.maxAltitudeM}
                onChange={(e) => setSettings({ ...settings, maxAltitudeM: Number(e.target.value) || 0 })}
                className="w-full bg-background border border-border/60 rounded px-2 py-1.5 tabular-nums"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">Cooldown (min)</span>
              <input
                type="number" min={5} max={1440}
                value={settings.cooldownMinutes}
                onChange={(e) => setSettings({ ...settings, cooldownMinutes: Number(e.target.value) || 60 })}
                className="w-full bg-background border border-border/60 rounded px-2 py-1.5 tabular-nums"
              />
            </label>
          </div>

          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Info som skal være med i push-varselet
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PUSH_FIELD_KEYS.map((k) => {
                const active = settings.fields.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        fields: active
                          ? settings.fields.filter((x) => x !== k)
                          : ([...settings.fields, k] as PushFieldKey[]),
                      })
                    }
                    className={`px-2 py-1 rounded border text-[11px] tracking-wide ${
                      active
                        ? "border-primary/60 text-primary bg-primary/10"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {active ? "✓ " : ""}{PUSH_FIELD_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <button
              onClick={() => void onSaveSettings()}
              disabled={savingS}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-primary/60 text-primary text-xs uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50"
            >
              <Save size={12} /> {savingS ? "Lagrer…" : "Lagre"}
            </button>
          </div>
        </article>
      )}

      <div className="flex items-center gap-2 text-xs mb-2">
        <span className="text-muted-foreground uppercase tracking-wider">Send manuell push til:</span>
        <select
          value={pickRecipient}
          onChange={(e) => setPickRecipient(e.target.value)}
          className="bg-background border border-border/60 rounded px-2 py-1"
        >
          {RECIPIENTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {err && <p className="text-rose-400 text-sm">{err}</p>}
      {!err && flights && flights.length === 0 && (
        <p className="text-muted-foreground text-sm py-6 text-center">
          Ingen fly innenfor {SEARCH_RADIUS_KM} km nå.
        </p>
      )}
      {flights && flights.length > 0 && (
        <ul className="grid gap-2">
          {flights.map((f) => {
            const cs = f.callsign || f.icao24.toUpperCase();
            const altKm = f.baroAltitudeM != null ? (f.baroAltitudeM / 1000).toFixed(1) : null;
            const spdKmh = f.velocityMs != null ? Math.round(f.velocityMs * 3.6) : null;
            return (
              <li key={f.icao24} className="panel rounded-lg p-3 flex items-center gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full border border-primary/40 flex items-center justify-center text-primary">
                  <Plane size={18} style={{ transform: `rotate(${f.trueTrack ?? 0}deg)` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{cs}</span>
                    {f.originCountry && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {f.originCountry}
                      </span>
                    )}
                    {f.onGround && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        På bakken
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="inline-flex items-center gap-1"><MapPin size={11} />{f.distanceKm.toFixed(1)} km</span>
                    <span className="inline-flex items-center gap-1"><Navigation size={11} />{compass(f.trueTrack)}</span>
                    {altKm && <span>{altKm} km h</span>}
                    {spdKmh && <span>{spdKmh} km/t</span>}
                    {f.verticalRateMs != null && f.verticalRateMs !== 0 && (
                      <span>{f.verticalRateMs > 0 ? "↑" : "↓"}{Math.abs(Math.round(f.verticalRateMs * 196.85))} ft/min</span>
                    )}
                    {f.registration && <span className="font-mono">{f.registration}</span>}
                    {f.aircraftType && <span>{f.aircraftType}</span>}
                    {f.squawk && <span>sq {f.squawk}</span>}
                    <span className="opacity-50">{f.icao24}</span>
                  </div>
                  {(() => {
                    const typeFriendly = translateAircraftType(f.aircraftType);
                    const regCountry = registrationCountry(f.registration);
                    const sqEx = explainSquawk(f.squawk);
                    const extras = [
                      typeFriendly,
                      regCountry ? `${f.registration} → ${regCountry}` : null,
                      sqEx,
                    ].filter(Boolean);
                    if (extras.length === 0) return null;
                    return (
                      <div className="text-[11px] text-primary/70 mt-0.5">
                        {extras.join(" · ")}
                      </div>
                    );
                  })()}
                  {(f.description || f.operator) && (
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                      {[f.description, f.operator].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {f.emergency && f.emergency !== "none" && (
                    <div className="text-[11px] text-rose-400 mt-0.5">⚠ {f.emergency}</div>
                  )}
                </div>
                <button
                  onClick={() => void onSendOne(f)}
                  disabled={busyIcao === f.icao24}
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-primary/60 text-primary text-[11px] uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50"
                  title={`Send push til ${pickRecipient}`}
                >
                  <Send size={12} /> {busyIcao === f.icao24 ? "Sender…" : "Push"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 panel rounded px-4 py-2 text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </section>
  );
}
