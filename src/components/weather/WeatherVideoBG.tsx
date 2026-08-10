import { useEffect, useMemo, useRef, useState } from "react";
import type { GlassKind } from "./WeatherFX";

const CDN = "https://cdn.coverr.co/videos";
const clip = (id: string) => `${CDN}/${id}/1080p.mp4`;

/**
 * Kuraterte naturfilmer (Coverr, fri bruk) som matcher værtypen.
 * Alle er sjekket manuelt at motivet stemmer med været.
 */
export const WEATHER_CLIPS: Record<string, { title: string; src: string }[]> = {
  clear: [
    { title: "Sol over havet", src: clip("coverr-sun-shining-over-the-ocean-2178") },
    { title: "Fjellvann i solskinn", src: clip("coverr-lago-di-braies-4640") },
  ],
  fair: [
    { title: "Fjellvann i solskinn", src: clip("coverr-lago-di-braies-4640") },
    { title: "Lette skyer på blå himmel", src: clip("coverr-cloudy-sky-2765") },
  ],
  partly: [
    { title: "Lette skyer på blå himmel", src: clip("coverr-cloudy-sky-2765") },
    { title: "Elv mellom fjell", src: clip("coverr-river-surrounded-by-mountains-425") },
  ],
  cloudy: [
    { title: "Skyer over grønne fjell", src: clip("coverr-cloudy-day-in-fanal-madeira-island-3143") },
  ],
  rain: [
    { title: "Regn i skogen", src: clip("coverr-rain-falling-in-the-forest-9275") },
    { title: "Regndråper på grantrær", src: clip("coverr-raindrops-on-tree-branches-7585") },
  ],
  sleet: [
    { title: "Sludd ved elva", src: clip("coverr-snow-falling-by-a-river-5197") },
    { title: "Regn i skogen", src: clip("coverr-rain-falling-in-the-forest-9275") },
  ],
  snow: [
    { title: "Snøfall i skogen", src: clip("coverr-snow-falling-in-a-forest-2150") },
    { title: "Snø ved elva", src: clip("coverr-snow-falling-by-a-river-5197") },
  ],
  fog: [
    { title: "Tåke over skogen", src: clip("coverr-above-a-misty-forest-518") },
    { title: "Disige fjell", src: clip("coverr-misty-mountains-819") },
  ],
  thunder: [
    { title: "Uvær trekker inn", src: clip("coverr-storm-in-vilnius-lithuania-5273") },
  ],
  night: [
    { title: "Stjernehimmel over skogen", src: clip("user-ai-generation-69Bz5voDn7EW") },
    { title: "Solnedgang", src: clip("coverr-timelapse-of-a-sunset-6588") },
  ],
  "night-clear": [
    { title: "Stjernehimmel over skogen", src: clip("user-ai-generation-69Bz5voDn7EW") },
  ],
};

const FALLBACK = [{ title: "Elv mellom fjell", src: clip("coverr-river-surrounded-by-mountains-425") }];

export function clipsForKind(kind: GlassKind | string) {
  return WEATHER_CLIPS[kind] ?? FALLBACK;
}

export function WeatherVideoBG({
  kind,
  enabled = true,
  dim = 0.35,
  onTitle,
}: {
  kind: GlassKind | string;
  enabled?: boolean;
  dim?: number;
  onTitle?: (title: string | null) => void;
}) {
  const clips = useMemo(() => clipsForKind(kind), [kind]);
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setIdx(0);
    setReady(false);
    setFailed(false);
  }, [kind]);

  const current = clips[Math.min(idx, clips.length - 1)];

  useEffect(() => {
    onTitle?.(enabled && ready && !failed ? current?.title ?? null : null);
  }, [enabled, ready, failed, current, onTitle]);

  useEffect(() => {
    if (!enabled) return;
    const v = ref.current;
    if (!v) return;
    v.play().catch(() => {});
  }, [enabled, current?.src]);

  if (!enabled || failed || !current) return null;

  return (
    <div className="fixed inset-0 -z-0 pointer-events-none" aria-hidden="true">
      <video
        ref={ref}
        key={current.src}
        src={current.src}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        crossOrigin="anonymous"
        onCanPlay={() => setReady(true)}
        onError={() => {
          if (idx + 1 < clips.length) setIdx(idx + 1);
          else setFailed(true);
        }}
        className="h-full w-full object-cover transition-opacity duration-1000"
        style={{ opacity: ready ? 1 : 0, willChange: "opacity" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, rgba(0,0,0,${dim * 0.9}) 0%, rgba(0,0,0,${dim * 0.5}) 45%, rgba(0,0,0,${dim}) 100%)`,
        }}
      />
    </div>
  );
}
