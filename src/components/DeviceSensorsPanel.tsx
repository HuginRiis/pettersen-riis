import { useEffect, useRef, useState } from "react";
import { Smartphone, MapPin, Compass, BatteryFull, Wifi, Cpu, MonitorSmartphone, Activity, Info } from "lucide-react";

type GeoState =
  | { status: "idle" | "requesting" | "unsupported" | "denied" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      lat: number;
      lon: number;
      accuracy: number;
      altitude: number | null;
      altitudeAccuracy: number | null;
      heading: number | null;
      speed: number | null;
      timestamp: number;
    };

type BatteryState =
  | { status: "unsupported" }
  | {
      status: "ok";
      level: number;
      charging: boolean;
      chargingTime: number;
      dischargingTime: number;
    };

type MotionState = {
  orientation: { alpha: number | null; beta: number | null; gamma: number | null; absolute: boolean };
  acceleration: { x: number | null; y: number | null; z: number | null };
  accelerationG: { x: number | null; y: number | null; z: number | null };
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null };
  interval: number | null;
  needsPermission: boolean;
  granted: boolean;
};

function fmt(n: number | null | undefined, digits = 1, unit = "") {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${unit}`;
}

function secondsToHuman(s: number) {
  if (!Number.isFinite(s) || s <= 0) return "—";
  if (s === Infinity) return "∞";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} t ${m} min` : `${m} min`;
}

export function DeviceSensorsPanel() {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const geoWatchRef = useRef<number | null>(null);
  const [battery, setBattery] = useState<BatteryState | null>(null);
  const [motion, setMotion] = useState<MotionState>({
    orientation: { alpha: null, beta: null, gamma: null, absolute: false },
    acceleration: { x: null, y: null, z: null },
    accelerationG: { x: null, y: null, z: null },
    rotationRate: { alpha: null, beta: null, gamma: null },
    interval: null,
    needsPermission: false,
    granted: false,
  });
  const [now, setNow] = useState(Date.now());
  const [memory, setMemory] = useState<{ used: number; total: number; limit: number } | null>(null);

  // tick for "for sekunder siden" og minne
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const m = (performance as any).memory;
      if (m) {
        setMemory({
          used: m.usedJSHeapSize,
          total: m.totalJSHeapSize,
          limit: m.jsHeapSizeLimit,
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Batteri
  useEffect(() => {
    const nav = navigator as any;
    if (!nav.getBattery) {
      setBattery({ status: "unsupported" });
      return;
    }
    let bat: any;
    const update = () =>
      setBattery({
        status: "ok",
        level: bat.level,
        charging: bat.charging,
        chargingTime: bat.chargingTime,
        dischargingTime: bat.dischargingTime,
      });
    nav.getBattery().then((b: any) => {
      bat = b;
      update();
      b.addEventListener("levelchange", update);
      b.addEventListener("chargingchange", update);
      b.addEventListener("chargingtimechange", update);
      b.addEventListener("dischargingtimechange", update);
    });
    return () => {
      if (!bat) return;
      bat.removeEventListener?.("levelchange", update);
      bat.removeEventListener?.("chargingchange", update);
      bat.removeEventListener?.("chargingtimechange", update);
      bat.removeEventListener?.("dischargingtimechange", update);
    };
  }, []);

  // Motion / Orientation
  const attachMotion = () => {
    const onOrient = (e: DeviceOrientationEvent) => {
      setMotion((prev) => ({
        ...prev,
        orientation: { alpha: e.alpha, beta: e.beta, gamma: e.gamma, absolute: e.absolute },
      }));
    };
    const onMotion = (e: DeviceMotionEvent) => {
      setMotion((prev) => ({
        ...prev,
        acceleration: {
          x: e.acceleration?.x ?? null,
          y: e.acceleration?.y ?? null,
          z: e.acceleration?.z ?? null,
        },
        accelerationG: {
          x: e.accelerationIncludingGravity?.x ?? null,
          y: e.accelerationIncludingGravity?.y ?? null,
          z: e.accelerationIncludingGravity?.z ?? null,
        },
        rotationRate: {
          alpha: e.rotationRate?.alpha ?? null,
          beta: e.rotationRate?.beta ?? null,
          gamma: e.rotationRate?.gamma ?? null,
        },
        interval: e.interval ?? null,
      }));
    };
    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("devicemotion", onMotion);
    setMotion((p) => ({ ...p, granted: true }));
  };

  useEffect(() => {
    const needsIosPerm = typeof (DeviceMotionEvent as any).requestPermission === "function";
    if (needsIosPerm) {
      setMotion((p) => ({ ...p, needsPermission: true }));
    } else {
      attachMotion();
    }
    return () => {
      // best-effort cleanup ignored — handlers anonymous; component lives entire page life
    };
  }, []);

  const requestMotionPermission = async () => {
    try {
      const res = await (DeviceMotionEvent as any).requestPermission();
      if (res === "granted") {
        const orientRes = await (DeviceOrientationEvent as any).requestPermission?.().catch(() => "granted");
        if (orientRes === "granted" || orientRes === undefined) {
          attachMotion();
          setMotion((p) => ({ ...p, needsPermission: false }));
        }
      }
    } catch (e) {
      // ignore
    }
  };

  // GPS
  const startGeo = () => {
    if (!navigator.geolocation) {
      setGeo({ status: "unsupported" });
      return;
    }
    setGeo({ status: "requesting" });
    geoWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeo({
          status: "ok",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeo({ status: "denied" });
        else setGeo({ status: "error", message: err.message });
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  };
  const stopGeo = () => {
    if (geoWatchRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
    setGeo({ status: "idle" });
  };
  useEffect(() => () => stopGeo(), []);

  // Statiske enhets-fakta
  const nav: any = typeof navigator !== "undefined" ? navigator : {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  const screenW = typeof window !== "undefined" ? window.screen.width : null;
  const screenH = typeof window !== "undefined" ? window.screen.height : null;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : null;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : null;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : null;
  const lang = nav.language || "—";
  const platform = nav.platform || "—";
  const cores = nav.hardwareConcurrency ?? null;
  const deviceMemoryGb = nav.deviceMemory ?? null;
  const maxTouch = nav.maxTouchPoints ?? null;
  const online = typeof navigator !== "undefined" ? navigator.onLine : null;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ua = nav.userAgent || "—";

  const ageS = geo.status === "ok" ? Math.max(0, Math.round((now - geo.timestamp) / 1000)) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold flex items-center gap-2">
          <Smartphone size={16} className="text-primary" /> Enhet & sensorer
        </h2>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Info size={11} /> Kun det nettleseren eksponerer
        </span>
      </div>

      {/* GPS */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <MapPin size={14} className="text-primary" /> Posisjon (GPS)
          </h3>
          {geo.status === "ok" || geo.status === "requesting" ? (
            <button onClick={stopGeo} className="text-xs rounded border border-border px-2 py-1 hover:bg-muted">Stopp</button>
          ) : (
            <button onClick={startGeo} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1 hover:bg-primary/90">Start</button>
          )}
        </div>
        {geo.status === "idle" && <p className="text-xs text-muted-foreground">Ikke startet.</p>}
        {geo.status === "requesting" && <p className="text-xs text-muted-foreground">Venter på posisjon…</p>}
        {geo.status === "unsupported" && <p className="text-xs text-destructive">Geolocation ikke støttet i denne nettleseren.</p>}
        {geo.status === "denied" && <p className="text-xs text-destructive">Tilgang nektet — gi tillatelse i nettleserinnstillinger.</p>}
        {geo.status === "error" && <p className="text-xs text-destructive">Feil: {geo.message}</p>}
        {geo.status === "ok" && (
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <Stat label="Breddegrad" value={geo.lat.toFixed(6) + "°"} />
            <Stat label="Lengdegrad" value={geo.lon.toFixed(6) + "°"} />
            <Stat label="Nøyaktighet" value={fmt(geo.accuracy, 1, " m")} />
            <Stat label="Høyde" value={geo.altitude !== null ? fmt(geo.altitude, 1, " m") : "—"} />
            <Stat label="Høyde-nøyaktighet" value={geo.altitudeAccuracy !== null ? fmt(geo.altitudeAccuracy, 1, " m") : "—"} />
            <Stat label="Retning" value={geo.heading !== null ? fmt(geo.heading, 0, "°") : "—"} />
            <Stat label="Fart" value={geo.speed !== null ? fmt((geo.speed ?? 0) * 3.6, 1, " km/t") : "—"} />
            <Stat label="Oppdatert" value={`for ${ageS}s siden`} />
          </div>
        )}
      </section>

      {/* Motion / gyro */}
      <section className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Compass size={14} className="text-primary" /> Gyro & akselerometer
          </h3>
          {motion.needsPermission && (
            <button onClick={requestMotionPermission} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1 hover:bg-primary/90">
              Gi tillatelse
            </button>
          )}
        </div>
        {!motion.granted && !motion.needsPermission && (
          <p className="text-xs text-muted-foreground">Venter på sensordata — beveg telefonen…</p>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <Stat label="Orientering α" value={fmt(motion.orientation.alpha, 1, "°")} hint="kompass-retning" />
          <Stat label="Orientering β" value={fmt(motion.orientation.beta, 1, "°")} hint="forover/bakover-tilt" />
          <Stat label="Orientering γ" value={fmt(motion.orientation.gamma, 1, "°")} hint="venstre/høyre-tilt" />
          <Stat label="Absolutt" value={motion.orientation.absolute ? "Ja" : "Nei"} />
          <Stat label="Akselerasjon X" value={fmt(motion.acceleration.x, 2, " m/s²")} />
          <Stat label="Akselerasjon Y" value={fmt(motion.acceleration.y, 2, " m/s²")} />
          <Stat label="Akselerasjon Z" value={fmt(motion.acceleration.z, 2, " m/s²")} />
          <Stat label="Total m/grav" value={
            (() => {
              const g = motion.accelerationG;
              if (g.x === null || g.y === null || g.z === null) return "—";
              return fmt(Math.sqrt(g.x ** 2 + g.y ** 2 + g.z ** 2), 2, " m/s²");
            })()
          } />
          <Stat label="Rot. α" value={fmt(motion.rotationRate.alpha, 1, " °/s")} />
          <Stat label="Rot. β" value={fmt(motion.rotationRate.beta, 1, " °/s")} />
          <Stat label="Rot. γ" value={fmt(motion.rotationRate.gamma, 1, " °/s")} />
          <Stat label="Sensor-intervall" value={motion.interval !== null ? fmt(motion.interval, 0, " ms") : "—"} />
        </div>
      </section>

      {/* Batteri */}
      <section className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <BatteryFull size={14} className="text-primary" /> Batteri
        </h3>
        {battery?.status === "unsupported" && (
          <p className="text-xs text-muted-foreground">
            Battery API støttes ikke i denne nettleseren (typisk Safari/iOS). Batteritemperatur er aldri tilgjengelig fra nettleser av personvernhensyn.
          </p>
        )}
        {battery?.status === "ok" && (
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <Stat label="Nivå" value={`${Math.round(battery.level * 100)} %`} />
            <Stat label="Lader" value={battery.charging ? "Ja" : "Nei"} />
            <Stat label="Tid til full" value={battery.charging ? secondsToHuman(battery.chargingTime) : "—"} />
            <Stat label="Tid til tom" value={!battery.charging ? secondsToHuman(battery.dischargingTime) : "—"} />
          </div>
        )}
      </section>

      {/* Nettverk */}
      <section className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Wifi size={14} className="text-primary" /> Nettverk
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <Stat label="Online" value={online === null ? "—" : online ? "Ja" : "Nei"} />
          <Stat label="Type" value={conn?.effectiveType ?? "—"} />
          <Stat label="Nedlasting" value={conn?.downlink ? `${conn.downlink} Mbps` : "—"} />
          <Stat label="RTT" value={conn?.rtt ? `${conn.rtt} ms` : "—"} />
          <Stat label="Spar data" value={conn?.saveData === true ? "På" : conn?.saveData === false ? "Av" : "—"} />
          <Stat label="Type fys." value={conn?.type ?? "—"} />
        </div>
      </section>

      {/* Skjerm */}
      <section className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <MonitorSmartphone size={14} className="text-primary" /> Skjerm
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <Stat label="Oppløsning" value={screenW && screenH ? `${screenW}×${screenH}` : "—"} />
          <Stat label="Viewport" value={viewportW && viewportH ? `${viewportW}×${viewportH}` : "—"} />
          <Stat label="Pixel ratio" value={fmt(dpr, 2, "×")} />
          <Stat label="Berørings-punkter" value={maxTouch !== null ? String(maxTouch) : "—"} />
        </div>
      </section>

      {/* System */}
      <section className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Cpu size={14} className="text-primary" /> System
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <Stat label="CPU-kjerner" value={cores !== null ? String(cores) : "—"} />
          <Stat label="Enhetsminne" value={deviceMemoryGb !== null ? `${deviceMemoryGb} GB` : "—"} />
          <Stat label="Plattform" value={platform} />
          <Stat label="Språk" value={lang} />
          <Stat label="Tidssone" value={tz} />
          {memory && <Stat label="JS-heap brukt" value={`${(memory.used / 1048576).toFixed(1)} MB`} />}
          {memory && <Stat label="JS-heap grense" value={`${(memory.limit / 1048576).toFixed(0)} MB`} />}
        </div>
      </section>

      {/* Temperatur-notis */}
      <section className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Activity size={14} className="text-primary" /> Temperatur
        </h3>
        <p className="text-xs text-muted-foreground">
          Nettlesere eksponerer <strong>ikke</strong> batteritemperatur, CPU-temperatur eller andre interne sensorer
          (av personvernhensyn — kan brukes til fingerprinting). Dette krever en native app (Android: <code>BatteryManager.EXTRA_TEMPERATURE</code>;
          iOS gir det ikke engang til native apper). Bruk Netatmo eller andre fysiske sensorer for rom-temperatur.
        </p>
      </section>

      <details className="text-[10px] text-muted-foreground border-t border-border pt-2">
        <summary className="cursor-pointer">User-agent</summary>
        <p className="mt-1 break-all font-mono">{ua}</p>
      </details>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-border/60 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
      {hint && <div className="text-[9px] text-muted-foreground/70 mt-0.5">{hint}</div>}
    </div>
  );
}
