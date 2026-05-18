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
  const [bandsSlow, setBandsSlow] = useState<number[]>(() => OCTAVE_BANDS.map(() => -100));
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
  const [vuFallSpeed, setVuFallSpeed] = useState<number>(() => {
    if (typeof window === "undefined") return 0.05;
    return Number(localStorage.getItem("vu-fall-speed") ?? "0.05");
  });
  // Følsomhet for TV/film-vurdering: 0 = streng, 10 = veldig følsom (fanger svake signal)
  const [tvSensitivity, setTvSensitivity] = useState<number>(() => {
    if (typeof window === "undefined") return 6;
    return Number(localStorage.getItem("tv-sensitivity") ?? "6");
  });
  // Lyd-identifikator
  const [idActive, setIdActive] = useState(false);
  const [idSensitivity, setIdSensitivity] = useState<number>(() => {
    if (typeof window === "undefined") return 5;
    return Number(localStorage.getItem("id-sensitivity") ?? "5");
  });
  const [idResult, setIdResult] = useState<{ label: string; confidence: number; detail: string } | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const samplesRef = useRef<number[]>([]);
  const pitchHistRef = useRef<{ t: number; hz: number }[]>([]);
  const lastHistoryPushRef = useRef(0);
  const timeBufRef = useRef<Float32Array | null>(null);
  const [spectrum, setSpectrum] = useState<{ data: Float32Array; binHz: number } | null>(null);
  const bandHistRef = useRef<{ t: number; lin: number[] }[]>([]);
  const [bandWindowSec, setBandWindowSec] = useState<number>(() => {
    if (typeof window === "undefined") return 10;
    return Number(localStorage.getItem("band-window-sec") ?? "10");
  });

  useEffect(() => {
    localStorage.setItem("db-calibration", String(calibration));
  }, [calibration]);

  useEffect(() => {
    localStorage.setItem("vu-fall-speed", String(vuFallSpeed));
  }, [vuFallSpeed]);

  useEffect(() => {
    localStorage.setItem("band-window-sec", String(bandWindowSec));
  }, [bandWindowSec]);

  useEffect(() => {
    localStorage.setItem("tv-sensitivity", String(tvSensitivity));
  }, [tvSensitivity]);

  useEffect(() => {
    localStorage.setItem("id-sensitivity", String(idSensitivity));
  }, [idSensitivity]);

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
          // Bånd-energi (lineær) for prosent-vindu opp til 60 min
          const lin = bandVals.map((d) => Math.pow(10, Math.max(-90, d) / 10));
          bandHistRef.current.push({ t: nowT, lin });
          // Behold maks 60 min + litt slakk
          const cutoff = nowT - 61 * 60 * 1000;
          while (bandHistRef.current.length && bandHistRef.current[0].t < cutoff) {
            bandHistRef.current.shift();
          }
          // Oppdater spektrum-snapshot (kopi pga react ref-likhet)
          setSpectrum({ data: new Float32Array(freqBuf), binHz });

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

  // Oppdater "tregt" snapshot av bands hvert 1s slik at lytte-vurderingen er lesbar
  useEffect(() => {
    if (!running) {
      setBandsSlow(OCTAVE_BANDS.map(() => -100));
      return;
    }
    const id = setInterval(() => setBandsSlow(bands), 1000);
    return () => clearInterval(id);
  }, [running, bands]);

  // TV-lytting & diskant-anbefaling (basert på 1s-snapshot + følsomhet)
  const tvAssessment = useMemo(() => {
    // Sensitivity 0..10 → terskel for "har signal" går fra -60 (streng) til -95 (veldig følsom)
    const sigThreshold = -60 - (tvSensitivity / 10) * 35;
    // Tolerance-utvidelse: mer følsom = mer slingringsrom for å si "OK"
    const tol = 1 + tvSensitivity * 0.4; // 1.0 .. 5.0
    const hasSignal = running && bandsSlow.some((b) => b > sigThreshold);
    if (!hasSignal) {
      return {
        hasSignal: false as const,
        tvOk: false, filmOk: false,
        trebleAdvice: "Venter på lyd — start måling og spill av tale eller musikk.",
        bassAdvice: "Venter på lyd — vurdering kommer når mikrofonen fanger nok signal.",
        speechClarity: 0, trebleBalance: 0, bassBalance: 0,
        highlights: [] as string[],
      };
    }
    const speech = (bandsSlow[5] + bandsSlow[6]) / 2;
    const treble = (bandsSlow[7] + bandsSlow[8]) / 2;
    const warmth = (bandsSlow[3] + bandsSlow[4]) / 2;
    const bass = (bandsSlow[1] + bandsSlow[2]) / 2;

    const speechClarity = speech - warmth;
    const trebleBalance = treble - speech;
    const bassBalance = bass - warmth;

    const tvOk = speechClarity > -4 - tol && trebleBalance > -6 - tol && trebleBalance < 4 + tol;
    const filmOk = bassBalance > -8 - tol && trebleBalance > -8 - tol && trebleBalance < 6 + tol;

    let trebleAdvice = "Diskant ser balansert ut.";
    if (trebleBalance < -4 - tol * 0.5) trebleAdvice = "Skru opp diskant +2 til +4 dB — tale mister konsonanter.";
    else if (trebleBalance > 3 + tol * 0.5) trebleAdvice = "Skru ned diskant 2–3 dB — for skarpt, sliter på ørene.";

    let bassAdvice = "Bass virker ok.";
    if (bassBalance < -6 - tol * 0.5) bassAdvice = "Skru opp bass litt — filmscener mister tyngde.";
    else if (bassBalance > 6 + tol * 0.5) bassAdvice = "Demp bass — kan maskere dialogen.";

    const highlights: string[] = [];
    if (speechClarity > -2 - tol * 0.5) highlights.push("Tydelig tale-område");
    if (trebleBalance >= -3 - tol * 0.5 && trebleBalance <= 3 + tol * 0.5) highlights.push("Balansert diskant");
    if (bassBalance >= -5 - tol * 0.5 && bassBalance <= 5 + tol * 0.5) highlights.push("Stabil bass");
    if (tvOk) highlights.push("OK for vanlig TV");
    if (filmOk) highlights.push("OK for film");

    return { hasSignal: true as const, tvOk, filmOk, trebleAdvice, bassAdvice, speechClarity, trebleBalance, bassBalance, highlights };
  }, [bandsSlow, running, tvSensitivity]);

  // Lyd-identifikator: klassifiser type lyd basert på spektral-distribusjon
  // Bruker bandPercent + db + dominantHz + pitchStats. Følsomhet justerer min-db-terskel.
  const classifySound = (
    pct: number[],
    splDb: number,
    domHz: number | null,
    vibrato: { vibratoCents: number; vibratoHz: number; chorus: boolean } | null,
    sens: number,
  ): { label: string; confidence: number; detail: string } => {
    const minDbForId = 55 - sens * 3; // sens 0→55, sens 10→25
    if (splDb < minDbForId) {
      return { label: "Stillhet / for svakt", confidence: 100, detail: `Under ${minDbForId.toFixed(0)} dB. Øk følsomhet eller nivå.` };
    }
    const sub = pct[0] + pct[1];
    const lowMid = pct[2] + pct[3];
    const speech = pct[5] + pct[6];
    const presence = pct[6] + pct[7];
    const air = pct[8] + pct[9];
    const broadband = pct.filter((p) => p > 4).length;

    // Plystring / ren tone: smalt spektrum, høy dominant, lav vibrato
    if (domHz && domHz > 700 && domHz < 4000 && presence > 35 && lowMid < 15) {
      return { label: "Plystring / ren tone", confidence: 85, detail: `${domHz} Hz dominant. Smalt spektrum.` };
    }
    // Sang: vibrato + tale-/musikkområde
    if (vibrato && vibrato.vibratoCents > 8 && vibrato.vibratoHz > 3 && vibrato.vibratoHz < 8 && speech > 20) {
      return { label: "Sang", confidence: 80, detail: `Vibrato ±${vibrato.vibratoCents} cent @ ${vibrato.vibratoHz} Hz.` };
    }
    // Musikk: bredt spektrum + bass + diskant tilstede
    if (broadband >= 6 && sub + lowMid > 20 && air + presence > 25) {
      return { label: "Musikk", confidence: 75, detail: `Bredt spektrum, ${broadband} aktive bånd.` };
    }
    // Tale: dominans i 500–2k, lite sub
    if (speech > 35 && sub < 15 && air < 25) {
      return { label: "Tale / dialog", confidence: 80, detail: `Tale-kjerne ${speech.toFixed(0)}% av energien.` };
    }
    // Klapping/perkusjon: kort, høy diskant + bredt spektrum
    if (air + presence > 45 && lowMid < 20) {
      return { label: "Klapping / perkusjon", confidence: 65, detail: `Høyt energi-innhold i diskant.` };
    }
    // Bass-rumling / motor
    if (sub + lowMid > 55 && air < 15) {
      return { label: "Bass-rumling / motor / vind", confidence: 70, detail: `${(sub + lowMid).toFixed(0)}% i sub/lav-mid.` };
    }
    // Hvit/rosa støy
    if (broadband >= 7 && Math.max(...pct) < 20) {
      return { label: "Bredbåndsstøy (vifte/regn)", confidence: 65, detail: `Jevn fordeling over hele spekteret.` };
    }
    // Sibilance / hvesing
    if (air > 30 && sub < 10) {
      return { label: "Hvesing / sus", confidence: 55, detail: `Dominans i 8–16 kHz.` };
    }
    return { label: "Blandet / ubestemt", confidence: 30, detail: `Dominant ${domHz ?? "?"} Hz · ${splDb.toFixed(0)} dB.` };
  };


  // Prosent-fordeling av lyd-energi pr oktav (sum = 100) — snittet over valgt vindu
  const bandPercent = useMemo(() => {
    if (!running) return OCTAVE_BANDS.map(() => 0);
    const now = performance.now();
    const cutoff = now - bandWindowSec * 1000;
    const samples = bandHistRef.current.filter((s) => s.t >= cutoff);
    let summed: number[];
    if (samples.length === 0) {
      summed = bands.map((d) => Math.pow(10, Math.max(-90, d) / 10));
    } else {
      summed = OCTAVE_BANDS.map((_, i) =>
        samples.reduce((acc, s) => acc + (s.lin[i] ?? 0), 0) / samples.length,
      );
    }
    const sum = summed.reduce((a, b) => a + b, 0);
    if (sum <= 0) return OCTAVE_BANDS.map(() => 0);
    return summed.map((v) => (v / sum) * 100);
    // history endrer seg hver ~100 ms og driver re-evaluering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, bands, running, bandWindowSec]);

  const dominantBandIdx = useMemo(() => {
    let mi = 0;
    let m = -1;
    bandPercent.forEach((p, i) => { if (p > m) { m = p; mi = i; } });
    return mi;
  }, [bandPercent]);

  // Maks-prosent for relativ skalering av oktav-stolpene (så høyeste fyller stolpen)
  const maxBandPct = useMemo(() => Math.max(1, ...bandPercent), [bandPercent]);

  // Lyd-identifikator: kjør klassifisering hvert sekund mens aktiv
  useEffect(() => {
    if (!idActive || !running) {
      if (!idActive) setIdResult(null);
      return;
    }
    const id = setInterval(() => {
      setIdResult(classifySound(bandPercent, db, dominantHz, pitchStats, idSensitivity));
    }, 1000);
    return () => clearInterval(id);
  }, [idActive, running, bandPercent, db, dominantHz, pitchStats, idSensitivity]);


  return (
    <PageShell>
      <PageHero
        eyebrow="Mæsterens øre"
        title="Decibelmåler & lydanalyse"
        subtitle="dB SPL, frekvensspektrum, klang/etterklang og diagnose for tale og konsert."
        image={heroImg}
      />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

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
              <Activity size={12} /> Analog dB-meter
            </div>
            <div className="aspect-[2/1.1]">
              <VuMeter db={db} running={running} fallSpeed={vuFallSpeed} />
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Nedgangs-hastighet</span>
                <span className="tabular-nums">{vuFallSpeed.toFixed(3)} {vuFallSpeed < 0.04 ? "(treg)" : vuFallSpeed > 0.12 ? "(rask)" : "(middels)"}</span>
              </div>
              <input
                type="range"
                min={0.005}
                max={0.25}
                step={0.005}
                value={vuFallSpeed}
                onChange={(e) => setVuFallSpeed(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-[11px] text-muted-foreground">
                Skala 30–110 dB. Grønn sone ≈ prat (60 dB), gul ≈ trafikk (80 dB), rød ≈ kraftig (&gt;85 dB).
              </p>
            </div>
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

        {/* Spektralanalyse - hele frekvensspekteret */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Waves size={16} className="text-primary" /> Spektralanalyse (20 Hz – 20 kHz)
          </h2>
          <div className="h-56 lg:h-72">
            <SpectrumChart freqDb={spectrum?.data ?? null} binHz={spectrum?.binHz ?? 0} />
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-violet-400/30 border border-violet-500/50" /> Musikk-fundament 60 Hz–4 kHz</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-400/30 border border-emerald-500/50" /> Tale-kjerne 300 Hz–3,4 kHz</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-400/30 border border-amber-500/50" /> Klarhet 2–8 kHz</span>
            <span className="text-muted-foreground">Mennesker hører 20 Hz–20 kHz (hele aksen)</span>
          </div>
        </div>

        {/* Frekvensbånd (oktav) - bar + prosent */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Waves size={16} className="text-primary" /> Frekvensbånd (oktav) — andel av total lyd-energi
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground mr-1">Vindu:</span>
              {[
                { s: 10, label: "10 s" },
                { s: 30, label: "30 s" },
                { s: 60, label: "1 min" },
                { s: 5 * 60, label: "5 min" },
                { s: 15 * 60, label: "15 min" },
                { s: 30 * 60, label: "30 min" },
                { s: 60 * 60, label: "60 min" },
              ].map((opt) => (
                <button
                  key={opt.s}
                  onClick={() => setBandWindowSec(opt.s)}
                  className={`text-[11px] px-2 py-0.5 rounded border ${
                    bandWindowSec === opt.s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
            <div>
              <div className="flex items-end gap-1 h-48 border-b border-border/50">
                {OCTAVE_BANDS.map((b, i) => {
                  const pct = bandPercent[i] ?? 0;
                  // Relativ skalering: høyeste bånd fyller stolpen (med litt headroom)
                  const h = Math.max(2, Math.min(100, (pct / maxBandPct) * 95));
                  const isDom = i === dominantBandIdx && pct > 1;
                  const color = pct > 25 ? "bg-rose-500" : pct > 12 ? "bg-amber-500" : pct > 4 ? "bg-sky-500" : "bg-emerald-500";
                  return (
                    <div key={b.center} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="text-[10px] font-mono font-bold tabular-nums" style={{ opacity: pct < 0.5 ? 0.4 : 1 }}>
                        {pct.toFixed(0)}%
                      </div>
                      <div className="flex-1 w-full flex items-end">
                        <div
                          className={`w-full rounded-t transition-all ${color} ${isDom ? "ring-2 ring-primary ring-offset-1" : ""}`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">{b.label}</div>
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover border border-border text-[10px] px-2 py-1 rounded shadow whitespace-nowrap z-10">
                        {b.center} Hz · {b.role} · {(bands[i] ?? -100).toFixed(0)} dB · {pct.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Prosent viser hvor stor andel av total lyd-energi som ligger i hvert oktavbånd. Markert bånd = mest dominante frekvensområde nå.
              </p>
            </div>

            <div className="rounded-md border border-border overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1.5">Hz</th>
                    <th className="text-left px-2 py-1.5">Område</th>
                    <th className="text-right px-2 py-1.5">%</th>
                  </tr>
                </thead>
                <tbody>
                  {OCTAVE_BANDS.map((b, i) => {
                    const pct = bandPercent[i] ?? 0;
                    return (
                      <tr key={b.center} className={`border-t border-border ${i === dominantBandIdx && pct > 1 ? "bg-primary/5" : ""}`}>
                        <td className="px-2 py-1 font-mono text-primary">{b.label}</td>
                        <td className="px-2 py-1 text-muted-foreground">{b.role}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums">{pct.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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

        {/* Lytte-vurdering — alltid synlig i bunn, oppdateres hvert sekund */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Tv size={16} className="text-primary" /> Lytte-vurdering for TV & film
            </h2>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded border border-border">
              {tvAssessment.hasSignal ? "Oppdateres hvert 1 s" : "Venter på lyd"}
            </span>
          </div>

          {/* Følsomhets-slider */}
          <div className="rounded-md border border-border bg-muted/20 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Følsomhet</span>
              <span className="tabular-nums font-mono">
                {tvSensitivity.toFixed(0)} / 10 {tvSensitivity < 3 ? "(streng)" : tvSensitivity > 7 ? "(svært følsom)" : "(middels)"}
              </span>
            </div>
            <input
              type="range" min={0} max={10} step={1}
              value={tvSensitivity}
              onChange={(e) => setTvSensitivity(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-[10px] text-muted-foreground">
              Høyere = fanger svakere lyd og er mildere med "OK"-merkene. Lavere = krever tydeligere signal.
            </p>
          </div>


          {(() => {
            const allChips = ["Tydelig tale-område", "Balansert diskant", "Stabil bass", "OK for vanlig TV", "OK for film"];
            const active = new Set(tvAssessment.hasSignal ? tvAssessment.highlights : []);
            return (
              <div className="flex flex-wrap gap-1.5">
                {allChips.map((h) => {
                  const on = active.has(h);
                  return (
                    <span
                      key={h}
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        on
                          ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                          : "bg-muted/40 text-muted-foreground border-border"
                      }`}
                    >
                      {on ? "✓" : "○"} {h}
                    </span>
                  );
                })}
              </div>
            );
          })()}

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className={`rounded-md p-3 ${!tvAssessment.hasSignal ? "bg-muted/40 border border-border" : tvAssessment.tvOk ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
              <div className="flex items-center gap-2 font-medium">
                <Tv size={14} /> Vanlig TV-titting
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {!tvAssessment.hasSignal ? "Mangler signal — start lyd for vurdering." : tvAssessment.tvOk ? "OK — dialog skal være tydelig." : "Tale-området henger etter. Vurder dialog-modus eller hev senter-kanal."}
              </div>
            </div>
            <div className={`rounded-md p-3 ${!tvAssessment.hasSignal ? "bg-muted/40 border border-border" : tvAssessment.filmOk ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
              <div className="flex items-center gap-2 font-medium">
                <Film size={14} /> Film / serie
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {!tvAssessment.hasSignal ? "Mangler signal — start lyd for vurdering." : tvAssessment.filmOk ? "OK — dynamikk og bunn ser balansert ut." : "Ubalansert — film-dynamikk vil føles tynn eller maskert."}
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
            {tvAssessment.hasSignal && (
              <p className="text-muted-foreground pt-1">
                Tale-klarhet: {tvAssessment.speechClarity.toFixed(1)} dB · Diskant-balanse: {tvAssessment.trebleBalance.toFixed(1)} dB · Bass-balanse: {tvAssessment.bassBalance.toFixed(1)} dB
              </p>
            )}
          </div>
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
