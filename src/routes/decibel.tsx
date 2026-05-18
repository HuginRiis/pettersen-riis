import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { Mic, MicOff, Waves, AlertTriangle, Volume2, Radio, Zap, Tv, Film, Music2, Activity } from "lucide-react";
import heroImg from "@/assets/got-decibel.jpg";
import { VuMeter } from "@/components/decibel/VuMeter";
import { DbHistoryChart } from "@/components/decibel/DbHistoryChart";
import { SpectrumChart } from "@/components/decibel/SpectrumChart";

export const Route = createFileRoute("/decibel")({
  component: DecibelPage,
  head: () => ({
    meta: [
      { title: "Decibelmåler & lydanalyse" },
      { name: "description", content: "Mål dB, frekvensspektrum, klang/etterklang (RT60) og oppdag problemer for tale og konsert." },
    ],
  }),
});

// ISO-oktav-bånd 31 Hz – 16 kHz
const OCTAVE_BANDS: { center: number; label: string; lo: number; hi: number; role: string }[] = [
  { center: 31, label: "31", lo: 22, hi: 44, role: "Sub-bass" },
  { center: 63, label: "63", lo: 44, hi: 88, role: "Bass" },
  { center: 125, label: "125", lo: 88, hi: 177, role: "Lavmellom / mudder" },
  { center: 250, label: "250", lo: 177, hi: 355, role: "Varme / boom" },
  { center: 500, label: "500", lo: 355, hi: 710, role: "Tale-fylde" },
  { center: 1000, label: "1k", lo: 710, hi: 1420, role: "Tale-kjerne" },
  { center: 2000, label: "2k", lo: 1420, hi: 2840, role: "Tale-klarhet" },
  { center: 4000, label: "4k", lo: 2840, hi: 5680, role: "Konsonanter (s, t)" },
  { center: 8000, label: "8k", lo: 5680, hi: 11360, role: "Luft / hvesing" },
  { center: 16000, label: "16k", lo: 11360, hi: 22000, role: "Glans" },
];

type ScanResult = {
  rt60: number | null;
  echoMs: number | null;
  flutter: boolean;
  notes: string[];
};

function DecibelPage() {
  const [running, setRunning] = useState(false);
  const [db, setDb] = useState(0);
  const [peak, setPeak] = useState(0);
  const [minDb, setMinDb] = useState<number | null>(null);
  const [avg, setAvg] = useState(0);
  const [bands, setBands] = useState<number[]>(() => OCTAVE_BANDS.map(() => -100));
  const [dominantHz, setDominantHz] = useState<number | null>(null);
  const [clipping, setClipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calibration, setCalibration] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("db-calibration") ?? "0");
  });
  const [scanState, setScanState] = useState<"idle" | "arming" | "listening" | "done">("idle");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [pitchStats, setPitchStats] = useState<{ vibratoCents: number; vibratoHz: number; chorus: boolean } | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const samplesRef = useRef<number[]>([]);
  const pitchHistRef = useRef<{ t: number; hz: number }[]>([]);
  const lastHistoryPushRef = useRef(0);
  const timeBufRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    localStorage.setItem("db-calibration", String(calibration));
  }, [calibration]);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
    setRunning(false);
    setScanState("idle");
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(analyser.fftSize);

      try {
        wakeLockRef.current = await (navigator as any).wakeLock?.request("screen");
      } catch {}

      const freqBuf = new Float32Array(analyser.frequencyBinCount);
      const timeBuf = new Float32Array(analyser.fftSize);
      const sr = ctx.sampleRate;
      const binHz = sr / analyser.fftSize;
      samplesRef.current = [];
      let localPeak = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(timeBuf);
        analyser.getFloatFrequencyData(freqBuf);

        // RMS → dBFS → SPL
        let sum = 0;
        let clipCount = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = timeBuf[i];
          sum += v * v;
          if (Math.abs(v) > 0.98) clipCount++;
        }
        const rms = Math.sqrt(sum / timeBuf.length);
        const dbfs = 20 * Math.log10(rms || 1e-8);
        const spl = Math.max(0, Math.min(140, dbfs + 94 + calibration));
        setDb(spl);
        setClipping(clipCount > 4);
        if (spl > localPeak) {
          localPeak = spl;
          setPeak(spl);
        }
        samplesRef.current.push(spl);
        if (samplesRef.current.length > 600) samplesRef.current.shift();
        const a = samplesRef.current.reduce((x, y) => x + y, 0) / samplesRef.current.length;
        setAvg(a);
        // Min — bare når signalet er over ~ridge for å unngå stille mikrofon-floor
        if (spl > 25) {
          setMinDb((prev) => (prev === null ? spl : Math.min(prev, spl)));
        }

        // Oktav-bånd RMS (gjennomsnitt av dB i båndet)
        const bandVals = OCTAVE_BANDS.map((b) => {
          const i0 = Math.max(0, Math.floor(b.lo / binHz));
          const i1 = Math.min(freqBuf.length - 1, Math.ceil(b.hi / binHz));
          if (i1 <= i0) return -100;
          let s = 0;
          let n = 0;
          for (let i = i0; i <= i1; i++) {
            if (Number.isFinite(freqBuf[i])) {
              s += freqBuf[i];
              n++;
            }
          }
          return n > 0 ? s / n : -100;
        });
        setBands(bandVals);

        // Dominant frekvens
        let maxI = 0;
        let maxV = -Infinity;
        for (let i = 2; i < freqBuf.length; i++) {
          if (freqBuf[i] > maxV) {
            maxV = freqBuf[i];
            maxI = i;
          }
        }
        const domHz = maxV > -70 ? Math.round(maxI * binHz) : null;
        setDominantHz(domHz);

        // Pitch-historikk for vibrato/chorus
        const nowT = performance.now();
        if (domHz && domHz > 60 && domHz < 4000 && maxV > -55) {
          pitchHistRef.current.push({ t: nowT, hz: domHz });
        }
        // Behold siste 2 sek
        pitchHistRef.current = pitchHistRef.current.filter((p) => nowT - p.t < 2000);

        // Push til SPL-historikk hver ~100 ms
        if (nowT - lastHistoryPushRef.current > 100) {
          lastHistoryPushRef.current = nowT;
          setHistory((h) => {
            const next = [...h, spl];
            if (next.length > 600) next.shift();
            return next;
          });

          // Beregn vibrato (modulasjonsrate + dybde i cents)
          const pts = pitchHistRef.current;
          if (pts.length > 20) {
            const hzs = pts.map((p) => p.hz);
            const mean = hzs.reduce((x, y) => x + y, 0) / hzs.length;
            // Cents-dev std
            const cents = hzs.map((h) => 1200 * Math.log2(h / mean));
            const meanC = cents.reduce((x, y) => x + y, 0) / cents.length;
            const std = Math.sqrt(cents.reduce((s, c) => s + (c - meanC) ** 2, 0) / cents.length);
            // Tell nullkrysninger i cents → rate
            let zc = 0;
            for (let i = 1; i < cents.length; i++) {
              if ((cents[i - 1] - meanC) * (cents[i] - meanC) < 0) zc++;
            }
            const durS = (pts[pts.length - 1].t - pts[0].t) / 1000;
            const rateHz = durS > 0 ? zc / (2 * durS) : 0;
            // Chorus: flere stabile pitcher samtidig → bredt spektralt fingeravtrykk i 200-2k
            const presence = freqBuf.slice(
              Math.floor(200 / binHz),
              Math.floor(2000 / binHz),
            );
            let peaks = 0;
            for (let i = 2; i < presence.length - 2; i++) {
              if (
                presence[i] > -50 &&
                presence[i] > presence[i - 1] &&
                presence[i] > presence[i + 1] &&
                presence[i] - Math.min(presence[i - 2], presence[i + 2]) > 6
              ) {
                peaks++;
              }
            }
            setPitchStats({
              vibratoCents: Math.round(std * 2), // ± cents (1 std ≈ halv-bredde)
              vibratoHz: Math.round(rateHz * 10) / 10,
              chorus: peaks > 8,
            });
          } else {
            setPitchStats(null);
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setRunning(true);
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke starte mikrofon");
    }
  };

  // RT60 / etterklang-scan: spill inn ~3 sek, finn peak (klapp), mål henfall fra -5 til -25 dB → ×3 ≈ RT60
  const runScan = async () => {
    if (!ctxRef.current || !analyserRef.current || !streamRef.current) return;
    setScanState("arming");
    setScanResult(null);

    // 1.5 sek "arming"-nedtelling slik at brukeren kan posisjonere mikrofonen
    await new Promise((r) => setTimeout(r, 1500));
    setScanState("listening");

    const ctx = ctxRef.current;
    const sr = ctx.sampleRate;
    const durationSec = 3;
    const frameMs = 20;
    const totalFrames = Math.ceil((durationSec * 1000) / frameMs);
    const analyser = analyserRef.current;
    const buf = new Float32Array(analyser.fftSize);
    const levels: { t: number; db: number }[] = [];
    const start = performance.now();

    await new Promise<void>((resolve) => {
      const sample = () => {
        const t = performance.now() - start;
        analyser.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const dbfs = 20 * Math.log10(Math.sqrt(s / buf.length) || 1e-8);
        levels.push({ t, db: dbfs });
        if (levels.length >= totalFrames) resolve();
        else setTimeout(sample, frameMs);
      };
      sample();
    });

    // Finn peak
    let peakIdx = 0;
    for (let i = 1; i < levels.length; i++) {
      if (levels[i].db > levels[peakIdx].db) peakIdx = i;
    }
    const peakDb = levels[peakIdx].db;
    const peakT = levels[peakIdx].t;

    // Mål henfall etter peak
    let t5: number | null = null;
    let t25: number | null = null;
    for (let i = peakIdx + 1; i < levels.length; i++) {
      const drop = peakDb - levels[i].db;
      if (t5 === null && drop >= 5) t5 = levels[i].t;
      if (t5 !== null && drop >= 25) {
        t25 = levels[i].t;
        break;
      }
    }
    let rt60: number | null = null;
    if (t5 !== null && t25 !== null) {
      // T20 → ×3 ≈ RT60
      rt60 = ((t25 - t5) / 1000) * 3;
    }

    // Echo / distinkt refleksjon: se etter sekundær topp 20–200 ms etter peak
    let echoMs: number | null = null;
    let secondPeakDb = -Infinity;
    for (let i = peakIdx + 1; i < levels.length; i++) {
      const dt = levels[i].t - peakT;
      if (dt < 20) continue;
      if (dt > 200) break;
      if (levels[i].db > secondPeakDb) {
        secondPeakDb = levels[i].db;
        if (peakDb - levels[i].db < 12) echoMs = Math.round(dt);
      }
    }

    // Flutter-echo: rask veksling i henfallet
    let flips = 0;
    for (let i = peakIdx + 2; i < Math.min(peakIdx + 20, levels.length); i++) {
      const a = levels[i - 1].db - levels[i - 2].db;
      const b = levels[i].db - levels[i - 1].db;
      if (a * b < 0 && Math.abs(b) > 2) flips++;
    }
    const flutter = flips >= 4;

    const notes: string[] = [];
    if (peakDb < -40) notes.push("Signalet var svakt — klapp hardt nær mikrofonen og prøv igjen.");
    if (rt60 !== null) {
      if (rt60 < 0.3) notes.push("Tørt rom — bra for tale og opptak.");
      else if (rt60 < 0.6) notes.push("Naturlig klang — egnet for tale og akustisk musikk.");
      else if (rt60 < 1.0) notes.push("Romklang merkes tydelig — tale kan bli utydelig uten PA-justering.");
      else notes.push("Lang etterklang — vurder absorbenter, gardiner eller akustikkpaneler.");
    }
    if (echoMs !== null) notes.push(`Distinkt refleksjon påvist ~${echoMs} ms etter direkte lyd (kan høres som eko).`);
    if (flutter) notes.push("Flutter-eko mistenkt — paralelle harde flater kaster lyden frem og tilbake.");
    if (!notes.length) notes.push("Ingen tydelige akustiske problemer påvist.");

    setScanResult({ rt60, echoMs, flutter, notes });
    setScanState("done");
  };

  useEffect(() => () => stop(), []);
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === "visible" && running && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock?.request("screen");
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running]);

  const level = Math.min(100, (db / 120) * 100);
  const dbColor = db < 60 ? "bg-emerald-500" : db < 85 ? "bg-amber-500" : "bg-destructive";

  // Tale-balansetips basert på bånd-energien
  const balanceHints = (() => {
    if (!running) return [];
    const tips: string[] = [];
    const lowMid = (bands[2] + bands[3]) / 2;
    const presence = (bands[5] + bands[6]) / 2;
    const sibilance = bands[7];
    if (lowMid > presence + 6) tips.push("Mudrent: kutt 3–5 dB rundt 200–300 Hz for klarere tale.");
    if (presence > lowMid + 10) tips.push("Tynn lyd: løft 2–3 dB rundt 200 Hz for varme.");
    if (sibilance > presence + 6) tips.push("Skarpe s-er: bruk de-esser eller demp 4–6 kHz.");
    if (bands[0] > -40) tips.push("Mye sub-bass — kan være rumling eller vindstøy.");
    return tips;
  })();

  // Klang/ekko-prosent (0–100). RT60 0.2s→0%, 1.5s→100%
  const reverbPct = useMemo(() => {
    if (!scanResult?.rt60) return null;
    return Math.round(Math.max(0, Math.min(100, ((scanResult.rt60 - 0.2) / 1.3) * 100)));
  }, [scanResult]);

  // TV-lytting & diskant-anbefaling
  const tvAssessment = useMemo(() => {
    if (!running || bands.every((b) => b <= -90)) return null;
    const speech = (bands[5] + bands[6]) / 2; // 1-2 kHz
    const treble = (bands[7] + bands[8]) / 2; // 4-8 kHz
    const warmth = (bands[3] + bands[4]) / 2; // 250-500 Hz
    const bass = (bands[1] + bands[2]) / 2;   // 63-125 Hz

    const speechClarity = speech - warmth; // > 0 = klart
    const trebleBalance = treble - speech; // ~ -3..+3 ideal
    const bassBalance = bass - warmth;

    // Vurdering
    const tvOk = speechClarity > -4 && trebleBalance > -6 && trebleBalance < 4;
    const filmOk = bassBalance > -8 && trebleBalance > -8 && trebleBalance < 6;

    let trebleAdvice = "Diskant ser balansert ut.";
    if (trebleBalance < -4) trebleAdvice = "Skru opp diskant +2 til +4 dB — tale mister konsonanter.";
    else if (trebleBalance > 3) trebleAdvice = "Skru ned diskant 2–3 dB — for skarpt, sliter på ørene.";

    let bassAdvice = "Bass virker ok.";
    if (bassBalance < -6) bassAdvice = "Skru opp bass litt — filmscener mister tyngde.";
    else if (bassBalance > 6) bassAdvice = "Demp bass — kan maskere dialogen.";

    return { tvOk, filmOk, trebleAdvice, bassAdvice, speechClarity, trebleBalance, bassBalance };
  }, [bands, running]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Mæsterens øre"
        title="Decibelmåler & lydanalyse"
        subtitle="dB SPL, frekvensspektrum, klang/etterklang og diagnose for tale og konsert."
        image={heroImg}
      />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Hoved dB-måler */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="text-center">
            <div className="text-6xl font-mono font-bold tabular-nums">
              {running ? db.toFixed(1) : "—"}
              <span className="text-2xl text-muted-foreground ml-2">dB</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground flex justify-center gap-6 flex-wrap">
              <span>Snitt: {running ? avg.toFixed(1) : "—"}</span>
              <span>Topp: {running ? peak.toFixed(1) : "—"}</span>
              {dominantHz !== null && (
                <span className="text-primary">Hovedfrekvens: {dominantHz} Hz</span>
              )}
              {clipping && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangle size={12} /> Clipping
                </span>
              )}
            </div>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full transition-all ${dbColor}`} style={{ width: `${level}%` }} />
          </div>
          <div className="flex justify-center gap-3 pt-2 flex-wrap">
            {!running ? (
              <button onClick={start} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Mic size={16} /> Start måling
              </button>
            ) : (
              <button onClick={stop} className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90">
                <MicOff size={16} /> Stopp
              </button>
            )}
            <button
              onClick={() => { setPeak(0); setMinDb(null); samplesRef.current = []; setHistory([]); }}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Nullstill
            </button>
          </div>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>

        {/* Stat-bokser: SPL min / snitt / maks / topp-freq */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="SPL Min" value={minDb !== null ? `${minDb.toFixed(1)}` : "—"} unit="dB" tone="green" />
          <StatBox label="SPL Snitt" value={running ? avg.toFixed(1) : "—"} unit="dB" tone="blue" />
          <StatBox label="SPL Maks" value={running ? peak.toFixed(1) : "—"} unit="dB" tone="red" />
          <StatBox label="Topp-frekvens" value={dominantHz !== null ? `${dominantHz}` : "—"} unit="Hz" tone="purple" />
        </div>

        {/* Analog VU + sanntids dB SPL-graf */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Activity size={12} /> Analog VU-meter
            </div>
            <div className="aspect-[2/1.1]">
              <VuMeter db={db} running={running} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Klassisk integrasjon (~300 ms). Rødt felt: over 0 VU (≈ 110 dB SPL).
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <Activity size={12} /> Nivå over tid (dB SPL)
            </div>
            <div className="h-44">
              <DbHistoryChart samples={history} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Grønn sone &lt; 60 dB · gul 60–85 · rød &gt; 85 (hørselbelastende ved lang eksponering).
            </p>
          </div>
        </div>

        {/* Klang / Vibrato / Chorus */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox
            label="Klang / ekko"
            value={reverbPct !== null ? `${reverbPct}` : "—"}
            unit="%"
            tone={reverbPct === null ? "blue" : reverbPct < 30 ? "green" : reverbPct < 65 ? "amber" : "red"}
            hint="kjør romskann"
          />
          <StatBox
            label="RT60"
            value={scanResult?.rt60 ? scanResult.rt60.toFixed(2) : "—"}
            unit="s"
            tone="blue"
            hint="tale-ideal < 0,6"
          />
          <StatBox
            label="Vibrato"
            value={pitchStats ? `±${pitchStats.vibratoCents}` : "—"}
            unit={pitchStats ? `cent · ${pitchStats.vibratoHz} Hz` : ""}
            tone="purple"
            hint="syng/spill en tone"
          />
          <StatBox
            label="Chorus"
            value={pitchStats ? (pitchStats.chorus ? "Ja" : "Nei") : "—"}
            unit=""
            tone={pitchStats?.chorus ? "amber" : "green"}
            hint="flere samtidige pitcher"
          />
        </div>

        {/* TV / film-lytting */}
        {tvAssessment && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Tv size={16} className="text-primary" /> Lytte-vurdering for TV & film
            </h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className={`rounded-md p-3 ${tvAssessment.tvOk ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
                <div className="flex items-center gap-2 font-medium">
                  <Tv size={14} /> Vanlig TV-titting
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {tvAssessment.tvOk ? "OK — dialog skal være tydelig." : "Tale-området henger etter. Vurder dialog-modus eller hev senter-kanal."}
                </div>
              </div>
              <div className={`rounded-md p-3 ${tvAssessment.filmOk ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
                <div className="flex items-center gap-2 font-medium">
                  <Film size={14} /> Film / serie
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {tvAssessment.filmOk ? "OK — dynamikk og bunn ser balansert ut." : "Ubalansert — film-dynamikk vil føles tynn eller maskert."}
                </div>
              </div>
            </div>
            <div className="border-t border-border pt-3 space-y-1 text-xs">
              <p className="flex items-start gap-2">
                <Music2 size={12} className="text-primary mt-0.5 shrink-0" />
                <span><strong className="text-foreground">Diskant:</strong> {tvAssessment.trebleAdvice}</span>
              </p>
              <p className="flex items-start gap-2">
                <Music2 size={12} className="text-primary mt-0.5 shrink-0" />
                <span><strong className="text-foreground">Bass:</strong> {tvAssessment.bassAdvice}</span>
              </p>
              <p className="text-muted-foreground pt-1">
                Tale-klarhet: {tvAssessment.speechClarity.toFixed(1)} dB · Diskant-balanse: {tvAssessment.trebleBalance.toFixed(1)} dB · Bass-balanse: {tvAssessment.bassBalance.toFixed(1)} dB
              </p>
            </div>
          </div>
        )}

        {/* Frekvensspektrum */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Waves size={16} className="text-primary" /> Frekvensbånd (oktav)
          </h2>
          <div className="flex items-end gap-1 h-40">
            {OCTAVE_BANDS.map((b, i) => {
              const dbVal = bands[i] ?? -100;
              // Map -90..-10 dB → 0..100%
              const h = Math.max(2, Math.min(100, ((dbVal + 90) / 80) * 100));
              const color = dbVal > -25 ? "bg-destructive" : dbVal > -45 ? "bg-amber-500" : "bg-emerald-500";
              return (
                <div key={b.center} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="flex-1 w-full flex items-end">
                    <div className={`w-full rounded-t transition-all ${color}`} style={{ height: `${h}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">{b.label}</div>
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover border border-border text-[10px] px-2 py-1 rounded shadow whitespace-nowrap z-10">
                    {b.center} Hz · {b.role} · {dbVal.toFixed(0)} dB
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Hold pekeren over et bånd for forklaring. Verdier er relative (dBFS) — bruk dem til balanse, ikke absolutt nivå.
          </p>
          {balanceHints.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1 border-t border-border pt-2">
              {balanceHints.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          )}
        </div>

        {/* Romakustikk-scan */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Radio size={16} className="text-primary" /> Romakustikk-scan (klang / eko)
          </h2>
          <p className="text-xs text-muted-foreground">
            Estimerer etterklangstid (RT60) og oppdager distinkte refleksjoner og flutter-eko.
            Klikk «Skann», vent på nedtellingen og <strong>klapp én gang skarpt</strong> nær mikrofonen.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              disabled={!running || scanState === "arming" || scanState === "listening"}
              onClick={runScan}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Zap size={16} />
              {scanState === "arming" ? "Klar… (klapp om 1 sek)" :
               scanState === "listening" ? "Lytter…" :
               scanState === "done" ? "Skann på nytt" : "Skann rom"}
            </button>
            {!running && <span className="text-xs text-muted-foreground self-center">Start måling først.</span>}
          </div>
          {scanResult && (
            <div className="space-y-2 border-t border-border pt-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-border p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Etterklang (RT60)</div>
                  <div className="font-mono text-lg">
                    {scanResult.rt60 !== null ? `${scanResult.rt60.toFixed(2)} s` : "—"}
                  </div>
                </div>
                <div className="rounded border border-border p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Distinkt eko</div>
                  <div className="font-mono text-lg">
                    {scanResult.echoMs !== null ? `${scanResult.echoMs} ms` : "Ingen"}
                  </div>
                </div>
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                {scanResult.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Kalibrering */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <label className="text-sm font-medium block flex items-center gap-2">
            <Volume2 size={14} /> Kalibrering (dB offset):{" "}
            <span className="text-muted-foreground">{calibration > 0 ? "+" : ""}{calibration}</span>
          </label>
          <input
            type="range" min={-30} max={30} step={1}
            value={calibration}
            onChange={(e) => setCalibration(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-[11px] text-muted-foreground">
            Sammenlign med en referansemåler og juster slik at tallene matcher.
          </p>
        </div>

        {/* Referanse for tale/konsert */}
        <div className="rounded-lg border border-border bg-card p-4 text-sm space-y-3">
          <h2 className="font-semibold">Frekvensguide for tale & konsert</h2>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            {OCTAVE_BANDS.map((b) => (
              <div key={b.center} className="flex justify-between border-b border-border/50 py-1">
                <span className="font-mono text-primary">{b.label} Hz</span>
                <span className="text-muted-foreground">{b.role}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3 space-y-1 text-xs text-muted-foreground">
            <p><strong className="text-foreground">Tale-klarhet:</strong> 1–4 kHz må være tilstede, mens 200–400 Hz ikke må dominere.</p>
            <p><strong className="text-foreground">Feedback-frekvenser:</strong> oftest 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz — kutt smalt med EQ.</p>
            <p><strong className="text-foreground">Konsert-PA:</strong> sikt mot 95–100 dB SPL snitt foran scenen; over 100 dB krever hørselvern.</p>
            <p><strong className="text-foreground">RT60 ideal:</strong> tale &lt; 0,6 s · klassisk 1,5–2,2 s · rock/PA 0,8–1,2 s.</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Bakgrunnsmåling:</strong> nettlesere stopper mikrofontilgang når fanen
            ikke er synlig — siden bruker derfor skjerm-wake-lock så lenge målingen kjører. Ekte bakgrunnsmåling krever native app.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

const TONE_CLASS: Record<string, string> = {
  green: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
  blue: "bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300",
  red: "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300",
  amber: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
  purple: "bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-300",
};

function StatBox({
  label,
  value,
  unit,
  tone = "blue",
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "green" | "blue" | "red" | "amber" | "purple";
  hint?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${TONE_CLASS[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="font-mono font-bold text-2xl tabular-nums leading-tight mt-0.5">
        {value}
        {unit && <span className="text-xs font-normal opacity-70 ml-1">{unit}</span>}
      </div>
      {hint && <div className="text-[10px] opacity-60 mt-0.5">{hint}</div>}
    </div>
  );
}
