import { useEffect, useRef } from "react";

/**
 * Sanntids dB SPL-graf, siste ~60 sek. Lyse farger.
 * samples: nyligste sist. Lengde = piksler scrollet.
 */
export function DbHistoryChart({ samples }: { samples: number[] }) {
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

    // Grid 30..110
    ctx.strokeStyle = "#e5e0d4";
    ctx.lineWidth = 1;
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "#8a7a55";
    for (let db = 30; db <= 110; db += 10) {
      const y = H - ((db - 30) / 80) * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillText(`${db}`, 2, y - 2);
    }

    // Sone-fyll (lyse): grønn <60, gul 60-85, rød >85
    const zones: [number, number, string][] = [
      [30, 60, "rgba(46, 204, 113, 0.10)"],
      [60, 85, "rgba(241, 196, 15, 0.12)"],
      [85, 110, "rgba(231, 76, 60, 0.12)"],
    ];
    for (const [lo, hi, fill] of zones) {
      const y1 = H - ((hi - 30) / 80) * H;
      const y2 = H - ((lo - 30) / 80) * H;
      ctx.fillStyle = fill;
      ctx.fillRect(0, y1, W, y2 - y1);
    }

    if (samples.length < 2) return;

    const n = samples.length;
    const stepX = W / Math.max(60, n);
    const x0 = W - n * stepX;

    // Linje
    ctx.beginPath();
    ctx.strokeStyle = "#2980b9";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < n; i++) {
      const v = Math.max(30, Math.min(110, samples[i]));
      const x = x0 + i * stepX;
      const y = H - ((v - 30) / 80) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fyll under linjen
    ctx.lineTo(x0 + (n - 1) * stepX, H);
    ctx.lineTo(x0, H);
    ctx.closePath();
    ctx.fillStyle = "rgba(41, 128, 185, 0.15)";
    ctx.fill();
  }, [samples]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
