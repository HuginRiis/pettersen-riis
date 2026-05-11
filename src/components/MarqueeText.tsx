import { useEffect, useRef, useState } from "react";
import { useSceneMarquee } from "@/hooks/use-scene-marquee";

type Props = {
  text: string;
  className?: string;
};

/**
 * Viser tekst med fast fontstørrelse. Hvis teksten ikke får plass i boksen,
 * rullerer den horisontalt — enten i loop eller frem-og-tilbake.
 */
export function MarqueeText({ text, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [distance, setDistance] = useState(0);
  const { fontPx, speedPxPerSec, mode } = useSceneMarquee();

  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const measure = () => {
      const w = wrap.clientWidth;
      const tw = inner.scrollWidth;
      const over = tw > w + 1;
      setOverflow(over);
      setDistance(over ? tw - w : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(inner);
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(measure).catch(() => {});
    }
    return () => ro.disconnect();
  }, [text, fontPx]);

  const speed = Math.max(10, speedPxPerSec);
  // For loop bruker vi totale tekst-bredde + en pause-kopi
  const loopDuration = overflow ? (innerRef.current?.scrollWidth ?? 0) / speed : 0;
  const pingDuration = overflow ? (distance / speed) * 2 : 0;

  return (
    <div
      ref={wrapRef}
      className={`min-w-0 flex-1 overflow-hidden ${className ?? ""}`}
      style={{ fontSize: `${fontPx}px`, lineHeight: 1.15 }}
    >
      {overflow && mode === "loop" ? (
        <div
          className="flex whitespace-nowrap"
          style={{
            animation: `scene-marquee-loop ${loopDuration}s linear infinite`,
          }}
        >
          <span ref={innerRef} className="pr-8">{text}</span>
          <span className="pr-8" aria-hidden>{text}</span>
        </div>
      ) : overflow && mode === "pingpong" ? (
        <span
          ref={innerRef}
          className="block whitespace-nowrap"
          style={{
            animation: `scene-marquee-ping ${pingDuration}s ease-in-out infinite`,
            // CSS variable for distance
            ["--marquee-dist" as any]: `-${distance}px`,
          }}
        >
          {text}
        </span>
      ) : (
        <span ref={innerRef} className="block whitespace-nowrap">
          {text}
        </span>
      )}
    </div>
  );
}
