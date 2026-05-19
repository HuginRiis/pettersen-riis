import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PageHero } from "@/components/PageShell";
import { Plane, PlaneTakeoff, PlaneLanding, Navigation, Radio, Bell, MapPin, RefreshCw, Save } from "lucide-react";
import heroImg from "@/assets/got-flyradar.jpg";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  fetchFlightStates,
  getFlightAlertPrefs,
  saveFlightAlertPrefs,
  type FlightState,
  type FlightAlertPrefs,
} from "@/server/flyradar.functions";

export const Route = createFileRoute("/flyradar")({
  component: FlyradarPage,
  head: () => ({
    meta: [
      { title: "Flyradar — fly i Norge" },
      { name: "description", content: "Live oversikt over fly i Norge med filter, statistikk og varslinger ved avgang/landing." },
    ],
  }),
});

// Norske flyplasser med koordinater
const AIRPORTS: { code: string; name: string; lat: number; lon: number }[] = [
  { code: "OSL", name: "Oslo Gardermoen", lat: 60.1939, lon: 11.1004 },
  { code: "TRF", name: "Sandefjord Torp", lat: 59.1867, lon: 10.2586 },
  { code: "SKE", name: "Skien Geiteryggen", lat: 59.1850, lon: 9.5667 },
  { code: "KRS", name: "Kristiansand Kjevik", lat: 58.2042, lon: 8.0856 },
  { code: "SVG", name: "Stavanger Sola", lat: 58.8767, lon: 5.6378 },
  { code: "HAU", name: "Haugesund Karmøy", lat: 59.3453, lon: 5.2083 },
  { code: "BGO", name: "Bergen Flesland", lat: 60.2934, lon: 5.2181 },
  { code: "AES", name: "Ålesund Vigra", lat: 62.5625, lon: 6.1197 },
  { code: "MOL", name: "Molde Årø", lat: 62.7447, lon: 7.2625 },
  { code: "TRD", name: "Trondheim Værnes", lat: 63.4578, lon: 10.9240 },
  { code: "BOO", name: "Bodø", lat: 67.2692, lon: 14.3654 },
  { code: "TOS", name: "Tromsø Langnes", lat: 69.6833, lon: 18.9189 },
  { code: "ALF", name: "Alta", lat: 69.9761, lon: 23.3717 },
  { code: "KKN", name: "Kirkenes Høybuktmoen", lat: 69.7258, lon: 29.8913 },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fmtAlt(m: number | null): string {
  if (m == null) return "—";
  return `${Math.round(m).toLocaleString("no-NO")} m`;
}
function fmtSpd(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms * 3.6)} km/t`;
}
function fmtDir(deg: number | null): string {
  if (deg == null) return "—";
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return `${Math.round(deg)}° ${dirs[Math.round(deg / 45) % 8]}`;
}

function FlyradarPage() {
  const fetchStates = useServerFn(fetchFlightStates);
  const loadPrefs = useServerFn(getFlightAlertPrefs);
  const savePrefs = useServerFn(saveFlightAlertPrefs);

  const [states, setStates] = useState<FlightState[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter
  const [q, setQ] = useState("");
  const [airportCode, setAirportCode] = useState<string>("all");
  const [airportRadius, setAirportRadius] = useState<number>(40);
  const [groundFilter, setGroundFilter] = useState<"all" | "air" | "ground">("air");
  const [altRange, setAltRange] = useState<[number, number]>([0, 13000]);
  const [spdRange, setSpdRange] = useState<[number, number]>([0, 1100]);
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [myLoc, setMyLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [myRadius, setMyRadius] = useState<number>(50);

  // Prefs
  const [prefs, setPrefs] = useState<FlightAlertPrefs | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchStates({ data: {} });
      setStates(r.states);
      setLastFetch(Date.now());
      setError(r.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feil");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPrefs().then(setPrefs).catch(() => setPrefs(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!useMyLocation) return;
    if (!navigator.geolocation) {
      toast.error("Posisjon ikke støttet i denne nettleseren");
      setUseMyLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {
        toast.error("Klarte ikke hente posisjon");
        setUseMyLocation(false);
      },
    );
  }, [useMyLocation]);

  // Filtrer
  const filtered = useMemo(() => {
    const ap = AIRPORTS.find((a) => a.code === airportCode) || null;
    const qLow = q.trim().toLowerCase();
    return states.filter((s) => {
      if (qLow) {
        const cs = (s.callsign ?? "").toLowerCase();
        const ic = s.icao24.toLowerCase();
        if (!cs.includes(qLow) && !ic.includes(qLow)) return false;
      }
      if (groundFilter === "air" && s.on_ground) return false;
      if (groundFilter === "ground" && !s.on_ground) return false;
      const alt = s.baro_altitude_m ?? s.geo_altitude_m ?? 0;
      if (alt < altRange[0] || alt > altRange[1]) return false;
      const spdKmh = (s.velocity_ms ?? 0) * 3.6;
      if (spdKmh < spdRange[0] || spdKmh > spdRange[1]) return false;
      if (ap && s.latitude != null && s.longitude != null) {
        if (haversineKm(s.latitude, s.longitude, ap.lat, ap.lon) > airportRadius) return false;
      }
      if (useMyLocation && myLoc && s.latitude != null && s.longitude != null) {
        if (haversineKm(s.latitude, s.longitude, myLoc.lat, myLoc.lon) > myRadius) return false;
      }
      return true;
    });
  }, [states, q, airportCode, airportRadius, groundFilter, altRange, spdRange, useMyLocation, myLoc, myRadius]);

  // Statistikk på det filtrerte settet
  const stats = useMemo(() => {
    const inAir = filtered.filter((s) => !s.on_ground);
    const onGround = filtered.filter((s) => s.on_ground);
    const altitudes = inAir.map((s) => s.baro_altitude_m ?? s.geo_altitude_m ?? 0).filter((n) => n > 0);
    const speeds = inAir.map((s) => (s.velocity_ms ?? 0) * 3.6).filter((n) => n > 0);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
    const climbing = inAir.filter((s) => (s.vertical_rate_ms ?? 0) > 2).length;
    const descending = inAir.filter((s) => (s.vertical_rate_ms ?? 0) < -2).length;
    const norwegian = filtered.filter((s) => s.origin_country === "Norway").length;
    const countries = new Set(filtered.map((s) => s.origin_country)).size;
    return {
      total: filtered.length,
      inAir: inAir.length,
      onGround: onGround.length,
      avgAlt: avg(altitudes),
      maxAlt: max(altitudes),
      avgSpeed: avg(speeds),
      maxSpeed: max(speeds),
      climbing,
      descending,
      norwegian,
      countries,
    };
  }, [filtered]);

  const updatePref = <K extends keyof FlightAlertPrefs>(k: K, v: FlightAlertPrefs[K]) => {
    setPrefs((p) => (p ? { ...p, [k]: v } : p));
  };

  const togglePrefAirport = (code: string) => {
    setPrefs((p) => {
      if (!p) return p;
      const has = p.airports.includes(code);
      return { ...p, airports: has ? p.airports.filter((c) => c !== code) : [...p.airports, code] };
    });
  };

  const doSavePrefs = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    try {
      await savePrefs({
        data: {
          airports: prefs.airports,
          notify_arrivals: prefs.notify_arrivals,
          notify_departures: prefs.notify_departures,
          radius_center_lat: prefs.radius_center_lat,
          radius_center_lon: prefs.radius_center_lon,
          radius_km: prefs.radius_km,
          notify_radius: prefs.notify_radius,
          min_altitude_m: prefs.min_altitude_m,
        },
      });
      toast.success("Varslinger lagret");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lagring feilet");
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Ravnenes vei"
        title="Flyradar"
        subtitle="Live oversikt over fly i Norge. Filtrer på flyplass, posisjon og høyde — og sett opp varsler."
        image={heroImg}
      />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <Tabs defaultValue="live">
          <TabsList>
            <TabsTrigger value="live"><Plane className="w-4 h-4 mr-1" />Live</TabsTrigger>
            <TabsTrigger value="stats"><Radio className="w-4 h-4 mr-1" />Statistikk</TabsTrigger>
            <TabsTrigger value="settings"><Bell className="w-4 h-4 mr-1" />Varslinger</TabsTrigger>
          </TabsList>

          {/* LIVE */}
          <TabsContent value="live" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="text-sm text-muted-foreground">
                  Kilde: OpenSky Network · {lastFetch ? `oppdatert ${new Date(lastFetch).toLocaleTimeString("no-NO")}` : "—"}
                  {error && <span className="text-destructive ml-2">({error})</span>}
                </div>
                <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                  Oppdater
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Søk (callsign / icao24)</Label>
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="f.eks. SAS1463 eller 4ca1bd" />
                </div>
                <div>
                  <Label className="text-xs">Flyplass</Label>
                  <Select value={airportCode} onValueChange={setAirportCode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Hele Norge</SelectItem>
                      {AIRPORTS.map((a) => (
                        <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={groundFilter} onValueChange={(v) => setGroundFilter(v as "all" | "air" | "ground")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="air">I lufta</SelectItem>
                      <SelectItem value="ground">På bakken</SelectItem>
                      <SelectItem value="all">Alle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {airportCode !== "all" && (
                  <div className="sm:col-span-3">
                    <Label className="text-xs">Radius rundt flyplass: {airportRadius} km</Label>
                    <Slider min={5} max={150} step={5} value={[airportRadius]} onValueChange={(v) => setAirportRadius(v[0])} />
                  </div>
                )}

                <div className="sm:col-span-3 flex items-center gap-3">
                  <Switch id="my-loc" checked={useMyLocation} onCheckedChange={setUseMyLocation} />
                  <Label htmlFor="my-loc" className="text-sm flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> Begrens til min posisjon ({myRadius} km)
                  </Label>
                  {useMyLocation && (
                    <div className="flex-1 min-w-[150px]">
                      <Slider min={5} max={300} step={5} value={[myRadius]} onValueChange={(v) => setMyRadius(v[0])} />
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Høyde (m): {altRange[0]} – {altRange[1]}</Label>
                  <Slider min={0} max={13000} step={250} value={altRange} onValueChange={(v) => setAltRange([v[0], v[1]])} />
                </div>
                <div>
                  <Label className="text-xs">Fart (km/t): {spdRange[0]} – {spdRange[1]}</Label>
                  <Slider min={0} max={1100} step={25} value={spdRange} onValueChange={(v) => setSpdRange([v[0], v[1]])} />
                </div>
              </div>
            </div>

            {/* Mini-statistikk top */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Treff" value={stats.total.toString()} icon={<Plane className="w-4 h-4" />} />
              <Stat label="I lufta" value={stats.inAir.toString()} icon={<PlaneTakeoff className="w-4 h-4" />} />
              <Stat label="På bakken" value={stats.onGround.toString()} icon={<PlaneLanding className="w-4 h-4" />} />
              <Stat label="Norske" value={stats.norwegian.toString()} icon={<Navigation className="w-4 h-4" />} />
            </div>

            {/* Liste */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
                <div className="col-span-3">Callsign</div>
                <div className="col-span-3 hidden sm:block">Land</div>
                <div className="col-span-2 text-right">Høyde</div>
                <div className="col-span-2 text-right">Fart</div>
                <div className="col-span-2 text-right hidden sm:block">Retning</div>
              </div>
              <div className="max-h-[600px] overflow-y-auto divide-y divide-border">
                {filtered.length === 0 && (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Laster fly …" : "Ingen treff for valgte filter."}
                  </div>
                )}
                {filtered
                  .slice()
                  .sort((a, b) => (b.baro_altitude_m ?? 0) - (a.baro_altitude_m ?? 0))
                  .slice(0, 300)
                  .map((s) => (
                    <FlightRow key={s.icao24} s={s} />
                  ))}
              </div>
              {filtered.length > 300 && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                  Viser 300 av {filtered.length} treff. Snevre inn filtrene for å se flere.
                </div>
              )}
            </div>
          </TabsContent>

          {/* STATS */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Stat label="Totalt fly" value={stats.total.toString()} icon={<Plane className="w-4 h-4" />} />
              <Stat label="I lufta" value={stats.inAir.toString()} icon={<PlaneTakeoff className="w-4 h-4" />} />
              <Stat label="På bakken" value={stats.onGround.toString()} icon={<PlaneLanding className="w-4 h-4" />} />
              <Stat label="Stiger" value={stats.climbing.toString()} icon={<PlaneTakeoff className="w-4 h-4" />} />
              <Stat label="Synker" value={stats.descending.toString()} icon={<PlaneLanding className="w-4 h-4" />} />
              <Stat label="Snitt-høyde" value={fmtAlt(stats.avgAlt)} icon={<Radio className="w-4 h-4" />} />
              <Stat label="Høyeste fly" value={fmtAlt(stats.maxAlt)} icon={<Radio className="w-4 h-4" />} />
              <Stat label="Snitt-fart" value={fmtSpd(stats.avgSpeed / 3.6)} icon={<Navigation className="w-4 h-4" />} />
              <Stat label="Raskeste" value={fmtSpd(stats.maxSpeed / 3.6)} icon={<Navigation className="w-4 h-4" />} />
              <Stat label="Norske" value={stats.norwegian.toString()} icon={<Plane className="w-4 h-4" />} />
              <Stat label="Antall land" value={stats.countries.toString()} icon={<MapPin className="w-4 h-4" />} />
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm font-medium mb-2">Trafikk pr flyplass (innen 40 km)</div>
              <div className="space-y-1">
                {AIRPORTS.map((a) => {
                  const around = states.filter(
                    (s) =>
                      s.latitude != null &&
                      s.longitude != null &&
                      haversineKm(s.latitude, s.longitude, a.lat, a.lon) <= 40,
                  );
                  const air = around.filter((s) => !s.on_ground).length;
                  const ground = around.filter((s) => s.on_ground).length;
                  const total = around.length;
                  const max = 30;
                  return (
                    <div key={a.code} className="flex items-center gap-2 text-xs">
                      <div className="w-12 font-mono">{a.code}</div>
                      <div className="flex-1 min-w-0 truncate text-muted-foreground">{a.name}</div>
                      <div className="w-32 h-2 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(100, (total / max) * 100)}%` }}
                        />
                      </div>
                      <div className="w-20 text-right tabular-nums">
                        {air} ✈ / {ground} ⏹
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm font-medium mb-2">Topp 10 land i lufta</div>
              <div className="space-y-1 text-xs">
                {Object.entries(
                  filtered.reduce<Record<string, number>>((acc, s) => {
                    if (!s.on_ground) acc[s.origin_country] = (acc[s.origin_country] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([country, n]) => (
                    <div key={country} className="flex justify-between">
                      <span>{country || "—"}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </div>
                  ))}
              </div>
            </div>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-4">
            {!prefs ? (
              <div className="text-sm text-muted-foreground">Laster innstillinger …</div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                  <div className="text-sm font-medium">Varsle ved trafikk på disse flyplassene</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {AIRPORTS.map((a) => {
                      const active = prefs.airports.includes(a.code);
                      return (
                        <button
                          key={a.code}
                          type="button"
                          onClick={() => togglePrefAirport(a.code)}
                          className={`text-left px-3 py-2 rounded border text-xs transition ${
                            active
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-background hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          <div className="font-mono font-medium">{a.code}</div>
                          <div className="truncate">{a.name}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-6 pt-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={prefs.notify_departures}
                        onCheckedChange={(v) => updatePref("notify_departures", v)}
                      />
                      <PlaneTakeoff className="w-4 h-4" /> Varsle ved avgang
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={prefs.notify_arrivals}
                        onCheckedChange={(v) => updatePref("notify_arrivals", v)}
                      />
                      <PlaneLanding className="w-4 h-4" /> Varsle ved landing
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Varsle ved fly i et geografisk område</div>
                    <Switch
                      checked={prefs.notify_radius}
                      onCheckedChange={(v) => updatePref("notify_radius", v)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Senter — breddegrad</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={prefs.radius_center_lat ?? ""}
                        onChange={(e) =>
                          updatePref("radius_center_lat", e.target.value === "" ? null : Number(e.target.value))
                        }
                        placeholder="59.2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Senter — lengdegrad</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={prefs.radius_center_lon ?? ""}
                        onChange={(e) =>
                          updatePref("radius_center_lon", e.target.value === "" ? null : Number(e.target.value))
                        }
                        placeholder="9.6"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Radius: {prefs.radius_km} km</Label>
                      <Slider
                        min={1}
                        max={200}
                        step={1}
                        value={[prefs.radius_km]}
                        onValueChange={(v) => updatePref("radius_km", v[0])}
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!navigator.geolocation) return toast.error("Posisjon ikke støttet");
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          updatePref("radius_center_lat", Number(pos.coords.latitude.toFixed(4)));
                          updatePref("radius_center_lon", Number(pos.coords.longitude.toFixed(4)));
                          toast.success("Posisjon hentet");
                        },
                        () => toast.error("Klarte ikke hente posisjon"),
                      );
                    }}
                  >
                    <MapPin className="w-4 h-4 mr-1" /> Bruk min posisjon
                  </Button>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <Label className="text-xs">Minste høyde for varsel: {prefs.min_altitude_m} m</Label>
                  <Slider
                    min={0}
                    max={5000}
                    step={100}
                    value={[prefs.min_altitude_m]}
                    onValueChange={(v) => updatePref("min_altitude_m", v[0])}
                  />
                  <div className="mt-2 text-xs text-muted-foreground">
                    Sett høyere for å filtrere bort småfly som flyr lavt.
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Selve push-utsendelsen kobles på i neste runde — innstillingene lagres uansett.
                  </div>
                  <Button onClick={doSavePrefs} disabled={savingPrefs}>
                    <Save className="w-4 h-4 mr-1" />
                    {savingPrefs ? "Lagrer …" : "Lagre"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FlightRow({ s }: { s: FlightState }) {
  const alt = s.baro_altitude_m ?? s.geo_altitude_m;
  return (
    <div className="grid grid-cols-12 gap-2 px-3 py-2 text-sm hover:bg-muted/40">
      <div className="col-span-3 font-mono">
        <div className="flex items-center gap-1">
          {s.on_ground ? <PlaneLanding className="w-3 h-3 text-muted-foreground" /> : <Plane className="w-3 h-3 text-primary" />}
          {s.callsign || s.icao24}
        </div>
        <div className="text-[10px] text-muted-foreground sm:hidden">{s.origin_country}</div>
      </div>
      <div className="col-span-3 hidden sm:block text-muted-foreground truncate">{s.origin_country}</div>
      <div className="col-span-2 text-right tabular-nums">{fmtAlt(alt)}</div>
      <div className="col-span-2 text-right tabular-nums">{fmtSpd(s.velocity_ms)}</div>
      <div className="col-span-2 text-right tabular-nums hidden sm:block">{fmtDir(s.true_track)}</div>
    </div>
  );
}
