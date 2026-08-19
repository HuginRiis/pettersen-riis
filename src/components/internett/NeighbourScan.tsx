import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Radar, Router, Users, Waves } from "lucide-react";

/**
 * «Hvem forstyrrer nettet?»
 *
 * Nettleseren kan ikke skanne nabolagets wifi direkte, men vi kan måle
 * oppførselen til linja over tid og lese mønsteret:
 *  - jevn, lav ping        → ingen forstyrrelse
 *  - periodiske spisser    → annen trafikk i huset (backup, strømming, kamera)
 *  - kaotisk jitter/tap    → radiostøy / naboer på samme kanal
 *  - fallende ledig fart   → noen spiser båndbredden akkurat nå
 * I tillegg prøver vi å nå vanlige ruter-adresser for å se hvilket lokalnett
 * enheten står på.
 */

type Sample = { t: number; ping: number | null; mbps: number | null };

type Finding = { level: "good" | "warn" | "bad"; title: string; detail: string };

const PING_URL = () => `https://speed.cloudflare.com/__down?bytes=1000&r=${Math.random()}`;
const PROBE_URL = (bytes: number) => `https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Math.random()}`;

const GATEWAYS = [
  "192.168.1.1",
  "192.168.0.1",
  "192.168.10.1",
  "192.168.86.1",
  "10.0.0.1",
  "10.0.1.1",
  "172.20.10.1",
];

async function pingOnce(): Promise<number | null> {
  const t0 = performance.now();
  try {
    const res = await fetch(PING_URL(), { cache: "no-store", signal: AbortSignal.timeout(4000) });
    await res.arrayBuffer();
    return performance.now() - t0;
  } catch {
    return null;
  }
}

async function quickThroughput(bytes = 1_500_000): Promise<number | null> {
  const t0 = performance.now();
  try {
    const res = await fetch(PROBE_URL(bytes), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const buf = await res.arrayBuffer();
    const sec = (performance.now() - t0) / 1000;
    if (sec <= 0) return null;
    return (buf.byteLength * 8) / sec / 1e6;
  } catch {
    return null;
  }
}

async function probeHost(ip: string): Promise<boolean> {
  // no-cors: vi ser ikke svaret, men en rask "resolve" betyr at noe svarer.
  const t0 = performance.now();
  try {
    await fetch(`http://${ip}/`, {
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    return performance.now() - t0 < 1400;
  } catch {
    return false;
  }
}

function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
}

export function NeighbourScan() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [hosts, setHosts] = useState<string[] | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<{
    basePing: number;
    spikes: number;
    lostPct: number;
    bestMbps: number;
    worstMbps: number;
    stealPct: number;
  } | null>(null);
  const abort = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    abort.current = false;
    setSamples([]);
    setFindings([]);
    setSummary(null);
    setHosts(null);
    setProgress(0);

    const collected: Sample[] = [];
    const ROUNDS = 24; // ca. 45 sekunder
    const t0 = performance.now();

    for (let i = 0; i < ROUNDS; i++) {
      if (abort.current) break;
      const ping = await pingOnce();
      // Hver fjerde runde tar vi en liten fartsprøve for å se hvor mye
      // kapasitet som er ledig akkurat da.
      const mbps = i % 4 === 1 ? await quickThroughput() : null;
      const s: Sample = { t: (performance.now() - t0) / 1000, ping, mbps };
      collected.push(s);
      setSamples([...collected]);
      setProgress(Math.round(((i + 1) / ROUNDS) * 100));
      await new Promise((r) => setTimeout(r, 900));
    }

    // Lokalnett-sonde
    const found: string[] = [];
    for (const ip of GATEWAYS) {
      if (abort.current) break;
      if (await probeHost(ip)) found.push(ip);
    }
    setHosts(found);

    // Analyse
    const pings = collected.map((s) => s.ping).filter((p): p is number => p != null);
    const lost = collected.length - pings.length;
    const base = median(pings);
    const spikes = pings.filter((p) => p > base * 2 + 15).length;
    const speeds = collected.map((s) => s.mbps).filter((m): m is number => m != null && m > 0);
    const best = speeds.length ? Math.max(...speeds) : 0;
    const worst = speeds.length ? Math.min(...speeds) : 0;
    const steal = best > 0 ? Math.max(0, Math.round(((best - worst) / best) * 100)) : 0;
    const lostPct = collected.length ? (lost / collected.length) * 100 : 0;

    const f: Finding[] = [];

    if (spikes === 0 && lostPct < 2) {
      f.push({
        level: "good",
        title: "Ingen tegn til forstyrrelse akkurat nå",
        detail: `Pingen holdt seg jevnt rundt ${Math.round(base)} ms gjennom hele måleperioden — linja er din alene.`,
      });
    }
    if (spikes > 0 && spikes <= 3) {
      f.push({
        level: "warn",
        title: `${spikes} korte pingspisser`,
        detail:
          "Typisk mønster for enheter som «våkner» innimellom: skybackup, oppdateringer, overvåkingskamera eller en telefon som synker bilder.",
      });
    }
    if (spikes > 3) {
      f.push({
        level: "bad",
        title: `${spikes} pingspisser — noen andre bruker nettet`,
        detail:
          "Gjentatte utslag betyr at noe annet i huset laster tungt samtidig (strømming i 4K, nedlasting av spill, backup). Sjekk hvilke enheter som er aktive, eller slå på SQM/Smart Queue i ruteren.",
      });
    }
    if (lostPct >= 5) {
      f.push({
        level: "bad",
        title: `Pakketap ${lostPct.toFixed(0)} %`,
        detail:
          "Tap uten last skyldes nesten alltid radiostøy: naboer på samme wifi-kanal, mikrobølgeovn, babycall eller for lang avstand. Bytt kanal eller gå over på 5 GHz.",
      });
    } else if (lostPct > 0) {
      f.push({
        level: "warn",
        title: `Litt pakketap (${lostPct.toFixed(0)} %)`,
        detail: "Små tap tyder på svakt eller støyende signal der du står nå.",
      });
    }
    if (steal >= 40) {
      f.push({
        level: "bad",
        title: `Ledig kapasitet svinger ${steal} %`,
        detail: `Farten falt fra ${best.toFixed(0)} til ${worst.toFixed(0)} Mbit/s uten at du gjorde noe — det er andre enheter som tar båndbredden i perioder.`,
      });
    } else if (steal >= 15) {
      f.push({
        level: "warn",
        title: `Moderat svingning i ledig kapasitet (${steal} %)`,
        detail: "Normalt i et hus med flere enheter, men verdt å følge med på hvis det blir verre om kvelden.",
      });
    } else if (speeds.length) {
      f.push({
        level: "good",
        title: "Stabil ledig båndbredde",
        detail: `Fartsprøvene lå jevnt rundt ${best.toFixed(0)} Mbit/s — ingen som stjeler linja.`,
      });
    }
    if (found.length === 0) {
      f.push({
        level: "warn",
        title: "Fant ingen ruter på vanlige adresser",
        detail:
          "Nettleseren blokkerer skanning av lokalnettet av sikkerhetsgrunner, eller ruteren bruker en uvanlig adresse. Det påvirker ikke målingene over.",
      });
    } else {
      f.push({
        level: "good",
        title: `Ruter funnet på ${found.join(", ")}`,
        detail: "Du står på et vanlig hjemmenett. Åpne denne adressen i nettleseren for å se tilkoblede enheter og wifi-kanal.",
      });
    }

    setSummary({ basePing: base, spikes, lostPct, bestMbps: best, worstMbps: worst, stealPct: steal });
    setFindings(f);
    setRunning(false);
  }, []);

  const maxPing = Math.max(60, ...samples.map((s) => s.ping ?? 0));

  return (
    <div className="panel rounded-2xl p-5 ring-1 ring-border/60">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <Radar className="w-3.5 h-3.5" /> Nettvaner — hvem forstyrrer nettet her?
        </div>
        <Button size="sm" variant="secondary" onClick={run} disabled={running}>
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Lytter… {progress} %
            </>
          ) : (
            <>
              <Waves className="w-4 h-4" /> Start 45 s lytting
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Denne testen lytter på linja i tre kvarter minutt uten å belaste den selv. Mønsteret i ping,
        pakketap og ledig kapasitet avslører om noen andre i huset – eller naboens wifi – forstyrrer
        der du står nå.
      </p>

      {samples.length > 0 && (
        <div className="mb-4">
          <div className="flex items-end gap-[2px] h-24">
            {samples.map((s, i) => {
              const h = s.ping == null ? 100 : Math.min(100, (s.ping / maxPing) * 100);
              const bad = s.ping == null;
              const spike = s.ping != null && summary != null && s.ping > summary.basePing * 2 + 15;
              return (
                <div
                  key={i}
                  title={s.ping == null ? "tapt" : `${Math.round(s.ping)} ms`}
                  className={`flex-1 rounded-sm ${
                    bad ? "bg-red-500/80" : spike ? "bg-amber-400/80" : "bg-emerald-400/70"
                  }`}
                  style={{ height: `${Math.max(4, h)}%` }}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0 s</span>
            <span>ping over tid (grønn = rolig, gul = spiss, rød = tapt)</span>
            <span>{Math.round(samples[samples.length - 1]!.t)} s</span>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Mini label="Rolig ping" value={`${Math.round(summary.basePing)} ms`} icon={<Waves className="w-3.5 h-3.5" />} />
          <Mini label="Forstyrrelser" value={`${summary.spikes}`} icon={<Users className="w-3.5 h-3.5" />} />
          <Mini label="Pakketap" value={`${summary.lostPct.toFixed(0)} %`} icon={<Radar className="w-3.5 h-3.5" />} />
          <Mini
            label="Kapasitet stjålet"
            value={`${summary.stealPct} %`}
            icon={<Router className="w-3.5 h-3.5" />}
          />
        </div>
      )}

      {hosts && hosts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {hosts.map((h) => (
            <a
              key={h}
              href={`http://${h}/`}
              target="_blank"
              rel="noreferrer"
              className="text-xs rounded-full px-3 py-1 ring-1 ring-border/60 hover:bg-foreground/5"
            >
              <Router className="inline w-3 h-3 mr-1" /> {h}
            </a>
          ))}
        </div>
      )}

      {findings.length > 0 && (
        <div className="space-y-3">
          {findings.map((a, i) => (
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
      )}
    </div>
  );
}

function Mini({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 ring-1 ring-border/60">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-lg tabular-nums mt-1">{value}</div>
    </div>
  );
}
