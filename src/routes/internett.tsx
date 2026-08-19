import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gauge,
  Loader2,
  Network,
  Radio,
  RefreshCcw,
  ShieldAlert,
  Signal,
  Timer,
  Wifi,
} from "lucide-react";
import heroImg from "@/assets/got-internett.jpg";

export const Route = createFileRoute("/internett")({
  head: () => ({
    meta: [
      { title: "Internett-test | House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Mål hastighet, ping, jitter, pakketap, DNS- og TLS-tid, båndbredde og stabilitet — med anbefaling om hva som gjør nettet tregt.",
      },
      { property: "og:title", content: "Internett-test" },
      {
        property: "og:description",
        content: "Full analyse av husets internettoppkobling: hastighet, jitter, latens og flaskehalser.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InternettRoute,
});

/* ---------------------------------------------------------------- typer */

type Phase = "idle" | "info" | "latency" | "download" | "upload" | "loaded" | "done" | "error";

type LatencyResult = {
  samples: number[];
  min: number;
  avg: number;
  max: number;
  median: number;
  jitter: number;
  loss: number;
};

type SpeedResult = {
  mbps: number;
  bytes: number;
  seconds: number;
  series: { t: number; mbps: number }[];
};

type ConnInfo = {
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean | null;
  type: string | null;
  online: boolean;
};

type TimingBreakdown = {
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
  totalMs: number | null;
};

type Advice = { level: "good" | "warn" | "bad"; title: string; detail: string };

/* -------------------------------------------------------------- helpers */

const DOWN_URL = (bytes: number) =>
  `https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Math.random()}`;
const UP_URL = () => `https://speed.cloudflare.com/__up?r=${Math.random()}`;

function fmt(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i];
}

function statsFrom(samples: number[], attempts: number): LatencyResult {
  if (!samples.length) {
    return { samples, min: 0, avg: 0, max: 0, median: 0, jitter: 0, loss: 100 };
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  // RFC 3550-lignende jitter: snitt av absolutt endring mellom påfølgende målinger
  let diffSum = 0;
  for (let i = 1; i < samples.length; i++) diffSum += Math.abs(samples[i] - samples[i - 1]);
  const jitter = samples.length > 1 ? diffSum / (samples.length - 1) : 0;
  return {
    samples,
    min: Math.min(...samples),
    avg,
    max: Math.max(...samples),
    median: percentile(samples, 50),
    jitter,
    loss: attempts ? ((attempts - samples.length) / attempts) * 100 : 0,
  };
}

/* --------------------------------------------------------------- måling */

async function measureLatency(
  count: number,
  onTick: (ms: number, i: number) => void,
): Promise<LatencyResult> {
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(DOWN_URL(0), { cache: "no-store", mode: "cors" });
      await res.arrayBuffer();
      const ms = performance.now() - t0;
      samples.push(ms);
      onTick(ms, i);
    } catch {
      /* tapt måling — teller som pakketap */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return statsFrom(samples, count);
}

async function measureDownload(
  totalBytes: number,
  streams: number,
  onProgress: (mbps: number, pct: number) => void,
): Promise<SpeedResult> {
  const per = Math.round(totalBytes / streams);
  const start = performance.now();
  let loaded = 0;
  const series: { t: number; mbps: number }[] = [];

  const tick = () => {
    const sec = (performance.now() - start) / 1000;
    if (sec <= 0) return;
    const mbps = (loaded * 8) / sec / 1e6;
    series.push({ t: sec, mbps });
    onProgress(mbps, Math.min(100, (loaded / totalBytes) * 100));
  };
  const iv = setInterval(tick, 200);

  try {
    await Promise.all(
      Array.from({ length: streams }, async () => {
        const res = await fetch(DOWN_URL(per), { cache: "no-store", mode: "cors" });
        const reader = res.body?.getReader();
        if (!reader) {
          const buf = await res.arrayBuffer();
          loaded += buf.byteLength;
          return;
        }
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value?.byteLength ?? 0;
        }
      }),
    );
  } finally {
    clearInterval(iv);
  }

  const seconds = (performance.now() - start) / 1000;
  tick();
  return { mbps: (loaded * 8) / seconds / 1e6, bytes: loaded, seconds, series };
}

async function measureUpload(
  totalBytes: number,
  streams: number,
  onProgress: (mbps: number, pct: number) => void,
): Promise<SpeedResult> {
  const per = Math.round(totalBytes / streams);
  const chunk = new Uint8Array(per);
  const start = performance.now();
  let sent = 0;
  const series: { t: number; mbps: number }[] = [];

  const iv = setInterval(() => {
    const sec = (performance.now() - start) / 1000;
    if (sec > 0) {
      const mbps = (sent * 8) / sec / 1e6;
      series.push({ t: sec, mbps });
      onProgress(mbps, Math.min(100, (sent / totalBytes) * 100));
    }
  }, 200);

  try {
    await Promise.all(
      Array.from({ length: streams }, async () => {
        await fetch(UP_URL(), { method: "POST", body: chunk, mode: "cors", cache: "no-store" });
        sent += per;
      }),
    );
  } finally {
    clearInterval(iv);
  }

  const seconds = (performance.now() - start) / 1000;
  const mbps = (sent * 8) / seconds / 1e6;
  series.push({ t: seconds, mbps });
  onProgress(mbps, 100);
  return { mbps, bytes: sent, seconds, series };
}

async function measureTimings(): Promise<TimingBreakdown> {
  const url = DOWN_URL(1000);
  try {
    const res = await fetch(url, { cache: "no-store", mode: "cors" });
    await res.arrayBuffer();
  } catch {
    return { dnsMs: null, tcpMs: null, tlsMs: null, ttfbMs: null, totalMs: null };
  }
  await new Promise((r) => setTimeout(r, 250));
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const e = [...entries].reverse().find((x) => x.name.startsWith(url.split("&r=")[0]));
  if (!e) return { dnsMs: null, tcpMs: null, tlsMs: null, ttfbMs: null, totalMs: null };
  const dns = e.domainLookupEnd - e.domainLookupStart;
  const tcp = e.connectEnd - e.connectStart;
  const tls = e.secureConnectionStart > 0 ? e.connectEnd - e.secureConnectionStart : 0;
  return {
    dnsMs: isFinite(dns) ? dns : null,
    tcpMs: isFinite(tcp) ? tcp : null,
    tlsMs: isFinite(tls) ? tls : null,
    ttfbMs: isFinite(e.responseStart - e.requestStart) ? e.responseStart - e.requestStart : null,
    totalMs: isFinite(e.duration) ? e.duration : null,
  };
}

function readConnInfo(): ConnInfo {
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
      type?: string;
    };
  };
  const c = nav.connection;
  return {
    effectiveType: c?.effectiveType ?? null,
    downlinkMbps: typeof c?.downlink === "number" ? c.downlink : null,
    rttMs: typeof c?.rtt === "number" ? c.rtt : null,
    saveData: typeof c?.saveData === "boolean" ? c.saveData : null,
    type: c?.type ?? null,
    online: navigator.onLine,
  };
}

/* ------------------------------------------------------------ anbefaling */

function buildAdvice(
  lat: LatencyResult | null,
  down: SpeedResult | null,
  up: SpeedResult | null,
  timings: TimingBreakdown | null,
  conn: ConnInfo | null,
): Advice[] {
  const out: Advice[] = [];

  if (down) {
    if (down.mbps >= 200)
      out.push({ level: "good", title: "Nedlasting er meget god", detail: `${fmt(down.mbps, 0)} Mbit/s holder til 4K-strømming på flere skjermer samtidig.` });
    else if (down.mbps >= 50)
      out.push({ level: "good", title: "Nedlasting er god", detail: `${fmt(down.mbps, 0)} Mbit/s dekker HD/4K-strømming, videomøter og nedlasting uten problemer.` });
    else if (down.mbps >= 15)
      out.push({ level: "warn", title: "Nedlasting er middels", detail: `${fmt(down.mbps, 0)} Mbit/s går fint til én HD-strøm, men kan bli trangt når flere bruker nettet samtidig.` });
    else
      out.push({ level: "bad", title: "Lav nedlastingshastighet", detail: `${fmt(down.mbps, 0)} Mbit/s. Sjekk om du er på 2,4 GHz-wifi, langt fra ruteren, eller om noen laster ned/strømmer tungt akkurat nå.` });
  }

  if (up) {
    if (up.mbps >= 20) out.push({ level: "good", title: "Opplasting er god", detail: `${fmt(up.mbps, 0)} Mbit/s — videomøter, backup og skylagring går fint.` });
    else if (up.mbps >= 5) out.push({ level: "warn", title: "Opplasting er middels", detail: `${fmt(up.mbps, 0)} Mbit/s. Videomøter fungerer, men samtidig backup kan gjøre nettet tregt for andre.` });
    else out.push({ level: "bad", title: "Lav opplastingshastighet", detail: `${fmt(up.mbps, 0)} Mbit/s. Typisk for kabel-/mobilnett. Skysynk og videosamtaler kan hakke.` });
  }

  if (lat) {
    if (lat.avg <= 25) out.push({ level: "good", title: "Lav responstid", detail: `${fmt(lat.avg, 0)} ms i snitt — utmerket for spill og videosamtaler.` });
    else if (lat.avg <= 60) out.push({ level: "warn", title: "Middels responstid", detail: `${fmt(lat.avg, 0)} ms. Merkes litt i spill, men greit ellers.` });
    else out.push({ level: "bad", title: "Høy responstid", detail: `${fmt(lat.avg, 0)} ms. Ofte wifi-avstand, overbelastet ruter eller mobilt nett. Test med kabel for å utelukke wifi.` });

    if (lat.jitter <= 5) out.push({ level: "good", title: "Stabil linje (lav jitter)", detail: `${fmt(lat.jitter)} ms variasjon — samtaler og spill blir jevne.` });
    else if (lat.jitter <= 20) out.push({ level: "warn", title: "Noe ustabil linje", detail: `${fmt(lat.jitter)} ms jitter. Kan gi korte hakk i video/lyd. Prøv 5 GHz-wifi eller kabel.` });
    else out.push({ level: "bad", title: "Høy jitter", detail: `${fmt(lat.jitter)} ms variasjon. Tegn på wifi-forstyrrelser, full kanal eller noen som bruker båndbredden samtidig.` });

    if (lat.loss > 0)
      out.push({ level: lat.loss > 5 ? "bad" : "warn", title: `Pakketap ${fmt(lat.loss, 0)} %`, detail: "Pakker som forsvinner gir hakking. Sjekk kabler, wifi-dekning og eventuelt ruter-restart." });
  }

  if (timings) {
    if (timings.dnsMs !== null && timings.dnsMs > 120)
      out.push({ level: "warn", title: "Treg DNS-oppslag", detail: `${fmt(timings.dnsMs, 0)} ms før navnet ble slått opp. Bytt DNS til 1.1.1.1 eller 8.8.8.8 i ruteren for raskere sidelasting.` });
    if (timings.tlsMs !== null && timings.tlsMs > 250)
      out.push({ level: "warn", title: "Treg TLS-håndtrykk", detail: `${fmt(timings.tlsMs, 0)} ms. Kan tyde på lang vei til server eller en mellomboks/VPN som bremser.` });
    if (timings.ttfbMs !== null && timings.ttfbMs > 400)
      out.push({ level: "warn", title: "Høy TTFB", detail: `${fmt(timings.ttfbMs, 0)} ms til første byte. Nettet kan være mettet, eller trafikken går via VPN/proxy.` });
  }

  if (conn?.saveData) out.push({ level: "warn", title: "Datasparing er på", detail: "Nettleseren begrenser innhold og hastighet. Skru av datasparing for full fart." });
  if (conn?.effectiveType && ["slow-2g", "2g", "3g"].includes(conn.effectiveType))
    out.push({ level: "bad", title: `Nettleseren rapporterer ${conn.effectiveType}`, detail: "Du er sannsynligvis på mobilt nett med dårlig dekning." });

  if (down && up && down.mbps > 0 && up.mbps / down.mbps < 0.05)
    out.push({ level: "warn", title: "Svært asymmetrisk linje", detail: "Opplasting er under 5 % av nedlasting — typisk kabel-TV-nett eller 4G. Merkes i videomøter." });

  if (lat && down && lat.max > lat.min * 4 && lat.max > 100)
    out.push({ level: "warn", title: "Bufferbloat-tegn", detail: "Responstiden hopper kraftig under last. Slå på SQM/Smart Queue i ruteren hvis den støtter det." });

  if (!out.some((a) => a.level !== "good"))
    out.push({ level: "good", title: "Ingen problemer funnet", detail: "Oppkoblingen ser sunn ut på alle målte punkter." });

  return out;
}

function grade(down: SpeedResult | null, up: SpeedResult | null, lat: LatencyResult | null) {
  if (!down || !lat) return { score: 0, label: "—", color: "text-muted-foreground" };
  let s = 0;
  s += Math.min(45, (down.mbps / 250) * 45);
  s += Math.min(20, ((up?.mbps ?? 0) / 50) * 20);
  s += Math.max(0, 20 - Math.min(20, (lat.avg / 100) * 20));
  s += Math.max(0, 15 - Math.min(15, (lat.jitter / 30) * 15));
  s -= Math.min(20, lat.loss * 2);
  const score = Math.max(0, Math.round(s));
  const label = score >= 85 ? "Utmerket" : score >= 70 ? "Bra" : score >= 50 ? "Middels" : score >= 30 ? "Svakt" : "Dårlig";
  const color =
    score >= 70 ? "text-emerald-300" : score >= 50 ? "text-amber-300" : "text-red-400";
  return { score, label, color };
}

/* ------------------------------------------------------------------ UI */

function Stat({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-400" : "text-foreground";
  return (
    <div className="panel rounded-xl p-4 ring-1 ring-border/60">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-2 flex items-baseline gap-1.5 ${toneCls}`}>
        <span className="text-2xl md:text-3xl font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}

function Sparkline({ series, color }: { series: { t: number; mbps: number }[]; color: string }) {
  if (series.length < 2) return <div className="h-16" />;
  const max = Math.max(...series.map((s) => s.mbps), 1);
  const pts = series
    .map((s, i) => `${(i / (series.length - 1)) * 100},${40 - (s.mbps / max) * 38}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-16">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <polyline points={`0,40 ${pts} 100,40`} fill={color} opacity="0.12" stroke="none" />
    </svg>
  );
}

function InternettRoute() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState(0);
  const [lat, setLat] = useState<LatencyResult | null>(null);
  const [down, setDown] = useState<SpeedResult | null>(null);
  const [up, setUp] = useState<SpeedResult | null>(null);
  const [loadedLat, setLoadedLat] = useState<LatencyResult | null>(null);
  const [timings, setTimings] = useState<TimingBreakdown | null>(null);
  const [conn, setConn] = useState<ConnInfo | null>(null);
  const [pings, setPings] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    setConn(readConnInfo());
    const nav = navigator as Navigator & { connection?: EventTarget };
    const onChange = () => setConn(readConnInfo());
    nav.connection?.addEventListener?.("change", onChange);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      nav.connection?.removeEventListener?.("change", onChange);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setErr(null);
    setLat(null);
    setDown(null);
    setUp(null);
    setLoadedLat(null);
    setTimings(null);
    setPings([]);
    setLive(0);
    setProgress(0);
    try {
      setPhase("info");
      setConn(readConnInfo());
      const t = await measureTimings();
      setTimings(t);

      setPhase("latency");
      const l = await measureLatency(14, (ms) => {
        setPings((p) => [...p, ms]);
        setLive(ms);
      });
      setLat(l);

      setPhase("download");
      const d = await measureDownload(30_000_000, 4, (mbps, pct) => {
        setLive(mbps);
        setProgress(pct);
      });
      setDown(d);

      setPhase("upload");
      setProgress(0);
      const u = await measureUpload(8_000_000, 3, (mbps, pct) => {
        setLive(mbps);
        setProgress(pct);
      });
      setUp(u);

      // Ping under samtidig last → avslører bufferbloat
      setPhase("loaded");
      setProgress(0);
      const loadPromise = measureDownload(20_000_000, 3, (_m, pct) => setProgress(pct)).catch(() => null);
      const ll = await measureLatency(8, (ms) => setLive(ms));
      await loadPromise;
      setLoadedLat(ll);

      setRanAt(new Date().toISOString());
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ukjent feil under måling");
      setPhase("error");
    } finally {
      running.current = false;
    }
  }, []);

  const advice = useMemo(
    () => (phase === "done" ? buildAdvice(lat, down, up, timings, conn) : []),
    [phase, lat, down, up, timings, conn],
  );

  const g = useMemo(() => grade(down, up, lat), [down, up, lat]);

  const bloat = useMemo(() => {
    if (!lat || !loadedLat) return null;
    return loadedLat.avg - lat.avg;
  }, [lat, loadedLat]);

  const busy = phase !== "idle" && phase !== "done" && phase !== "error";
  const phaseLabel: Record<Phase, string> = {
    idle: "Klar",
    info: "Leser nettverksinfo…",
    latency: "Måler ping og jitter…",
    download: "Måler nedlasting…",
    upload: "Måler opplasting…",
    loaded: "Måler responstid under last…",
    done: "Ferdig",
    error: "Feil",
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Nettverket"
        title="Internett-test"
        subtitle="Hastighet, ping, jitter, pakketap, DNS/TLS og stabilitet — med anbefaling om hva som gjør nettet tregt."
        image={heroImg}
        compact
      />

      <section className="container mx-auto px-4 py-8 space-y-8">
        {/* Kjør-panel */}
        <div className="panel rounded-2xl p-5 ring-1 ring-border/60">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Status</div>
              <div className="mt-1 text-lg font-medium flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {phaseLabel[phase]}
              </div>
              {ranAt && phase === "done" && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Sist målt {new Date(ranAt).toLocaleString("nb-NO")}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {busy && (
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums text-primary">
                    {phase === "latency" || phase === "loaded" ? `${fmt(live, 0)} ms` : `${fmt(live, 1)} Mbit/s`}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Live</div>
                </div>
              )}
              <Button onClick={run} disabled={busy} size="lg" className="gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                {phase === "done" ? "Kjør på nytt" : "Start test"}
              </Button>
            </div>
          </div>

          {busy && (
            <div className="mt-4 h-1.5 rounded-full bg-background/60 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${Math.max(3, progress)}%` }}
              />
            </div>
          )}

          {err && (
            <div className="mt-4 flex items-start gap-2 text-sm text-red-400">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>

        {/* Hovedtall */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            icon={ArrowDownToLine}
            label="Nedlasting"
            value={down ? fmt(down.mbps, 1) : "—"}
            unit="Mbit/s"
            hint={down ? `${(down.bytes / 1e6).toFixed(0)} MB på ${down.seconds.toFixed(1)} s` : "Ikke målt"}
            tone={down ? (down.mbps >= 50 ? "good" : down.mbps >= 15 ? "warn" : "bad") : "default"}
          />
          <Stat
            icon={ArrowUpFromLine}
            label="Opplasting"
            value={up ? fmt(up.mbps, 1) : "—"}
            unit="Mbit/s"
            hint={up ? `${(up.bytes / 1e6).toFixed(0)} MB på ${up.seconds.toFixed(1)} s` : "Ikke målt"}
            tone={up ? (up.mbps >= 20 ? "good" : up.mbps >= 5 ? "warn" : "bad") : "default"}
          />
          <Stat
            icon={Timer}
            label="Ping (snitt)"
            value={lat ? fmt(lat.avg, 0) : "—"}
            unit="ms"
            hint={lat ? `min ${fmt(lat.min, 0)} · maks ${fmt(lat.max, 0)} ms` : "Ikke målt"}
            tone={lat ? (lat.avg <= 25 ? "good" : lat.avg <= 60 ? "warn" : "bad") : "default"}
          />
          <Stat
            icon={Activity}
            label="Jitter"
            value={lat ? fmt(lat.jitter, 1) : "—"}
            unit="ms"
            hint={lat ? `pakketap ${fmt(lat.loss, 0)} %` : "Ikke målt"}
            tone={lat ? (lat.jitter <= 5 ? "good" : lat.jitter <= 20 ? "warn" : "bad") : "default"}
          />
        </div>

        {/* Karakter */}
        {phase === "done" && (
          <div className="panel rounded-2xl p-5 ring-1 ring-border/60 flex flex-wrap items-center gap-6">
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border/50" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${(g.score / 100) * 99.9} 99.9`}
                  className={g.color}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className={`text-2xl font-semibold tabular-nums ${g.color}`}>{g.score}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">av 100</div>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Samlet vurdering</div>
              <div className={`text-2xl font-semibold ${g.color}`}>{g.label}</div>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Basert på nedlasting, opplasting, responstid, jitter og pakketap. Wifi måles alltid litt lavere enn
                kabel — kjør testen begge steder for å se hva som faktisk begrenser deg.
              </p>
            </div>
          </div>
        )}

        {/* Grafer */}
        {(down || up) && (
          <div className="grid md:grid-cols-2 gap-4">
            {down && (
              <div className="panel rounded-2xl p-4 ring-1 ring-border/60">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  <ArrowDownToLine className="w-3.5 h-3.5" /> Nedlasting over tid
                </div>
                <Sparkline series={down.series} color="#38bdf8" />
                <div className="text-xs text-muted-foreground">Topp {fmt(Math.max(...down.series.map((s) => s.mbps)), 1)} Mbit/s</div>
              </div>
            )}
            {up && (
              <div className="panel rounded-2xl p-4 ring-1 ring-border/60">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  <ArrowUpFromLine className="w-3.5 h-3.5" /> Opplasting over tid
                </div>
                <Sparkline series={up.series} color="#34d399" />
                <div className="text-xs text-muted-foreground">Topp {fmt(Math.max(...up.series.map((s) => s.mbps)), 1)} Mbit/s</div>
              </div>
            )}
          </div>
        )}

        {/* Ping-serie */}
        {pings.length > 1 && (
          <div className="panel rounded-2xl p-4 ring-1 ring-border/60">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              <Radio className="w-3.5 h-3.5" /> Ping-målinger (ms)
            </div>
            <div className="flex items-end gap-1 h-20">
              {pings.map((p, i) => {
                const max = Math.max(...pings, 1);
                const h = Math.max(4, (p / max) * 100);
                const tone = p <= 30 ? "bg-emerald-400" : p <= 70 ? "bg-amber-400" : "bg-red-400";
                return <div key={i} className={`flex-1 rounded-t ${tone}`} style={{ height: `${h}%` }} title={`${p.toFixed(0)} ms`} />;
              })}
            </div>
            {lat && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div>Median: <span className="text-foreground tabular-nums">{fmt(lat.median, 0)} ms</span></div>
                <div>P95: <span className="text-foreground tabular-nums">{fmt(percentile(lat.samples, 95), 0)} ms</span></div>
                <div>Min: <span className="text-foreground tabular-nums">{fmt(lat.min, 0)} ms</span></div>
                <div>Maks: <span className="text-foreground tabular-nums">{fmt(lat.max, 0)} ms</span></div>
              </div>
            )}
          </div>
        )}

        {/* Detaljer */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="panel rounded-2xl p-4 ring-1 ring-border/60">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
              <Network className="w-3.5 h-3.5" /> Tilkoblingsfaser
            </div>
            <Row label="DNS-oppslag" value={timings?.dnsMs != null ? `${fmt(timings.dnsMs, 0)} ms` : "—"} />
            <Row label="TCP-tilkobling" value={timings?.tcpMs != null ? `${fmt(timings.tcpMs, 0)} ms` : "—"} />
            <Row label="TLS-håndtrykk" value={timings?.tlsMs != null ? `${fmt(timings.tlsMs, 0)} ms` : "—"} />
            <Row label="Tid til første byte" value={timings?.ttfbMs != null ? `${fmt(timings.ttfbMs, 0)} ms` : "—"} />
            <Row label="Total forespørsel" value={timings?.totalMs != null ? `${fmt(timings.totalMs, 0)} ms` : "—"} />
            <Row
              label="Ping under last (bufferbloat)"
              value={bloat != null ? `+${fmt(bloat, 0)} ms` : "—"}
              tone={bloat == null ? "default" : bloat < 30 ? "good" : bloat < 100 ? "warn" : "bad"}
            />
          </div>

          <div className="panel rounded-2xl p-4 ring-1 ring-border/60">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
              <Wifi className="w-3.5 h-3.5" /> Enhet og nettverk
            </div>
            <Row label="Tilkoblet" value={conn?.online ? "Ja" : "Nei"} tone={conn?.online ? "good" : "bad"} />
            <Row label="Nettleserens vurdering" value={conn?.effectiveType ?? "ukjent"} />
            <Row label="Estimert båndbredde" value={conn?.downlinkMbps != null ? `${fmt(conn.downlinkMbps, 1)} Mbit/s` : "—"} />
            <Row label="Estimert RTT" value={conn?.rttMs != null ? `${fmt(conn.rttMs, 0)} ms` : "—"} />
            <Row label="Tilkoblingstype" value={conn?.type ?? "ukjent"} />
            <Row label="Datasparing" value={conn?.saveData == null ? "—" : conn.saveData ? "På" : "Av"} tone={conn?.saveData ? "warn" : "default"} />
          </div>
        </div>

        {/* Anbefaling */}
        {advice.length > 0 && (
          <div className="panel rounded-2xl p-5 ring-1 ring-border/60">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-4">
              <Gauge className="w-3.5 h-3.5" /> Anbefaling og mulige årsaker
            </div>
            <div className="space-y-3">
              {advice.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      a.level === "good" ? "bg-emerald-400" : a.level === "warn" ? "bg-amber-400" : "bg-red-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sjekkliste */}
        <div className="panel rounded-2xl p-5 ring-1 ring-border/60">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
            <Signal className="w-3.5 h-3.5" /> Vanlige årsaker til tregt nett
          </div>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
            <li><span className="text-foreground">2,4 GHz i stedet for 5 GHz:</span> lengre rekkevidde, men mye lavere fart og full av naboer. Koble til 5 GHz-nettet nær ruteren.</li>
            <li><span className="text-foreground">Kanalkollisjon:</span> mange naboer på samme wifi-kanal gir jitter og hakking. Sett ruteren til «auto» eller en ledig kanal (1/6/11 på 2,4 GHz).</li>
            <li><span className="text-foreground">Avstand og vegger:</span> betong og gulv stjeler signal — vurder mesh eller aksesspunkt.</li>
            <li><span className="text-foreground">Bufferbloat:</span> nedlasting fyller køen i ruteren og pingen skyter i været. Slå på SQM/Smart Queue.</li>
            <li><span className="text-foreground">Bakgrunnstrafikk:</span> skybackup, spilloppdateringer, overvåkingskamera og TV-strømming spiser båndbredden.</li>
            <li><span className="text-foreground">VPN eller treg DNS:</span> legger til forsinkelse på alt. Test uten VPN og med 1.1.1.1 som DNS.</li>
            <li><span className="text-foreground">Gammel ruter/utstyr:</span> Wi-Fi 4/5-utstyr begrenser farten selv med rask fiber.</li>
          </ul>
          <p className="mt-4 text-[11px] text-muted-foreground/80">
            Målingene gjøres direkte fra denne enheten mot Cloudflares måleservere. Resultatet viser hva
            <em> denne </em>enheten faktisk får — ikke nødvendigvis hva fiberlinjen leverer.
          </p>
        </div>
      </section>
    </PageShell>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-400" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground truncate">{label}</span>
      <span className={`text-sm tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}
