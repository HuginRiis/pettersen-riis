import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSceneMarquee } from "@/hooks/use-scene-marquee";

type Props = {
  text: string;
  className?: string;
};

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Viser tekst med fast fontstørrelse. Hvis teksten ikke får plass i boksen,
 * rullerer den horisontalt — enten i loop eller frem-og-tilbake.
 */
export function MarqueeText({ text, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [containerW, setContainerW] = useState(0);
  const [textW, setTextW] = useState(0);
  const { fontPx, speedPxPerSec, mode } = useSceneMarquee();

  useIso(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const run = () => {
      setContainerW(wrap.clientWidth);
      setTextW(measure.scrollWidth);
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(wrap);
    ro.observe(measure);
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(run).catch(() => {});
    }
    return () => ro.disconnect();
  }, [text, fontPx]);

  const overflow = textW > containerW + 1;
  const distance = Math.max(0, textW - containerW);
  const speed = Math.max(10, speedPxPerSec);
  const gap = Math.max(16, Math.round(fontPx * 1.5));
  const loopDuration = overflow ? (textW + gap) / speed : 0;
  const pingDuration = overflow ? (distance / speed) * 2 + 1.2 : 0;

  return (
    <div
      ref={wrapRef}
      className={`relative min-w-0 flex-1 overflow-hidden ${className ?? ""}`}
      style={{ fontSize: `${fontPx}px`, lineHeight: 1.15 }}
    >
      {/* Skjult måle-element for nøyaktig tekstbredde */}
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute left-0 top-0 whitespace-nowrap pointer-events-none"
      >
        {text}
      </span>

      {overflow && mode === "loop" ? (
        <div
          className="flex whitespace-nowrap will-change-transform"
          style={{
            animation: `scene-marquee-loop ${loopDuration}s linear infinite`,
            gap: `${gap}px`,
            ["--marquee-loop" as any]: `${textW + gap}px`,
          }}
        >
          <span className="shrink-0">{text}</span>
          <span className="shrink-0" aria-hidden>{text}</span>
        </div>
      ) : overflow && mode === "pingpong" ? (
        <span
          className="block whitespace-nowrap will-change-transform"
          style={{
            animation: `scene-marquee-ping ${pingDuration}s ease-in-out infinite`,
            ["--marquee-dist" as any]: `-${distance}px`,
          }}
        >
          {text}
        </span>
      ) : (
        <span className="block whitespace-nowrap">{text}</span>
      )}
    </div>
  );
}
