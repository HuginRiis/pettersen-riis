import { useEffect, useRef } from "react";

/**
 * Sanntids spektrumanalyse, log-frekvensakse 20 Hz – 20 kHz.
 * Skyggelagte felt viser:
 *   - mennesker hører: 20 Hz – 20 kHz (hele området)
 *   - tale-kjerne: 300 Hz – 3.4 kHz
 *   - musikk-fundament: 60 Hz – 4 kHz
 *   - konsonanter / klarhet: 2 – 8 kHz
 *
 * `freqDb` er Float32Array fra AnalyserNode.getFloatFrequencyData (dBFS).
 * `binHz` er samplerate / fftSize.
 */
export function SpectrumChart({
  freqDb,
  binHz,
}: {
  freqDb: Float32Array | null;
  binHz: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Bakgrunn lys
    ctx.fillStyle = "#fafaf7";
    ctx.fillRect(0, 0, W, H);

    const fMin = 20;
    const fMax = 20000;
    const logMin = Math.log10(fMin);
    const logMax = Math.log10(fMax);
    const xOf = (hz: number) => ((Math.log10(hz) - logMin) / (logMax - logMin)) * W;

    // Sone-fyll
    const zones: { lo: number; hi: number; color: string; label: string; y: number }[] = [
      { lo: 60, hi: 4000, color: "rgba(139, 92, 246, 0.07)", label: "Musikk-fundament", y: 12 },
      { lo: 300, hi: 3400, color: "rgba(16, 185, 129, 0.10)", label: "Tale-kjerne", y: 26 },
      { lo: 2000, hi: 8000, color: "rgba(245, 158, 11, 0.08)", label: "Klarhet · konsonanter", y: 40 },
    ];
    for (const z of zones) {
      const x1 = xOf(z.lo);
      const x2 = xOf(z.hi);
      ctx.fillStyle = z.color;
      ctx.fillRect(x1, 0, x2 - x1, H);
      ctx.fillStyle = "rgba(60, 50, 30, 0.55)";
      ctx.font = "9px ui-sans-serif, system-ui";
      ctx.fillText(z.label, x1 + 3, z.y);
    }

    // Vertikale gridlinjer + label på dekade
    ctx.strokeStyle = "#e5e0d4";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#8a7a55";
    ctx.font = "9px ui-monospace, monospace";
    const ticks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    for (const f of ticks) {
      const x = xOf(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H - 12);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, H - 2);
    }

    // Horisontale dB-linjer (0 til -90)
    for (let db = 0; db >= -90; db -= 20) {
      const y = ((-db) / 100) * (H - 14);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.strokeStyle = "#ecead0";
      ctx.stroke();
      ctx.fillStyle = "#8a7a55";
      ctx.fillText(`${db}`, 2, y + 8);
    }

    if (!freqDb || binHz <= 0) return;

    // Tegn spektrum-linje (en sample per piksel via log-bucket)
    ctx.beginPath();
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.4;
    const points: [number, number][] = [];
    for (let x = 0; x < W; x++) {
      const hzLo = Math.pow(10, logMin + (x / W) * (logMax - logMin));
      const hzHi = Math.pow(10, logMin + ((x + 1) / W) * (logMax - logMin));
      const i0 = Math.max(0, Math.floor(hzLo / binHz));
      const i1 = Math.min(freqDb.length - 1, Math.ceil(hzHi / binHz));
      if (i1 < i0) continue;
      let m = -Infinity;
      for (let i = i0; i <= i1; i++) {
        const v = freqDb[i];
        if (Number.isFinite(v) && v > m) m = v;
      }
      if (!Number.isFinite(m)) continue;
      const clamped = Math.max(-100, Math.min(0, m));
      const y = ((-clamped) / 100) * (H - 14);
      points.push([x, y]);
    }
    if (points.length > 1) {
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.stroke();

      // Fyll under
      ctx.lineTo(points[points.length - 1][0], H - 14);
      ctx.lineTo(points[0][0], H - 14);
      ctx.closePath();
      ctx.fillStyle = "rgba(124, 58, 237, 0.15)";
      ctx.fill();
    }
  }, [freqDb, binHz]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
