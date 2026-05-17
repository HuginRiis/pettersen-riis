import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Mic, MicOff, Activity } from "lucide-react";

export const Route = createFileRoute("/decibel")({
  component: DecibelPage,
  head: () => ({
    meta: [
      { title: "Decibelmåler" },
      { name: "description", content: "Mål lydnivå (dB) med mikrofonen." },
    ],
  }),
});

function DecibelPage() {
  const [running, setRunning] = useState(false);
  const [db, setDb] = useState<number>(0);
  const [peak, setPeak] = useState<number>(0);
  const [avg, setAvg] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("db-calibration") ?? "0");
  });

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wakeLockRef = useRef<any>(null);
  const samplesRef = useRef<number[]>([]);

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
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      try {
        wakeLockRef.current = await (navigator as any).wakeLock?.request("screen");
      } catch {}

      const buf = new Float32Array(analyser.fftSize);
      samplesRef.current = [];
      let localPeak = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // dBFS → approximate dB SPL with calibration offset (default ~94)
        const dbfs = 20 * Math.log10(rms || 1e-8);
        const spl = Math.max(0, Math.min(140, dbfs + 94 + calibration));
        setDb(spl);
        if (spl > localPeak) {
          localPeak = spl;
          setPeak(spl);
        }
        samplesRef.current.push(spl);
        if (samplesRef.current.length > 600) samplesRef.current.shift();
        const a =
          samplesRef.current.reduce((x, y) => x + y, 0) /
          samplesRef.current.length;
        setAvg(a);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setRunning(true);
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke starte mikrofon");
    }
  };

  useEffect(() => () => stop(), []);

  // Re-acquire wake lock when tab becomes visible again
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
  const color =
    db < 60 ? "bg-emerald-500" : db < 85 ? "bg-amber-500" : "bg-destructive";

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="text-primary" /> Decibelmåler
          </h1>
          <p className="text-sm text-muted-foreground">
            Måler lydnivå via mikrofonen. Tallene er omtrentlige dB SPL — bruk
            kalibreringen for å justere mot en kjent referanse.
          </p>
        </header>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="text-center">
            <div className="text-6xl font-mono font-bold tabular-nums">
              {running ? db.toFixed(1) : "—"}
              <span className="text-2xl text-muted-foreground ml-2">dB</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground flex justify-center gap-6">
              <span>Snitt: {running ? avg.toFixed(1) : "—"}</span>
              <span>Topp: {running ? peak.toFixed(1) : "—"}</span>
            </div>
          </div>

          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${color}`}
              style={{ width: `${level}%` }}
            />
          </div>

          <div className="flex justify-center gap-3 pt-2">
            {!running ? (
              <button
                onClick={start}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Mic size={16} /> Start måling
              </button>
            ) : (
              <button
                onClick={stop}
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                <MicOff size={16} /> Stopp
              </button>
            )}
            <button
              onClick={() => {
                setPeak(0);
                samplesRef.current = [];
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Nullstill topp/snitt
            </button>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <label className="text-sm font-medium block">
            Kalibrering (offset i dB):{" "}
            <span className="text-muted-foreground">{calibration > 0 ? "+" : ""}{calibration}</span>
          </label>
          <input
            type="range"
            min={-30}
            max={30}
            step={1}
            value={calibration}
            onChange={(e) => setCalibration(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Sammenlign med en pålitelig dB-måler eller app, og juster slik at
            tallene matcher.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-sm space-y-2">
          <h2 className="font-semibold">Kan den kjøre i bakgrunnen?</h2>
          <p className="text-muted-foreground">
            Dessverre — nettlesere stopper mikrofontilgang når fanen er i
            bakgrunnen eller skjermen er låst. Det finnes ingen måte for en
            nettside å fortsette å måle dB med skjermen av, uansett hvilken
            enhet du bruker.
          </p>
          <p className="text-muted-foreground">
            Workaround: Siden ber automatisk om <em>skjerm‑wake‑lock</em> når
            målingen kjører, så skjermen holdes våken så lenge fanen er åpen og
            synlig. For ekte bakgrunnsmåling trenger du en innebygd
            mobilapplikasjon (iOS/Android) eller en dedikert dB‑logger.
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            <li>&lt; 40 dB: hvisking / stille rom</li>
            <li>60 dB: normal samtale</li>
            <li>85 dB: hørselsskade ved langvarig eksponering</li>
            <li>&gt; 100 dB: konsert / motorsag</li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
