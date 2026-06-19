import { useEffect, useRef } from "react";

export type WeatherSoundKind = "nedbor" | "vaer" | "vind" | "lyn";

/**
 * Procedural ambient sounds for the rotating weather tile.
 * Uses Web Audio API – no external assets.
 *
 * - nedbor: filtered white-noise (rain)
 * - vaer:   soft low pad + airy hiss (fair weather ambience)
 * - vind:   noise with slow LFO sweep (wind gusts)
 * - lyn:    low rumble + occasional thunder crack
 */
export function useWeatherSound(kind: WeatherSoundKind | null, enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    // Tear down previous
    nodesRef.current?.stop();
    nodesRef.current = null;

    if (!enabled || !kind) return;

    let ctx = ctxRef.current;
    if (!ctx) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!AC) return;
      ctx = new AC();
      ctxRef.current = ctx;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // Fade in
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.6);

    // Shared noise buffer (2s white noise)
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = noiseBuffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    const stoppers: Array<() => void> = [];

    if (kind === "nedbor") {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 800;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 5000;
      src.connect(hp).connect(lp).connect(master);
      src.start();
      stoppers.push(() => { try { src.stop(); } catch {} });
    } else if (kind === "vaer") {
      // Soft airy hiss
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      src.connect(lp).connect(g).connect(master);
      src.start();
      // Soft pad
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 220;
      const og = ctx.createGain();
      og.gain.value = 0.04;
      osc.connect(og).connect(master);
      osc.start();
      stoppers.push(() => { try { src.stop(); } catch {} try { osc.stop(); } catch {} });
    } else if (kind === "vind") {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 500;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.6;
      src.connect(bp).connect(g).connect(master);
      // LFO sweeping the filter for gusts
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 400;
      lfo.connect(lfoGain).connect(bp.frequency);
      src.start();
      lfo.start();
      stoppers.push(() => { try { src.stop(); } catch {} try { lfo.stop(); } catch {} });
    } else if (kind === "lyn") {
      // Low rumble
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 120;
      const g = ctx.createGain();
      g.gain.value = 0.7;
      src.connect(lp).connect(g).connect(master);
      src.start();
      // Periodic thunder cracks
      let cancelled = false;
      const scheduleCrack = () => {
        if (cancelled || !ctx) return;
        const t = ctx.currentTime;
        const crack = ctx.createBufferSource();
        crack.buffer = noiseBuffer;
        const cf = ctx.createBiquadFilter();
        cf.type = "lowpass";
        cf.frequency.value = 800;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.0001, t);
        cg.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        crack.connect(cf).connect(cg).connect(master);
        crack.start(t);
        crack.stop(t + 2);
        const next = 3500 + Math.random() * 4500;
        setTimeout(scheduleCrack, next);
      };
      setTimeout(scheduleCrack, 1200);
      stoppers.push(() => {
        cancelled = true;
        try { src.stop(); } catch {}
      });
    }

    nodesRef.current = {
      stop: () => {
        const c = ctxRef.current;
        if (!c) return;
        try {
          master.gain.cancelScheduledValues(c.currentTime);
          master.gain.linearRampToValueAtTime(0, c.currentTime + 0.25);
        } catch {}
        setTimeout(() => {
          stoppers.forEach((s) => s());
          try { master.disconnect(); } catch {}
        }, 300);
      },
    };

    return () => {
      nodesRef.current?.stop();
      nodesRef.current = null;
    };
  }, [kind, enabled]);

  // Close context on unmount
  useEffect(() => {
    return () => {
      try { ctxRef.current?.close(); } catch {}
      ctxRef.current = null;
    };
  }, []);
}
